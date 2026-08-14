# Where cds-agents fits in SAP's AI ecosystem

SAP now ships official packages in this space. This document says plainly what they
cover, what cds-agents covers, and where we deliberately do **not** compete.

Registry data verified 2026-08-15.

## The official packages

| Package | Version | What it is | Downloads/mo |
|---|---|---|---|
| [`@cap-js/mcp`](https://www.npmjs.com/package/@cap-js/mcp) | 1.4.3 | CAP **plugin** that exposes your CAP service as an MCP server | ~11k |
| [`@cap-js/mcp-server`](https://www.npmjs.com/package/@cap-js/mcp-server) | 0.0.5 | MCP server for AI-assisted **development** of CAP apps (searches your CDS model + CAP docs) | ~282k |
| [`@sap-ai-sdk/langchain`](https://www.npmjs.com/package/@sap-ai-sdk/langchain) | 2.14.0 | LangChain bindings for **models** in SAP Generative AI Hub / AI Core | ~41k |

Two of these are frequently confused. `@cap-js/mcp-server` helps an AI write CAP code.
`@cap-js/mcp` lets an AI *call* your CAP service. Only the latter overlaps with us.

## What we are not building

**An MCP server for CAP.** `@cap-js/mcp` is at 1.4.3, is maintained by SAP, and converged
on the same tool shape we did — a generic `describe` + `query` pair rather than one tool
per entity. Rebuilding it would be worse and unmaintained. It was on our roadmap; it has
been removed.

**Model plumbing.** `@sap-ai-sdk/langchain` covers SAP-hosted LLMs. That is the *model*
side of a LangChain app; cds-agents is the *tool* side. They compose:

```typescript
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { CAPToolkit } from 'cds-agents';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

const agent = createReactAgent({
  llm: new AzureOpenAiChatClient({ modelName: 'gpt-4o' }),   // SAP GenAI Hub
  tools: await new CAPToolkit({ /* ... */ }).getTools(),      // your CAP services
});
```

## What is actually different about cds-agents

`@cap-js/mcp` is a **plugin**: it runs inside the CAP application. To use it you must own
that application, add the plugin, and redeploy it. That is the right design when you own
the service.

cds-agents is a **client library**: it points at a service that is already running.

| | `@cap-js/mcp` | `cds-agents` |
|---|---|---|
| Runs | inside the CAP app | inside your agent |
| Requires owning the service | yes | no |
| Requires redeploying the service | yes | no |
| Governance authored by | the service owner, for everyone | the agent author, for this agent |
| Multiple services | one server each | one tool array |
| Separate process | yes | no |

The consequences that matter:

1. **Services you do not own.** S/4HANA, SuccessFactors, a partner's OData endpoint,
   another team's production app. You cannot add a plugin to any of them.

2. **Governance at the consumer boundary.** The service owner's annotations bind everyone
   equally. An agent author needs to constrain *their agent* — "may read Students, may
   update `gpa`, may not delete anything" — without asking the service owner to redeploy.
   cds-agents enforces that in its own executor, so a denied call never leaves the process.

3. **Composition.** One agent spanning HR, Finance, and a partner service is one tool
   array here, versus three MCP servers and the tool-name collisions that come with them
   (which is why `@cap-js/mcp` has a `prefix` flag).

If you own the CAP app and want any MCP client to reach it, **use `@cap-js/mcp`.** Use
cds-agents when you are the consumer, not the producer.

## Honest gap

Point 1 is not fully true yet. Today cds-agents builds its model through `cds.load()`,
which needs the CDS sources. Consuming a service you genuinely do not own requires
building the model from the live `$metadata` endpoint instead. That is the next feature,
and it is what makes this positioning real rather than aspirational — see the roadmap.
