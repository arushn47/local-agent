import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEnv} from './parse.mjs';

test('both sides are trimmed', () => {
  assert.deepEqual(parseEnv(' A = hello '), {key: 'A', value: 'hello'});
});
test('values may contain equals and quoted values are unquoted', () => {
  assert.deepEqual(parseEnv('TOKEN=a=b'), {key: 'TOKEN', value: 'a=b'});
  assert.deepEqual(parseEnv('URL="https://x.test/a=b"'), {key: 'URL', value: 'https://x.test/a=b'});
  assert.deepEqual(parseEnv("PATH='a=b'"), {key: 'PATH', value: 'a=b'});
});
test('lines without a value stay empty', () => {
  assert.deepEqual(parseEnv('EMPTY='), {key: 'EMPTY', value: ''});
  assert.deepEqual(parseEnv('ONLY_KEY'), {key: 'ONLY_KEY', value: ''});
});
