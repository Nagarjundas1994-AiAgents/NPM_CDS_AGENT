# MCP and cds-agents

Status: **designed, not shipped.** The capability map in `cds-agents@1.1` is the shared contract. This folder documents the MCP adapter so the next package does not invent a second model.

## Why MCP?

```text
CAP + OData only          → traditional application integration
CAP + cds-agents          → LLM tool integration
CAP + MCP                 → standardized AI capability integration
CAP + cds-agents + MCP    → AI-native CAP capability layer
```

LangChain is one consumer. MCP is how OpenCode, Claude, and other clients should see the same CAP service without a framework-specific toolkit.

## Intended shape

```text
CAP CDS / CSN
      │
      ▼
cds-agents capability map
      │
      ├── LangChain adapter   (ships today)
      └── MCP adapter         (this design)
            │
            ├── tools/list     describe, query, execute_action
            ├── tools/call
            ├── resources/list (optional: entity metadata)
            └── resources/read
```

The MCP server should **not** expose `read_Students`, `create_Students`, … by default. It should expose the `minimal` surface.

## Documents

| File | Contents |
|---|---|
| [protocol.md](./protocol.md) | initialize, tools/list, tools/call |
| [inspector.md](./inspector.md) | How to drive the design with MCP Inspector |
| [examples.md](./examples.md) | Sample requests and responses |

## Working today without MCP

```typescript
import { CAPToolkit } from 'cds-agents';

const toolkit = new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  toolStrategy: 'minimal',
});

const map = await toolkit.getCapabilityMap();
const tools = await toolkit.getTools(); // describe + query
```

`getCapabilityMap()` is what `tools/list` will serialize.
