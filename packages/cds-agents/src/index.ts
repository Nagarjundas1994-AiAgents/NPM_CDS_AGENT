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
  generateAllTools,
} from './tool-generator';

export { loadCDSModel, getEntityKeys, describeEntityFields } from './model-loader';

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
} from './types';
