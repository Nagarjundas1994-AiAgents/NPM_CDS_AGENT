import { z } from 'zod';
import { cdsTypeToZod, buildEntitySchema, buildActionSchema, buildBoundActionSchema } from '../../src/schema-mapper';
import type { CDSElement, CDSEntity, CDSActionDef } from '../../src/types';

// ─── cdsTypeToZod ───────────────────────────────────────────────────────────

describe('cdsTypeToZod', () => {
  const cases: Array<{ type: string; valid: unknown; invalid?: unknown; label: string }> = [
    { type: 'cds.String', valid: 'hello', invalid: 123, label: 'String' },
    { type: 'cds.UUID', valid: '550e8400-e29b-41d4-a716-446655440000', invalid: 'not-a-uuid', label: 'UUID' },
    { type: 'cds.Integer', valid: 42, invalid: 3.14, label: 'Integer' },
    { type: 'cds.Int16', valid: 100, invalid: 'abc', label: 'Int16' },
    { type: 'cds.Int32', valid: 100000, invalid: 'abc', label: 'Int32' },
    { type: 'cds.Int64', valid: 100000, invalid: 'abc', label: 'Int64' },
    { type: 'cds.Decimal', valid: 3.14, invalid: 'abc', label: 'Decimal' },
    { type: 'cds.Double', valid: 3.14, invalid: 'abc', label: 'Double' },
    { type: 'cds.Boolean', valid: true, invalid: 'yes', label: 'Boolean' },
    { type: 'cds.Date', valid: '2024-01-15', label: 'Date' },
    { type: 'cds.Time', valid: '14:30:00', label: 'Time' },
    { type: 'cds.DateTime', valid: '2024-01-15T14:30:00Z', label: 'DateTime' },
    { type: 'cds.Timestamp', valid: '2024-01-15T14:30:00Z', label: 'Timestamp' },
    { type: 'cds.LargeString', valid: 'large text content', label: 'LargeString' },
  ];

  for (const { type, valid, invalid, label } of cases) {
    it(`maps ${label} (${type}) and validates correctly`, () => {
      const element: CDSElement = { type };
      const schema = cdsTypeToZod(element, 'testField');

      // Valid value should parse
      const result = schema.safeParse(valid);
      expect(result.success).toBe(true);

      // Invalid value should fail (where applicable)
      if (invalid !== undefined) {
        const failResult = schema.safeParse(invalid);
        expect(failResult.success).toBe(false);
      }
    });

    it(`adds .describe() annotation for ${label}`, () => {
      const element: CDSElement = { type };
      const schema = cdsTypeToZod(element, 'myField');
      expect(schema.description).toContain('myField');
    });
  }

  it('maps Association to string (foreign key)', () => {
    const element: CDSElement = { type: 'cds.Association', target: 'other.Entity' };
    const schema = cdsTypeToZod(element, 'ref');
    expect(schema.safeParse('some-key').success).toBe(true);
  });

  it('maps Composition to string (foreign key)', () => {
    const element: CDSElement = { type: 'cds.Composition', target: 'other.Entity' };
    const schema = cdsTypeToZod(element, 'ref');
    expect(schema.safeParse('some-key').success).toBe(true);
  });

  it('maps unknown types to z.any() without crashing', () => {
    const element: CDSElement = { type: 'cds.CustomType' };
    const schema = cdsTypeToZod(element, 'unknown');
    expect(schema.safeParse('anything').success).toBe(true);
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.description).toContain('cds.CustomType');
  });
});

// ─── buildEntitySchema ─────────────────────────────────────────────────────

describe('buildEntitySchema', () => {
  const mockEntity: CDSEntity = {
    kind: 'entity',
    elements: {
      ID: { type: 'cds.UUID', key: true },
      name: { type: 'cds.String', '@mandatory': true },
      email: { type: 'cds.String', '@mandatory': true },
      gpa: { type: 'cds.Decimal' },
      status: { type: 'cds.String' },
      _internal: { type: 'cds.String' },
      computed: { type: 'cds.String', virtual: true },
      department: { type: 'cds.Association', target: 'Departments' },
    },
  };

  describe('create context', () => {
    it('makes @mandatory fields required', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'create');
      // name and email are @mandatory → required
      const result = schema.safeParse({ name: 'John', email: 'j@x.com' });
      expect(result.success).toBe(true);
    });

    it('fails when @mandatory fields are missing', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'create');
      const result = schema.safeParse({ gpa: 3.5 });
      expect(result.success).toBe(false);
    });

    it('makes key fields optional (auto-generated)', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'create');
      // ID is key → optional
      const result = schema.safeParse({ name: 'John', email: 'j@x.com' });
      expect(result.success).toBe(true);
    });

    it('skips virtual fields', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'create');
      const shape = schema.shape;
      expect(shape).not.toHaveProperty('computed');
    });

    it('skips internal fields (prefixed with _)', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'create');
      const shape = schema.shape;
      expect(shape).not.toHaveProperty('_internal');
    });

    it('skips association fields in write schemas', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'create');
      const shape = schema.shape;
      expect(shape).not.toHaveProperty('department');
    });
  });

  describe('update context', () => {
    it('makes all fields optional (PATCH semantics)', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'update');
      const result = schema.safeParse({ key: 'some-id', gpa: 3.5 });
      expect(result.success).toBe(true);
    });

    it('requires a key field', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'update');
      const result = schema.safeParse({ gpa: 3.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('read context', () => {
    it('returns OData query schema', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'read');
      const shape = schema.shape;
      expect(shape).toHaveProperty('$filter');
      expect(shape).toHaveProperty('$top');
      expect(shape).toHaveProperty('$skip');
      expect(shape).toHaveProperty('$orderby');
      expect(shape).toHaveProperty('$select');
      expect(shape).toHaveProperty('$expand');
    });

    it('all query parameters are optional', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'read');
      const result = schema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts valid query parameters', () => {
      const schema = buildEntitySchema(mockEntity, 'Students', 'read');
      const result = schema.safeParse({
        $filter: "gpa lt 2.0",
        $top: 10,
        $orderby: "name asc",
      });
      expect(result.success).toBe(true);
    });
  });
});

// ─── buildActionSchema ─────────────────────────────────────────────────────

describe('buildActionSchema', () => {
  it('builds schema from action parameters', () => {
    const action: CDSActionDef = {
      kind: 'action',
      params: {
        studentId: { type: 'cds.UUID' },
        courseId: { type: 'cds.UUID' },
        semester: { type: 'cds.String' },
      },
    };

    const schema = buildActionSchema(action, 'enrollStudent');
    const result = schema.safeParse({
      studentId: '550e8400-e29b-41d4-a716-446655440000',
      courseId: '660e8400-e29b-41d4-a716-446655440001',
      semester: 'Fall 2024',
    });
    expect(result.success).toBe(true);
  });

  it('returns empty schema for parameterless actions', () => {
    const action: CDSActionDef = { kind: 'action' };
    const schema = buildActionSchema(action, 'resetAll');
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ─── buildBoundActionSchema ─────────────────────────────────────────────────

describe('buildBoundActionSchema', () => {
  it('includes a required key field plus action params', () => {
    const action: CDSActionDef = {
      kind: 'action',
      params: {
        percentage: { type: 'cds.Decimal' },
      },
    };

    const schema = buildBoundActionSchema(action, 'setDiscount', 'Books');
    
    // Must have key
    const noKey = schema.safeParse({ percentage: 10 });
    expect(noKey.success).toBe(false);

    // With key should pass
    const withKey = schema.safeParse({ key: 'book-123', percentage: 10 });
    expect(withKey.success).toBe(true);
  });
});
