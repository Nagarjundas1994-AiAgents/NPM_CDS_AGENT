# Changelog

All notable changes to `cds-agents` will be documented in this file.

## [1.1.0] - 2026-08-14

### Added
- **Capability map** — protocol-agnostic `buildCapabilityMap()` / `CAPToolkit.getCapabilityMap()`.
- **Tool strategies** — `toolStrategy: 'minimal' | 'crud' | 'actions' | 'full'`.
- **Minimal tools** — `describe` + structured `query` instead of one CRUD tool per entity.
- **Structured query API** — `{ gpa: { lt: 2.0 } }` compiles to OData `$filter`.
- **Operation policy** — `allowCreate`, `allowUpdate`, `allowDelete`.
- **Structured OData errors** — `{ type, status, service, entity, operation, message }`.
- **HTTP timeout** — `timeoutMs` on `ODataExecutor` / agent config (default 30s).

- **CDS-derived policy** — `@readonly`, `@insertonly`, and `@Capabilities.*Restrictions.*`
  are honoured during tool generation. Config can subtract permissions, never add them.
- **Runtime policy enforcement** — `ODataExecutor` accepts an `OperationPolicyMap` and
  refuses denied operations with a `403` `ODataError` before any HTTP request. `CAPToolkit`
  and `CAPAgent` derive it from the capability map, so advertised and permitted cannot drift.
- `resolveEntityPolicy()`, `toOperationPolicy()`, `formatODataLiteral()` exports.
- `CAPAgent.getCapabilityMap()` and `CAPToolkit.getExecutor()` — the policy-governed
  OData client for CAP calls you do not want to expose to the model.

### Fixed
- Single quotes in entity keys and function parameters are now escaped
  (`O'Brien` → `'O''Brien'`), so LLM-supplied values cannot break out of an OData literal.
- The default system prompt no longer names entities and actions excluded by
  `tools` / `exclude` / `toolStrategy`.

### Changed
- Product positioning: CAP-native capability layer, not only “CRUD tools for LangChain”.
- npm metadata: homepage, bugs, repository directory, MCP/sap-cap keywords.
- Default `toolStrategy` remains `'full'` for backward compatibility.
- `CAPAgent` now builds its tools through `CAPToolkit` instead of duplicating the wiring.
- `generateEntityTools()` omits `read_*` for `@insertonly` entities — previously always emitted.

## [1.0.0] - 2026-04-20

### Added
- **CDS → Tool Generation Engine**: Auto-generates LangChain tools from CDS service definitions.
- **Schema Mapper**: Maps all CDS primitive types to Zod schemas with LLM-friendly `.describe()` annotations.
- **OData Executor**: HTTP execution layer for CRUD operations and custom actions/functions.
- **CAPAgent**: High-level agent class wrapping LangGraph's `createReactAgent`.
- **CAPToolkit**: Standalone toolkit export for custom LangGraph graphs.
- **Multi-provider support**: OpenAI, Anthropic, and Google Gemini via dynamic imports.
- **Advanced features**: Entity scoping (`tools`/`exclude`), `dryRun` mode, streaming support.
- **Demo app**: University-themed CAP application with CLI chat interface.
