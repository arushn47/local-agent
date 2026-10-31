import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GUIDANCE_MARKER, guidancePath, guidanceText, prepareGuidance, toolOutputLimits} from '../src/workspace/guidance.mjs';

test('guidance stays short, concrete and free of secrets or remote references', () => {
  const text = guidanceText();
  assert.ok(text.startsWith(GUIDANCE_MARKER));
  assert.ok(text.length <= 1800, `guidance is ${text.length} chars`);
  for (const rule of ['grep', 'same unchanged file twice', 'checkpoint', 'Do not claim a test passed', 'first useful error line']) {
    assert.ok(text.includes(rule), `missing rule: ${rule}`);
  }
  assert.ok(!/https?:\/\//.test(text));
  assert.ok(!/api[_-]?key|token\s*=|bearer\s/i.test(text));
  assert.ok(!/[A-Za-z_]\s*=\s*[A-Za-z0-9_\-]{20,}/.test(text), 'guidance looks like it embeds a credential');
});

test('guidance is written only when enabled and never overwrites a foreign file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'localagent-guidance-'));
  const path = guidancePath(directory);
  try {
    assert.deepEqual(await prepareGuidance({profileDirectory:directory, enabled:false}), {path, active:false});
    assert.equal(existsSync(path), false, 'disabled guidance wrote a file');

    assert.deepEqual(await prepareGuidance({profileDirectory:directory, enabled:true}), {path, active:true});
    assert.equal(readFileSync(path, 'utf8'), guidanceText());

    // Removing only touches our own file.
    assert.equal((await prepareGuidance({profileDirectory:directory, enabled:false})).active, false);
    assert.equal(existsSync(path), false);

    mkdirSync(path.slice(0, path.lastIndexOf('/')), {recursive:true});
    writeFileSync(path, 'user-authored instructions\n');
    const result = await prepareGuidance({profileDirectory:directory, enabled:true});
    assert.equal(result.active, false);
    assert.equal(result.skipped, true);
    assert.equal(readFileSync(path, 'utf8'), 'user-authored instructions\n');
  } finally { rmSync(directory, {recursive:true, force:true}); }
});

test('tool-output limits are opt-in and bounded below the upstream defaults', () => {
  assert.equal(toolOutputLimits(false), null);
  assert.equal(toolOutputLimits(undefined), null);
  assert.deepEqual(toolOutputLimits(true), {max_lines:600, max_bytes:16384});
  // Upstream defaults are 2000 lines / 50 KiB; the opt-in bound must be tighter.
  assert.ok(toolOutputLimits(true).max_lines < 2000);
  assert.ok(toolOutputLimits(true).max_bytes < 50 * 1024);
  assert.notEqual(toolOutputLimits(true), toolOutputLimits(true));
});
