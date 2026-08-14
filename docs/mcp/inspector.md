# MCP Inspector (planned)

When `@cds-agents/mcp` ships, this is the manual test loop. Until then, the same questions can be asked through `CAPToolkit` + LangChain.

## Intended launch

```bash
# planned
npx @modelcontextprotocol/inspector npx cds-agents mcp \
  --service StudentService \
  --base-url http://localhost:4004 \
  --tool-strategy minimal
```

Start the demo CAP app first:

```bash
cd demo-app
npm install
cds watch
```

## Checks

1. **initialize** — server name `cds-agents`, tools capability present.
2. **tools/list** — exactly `describe` and `query` in minimal mode.
3. **tools/call describe** — JSON capability map listing `Students`, `Courses`, `Enrollments`.
4. **tools/call query** — `{ "entity": "Students", "filter": { "gpa": { "lt": 2.0 } } }`.
5. **invalid tool** — `tools/call` with `name: "delete_Students"` returns an error.
6. **invalid entity** — `query` with `entity: "Nope"` returns `ODataError` status 400.
7. **auth** — with `allowDelete: false` and `toolStrategy: "full"`, `delete_*` must not appear in `tools/list`.

## Mapping to today's API

```typescript
const toolkit = new CAPToolkit({
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  toolStrategy: 'minimal',
});

await toolkit.getCapabilityMap(); // tools/list + describe
const [describe, query] = await toolkit.getTools();
await query.invoke({ entity: 'Students', filter: { gpa: { lt: 2 } } });
```
