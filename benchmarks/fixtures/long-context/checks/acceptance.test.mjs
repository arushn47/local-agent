import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAmount} from './amount.mjs';

test('formats positive, zero and sub-unit amounts', () => {
  assert.equal(formatAmount(5), '0.05');
  assert.equal(formatAmount(0), '0.00');
  assert.equal(formatAmount(123456), '1234.56');
});
test('negative amounts use parentheses and no separators', () => {
  assert.equal(formatAmount(-1234), '(12.34)');
  assert.equal(formatAmount(-5), '(0.05)');
});
