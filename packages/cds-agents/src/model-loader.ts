import type {
  CDSModel,
  CDSEntity,
  CDSActionDef,
  CDSServiceDef,
  LoadedCDSService,
} from './types';

/**
 * Loads and introspects a CDS model to extract a service's entities and actions.
 *
 * This function handles:
 * 1. Loading the CSN model via `cds.load()` (or accepting a pre-loaded model)
 * 2. Finding the target service by name
 * 3. Extracting all entities exposed by the service
 * 4. Extracting all unbound actions/functions at the service level
 *
 * @param options - Configuration for model loading.
 * @returns The parsed service with its entities and actions.
 * @throws Error if the service is not found in the model.
 */
export async function loadCDSModel(options: {
  cdsFile?: string;
  cdsModel?: CDSModel;
  serviceName: string;
}): Promise<LoadedCDSService> {
  let model: CDSModel;

  if (options.cdsModel) {
    model = options.cdsModel;
  } else {
    // Dynamic require to avoid hard compile-time dependency on @sap/cds.
    // At runtime the user must have @sap/cds installed (it's a peerDependency).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cds = require('@sap/cds');
    model = await cds.load(options.cdsFile || './');
  }

  // Find the service definition
  const serviceFullName = findServiceName(model, options.serviceName);
  if (!serviceFullName) {
    const availableServices = Object.keys(model.definitions)
      .filter((k) => (model.definitions[k] as CDSServiceDef).kind === 'service')
      .join(', ');
    throw new Error(
      `Service '${options.serviceName}' not found in CDS model. ` +
      `Available services: ${availableServices || '(none)'}`
    );
  }

  // Extract entities and unbound actions within this service
  const entities: Record<string, CDSEntity> = {};
  const unboundActions: Record<string, CDSActionDef> = {};
  const servicePrefix = `${serviceFullName}.`;

  for (const [defName, def] of Object.entries(model.definitions)) {
    // Only process definitions belonging to this service
    if (!defName.startsWith(servicePrefix)) continue;

    const shortName = defName.slice(servicePrefix.length);

    // Skip nested definitions (e.g., 'Service.Entity.texts') 
    if (shortName.includes('.')) continue;

    if (def.kind === 'entity') {
      entities[shortName] = def as CDSEntity;
    } else if (def.kind === 'action' || def.kind === 'function') {
      unboundActions[shortName] = def as CDSActionDef;
    }
  }

  return {
    model,
    serviceName: serviceFullName,
    entities,
    unboundActions,
  };
}

/**
 * Finds the fully-qualified service name in the CDS model.
 *
 * Supports both exact matches ('StudentService') and namespace-prefixed
 * names ('university.StudentService').
 */
function findServiceName(model: CDSModel, serviceName: string): string | undefined {
  // Exact match
  if (model.definitions[serviceName]?.kind === 'service') {
    return serviceName;
  }

  // Suffix match
  for (const defName of Object.keys(model.definitions)) {
    const def = model.definitions[defName];
    if (
      def.kind === 'service' &&
      (defName === serviceName || defName.endsWith(`.${serviceName}`))
    ) {
      return defName;
    }
  }

  return undefined;
}

/**
 * Extracts the key field names from a CDS entity definition.
 *
 * @param entity - The CDS entity definition.
 * @returns An array of key field names.
 */
export function getEntityKeys(entity: CDSEntity): string[] {
  const keys: string[] = [];
  for (const [fieldName, element] of Object.entries(entity.elements || {})) {
    if (element.key) {
      keys.push(fieldName);
    }
  }
  return keys;
}

/**
 * Gets a human-readable description of an entity's fields.
 * Used to generate meaningful tool descriptions for the LLM.
 *
 * @param entity - The CDS entity definition.
 * @returns A string listing the entity's fields and types.
 */
export function describeEntityFields(entity: CDSEntity): string {
  const fields: string[] = [];
  for (const [fieldName, element] of Object.entries(entity.elements || {})) {
    if (element.virtual || fieldName.startsWith('_')) continue;
    if (element.target) {
      fields.push(`${fieldName} (association)`);
    } else {
      const type = element.type.replace('cds.', '');
      const markers: string[] = [];
      if (element.key) markers.push('key');
      if (element['@mandatory']) markers.push('required');
      const suffix = markers.length > 0 ? ` [${markers.join(', ')}]` : '';
      fields.push(`${fieldName}: ${type}${suffix}`);
    }
  }
  return fields.join(', ');
}
