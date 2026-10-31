const KEY_NAMES = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
// Reviewed against official pricing documentation. Discovery must also confirm availability.
const GEMINI_FREE_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']);
const GROQ_CHAT_MODELS = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
export const PROVIDER_BASES = Object.freeze({ gemini: 'https://generativelanguage.googleapis.com/v1beta/openai', groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1' });

export function providerEligibility(provider, env) {
  if (provider === 'ollama') return { allowed: true, basis: 'local' };
  if (!env[KEY_NAMES[provider]]) return { allowed: false, reason: 'missing_key' };
  if (provider === 'gemini' && env.GEMINI_FREE_TIER_CONFIRMED !== 'true') return { allowed: false, reason: 'billing_disabled_confirmation_required' };
  if (provider === 'groq' && env.GROQ_FREE_TIER_CONFIRMED !== 'true') return { allowed: false, reason: 'free_plan_confirmation_required' };
  return { allowed: true, basis: provider === 'openrouter' ? 'zero_price_catalog_and_request_cap' : 'user_confirmed_free_tier' };
}
export const providerKey = (provider, env) => env[KEY_NAMES[provider]];
export function zeroPriceModel(model) {
  const price = model?.pricing;
  return typeof model?.id === 'string' && model.id.endsWith(':free') && Array.isArray(model.supported_parameters) && model.supported_parameters.includes('tools') && Number(model.context_length) >= 8192 && price && ['prompt', 'completion'].every(k => price[k] !== undefined && price[k] !== null && price[k] !== '' && Number(price[k]) === 0) && Object.values(price).every(p => p !== null && p !== '' && Number.isFinite(Number(p)) && Number(p) === 0);
}
export function modelAllowed(provider, model) {
  if (provider === 'gemini') return GEMINI_FREE_MODELS.has(model);
  if (provider === 'groq') return GROQ_CHAT_MODELS.has(model);
  if (provider === 'openrouter') return typeof model === 'string' && model.endsWith(':free');
  return provider === 'ollama' && typeof model === 'string' && !model.includes('/') && !model.endsWith(':cloud');
}

export function guardBody(provider, body, admittedModels, config, env, options = {}) {
  const policy = options.policy || 'free_only';
  const isPaidAllowed = policy === 'paid_allowed' || (policy === 'free_preferred' && options.allowPaid === true);

  if (!providerEligibility(provider, env).allowed) throw new Error('model_or_tier_not_allowed');
  if (!admittedModels.includes(body?.model)) throw new Error('model_or_tier_not_allowed');
  if (!isPaidAllowed && !modelAllowed(provider, body.model)) throw new Error('model_or_tier_not_allowed');

  if (!Array.isArray(body.messages) || !body.messages.length) throw new Error('messages_required');
  for (const message of body.messages) {
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)) throw new Error('unsupported_message_role');
    if (Array.isArray(message.content) && message.content.some(p => p.type !== 'text')) throw new Error('text_only');
    if (message.content != null && typeof message.content !== 'string' && !Array.isArray(message.content)) throw new Error('unsupported_content');
  }
  if (body.tools && (!Array.isArray(body.tools) || body.tools.some(t => t.type !== 'function'))) throw new Error('client_function_tools_only');
  if (body.models || body.plugins || body.extra_body || body.service_tier || body.modalities || body.audio || body.web_search_options) throw new Error('paid_feature_or_route_override');
  const allowed = new Set(['model', 'messages', 'tools', 'tool_choice', 'stream', 'stream_options', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'stop', 'seed', 'parallel_tool_calls', 'response_format', 'user', 'reasoning_effort', 'provider']);
  if (Object.keys(body).some(k => !allowed.has(k))) throw new Error('unsupported_request_field');
  const result = structuredClone(body);
  delete result.provider;
  const requested = result.max_completion_tokens ?? result.max_tokens ?? config.outputTokens;
  if (!Number.isInteger(requested) || requested < 1) throw new Error('invalid_output_budget');
  delete result.max_completion_tokens;
  result.max_tokens = Math.min(requested, config.outputTokens);
  if (provider === 'openrouter') {
    if (isPaidAllowed && options.maxPrice) {
      result.provider = { max_price: options.maxPrice, require_parameters: true };
    } else {
      result.provider = { max_price: { prompt: 0, completion: 0, request: 0, image: 0 }, require_parameters: true };
    }
  }
  if (provider === 'ollama') { result.reasoning_effort = 'none'; result.temperature = 0; }
  return result;
}
