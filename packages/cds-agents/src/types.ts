import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

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
 * How capabilities are exposed as tools.
 *
 * - `minimal` — `describe` + `query` only (token-efficient; recommended for large models)
 * - `crud`    — per-entity read/create/update/delete (no actions)
 * - `actions` — bound and unbound actions/functions only
 * - `full`    — CRUD + actions (default, backward compatible)
 */
export type ToolStrategy = 'minimal' | 'crud' | 'actions' | 'full';

/**
 * Operation-level policy for generated capabilities.
 *
 * These are the *requested* permissions. The effective permissions are the
 * intersection of this policy with the CDS model's own annotations
 * (`@readonly`, `@insertonly`, `@Capabilities.*`) — the model always wins.
 */
export interface ToolPolicy {
  /** Allow create tools. @default true */
  allowCreate?: boolean;
  /** Allow update tools. @default true */
  allowUpdate?: boolean;
  /** Allow delete tools. @default true */
  allowDelete?: boolean;
}

/** Effective per-entity permissions after CDS annotations and `ToolPolicy`. */
export interface EntityPolicy {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * Entity name → effective permissions, enforced by {@link ODataExecutor} at
 * request time. Entities absent from the map are denied.
 */
export type OperationPolicyMap = Record<string, EntityPolicy>;

/**
 * Configuration for the CAPAgent and CAPToolkit classes.
 */
export interface CAPAgentConfig extends ToolPolicy {
  /** The CDS service name to target (e.g. 'StudentService'). */
  service: string;

  /** Base URL of the running CAP service (e.g. 'http://localhost:4004'). */
  baseUrl: string;

  /**
   * The LLM, as either a model identifier or a constructed chat model.
   *
   * As a string, the provider is inferred from the name:
   * - 'gpt-*', 'o<n>-*'  → OpenAI    (@langchain/openai)
   * - 'claude-*'         → Anthropic (@langchain/anthropic)
   * - 'gemini-*'         → Google    (@langchain/google-genai)
   *
   * Pass a constructed model for anything else — SAP Generative AI Hub via
   * `@sap-ai-sdk/langchain`, Bedrock, Ollama, or a model whose name the
   * shorthand above does not recognise yet. It is used as-is, and `temperature`
   * is left to whatever the instance was built with.
   */
  model: string | BaseChatModel;

  /**
   * Which entity tools to generate:
   * - 'auto': all entities in the service (default)
   * - string[]: only these specific entities
   */
  tools?: 'auto' | string[];

  /** Entities to exclude from tool generation. Applied after `tools`. */
  exclude?: string[];

  /**
   * Tool surface exposed to the model.
   * Use `minimal` for large CAP services to avoid hundreds of CRUD tools.
   * @default 'full'
   */
  toolStrategy?: ToolStrategy;

  /**
   * Overrides the HTTP path the service is served at, relative to `baseUrl`
   * (e.g. `odata/v4/student`, or `api/students` behind an App Router).
   *
   * By default the path is derived from the CDS model the way CAP mounts it,
   * so you only need this when the deployed route differs — a reverse proxy,
   * a custom mount, or a service you do not own.
   */
  odataPath?: string;

  /** Authentication for the CAP service. Defaults to { type: 'none' }. */
  auth?: AuthConfig;

  /**
   * Path passed to `cds.load()`. Defaults to `'*'` — CAP's whole-project model,
   * resolved from the current working directory. (`'./'` is not a valid model
   * path and throws MODEL_NOT_FOUND.)
   * @default '*'
   */
  cdsFile?: string;

  /** Pre-loaded CDS model (CSN). If provided, `cds.load()` is skipped. */
  cdsModel?: CDSModel;

  /** If true, logs OData calls instead of executing them. */
  dryRun?: boolean;

  /** HTTP timeout in milliseconds for OData calls. @default 30000 */
  timeoutMs?: number;

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
  /**
   * The HTTP path CAP serves this service at, relative to the base URL —
   * e.g. `odata/v4/student` for `StudentService`. Not the service name.
   */
  urlPath: string;
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
