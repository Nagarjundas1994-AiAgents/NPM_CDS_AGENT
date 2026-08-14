# MCP protocol notes (planned)

These payloads are the target contract for `@cds-agents/mcp`. They are not served by the current npm package.

Transport: JSON-RPC 2.0 over stdio (Inspector / OpenCode) or Streamable HTTP later.

## initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "mcp-inspector", "version": "0.16.0" }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "cds-agents", "version": "1.1.0" }
  }
}
```

## tools/list

Default (`toolStrategy: "minimal"`):

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "describe",
        "description": "Describe the CAP service capability map, or one entity.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "entity": { "type": "string", "description": "Optional entity name" }
          }
        }
      },
      {
        "name": "query",
        "description": "Query a CAP entity with a structured filter.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "entity": { "type": "string" },
            "filter": { "description": "Structured filter or raw OData $filter" },
            "select": { "type": "array", "items": { "type": "string" } },
            "orderBy": { "type": "array", "items": { "type": "string" } },
            "top": { "type": "integer" },
            "skip": { "type": "integer" }
          },
          "required": ["entity"]
        }
      }
    ]
  }
}
```

## tools/call — describe

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": { "name": "describe", "arguments": {} }
}
```

The result text is `CAPToolkit.getCapabilityMap()` JSON.

## tools/call — query

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": {
      "entity": "Students",
      "filter": { "gpa": { "lt": 2.0 } },
      "top": 10
    }
  }
}
```

Invalid tool names and invalid entities should return `isError: true` with a structured `ODataError` payload, not a thrown transport error.

## Authorization

MCP does not replace CAP authorization. The server must forward the configured `auth` (bearer preferred) and honour `allowCreate` / `allowUpdate` / `allowDelete`. A future policy of `update: "approval"` will require a human-in-the-loop elicitation, not a silent write.
