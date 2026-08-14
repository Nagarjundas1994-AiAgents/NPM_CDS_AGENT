import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { CAPAgentConfig, AgentStreamEvent } from './types';
import { CAPToolkit } from './cap-toolkit';
import type { ServiceCapabilityMap } from './capability';

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
  private readonly toolkit: CAPToolkit;
  private agent: ReturnType<typeof createReactAgent> | null = null;
  private tools: StructuredToolInterface[] = [];
  private initialized = false;

  constructor(config: CAPAgentConfig) {
    this.config = {
      tools: 'auto',
      auth: { type: 'none' },
      dryRun: false,
      temperature: 0,
      toolStrategy: 'full',
      ...config,
    };
    this.toolkit = new CAPToolkit(this.config);
  }

  /**
   * Lazy initialization — generates tools via CAPToolkit and creates the agent.
   * Called automatically on the first invoke() or stream() call.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. Tools + capability map (policy-enforced by the toolkit's executor)
    this.tools = await this.toolkit.getTools();
    const capabilities = await this.toolkit.getCapabilityMap();

    // 2. Resolve the LLM
    const llm = await this.resolveLLM();

    // 3. Build the system prompt
    const systemPrompt =
      this.config.systemPrompt || this.buildDefaultSystemPrompt(capabilities);

    // 4. Create the ReAct agent
    this.agent = createReactAgent({
      llm,
      tools: this.tools,
      // `prompt` replaced the legacy `messageModifier` alias in LangGraph 0.2.46.
      prompt: systemPrompt,
    });

    this.initialized = true;
  }

  /**
   * Resolves the LLM instance.
   *
   * An already-constructed chat model is used as-is — that is the escape hatch
   * for any provider this shorthand does not know, including SAP Generative AI
   * Hub via `@sap-ai-sdk/langchain`.
   *
   * Otherwise the provider is inferred from the model name:
   * - gpt-*, o<n>-*  → @langchain/openai (ChatOpenAI)
   * - claude-*        → @langchain/anthropic (ChatAnthropic)
   * - gemini-*        → @langchain/google-genai (ChatGoogleGenerativeAI)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveLLM(): Promise<any> {
    const modelName = this.config.model;
    const temperature = this.config.temperature ?? 0;

    // Pre-built model: the caller already chose the provider and its options.
    if (typeof modelName !== 'string') return modelName;

    if (/^(gpt-|o\d+-|chatgpt-)/.test(modelName)) {
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
      `Unknown model "${modelName}". The name shorthand covers gpt-* / o<n>-* (OpenAI), ` +
      `claude-* (Anthropic), and gemini-* (Google). ` +
      `For any other provider — SAP Generative AI Hub, Bedrock, Ollama, a new model ` +
      `prefix — pass a constructed chat model instead of a string: ` +
      `new CAPAgent({ model: new ChatOpenAI({ model: '${modelName}' }), ... }).`
    );
  }

  /**
   * Builds the default system prompt for the ReAct agent.
   */
  private buildDefaultSystemPrompt(capabilities: ServiceCapabilityMap): string {
    // Built from the capability map, so the prompt only ever names entities and
    // actions the agent was actually given tools for.
    const entityList = capabilities.entities
      .map((e) => `${e.name} (${e.operations.join('/') || 'actions only'})`)
      .join(', ');
    const actionList = capabilities.unbound.map((a) => a.name).join(', ') || '(none)';

    const strategy = this.config.toolStrategy ?? 'full';
    const strategyHint =
      strategy === 'minimal'
        ? `Use describe to inspect the service, then query with a structured filter such as { gpa: { lt: 2.0 } }.`
        : `When querying data, prefer structured filters or OData $filter (e.g. "gpa lt 2.0").`;

    return (
      `You are an AI assistant connected to a SAP CAP application's "${this.config.service}" service. ` +
      `Tool strategy: ${strategy}.\n\n` +
      `Available entities: ${entityList}\n` +
      `Available service actions: ${actionList}\n\n` +
      `Guidelines:\n` +
      `- ${strategyHint}\n` +
      `- String values in $filter must be wrapped in single quotes.\n` +
      `- Use $select / select to fetch only needed fields.\n` +
      `- Use $top / top to limit results when the user doesn't need all records.\n` +
      `- When updating records, first read to get the key, then update.\n` +
      `- Always confirm destructive operations (delete) with the user if the intent is ambiguous.\n` +
      `- Operations not listed above are blocked by policy — do not attempt them.\n` +
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

  /**
   * Returns the capability map this agent is governed by — what it may read,
   * write, and invoke. Does not require the LLM to be resolvable.
   */
  async getCapabilityMap(): Promise<ServiceCapabilityMap> {
    return this.toolkit.getCapabilityMap();
  }
}
