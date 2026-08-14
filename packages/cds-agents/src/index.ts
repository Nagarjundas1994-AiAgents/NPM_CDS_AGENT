// ─── cds-agents Public API ──────────────────────────────────────────────────
// Re-exports everything the consumer needs. Keep this file lean.

// ─── Main Exports ───────────────────────────────────────────────────────────

export { CAPAgent } from './cap-agent';
export { CAPToolkit } from './cap-toolkit';
export { ODataExecutor } from './odata-executor';

// ─── Utilities ──────────────────────────────────────────────────────────────

export {
  cdsTypeToZod,
  buildEntitySchema,
  buildActionSchema,
  buildBoundActionSchema,
} from './schema-mapper';

export {
  generateEntityTools,
  generateUnboundActionTools,
  generateBoundActionTools,
  generateMinimalTools,
  generateAllTools,
} from './tool-generator';

export {
  loadCDSModel,
  getEntityKeys,
  describeEntityFields,
  cdsServicePath,
} from './model-loader';

export {
  buildCapabilityMap,
  resolveEntityNames,
  resolveEntityPolicy,
  toOperationPolicy,
} from './capability';
export { toODataFilter, toODataQueryParams, formatODataLiteral } from './query-builder';

// ─── Type Exports ───────────────────────────────────────────────────────────

export type {
  CAPAgentConfig,
  AuthConfig,
  CDSModel,
  CDSEntity,
  CDSElement,
  CDSActionDef,
  CDSServiceDef,
  GeneratedToolMeta,
  LoadedCDSService,
  AgentStreamEvent,
  ToolStrategy,
  ToolPolicy,
  EntityPolicy,
  OperationPolicyMap,
} from './types';

export type {
  ServiceCapabilityMap,
  EntityCapability,
  ActionCapability,
  CapabilityOperation,
} from './capability';

export type {
  QueryFilter,
  StructuredQuery,
  ComparisonOp,
  FieldFilter,
} from './query-builder';

export type { ODataErrorObject } from './odata-executor';
