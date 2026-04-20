import type { StructuredToolInterface } from '@langchain/core/tools';
import type { CAPAgentConfig } from './types';
import { loadCDSModel } from './model-loader';
import { ODataExecutor } from './odata-executor';
import { generateAllTools } from './tool-generator';

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

  constructor(config: Omit<CAPAgentConfig, 'model'>) {
    this.config = {
      tools: 'auto',
      auth: { type: 'none' },
      dryRun: false,
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

    // Create the OData executor
    const executor = new ODataExecutor({
      baseUrl: this.config.baseUrl,
      servicePath: loaded.serviceName,
      auth: this.config.auth,
      dryRun: this.config.dryRun,
    });

    // Generate all tools
    this.tools = generateAllTools(
      loaded.entities,
      loaded.unboundActions,
      executor,
      loaded.serviceName,
      { tools: this.config.tools, exclude: this.config.exclude }
    );

    return [...this.tools];
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
