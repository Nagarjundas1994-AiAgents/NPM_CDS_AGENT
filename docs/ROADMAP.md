# Roadmap

cds-agents is evolving from “LangChain tools for CAP” into **governed AI capabilities for SAP CAP**.

The public contract is: one CDS/CSN model, multiple AI protocols, with an explicit policy layer between them.

## Phase 1 — Professional product (current)

- [x] Public identity: npm `cds-agents`, docs use that name
- [x] README rewrite around CAPToolkit vs CAPAgent
- [x] LICENSE, CHANGELOG, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT
- [x] GitHub Actions CI (Node 20 / 22 / 24)
- [x] Unit tests for mapping, OData, tools, capability map

## Phase 2 — Strengthen the core

- [x] Capability registry (`buildCapabilityMap`)
- [x] Tool strategies (`minimal` / `crud` / `actions` / `full`)
- [x] Structured query API
- [x] Safe CRUD controls (`allowCreate` / `allowUpdate` / `allowDelete`)
- [x] Structured OData errors + timeout
- [x] Honor `@readonly`, `@insertonly`, `@Capabilities.*` during generation
- [x] Runtime policy enforcement in `ODataExecutor` (denied ops never reach CAP)
- [ ] Honor `@restrict` / `@requires` (needs a user/role context — see Phase 4)
- [ ] Query planning IR (intent → capability plan → OData/CQL)
- [ ] Dry-run explain (“what would this change?”)
- [ ] Pagination helpers and `$batch`

## Phase 3 — Consume services you do not own

This is the differentiator. `@cap-js/mcp` requires owning and redeploying the CAP app;
cds-agents should work against anything already running. See
[docs/sap-ecosystem.md](./sap-ecosystem.md).

- [ ] **Build the model from a live `$metadata` endpoint** — no CDS sources, no `@sap/cds`
- [ ] Make `@sap/cds` an optional peer dependency once `$metadata` works
- [ ] Multi-service toolkit composition with name prefixing
- [ ] Enterprise examples against real OData shapes (SalesOrder, BusinessPartner)

## Phase 4 — Enterprise AI

- [ ] `auth.type: 'oauth2'` token provider
- [ ] XSUAA / IAS helpers
- [ ] Tenant context that cannot cross tenants
- [ ] Request `traceId` across tool → HTTP → CAP
- [ ] Approval policy (`update: 'approval'`, `delete: false`)
- [ ] Audit log of tool calls

## Phase 5 — Developer experience

- [ ] `npx cds-agents init`
- [ ] `npx cds-agents inspect` — print the capability map
- [ ] `npx cds-agents mcp` — run the MCP server
- [ ] `npx cds-agents doctor` — CDS, OData, auth, MCP checks
- [ ] Enterprise examples (SalesOrder, BusinessPartner, Product)

## Non-goals

- **An MCP server for CAP.** [`@cap-js/mcp`](https://www.npmjs.com/package/@cap-js/mcp)
  is official, at 1.4.3, and converged on the same `describe` + `query` shape. Own the
  CAP app? Use it. This was Phase 3; it has been dropped.
- **Model plumbing.** `@sap-ai-sdk/langchain` covers SAP GenAI Hub models. We are the
  tool side; the two compose.
- Replacing LangGraph as an orchestration framework
- Becoming a hosted agent runtime
- Generating hundreds of per-entity tools as the recommended default
