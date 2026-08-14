import { generateEntityTools, generateUnboundActionTools, generateBoundActionTools, generateAllTools } from '../../src/tool-generator';
import { ODataExecutor } from '../../src/odata-executor';
import type { CDSEntity, CDSActionDef } from '../../src/types';

// Mock fetch globally
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ value: [] }),
});
(global as any).fetch = mockFetch;

const executor = new ODataExecutor({
  baseUrl: 'http://localhost:4004',
  servicePath: 'StudentService',
  auth: { type: 'none' },
});

// ─── Mock Entities & Actions ────────────────────────────────────────────────

const studentsEntity: CDSEntity = {
  kind: 'entity',
  elements: {
    ID: { type: 'cds.UUID', key: true },
    firstName: { type: 'cds.String', '@mandatory': true },
    lastName: { type: 'cds.String', '@mandatory': true },
    email: { type: 'cds.String', '@mandatory': true },
    gpa: { type: 'cds.Decimal' },
    status: { type: 'cds.String' },
  },
};

const coursesEntity: CDSEntity = {
  kind: 'entity',
  elements: {
    ID: { type: 'cds.UUID', key: true },
    name: { type: 'cds.String', '@mandatory': true },
    code: { type: 'cds.String', '@mandatory': true },
    credits: { type: 'cds.Integer' },
  },
  actions: {
    archive: {
      kind: 'action',
      params: {
        reason: { type: 'cds.String' },
      },
    },
  },
};

const unboundActions: Record<string, CDSActionDef> = {
  enrollStudent: {
    kind: 'action',
    params: {
      studentId: { type: 'cds.UUID' },
      courseId: { type: 'cds.UUID' },
      semester: { type: 'cds.String' },
    },
  },
  getStatistics: {
    kind: 'function',
    returns: { type: 'cds.String' },
  },
};

// ─── generateEntityTools ────────────────────────────────────────────────────

describe('generateEntityTools', () => {
  it('generates exactly 4 CRUD tools per entity', () => {
    const tools = generateEntityTools('Students', studentsEntity, executor);
    expect(tools).toHaveLength(4);
  });

  it('generates tools with correct names', () => {
    const tools = generateEntityTools('Students', studentsEntity, executor);
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      'read_Students',
      'create_Students',
      'update_Students',
      'delete_Students',
    ]);
  });

  it('each tool has a description', () => {
    const tools = generateEntityTools('Students', studentsEntity, executor);
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it('tools are callable (read)', async () => {
    const tools = generateEntityTools('Students', studentsEntity, executor);
    const readTool = tools.find((t) => t.name === 'read_Students')!;
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ value: [{ ID: '1', firstName: 'John' }] }),
    });

    const result = await readTool.invoke({ $filter: "gpa lt 2.0", $top: 5 });
    expect(result).toContain('John');
  });
});

// ─── generateUnboundActionTools ─────────────────────────────────────────────

describe('generateUnboundActionTools', () => {
  it('generates 1 tool per unbound action/function', () => {
    const tools = generateUnboundActionTools(unboundActions, executor, 'StudentService');
    expect(tools).toHaveLength(2);
  });

  it('names actions with action_ prefix', () => {
    const tools = generateUnboundActionTools(unboundActions, executor, 'StudentService');
    const names = tools.map((t) => t.name);
    expect(names).toContain('action_enrollStudent');
    expect(names).toContain('function_getStatistics');
  });
});

// ─── generateBoundActionTools ───────────────────────────────────────────────

describe('generateBoundActionTools', () => {
  it('generates tools for bound actions', () => {
    const tools = generateBoundActionTools('Courses', coursesEntity, executor, 'StudentService');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('action_Courses_archive');
  });

  it('returns empty array for entities with no bound actions', () => {
    const tools = generateBoundActionTools('Students', studentsEntity, executor, 'StudentService');
    expect(tools).toHaveLength(0);
  });
});

// ─── generateAllTools ───────────────────────────────────────────────────────

describe('generateAllTools', () => {
  const entities: Record<string, CDSEntity> = {
    Students: studentsEntity,
    Courses: coursesEntity,
  };

  it('generates tools for all entities + actions', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService');
    // Students: 4 CRUD + Courses: 4 CRUD + 1 bound action + 2 unbound = 11
    expect(tools).toHaveLength(11);
  });

  it('filters by tools config', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      tools: ['Students'],
    });
    // Students: 4 CRUD + 2 unbound actions = 6
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_Students');
    expect(names).not.toContain('read_Courses');
    expect(names).toContain('action_enrollStudent');
  });

  it('respects exclude config', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      exclude: ['Courses'],
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_Students');
    expect(names).not.toContain('read_Courses');
    expect(names).not.toContain('action_Courses_archive');
  });

  it('tools: auto includes all entities', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      tools: 'auto',
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_Students');
    expect(names).toContain('read_Courses');
  });

  it('toolStrategy: minimal exposes describe + query only', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      toolStrategy: 'minimal',
    });
    expect(tools.map((t) => t.name)).toEqual(['describe', 'query']);
  });

  it('toolStrategy: crud omits actions', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      toolStrategy: 'crud',
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_Students');
    expect(names).not.toContain('action_enrollStudent');
    expect(names).not.toContain('action_Courses_archive');
  });

  it('toolStrategy: actions omits CRUD', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      toolStrategy: 'actions',
    });
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('read_Students');
    expect(names).toContain('action_enrollStudent');
    expect(names).toContain('action_Courses_archive');
  });

  it('allowDelete: false removes delete tools', () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      allowDelete: false,
    });
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('delete_Students');
    expect(names).toContain('update_Students');
  });

  it('@readonly entities get read tools only', () => {
    const tools = generateAllTools(
      { Reports: { ...studentsEntity, '@readonly': true } },
      {},
      executor,
      'StudentService'
    );

    expect(tools.map((t) => t.name)).toEqual(['read_Reports']);
  });

  it('minimal query refuses entities the policy hides', async () => {
    const tools = generateAllTools(
      { Reports: { ...studentsEntity, '@insertonly': true } },
      {},
      executor,
      'StudentService',
      { toolStrategy: 'minimal' }
    );
    const query = tools.find((t) => t.name === 'query')!;

    const result = await query.invoke({ entity: 'Reports' });
    expect(result).toContain('non-readable');
  });

  it('query tool converts a structured filter to OData', async () => {
    const tools = generateAllTools(entities, unboundActions, executor, 'StudentService', {
      toolStrategy: 'minimal',
    });
    const query = tools.find((t) => t.name === 'query')!;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ value: [{ firstName: 'Alice' }] }),
    });

    const result = await query.invoke({
      entity: 'Students',
      filter: { gpa: { lt: 2 } },
      top: 5,
    });

    expect(result).toContain('Alice');
    const url = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
    expect(url).toContain('Students?');
    expect(url).toContain('%24filter=gpa+lt+2');
    expect(url).toContain('%24top=5');
  });
});
