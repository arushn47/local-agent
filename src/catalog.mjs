import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { stateDir, requestJSON } from './config.mjs';
import { providerEligibility, providerKey, modelAllowed, zeroPriceModel, PROVIDER_BASES } from './policy.mjs';
import { verifiedEdges } from './routing.mjs';

const GEMINI_FREE_SET = new Set(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']);
const GROQ_FREE_SET = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);

function rateGemini(id, inputTokens) {
  const isPro = id.includes('pro');
  const isFlash = id.includes('flash') && !id.includes('flash-lite');
  return {
    reasoning: isPro ? 4.9 : isFlash ? 4.2 : 3.5,
    coding: isPro ? 4.8 : isFlash ? 4.2 : 3.4,
    speed: id.includes('flash-lite') ? 5.0 : isFlash ? 4.5 : 3.0,
    context: inputTokens >= 1000000 ? 5.0 : inputTokens >= 128000 ? 4.0 : 3.0,
    toolCalling: true
  };
}

function rateGroq(id, contextTokens) {
  const is70B = id.includes('70b');
  return {
    reasoning: is70B ? 4.3 : 3.2,
    coding: is70B ? 4.2 : 3.4,
    speed: 5.0, // Groq LPU throughput
    context: contextTokens >= 128000 ? 4.0 : 3.0,
    toolCalling: true
  };
}

function rateOpenRouter(id, contextTokens, hasTools) {
  const isTopTier = id.includes('sonnet') || id.includes('o3') || id.includes('r1');
  const isCoder = id.includes('coder') || id.includes('code');
  const is70B = id.includes('70b');
  return {
    reasoning: isTopTier ? 5.0 : is70B ? 4.2 : 3.3,
    coding: isCoder || isTopTier ? 4.9 : is70B ? 4.2 : 3.3,
    speed: id.includes(':free') ? 3.5 : 4.4,
    context: contextTokens >= 200000 ? 5.0 : contextTokens >= 128000 ? 4.0 : 3.0,
    toolCalling: hasTools
  };
}

export async function discover(config, env, fetchJSON = requestJSON) {
  const providers = {};
  await Promise.all(Object.entries(config.providers).map(async ([name, settings]) => {
    const entry = providers[name] = {
      enabled: settings.enabled,
      models: [],
      allModels: [],
      freeModels: [],
      paidModels: [],
      modelsDetailed: {},
      capabilities: {},
      ...providerEligibility(name, env)
    };
    if (!entry.enabled || !entry.allowed) return;
    try {
      if (name === 'ollama') {
        const list = await fetchJSON(settings.baseURL + '/api/tags');
        for (const model of settings.models.filter(id => modelAllowed(name, id) && list.models?.some(m => m.name === id))) {
          const info = await fetchJSON(settings.baseURL + '/api/show', { method: 'POST', body: { model } });
          const context = Number(Object.entries(info.model_info || {}).find(([k]) => k.endsWith('.context_length'))?.[1]);
          const configuredContext = Number(info.parameters?.match(/num_ctx\s+(\d+)/)?.[1] || 2048);
          const effectiveContext = Math.min(context, configuredContext);
          const hasTools = info.capabilities?.includes('tools') === true;
          
          entry.capabilities[model] = {
            contextWindow: effectiveContext,
            tools: hasTools,
            source: 'ollama-api-show-and-num_ctx',
            codingApproved: hasTools
          };
          
          entry.modelsDetailed[model] = {
            id: model,
            provider: 'ollama',
            name: model,
            tier: 'free',
            freeTierVerified: true,
            pricing: { prompt: 0, completion: 0, request: 0 },
            contextWindow: effectiveContext,
            maxOutputTokens: null,
            tools: hasTools,
            capabilities: {
              reasoning: model.includes('qwen') ? 3.8 : 3.2,
              coding: (model.includes('coder') || model.includes('code')) ? 4.5 : (model.includes('7b') || model.includes('8b')) ? 3.5 : 3.0,
              speed: 3.5,
              context: effectiveContext >= 32768 ? 4.0 : 3.0,
              toolCalling: hasTools
            },
            isVerified: true,
            source: 'ollama-api-show-and-num_ctx'
          };
          entry.allModels.push(model);
          entry.freeModels.push(model);

          if (hasTools && context >= config.contextTokens && configuredContext >= config.contextTokens) {
            entry.models.push(model);
          }
        }
      } else if (name === 'gemini') {
        const list = await fetchJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': providerKey(name, env) } });
        const discoveredList = list.models || [];
        
        for (const m of discoveredList) {
          if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
          const rawId = m.name?.replace(/^models\//, '');
          if (!rawId) continue;
          const isFree = GEMINI_FREE_SET.has(rawId);
          const isFreeVerified = isFree && env.GEMINI_FREE_TIER_CONFIRMED === 'true';
          const pricing = isFree ? { prompt: 0, completion: 0, request: 0 } : (rawId.includes('pro') ? { prompt: 1.25e-6, completion: 5.0e-6, request: 0 } : { prompt: 0.075e-6, completion: 0.3e-6, request: 0 });
          
          entry.modelsDetailed[rawId] = {
            id: rawId,
            provider: 'gemini',
            name: m.displayName || rawId,
            tier: isFree ? 'free' : 'paid',
            freeTierVerified: isFreeVerified,
            pricing,
            contextWindow: m.inputTokenLimit || 8192,
            maxOutputTokens: m.outputTokenLimit || null,
            tools: true,
            supportsReasoning: m.thinking===true,
            capabilities: rateGemini(rawId, m.inputTokenLimit || 8192),
            isVerified: true,
            source: 'gemini-model-input-limit-conservative-total-budget'
          };
          entry.allModels.push(rawId);
          if (isFree) entry.freeModels.push(rawId);
          else entry.paidModels.push(rawId);
        }

        entry.models = settings.models.filter(id => modelAllowed(name, id) && discoveredList.some(m => m.name === `models/${id}` && m.supportedGenerationMethods?.includes('generateContent') && m.inputTokenLimit >= config.contextTokens));
        for (const id of entry.models) {
          const m = discoveredList.find(m => m.name === `models/${id}`);
          entry.capabilities[id] = {
            contextWindow: m.inputTokenLimit,
            maxOutputTokens: m.outputTokenLimit || null,
            tools: true,
            source: 'gemini-model-input-limit-conservative-total-budget',
            codingApproved: true
          };
        }
      } else {
        const list = await fetchJSON(PROVIDER_BASES[name] + '/models', { headers: { Authorization: `Bearer ${providerKey(name, env)}` } });
        const rawList = list.data || [];

        if (name === 'openrouter') {
          for (const m of rawList) {
            const isFree = zeroPriceModel(m);
            const hasTools = Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools');
            const pricing = {
              prompt: Number(m.pricing?.prompt || 0),
              completion: Number(m.pricing?.completion || 0),
              request: Number(m.pricing?.request || 0)
            };
            const ctx = Number(m.context_length || 8192);

            entry.modelsDetailed[m.id] = {
              id: m.id,
              provider: 'openrouter',
              name: m.name || m.id,
              tier: isFree ? 'free' : 'paid',
              freeTierVerified: isFree,
              pricing,
              contextWindow: ctx,
              maxOutputTokens: Number(m.top_provider?.max_completion_tokens || null),
              tools: hasTools,
              supportsReasoning: m.supported_parameters?.some(p=>['reasoning','include_reasoning','reasoning_effort'].includes(p))===true,
              capabilities: rateOpenRouter(m.id, ctx, hasTools),
              isVerified: Array.isArray(m.supported_parameters) && m.pricing != null,
              source: 'openrouter-model-catalog'
            };
            entry.allModels.push(m.id);
            if (isFree) entry.freeModels.push(m.id);
            else entry.paidModels.push(m.id);
          }

          const eligible = rawList.filter(zeroPriceModel).sort((a,b) => Number(b.context_length) - Number(a.context_length));
          entry.models = settings.models.length ? settings.models.filter(id => eligible.some(m => m.id === id)) : eligible.slice(0, 2).map(m => m.id);
        } else {
          // groq
          for (const m of rawList) {
            if (m.active === false) continue;
            const isFree = GROQ_FREE_SET.has(m.id);
            const isFreeVerified = isFree && env.GROQ_FREE_TIER_CONFIRMED === 'true';
            const pricing = isFree ? { prompt: 0, completion: 0, request: 0 } : (m.id.includes('70b') ? { prompt: 0.59e-6, completion: 0.79e-6, request: 0 } : { prompt: 0.05e-6, completion: 0.08e-6, request: 0 });
            const ctx = Number(m.context_window || m.context_length || 8192);

            entry.modelsDetailed[m.id] = {
              id: m.id,
              provider: 'groq',
              name: m.id,
              tier: isFree ? 'free' : 'paid',
              freeTierVerified: isFreeVerified,
              pricing,
              contextWindow: ctx,
              maxOutputTokens: 4096,
              tools: true,
              supportsReasoning: /gpt-oss/.test(m.id),
              capabilities: rateGroq(m.id, ctx),
              isVerified: true,
              source: 'groq-model-catalog'
            };
            entry.allModels.push(m.id);
            if (isFree) entry.freeModels.push(m.id);
            else entry.paidModels.push(m.id);
          }

          entry.models = settings.models.filter(id => modelAllowed(name, id) && rawList.some(m => m.id === id && m.active !== false && Number(m.context_window || m.context_length) >= config.contextTokens));
        }

        for (const id of entry.models) {
          const m = rawList.find(m => m.id === id);
          entry.capabilities[id] = {
            contextWindow: Number(m.context_window || m.context_length) || null,
            maxOutputTokens: m.top_provider?.max_completion_tokens || null,
            tools: name === 'openrouter' ? m.supported_parameters?.includes('tools') === true : true,
            source: name + '-model-catalog',
            codingApproved: name !== 'openrouter' || verifiedEdges.some(e => e.to === `${name}/${id}`)
          };
        }
      }
      entry.reason = entry.models.length ? 'ready' : 'no_eligible_available_tool_models';
    } catch {
      entry.reason = 'catalog_unreachable_or_credentials_rejected';
      entry.allowed = false;
    }
  }));
  return { version: 1, discoveredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), providers };
}

export function saveCatalog(catalog) {
  writeFileSync(join(stateDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
}

export function loadCatalog() {
  try {
    const catalog = JSON.parse(readFileSync(join(stateDir, 'catalog.json'), 'utf8'));
    if (Date.parse(catalog.expiresAt) > Date.now()) return catalog;
  } catch {}
  return { providers: {} };
}
