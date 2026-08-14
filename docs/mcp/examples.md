# MCP examples (planned)

Prompts you should be able to run once the MCP server exists, against `demo-app`.

## Find students below a GPA

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "query",
    "arguments": {
      "entity": "Students",
      "filter": { "gpa": { "lt": 2.0 } },
      "select": ["ID", "firstName", "lastName", "gpa", "status"],
      "orderBy": ["gpa asc"]
    }
  }
}
```

Equivalent raw OData:

```json
{
  "name": "query",
  "arguments": {
    "entity": "Students",
    "filter": "gpa lt 2.0",
    "select": ["ID", "firstName", "gpa"]
  }
}
```

## Inspect the service first

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "describe",
    "arguments": { "entity": "Courses" }
  }
}
```

Expected shape:

```json
{
  "name": "Courses",
  "keys": ["ID"],
  "fields": "ID: UUID [key], name: String [required], code: String [required], ...",
  "operations": ["read"],
  "actions": []
}
```

## Natural-language prompts for OpenCode / Claude

> Find all books by Edgar Allan Poe.

> Show the three most recent enrollments.

> Which students have GPA below 2.0?

> Enroll Alice Johnson in Database Systems for Spring 2024.

The last prompt needs `execute_action` (or `toolStrategy: "actions"` / `"full"`). Minimal mode is read-only by design.

## Error the client should understand

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
