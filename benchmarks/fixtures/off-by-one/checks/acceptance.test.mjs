import test from 'node:test';
import assert from 'node:assert/strict';
import {range} from './range.mjs';

test('range excludes the stop value', () => {
  assert.deepEqual(range(1, 4), [1, 2, 3]);
  assert.deepEqual(range(-1, 1), [-1, 0]);
});
test('an empty or reversed range yields no values', () => {
  assert.deepEqual(range(3, 3), []);
  assert.deepEqual(range(4, 1), []);
});
