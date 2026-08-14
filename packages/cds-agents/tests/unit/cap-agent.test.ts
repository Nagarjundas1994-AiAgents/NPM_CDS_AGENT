import { CAPAgent } from '../../src/cap-agent';
import type { CDSModel } from '../../src/types';

const cdsModel: CDSModel = {
  definitions: {
    StudentService: { kind: 'service', name: 'StudentService' },
    'StudentService.Students': {
      kind: 'entity',
      elements: { ID: { type: 'cds.UUID', key: true } },
    },
  },
};

const config = {
  service: 'StudentService',
  baseUrl: 'http://localhost:4004',
  cdsModel,
  toolStrategy: 'minimal' as const,
};

// resolveLLM is private, but it is the whole point of the string-vs-instance
// contract, so drive it the way the agent does.
const resolve = (model: unknown) =>
  (new CAPAgent({ ...config, model } as never) as never as {
    resolveLLM(): Promise<unknown>;
  }).resolveLLM();

describe('CAPAgent model resolution', () => {
  it('uses a constructed chat model as-is', async () => {
    // Any object stands in for a provider this package does not know about,
    // e.g. @sap-ai-sdk/langchain against SAP Generative AI Hub.
    const llm = { _llmType: () => 'sap-genai-hub', invoke: jest.fn() };
    await expect(resolve(llm)).resolves.toBe(llm);
  });

  it('rejects an unknown model name with an actionable message', async () => {
    await expect(resolve('llama-4-maverick')).rejects.toThrow(
      /pass a constructed chat model instead of a string/
    );
  });

  it('does not hard-code a closed list of OpenAI reasoning prefixes', async () => {
    // o1-/o3- were the original allowlist; a new o<n>- must route to OpenAI.
    // Asserted via the message so the result does not depend on whether the
    // optional @langchain/openai peer happens to be installed.
    const error = await resolve('o7-preview').then(
      () => null,
      (e: Error) => e
    );
    expect(error?.message ?? '').not.toMatch(/Unknown model/);
  });
});

describe('CAPAgent capability map', () => {
  it('exposes what the agent is allowed to do without resolving an LLM', async () => {
    const agent = new CAPAgent({ ...config, model: 'no-such-model', allowDelete: false });

    const map = await agent.getCapabilityMap();
    expect(map.entities[0]).toMatchObject({ name: 'Students', operations: ['read'] });
  });
});
