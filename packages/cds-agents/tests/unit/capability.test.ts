import {
  buildCapabilityMap,
  resolveEntityNames,
  resolveEntityPolicy,
  toOperationPolicy,
} from '../../src/capability';
import type { CDSActionDef, CDSEntity } from '../../src/types';

const students: CDSEntity = {
  kind: 'entity',
  elements: {
    ID: { type: 'cds.UUID', key: true },
    firstName: { type: 'cds.String', '@mandatory': true },
    gpa: { type: 'cds.Decimal' },
  },
};

const courses: CDSEntity = {
  kind: 'entity',
  elements: {
    ID: { type: 'cds.UUID', key: true },
    name: { type: 'cds.String', '@mandatory': true },
  },
  actions: {
    archive: { kind: 'action', params: { reason: { type: 'cds.String' } } },
  },
};

const unbound: Record<string, CDSActionDef> = {
  enrollStudent: { kind: 'action', params: { studentId: { type: 'cds.UUID' } } },
  getStatistics: { kind: 'function' },
};

const entities = { Students: students, Courses: courses };

describe('resolveEntityNames', () => {
  it('returns all entities by default', () => {
    expect(resolveEntityNames(entities)).toEqual(['Students', 'Courses']);
  });

  it('filters by tools list and exclude', () => {
    expect(resolveEntityNames(entities, ['Students', 'Courses'], ['Courses'])).toEqual([
      'Students',
    ]);
  });
});

describe('buildCapabilityMap', () => {
  it('lists full CRUD + actions by default', () => {
    const map = buildCapabilityMap({
      serviceName: 'StudentService',
      entities,
      unboundActions: unbound,
      entityNames: ['Students', 'Courses'],
    });

    expect(map.strategy).toBe('full');
    expect(map.entities[0].operations).toEqual(['read', 'create', 'update', 'delete']);
    expect(map.entities[1].actions).toEqual([
      { name: 'archive', kind: 'action', params: ['reason'] },
    ]);
    expect(map.unbound).toHaveLength(2);
  });

  it('minimal strategy only exposes read', () => {
    const map = buildCapabilityMap({
      serviceName: 'StudentService',
      entities,
      unboundActions: unbound,
      entityNames: ['Students'],
      toolStrategy: 'minimal',
    });

    expect(map.entities[0].operations).toEqual(['read']);
    expect(map.entities[0].actions).toEqual([]);
  });

  it('honours allowDelete: false', () => {
    const map = buildCapabilityMap({
      serviceName: 'StudentService',
      entities,
      unboundActions: unbound,
      entityNames: ['Students'],
      allowDelete: false,
    });

    expect(map.entities[0].operations).toEqual(['read', 'create', 'update']);
  });

  it('actions strategy omits CRUD operations', () => {
    const map = buildCapabilityMap({
      serviceName: 'StudentService',
      entities,
      unboundActions: unbound,
      entityNames: ['Courses'],
      toolStrategy: 'actions',
    });

    expect(map.entities[0].operations).toEqual([]);
    expect(map.entities[0].actions).toHaveLength(1);
    expect(map.unbound).toHaveLength(2);
  });

  it('honours @readonly on the entity over an permissive config', () => {
    const map = buildCapabilityMap({
      serviceName: 'StudentService',
      entities: { Report: { ...students, '@readonly': true } },
      unboundActions: {},
      entityNames: ['Report'],
      allowCreate: true,
      allowUpdate: true,
      allowDelete: true,
    });

    expect(map.entities[0].operations).toEqual(['read']);
  });
});

describe('resolveEntityPolicy', () => {
  it('allows everything by default', () => {
    expect(resolveEntityPolicy(students)).toEqual({
      read: true,
      create: true,
      update: true,
      delete: true,
    });
  });

  it('@readonly blocks every write', () => {
    expect(resolveEntityPolicy({ ...students, '@readonly': true })).toEqual({
      read: true,
      create: false,
      update: false,
      delete: false,
    });
  });

  it('@insertonly allows create only', () => {
    expect(resolveEntityPolicy({ ...students, '@insertonly': true })).toEqual({
      read: false,
      create: true,
      update: false,
      delete: false,
    });
  });

  it('honours @Capabilities restriction annotations', () => {
    const entity = {
      ...students,
      '@Capabilities.DeleteRestrictions.Deletable': false,
    } as CDSEntity;

    expect(resolveEntityPolicy(entity)).toMatchObject({ update: true, delete: false });
  });

  it('config can remove permissions but never add them', () => {
    const readonly = { ...students, '@readonly': true } as CDSEntity;

    expect(resolveEntityPolicy(readonly, { allowUpdate: true })).toMatchObject({
      update: false,
    });
    expect(resolveEntityPolicy(students, { allowUpdate: false })).toMatchObject({
      update: false,
    });
  });
});

describe('toOperationPolicy', () => {
  it('mirrors the capability map exactly', () => {
    const map = buildCapabilityMap({
      serviceName: 'StudentService',
      entities,
      unboundActions: unbound,
      entityNames: ['Students'],
      allowDelete: false,
    });

    expect(toOperationPolicy(map)).toEqual({
      Students: { read: true, create: true, update: true, delete: false },
    });
  });
});
