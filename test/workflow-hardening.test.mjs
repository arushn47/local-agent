import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkflowInstance, executeStep, runWorkflow, loadWorkflow, retryStep } from '../src/workspace/workflow-engine.mjs';

function fixture(stages = [{ id: 'step-a', type: 'task', title: 'Implement', agent: 'implementer' }]) {
  const dir = mkdtempSync(join(tmpdir(), 'localagent-hardening-'));
  const wf = createWorkflowInstance({ workspaceDir: dir, plan: { id: 'wf-hardening', title: 'Safety fixture', policy: 'free_only', stages } });
  return { dir, wf, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('missing executor and unverified runner output never report success', async () => {
  for (const runner of [null, async () => ({ output: 'All done. Tests pass. APPROVED.' })]) {
    const f = fixture();
    try {
      const result = await runWorkflow({ workflowId: f.wf.id, workspaceDir: f.dir, runner });
      assert.equal(result.status, 'failed');
      assert.equal(loadWorkflow(f.wf.id, f.dir).stepStates['step-a'].status, 'failed');
    } finally { f.cleanup(); }
  }
});

test('OpenCode timeout, observation failure, provider error, and unverified test prose fail closed', async () => {
  for (const scenario of ['timeout', 'observation', 'provider', 'test-prose']) {
    const f = fixture([{ id: 'step-a', type: 'task', title: 'Run tests', agent: 'tester' }]);
    let aborted = 0;
    const engine = { forProject: () => ({ session: {
      create: async () => ({ data: { id: 'ses_fixture' } }),
      promptAsync: async () => {},
      status: async () => { if (scenario === 'observation') throw Error('offline'); return { data: {} }; },
      messages: async () => ({ data: scenario === 'timeout' ? [] : [{ info: { role: 'assistant', finish: 'stop', time: { completed: Date.now() }, ...(scenario === 'provider' ? { error: { name: 'RateLimit' } } : {}) }, parts: [{ type: 'text', text: 'All tests pass. APPROVED.' }] }] }),
      diff: async () => ({ data: [] }),
      abort: async () => { aborted++; }
    } }) };
    try {
      const result = await executeStep({ workflowId: f.wf.id, stepId: 'step-a', workspaceDir: f.dir, engine, executionTimeoutMs: 5, pollIntervalMs: 1 });
      assert.equal(result.status, 'failed', scenario);
      if (scenario !== 'test-prose') assert.equal(aborted, 1);
    } finally { f.cleanup(); }
  }
});

test('blocked dependencies and missing verification cannot complete a workflow', async () => {
  const f = fixture([
    { id: 'step-a', type: 'task', title: 'Depends on later work', agent: 'implementer', dependsOn: ['step-b'] },
    { id: 'step-b', type: 'task', title: 'Later work', agent: 'implementer' }
  ]);
  try {
    await assert.rejects(runWorkflow({ workflowId: f.wf.id, workspaceDir: f.dir, runner: async () => ({ verified: true, output: 'fixture' }) }), /workflow_incomplete_steps/);
    assert.equal(loadWorkflow(f.wf.id, f.dir).status, 'failed');
    assert.throws(() => retryStep(f.wf.id, 'step-b', { workspaceDir: f.dir }), /requires_failed_step/);
  } finally { f.cleanup(); }
});

test('a tester or reviewer needs an explicit verified outcome, including with custom fixture runners', async () => {
  for (const role of ['tester', 'reviewer']) {
    const f = fixture([{ id: 'step-a', type: 'task', title: 'Verify', agent: role }]);
    try {
      const result = await runWorkflow({ workflowId: f.wf.id, workspaceDir: f.dir, runner: async () => ({ verified: true, output: 'All tests pass. APPROVED.' }) });
      assert.equal(result.status, 'failed');
      assert.equal(loadWorkflow(f.wf.id, f.dir).stepStates['step-a'].status, 'failed');
    } finally { f.cleanup(); }
  }
});
