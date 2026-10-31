import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiSignatures } from '../src/gemini-signatures.mjs';
const call = () => ({ id: 'call-one', type: 'function', function: { name: 'read', arguments: '{"path":"source.mjs"}' }, extra_content: { google: { thought_signature: 'opaque-test-signature' } } });
const body = c => ({ messages: [{ role: 'assistant', tool_calls: [c] }, { role: 'tool', tool_call_id: c.id, content: 'verified result' }] });
test('provider-issued signature survives a client that drops additional properties', () => {
  const cache = new GeminiSignatures(); const scope = cache.scope('credential', 'model'); const signed = call(); cache.remember(scope, signed);
  const unsigned = structuredClone(signed); delete unsigned.extra_content;
  const input = body(unsigned); const restored = cache.restore(scope, input);
  assert.deepEqual(restored.messages[0].tool_calls[0].extra_content, signed.extra_content);
  assert.deepEqual(restored.messages[1], input.messages[1]); assert.equal(input.messages[0].tool_calls[0].extra_content, undefined);
});
test('different credentials, models, arguments, IDs and expired entries cannot share signatures', () => {
  let now = 0; const cache = new GeminiSignatures({ now: () => now, ttlMs: 10 }); const scope = cache.scope('key', 'model'); cache.remember(scope, call());
  const unsigned = call(); delete unsigned.extra_content;
  for (const other of [cache.scope('other', 'model'), cache.scope('key', 'other')]) assert.throws(() => cache.restore(other, body(unsigned)));
  for (const changed of [{ ...unsigned, id: 'other' }, { ...unsigned, function: { name: 'read', arguments: '{"path":"different"}' } }]) assert.throws(() => cache.restore(scope, body(changed)));
  now = 11; assert.throws(() => cache.restore(scope, body(unsigned)));
});
test('fragmented SSE captures parallel call metadata without parsing hidden reasoning', () => {
  const cache = new GeminiSignatures(); const scope = cache.scope('key', 'model'); const collector = cache.collector(scope);
  const signed = call();
  const first = { ...signed, index: 0, function: { name: 'read', arguments: '{"path":' } };
  const frames = [{ choices: [{ index: 0, delta: { tool_calls: [first] } }] }, { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"source.mjs"}' } }] }, finish_reason: 'tool_calls' }] }].map(f => 'data: ' + JSON.stringify(f) + '\n\n').join('');
  for (let i = 0; i < frames.length; i += 7) collector.push(Buffer.from(frames.slice(i, i + 7)));
  collector.finish(); const unsigned = call(); delete unsigned.extra_content;
  assert.equal(cache.restore(scope, body(unsigned)).messages[0].tool_calls[0].extra_content.google.thought_signature, 'opaque-test-signature');
});
test('unsigned responses never create invented signatures or bypass sentinels', () => {
  const cache = new GeminiSignatures(); const unsigned = call(); delete unsigned.extra_content;
  cache.remember('scope', unsigned); assert.throws(() => cache.restore('scope', body(unsigned)));
});
test('parallel unsigned companions require their original signed anchor in the same message', () => {
  const cache = new GeminiSignatures(); const signed = call(); const companion = { ...call(), id: 'parallel' }; delete companion.extra_content;
  cache.rememberGroup('scope', [signed, companion]);
  const unsigned = structuredClone(signed); delete unsigned.extra_content;
  const restored = cache.restore('scope', { messages: [{ role: 'assistant', tool_calls: [unsigned, companion] }] });
  assert.ok(restored.messages[0].tool_calls[0].extra_content.google.thought_signature);
  assert.equal(restored.messages[0].tool_calls[1].extra_content, undefined);
  assert.throws(() => cache.restore('scope', body(companion)));
});
test('Google indexless parallel frames remain separate and survive split assistant messages', () => {
  const cache = new GeminiSignatures(); const collector = cache.collector('scope'); const signed = call();
  const second = { ...call(), id: 'second-call', function: { name: 'write', arguments: '{"path":"test.mjs"}' } }; delete second.extra_content;
  for (const c of [signed, second]) collector.push(Buffer.from('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [c] } }] }) + '\n\n'));
  collector.push(Buffer.from('data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n')); collector.finish();
  const unsigned = structuredClone(signed); delete unsigned.extra_content;
  const restored = cache.restore('scope', { messages: [{ role: 'assistant', tool_calls: [unsigned] }, { role: 'assistant', tool_calls: [second] }] });
  assert.equal(restored.messages[0].tool_calls[0].extra_content.google.thought_signature, 'opaque-test-signature');
  assert.equal(restored.messages[1].tool_calls[0].extra_content, undefined);
});
