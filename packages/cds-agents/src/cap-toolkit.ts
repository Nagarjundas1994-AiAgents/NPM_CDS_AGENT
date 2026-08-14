import type { StructuredToolInterface } from '@langchain/core/tools';
import type { CAPAgentConfig } from './types';
import { loadCDSModel } from './model-loader';
import { ODataExecutor } from './odata-executor';
import { generateAllTools } from './tool-generator';
import { buildCapabilityMap, resolveEntityNames, toOperationPolicy } from './capability';
import type { ServiceCapabilityMap } from './capability';

/**
 * CAPToolkit — Generates LangChain tools from a CDS service without creating a full agent.
 *
 * Use this when you want:
 * - Raw tools for a custom LangGraph graph
 * - To combine CDS tools with other tool sources
 * - Full control over agent construction
 *
 * @example
 * ```typescript
 * import { CAPToolkit } from 'cds-agents';
 * import { createReactAgent } from '@langchain/langgraph/prebuilt';
 * import { ChatOpenAI } from '@langchain/openai';
 *
 * const toolkit = new CAPToolkit({
 *   service: 'StudentService',
 *   baseUrl: 'http://localhost:4004',
 *   tools: 'auto',
 * });
 *
 * const cdsTools = await toolkit.getTools();
 * const myCustomTools = [...cdsTools, myOtherTool];
 *
 * const agent = createReactAgent({
 *   llm: new ChatOpenAI({ model: 'gpt-4o' }),
 *   tools: myCustomTools,
 * });
 * ```
 */
export class CAPToolkit {
  private readonly config: Omit<CAPAgentConfig, 'model'>;
  private tools: StructuredToolInterface[] | null = null;
  private capabilityMap: ServiceCapabilityMap | null = null;
  private executor: ODataExecutor | null = null;

  constructor(config: Omit<CAPAgentConfig, 'model'>) {
    this.config = {
      tools: 'auto',
      auth: { type: 'none' },
      dryRun: false,
      toolStrategy: 'full',
      ...config,
    };
  }

  /**
   * Returns the auto-generated LangChain tools for the configured CDS service.
   *
   * The result is cached after the first call. Subsequent calls return the same tools.
   *
   * @returns An array of LangChain StructuredTool instances.
   */
  async getTools(): Promise<StructuredToolInterface[]> {
    if (this.tools) return [...this.tools];

    // Load and introspect the CDS model
    const loaded = await loadCDSModel({
      cdsFile: this.config.cdsFile,
      cdsModel: this.config.cdsModel,
      serviceName: this.config.service,
    });

    this.capabilityMap = this.toCapabilityMap(loaded);

    // Create the OData executor, governed by the same capability map the
    // tools are generated from — advertised and permitted cannot drift.
    const executor = (this.executor = new ODataExecutor({
      baseUrl: this.config.baseUrl,
      servicePath: loaded.serviceName,
      urlPath: this.config.odataPath ?? loaded.urlPath,
      auth: this.config.auth,
      dryRun: this.config.dryRun,
      timeoutMs: this.config.timeoutMs,
      policy: toOperationPolicy(this.capabilityMap),
    }));

    this.tools = generateAllTools(
      loaded.entities,
      loaded.unboundActions,
      executor,
      loaded.serviceName,
      {
        tools: this.config.tools,
        exclude: this.config.exclude,
        toolStrategy: this.config.toolStrategy,
        allowCreate: this.config.allowCreate,
        allowUpdate: this.config.allowUpdate,
        allowDelete: this.config.allowDelete,
      }
    );

    return [...this.tools];
  }

  /**
   * Returns the protocol-agnostic capability map for this service.
   * Useful for inspect UIs, MCP adapters, and policy reviews.
   */
  async getCapabilityMap(): Promise<ServiceCapabilityMap> {
    if (this.capabilityMap) return this.capabilityMap;

    const loaded = await loadCDSModel({
      cdsFile: this.config.cdsFile,
      cdsModel: this.config.cdsModel,
      serviceName: this.config.service,
    });

    this.capabilityMap = this.toCapabilityMap(loaded);
    return this.capabilityMap;
  }

  private toCapabilityMap(
    loaded: Awaited<ReturnType<typeof loadCDSModel>>
  ): ServiceCapabilityMap {
    return buildCapabilityMap({
      serviceName: loaded.serviceName,
      entities: loaded.entities,
      unboundActions: loaded.unboundActions,
      entityNames: resolveEntityNames(
        loaded.entities,
        this.config.tools,
        this.config.exclude
      ),
      toolStrategy: this.config.toolStrategy,
      allowCreate: this.config.allowCreate,
      allowUpdate: this.config.allowUpdate,
      allowDelete: this.config.allowDelete,
    });
  }

  /**
   * Returns the OData executor the generated tools use — the same instance, so
   * direct calls are subject to the same policy. Use it for CAP calls you want
   * governed but not exposed to the model.
   */
  async getExecutor(): Promise<ODataExecutor> {
    await this.getTools();
    return this.executor!;
  }

  /**
   * Returns the number of tools that will be generated.
   */
  async getToolCount(): Promise<number> {
    const tools = await this.getTools();
    return tools.length;
  }

  /**
   * Returns the names of all generated tools.
   */
  async getToolNames(): Promise<string[]> {
    const tools = await this.getTools();
    return tools.map((t) => t.name);
  }
}
