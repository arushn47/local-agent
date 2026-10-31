import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, linkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { loadConfig } from '../src/config.mjs';
import { createWorkflowInstance, loadWorkflow, rollbackToCheckpoint } from '../src/workspace/workflow-engine.mjs';
import { createCheckpoint, restoreCheckpoint, previewCheckpointRestore, getCheckpoint } from '../src/workspace/checkpoints.mjs';
import { validatePlan } from '../src/workspace/planner.mjs';

const plan = () => ({ id: 'wf-safe', title: 'Safe fixture', policy: 'free_only', stages: [{ id: 'step-a', agent: 'implementer', title: 'Edit source', targetFiles: ['source.js'] }] });
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'localagent-security-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'source.js'), 'original\n');
  return dir;
}

test('identifiers, prototype keys, malformed graph shapes and private paths fail before persistence', t => {
  const dir = setup(t);
  for (const id of ['../escape', '..', 'a/b', 'C:outside', 'constructor', '__proto__', 'a.b', 'a'.repeat(101)]) {
    const p = plan(); p.id = id;
    assert.throws(() => createWorkflowInstance({ plan: p, workspaceDir: dir }), /invalid_workflow/);
    assert.throws(() => loadWorkflow(id, dir), /invalid_workflow/);
  }
  for (const path of ['../outside', 'C:\\outside', '/outside', 'src/../../outside', '.env.local', '.localagent/credentials.json', '.npmrc', '.git-credentials', '.kube/config', 'auth.json', 'src/secret.key', 'src/file:stream', 'src/NUL.js', 'src/file.']) {
    const p = plan(); p.stages[0].targetFiles = [path];
    assert.equal(validatePlan(p).valid, false, path);
    assert.throws(() => createCheckpoint({ workspaceDir: dir, targetFiles: [path] }), /private_|invalid_/);
  }
  for (const stages of [null, 'text', [{}], [{ id: 'a', type: 'parallel', steps: 'text' }], [{ id: 'a', agent: 'constructor' }]]) {
    assert.equal(validatePlan({ ...plan(), stages }).valid, false);
  }
  assert.equal(existsSync(join(dir, '.localagent')), false);
});

test('checkpoint restore requires approval bound to exact current bytes and owner; changed files stay untouched', t => {
  const dir = setup(t);
  const chk = createCheckpoint({ workspaceDir: dir, workflowId: 'wf-safe', targetFiles: ['source.js', 'new.js'] });
  writeFileSync(join(dir, 'source.js'), 'agent edit\n');
  writeFileSync(join(dir, 'new.js'), 'created\n');
  const preview = previewCheckpointRestore({ workspaceDir: dir, checkpointId: chk.checkpointId, workflowId: 'wf-safe' });
  assert.throws(() => restoreCheckpoint({ workspaceDir: dir, checkpointId: chk.checkpointId }), /approval_required/);
  assert.throws(() => previewCheckpointRestore({ workspaceDir: dir, checkpointId: chk.checkpointId, workflowId: 'different' }), /owner/);
  writeFileSync(join(dir, 'new.js'), 'user edit after preview\n');
  assert.throws(() => restoreCheckpoint({ workspaceDir: dir, checkpointId: chk.checkpointId, approval: { approved: true, token: preview.token } }), /conflict/);
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'agent edit\n');
  assert.equal(readFileSync(join(dir, 'new.js'), 'utf8'), 'user edit after preview\n');
  const fresh = previewCheckpointRestore({ workspaceDir: dir, checkpointId: chk.checkpointId });
  restoreCheckpoint({ workspaceDir: dir, checkpointId: chk.checkpointId, approval: { approved: true, token: fresh.token } });
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'original\n');
  assert.equal(existsSync(join(dir, 'new.js')), false);
});

test('links, junctions and hardlinks cannot read snapshots, restore files or redirect state', t => {
  const dir = setup(t);
  const outside = join(dir, 'outside'); mkdirSync(outside);
  writeFileSync(join(outside, 'valuable.js'), 'untouched\n');
  symlinkSync(outside, join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  linkSync(join(outside, 'valuable.js'), join(dir, 'hard.js'));
  for (const path of ['linked/valuable.js', 'hard.js']) assert.throws(() => createCheckpoint({ workspaceDir: dir, targetFiles: [path] }), /link/);
  mkdirSync(join(dir, '.localagent'));
  symlinkSync(outside, join(dir, '.localagent', 'workflows'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => createWorkflowInstance({ workspaceDir: dir, plan: plan() }), /link/);
  assert.deepEqual(readdirSync(outside), ['valuable.js']);
  assert.equal(readFileSync(join(outside, 'valuable.js'), 'utf8'), 'untouched\n');
});

test('corrupt snapshots, binary files, duplicate workflows and active rollback fail closed', t => {
  const dir = setup(t);
  writeFileSync(join(dir, 'binary.js'), Buffer.from([0, 255]));
  assert.throws(() => createCheckpoint({ workspaceDir: dir, targetFiles: ['binary.js'] }), /binary/);
  const wf = createWorkflowInstance({ workspaceDir: dir, plan: plan() });
  assert.throws(() => createWorkflowInstance({ workspaceDir: dir, plan: plan() }), /already_exists/);
  const chk = createCheckpoint({ workspaceDir: dir, workflowId: wf.id, targetFiles: ['source.js'] });
  const file = join(dir, '.localagent', 'checkpoints', `${chk.checkpointId}.json`);
  const altered = JSON.parse(readFileSync(file, 'utf8')); altered.files[0].content = 'tampered'; writeFileSync(file, JSON.stringify(altered));
  assert.throws(() => getCheckpoint({ workspaceDir: dir, checkpointId: chk.checkpointId }), /invalid_checkpoint/);
  assert.throws(() => rollbackToCheckpoint(wf.id, chk.checkpointId, dir), /invalid_checkpoint/);
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'original\n');
});

test('authenticated workflow API rejects malformed plans, paid activation and unsafe rollback without dispatch', async t => {
  const dir = setup(t); let dispatched = 0;
  const server = createWorkspaceServer({ config: loadConfig(), projects: { get: () => ({ id: 'project', path: dir }) }, tasks: { active: () => false }, credentials: {}, engine: { forProject: () => { dispatched++; throw Error('must_not_dispatch'); } }, port: 0 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base); await response.text();
  const headers = { cookie: response.headers.get('set-cookie').split(';')[0], origin: base, 'X-LocalAgent-Request': '1', 'Content-Type': 'application/json' };
  const post = (path, body) => fetch(base + '/api/v1/projects/project/workflows' + path, { method: 'POST', headers, body: JSON.stringify(body) });
  for (const body of [null, [], { plan: { ...plan(), id: '../outside' } }, { plan: { ...plan(), stages: 'wrong' } }, { plan: { ...plan(), policy: 'paid_allowed' } }]) assert.equal((await post('', body)).status, 400);
  assert.equal((await post('', { plan: plan() })).status, 409);
  assert.equal((await post('', { plan: plan(), autoStart: false })).status, 201);
  assert.equal((await post('', { plan: plan(), autoStart: false })).status, 400);
  const chk = createCheckpoint({ workspaceDir: dir, workflowId: 'other-owner', targetFiles: ['source.js'] });
  assert.equal((await post('/wf-safe/rollback-preview', { checkpointId: chk.checkpointId })).status, 400);
  const owned = createCheckpoint({ workspaceDir: dir, workflowId: 'wf-safe', targetFiles: ['source.js'] });
  writeFileSync(join(dir, 'source.js'), 'current user contents\n');
  assert.equal((await post('/wf-safe/rollback', { checkpointId: owned.checkpointId })).status, 428);
  const preview = await (await post('/wf-safe/rollback-preview', { checkpointId: owned.checkpointId })).json();
  writeFileSync(join(dir, 'source.js'), 'newer user contents\n');
  assert.equal((await post('/wf-safe/rollback', { checkpointId: owned.checkpointId, approval: { approved: true, token: preview.token } })).status, 409);
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'newer user contents\n');
  const reviewed = await (await post('/wf-safe/rollback-preview', { checkpointId: owned.checkpointId })).json();
  assert.equal((await post('/wf-safe/rollback', { checkpointId: owned.checkpointId, approval: { approved: true, token: reviewed.token } })).status, 200);
  assert.equal(loadWorkflow('wf-safe', dir).status, 'paused');
  assert.equal(loadWorkflow('wf-safe', dir).requiresReplan, true);
  assert.equal(dispatched, 0);
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'original\n');
});
