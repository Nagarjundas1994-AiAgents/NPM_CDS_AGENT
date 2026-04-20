import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { CAPAgentConfig, AgentStreamEvent } from './types';
import { loadCDSModel } from './model-loader';
import { ODataExecutor } from './odata-executor';
import { generateAllTools } from './tool-generator';

/**
 * CAPAgent — The main entry point for AI-powered interaction with SAP CAP services.
 *
 * This class:
 * 1. Loads a CDS service definition and auto-generates LangChain tools
 * 2. Resolves the LLM provider from the model name (OpenAI, Anthropic, or Gemini)
 * 3. Wires everything together with LangGraph's createReactAgent
 * 4. Provides invoke() and stream() methods for natural language interaction
 *
 * @example
 * ```typescript
 * const agent = new CAPAgent({
 *   service: 'StudentService',
 *   baseUrl: 'http://localhost:4004',
 *   model: 'gpt-4o',
 *   tools: 'auto',
 *   auth: { type: 'basic', user: 'alice', pass: 'admin' },
 * });
 *
 * const answer = await agent.invoke("Find all students with GPA below 2.0");
 * console.log(answer);
 * ```
 */
export class CAPAgent {
  private readonly config: CAPAgentConfig;
  private agent: ReturnType<typeof createReactAgent> | null = null;
  private tools: StructuredToolInterface[] = [];
  private initialized = false;

  constructor(config: CAPAgentConfig) {
    this.config = {
      tools: 'auto',
      auth: { type: 'none' },
      dryRun: false,
      temperature: 0,
      ...config,
    };
  }

  /**
   * Lazy initialization — loads the CDS model, generates tools, and creates the agent.
   * Called automatically on the first invoke() or stream() call.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. Load and introspect the CDS model
    const loaded = await loadCDSModel({
      cdsFile: this.config.cdsFile,
      cdsModel: this.config.cdsModel,
      serviceName: this.config.service,
    });

    // 2. Create the OData executor
    const executor = new ODataExecutor({
      baseUrl: this.config.baseUrl,
      servicePath: loaded.serviceName,
      auth: this.config.auth,
      dryRun: this.config.dryRun,
    });

    // 3. Generate tools
    this.tools = generateAllTools(
      loaded.entities,
      loaded.unboundActions,
      executor,
      loaded.serviceName,
      { tools: this.config.tools, exclude: this.config.exclude }
    );

    // 4. Resolve the LLM
    const llm = await this.resolveLLM();

    // 5. Build the system prompt
    const systemPrompt = this.config.systemPrompt || this.buildDefaultSystemPrompt(loaded);

    // 6. Create the ReAct agent
    this.agent = createReactAgent({
      llm,
      tools: this.tools,
      messageModifier: systemPrompt,
    });

    this.initialized = true;
  }

  /**
   * Resolves the LLM instance from the model name string.
   *
   * Provider detection:
   * - gpt-*, o1-*, o3-*  → @langchain/openai (ChatOpenAI)
   * - claude-*            → @langchain/anthropic (ChatAnthropic)
   * - gemini-*            → @langchain/google-genai (ChatGoogleGenerativeAI)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveLLM(): Promise<any> {
    const modelName = this.config.model;
    const temperature = this.config.temperature ?? 0;

    if (/^(gpt-|o1-|o3-)/.test(modelName)) {
      try {
        const { ChatOpenAI } = await import('@langchain/openai');
        return new ChatOpenAI({ model: modelName, temperature });
      } catch {
        throw new Error(
          `To use OpenAI models, install @langchain/openai: npm install @langchain/openai`
        );
      }
    }

    if (/^claude-/.test(modelName)) {
      try {
        const { ChatAnthropic } = await import('@langchain/anthropic');
        return new ChatAnthropic({ model: modelName, temperature });
      } catch {
        throw new Error(
          `To use Anthropic models, install @langchain/anthropic: npm install @langchain/anthropic`
        );
      }
    }

    if (/^gemini-/.test(modelName)) {
      try {
        const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
        return new ChatGoogleGenerativeAI({ model: modelName, temperature });
      } catch {
        throw new Error(
          `To use Google Gemini models, install @langchain/google-genai: npm install @langchain/google-genai`
        );
      }
    }

    throw new Error(
      `Unknown model "${modelName}". Supported prefixes: gpt-*, o1-*, o3-* (OpenAI), ` +
      `claude-* (Anthropic), gemini-* (Google). ` +
      `Make sure the corresponding @langchain provider package is installed.`
    );
  }

  /**
   * Builds the default system prompt for the ReAct agent.
   */
  private buildDefaultSystemPrompt(loaded: Awaited<ReturnType<typeof loadCDSModel>>): string {
    const entityList = Object.keys(loaded.entities).join(', ');
    const actionList = Object.keys(loaded.unboundActions).join(', ') || '(none)';

    return (
      `You are an AI assistant connected to a SAP CAP application's "${this.config.service}" service. ` +
      `You can read, create, update, and delete records, and execute custom actions.\n\n` +
      `Available entities: ${entityList}\n` +
      `Available service actions: ${actionList}\n\n` +
      `Guidelines:\n` +
      `- When querying data, use OData $filter syntax (e.g., "name eq 'John'", "gpa lt 2.0").\n` +
      `- String values in $filter must be wrapped in single quotes.\n` +
      `- Use $select to fetch only needed fields for better performance.\n` +
      `- Use $top to limit results when the user doesn't need all records.\n` +
      `- When updating records, first read to get the key, then update.\n` +
      `- Always confirm destructive operations (delete) with the user if the intent is ambiguous.\n` +
      `- Return results in a clear, human-readable format.\n` +
      `- If an operation fails, explain the error and suggest a fix.`
    );
  }

  /**
   * Invoke the agent with a natural language query.
   * Returns the agent's final response as a string.
   *
   * @param input - The user's natural language instruction.
   * @returns The agent's response.
   *
   * @example
   * ```typescript
   * const answer = await agent.invoke("List all students on academic probation");
   * ```
   */
  async invoke(input: string): Promise<string> {
    await this.initialize();

    const result = await this.agent!.invoke({
      messages: [{ role: 'user', content: input }],
    });

    // Extract the final message content
    const messages = result.messages;
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      return typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);
    }

    return 'No response from agent.';
  }

  /**
   * Stream the agent's execution, yielding events as they occur.
   *
   * @param input - The user's natural language instruction.
   * @yields AgentStreamEvent objects.
   *
   * @example
   * ```typescript
   * for await (const event of agent.stream("Show me all courses")) {
   *   if (event.type === 'final') console.log(event.content);
   * }
   * ```
   */
  async *stream(input: string): AsyncGenerator<AgentStreamEvent> {
    await this.initialize();

    const stream = await this.agent!.stream(
      { messages: [{ role: 'user', content: input }] },
      { streamMode: 'values' }
    );

    for await (const chunk of stream) {
      const messages = chunk.messages;
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const content = typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

        // Determine event type based on message type
        const messageType = lastMessage._getType?.() || lastMessage.constructor?.name || 'unknown';

        if (messageType === 'ai' || messageType === 'AIMessage') {
          // Check if it has tool calls
          if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            yield {
              type: 'tool_call',
              content: JSON.stringify(lastMessage.tool_calls),
              metadata: { toolCalls: lastMessage.tool_calls },
            };
          } else {
            yield { type: 'final', content };
          }
        } else if (messageType === 'tool' || messageType === 'ToolMessage') {
          yield {
            type: 'tool_result',
            content,
            metadata: { toolName: lastMessage.name },
          };
        } else {
          yield { type: 'message', content };
        }
      }
    }
  }

  /**
   * Returns the auto-generated tools for use in custom LangGraph graphs.
   * Initializes the agent if not already done.
   */
  async getTools(): Promise<StructuredToolInterface[]> {
    await this.initialize();
    return [...this.tools];
  }

  /**
   * Returns the number of tools generated for this agent.
   */
  async getToolCount(): Promise<number> {
    await this.initialize();
    return this.tools.length;
  }
}
