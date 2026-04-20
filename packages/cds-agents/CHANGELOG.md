# Changelog

All notable changes to `cds-agents` will be documented in this file.

## [1.0.0] - 2026-04-20

### Added
- **CDS → Tool Generation Engine**: Auto-generates LangChain tools from CDS service definitions.
- **Schema Mapper**: Maps all CDS primitive types to Zod schemas with LLM-friendly `.describe()` annotations.
- **OData Executor**: HTTP execution layer for CRUD operations and custom actions/functions.
- **CAPAgent**: High-level agent class wrapping LangGraph's `createReactAgent`.
- **CAPToolkit**: Standalone toolkit export for custom LangGraph graphs.
- **Multi-provider support**: OpenAI, Anthropic, and Google Gemini via dynamic imports.
- **Advanced features**: Entity scoping (`tools`/`exclude`), `dryRun` mode, streaming support.
- **Demo app**: University-themed CAP application with CLI chat interface.
