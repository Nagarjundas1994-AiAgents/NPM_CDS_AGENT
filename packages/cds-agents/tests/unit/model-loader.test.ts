import {
  loadCDSModel,
  getEntityKeys,
  describeEntityFields,
  cdsServicePath,
} from '../../src/model-loader';
import type { CDSModel, CDSEntity } from '../../src/types';

// Expected values captured from `cds compile <file> --to serviceinfo` (@sap/cds 8.9.9).
// If CAP ever changes its mounting rules, this table is what catches it.
describe('cdsServicePath', () => {
  it.each([
    ['StudentService', 'odata/v4/student'],
    ['AdminService', 'odata/v4/admin'],
    ['CatalogService', 'odata/v4/catalog'],
    ['Browse', 'odata/v4/browse'],
    ['MyBigAdminService', 'odata/v4/my-big-admin'],
    ['SalesOrderService', 'odata/v4/sales-order'],
    // Acronym runs are not split: HRAdmin stays one word.
    ['HRService', 'odata/v4/hr'],
    ['HRAdminService', 'odata/v4/hradmin'],
    ['V2Service', 'odata/v4/v2'],
    ['API_BUSINESS_PARTNERService', 'odata/v4/api-business-partner'],
    // The namespace is not part of the path.
    ['university.core.StudentService', 'odata/v4/student'],
  ])('maps %s to %s', (name, expected) => {
    expect(cdsServicePath(name)).toBe(expected);
  });

  it('lets @path replace the whole route, protocol prefix included', () => {
    expect(cdsServicePath('AnnotatedService', { '@path': '/custom-route' })).toBe(
      'custom-route'
    );
  });

  it('does not strip the suffix when nothing would be left', () => {
    expect(cdsServicePath('Service')).toBe('odata/v4/service');
  });
});

describe('cds.load invocation', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@sap/cds');
  });

  const withMockedCds = async (cdsFile?: string) => {
    const load = jest.fn().mockResolvedValue(mockModel);
    jest.doMock('@sap/cds', () => ({ load }), { virtual: true });
    const { loadCDSModel: fresh } = await import('../../src/model-loader');
    await fresh({ serviceName: 'StudentService', cdsFile });
    return load;
  };

  // cds.load('./') throws MODEL_NOT_FOUND — '*' is CAP's whole-project model.
  it("defaults to '*', never './'", async () => {
    const load = await withMockedCds();
    expect(load).toHaveBeenCalledWith('*');
  });

  it('passes an explicit cdsFile through unchanged', async () => {
    const load = await withMockedCds('./srv');
    expect(load).toHaveBeenCalledWith('./srv');
  });
});

// ─── Mock CDS Model (CSN) ──────────────────────────────────────────────────

const mockModel: CDSModel = {
  definitions: {
    'StudentService': {
      kind: 'service',
      name: 'StudentService',
    },
    'StudentService.Students': {
      kind: 'entity',
      elements: {
        ID: { type: 'cds.UUID', key: true },
        firstName: { type: 'cds.String', '@mandatory': true },
        lastName: { type: 'cds.String', '@mandatory': true },
        email: { type: 'cds.String', '@mandatory': true },
        gpa: { type: 'cds.Decimal' },
        status: { type: 'cds.String' },
        courses: { type: 'cds.Association', target: 'StudentService.Enrollments' },
      },
    },
    'StudentService.Courses': {
      kind: 'entity',
      elements: {
        ID: { type: 'cds.UUID', key: true },
        name: { type: 'cds.String', '@mandatory': true },
        code: { type: 'cds.String', '@mandatory': true },
        credits: { type: 'cds.Integer' },
      },
    },
    'StudentService.enrollStudent': {
      kind: 'action',
      params: {
        studentId: { type: 'cds.UUID' },
        courseId: { type: 'cds.UUID' },
        semester: { type: 'cds.String' },
      },
    },
    'StudentService.getStatistics': {
      kind: 'function',
      returns: { type: 'cds.String' },
    },
    // A different service — should not be picked up
    'AdminService': {
      kind: 'service',
      name: 'AdminService',
    },
    'AdminService.Users': {
      kind: 'entity',
      elements: {
        ID: { type: 'cds.UUID', key: true },
        username: { type: 'cds.String' },
      },
    },
  },
};

// ─── loadCDSModel ───────────────────────────────────────────────────────────

describe('loadCDSModel', () => {
  it('loads the correct service by name', async () => {
    const result = await loadCDSModel({
      cdsModel: mockModel,
      serviceName: 'StudentService',
    });

    expect(result.serviceName).toBe('StudentService');
    expect(result.model).toBe(mockModel);
  });

  it('extracts all entities from the service', async () => {
    const result = await loadCDSModel({
      cdsModel: mockModel,
      serviceName: 'StudentService',
    });

    expect(Object.keys(result.entities)).toEqual(
      expect.arrayContaining(['Students', 'Courses'])
    );
    expect(Object.keys(result.entities)).toHaveLength(2);
  });

  it('extracts unbound actions and functions', async () => {
    const result = await loadCDSModel({
      cdsModel: mockModel,
      serviceName: 'StudentService',
    });

    expect(result.unboundActions).toHaveProperty('enrollStudent');
    expect(result.unboundActions.enrollStudent.kind).toBe('action');
    expect(result.unboundActions).toHaveProperty('getStatistics');
    expect(result.unboundActions.getStatistics.kind).toBe('function');
  });

  it('does not include entities from other services', async () => {
    const result = await loadCDSModel({
      cdsModel: mockModel,
      serviceName: 'StudentService',
    });

    expect(result.entities).not.toHaveProperty('Users');
  });

  it('throws an error when service is not found', async () => {
    await expect(
      loadCDSModel({
        cdsModel: mockModel,
        serviceName: 'NonExistentService',
      })
    ).rejects.toThrow("Service 'NonExistentService' not found");
  });

  it('supports suffix match for namespaced services', async () => {
    const namespacedModel: CDSModel = {
      definitions: {
        'my.namespace.StudentService': {
          kind: 'service',
          name: 'my.namespace.StudentService',
        },
        'my.namespace.StudentService.Students': {
          kind: 'entity',
          elements: {
            ID: { type: 'cds.UUID', key: true },
          },
        },
      },
    };

    const result = await loadCDSModel({
      cdsModel: namespacedModel,
      serviceName: 'StudentService',
    });

    expect(result.serviceName).toBe('my.namespace.StudentService');
    expect(result.entities).toHaveProperty('Students');
  });
});

// ─── getEntityKeys ──────────────────────────────────────────────────────────

describe('getEntityKeys', () => {
  it('returns key field names', () => {
    const entity: CDSEntity = {
      kind: 'entity',
      elements: {
        ID: { type: 'cds.UUID', key: true },
        name: { type: 'cds.String' },
        code: { type: 'cds.String', key: true },
      },
    };

    const keys = getEntityKeys(entity);
    expect(keys).toEqual(expect.arrayContaining(['ID', 'code']));
    expect(keys).toHaveLength(2);
  });

  it('returns empty array for entities with no keys', () => {
    const entity: CDSEntity = {
      kind: 'entity',
      elements: {
        name: { type: 'cds.String' },
      },
    };

    expect(getEntityKeys(entity)).toEqual([]);
  });
});

// ─── describeEntityFields ───────────────────────────────────────────────────

describe('describeEntityFields', () => {
  it('lists fields with their types', () => {
    const entity: CDSEntity = {
      kind: 'entity',
      elements: {
        ID: { type: 'cds.UUID', key: true },
        name: { type: 'cds.String', '@mandatory': true },
        gpa: { type: 'cds.Decimal' },
      },
    };

    const desc = describeEntityFields(entity);
    expect(desc).toContain('ID: UUID [key]');
    expect(desc).toContain('name: String [required]');
    expect(desc).toContain('gpa: Decimal');
  });

  it('marks associations', () => {
    const entity: CDSEntity = {
      kind: 'entity',
      elements: {
        dept: { type: 'cds.Association', target: 'Departments' },
      },
    };

    const desc = describeEntityFields(entity);
    expect(desc).toContain('dept (association)');
  });

  it('skips virtual and internal fields', () => {
    const entity: CDSEntity = {
      kind: 'entity',
      elements: {
        _internal: { type: 'cds.String' },
        computed: { type: 'cds.String', virtual: true },
        visible: { type: 'cds.String' },
      },
    };

    const desc = describeEntityFields(entity);
    expect(desc).not.toContain('_internal');
    expect(desc).not.toContain('computed');
    expect(desc).toContain('visible');
  });
});
