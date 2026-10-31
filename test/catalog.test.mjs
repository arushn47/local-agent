import test from 'node:test';
import assert from 'node:assert/strict';
import { discover } from '../src/catalog.mjs';
import { loadConfig } from '../src/config.mjs';

test('discovery with no credentials performs only local metadata requests', async () => {
  const calls = [];
  const config = loadConfig();
  const result = await discover(config, {}, async (url, options) => {
    calls.push(url);
    if (url.endsWith('/api/tags')) return { models: config.providers.ollama.models.map(name => ({ name })) };
    assert.equal(options.body.model, config.providers.ollama.models[calls.length - 2]);
    return { capabilities: ['tools'], parameters: 'num_ctx 8192', model_info: { 'qwen.context_length': 32768 } };
  });
  assert.ok(calls.every(url => url.startsWith('http://127.0.0.1:11434/')));
  assert.equal(result.providers.ollama.models.length, 2); assert.equal(result.providers.gemini.allowed, false);
});
test('expired or unknown availability is not substituted with a paid model', async () => {
  const config = loadConfig(); config.providers.ollama.enabled = false;
  const result = await discover(config, { OPENROUTER_API_KEY: 'test-key' }, async () => ({ data: [{ id: 'example/paid', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], context_length: 100000 }] }));
  assert.deepEqual(result.providers.openrouter.models, []);
});

test('only the evidenced free OpenRouter coding model is promoted and pricing still gates it', async () => {
  const config=loadConfig();Object.values(config.providers).forEach(p=>p.enabled=false);config.providers.openrouter.enabled=true;
  const model={id:'cohere/north-mini-code:free',pricing:{prompt:'0',completion:'0'},supported_parameters:['tools'],context_length:256000};
  const discoverModel=()=>discover(config,{OPENROUTER_API_KEY:'test'},async()=>({data:[model]}));
  assert.equal((await discoverModel()).providers.openrouter.capabilities[model.id].codingApproved,true);
  model.pricing.completion='0.01';assert.deepEqual((await discoverModel()).providers.openrouter.models,[]);
});
