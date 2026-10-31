import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {clamp, add} from './index.mjs';
import * as math from './math.mjs';

test('public API is unchanged', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(add(1, 2), 3);
});
test('clamp lives in its own module', () => {
  assert.ok(existsSync(new URL('./clamp.mjs', import.meta.url)), 'clamp.mjs is missing');
  assert.equal('clamp' in math, false, 'math.mjs still defines clamp');
  assert.doesNotMatch(readFileSync(new URL('./math.mjs', import.meta.url), 'utf8'), /function clamp|clamp\s*=/);
});
