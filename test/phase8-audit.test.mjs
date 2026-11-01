import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPlan,
  extractReferencedFiles,
  extractTestCommand,
  parseSubtasksFromPrompt,
  WORKFLOW_MODES
} from '../src/workspace/planner.mjs';
import {
  createWorkflowInstance,
  saveWorkflow,
  loadWorkflow,
  executeStep,
  runWorkflow,
  retryStep,
  rollbackToCheckpoint,
  WORKFLOW_STATUS,
  STEP_STATUS
} from '../src/workspace/workflow-engine.mjs';
import { createCheckpoint, restoreCheckpoint, previewCheckpointRestore } from '../src/workspace/checkpoints.mjs';
import { POLICIES } from '../src/workspace/models.mjs';
import { BudgetLedger } from '../src/workspace/budget-ledger.mjs';

function mockCatalog() {
  return {
    providers: {
      gemini: {
        enabled: true,
        allowed: true,
        models: ['gemini-2.5-flash'],
        modelsDetailed: {
          'gemini-2.5-flash': {
            id: 'gemini-2.5-flash',
            provider: 'gemini',
            name: 'Gemini 2.5 Flash',
            tier: 'free',
            freeTierVerified: true,
            pricing: { prompt: 0, completion: 0, request: 0 },
            contextWindow: 1048576,
            tools: true
          }
        }
      },
      groq: {
        enabled: true,
        allowed: true,
        models: ['llama-3.1-8b-instant'],
        modelsDetailed: {
          'llama-3.1-8b-instant': {
            id: 'llama-3.1-8b-instant',
            provider: 'groq',
            name: 'Llama 3.1 8B Instant',
            tier: 'free',
            freeTierVerified: true,
            pricing: { prompt: 0, completion: 0, request: 0 },
            contextWindow: 131072,
            tools: true
          }
        }
      },
      openrouter: {
        enabled: true,
        allowed: true,
        models: ['llama-3.3-70b-instruct:free'],
        modelsDetailed: {
          'llama-3.3-70b-instruct:free': {
            id: 'llama-3.3-70b-instruct:free',
            provider: 'openrouter',
            name: 'Llama 3.3 70B Instruct (Free)',
            tier: 'free',
            freeTierVerified: true,
            pricing: { prompt: 0, completion: 0, request: 0 },
            contextWindow: 131072,
            tools: true
          }
        }
      }
    }
  };
}

function setupTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'localagent-audit-'));
  writeFileSync(join(dir, 'existing-code.js'), 'export const existing = true;\n', 'utf8');
  writeFileSync(join(dir, 'personal-notes.txt'), 'Important user notes — do not touch\n', 'utf8');
  return dir;
}

test('audit 1: planner generates dynamic executable DAG from subtasks with target files and dependencies', () => {
  const prompt = `
1. Investigate existing token format in src/token.mjs
2. Implement HMAC token signing in src/token.mjs and src/signer.mjs
3. Run test suite using npm test
  `.trim();

  const catalog = mockCatalog();
  const plan = createPlan({
    prompt,
    mode: WORKFLOW_MODES.CUSTOM,
    policy: POLICIES.FREE_ONLY,
    catalog
  });

  assert.equal(plan.mode, 'custom');
  assert.equal(plan.stages.length, 3);

  // Step 1: researcher / investigator
  const s1 = plan.stages[0];
  assert.equal(s1.agent, 'researcher');
  assert.ok(s1.targetFiles.includes('src/token.mjs'));
  assert.deepEqual(s1.dependsOn, []);

  // Step 2: implementer
  const s2 = plan.stages[1];
  assert.equal(s2.agent, 'implementer');
  assert.ok(s2.targetFiles.includes('src/signer.mjs'));
  assert.deepEqual(s2.dependsOn, [s1.id]);

  // Step 3: tester
  const s3 = plan.stages[2];
  assert.equal(s3.agent, 'tester');
  assert.deepEqual(s3.dependsOn, [s2.id]);

  // All steps have assigned models
  for (const s of plan.stages) {
    assert.ok(s.assignedModel, `Step ${s.id} must have assigned model`);
  }
});

test('audit 2 & 3: invalid conflicting plan is rejected; independent parallel steps and an explicit sequential successor execute', async () => {
  const dir = setupTempWorkspace();
  const catalog = mockCatalog();

  try {
    const customStages = [
      {
        id: 'parallel-work',
        type: 'parallel',
        steps: [
          {
            id: 'task-a',
            title: 'Modify Module A',
            agent: 'implementer',
            assignedModel: 'gemini/gemini-2.5-flash',
            targetFiles: ['src/moduleA.js']
          },
          {
            id: 'task-b',
            title: 'Modify Module B',
            agent: 'implementer',
            assignedModel: 'openrouter/llama-3.3-70b-instruct:free',
            targetFiles: ['src/moduleB.js']
          },
          {
            id: 'task-c',
            title: 'Conflicting Edit on Module A',
            agent: 'implementer',
            assignedModel: 'groq/llama-3.1-8b-instant',
            targetFiles: ['src/moduleA.js'] // Conflicts with task-a!
          }
        ]
      }
    ];

    const plan = createPlan({
      prompt: 'Execute parallel tasks with file conflict',
      customStages,
      catalog,
      workspaceDir: dir
    });

    assert.throws(() => createWorkflowInstance({ plan, workspaceDir: dir }), /parallel_file_write_conflict/);
    plan.stages.push(plan.stages[0].steps.pop());
    const instance = createWorkflowInstance({ plan, workspaceDir: dir });
    const executedModels = [];
    const executionLogs = [];

    // Custom test runner measuring execution order and model fidelity
    const runner = async ({ step }) => {
      executionLogs.push({ stepId: step.id, timestamp: Date.now() });
      executedModels.push({ stepId: step.id, model: step.assignedModel, agent: step.agent });
      return { verified: true, output: `Completed ${step.id}` };
    };

    const outcome = await runWorkflow({
      workflowId: instance.id,
      workspaceDir: dir,
      catalog,
      runner
    });

    assert.equal(outcome.status, WORKFLOW_STATUS.COMPLETED);
    assert.equal(executedModels.length, 3);

    // Verify exact model and agent fidelity
    assert.deepEqual(executedModels.find(m => m.stepId === 'task-a'), {
      stepId: 'task-a',
      model: 'gemini/gemini-2.5-flash',
      agent: 'implementer'
    });
    assert.deepEqual(executedModels.find(m => m.stepId === 'task-b'), {
      stepId: 'task-b',
      model: 'openrouter/llama-3.3-70b-instruct:free',
      agent: 'implementer'
    });
    assert.deepEqual(executedModels.find(m => m.stepId === 'task-c'), {
      stepId: 'task-c',
      model: 'groq/llama-3.1-8b-instant',
      agent: 'implementer'
    });

    // Verify task-c ran AFTER task-a because of file lock conflict
    const order = executionLogs.map(l => l.stepId);
    assert.ok(order.indexOf('task-c') > order.indexOf('task-a'), 'task-c must be serialized after task-a');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('audit 4: runWorkflow executes bounded repeat loop with failure handoff and terminates on success', async () => {
  const dir = setupTempWorkspace();
  const catalog = mockCatalog();

  try {
    const plan = createPlan({
      prompt: 'Implement feature with test and review loop',
      templateId: 'feature-implement-verify',
      policy: POLICIES.FREE_ONLY,
      catalog,
      workspaceDir: dir
    });

    const instance = createWorkflowInstance({ plan, workspaceDir: dir });
    let loopIterationCount = 0;
    let reviewerCalls = 0;
    const handoffsReceived = [];

    const runner = async ({ step, promptText }) => {
      if (promptText.includes('[Handoff Context')) {
        handoffsReceived.push(promptText);
      }

      if (step.id === 'run-test-suite') {
        loopIterationCount += 1;
        if (loopIterationCount === 1) {
          // Iteration 1 fails tests
          return { verified: true, output: 'FAIL: AssertionError: result is false', testPassed: false };
        }
        // Iteration 2 passes tests
        return { verified: true, output: 'PASS: 15/15 tests passed', testPassed: true };
      }

      if (step.id === 'review-criteria') {
        reviewerCalls++;
        if (loopIterationCount === 1) {
          return { verified: true, output: 'Changes requested: Fix assertion failure', reviewerApproved: false };
        }
        return { verified: true, output: 'Approved: Clean implementation', reviewerApproved: true };
      }

      return { verified: true, output: 'Step completed (fixture)', testPassed: step.agent === 'tester' ? true : undefined };
    };

    const outcome = await runWorkflow({
      workflowId: instance.id,
      workspaceDir: dir,
      catalog,
      runner
    });

    assert.equal(outcome.status, WORKFLOW_STATUS.COMPLETED);
    // Verified loop ran exactly 2 iterations, not more
    assert.equal(loopIterationCount, 2);
    // Verified iteration 2 received failure handoff context
    assert.ok(handoffsReceived.length >= 1);
    assert.ok(handoffsReceived[0].includes('AssertionError: result is false'));
    assert.equal(reviewerCalls, 1, 'review must wait for passing predecessor tests');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('audit 4b: repeat loop exhausts after maxIterations and halts workflow without infinite looping', async () => {
  const dir = setupTempWorkspace();
  const catalog = mockCatalog();

  try {
    const plan = createPlan({
      prompt: 'Fix stubborn defect',
      templateId: 'bug-diagnose-fix',
      policy: POLICIES.FREE_ONLY,
      catalog,
      workspaceDir: dir
    });

    const instance = createWorkflowInstance({ plan, workspaceDir: dir });
    let attempts = 0;

    const runner = async ({ step }) => {
      if (step.id.includes('test')) {
        attempts += 1;
        // Tests always fail
        return { verified: true, output: 'FAIL: Continuous regression', testPassed: false };
      }
      return { verified: true, output: 'Fix attempted' };
    };

    const outcome = await runWorkflow({
      workflowId: instance.id,
      workspaceDir: dir,
      catalog,
      runner
    });

    assert.equal(outcome.status, WORKFLOW_STATUS.FAILED);
    assert.equal(attempts, 3, 'Must halt after exactly 3 iterations');

    const loaded = loadWorkflow(instance.id, dir);
    assert.equal(loaded.status, WORKFLOW_STATUS.FAILED);
    assert.ok(loaded.cancellationReason.includes('exhausted after 3 iterations'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('audit 5: budget ledger strictly blocks paid model reservations under Free Only policy', () => {
  const ledger = new BudgetLedger({ storageFile: null, policy: POLICIES.FREE_ONLY });

  // 1. Free model is admitted with $0.00 spend
  const freeRes = ledger.reserve({
    model: { id: 'gemini-2.5-flash', tier: 'free', pricing: { prompt: 0, completion: 0 } },
    estimatedInputTokens: 2000,
    maxOutputTokens: 1000
  });
  assert.equal(freeRes.allowed, true);
  assert.equal(freeRes.amountUsd, 0.0);

  // 2. Paid model is strictly blocked before inference dispatch
  const paidRes = ledger.reserve({
    model: { id: 'claude-3.5-sonnet', tier: 'paid', pricing: { prompt: 0.000003, completion: 0.000015 } },
    estimatedInputTokens: 2000,
    maxOutputTokens: 1000
  });
  assert.equal(paidRes.allowed, false);
  assert.equal(paidRes.code, 'free_only_policy_violation');
});

test('audit 6: approved checkpoint restoration preserves unrelated user edits', () => {
  const dir = setupTempWorkspace();

  try {
    // 1. Take checkpoint
    const chk = createCheckpoint({
      workspaceDir: dir,
      workflowId: 'wf-audit-restore',
      stageId: 'implement-step',
      targetFiles: ['existing-code.js'],
      description: 'Pre-edit snapshot'
    });

    // 2. Modify tracked file and concurrently edit unrelated personal notes
    writeFileSync(join(dir, 'existing-code.js'), 'CORRUPTED DATA\n', 'utf8');
    writeFileSync(join(dir, 'personal-notes.txt'), 'User notes modified during task\n', 'utf8');
    writeFileSync(join(dir, 'unrelated-file.txt'), 'New user file\n', 'utf8');

    // 3. Rollback
    const preview = previewCheckpointRestore({ workspaceDir: dir, checkpointId: chk.checkpointId });
    const res = restoreCheckpoint({ workspaceDir: dir, checkpointId: chk.checkpointId, approval: { approved: true, token: preview.token } });
    assert.equal(res.success, true);

    // Tracked file restored
    assert.equal(readFileSync(join(dir, 'existing-code.js'), 'utf8'), 'export const existing = true;\n');

    // UNRELATED USER FILES MUST BE 100% PRESERVED
    assert.equal(readFileSync(join(dir, 'personal-notes.txt'), 'utf8'), 'User notes modified during task\n');
    assert.equal(readFileSync(join(dir, 'unrelated-file.txt'), 'utf8'), 'New user file\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

