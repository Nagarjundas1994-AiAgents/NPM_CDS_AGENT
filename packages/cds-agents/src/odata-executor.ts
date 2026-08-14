import type { AuthConfig, EntityPolicy, OperationPolicyMap } from './types';
import { formatODataLiteral } from './query-builder';

/** Operations the policy map governs. Actions/functions are governed by the CDS model itself. */
const GOVERNED_OPERATIONS = ['read', 'create', 'update', 'delete'] as const;
type GovernedOperation = (typeof GOVERNED_OPERATIONS)[number];

export interface ODataErrorObject {
  type: 'ODataError';
  status: number;
  service: string;
  entity?: string;
  operation?: string;
  message: string;
  details?: unknown;
}

export interface ODataExecuteContext {
  entity?: string;
  operation?: string;
}

/**
 * OData v4 HTTP Execution Layer.
 *
 * Handles all HTTP communication with a running CAP service:
 * - CRUD operations (GET, POST, PATCH, DELETE)
 * - Custom action/function invocations
 * - Authentication (Basic, Bearer, or none)
 * - Dry-run mode for debugging
 * - Timeouts and structured error objects
 * - Policy enforcement — denied operations never reach the network
 *
 * Uses native `fetch` (Node 18+) — no external HTTP dependencies.
 */
export class ODataExecutor {
  private readonly baseUrl: string;
  private readonly servicePath: string;
  private readonly auth: AuthConfig;
  private readonly dryRun: boolean;
  private readonly timeoutMs: number;
  private readonly policy?: OperationPolicyMap;

  constructor(config: {
    baseUrl: string;
    servicePath: string;
    auth?: AuthConfig;
    dryRun?: boolean;
    timeoutMs?: number;
    /**
     * Effective per-entity permissions. When supplied, CRUD calls for entities
     * that are absent or not permitted are refused before any HTTP request.
     * Omit to leave the executor ungoverned.
     */
    policy?: OperationPolicyMap;
  }) {
    // Normalize: strip trailing slashes
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.servicePath = config.servicePath.replace(/^\/+|\/+$/g, '');
    this.auth = config.auth || { type: 'none' };
    this.dryRun = config.dryRun || false;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.policy = config.policy;
  }

  /**
   * Returns a 403 error object if the configured policy forbids this call.
   *
   * This is the enforcement point, not tool generation: withholding a tool only
   * hides an operation from the model, it does not prevent anyone holding this
   * executor from performing it.
   */
  private denyReason(context?: ODataExecuteContext): ODataErrorObject | undefined {
    if (!this.policy) return undefined;

    const operation = context?.operation;
    if (!operation || !GOVERNED_OPERATIONS.includes(operation as GovernedOperation)) {
      return undefined;
    }

    const entity = context?.entity;
    const permissions: EntityPolicy | undefined = entity ? this.policy[entity] : undefined;
    if (permissions?.[operation as GovernedOperation]) return undefined;

    return this.buildError(
      403,
      permissions
        ? `Operation "${operation}" is not permitted on ${entity} by the configured capability policy.`
        : `Entity "${entity}" is not exposed by the configured capability policy.`,
      context
    );
  }

  /**
   * The full URL prefix for OData requests.
   * e.g., 'http://localhost:4004/odata/v4/StudentService'
   */
  private get odataRoot(): string {
    return `${this.baseUrl}/odata/v4/${this.servicePath}`;
  }

  /**
   * Builds the auth headers based on the configured auth type.
   */
  private getAuthHeaders(): Record<string, string> {
    switch (this.auth.type) {
      case 'basic': {
        const encoded = Buffer.from(`${this.auth.user}:${this.auth.pass}`).toString('base64');
        return { Authorization: `Basic ${encoded}` };
      }
      case 'bearer':
        return { Authorization: `Bearer ${this.auth.token}` };
      case 'none':
      default:
        return {};
    }
  }

  /**
   * Executes an HTTP request against the OData service.
   * In dryRun mode, logs the request and returns a mock response.
   */
  private async execute(
    method: string,
    url: string,
    body?: Record<string, unknown>,
    context?: ODataExecuteContext
  ): Promise<unknown> {
    const denied = this.denyReason(context);
    if (denied) return denied;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.getAuthHeaders(),
    };

    if (this.dryRun) {
      const logEntry = {
        dryRun: true,
        method,
        url,
        headers: { ...headers, Authorization: headers.Authorization ? '***' : undefined },
        body: body || null,
      };
      console.log('[cds-agents DRY RUN]', JSON.stringify(logEntry, null, 2));
      return {
        '@odata.context': '$metadata',
        value: [],
        _dryRun: true,
        _method: method,
        _url: url,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 204 No Content (successful DELETE)
      if (response.status === 204) {
        return { success: true, status: 204 };
      }

      const responseBody = await response.text();

      if (!response.ok) {
        return this.parseODataError(response.status, responseBody, context);
      }

      try {
        return JSON.parse(responseBody);
      } catch {
        return { rawResponse: responseBody, status: response.status };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.buildError(
          408,
          `Request timed out after ${this.timeoutMs}ms`,
          context
        );
      }
      return this.buildError(
        0,
        error instanceof Error ? error.message : String(error),
        context
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parses an OData error response into a structured object the LLM can act on.
   */
  private parseODataError(
    status: number,
    body: string,
    context?: ODataExecuteContext
  ): ODataErrorObject {
    try {
      const parsed = JSON.parse(body);
      const error = parsed?.error;
      if (error) {
        const message = error.message?.value || error.message || 'Unknown error';
        return this.buildError(status, String(message), context, parsed);
      }
    } catch {
      // Fall through to raw body
    }
    return this.buildError(status, body.slice(0, 500) || `HTTP ${status}`, context);
  }

  private buildError(
    status: number,
    message: string,
    context?: ODataExecuteContext,
    details?: unknown
  ): ODataErrorObject {
    return {
      type: 'ODataError',
      status,
      service: this.servicePath,
      entity: context?.entity,
      operation: context?.operation,
      message,
      details,
    };
  }

  // ─── CRUD Operations ──────────────────────────────────────────────────────

  /**
   * READ — GET /odata/v4/{Service}/{Entity}?$filter=...&$top=...
   */
  async read(
    entity: string,
    queryParams?: Record<string, string | number>
  ): Promise<unknown> {
    let url = `${this.odataRoot}/${entity}`;

    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    return this.execute('GET', url, undefined, { entity, operation: 'read' });
  }

  /**
   * CREATE — POST /odata/v4/{Service}/{Entity}
   */
  async create(
    entity: string,
    data: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.odataRoot}/${entity}`;
    return this.execute('POST', url, data, { entity, operation: 'create' });
  }

  /**
   * UPDATE — PATCH /odata/v4/{Service}/{Entity}({key})
   */
  async update(
    entity: string,
    key: string,
    data: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.odataRoot}/${entity}(${this.formatKey(key)})`;
    return this.execute('PATCH', url, data, { entity, operation: 'update' });
  }

  /**
   * DELETE — DELETE /odata/v4/{Service}/{Entity}({key})
   */
  async delete(entity: string, key: string): Promise<unknown> {
    const url = `${this.odataRoot}/${entity}(${this.formatKey(key)})`;
    return this.execute('DELETE', url, undefined, { entity, operation: 'delete' });
  }

  // ─── Action / Function Invocations ────────────────────────────────────────

  /**
   * Call an unbound action — POST /odata/v4/{Service}/{actionName}
   */
  async callUnboundAction(
    actionName: string,
    data?: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.odataRoot}/${actionName}`;
    return this.execute('POST', url, data || {}, { operation: 'action' });
  }

  /**
   * Call an unbound function — GET /odata/v4/{Service}/{functionName}(params)
   */
  async callUnboundFunction(
    functionName: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    let url = `${this.odataRoot}/${functionName}`;

    if (params && Object.keys(params).length > 0) {
      const paramParts = Object.entries(params).map(
        ([k, v]) => `${k}=${this.formatODataValue(v)}`
      );
      url += `(${paramParts.join(',')})`;
    } else {
      url += '()';
    }

    return this.execute('GET', url, undefined, { operation: 'function' });
  }

  /**
   * Call a bound action — POST /odata/v4/{Service}/{Entity}({key})/{Service}.{actionName}
   */
  async callBoundAction(
    entity: string,
    key: string,
    actionName: string,
    serviceName: string,
    data?: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.odataRoot}/${entity}(${this.formatKey(key)})/${serviceName}.${actionName}`;
    return this.execute('POST', url, data || {}, { entity, operation: 'action' });
  }

  /**
   * Call a bound function — GET /odata/v4/{Service}/{Entity}({key})/{Service}.{functionName}(params)
   */
  async callBoundFunction(
    entity: string,
    key: string,
    functionName: string,
    serviceName: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    let paramStr = '';
    if (params && Object.keys(params).length > 0) {
      const paramParts = Object.entries(params).map(
        ([k, v]) => `${k}=${this.formatODataValue(v)}`
      );
      paramStr = `(${paramParts.join(',')})`;
    } else {
      paramStr = '()';
    }

    const url = `${this.odataRoot}/${entity}(${this.formatKey(key)})/${serviceName}.${functionName}${paramStr}`;
    return this.execute('GET', url, undefined, { entity, operation: 'function' });
  }

  // ─── Formatting Helpers ───────────────────────────────────────────────────

  /**
   * Formats a key value for OData URL.
   * - UUID: bare value (OData v4 doesn't use guid'...')
   * - Composite: key1=val1,key2=val2 → already formatted
   * - Numeric: bare number
   * - String: 'quoted'
   */
  private formatKey(key: string): string {
    // Already formatted as composite key (contains '=')
    if (key.includes('=')) return key;

    // UUID pattern — use bare value
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(key)) return key;

    // Numeric — bare value
    if (/^\d+$/.test(key)) return key;

    // String — quote it, escaping any embedded quotes
    return formatODataLiteral(key);
  }

  /**
   * Formats a value for OData function parameters.
   */
  private formatODataValue(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return formatODataLiteral(value);
    }
    if (value === undefined) return 'null';
    return formatODataLiteral(String(value));
  }
}
