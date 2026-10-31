import test from 'node:test';
import assert from 'node:assert/strict';
import { discover } from '../src/catalog.mjs';
import {
  getAllModels,
  getModel,
  filterModelsByPolicy,
  scoreModelForRole,
  recommendModel,
  buildFallbackChain,
  validateModelAssignment,
  POLICIES,
  ROLES
} from '../src/workspace/models.mjs';

function createMockConfig() {
  return {
    version: 1,
    contextTokens: 8192,
    outputTokens: 1800,
    routingOrder: ['gemini', 'groq', 'openrouter', 'ollama'],
    providers: {
      gemini: { enabled: true, models: ['gemini-2.5-flash', 'gemini-3.5-flash-lite'] },
      groq: { enabled: true, models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
      openrouter: { enabled: true, models: ['cohere/north-mini-code:free'] },
      ollama: { enabled: true, baseURL: 'http://127.0.0.1:11434', models: ['qwen2.5-coder:7b'] }
    }
  };
}

function createMockEnv() {
  return {
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_FREE_TIER_CONFIRMED: 'true',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_FREE_TIER_CONFIRMED: 'true',
    OPENROUTER_API_KEY: 'test-openrouter-key'
  };
}

function mockFetcher(url, options = {}) {
  // Gemini
  if (url.includes('generativelanguage.googleapis.com')) {
    return Promise.resolve({
      models: [
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1048576, outputTokenLimit: 8192 },
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1048576, outputTokenLimit: 8192 },
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro (Paid)', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 2097152, outputTokenLimit: 8192 }
      ]
    });
  }
  // Groq
  if (url.includes('api.groq.com')) {
    return Promise.resolve({
      data: [
        { id: 'llama-3.3-70b-versatile', context_window: 131072, active: true },
        { id: 'llama-3.1-8b-instant', context_window: 131072, active: true },
        { id: 'mixtral-8x7b-32768', context_window: 32768, active: true }
      ]
    });
  }
  // OpenRouter
  if (url.includes('openrouter.ai')) {
    return Promise.resolve({
      data: [
        {
          id: 'cohere/north-mini-code:free',
          name: 'Cohere North Mini Code (Free)',
          pricing: { prompt: '0', completion: '0', request: '0' },
          context_length: 256000,
          supported_parameters: ['tools'],
          top_provider: { max_completion_tokens: 4096 }
        },
        {
          id: 'qwen/qwen-2.5-coder-32b-instruct:free',
          name: 'Qwen 2.5 Coder 32B (Free)',
          pricing: { prompt: '0', completion: '0', request: '0' },
          context_length: 131072,
          supported_parameters: ['tools'],
          top_provider: { max_completion_tokens: 8192 }
        },
        {
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Claude 3.5 Sonnet (Paid)',
          pricing: { prompt: '0.000003', completion: '0.000015', request: '0' },
          context_length: 200000,
          supported_parameters: ['tools'],
          top_provider: { max_completion_tokens: 8192 }
        }
      ]
    });
  }
  // Ollama
  if (url.includes('/api/tags')) {
    return Promise.resolve({
      models: [{ name: 'qwen2.5-coder:7b' }]
    });
  }
  if (url.includes('/api/show')) {
    return Promise.resolve({
      capabilities: ['tools'],
      parameters: 'num_ctx 32768',
      model_info: { 'qwen.context_length': 32768 }
    });
  }
  throw new Error(`Unhandled mock URL: ${url}`);
}

test('model discovery populates detailed models with exact IDs, pricing, and capabilities', async () => {
  const config = createMockConfig();
  const env = createMockEnv();
  const catalog = await discover(config, env, mockFetcher);

  // Gemini checks
  const gemini = catalog.providers.gemini;
  assert.equal(gemini.allowed, true);
  assert.ok(gemini.allModels.includes('gemini-2.5-flash'));
  assert.ok(gemini.allModels.includes('gemini-2.5-pro'));
  assert.equal(gemini.modelsDetailed['gemini-2.5-flash'].tier, 'free');
  assert.equal(gemini.modelsDetailed['gemini-2.5-flash'].pricing.prompt, 0);
  assert.equal(gemini.modelsDetailed['gemini-2.5-pro'].tier, 'paid');
  assert.ok(gemini.modelsDetailed['gemini-2.5-pro'].pricing.prompt > 0);

  // Groq checks
  const groq = catalog.providers.groq;
  assert.equal(groq.allowed, true);
  assert.ok(groq.allModels.includes('llama-3.3-70b-versatile'));
  assert.equal(groq.modelsDetailed['llama-3.3-70b-versatile'].contextWindow, 131072);
  assert.equal(groq.modelsDetailed['llama-3.3-70b-versatile'].tools, true);

  // OpenRouter checks
  const openrouter = catalog.providers.openrouter;
  assert.equal(openrouter.allowed, true);
  assert.ok(openrouter.freeModels.includes('cohere/north-mini-code:free'));
  assert.ok(openrouter.paidModels.includes('anthropic/claude-3.5-sonnet'));
  assert.equal(openrouter.modelsDetailed['anthropic/claude-3.5-sonnet'].tier, 'paid');
  assert.equal(openrouter.modelsDetailed['anthropic/claude-3.5-sonnet'].pricing.prompt, 0.000003);

  // Ollama checks
  const ollama = catalog.providers.ollama;
  assert.equal(ollama.allowed, true);
  assert.ok(ollama.freeModels.includes('qwen2.5-coder:7b'));
  assert.equal(ollama.modelsDetailed['qwen2.5-coder:7b'].tier, 'free');
  assert.equal(ollama.modelsDetailed['qwen2.5-coder:7b'].pricing.prompt, 0);
});

test('getAllModels aggregates and normalizes all discovered models across providers', async () => {
  const config = createMockConfig();
  const env = createMockEnv();
  const catalog = await discover(config, env, mockFetcher);

  const models = getAllModels(catalog);
  assert.ok(models.length >= 7);

  const flash = getModel(catalog, 'gemini/gemini-2.5-flash');
  assert.ok(flash);
  assert.equal(flash.provider, 'gemini');
  assert.equal(flash.tier, 'free');
  assert.equal(flash.tools, true);

  const sonnet = getModel(catalog, 'openrouter', 'anthropic/claude-3.5-sonnet');
  assert.ok(sonnet);
  assert.equal(sonnet.tier, 'paid');
  assert.equal(sonnet.tools, true);
});

test('filterModelsByPolicy strictly excludes paid models under Free Only policy', async () => {
  const config = createMockConfig();
  const env = createMockEnv();
  const catalog = await discover(config, env, mockFetcher);

  const allModels = getAllModels(catalog);
  const freeModels = filterModelsByPolicy(allModels, POLICIES.FREE_ONLY);

  assert.ok(freeModels.length > 0);
  assert.ok(freeModels.every(m => m.tier === 'free' && m.pricing.prompt === 0 && m.pricing.completion === 0));
  assert.ok(!freeModels.some(m => m.id === 'anthropic/claude-3.5-sonnet'));
  assert.ok(!freeModels.some(m => m.id === 'gemini-2.5-pro'));

  const paidAllowed = filterModelsByPolicy(allModels, POLICIES.PAID_ALLOWED);
  assert.ok(paidAllowed.some(m => m.id === 'anthropic/claude-3.5-sonnet'));
});

test('recommendModel recommends optimal models per role adhering to free-first constraints', async () => {
  const config = createMockConfig();
  const env = createMockEnv();
  const catalog = await discover(config, env, mockFetcher);

  // Free Only Planner: must recommend free model with high reasoning and context (Gemini 2.5 Flash)
  const planRec = recommendModel({ role: 'planner', policy: POLICIES.FREE_ONLY, catalog });
  assert.ok(planRec.recommended);
  assert.equal(planRec.recommended.tier, 'free');
  assert.ok(['gemini-2.5-flash', 'llama-3.3-70b-versatile'].includes(planRec.recommended.id));
  assert.ok(planRec.fallbackChain.length >= 1);
  assert.ok(planRec.fallbackChain.every(m => m.tier === 'free'));

  // Free Only Implementer: must recommend coding-capable tool model (e.g. Qwen 2.5 Coder Free or Gemini Flash)
  const impRec = recommendModel({ role: 'implementer', policy: POLICIES.FREE_ONLY, catalog });
  assert.ok(impRec.recommended);
  assert.equal(impRec.recommended.tier, 'free');
  assert.equal(impRec.recommended.tools, true);
  assert.ok(impRec.recommended.capabilities.coding >= 4.0);

  // Paid Allowed Implementer: Claude Sonnet can be recommended if authorized
  const paidRec = recommendModel({ role: 'implementer', policy: POLICIES.PAID_ALLOWED, catalog });
  assert.ok(paidRec.recommended);
  assert.ok(['anthropic/claude-3.5-sonnet', 'qwen/qwen-2.5-coder-32b-instruct:free'].includes(paidRec.recommended.id));
});

test('buildFallbackChain validates model existence and enforces policy boundaries', async () => {
  const config = createMockConfig();
  const env = createMockEnv();
  const catalog = await discover(config, env, mockFetcher);

  // Valid free chain
  const chain = buildFallbackChain({
    primaryId: 'gemini/gemini-2.5-flash',
    fallbackIds: ['openrouter/cohere/north-mini-code:free', 'groq/llama-3.3-70b-versatile'],
    policy: POLICIES.FREE_ONLY,
    catalog
  });
  assert.equal(chain.length, 3);
  assert.equal(chain[0].id, 'gemini-2.5-flash');
  assert.equal(chain[1].id, 'cohere/north-mini-code:free');

  // Multi-model assignment from same provider
  const multiProviderChain = buildFallbackChain({
    primaryId: 'gemini/gemini-2.5-flash',
    fallbackIds: ['gemini/gemini-3.5-flash-lite'],
    policy: POLICIES.FREE_ONLY,
    catalog
  });
  assert.equal(multiProviderChain.length, 2);
  assert.equal(multiProviderChain[0].provider, 'gemini');
  assert.equal(multiProviderChain[1].provider, 'gemini');

  // Attempting to add a paid model into a Free Only chain must throw
  assert.throws(() => {
    buildFallbackChain({
      primaryId: 'gemini/gemini-2.5-flash',
      fallbackIds: ['openrouter/anthropic/claude-3.5-sonnet'],
      policy: POLICIES.FREE_ONLY,
      catalog
    });
  }, /violates_free_only_policy/);
});

test('validateModelAssignment checks role tool requirements and policy compliance', async () => {
  const config = createMockConfig();
  const env = createMockEnv();
  const catalog = await discover(config, env, mockFetcher);

  // Valid free assignment for implementer
  const valid = validateModelAssignment({
    role: 'implementer',
    modelId: 'gemini/gemini-2.5-flash',
    policy: POLICIES.FREE_ONLY,
    catalog
  });
  assert.equal(valid.valid, true);

  // Paid model under free_only must be rejected
  const invalidPaid = validateModelAssignment({
    role: 'implementer',
    modelId: 'openrouter/anthropic/claude-3.5-sonnet',
    policy: POLICIES.FREE_ONLY,
    catalog
  });
  assert.equal(invalidPaid.valid, false);
  assert.equal(invalidPaid.reason, 'paid_model_forbidden_under_free_only_policy');

  // Paid model under paid_allowed is valid
  const validPaid = validateModelAssignment({
    role: 'implementer',
    modelId: 'openrouter/anthropic/claude-3.5-sonnet',
    policy: POLICIES.PAID_ALLOWED,
    catalog
  });
  assert.equal(validPaid.valid, true);
});

