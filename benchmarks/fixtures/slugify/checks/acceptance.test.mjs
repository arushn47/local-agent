import test from 'node:test';
import assert from 'node:assert/strict';
import {slugify} from './slug.mjs';

test('slugify normalizes text', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('  Mixed__Case!! '), 'mixed-case');
  assert.equal(slugify('Already-fine'), 'already-fine');
});
test('slugify bounds length without a trailing separator', () => {
  const long = slugify('a '.repeat(80));
  assert.ok(long.length <= 60);
  assert.ok(!long.endsWith('-'));
  assert.ok(!long.startsWith('-'));
});
test('slugify handles empty and symbol-only input', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});
