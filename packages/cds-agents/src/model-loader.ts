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
    // '*' is CAP's "whole project model". './' throws MODEL_NOT_FOUND.
    model = await cds.load(options.cdsFile || '*');
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
    urlPath: cdsServicePath(
      serviceFullName,
      model.definitions[serviceFullName] as { '@path'?: unknown }
    ),
    entities,
    unboundActions,
  };
}

/**
 * Derives the HTTP path CAP serves a service at.
 *
 * CAP does *not* mount a service under its CDS name — `StudentService` is served
 * at `/odata/v4/student`, so building URLs from the service name 404s.
 *
 * Verified against `cds compile --to serviceinfo`:
 * | `StudentService`             | `odata/v4/student`              |
 * | `MyBigAdminService`          | `odata/v4/my-big-admin`         |
 * | `HRService` / `HRAdminService` | `odata/v4/hr` / `odata/v4/hradmin` |
 * | `API_BUSINESS_PARTNERService`| `odata/v4/api-business-partner` |
 * | `@path: '/custom-route'`     | `custom-route` (no odata/v4 prefix) |
 *
 * @param serviceName - Fully-qualified service name; the namespace is ignored.
 * @param serviceDef - The service definition, read for an `@path` annotation.
 */
export function cdsServicePath(
  serviceName: string,
  serviceDef?: { '@path'?: unknown }
): string {
  // An explicit @path replaces the whole path, protocol prefix included.
  const annotated = serviceDef?.['@path'];
  if (typeof annotated === 'string' && annotated) {
    return annotated.replace(/^\/+|\/+$/g, '');
  }

  const local = serviceName.split('.').pop() || serviceName;
  // Only strip the suffix when something is left over.
  const base = local.length > 'Service'.length && local.endsWith('Service')
    ? local.slice(0, -'Service'.length)
    : local;

  const kebab = base
    .replace(/_/g, '-')
    // Split only at lower/digit → upper. CAP leaves acronym runs intact:
    // HRAdmin stays "hradmin", while SalesOrder becomes "sales-order".
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

  return `odata/v4/${kebab}`;
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
