// Fixture integrity only: the expensive before/after runs live in
// scripts/verify-benchmarks.mjs so the regression suite stays fast.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = directory => {
  const found = [];
  const visit = current => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) visit(path); else found.push(path);
    }
  };
  visit(directory);
  return found;
};
const snapshot = directory => Object.fromEntries(walk(directory).map(path => [relative(directory, path), hash(path)]));

test('every benchmark fixture has a task, immutable repo, checks and a reference solution', () => {
  const manifest = JSON.parse(readFileSync('benchmarks/manifest.json', 'utf8'));
  const fixtures = readdirSync('benchmarks/fixtures').filter(name => existsSync(join('benchmarks/fixtures', name, 'task.md'))).sort();
  assert.ok(fixtures.length >= 4);
  assert.deepEqual(Object.keys(manifest.fixtures).sort(), fixtures);
  for (const name of fixtures) {
    const base = join('benchmarks/fixtures', name);
    for (const part of ['repo', 'checks', 'solution']) assert.ok(existsSync(join(base, part)), `${name} has no ${part}`);
    assert.ok(walk(join(base, 'checks')).some(file => file.endsWith('.test.mjs')), `${name} has no acceptance test`);
    assert.deepEqual(snapshot(join(base, 'repo')), manifest.fixtures[name].repo, `${name} repo drifted from the manifest`);
    assert.deepEqual(snapshot(join(base, 'checks')), manifest.fixtures[name].checks, `${name} checks drifted`);
    assert.deepEqual(snapshot(join(base, 'solution')), manifest.fixtures[name].solution, `${name} solution drifted`);
    // Acceptance tests must not ship inside the starting repo: the agent has to
    // satisfy them without reading the hidden checks.
    for (const file of walk(join(base, 'repo'))) assert.ok(!file.endsWith('.test.mjs'), `${name} leaks ${file}`);
  }
});
