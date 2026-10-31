import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFidelity, LIVE_COMPACTION_EXPECTATIONS} from '../src/workspace/summary-fidelity.mjs';

const faithful = 'The objective was to fix the deploy retry bug in poll.mjs. Constraint: free models only. ' +
  'Unresolved: the deploy poller timeout. Pending: add a regression test. Files read: history.txt.';

test('a post-compaction answer must still carry every seeded fact', () => {
  const result = checkFidelity(faithful, LIVE_COMPACTION_EXPECTATIONS);
  assert.deepEqual(result, {passed:true, checked:5, missing:[]});
  assert.equal(checkFidelity(faithful.toUpperCase(), LIVE_COMPACTION_EXPECTATIONS).passed, true);
});

test('dropped facts are reported by name, not silently tolerated', () => {
  const result = checkFidelity('The objective was the retry bug in poll.mjs. Constraint: free models only.', LIVE_COMPACTION_EXPECTATIONS);
  assert.equal(result.passed, false);
  assert.deepEqual(result.missing.map(m => m.label), ['unresolvedError','pendingTask','readFiles']);
  assert.equal(result.checked, 5);
});

test('empty, missing or malformed input never counts as faithful', () => {
  for (const answer of [undefined, null, '', '   ', {}]) {
    const result = checkFidelity(answer, LIVE_COMPACTION_EXPECTATIONS);
    assert.equal(result.passed, false);
    assert.equal(result.missing.length, 5);
  }
  assert.deepEqual(checkFidelity(faithful, [{label:'broken', any:[]}]).missing, [{label:'broken', reason:'no_keywords'}]);
});
