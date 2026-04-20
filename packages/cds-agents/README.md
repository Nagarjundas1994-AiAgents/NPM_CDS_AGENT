# cds-agents

> AI agent integration for SAP CAP — auto-generates LangChain/LangGraph tools from CDS service definitions.

[![npm version](https://img.shields.io/npm/v/cds-agents.svg)](https://www.npmjs.com/package/cds-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Talk to your SAP CAP database in plain English.**

`cds-agents` reads your app's CDS service definitions and automatically generates typed LangChain tools for every entity and action — so you can attach an AI agent to your CAP app in **minutes, not days**.

```typescript
import { CAPAgent } from 'cds-agents';

const agent = new CAPAgent({
  service:  'StudentService',
  baseUrl:  'http://localhost:4004',
  model:    'gpt-4o',
  tools:    'auto',
  auth:     { type: 'basic', user: 'alice', pass: 'admin' }
});

await agent.invoke("Put all students below 2.0 GPA on academic probation");
```

---

## Why cds-agents?

| Without `cds-agents` | With `cds-agents` |
|---|---|
| Manually define LangChain tools for each entity | Auto-generated from CDS model |
| Write Zod schemas by hand | Schemas built from CDS types |
| Wire HTTP calls for every CRUD operation | OData adapter handles it |
| Days of boilerplate | **3 lines of code** |

It's like giving a new employee your company's entire database manual vs. just sitting them in front of the system and having it explain itself.

---

## Installation

```bash
npm install cds-agents zod @langchain/core
```

Then install your preferred LLM provider:

```bash
# OpenAI (gpt-4o, o1, o3)
npm install @langchain/openai

# Anthropic (claude-sonnet, claude-opus)
npm install @langchain/anthropic

# Google Gemini (gemini-2.0-flash, gemini-2.5-pro)
npm install @langchain/google-genai
```

### Peer Dependencies

| Package | Version | Required |
|---|---|---|
| `@sap/cds` | `>=7.0.0` | ✅ Yes |
| `zod` | `>=3.20.0` | ✅ Yes |
| `@langchain/core` | `>=1.1.40` | ✅ Yes |
| `@langchain/openai` | `>=1.0.0` | If using OpenAI |
| `@langchain/anthropic` | `>=1.0.0` | If using Anthropic |
| `@langchain/google-genai` | `>=0.1.0` | If using Gemini |

---

## Quick Start

### 1. Start your CAP app

```bash
cd my-cap-project
cds watch
```

### 2. Create an agent

```typescript
import { CAPAgent } from 'cds-agents';

const agent = new CAPAgent({
  service: 'CatalogService',         // Your CDS service name
  baseUrl: 'http://localhost:4004',   // Your running CAP server
  model:   'gpt-4o',                 // Or 'claude-sonnet-4-5', 'gemini-2.0-flash'
});

// Ask it anything
const answer = await agent.invoke("Show me all books priced over $30");
console.log(answer);
```

### 3. That's it

The agent automatically:
- ✅ Loads your CDS model
- ✅ Discovers all entities and actions
- ✅ Generates LangChain tools with typed Zod schemas
- ✅ Calls your OData endpoints
- ✅ Returns human-readable answers

---

## API Reference

### `CAPAgent`

The main class that wraps a LangGraph ReAct agent with auto-generated CDS tools.

```typescript
const agent = new CAPAgent(config: CAPAgentConfig);
```

#### CAPAgentConfig

| Property | Type | Default | Description |
|---|---|---|---|
| `service` | `string` | *required* | CDS service name (e.g. `'StudentService'`) |
| `baseUrl` | `string` | *required* | Base URL of the running CAP service |
| `model` | `string` | *required* | LLM model identifier (see [Model Support](#model-support)) |
| `tools` | `'auto' \| string[]` | `'auto'` | Which entities to generate tools for |
| `exclude` | `string[]` | `[]` | Entities to exclude from tool generation |
| `auth` | `AuthConfig` | `{ type: 'none' }` | Authentication for the CAP service |
| `cdsFile` | `string` | `'./'` | Path to CDS source files |
| `cdsModel` | `CDSModel` | — | Pre-loaded CSN model (skips `cds.load()`) |
| `dryRun` | `boolean` | `false` | Log OData calls instead of executing |
| `systemPrompt` | `string` | auto-generated | Custom system prompt for the agent |
| `temperature` | `number` | `0` | LLM temperature |

#### Methods

```typescript
// One-shot invocation
const answer = await agent.invoke("Find students with GPA below 2.0");

// Streaming
for await (const event of agent.stream("List all courses")) {
  console.log(event.type, event.content);
}

// Access raw tools
const tools = await agent.getTools();
```

---

### `CAPToolkit`

For advanced users who want the raw tools without the full agent — perfect for custom LangGraph graphs.

```typescript
import { CAPToolkit } from 'cds-agents';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

const toolkit = new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  tools: 'auto',
});

const cdsTools = await toolkit.getTools();
const myTools = [...cdsTools, myCustomTool];

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: myTools,
});
```

---

### `ODataExecutor`

Low-level OData HTTP client. Used internally by the generated tools, but available for direct use.

```typescript
import { ODataExecutor } from 'cds-agents';

const executor = new ODataExecutor({
  baseUrl: 'http://localhost:4004',
  servicePath: 'StudentService',
  auth: { type: 'basic', user: 'alice', pass: 'admin' },
});

// CRUD operations
await executor.read('Students', { '$filter': "gpa lt 2.0", '$top': 10 });
await executor.create('Students', { firstName: 'John', lastName: 'Doe' });
await executor.update('Students', 'uuid-here', { gpa: 3.5 });
await executor.delete('Students', 'uuid-here');

// Custom actions & functions
await executor.callUnboundAction('enrollStudent', { studentId: '...', courseId: '...' });
await executor.callUnboundFunction('getStatistics');
```

---

## Model Support

The LLM provider is auto-detected from the model name:

| Model Prefix | Provider | Package |
|---|---|---|
| `gpt-*`, `o1-*`, `o3-*` | OpenAI | `@langchain/openai` |
| `claude-*` | Anthropic | `@langchain/anthropic` |
| `gemini-*` | Google | `@langchain/google-genai` |

```typescript
// OpenAI
new CAPAgent({ model: 'gpt-4o', ... });

// Anthropic
new CAPAgent({ model: 'claude-sonnet-4-5', ... });

// Google Gemini
new CAPAgent({ model: 'gemini-2.0-flash', ... });
```

Set the corresponding API key in your environment:
- `OPENAI_API_KEY` for OpenAI
- `ANTHROPIC_API_KEY` for Anthropic
- `GOOGLE_API_KEY` for Google Gemini

---

## What Gets Generated

For each CDS entity, `cds-agents` generates **4 CRUD tools**:

| Tool | HTTP | Description |
|---|---|---|
| `read_{Entity}` | `GET` | Query with OData `$filter`, `$top`, `$skip`, `$orderby`, `$select`, `$expand` |
| `create_{Entity}` | `POST` | Create a new record |
| `update_{Entity}` | `PATCH` | Update fields by primary key |
| `delete_{Entity}` | `DELETE` | Delete by primary key |

For each **unbound action/function**, generates **1 tool**:

| Tool | HTTP | Description |
|---|---|---|
| `action_{name}` | `POST` | Execute a service-level action |
| `function_{name}` | `GET` | Call a service-level function |

For each **bound action/function** on an entity, generates **1 tool**:

| Tool | HTTP | Description |
|---|---|---|
| `action_{Entity}_{name}` | `POST` | Execute on a specific entity instance |
| `function_{Entity}_{name}` | `GET` | Call on a specific entity instance |

---

## Entity Scoping

Control which entities get tools generated:

```typescript
// All entities (default)
new CAPAgent({ tools: 'auto', ... });

// Only specific entities
new CAPAgent({ tools: ['Students', 'Courses'], ... });

// All except sensitive ones
new CAPAgent({ tools: 'auto', exclude: ['AuditLogs', 'AdminUsers'], ... });
```

---

## Authentication

```typescript
// No auth (local development)
{ auth: { type: 'none' } }

// Basic auth
{ auth: { type: 'basic', user: 'alice', pass: 'admin' } }

// Bearer token (JWT)
{ auth: { type: 'bearer', token: 'eyJhbGciOi...' } }
```

---

## Dry Run Mode

Debug what OData calls the agent would make without actually executing them:

```typescript
const agent = new CAPAgent({
  ...config,
  dryRun: true,
});

await agent.invoke("Delete all inactive students");
// Logs: [cds-agents DRY RUN] { method: 'GET', url: '...', ... }
// Logs: [cds-agents DRY RUN] { method: 'DELETE', url: '...', ... }
```

---

## CDS Type Mapping

All CDS types are mapped to Zod schemas with `.describe()` annotations:

| CDS Type | Zod Schema | LLM Description |
|---|---|---|
| `cds.String` | `z.string()` | String value |
| `cds.UUID` | `z.string().uuid()` | UUID |
| `cds.Integer` | `z.number().int()` | Integer |
| `cds.Decimal` | `z.number()` | Decimal number |
| `cds.Boolean` | `z.boolean()` | Boolean flag |
| `cds.Date` | `z.string()` | Date (YYYY-MM-DD) |
| `cds.DateTime` | `z.string()` | ISO 8601 datetime |
| `cds.Timestamp` | `z.string()` | ISO 8601 timestamp |
| `cds.LargeString` | `z.string()` | Large text |
| `cds.Association` | `z.string()` | Foreign key reference |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CAPAgent                         │
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  CDS     │  │  Tool        │  │  LangGraph   │  │
│  │  Model   │──│  Generator   │──│  ReAct Agent │  │
│  │  Loader  │  │  (Zod+Tools) │  │  (LLM+Tools) │  │
│  └──────────┘  └──────────────┘  └──────┬───────┘  │
│                                         │           │
│                                  ┌──────┴───────┐   │
│                                  │  OData       │   │
│                                  │  Executor    │   │
│                                  │  (HTTP)      │   │
│                                  └──────┬───────┘   │
└─────────────────────────────────────────┼───────────┘
                                          │
                                  ┌───────┴────────┐
                                  │  Running CAP   │
                                  │  Service       │
                                  │  (OData v4)    │
                                  └────────────────┘
```

---

## License

MIT © [Nagarjun Das](https://github.com/Nagarjundas1994-AiAgents)
