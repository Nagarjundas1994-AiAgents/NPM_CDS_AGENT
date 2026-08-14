import type {
  CDSActionDef,
  CDSEntity,
  EntityPolicy,
  OperationPolicyMap,
  ToolPolicy,
  ToolStrategy,
} from './types';
import { describeEntityFields, getEntityKeys } from './model-loader';

export type CapabilityOperation = 'read' | 'create' | 'update' | 'delete' | 'action' | 'function';

export interface ActionCapability {
  name: string;
  kind: 'action' | 'function';
  params: string[];
}

export interface EntityCapability {
  name: string;
  keys: string[];
  fields: string;
  operations: CapabilityOperation[];
  actions: ActionCapability[];
}

export interface ServiceCapabilityMap {
  service: string;
  strategy: ToolStrategy;
  entities: EntityCapability[];
  unbound: ActionCapability[];
}

export interface CapabilityBuildOptions extends ToolPolicy {
  serviceName: string;
  entities: Record<string, CDSEntity>;
  unboundActions: Record<string, CDSActionDef>;
  entityNames: string[];
  toolStrategy?: ToolStrategy;
}

function actionCapability(name: string, action: CDSActionDef): ActionCapability {
  return {
    name,
    kind: action.kind,
    params: action.params ? Object.keys(action.params) : [],
  };
}

/** True unless the entity carries `@Capabilities.<X>Restrictions.<Flag>: false` (or the shorthand). */
function capabilityAllows(
  entity: CDSEntity | undefined,
  restriction: string,
  flag: string
): boolean {
  return (
    entity?.[`@Capabilities.${restriction}Restrictions.${flag}`] !== false &&
    entity?.[`@Capabilities.${flag}`] !== false
  );
}

/**
 * Resolves the effective permissions for an entity.
 *
 * The CDS model wins: a `@readonly` projection stays read-only no matter what
 * `allowUpdate` says. Config can only take permissions away, never add them.
 *
 * Honours `@readonly`, `@insertonly`, and the OData `@Capabilities.*` vocabulary.
 */
export function resolveEntityPolicy(
  entity: CDSEntity | undefined,
  policy: ToolPolicy = {}
): EntityPolicy {
  const readonly = entity?.['@readonly'] === true;
  const insertonly = entity?.['@insertonly'] === true;
  const writable = !readonly && !insertonly;

  return {
    read: !insertonly && capabilityAllows(entity, 'Read', 'Readable'),
    create:
      !readonly &&
      policy.allowCreate !== false &&
      capabilityAllows(entity, 'Insert', 'Insertable'),
    update:
      writable &&
      policy.allowUpdate !== false &&
      capabilityAllows(entity, 'Update', 'Updatable'),
    delete:
      writable &&
      policy.allowDelete !== false &&
      capabilityAllows(entity, 'Delete', 'Deletable'),
  };
}

function operationsFor(strategy: ToolStrategy, policy: EntityPolicy): CapabilityOperation[] {
  if (strategy === 'actions') return [];

  const ops: CapabilityOperation[] = [];
  if (policy.read) ops.push('read');
  if (strategy === 'minimal') return ops;

  if (policy.create) ops.push('create');
  if (policy.update) ops.push('update');
  if (policy.delete) ops.push('delete');
  return ops;
}

/**
 * Derives the runtime enforcement map from a capability map.
 *
 * Both come from the same object, so what a service advertises and what its
 * executor permits cannot drift apart.
 */
export function toOperationPolicy(map: ServiceCapabilityMap): OperationPolicyMap {
  const policy: OperationPolicyMap = {};
  for (const entity of map.entities) {
    policy[entity.name] = {
      read: entity.operations.includes('read'),
      create: entity.operations.includes('create'),
      update: entity.operations.includes('update'),
      delete: entity.operations.includes('delete'),
    };
  }
  return policy;
}

/**
 * Builds a protocol-agnostic capability map from a loaded CDS service.
 *
 * LangChain, MCP, and other adapters should consume this map rather than
 * walking the CSN model themselves.
 */
export function buildCapabilityMap(options: CapabilityBuildOptions): ServiceCapabilityMap {
  const strategy = options.toolStrategy ?? 'full';
  const includeBound = strategy === 'full' || strategy === 'actions';
  const includeUnbound = strategy !== 'crud';

  const entities: EntityCapability[] = options.entityNames.map((name) => {
    const entity = options.entities[name];
    const actions = includeBound && entity.actions
      ? Object.entries(entity.actions).map(([actionName, action]) =>
          actionCapability(actionName, action)
        )
      : [];

    return {
      name,
      keys: getEntityKeys(entity),
      fields: describeEntityFields(entity),
      operations: operationsFor(strategy, resolveEntityPolicy(entity, options)),
      actions,
    };
  });

  const unbound = includeUnbound
    ? Object.entries(options.unboundActions).map(([name, action]) =>
        actionCapability(name, action)
      )
    : [];

  return {
    service: options.serviceName,
    strategy,
    entities,
    unbound,
  };
}

/**
 * Resolves the entity list after `tools` / `exclude` filters.
 */
export function resolveEntityNames(
  entities: Record<string, CDSEntity>,
  tools?: 'auto' | string[],
  exclude?: string[]
): string[] {
  let names = Object.keys(entities);

  if (tools && tools !== 'auto') {
    names = names.filter((name) => tools.includes(name));
  }
  if (exclude?.length) {
    names = names.filter((name) => !exclude.includes(name));
  }

  return names;
}
