// Zero inference. Exercises actual authenticated plan/restore APIs and the
// browser confirmation UI using a disposable project. No catalog mutation.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { loadConfig } from '../src/config.mjs';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { createCheckpoint } from '../src/workspace/checkpoints.mjs';
import { launchBrowser } from './browser.mjs';

const directory = mkdtempSync(join(tmpdir(), 'localagent-recovery-ui-'));
const project = { id: '99999999-9999-9999-9999-999999999999', name: 'Recovery safety fixture', path: directory };
const server = createWorkspaceServer({ config: loadConfig(), projects: { list: () => [project], get: () => project }, tasks: { list: () => [{ id: 'task-safety', title: 'Safety checks' }], snapshot: async () => ({ state: 'idle', messages: [], permissions: [], diffs: [], context: {}, compaction: { count: 0 } }), active: () => false }, credentials: {}, port: 0 });
let browser;
try {
  writeFileSync(join(directory, 'source.js'), 'original\n');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = await fetch(base); await bootstrap.text();
  const headers = { cookie: bootstrap.headers.get('set-cookie').split(';')[0], origin: base, 'X-LocalAgent-Request': '1', 'Content-Type': 'application/json' };
  const response = await fetch(`${base}/api/v1/projects/${project.id}/workflows`, { method: 'POST', headers, body: JSON.stringify({ autoStart: false, plan: { id: 'wf-safety', title: 'Restore safety', policy: 'free_only', stages: [{ id: 'edit', agent: 'implementer', title: 'Edit', targetFiles: ['source.js'] }] } }) });
  assert.equal(response.status, 201);
  createCheckpoint({ workspaceDir: directory, workflowId: 'wf-safety', stageId: 'edit', targetFiles: ['source.js'], description: 'Original source' });
  writeFileSync(join(directory, 'source.js'), 'user changes\n');
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(projectId => localStorage.setItem('localagent.workspace', JSON.stringify({ project: projectId, session: 'task-safety', theme: 'dark', rightPanelOpen: true, inspectorTab: 'workflows' })), project.id);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('button.panel-tab:has-text("Workflows")').click();
  await page.getByText('Workflow execution is temporarily unavailable.', { exact: false }).waitFor();
  const restore = page.getByRole('button', { name: 'Restore Checkpoint', exact: true });
  await restore.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start workflow', exact: true }).isDisabled(), true, 'production start remains disabled');
  const rejected = page.waitForEvent('dialog').then(async dialog => { assert.match(dialog.message(), /source.js/); await dialog.dismiss(); });
  await restore.click(); await rejected;
  assert.equal(readFileSync(join(directory, 'source.js'), 'utf8'), 'user changes\n');
  const stale = page.waitForEvent('dialog').then(async dialog => { writeFileSync(join(directory, 'source.js'), 'newer user changes\n'); await dialog.accept(); });
  await restore.click(); await stale;
  await page.getByRole('alert').filter({ hasText: 'Checkpoint was not restored' }).waitFor();
  assert.equal(readFileSync(join(directory, 'source.js'), 'utf8'), 'newer user changes\n');
  const approved = page.waitForEvent('dialog').then(dialog => dialog.accept());
  const restored = page.waitForResponse(r => r.url().endsWith('/wf-safety/rollback') && r.status() === 200);
  await restore.click(); await approved; await restored;
  assert.equal(readFileSync(join(directory, 'source.js'), 'utf8'), 'original\n');
  const state = await (await fetch(`${base}/api/v1/projects/${project.id}/workflows/wf-safety`, { headers })).json();
  assert.equal(state.status, 'paused'); assert.equal(state.requiresReplan, true);
  console.log(JSON.stringify({ passed: true, inferenceRequests: 0, checks: ['explicit-dismissal-preserves-file', 'post-preview-edit-rejected', 'approved-restore', 'paused-replan-required', 'execution-gate-visible'] }));
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
  rmSync(directory, { recursive: true, force: true });
}
