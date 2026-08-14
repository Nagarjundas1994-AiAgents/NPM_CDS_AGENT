/**
 * Structured query → OData V4 $filter conversion.
 *
 * Accepts either a raw OData filter string or a field/operator object so
 * agents do not have to author OData syntax by hand.
 */

export type ComparisonOp =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'contains'
  | 'startswith'
  | 'endswith';

export type FilterValue = string | number | boolean | null;

export type FieldFilter = FilterValue | Partial<Record<ComparisonOp, FilterValue>>;

/** Raw OData $filter, or a structured field map. */
export type QueryFilter = string | Record<string, FieldFilter>;

export interface StructuredQuery {
  entity: string;
  filter?: QueryFilter;
  select?: string[];
  orderBy?: string[];
  top?: number;
  skip?: number;
  expand?: string;
}

const FUNCTION_OPS = new Set<ComparisonOp>(['contains', 'startswith', 'endswith']);

/**
 * Formats a value as an OData literal, escaping embedded single quotes
 * (`O'Brien` → `'O''Brien'`) so LLM-supplied values cannot break out of the
 * literal and alter the query.
 */
export function formatODataLiteral(value: FilterValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function clauseFor(field: string, op: ComparisonOp, value: FilterValue): string {
  if (FUNCTION_OPS.has(op)) {
    return `${op}(${field},${formatODataLiteral(value)})`;
  }
  return `${field} ${op} ${formatODataLiteral(value)}`;
}

/**
 * Converts a structured filter (or raw OData string) into an OData V4 $filter.
 */
export function toODataFilter(filter: QueryFilter): string {
  if (typeof filter === 'string') return filter.trim();

  const clauses: string[] = [];

  for (const [field, spec] of Object.entries(filter)) {
    if (spec === undefined) continue;

    if (spec === null || typeof spec !== 'object') {
      clauses.push(clauseFor(field, 'eq', spec));
      continue;
    }

    for (const [op, value] of Object.entries(spec) as [ComparisonOp, FilterValue | undefined][]) {
      if (value === undefined) continue;
      clauses.push(clauseFor(field, op, value));
    }
  }

  return clauses.join(' and ');
}

/**
 * Builds OData query-option params from a structured query.
 */
export function toODataQueryParams(query: Omit<StructuredQuery, 'entity'>): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  if (query.filter !== undefined) {
    const filter = toODataFilter(query.filter);
    if (filter) params['$filter'] = filter;
  }
  if (query.select?.length) params['$select'] = query.select.join(',');
  if (query.orderBy?.length) params['$orderby'] = query.orderBy.join(',');
  if (query.top !== undefined) params['$top'] = query.top;
  if (query.skip !== undefined) params['$skip'] = query.skip;
  if (query.expand) params['$expand'] = query.expand;

  return params;
}
