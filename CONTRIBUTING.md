# Contributing to cds-agents

Thanks for helping turn SAP CAP services into governed AI capabilities.

## Public identity

| Surface | Name |
|---|---|
| npm | `cds-agents` |
| GitHub repository (current) | `NPM_CDS_AGENT` |
| Published package path | `packages/cds-agents` |
| Root workspace | private `cds-agents-monorepo` |

Please use **cds-agents** in docs, issues, and commit messages. The GitHub repo name is historical.

## Development setup

```bash
git clone https://github.com/Nagarjundas1994-AiAgents/NPM_CDS_AGENT.git
cd NPM_CDS_AGENT
pnpm install
pnpm --filter cds-agents test
pnpm --filter cds-agents lint
pnpm --filter cds-agents build
```

Node.js 18+ and pnpm 9 are required. The demo CAP app lives in `demo-app/` and is not required for unit tests.

## Project map

```text
packages/cds-agents/src/
  capability.ts       Protocol-agnostic capability map
  query-builder.ts    Structured filter → OData
  tool-generator.ts   LangChain adapter
  odata-executor.ts   OData V4 runtime
  cap-toolkit.ts      Raw-tool layer
  cap-agent.ts        ReAct convenience wrapper
  model-loader.ts     CDS / CSN introspection
  schema-mapper.ts    CDS types → Zod
```

Keep adapters (LangChain, future MCP) thin. New protocols should consume `buildCapabilityMap()`, not walk CSN themselves.

## Pull requests

1. Open an issue for larger changes (MCP, auth providers, CLI).
2. Keep PRs focused. Do not mix a README rewrite with an unrelated executor change.
3. Add unit tests under `packages/cds-agents/tests/unit/`.
4. Run `pnpm --filter cds-agents test` and `pnpm --filter cds-agents lint`.
5. Update `packages/cds-agents/CHANGELOG.md` under `Unreleased` or the next version.

## Commit style

Conventional commits help the changelog:

```text
feat: add minimal tool strategy
fix: include entity on OData errors
docs: rewrite product README
test: cover structured query filters
```

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
