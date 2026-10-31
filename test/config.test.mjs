import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment, loadConfig } from '../src/config.mjs';
import { readFileSync } from 'node:fs';

test('.env values and process environment take precedence over blank setup placeholders', t => {
  const directory = mkdtempSync(join(tmpdir(), 'localagent-env-')); const a = join(directory, '.env'); const b = join(directory, '.env.local');
  t.after(() => { unlinkSync(a); unlinkSync(b); rmdirSync(directory); });
  writeFileSync(a, 'GEMINI_API_KEY="example"\nGEMINI_FREE_TIER_CONFIRMED=true\nGROQ_API_KEY=\n');
  writeFileSync(b, 'GEMINI_API_KEY=\nGEMINI_FREE_TIER_CONFIRMED=false\nGROQ_API_KEY=groq-example\n');
  const env = loadEnvironment([a,b], { GEMINI_API_KEY: 'inherited' });
  assert.equal(env.GEMINI_API_KEY, 'inherited'); assert.equal(env.GEMINI_FREE_TIER_CONFIRMED, 'true'); assert.equal(env.GROQ_API_KEY, 'groq-example');
});

test('opt-in efficiency settings are validated instead of being ignored', t => {
  const directory = mkdtempSync(join(tmpdir(), 'localagent-config-'));
  const path = join(directory, 'localagent.config.json');
  const base = JSON.parse(readFileSync('localagent.config.json', 'utf8'));
  const previous = process.env.LOCALAGENT_CONFIG;
  t.after(() => {
    if (previous === undefined) delete process.env.LOCALAGENT_CONFIG; else process.env.LOCALAGENT_CONFIG = previous;
    unlinkSync(path); rmdirSync(directory);
  });
  process.env.LOCALAGENT_CONFIG = path;
  writeFileSync(path, JSON.stringify({...base, executionGuidance:'yes'}));
  assert.throws(() => loadConfig(), /Invalid executionGuidance/);
  writeFileSync(path, JSON.stringify({...base, executionGuidance:true}));
  assert.equal(loadConfig().executionGuidance, true);
  writeFileSync(path, JSON.stringify(base));
  assert.equal(loadConfig().executionGuidance, undefined);
});
