<div align="center">
  <img src="./assets/logo.svg" width="120" alt="cds-agents logo" />
  <h1>cds-agents</h1>
  <p><strong>The SAP CAP-native tool layer for agentic applications.</strong></p>
  <p>Turn any SAP CAP service into governed AI capabilities for LangChain, LangGraph, MCP, and enterprise agents.</p>

  [![npm version](https://img.shields.io/npm/v/cds-agents.svg?style=for-the-badge&color=blue)](https://www.npmjs.com/package/cds-agents)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)
  [![CI](https://img.shields.io/github/actions/workflow/status/Nagarjundas1994-AiAgents/NPM_CDS_AGENT/ci.yml?style=for-the-badge&label=CI)](https://github.com/Nagarjundas1994-AiAgents/NPM_CDS_AGENT/actions)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
</div>

<br/>

```typescript
import { CAPToolkit } from 'cds-agents';

const toolkit = new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  toolStrategy: 'minimal',   // describe + query — not 400 CRUD tools
  allowDelete: false,
});

const tools = await toolkit.getTools();
```

---

## What is cds-agents?

`cds-agents` is the **capability layer between SAP CAP and AI agents**.

It reads your CDS / CSN model and exposes a governed set of tools — not a pile of generated HTTP wrappers. The same capability map can feed a LangChain toolkit today and an MCP server next.

```text
                 cds-agents
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  CDS Introspection  Tool Layer    Runtime
       │             │             │
       ▼             ▼             ▼
     CSN/CDS     LangChain      OData V4
                    Tools       Executor
       │
       └──────────────┬──────────────┘
                      ▼
               Agent Framework
            LangGraph / MCP / custom
```

**Two modes, one model:**

| Mode | Class | Use when |
|---|---|---|
| Tool layer | `CAPToolkit` | You want raw tools for LangGraph, a custom agent, or a future MCP adapter |
| Ready-made agent | `CAPAgent` | You want a ReAct loop against one CAP service right now |

`CAPToolkit` is the product. `CAPAgent` is the convenience wrapper.

This is **not** a multi-agent orchestrator. For supervisors, branching, or human-in-the-loop graphs, generate tools with `CAPToolkit` and compose them in LangGraph.

---

## Why?

Integrating LLMs with enterprise CAP services usually means hand-written tools, hallucinated OData, and an ungoverned CRUD surface.

| Without cds-agents | With cds-agents |
|---|---|
| One LangChain tool per entity operation | A capability map with `minimal` / `crud` / `actions` / `full` strategies |
| Manual Zod schemas that drift from CDS | CDS types mapped to Zod automatically |
| Raw HTTP to OData | `ODataExecutor` with auth, timeout, dry-run, structured errors |
| Hundreds of tools on a large service | Token-efficient `describe` + `query` |
| Framework lock-in | One CAP model → multiple AI protocols |

---

## 30-second quick start

```bash
npm install cds-agents zod @langchain/core @langchain/openai
```

```typescript
import { CAPAgent } from 'cds-agents';

const agent = new CAPAgent({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  model: 'gpt-4o',
  toolStrategy: 'minimal',
});

const answer = await agent.invoke(
  'Put all students below 2.0 GPA on academic probation'
);
```

Prerequisites: Node.js 18+, a running CAP OData V4 service, and an LLM key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`).

Provider packages are optional peer dependencies — install only the one you use (`@langchain/openai`, `@langchain/anthropic`, or `@langchain/google-genai`).

---

## Architecture

Tool generation and agent execution are separate on purpose.

```text
                 CDS / CSN
                     │
                     ▼
              CAP Introspection
                     │
                     ▼
             Capability registry
           ┌─────────┴─────────┐
           ▼                   ▼
     LangChain tools        MCP tools (planned)
           │                   │
           ▼                   ▼
      LangGraph              OpenCode /
      / CAPAgent             Claude / others
           │                   │
           └─────────┬─────────┘
                     ▼
                CAP runtime
                     │
                     ▼
                OData / CQL
```

1. **Model loader** introspects entities, actions, and functions from CDS/CSN.
2. **Capability map** decides *what* the service may expose, given `toolStrategy` and policy.
3. **Tool adapters** turn that map into LangChain tools (MCP adapter is next).
4. **OData executor** performs the actual CAP calls.

Nothing runs until the first `getTools()`, `getCapabilityMap()`, or `invoke()`.

---

## CAPToolkit

The recommended production entry point. You get tools; you own the agent.

```typescript
import { CAPToolkit } from 'cds-agents';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

const toolkit = new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  toolStrategy: 'minimal',
  allowDelete: false,
});

const cdsTools = await toolkit.getTools();
const map = await toolkit.getCapabilityMap();

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: [...cdsTools, myCalculatorTool],
});
```

### Tool strategies

A service with 100 entities can generate 400+ CRUD tools. That burns context and hurts tool selection.

```ts
toolStrategy: 'minimal' | 'crud' | 'actions' | 'full'
```

| Strategy | Tools | When to use |
|---|---|---|
| `minimal` | `describe`, `query` | Large models, production defaults, MCP-shaped clients |
| `crud` | `read_*` / `create_*` / `update_*` / `delete_*` | Small services that want explicit entity tools |
| `actions` | bound + unbound actions/functions | Side-effect operations only |
| `full` | CRUD + actions | Backward-compatible default |

```typescript
const toolkit = new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  toolStrategy: 'minimal',
});
```

**Minimal mode**

- `describe` — returns the capability map (or one entity)
- `query` — structured read: `{ entity, filter, select, orderBy, top, skip }`

```typescript
await query.invoke({
  entity: 'Students',
  filter: { gpa: { lt: 2.0 }, status: 'active' },
  select: ['ID', 'firstName', 'gpa'],
  orderBy: ['gpa asc'],
  top: 10,
});
// → $filter=gpa lt 2 and status eq 'active'
```

Raw OData is still accepted: `filter: "gpa lt 2.0"`.

### Governance

Policy is **enforced at the executor**, not just at tool generation. Withholding a tool
only hides an operation from the model; anything holding the executor could still perform
it. A denied call is refused before any HTTP request and comes back as a `403` `ODataError`.

```typescript
new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  allowCreate: true,
  allowUpdate: true,
  allowDelete: false,
});
```

**Your CDS model wins.** Config can take permissions away; it can never grant them. These
annotations are honoured during both generation and execution:

| Annotation | Effect |
|---|---|
| `@readonly` | read only — no create/update/delete tools, writes refused |
| `@insertonly` | create only — not queryable, absent from `query` |
| `@Capabilities.DeleteRestrictions.Deletable: false` | no delete (same for `Insert`/`Update`/`Read`) |

```typescript
// A @readonly projection stays read-only no matter what the config asks for.
const map = await toolkit.getCapabilityMap();
map.entities.find((e) => e.name === 'Reports')?.operations; // ['read']
```

`getCapabilityMap()` is the audit surface: what it advertises is exactly what the executor
permits — both are derived from the same object, so they cannot drift.

Entity scoping still works: `tools: ['Students', 'Courses']` or `exclude: ['AuditLogs']`.
Excluded entities are refused at the executor too, not merely un-tooled.

---

## MCP

MCP is the next first-class adapter, not a side experiment.

> One CAP model → multiple AI integration protocols.

```text
CAP + OData only          → traditional application integration
CAP + cds-agents          → LLM tool integration
CAP + MCP                 → standardized AI capability integration
CAP + cds-agents + MCP    → AI-native CAP capability layer
```

The capability map already looks like an MCP surface:

```json
{
  "service": "StudentService",
  "strategy": "minimal",
  "entities": [{ "name": "Students", "operations": ["read"], "keys": ["ID"] }],
  "unbound": [{ "name": "enrollStudent", "kind": "action" }]
}
```

Planned MCP tools: `describe`, `query`, then `execute_action`. See [docs/mcp](../../docs/mcp/README.md) for the protocol notes and Inspector examples.

---

## CAPAgent

A ready-made LangGraph ReAct agent for demos and small apps.

```typescript
const agent = new CAPAgent({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  model: 'gpt-4o',
  toolStrategy: 'minimal',
  auth: { type: 'basic', user: 'alice', pass: 'admin' },
});

const answer = await agent.invoke('List students with GPA below 2.0');

for await (const event of agent.stream('Show enrollment statistics')) {
  if (event.type === 'tool_call') console.log(event.content);
  if (event.type === 'final') console.log(event.content);
}
```

Model strings resolve the provider: `gpt-*` / `o1-*` / `o3-*` → OpenAI, `claude-*` → Anthropic, `gemini-*` → Google.

For production graphs, prefer `CAPToolkit`.

---

## ODataExecutor

Low-level OData V4 client. Used by generated tools; usable without an LLM.

```typescript
import { ODataExecutor } from 'cds-agents';

const executor = new ODataExecutor({
  baseUrl: 'http://localhost:4004',
  servicePath: 'StudentService',
  auth: { type: 'bearer', token: process.env.CAP_TOKEN! },
  timeoutMs: 15_000,
});

await executor.read('Students', { $filter: 'gpa lt 2.0', $top: 10 });
await executor.create('Students', { firstName: 'John', lastName: 'Doe' });
await executor.callUnboundAction('enrollStudent', { studentId, courseId });
```

Failed calls return a structured object the model can act on:

```json
{
  "type": "ODataError",
  "status": 403,
  "service": "StudentService",
  "entity": "Students",
  "operation": "update",
  "message": "Insufficient privileges"
}
```

---

## Security

Local demos often use Basic auth. That is not an enterprise default.

```typescript
auth: { type: 'none' }
auth: { type: 'basic', user, pass }
auth: { type: 'bearer', token }
```

Bearer is the path to XSUAA / IAS / principal propagation: obtain a token from your IdP and pass it through. Native `oauth2` / `xsuaa` / `ias` providers and annotation-aware `@requires` / `@restrict` tool generation are on the [roadmap](../../docs/ROADMAP.md).

Always disable deletes in production unless you have a human-in-the-loop policy:

```typescript
{ allowDelete: false, dryRun: process.env.NODE_ENV !== 'production' }
```

`dryRun: true` logs the OData request and executes nothing.

---

## Examples

### University demo

```
demo-app/
├── db/schema.cds              Students, Courses, Enrollments
├── srv/student-service.cds    actions + functions
└── chat.mjs                   CLI ReAct agent
```

```bash
cd demo-app && npm install && cds watch     # terminal 1
export OPENAI_API_KEY=sk-...
node chat.mjs                               # terminal 2
```

Prompts:

- List all students with GPA below 2.0
- Create a course called Machine Learning, code ML101, 4 credits, CS
- Put all students with GPA below 2.0 on academic probation
- Enroll Alice Johnson in Database Systems for Spring 2024
- Show enrollment statistics

### Custom LangGraph

```typescript
const hr = new CAPToolkit({ service: 'HRService', baseUrl, toolStrategy: 'minimal' });
const fin = new CAPToolkit({ service: 'FinanceService', baseUrl, toolStrategy: 'minimal' });

const graph = new StateGraph(MessagesAnnotation)
  .addNode('hr', createReactAgent({ llm, tools: await hr.getTools() }))
  .addNode('finance', createReactAgent({ llm, tools: await fin.getTools() }));
```

---

## Advanced usage

| Need | How |
|---|---|
| Pre-loaded CSN | `cdsModel: compiledCsn` (skips `cds.load()`) |
| CDS path | `cdsFile: './srv/student-service.cds'` |
| Inspect capabilities | `await toolkit.getCapabilityMap()` |
| Governed CAP calls without a tool | `await toolkit.getExecutor()` |
| Hide entities | `exclude: ['AuditLogs']` |
| Custom system prompt | `systemPrompt` on `CAPAgent` |
| Structured query (no LLM) | `toODataFilter({ gpa: { lt: 2 } })` |

CDS → Zod mapping: `String` → `z.string()`, `UUID` → `z.string().uuid()`, `Integer` → `z.number().int()`, associations → foreign-key strings.

---

## API reference

### `CAPToolkit` / `CAPAgent` config

| Property | Type | Default | Description |
|---|---|---|---|
| `service` | `string` | required | CDS service name |
| `baseUrl` | `string` | required | Running CAP service URL |
| `model` | `string` | required on `CAPAgent` | LLM id (`gpt-4o`, `claude-*`, `gemini-*`) |
| `toolStrategy` | `'minimal' \| 'crud' \| 'actions' \| 'full'` | `'full'` | Tool surface |
| `allowCreate` / `allowUpdate` / `allowDelete` | `boolean` | `true` | Destructive-operation policy |
| `tools` | `'auto' \| string[]` | `'auto'` | Entity allow-list |
| `exclude` | `string[]` | `[]` | Entity deny-list |
| `auth` | `AuthConfig` | `{ type: 'none' }` | `none` / `basic` / `bearer` |
| `timeoutMs` | `number` | `30000` | OData HTTP timeout |
| `dryRun` | `boolean` | `false` | Log requests, do not execute |
| `cdsFile` / `cdsModel` | path or CSN | `'./'` | Model source |

### Generated CRUD tools (`crud` / `full`)

| Tool | HTTP |
|---|---|
| `read_{Entity}` | `GET` |
| `create_{Entity}` | `POST` |
| `update_{Entity}` | `PATCH` |
| `delete_{Entity}` | `DELETE` |
| `action_{name}` / `function_{name}` | `POST` / `GET` |

---

## Current limitations

| Limitation | Notes |
|---|---|
| MCP adapter | Designed; not shipped. Capability map is the shared contract. |
| Single service per toolkit | Compose multiple toolkits for multi-service agents. |
| Local CDS/CSN required | Schema is loaded via `cds.load()` or `cdsModel`. |
| No `$batch` | One HTTP request per tool call. |
| Auth | `none` / `basic` / `bearer` only — XSUAA/IAS helpers are planned. |
| CAPAgent is single-turn | Manage conversation history yourself. |

---

## Roadmap

1. **Now** — product identity, capability map, tool strategies, CI, docs
2. **Core** — richer query planning, dry-run explain, authorization annotations
3. **MCP** — `@cds-agents/mcp`, Inspector examples, OpenCode demo
4. **Enterprise** — OAuth / XSUAA / IAS, tenant context, tracing, approvals
5. **DX** — `npx cds-agents inspect|mcp|doctor`

Full plan: [docs/ROADMAP.md](../../docs/ROADMAP.md)

---

## Contributing

```bash
git clone https://github.com/Nagarjundas1994-AiAgents/NPM_CDS_AGENT.git
cd NPM_CDS_AGENT
pnpm install
pnpm test
pnpm build
```

Public identity is **`cds-agents`** (npm). This GitHub repository is still named `NPM_CDS_AGENT`; the published package and docs use `cds-agents`. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

Released under the [MIT License](./LICENSE).  
© [Nagarjun Das](https://github.com/Nagarjundas1994-AiAgents)
