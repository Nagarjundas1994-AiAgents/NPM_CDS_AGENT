# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | Yes |

## Reporting a vulnerability

Do **not** open a public GitHub issue for security problems.

Email the maintainer via the address on [npm: cds-agents](https://www.npmjs.com/package/cds-agents) or open a [private GitHub security advisory](https://github.com/Nagarjundas1994-AiAgents/cds-agents/security/advisories/new).

Please include:

- Affected package version
- Reproduction steps
- Impact (data exposure, privilege escalation, SSRF against the CAP host, etc.)

You should receive an acknowledgement within 7 days.

## What this package does with credentials

`cds-agents` forwards authentication material you supply to a CAP OData endpoint:

- `auth.type: 'basic'` — sent as an `Authorization: Basic` header
- `auth.type: 'bearer'` — sent as an `Authorization: Bearer` header
- `auth.type: 'none'` — no credentials

The library does not store tokens. Callers are responsible for obtaining and rotating XSUAA / IAS / JWT credentials. Prefer `bearer` over embedding Basic auth in long-lived agent processes.

## Safe defaults for agents

- Use `toolStrategy: 'minimal'` so the model cannot see a large write surface by default.
- Set `allowDelete: false` unless a human approval path exists.
- Use `dryRun: true` while evaluating prompts that mutate data.
- Scope entities with `tools` / `exclude`.
- Point `baseUrl` only at CAP services you trust; the executor will call whatever URL you configure.
