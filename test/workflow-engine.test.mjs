import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCheckpoint,
  restoreCheckpoint,
  listCheckpoints,
  getCheckpoint
} from '../src/workspace/checkpoints.mjs';
import {
  createWorkflowInstance,
  saveWorkflow,
  loadWorkflow,
  listWorkflows,
  pauseWorkflow,
  resumeWorkflow,
  cancelWorkflow,
  retryStep,
  rollbackToCheckpoint,
  WORKFLOW_STATUS,
  STEP_STATUS
} from '../src/workspace/workflow-engine.mjs';
import { createPlan } from '../src/workspace/planner.mjs';
import { POLICIES } from '../src/workspace/models.mjs';

function setupWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'localagent-wf-test-'));
  // Create an existing source file and an unrelated user file
  writeFileSync(join(dir, 'source.js'), 'const version = 1;\n', 'utf8');
  writeFileSync(join(dir, 'unrelated-notes.txt'), 'User personal notes\n', 'utf8');
  return dir;
}

test('checkpoint creation captures snapshot and safely restores without touching unrelated user files', () => {
  const dir = setupWorkspace();
  try {
    // 1. Create checkpoint tracking source.js and new-module.js (which doesn't exist yet)
    const chk = createCheckpoint({
      workspaceDir: dir,
      workflowId: 'wf-123',
      stageId: 'implement-stage',
      targetFiles: ['source.js', 'new-module.js'],
      description: 'Pre-implementation snapshot'
    });

    assert.ok(chk.checkpointId.startsWith('chk_'));
    assert.equal(chk.files.length, 2);
    const sourceRec = chk.files.find(f => f.path === 'source.js');
    assert.equal(sourceRec.exists, true);
    assert.equal(sourceRec.content, 'const version = 1;\n');
    const newModRec = chk.files.find(f => f.path === 'new-module.js');
    assert.equal(newModRec.exists, false);

    // 2. Simulate flawed implementation changes:
    // - source.js is modified with buggy code
    // - new-module.js is created
    // - unrelated-notes.txt is modified by user concurrently
    // - another-unrelated.md is created by user concurrently
    writeFileSync(join(dir, 'source.js'), 'const version = 2; // BROKEN SYNTAX {{{\n', 'utf8');
    writeFileSync(join(dir, 'new-module.js'), 'console.log("bad module");\n', 'utf8');
    writeFileSync(join(dir, 'unrelated-notes.txt'), 'User personal notes - edited by user\n', 'utf8');
    writeFileSync(join(dir, 'another-unrelated.md'), '# Don not touch me\n', 'utf8');

    // 3. Restore checkpoint
    const res = restoreCheckpoint({ workspaceDir: dir, checkpointId: chk.checkpointId });
    assert.equal(res.success, true);
    assert.ok(res.restoredFiles.includes('source.js'));
    assert.ok(res.removedFiles.includes('new-module.js'));

    // 4. Verify outcomes:
    // source.js is restored to version 1
    assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'const version = 1;\n');
    // new-module.js was removed because it was created during flawed step
    assert.equal(existsSync(join(dir, 'new-module.js')), false);
    // CRITICAL: Unrelated files MUST BE PRESERVED and untouched
    assert.equal(readFileSync(join(dir, 'unrelated-notes.txt'), 'utf8'), 'User personal notes - edited by user\n');
    assert.equal(readFileSync(join(dir, 'another-unrelated.md'), 'utf8'), '# Don not touch me\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('workflow instance persists durably to disk and supports pause, resume, and cancel', () => {
  const dir = setupWorkspace();
  try {
    const plan = createPlan({
      prompt: 'Implement auth module',
      templateId: 'feature-implement-verify',
      policy: POLICIES.FREE_ONLY
    });

    // 1. Create workflow instance
    const instance = createWorkflowInstance({ plan, workspaceDir: dir });
    assert.equal(instance.status, WORKFLOW_STATUS.PENDING);
    assert.ok(Object.keys(instance.stepStates).length >= 4);

    // 2. Recover from disk
    const loaded = loadWorkflow(instance.id, dir);
    assert.equal(loaded.id, instance.id);
    assert.equal(loaded.title, instance.title);

    // 3. List workflows
    const list = listWorkflows(dir);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, instance.id);

    // 4. Pause workflow
    const paused = pauseWorkflow(instance.id, dir);
    assert.equal(paused.status, WORKFLOW_STATUS.PAUSED);
    assert.equal(loadWorkflow(instance.id, dir).status, WORKFLOW_STATUS.PAUSED);

    // 5. Resume workflow
    const resumed = resumeWorkflow(instance.id, dir);
    assert.equal(resumed.status, WORKFLOW_STATUS.RUNNING);
    assert.equal(loadWorkflow(instance.id, dir).status, WORKFLOW_STATUS.RUNNING);

    // 6. Cancel workflow
    const cancelled = cancelWorkflow(instance.id, dir, 'user_stopped');
    assert.equal(cancelled.status, WORKFLOW_STATUS.CANCELLED);
    assert.equal(loadWorkflow(instance.id, dir).status, WORKFLOW_STATUS.CANCELLED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retryStep allows model reassignment without replaying completed predecessor steps', () => {
  const dir = setupWorkspace();
  try {
    const plan = createPlan({
      prompt: 'Implement bug fix',
      templateId: 'bug-diagnose-fix',
      policy: POLICIES.FREE_ONLY
    });

    const instance = createWorkflowInstance({ plan, workspaceDir: dir });
    const stepIds = Object.keys(instance.stepStates);
    const step1Id = stepIds[0];
    const step2Id = stepIds[1];

    // Mark step 1 completed
    instance.stepStates[step1Id].status = STEP_STATUS.COMPLETED;
    instance.stepStates[step1Id].output = 'Repro confirmed';

    // Mark step 2 failed
    instance.stepStates[step2Id].status = STEP_STATUS.FAILED;
    instance.stepStates[step2Id].error = 'Timeout on groq';
    instance.status = WORKFLOW_STATUS.FAILED;
    saveWorkflow(instance, dir);

    // Retry step 2 with Gemini Flash
    const retryRes = retryStep(instance.id, step2Id, {
      alternateModelId: 'gemini/gemini-2.5-flash',
      workspaceDir: dir
    });

    assert.equal(retryRes.status, STEP_STATUS.PENDING);
    assert.equal(retryRes.assignedModel, 'gemini/gemini-2.5-flash');

    const reloaded = loadWorkflow(instance.id, dir);
    // Predecessor step 1 remains COMPLETED (no replay)
    assert.equal(reloaded.stepStates[step1Id].status, STEP_STATUS.COMPLETED);
    assert.equal(reloaded.stepStates[step1Id].output, 'Repro confirmed');
    // Failed step is now pending with updated model
    assert.equal(reloaded.stepStates[step2Id].status, STEP_STATUS.PENDING);
    assert.equal(reloaded.stepStates[step2Id].assignedModel, 'gemini/gemini-2.5-flash');
    assert.equal(reloaded.status, WORKFLOW_STATUS.RUNNING);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollbackToCheckpoint restores files and resets workflow step state', () => {
  const dir = setupWorkspace();
  try {
    const chk = createCheckpoint({
      workspaceDir: dir,
      workflowId: 'wf-rollback-test',
      stageId: 'apply-fix',
      targetFiles: ['source.js'],
      description: 'Pre-fix snapshot'
    });

    const plan = createPlan({
      prompt: 'Quick bug fix in parser',
      templateId: 'bug-diagnose-fix',
      policy: POLICIES.FREE_ONLY
    });
    plan.id = 'wf-rollback-test';

    const instance = createWorkflowInstance({ plan, workspaceDir: dir });
    instance.checkpoints.push(chk.checkpointId);

    // Corrupt file
    writeFileSync(join(dir, 'source.js'), 'GARBAGE DATA\n', 'utf8');

    // Rollback
    const res = rollbackToCheckpoint('wf-rollback-test', chk.checkpointId, dir);
    assert.equal(res.success, true);
    assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), 'const version = 1;\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

