// ─── CDS Model Types (CSN — Core Schema Notation) ───────────────────────────
// These mirror the shape of a compiled CDS model returned by cds.load().
// Defined here to avoid a hard compile-time dependency on @sap/cds.

/**
 * A single element (field/column) in a CDS entity or structured type.
 */
export interface CDSElement {
  /** CDS type, e.g. 'cds.String', 'cds.UUID', 'cds.Association'. */
  type: string;
  /** True if this element is part of the entity's primary key. */
  key?: boolean;
  /** CDS @mandatory annotation — marks the field as required. */
  '@mandatory'?: boolean;
  /** Database NOT NULL constraint. */
  notNull?: boolean;
  /** True if this is a virtual/computed field (skip in schema). */
  virtual?: boolean;
  /** For associations: the target entity name. */
  target?: string;
  /** String length constraint. */
  length?: number;
  /** Enum values for string types. */
  enum?: Record<string, { val: string | number }>;
  /** Catch-all for other CDS annotations. */
  [annotation: string]: unknown;
}

/**
 * An action or function definition in CDS.
 */
export interface CDSActionDef {
  /** 'action' or 'function'. */
  kind: 'action' | 'function';
  /** Named parameters for this action/function. */
  params?: Record<string, CDSElement>;
  /** Return type definition. */
  returns?: { type: string; items?: { type: string } } | CDSElement;
}

/**
 * An entity definition in the compiled CDS model (CSN).
 */
export interface CDSEntity {
  /** The kind of definition — 'entity', 'type', 'service', etc. */
  kind: string;
  /** The entity's field definitions. */
  elements: Record<string, CDSElement>;
  /** Bound actions/functions on this entity. */
  actions?: Record<string, CDSActionDef>;
  /** Catch-all for other entity-level properties. */
  [key: string]: unknown;
}

/**
 * A service definition in the compiled CDS model (CSN).
 */
export interface CDSServiceDef {
  kind: 'service';
  name: string;
  [key: string]: unknown;
}

/**
 * The full compiled CDS model (CSN format).
 */
export interface CDSModel {
  /** All definitions in the compiled CDS model. */
  definitions: Record<string, CDSEntity | CDSServiceDef | CDSActionDef>;
  /** Catch-all for other model-level properties. */
  [key: string]: unknown;
}

// ─── Agent Configuration ────────────────────────────────────────────────────

/**
 * Authentication configuration for connecting to a CAP service.
 */
export type AuthConfig =
  | { type: 'basic'; user: string; pass: string }
  | { type: 'bearer'; token: string }
  | { type: 'none' };

/**
 * Configuration for the CAPAgent and CAPToolkit classes.
 */
export interface CAPAgentConfig {
  /** The CDS service name to target (e.g. 'StudentService'). */
  service: string;

  /** Base URL of the running CAP service (e.g. 'http://localhost:4004'). */
  baseUrl: string;

  /**
   * LLM model identifier. The provider is inferred from the model name:
   * - 'gpt-*', 'o1-*', 'o3-*'     → OpenAI  (@langchain/openai)
   * - 'claude-*'                    → Anthropic (@langchain/anthropic)
   * - 'gemini-*'                    → Google  (@langchain/google-genai)
   */
  model: string;

  /**
   * Which entity tools to generate:
   * - 'auto': all entities in the service (default)
   * - string[]: only these specific entities
   */
  tools?: 'auto' | string[];

  /** Entities to exclude from tool generation. Applied after `tools`. */
  exclude?: string[];

  /** Authentication for the CAP service. Defaults to { type: 'none' }. */
  auth?: AuthConfig;

  /** Path to CDS source files. Passed to `cds.load()`. @default './' */
  cdsFile?: string;

  /** Pre-loaded CDS model (CSN). If provided, `cds.load()` is skipped. */
  cdsModel?: CDSModel;

  /** If true, logs OData calls instead of executing them. */
  dryRun?: boolean;

  /** Custom system prompt for the ReAct agent. */
  systemPrompt?: string;

  /** Temperature for the LLM. @default 0 */
  temperature?: number;
}

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Metadata about a generated tool (for introspection / logging).
 */
export interface GeneratedToolMeta {
  /** Tool name, e.g. 'read_Students', 'action_enrollStudent'. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** The type of operation this tool performs. */
  type: 'read' | 'create' | 'update' | 'delete' | 'action' | 'function';
  /** The entity this tool targets (empty for unbound actions). */
  entityName: string;
}

/**
 * The result returned by `loadCDSModel()`.
 */
export interface LoadedCDSService {
  /** The full compiled CSN model. */
  model: CDSModel;
  /** The service name (fully qualified). */
  serviceName: string;
  /** Entities exposed by this service, keyed by short name. */
  entities: Record<string, CDSEntity>;
  /** Unbound actions/functions at the service level, keyed by short name. */
  unboundActions: Record<string, CDSActionDef>;
}

/**
 * Events emitted during agent streaming.
 */
export interface AgentStreamEvent {
  /** The type of event. */
  type: 'message' | 'tool_call' | 'tool_result' | 'final';
  /** The content of the event. */
  content: string;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}
