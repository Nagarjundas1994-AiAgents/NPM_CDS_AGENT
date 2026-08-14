import { CAPToolkit } from '../../src/cap-toolkit';
import type { CDSModel } from '../../src/types';

const cdsModel: CDSModel = {
  definitions: {
    StudentService: { kind: 'service', name: 'StudentService' },
    'StudentService.Students': {
      kind: 'entity',
      elements: {
        ID: { type: 'cds.UUID', key: true },
        firstName: { type: 'cds.String', '@mandatory': true },
      },
    },
    'StudentService.enrollStudent': {
      kind: 'action',
      params: { studentId: { type: 'cds.UUID' } },
    },
  },
};

describe('CAPToolkit', () => {
  it('returns a capability map without generating LangChain tools', async () => {
    const toolkit = new CAPToolkit({
      service: 'StudentService',
      baseUrl: 'http://localhost:4004',
      cdsModel,
      toolStrategy: 'minimal',
      allowDelete: false,
    });

    const map = await toolkit.getCapabilityMap();
    expect(map.strategy).toBe('minimal');
    expect(map.entities.map((e) => e.name)).toEqual(['Students']);
    expect(map.entities[0].operations).toEqual(['read']);
  });

  it('getTools in minimal mode returns describe and query', async () => {
    const toolkit = new CAPToolkit({
      service: 'StudentService',
      baseUrl: 'http://localhost:4004',
      cdsModel,
      toolStrategy: 'minimal',
    });

    await expect(toolkit.getToolNames()).resolves.toEqual(['describe', 'query']);
    await expect(toolkit.getToolCount()).resolves.toBe(2);
  });

  // The policy map is keyed by entity name and enforced by the executor using the
  // same names the tools call with. If those ever drift, every call 403s.
  it('wires the capability policy into the executor it hands the tools', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ value: [] }),
    });
    (global as any).fetch = mockFetch;

    const toolkit = new CAPToolkit({
      service: 'StudentService',
      baseUrl: 'http://localhost:4004',
      cdsModel,
      toolStrategy: 'crud',
      allowDelete: false,
    });

    await expect(toolkit.getToolNames()).resolves.toEqual([
      'read_Students',
      'create_Students',
      'update_Students',
    ]);

    const executor = await toolkit.getExecutor();

    // Permitted operations still reach the network...
    await executor.read('Students');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // ...and the withheld one is refused, tool or no tool.
    const result = await executor.delete('Students', '123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 403, entity: 'Students', operation: 'delete' });
  });
});
