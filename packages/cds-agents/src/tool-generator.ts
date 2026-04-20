import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { CDSEntity, CDSActionDef, CAPAgentConfig } from './types';
import { buildEntitySchema, buildActionSchema, buildBoundActionSchema } from './schema-mapper';
import { getEntityKeys, describeEntityFields } from './model-loader';
import { ODataExecutor } from './odata-executor';

/**
 * Generates the 4 CRUD LangChain tools for a single CDS entity.
 *
 * Tools generated:
 * - `read_{Entity}` — Query records with OData filters
 * - `create_{Entity}` — Create a new record
 * - `update_{Entity}` — Update an existing record by key
 * - `delete_{Entity}` — Delete a record by key
 *
 * @param entityName - Short name of the entity (e.g. 'Students').
 * @param entity - The CDS entity definition.
 * @param executor - The OData HTTP executor instance.
 * @returns An array of 4 LangChain StructuredTool instances.
 */
export function generateEntityTools(
  entityName: string,
  entity: CDSEntity,
  executor: ODataExecutor
): StructuredToolInterface[] {
  const fields = describeEntityFields(entity);
  const tools: StructuredToolInterface[] = [];

  // ─── READ ─────────────────────────────────────────────────────────────────
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

  // ─── CREATE ───────────────────────────────────────────────────────────────
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

  // ─── UPDATE ───────────────────────────────────────────────────────────────
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

  // ─── DELETE ───────────────────────────────────────────────────────────────
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

/**
 * Generates ALL LangChain tools from a loaded CDS service.
 *
 * This is the main entry point for tool generation. It:
 * 1. Generates 4 CRUD tools per entity
 * 2. Generates 1 tool per bound action/function on each entity
 * 3. Generates 1 tool per unbound action/function on the service
 * 4. Filters entities based on config.tools and config.exclude
 *
 * @param entities - Map of entity names to their definitions.
 * @param unboundActions - Map of unbound action/function names to definitions.
 * @param executor - The OData HTTP executor instance.
 * @param serviceName - The fully-qualified service name.
 * @param config - Agent configuration (for filtering).
 * @returns An array of all generated LangChain tools.
 */
export function generateAllTools(
  entities: Record<string, CDSEntity>,
  unboundActions: Record<string, CDSActionDef>,
  executor: ODataExecutor,
  serviceName: string,
  config?: Pick<CAPAgentConfig, 'tools' | 'exclude'>
): StructuredToolInterface[] {
  const allTools: StructuredToolInterface[] = [];

  // Determine which entities to include
  let entityNames = Object.keys(entities);

  if (config?.tools && config.tools !== 'auto') {
    entityNames = entityNames.filter((name) => config.tools!.includes(name));
  }

  if (config?.exclude) {
    entityNames = entityNames.filter((name) => !config.exclude!.includes(name));
  }

  // Generate entity CRUD tools + bound action tools
  for (const entityName of entityNames) {
    const entity = entities[entityName];

    // 4 CRUD tools
    allTools.push(...generateEntityTools(entityName, entity, executor));

    // Bound action/function tools
    allTools.push(
      ...generateBoundActionTools(entityName, entity, executor, serviceName)
    );
  }

  // Generate unbound action/function tools
  allTools.push(
    ...generateUnboundActionTools(unboundActions, executor, serviceName)
  );

  return allTools;
}
