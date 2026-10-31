import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBudget, ProgressBudget, inputCeiling, compactionSettings } from '../src/context.mjs';
const cap = contextWindow => ({ contextWindow, tools: true });
const windows = [32768, 65536, 131072, 262144, 1048576];
test('model-specific budgets skip incompatible local fallback without altering history', () => {
  const body = { messages: [{ role: 'tool', tool_call_id: 'a', content: 'x'.repeat(12000) }] };
  const original = structuredClone(body);
  assert.equal(requestBudget(body, cap(8192)).fits, false);
  assert.equal(requestBudget(body, cap(32768)).fits, true);
  assert.deepEqual(body, original);
});
test('tool schemas, messages, framing, output and safety margin all consume budget', () => {
  const a = requestBudget({ messages: [{ role: 'user', content: 'hello' }] }, cap(8192));
  const b = requestBudget({ messages: [{ role: 'user', content: 'hello' }], tools: [{ description: 'x'.repeat(6000) }] }, cap(8192));
  assert.ok(b.toolTokens > a.toolTokens); assert.ok(b.overheadTokens > 0);
  assert.equal(a.reservedOutputTokens, 1800); assert.equal(a.safetyMargin, 512);
  assert.equal(a.usableInputBudget, 8192 - 1800 - 512); assert.equal(b.fits, false);
});
test('unknown capabilities fail closed', () => assert.equal(requestBudget({ messages: [] }, null).fits, false));
test('upstream compaction is configured to fire before the guard rejects the same request', () => {
  for (const contextWindow of windows) {
    const settings = compactionSettings(contextWindow, 1800);
    assert.ok(settings, `settings missing for ${contextWindow}`);
    // Upstream estimate is chars/4, so its trigger in guard bytes is 4x this.
    const triggerTokens = contextWindow - settings.buffer;
    assert.ok(4 * triggerTokens < inputCeiling(contextWindow, 1800), `compaction would not precede the guard at ${contextWindow}`);
    // The buffer must dominate the output reservation, otherwise max(output,buffer) wins.
    assert.ok(settings.buffer >= 1800);
    // Recent retention must leave summarizable head room but stay bounded.
    assert.ok(settings.keep.tokens > 0 && settings.keep.tokens < triggerTokens);
    assert.ok(settings.keep.tokens >= 1000 && settings.keep.tokens <= 32000);
    assert.equal(settings.auto, true);
  }
});
test('compaction settings are derived from the unchanged guard ceiling', () => {
  assert.equal(inputCeiling(8192, 1800), 8192 - 1800 - 512);
  assert.equal(compactionSettings(8192, 1800).buffer, 8192 - Math.floor((8192 - 2312) / 4 * .85));
  // Unknown or unusable capacity must not invent a compaction configuration.
  assert.equal(compactionSettings(null), null);
  assert.equal(compactionSettings(0), null);
  assert.equal(compactionSettings(1000, 1800), null);
  const settings = compactionSettings(32768, 1800);
  assert.deepEqual(Object.keys(settings).sort(), ['auto', 'buffer', 'keep']);
  assert.deepEqual(Object.keys(settings.keep), ['tokens']);
});
test('the anchored-summary request fits the guard when compaction triggers', () => {
  for (const contextWindow of windows) {
    const settings = compactionSettings(contextWindow, 1800);
    const triggerBytes = 4 * (contextWindow - settings.buffer);
    // Head = conversation at the trigger minus the retained recent third, plus
    // upstream's fixed summary template. Tools are not sent for summaries.
    const body = { messages: [{ role: 'user', content: 'x'.repeat(Math.floor(triggerBytes * .7) + 1600) }], max_tokens: 1800 };
    const budget = requestBudget(body, cap(contextWindow));
    assert.equal(budget.fits, true, `compaction request would be rejected at ${contextWindow}`);
  }
});
test('a request the guard rejects is one upstream would already have compacted', () => {
  // Exact serialized fixture: 32000 bytes of ASCII history plus fixed framing.
  const body = { messages: [{ role: 'user', content: 'x'.repeat(32000) }], tools: [] };
  const settings = compactionSettings(32768, 1800);
  const budget = requestBudget(body, cap(32768));
  assert.equal(budget.fits, false);
  const upstreamTokens = Math.round(JSON.stringify(body).length / 4);
  assert.ok(upstreamTokens > 32768 - settings.buffer, 'upstream trigger must be crossed before the guard bound');
  // The guard bound itself is unchanged by the reconciliation.
  assert.equal(budget.usableInputBudget, 32768 - 1800 - Math.max(512, Math.ceil(32768 * .05)));
});
test('unchanged overflow terminates immediately, not as a retryable policy failure', () => assert.match(new ProgressBudget().observe({ overflow: true }), /stop unchanged retries/));
test('unproductive compaction terminates and compaction attempts are bounded', () => {
  const p = new ProgressBudget(); assert.equal(p.observe({ compaction: true, size: 100 }), null);
  assert.match(p.observe({ compaction: true, size: 99 }), /insufficient progress/);
  const q = new ProgressBudget(1); q.observe({ compaction: true, size: 100 }); assert.ok(q.observe({ compaction: true, size: 50 }));
});
