import { ODataExecutor } from '../../src/odata-executor';

// We mock global fetch for testing
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('ODataExecutor', () => {
  let executor: ODataExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new ODataExecutor({
      baseUrl: 'http://localhost:4004',
      servicePath: 'StudentService',
      auth: { type: 'none' },
    });
  });

  // ─── URL Construction ─────────────────────────────────────────────────────

  describe('URL construction', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: [] }),
      });
    });

    it('builds correct read URL without query params', async () => {
      await executor.read('Students');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/StudentService/Students',
        expect.any(Object)
      );
    });

    it('builds correct read URL with query params', async () => {
      await executor.read('Students', { '$filter': "gpa lt 2.0", '$top': 10 });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('Students?');
      expect(url).toContain('%24filter=gpa+lt+2.0');
      expect(url).toContain('%24top=10');
    });

    it('builds correct create URL', async () => {
      await executor.create('Students', { name: 'John' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/StudentService/Students',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('builds correct update URL with UUID key', async () => {
      await executor.update('Students', '550e8400-e29b-41d4-a716-446655440000', { gpa: 3.5 });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/StudentService/Students(550e8400-e29b-41d4-a716-446655440000)',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('builds correct update URL with composite key', async () => {
      await executor.update('Enrollments', "studentId=abc,courseId=xyz", { grade: 'A' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/StudentService/Enrollments(studentId=abc,courseId=xyz)',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('builds correct delete URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });
      await executor.delete('Students', '550e8400-e29b-41d4-a716-446655440000');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/StudentService/Students(550e8400-e29b-41d4-a716-446655440000)',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('builds correct unbound action URL', async () => {
      await executor.callUnboundAction('enrollStudent', { studentId: 'abc' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/StudentService/enrollStudent',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('builds correct unbound function URL with params', async () => {
      await executor.callUnboundFunction('getStats', { category: 'CS' });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe(
        "http://localhost:4004/odata/v4/StudentService/getStats(category='CS')"
      );
    });

    it('builds correct bound action URL', async () => {
      await executor.callBoundAction('Books', '123', 'setDiscount', 'CatalogService', { pct: 10 });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:4004/odata/v4/StudentService/Books(123)/CatalogService.setDiscount",
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ─── Authentication ─────────────────────────────────────────────────────

  describe('authentication', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: [] }),
      });
    });

    it('sends Basic auth header', async () => {
      const authExecutor = new ODataExecutor({
        baseUrl: 'http://localhost:4004',
        servicePath: 'StudentService',
        auth: { type: 'basic', user: 'alice', pass: 'admin' },
      });

      await authExecutor.read('Students');
      const headers = mockFetch.mock.calls[0][1].headers;
      const expected = Buffer.from('alice:admin').toString('base64');
      expect(headers.Authorization).toBe(`Basic ${expected}`);
    });

    it('sends Bearer auth header', async () => {
      const authExecutor = new ODataExecutor({
        baseUrl: 'http://localhost:4004',
        servicePath: 'StudentService',
        auth: { type: 'bearer', token: 'my-jwt-token' },
      });

      await authExecutor.read('Students');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-jwt-token');
    });

    it('sends no auth header when type is none', async () => {
      await executor.read('Students');
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  // ─── Dry Run Mode ────────────────────────────────────────────────────────

  describe('dryRun mode', () => {
    it('logs instead of fetching and returns mock response', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const dryExecutor = new ODataExecutor({
        baseUrl: 'http://localhost:4004',
        servicePath: 'StudentService',
        dryRun: true,
      });

      const result = await dryExecutor.read('Students', { '$filter': 'gpa lt 2.0' });
      
      // Should NOT have called fetch
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Should have logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '[cds-agents DRY RUN]',
        expect.stringContaining('GET')
      );

      // Should return a mock response
      expect(result).toHaveProperty('_dryRun', true);
      
      consoleSpy.mockRestore();
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('parses OData error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({
          error: { code: '404', message: 'Entity not found' },
        }),
      });

      const result = await executor.read('Students');
      expect(result).toMatchObject({
        type: 'ODataError',
        status: 404,
        service: 'StudentService',
        entity: 'Students',
        operation: 'read',
        message: 'Entity not found',
      });
    });

    it('handles 204 No Content (DELETE success)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const result = await executor.delete('Students', 'some-id');
      expect(result).toEqual({ success: true, status: 204 });
    });

    it('handles non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await executor.read('Students');
      expect(result).toMatchObject({
        type: 'ODataError',
        status: 500,
        service: 'StudentService',
        entity: 'Students',
        operation: 'read',
        message: 'Internal Server Error',
      });
    });
  });

  // ─── Policy Enforcement ───────────────────────────────────────────────────

  describe('policy enforcement', () => {
    const governed = () =>
      new ODataExecutor({
        baseUrl: 'http://localhost:4004',
        servicePath: 'StudentService',
        policy: {
          Students: { read: true, create: true, update: true, delete: false },
        },
      });

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: [] }),
      });
    });

    it('refuses a denied operation without touching the network', async () => {
      const result = await governed().delete('Students', '123');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        type: 'ODataError',
        status: 403,
        entity: 'Students',
        operation: 'delete',
      });
    });

    it('refuses entities absent from the policy', async () => {
      const result = await governed().read('Grades');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 403, entity: 'Grades' });
    });

    it('allows permitted operations through', async () => {
      await governed().update('Students', '123', { gpa: 3.5 });
      expect(mockFetch).toHaveBeenCalled();
    });

    it('enforces policy in dryRun mode too', async () => {
      const dry = new ODataExecutor({
        baseUrl: 'http://localhost:4004',
        servicePath: 'StudentService',
        dryRun: true,
        policy: { Students: { read: true, create: false, update: false, delete: false } },
      });

      expect(await dry.create('Students', { gpa: 4 })).toMatchObject({ status: 403 });
    });

    it('leaves the executor ungoverned when no policy is given', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });
      await executor.delete('Students', '123');
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // ─── Service URL Path ─────────────────────────────────────────────────────

  describe('urlPath', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: [] }),
      });
    });

    it('serves requests from the CAP-mounted path, not the service name', async () => {
      const capExecutor = new ODataExecutor({
        baseUrl: 'http://localhost:4004',
        servicePath: 'StudentService',
        urlPath: 'odata/v4/student',
      });

      await capExecutor.read('Students');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4004/odata/v4/student/Students',
        expect.any(Object)
      );
    });

    it('supports a fully custom mount path (@path or a proxy)', async () => {
      const proxied = new ODataExecutor({
        baseUrl: 'https://gateway.example.com',
        servicePath: 'StudentService',
        urlPath: '/api/students/',
      });

      await proxied.read('Students');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://gateway.example.com/api/students/Students',
        expect.any(Object)
      );
    });
  });

  // ─── Literal Escaping ─────────────────────────────────────────────────────

  describe('literal escaping', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: [] }),
      });
    });

    it("escapes single quotes in string keys", async () => {
      await executor.update("Students", "O'Brien", { gpa: 3.5 });
      expect(mockFetch.mock.calls[0][0]).toBe(
        "http://localhost:4004/odata/v4/StudentService/Students('O''Brien')"
      );
    });

    it('escapes single quotes in function parameters', async () => {
      await executor.callUnboundFunction('getStats', { category: "CS' or true" });
      expect(mockFetch.mock.calls[0][0]).toBe(
        "http://localhost:4004/odata/v4/StudentService/getStats(category='CS'' or true')"
      );
    });
  });
});
