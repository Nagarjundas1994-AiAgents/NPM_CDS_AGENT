import { z, ZodTypeAny } from 'zod';
import type { CDSElement, CDSEntity, CDSActionDef } from './types';

// ─── CDS Type → Zod Type Mapping ────────────────────────────────────────────
// Each entry is a factory that returns a fresh Zod schema instance with a
// `.describe()` annotation so the LLM understands the field's purpose.

const CDS_TYPE_MAP: Record<string, (fieldName: string) => ZodTypeAny> = {
  'cds.String':      (n) => z.string().describe(`String value for "${n}"`),
  'cds.UUID':        (n) => z.string().uuid().describe(`UUID for "${n}"`),
  'cds.Integer':     (n) => z.number().int().describe(`Integer value for "${n}"`),
  'cds.Int16':       (n) => z.number().int().describe(`16-bit integer for "${n}"`),
  'cds.Int32':       (n) => z.number().int().describe(`32-bit integer for "${n}"`),
  'cds.Int64':       (n) => z.number().int().describe(`64-bit integer for "${n}"`),
  'cds.Decimal':     (n) => z.number().describe(`Decimal number for "${n}"`),
  'cds.Double':      (n) => z.number().describe(`Double-precision number for "${n}"`),
  'cds.Boolean':     (n) => z.boolean().describe(`Boolean flag for "${n}"`),
  'cds.Date':        (n) => z.string().describe(`Date in YYYY-MM-DD format for "${n}"`),
  'cds.Time':        (n) => z.string().describe(`Time in HH:MM:SS format for "${n}"`),
  'cds.DateTime':    (n) => z.string().describe(`ISO 8601 datetime for "${n}"`),
  'cds.Timestamp':   (n) => z.string().describe(`ISO 8601 timestamp for "${n}"`),
  'cds.LargeString': (n) => z.string().describe(`Large text value for "${n}"`),
  'cds.LargeBinary': (n) => z.any().describe(`Binary data for "${n}"`),
  'cds.Binary':      (n) => z.any().describe(`Binary data for "${n}"`),
};

/**
 * Converts a single CDS element definition to a Zod type.
 *
 * Handles:
 * - Standard CDS types (String, UUID, Integer, Decimal, Boolean, Date, etc.)
 * - Associations and Compositions → mapped to z.string() (foreign key)
 * - Unknown types → falls back to z.any() (never crashes)
 *
 * All schemas include `.describe()` annotations for LLM understanding.
 *
 * @param element - A CDS element definition from the compiled model.
 * @param fieldName - The field's name (used in .describe() annotation).
 * @returns The corresponding Zod type.
 */
export function cdsTypeToZod(element: CDSElement, fieldName: string): ZodTypeAny {
  // Associations/Compositions arrive as foreign keys.
  if (
    element.type === 'cds.Association' ||
    element.type === 'cds.Composition' ||
    element.target
  ) {
    return z.string().describe(`Foreign key reference for "${fieldName}"`);
  }

  const factory = CDS_TYPE_MAP[element.type];
  if (factory) return factory(fieldName);

  // Fallback — never crash on unknown types
  return z.any().describe(`Field "${fieldName}" (type: ${element.type})`);
}

/**
 * Builds a Zod object schema from a CDS entity definition.
 *
 * The `context` parameter controls required vs. optional semantics:
 *
 * - **create**: Key fields are optional (auto-generated), @mandatory fields required,
 *               everything else optional. Used for POST payloads.
 * - **update**: All fields optional (PATCH semantics). A `key` field is added
 *               as required to identify the record.
 * - **read**:   Returns an OData query schema ($filter, $top, $skip, etc.)
 *               instead of entity fields.
 *
 * @param entity - The CDS entity definition.
 * @param entityName - The entity's short name (for descriptions).
 * @param context - The operation context.
 * @returns A Zod object schema.
 */
export function buildEntitySchema(
  entity: CDSEntity,
  entityName: string,
  context: 'create' | 'update' | 'read'
): z.ZodObject<Record<string, ZodTypeAny>> {
  if (context === 'read') {
    return buildReadSchema(entityName);
  }

  const shape: Record<string, ZodTypeAny> = {};

  // For update, add a required key field to identify the record
  if (context === 'update') {
    shape['key'] = z.string().describe(
      `The primary key value of the ${entityName} record to update. ` +
      `For composite keys, use comma-separated key=value pairs.`
    );
  }

  for (const [fieldName, element] of Object.entries(entity.elements || {})) {
    // Skip virtual/computed fields
    if (element.virtual) continue;
    // Skip internal CAP fields
    if (fieldName.startsWith('_')) continue;
    // Skip association/composition fields in write schemas
    if (element.target) continue;

    let zodType = cdsTypeToZod(element, fieldName);

    if (context === 'create') {
      // @mandatory → required; key → optional (auto-generated); else → optional
      const isMandatory = element['@mandatory'] === true;
      const isKey = element.key === true;
      if (!isMandatory || isKey) {
        zodType = zodType.optional();
      }
    } else {
      // update: all fields optional (PATCH semantics)
      zodType = zodType.optional();
    }

    shape[fieldName] = zodType;
  }

  return z.object(shape);
}

/**
 * Builds an OData query schema for read operations.
 */
function buildReadSchema(entityName: string): z.ZodObject<Record<string, ZodTypeAny>> {
  return z.object({
    $filter: z.string().optional().describe(
      `OData $filter expression to query ${entityName}. ` +
      `Examples: "name eq 'John'", "gpa lt 2.0", "contains(email,'@gmail.com')". ` +
      `Operators: eq, ne, gt, ge, lt, le, and, or, not. ` +
      `Functions: contains(), startswith(), endswith().`
    ),
    $select: z.string().optional().describe(
      `Comma-separated list of fields to return. Example: "ID,name,email".`
    ),
    $orderby: z.string().optional().describe(
      `Sort order. Example: "name asc" or "gpa desc".`
    ),
    $top: z.number().int().optional().describe(
      `Maximum number of records to return. Example: 10.`
    ),
    $skip: z.number().int().optional().describe(
      `Number of records to skip (for pagination). Example: 20.`
    ),
    $expand: z.string().optional().describe(
      `Navigation properties to expand (include related data). Example: "courses".`
    ),
  });
}

/**
 * Builds a Zod schema from a CDS action/function definition's parameters.
 *
 * @param action - The CDS action/function definition.
 * @param actionName - The action's name (for descriptions).
 * @returns A Zod object schema for the action's input parameters.
 */
export function buildActionSchema(
  action: CDSActionDef,
  actionName: string
): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};

  if (!action.params) {
    return z.object(shape);
  }

  for (const [paramName, param] of Object.entries(action.params)) {
    let zodType = cdsTypeToZod(param, paramName);

    // Action parameters are required by default unless explicitly optional
    const isMandatory = param['@mandatory'] !== false;
    if (!isMandatory) {
      zodType = zodType.optional();
    }

    shape[paramName] = zodType;
  }

  return z.object(shape);
}

/**
 * Builds a Zod schema for a bound action that also needs an entity key.
 *
 * @param action - The CDS action/function definition.
 * @param actionName - The action's name.
 * @param entityName - The entity this action is bound to.
 * @returns A Zod object schema including the key + action params.
 */
export function buildBoundActionSchema(
  action: CDSActionDef,
  actionName: string,
  entityName: string
): z.ZodObject<Record<string, ZodTypeAny>> {
  const actionSchema = buildActionSchema(action, actionName);
  const shape = actionSchema.shape as Record<string, ZodTypeAny>;

  return z.object({
    key: z.string().describe(
      `The primary key of the ${entityName} instance to execute "${actionName}" on.`
    ),
    ...shape,
  });
}
