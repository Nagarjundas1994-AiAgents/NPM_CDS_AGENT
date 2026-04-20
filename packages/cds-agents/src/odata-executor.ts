import type { AuthConfig } from './types';

/**
 * OData v4 HTTP Execution Layer.
 *
 * Handles all HTTP communication with a running CAP service:
 * - CRUD operations (GET, POST, PATCH, DELETE)
 * - Custom action/function invocations
 * - Authentication (Basic, Bearer, or none)
 * - Dry-run mode for debugging
 *
 * Uses native `fetch` (Node 18+) — no external HTTP dependencies.
 */
export class ODataExecutor {
  private readonly baseUrl: string;
  private readonly servicePath: string;
  private readonly auth: AuthConfig;
  private readonly dryRun: boolean;

  constructor(config: {
    baseUrl: string;
    servicePath: string;
    auth?: AuthConfig;
    dryRun?: boolean;
  }) {
    // Normalize: strip trailing slashes
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.servicePath = config.servicePath.replace(/^\/+|\/+$/g, '');
    this.auth = config.auth || { type: 'none' };
    this.dryRun = config.dryRun || false;
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
    body?: Record<string, unknown>
  ): Promise<unknown> {
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

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle 204 No Content (successful DELETE)
    if (response.status === 204) {
      return { success: true, status: 204 };
    }

    const responseBody = await response.text();

    if (!response.ok) {
      return this.parseODataError(response.status, responseBody);
    }

    try {
      return JSON.parse(responseBody);
    } catch {
      return { rawResponse: responseBody, status: response.status };
    }
  }

  /**
   * Parses an OData error response into a readable string.
   */
  private parseODataError(status: number, body: string): string {
    try {
      const parsed = JSON.parse(body);
      const error = parsed?.error;
      if (error) {
        const message = error.message?.value || error.message || 'Unknown error';
        const code = error.code || status;
        return `OData Error ${code}: ${message}`;
      }
    } catch {
      // Fall through to raw body
    }
    return `HTTP Error ${status}: ${body.slice(0, 500)}`;
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

    return this.execute('GET', url);
  }

  /**
   * CREATE — POST /odata/v4/{Service}/{Entity}
   */
  async create(
    entity: string,
    data: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.odataRoot}/${entity}`;
    return this.execute('POST', url, data);
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
    return this.execute('PATCH', url, data);
  }

  /**
   * DELETE — DELETE /odata/v4/{Service}/{Entity}({key})
   */
  async delete(entity: string, key: string): Promise<unknown> {
    const url = `${this.odataRoot}/${entity}(${this.formatKey(key)})`;
    return this.execute('DELETE', url);
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
    return this.execute('POST', url, data || {});
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

    return this.execute('GET', url);
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
    return this.execute('POST', url, data || {});
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
    return this.execute('GET', url);
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

    // String — quote it
    return `'${key}'`;
  }

  /**
   * Formats a value for OData function parameters.
   */
  private formatODataValue(value: unknown): string {
    if (typeof value === 'string') return `'${value}'`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return 'null';
    return `'${String(value)}'`;
  }
}
