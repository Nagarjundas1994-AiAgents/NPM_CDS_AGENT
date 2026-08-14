import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { CDSEntity, CDSActionDef, CAPAgentConfig, ToolPolicy, ToolStrategy } from './types';
import { buildEntitySchema, buildActionSchema, buildBoundActionSchema } from './schema-mapper';
import { describeEntityFields } from './model-loader';
import { ODataExecutor } from './odata-executor';
import { buildCapabilityMap, resolveEntityNames, resolveEntityPolicy } from './capability';
import { toODataQueryParams } from './query-builder';
import type { QueryFilter } from './query-builder';

/**
 * Generates the 4 CRUD LangChain tools for a single CDS entity.
 *
 * Tools generated (subject to policy and the entity's own CDS annotations):
 * - `read_{Entity}` — Query records with OData filters
 * - `create_{Entity}` — Create a new record
 * - `update_{Entity}` — Update an existing record by key
 * - `delete_{Entity}` — Delete a record by key
 *
 * @param entityName - Short name of the entity (e.g. 'Students').
 * @param entity - The CDS entity definition.
 * @param executor - The OData HTTP executor instance.
 * @returns An array of LangChain StructuredTool instances.
 */
export function generateEntityTools(
  entityName: string,
  entity: CDSEntity,
  executor: ODataExecutor,
  policy: ToolPolicy = {}
): StructuredToolInterface[] {
  const fields = describeEntityFields(entity);
  const tools: StructuredToolInterface[] = [];
  const { read: allowRead, create: allowCreate, update: allowUpdate, delete: allowDelete } =
    resolveEntityPolicy(entity, policy);

  // ─── READ ─────────────────────────────────────────────────────────────────
  if (allowRead) {
    const readSchema = buildEntitySchema(entity, entityName, 'read');
    tools.push(
      tool(
        async (input) => {
          try {
            const queryParams: Record<string, string | number> = {};
            if (input.$filter) queryParams['$filter'] = input.$filter;
            if (input.$select) queryParams['$select'] = input.$select;
            if (input.$orderby) queryParams['$orderby'] = input.$orderby;
            if (input.$top !== undefined) queryParams['$top'] = input.$top;
            if (input.$skip !== undefined) queryParams['$skip'] = input.$skip;
            if (input.$expand) queryParams['$expand'] = input.$expand;

            const result = await executor.read(entityName, queryParams);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error reading ${entityName}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: `read_${entityName}`,
          description:
            `Query ${entityName} records from the database. ` +
            `Supports OData $filter, $top, $skip, $orderby, $select, and $expand query options. ` +
            `Available fields: ${fields}. ` +
            `Returns a JSON array of matching records.`,
          schema: readSchema,
        }
      )
    );
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────
  if (allowCreate) {
    const createSchema = buildEntitySchema(entity, entityName, 'create');
    tools.push(
      tool(
        async (input) => {
          try {
            const data: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(input)) {
              if (v !== undefined) data[k] = v;
            }
            const result = await executor.create(entityName, data);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error creating ${entityName}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: `create_${entityName}`,
          description:
            `Create a new ${entityName} record in the database. ` +
            `Available fields: ${fields}. ` +
            `Returns the created record with its auto-generated ID.`,
          schema: createSchema,
        }
      )
    );
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  if (allowUpdate) {
    const updateSchema = buildEntitySchema(entity, entityName, 'update');
    tools.push(
      tool(
        async (input) => {
          try {
            const { key, ...data } = input;
            const cleanData: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(data)) {
              if (v !== undefined) cleanData[k] = v;
            }
            const result = await executor.update(entityName, key as string, cleanData);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error updating ${entityName}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: `update_${entityName}`,
          description:
            `Update an existing ${entityName} record by its primary key. ` +
            `Only provide the fields you want to change (PATCH semantics). ` +
            `Available fields: ${fields}. ` +
            `Returns the updated record.`,
          schema: updateSchema,
        }
      )
    );
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────
  if (allowDelete) {
    const deleteSchema = z.object({
      key: z.string().describe(
        `The primary key value of the ${entityName} record to delete.`
      ),
    });
    tools.push(
      tool(
        async (input) => {
          try {
            const result = await executor.delete(entityName, input.key);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error deleting ${entityName}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: `delete_${entityName}`,
          description:
            `Delete a ${entityName} record by its primary key. ` +
            `This permanently removes the record from the database.`,
          schema: deleteSchema,
        }
      )
    );
  }

  return tools;
}

/**
 * Generates LangChain tools for unbound actions and functions at the service level.
 *
 * - Actions → POST /odata/v4/{Service}/{actionName}
 * - Functions → GET /odata/v4/{Service}/{functionName}(params)
 *
 * @param actions - Map of action/function names to their definitions.
 * @param executor - The OData HTTP executor instance.
 * @param serviceName - The fully-qualified service name (for bound action URLs).
 * @returns An array of LangChain StructuredTool instances.
 */
export function generateUnboundActionTools(
  actions: Record<string, CDSActionDef>,
  executor: ODataExecutor,
  serviceName: string
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [];

  for (const [actionName, action] of Object.entries(actions)) {
    const schema = buildActionSchema(action, actionName);
    const isFunction = action.kind === 'function';
    const shortServiceName = serviceName.split('.').pop() || serviceName;

    tools.push(
      tool(
        async (input) => {
          try {
            let result;
            if (isFunction) {
              result = await executor.callUnboundFunction(actionName, input);
            } else {
              result = await executor.callUnboundAction(actionName, input);
            }
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error executing ${actionName}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: `${isFunction ? 'function' : 'action'}_${actionName}`,
          description:
            `Execute the "${actionName}" ${action.kind} on the ${shortServiceName} service. ` +
            (action.params
              ? `Parameters: ${Object.entries(action.params)
                  .map(([k, v]) => `${k} (${v.type.replace('cds.', '')})`)
                  .join(', ')}.`
              : 'No parameters required.'),
          schema,
        }
      )
    );
  }

  return tools;
}

/**
 * Generates LangChain tools for bound actions/functions on an entity.
 *
 * - Bound Actions → POST /odata/v4/{Service}/{Entity}({key})/{Service}.{actionName}
 * - Bound Functions → GET /odata/v4/{Service}/{Entity}({key})/{Service}.{functionName}(params)
 *
 * @param entityName - The entity name.
 * @param entity - The CDS entity definition (which contains .actions).
 * @param executor - The OData HTTP executor instance.
 * @param serviceName - The fully-qualified service name.
 * @returns An array of LangChain StructuredTool instances.
 */
export function generateBoundActionTools(
  entityName: string,
  entity: CDSEntity,
  executor: ODataExecutor,
  serviceName: string
): StructuredToolInterface[] {
  if (!entity.actions) return [];

  const tools: StructuredToolInterface[] = [];
  const shortServiceName = serviceName.split('.').pop() || serviceName;

  for (const [actionName, action] of Object.entries(entity.actions)) {
    const schema = buildBoundActionSchema(action, actionName, entityName);
    const isFunction = action.kind === 'function';

    tools.push(
      tool(
        async (input) => {
          try {
            const { key, ...params } = input;
            let result;
            if (isFunction) {
              result = await executor.callBoundFunction(
                entityName,
                key as string,
                actionName,
                shortServiceName,
                params
              );
            } else {
              result = await executor.callBoundAction(
                entityName,
                key as string,
                actionName,
                shortServiceName,
                params
              );
            }
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error executing ${entityName}.${actionName}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: `${isFunction ? 'function' : 'action'}_${entityName}_${actionName}`,
          description:
            `Execute the "${actionName}" ${action.kind} on a specific ${entityName} instance. ` +
            `Requires the entity key to identify which ${entityName} record to act on. ` +
            (action.params
              ? `Additional parameters: ${Object.entries(action.params)
                  .map(([k, v]) => `${k} (${v.type.replace('cds.', '')})`)
                  .join(', ')}.`
              : 'No additional parameters beyond the key.'),
          schema,
        }
      )
    );
  }

  return tools;
}

export type ToolGeneratorConfig = Pick<
  CAPAgentConfig,
  'tools' | 'exclude' | 'toolStrategy' | 'allowCreate' | 'allowUpdate' | 'allowDelete'
>;

/**
 * Generates the compact `describe` + `query` tool pair for `toolStrategy: 'minimal'`.
 */
export function generateMinimalTools(
  entities: Record<string, CDSEntity>,
  unboundActions: Record<string, CDSActionDef>,
  executor: ODataExecutor,
  serviceName: string,
  entityNames: string[],
  config?: ToolGeneratorConfig
): StructuredToolInterface[] {
  const capabilityMap = buildCapabilityMap({
    serviceName,
    entities,
    unboundActions,
    entityNames,
    toolStrategy: 'minimal',
    allowCreate: config?.allowCreate,
    allowUpdate: config?.allowUpdate,
    allowDelete: config?.allowDelete,
  });

  // Only entities the policy actually permits reading are queryable.
  const readable = capabilityMap.entities.filter((e) => e.operations.includes('read'));
  const readableNames = readable.map((e) => e.name);

  const entityCatalog = readable
    .map((e) => `${e.name} (keys: ${e.keys.join(', ') || 'none'}; ${e.fields})`)
    .join('; ');

  const describeTool = tool(
    async (input: { entity?: string }) => {
      if (!input.entity) {
        return JSON.stringify(capabilityMap, null, 2);
      }
      const match = capabilityMap.entities.find(
        (e) => e.name.toLowerCase() === input.entity!.toLowerCase()
      );
      if (!match) {
        return JSON.stringify(
          {
            error: `Unknown entity "${input.entity}"`,
            available: capabilityMap.entities.map((e) => e.name),
          },
          null,
          2
        );
      }
      return JSON.stringify(match, null, 2);
    },
    {
      name: 'describe',
      description:
        `Describe the CAP service "${serviceName.split('.').pop() || serviceName}". ` +
        `Call with no arguments for the full capability map, or pass entity to inspect one entity. ` +
        `Known entities: ${entityNames.join(', ') || '(none)'}.`,
      schema: z.object({
        entity: z
          .string()
          .optional()
          .describe('Optional entity name to inspect. Omit to list the whole service.'),
      }),
    }
  );

  const queryTool = tool(
    async (input: {
      entity: string;
      filter?: QueryFilter;
      select?: string[];
      orderBy?: string[];
      top?: number;
      skip?: number;
      expand?: string;
    }) => {
      const entityName = readableNames.find(
        (name) => name.toLowerCase() === input.entity.toLowerCase()
      );
      if (!entityName) {
        return JSON.stringify(
          {
            type: 'ODataError',
            status: 400,
            entity: input.entity,
            operation: 'read',
            message: `Unknown or non-readable entity "${input.entity}". Available: ${readableNames.join(', ') || '(none)'}.`,
          },
          null,
          2
        );
      }

      try {
        const result = await executor.read(
          entityName,
          toODataQueryParams({
            filter: input.filter,
            select: input.select,
            orderBy: input.orderBy,
            top: input.top,
            skip: input.skip,
            expand: input.expand,
          })
        );
        return JSON.stringify(result, null, 2);
      } catch (error) {
        return `Error querying ${entityName}: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'query',
      description:
        `Query CAP entities with a structured filter. ` +
        `Prefer { field: { lt: 2.0 } } over raw OData. ` +
        `Entities: ${entityCatalog || '(none)'}.`,
      schema: z.object({
        entity: z.string().describe('Entity to query, e.g. Students'),
        filter: z
          .union([
            z.string().describe('Raw OData $filter, e.g. "gpa lt 2.0"'),
            z
              .record(z.unknown())
              .describe('Structured filter, e.g. { gpa: { lt: 2.0 }, status: "active" }'),
          ])
          .optional()
          .describe('Filter as a structured object or raw OData $filter string'),
        select: z.array(z.string()).optional().describe('Fields to return'),
        orderBy: z.array(z.string()).optional().describe('Order clauses, e.g. ["gpa desc"]'),
        top: z.number().int().optional().describe('Max records to return'),
        skip: z.number().int().optional().describe('Records to skip'),
        expand: z.string().optional().describe('OData $expand navigation'),
      }),
    }
  );

  return [describeTool, queryTool];
}

/**
 * Generates LangChain tools from a loaded CDS service.
 *
 * Surface is controlled by `toolStrategy`:
 * - `minimal` — describe + query
 * - `crud`    — per-entity CRUD (honours allowCreate/Update/Delete)
 * - `actions` — bound + unbound actions/functions
 * - `full`    — CRUD + actions (default)
 */
export function generateAllTools(
  entities: Record<string, CDSEntity>,
  unboundActions: Record<string, CDSActionDef>,
  executor: ODataExecutor,
  serviceName: string,
  config?: ToolGeneratorConfig
): StructuredToolInterface[] {
  const strategy: ToolStrategy = config?.toolStrategy ?? 'full';
  const entityNames = resolveEntityNames(entities, config?.tools, config?.exclude);
  const policy: ToolPolicy = {
    allowCreate: config?.allowCreate,
    allowUpdate: config?.allowUpdate,
    allowDelete: config?.allowDelete,
  };

  if (strategy === 'minimal') {
    return generateMinimalTools(
      entities,
      unboundActions,
      executor,
      serviceName,
      entityNames,
      config
    );
  }

  const allTools: StructuredToolInterface[] = [];
  const includeCrud = strategy === 'crud' || strategy === 'full';
  const includeActions = strategy === 'actions' || strategy === 'full';

  for (const entityName of entityNames) {
    const entity = entities[entityName];
    if (includeCrud) {
      allTools.push(...generateEntityTools(entityName, entity, executor, policy));
    }
    if (includeActions) {
      allTools.push(
        ...generateBoundActionTools(entityName, entity, executor, serviceName)
      );
    }
  }

  if (includeActions) {
    allTools.push(
      ...generateUnboundActionTools(unboundActions, executor, serviceName)
    );
  }

  return allTools;
}
