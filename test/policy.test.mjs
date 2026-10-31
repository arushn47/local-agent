import test from 'node:test';
import assert from 'node:assert/strict';
import { providerEligibility, guardBody, zeroPriceModel } from '../src/policy.mjs';

const config = { outputTokens: 1800 };
const env = { OPENROUTER_API_KEY: 'test-key', GEMINI_API_KEY: 'test-key', GROQ_API_KEY: 'test-key' };
const model = 'example/coder:free';
const request = () => ({ model, messages: [{ role: 'user', content: 'Fix this code' }] });
const freeModel = () => ({ id: model, pricing: { prompt: '0', completion: '0', request: '0' }, context_length: 8192, supported_parameters: ['tools'] });

test('caller pricing preferences cannot override forced zero-price caps', () => {
  const result = guardBody('openrouter', { ...request(), provider: { max_price: { prompt: 100, completion: 100, request: 100, image: 100 } } }, [model], config, env);
  assert.deepEqual(result.provider.max_price, { prompt: 0, completion: 0, request: 0, image: 0 });
});

test('cloud credentials alone never imply free-tier eligibility', () => {
  assert.equal(providerEligibility('gemini', env).allowed, false);
  assert.equal(providerEligibility('groq', env).allowed, false);
  assert.equal(providerEligibility('gemini', { ...env, GEMINI_FREE_TIER_CONFIRMED: 'true' }).allowed, true);
});
test('a missing key cannot be enabled by an attestation', () => assert.equal(providerEligibility('gemini', { GEMINI_FREE_TIER_CONFIRMED: 'true' }).allowed, false));
test('discovery requires zero input, output, and other listed prices', () => {
  assert.equal(zeroPriceModel(freeModel()), true);
  for (const pricing of [{ prompt: '0' }, { prompt: '0', completion: '1' }, { prompt: '0', completion: '0', request: '.001' }, { prompt: '', completion: '0' }]) assert.equal(Boolean(zeroPriceModel({ ...freeModel(), pricing })), false);
});
test('free label alone does not admit a model lacking client tools', () => assert.equal(zeroPriceModel({ ...freeModel(), supported_parameters: [] }), false));
test('a zero-price paid model identifier is not admitted', () => assert.equal(zeroPriceModel({ ...freeModel(), id: 'example/paid' }), false));
test('a request cannot escape the admitted model set', () => assert.throws(() => guardBody('openrouter', { ...request(), model: 'example/paid' }, [model], config, env)));
test('paid features and alternate model lists are blocked before inference', () => {
  for (const extra of [{ models: ['example/paid'] }, { plugins: [{ id: 'web' }] }, { service_tier: 'priority' }, { extra_body: { model: 'example/paid' } }, { tools: [{ type: 'web_search' }] }]) assert.throws(() => guardBody('openrouter', { ...request(), ...extra }, [model], config, env));
});
test('the output budget cannot be increased or set to an invalid value', () => {
  assert.equal(guardBody('openrouter', { ...request(), max_tokens: 999999 }, [model], config, env).max_tokens, 1800);
  assert.throws(() => guardBody('openrouter', { ...request(), max_tokens: -1 }, [model], config, env));
});
test('multimodal uploads are excluded from this text-only increment', () => assert.throws(() => guardBody('openrouter', { ...request(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }] }] }, [model], config, env)));
test('tool results and tool-call IDs survive the cost guard unchanged', () => {
  const messages = [{ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read', arguments: '{"path":"app.mjs"}' } }] }, { role: 'tool', tool_call_id: 'call_1', content: 'Source read by OpenCode' }];
  assert.deepEqual(guardBody('openrouter', { ...request(), messages }, [model], config, env).messages, messages);
});
