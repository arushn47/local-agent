import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, TASK_MARKER } from './duration.mjs';

test('preserves task marker from the specification', () => assert.equal(TASK_MARKER, 'copper-heron-472'));
for (const [input, expected] of [
  ['250ms', 250], ['1.5s', 1500], ['1h30m', 5400000], ['2 m 5 s', 125000],
  [' 1H 2M 3S 4MS ', 3723004], ['0ms', 0], ['1s 2s', 3000], ['.5s', 500],
]) test(`parses ${JSON.stringify(input)}`, () => assert.equal(parseDuration(input), expected));
for (const input of ['', ' ', '123', '-1s', '1fortnight', '1s junk', 'junk1s', '1s-2m', '1..2s']) {
  test(`rejects ${JSON.stringify(input)}`, () => assert.throws(() => parseDuration(input), TypeError));
}
for (const input of [null, undefined, 42, {}]) {
  test(`rejects non-string ${String(input)}`, () => assert.throws(() => parseDuration(input), TypeError));
}
