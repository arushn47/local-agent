// Deterministic benchmark spine. Each fixture must fail its acceptance checks
// before the reference fix and pass after it. No model, network or installs.
//
//   node scripts/verify-benchmarks.mjs                 # verify fixtures
//   node scripts/verify-benchmarks.mjs --write-manifest
//
// Live arms (baseline OpenCode / current LocalAgent / optimized LocalAgent) are
// prepared here but require explicit owner approval to run.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = 'benchmarks', fixturesDirectory = join(root, 'fixtures'), output = 'validation/phase65';
const manifestPath = join(root, 'manifest.json');
const writeManifest = process.argv.includes('--write-manifest');
mkdirSync(output, {recursive:true});
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = directory => {
  const found = [];
  const walk = current => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path); else found.push(path);
    }
  };
  walk(directory);
  return found;
};
const snapshot = directory => Object.fromEntries(files(directory).map(path => [relative(directory, path), hash(path)]));
const runTests = directory => spawnSync(process.execPath, ['--test'], {cwd:directory, encoding:'utf8', timeout:120000});
const checkCounts = result => {
  const pass = Number((result.stdout.match(/ℹ pass (\d+)/) || [])[1] ?? NaN);
  const fail = Number((result.stdout.match(/ℹ fail (\d+)/) || [])[1] ?? NaN);
  return {pass, fail, status:result.status};
};
const fixtures = readdirSync(fixturesDirectory).filter(name => existsSync(join(fixturesDirectory, name, 'task.md'))).sort();
assert.ok(fixtures.length >= 4, 'benchmark fixtures are missing');

const observed = {};
if (writeManifest) {
  for (const name of fixtures) {
    const base = join(fixturesDirectory, name);
    observed[name] = {task:hash(join(base,'task.md')), repo:snapshot(join(base,'repo')), checks:snapshot(join(base,'checks')), solution:snapshot(join(base,'solution'))};
  }
  writeFileSync(manifestPath, JSON.stringify({version:1, fixtures:observed}, null, 2));
  console.log(`wrote ${manifestPath} for ${fixtures.length} fixtures`);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const report = {fixtures:[], checks:{}, inferenceRequests:0};
  for (const name of fixtures) {
    const base = join(fixturesDirectory, name), expected = manifest.fixtures[name];
    assert.ok(expected, `fixture ${name} is not in the manifest; re-run with --write-manifest`);
    // Fixtures are immutable: editing task/repo/checks/solution requires a manifest update.
    assert.deepEqual({task:hash(join(base,'task.md')), repo:snapshot(join(base,'repo')), checks:snapshot(join(base,'checks')), solution:snapshot(join(base,'solution'))}, expected,
      `fixture ${name} changed without updating the manifest`);

    const workspace = mkdtempSync(join(tmpdir(), `localagent-bench-${name}-`));
    try {
      const repo = join(workspace, 'repo');
      cpSync(join(base,'repo'), repo, {recursive:true});
      for (const check of files(join(base,'checks'))) cpSync(check, join(repo, relative(join(base,'checks'), check)));

      const baseline = checkCounts(runTests(repo));
      assert.notEqual(baseline.status, 0, `${name}: the unfixed fixture already passes`);
      assert.ok(baseline.fail > 0, `${name}: baseline produced no failing test (syntax error?)`);

      for (const solution of files(join(base,'solution'))) cpSync(solution, join(repo, relative(join(base,'solution'), solution)));
      const solved = checkCounts(runTests(repo));
      assert.equal(solved.status, 0, `${name}: the reference solution does not pass`);
      assert.ok(solved.pass > 0, `${name}: the reference solution ran no tests`);

      report.fixtures.push({name, baseline:{fail:baseline.fail, pass:baseline.pass}, solved:{pass:solved.pass}, taskBytes:statSync(join(base,'task.md')).size, repoBytes:files(join(base,'repo')).reduce((sum,p)=>sum+statSync(p).size,0)});
      report.checks[name] = true;
    } finally { rmSync(workspace, {recursive:true, force:true}); }
  }
  report.passed = Object.values(report.checks).every(Boolean) && report.fixtures.length === fixtures.length;
  writeFileSync(join(output, 'benchmarks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({passed:report.passed, fixtures:report.fixtures.map(f=>f.name)}, null, 0));
  assert.ok(report.passed, 'benchmark fixture verification failed');
}
