# Changelog

All notable changes to `cds-agents` will be documented in this file.

## [1.1.1] - 2026-08-15

Two showstoppers that made every HTTP call fail. Both were invisible because no test
exercised the real CAP conventions — mocked executors only ever checked URLs they
themselves constructed.

### Fixed

- **Service URL path.** CAP does not mount a service under its CDS name: `StudentService`
  is served at `/odata/v4/student`. Requests were built as `/odata/v4/StudentService/...`
  and 404'd against every stock CAP app. Paths are now derived the way CAP mounts them
  (`Service` suffix dropped, kebab-cased, namespace ignored, `@path` honoured), verified
  against `cds compile --to serviceinfo`.
- **`cds.load()` default.** The default `cdsFile: './'` throws `MODEL_NOT_FOUND`, so
  zero-config setup never worked. The default is now `'*'`, CAP's whole-project model.

### Added

- `cdsServicePath()` — exported, so the mount path can be inspected or reused.
- `LoadedCDSService.urlPath`, and `ODataExecutor`'s `urlPath` option.
- `odataPath` config — override the route when a service sits behind a reverse proxy,
  a custom mount, or is one you do not own.

### Changed

- **Dropped the planned MCP server.** [`@cap-js/mcp`](https://www.npmjs.com/package/@cap-js/mcp)
  is official, at 1.4.3, and converged on the same `describe` + `query` shape. Own the CAP
  app? Use it. Repositioned around the consumer side instead — see
  [docs/sap-ecosystem.md](../../docs/sap-ecosystem.md). Removes `docs/mcp/`.

## [1.1.0] - 2026-08-14

Tagged but never published to npm — superseded by 1.1.1.


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
