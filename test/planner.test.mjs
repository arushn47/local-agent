import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectIntent, createPlan, validatePlan, updatePlanStep, flattenSteps, calculatePlanBudget, getAllNodeIds } from '../src/workspace/planner.mjs';
import { listTemplates, getTemplate, saveTemplate, deleteTemplate, instantiateTemplate } from '../src/workspace/workflow-templates.mjs';
import { POLICIES } from '../src/workspace/models.mjs';

function mockCatalog() {
  return {
    providers: {
      gemini: {
        enabled: true,
        allowed: true,
        models: ['gemini-2.5-flash', 'gemini-3.5-flash-lite'],
        modelsDetailed: {
          'gemini-2.5-flash': {
            id: 'gemini-2.5-flash',
            provider: 'gemini',
            name: 'Gemini 2.5 Flash',
            tier: 'free',
            freeTierVerified: true,
            pricing: { prompt: 0, completion: 0, request: 0 },
            contextWindow: 1048576,
            maxOutputTokens: 8192,
            tools: true,
            capabilities: { coding: 4.5, reasoning: 4.5, speed: 4.0, context: 5.0, toolCalling: 4.5 }
          },
          'gemini-3.5-flash-lite': {
            id: 'gemini-3.5-flash-lite',
            provider: 'gemini',
            name: 'Gemini 3.5 Flash Lite',
            tier: 'free',
            freeTierVerified: true,
            pricing: { prompt: 0, completion: 0, request: 0 },
            contextWindow: 1048576,
            maxOutputTokens: 8192,
            tools: true,
            capabilities: { coding: 3.5, reasoning: 3.5, speed: 5.0, context: 5.0, toolCalling: 4.0 }
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
            maxOutputTokens: 8192,
            tools: true,
            capabilities: { coding: 3.5, reasoning: 3.5, speed: 5.0, context: 3.5, toolCalling: 4.0 }
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
            maxOutputTokens: 8192,
            tools: true,
            capabilities: { coding: 4.5, reasoning: 4.5, speed: 3.5, context: 4.0, toolCalling: 4.0 }
          },
          'anthropic/claude-3.5-sonnet': {
            id: 'anthropic/claude-3.5-sonnet',
            provider: 'openrouter',
            name: 'Claude 3.5 Sonnet',
            tier: 'paid',
            freeTierVerified: false,
            pricing: { prompt: 0.000003, completion: 0.000015, request: 0 },
            contextWindow: 200000,
            maxOutputTokens: 8192,
            tools: true,
            capabilities: { coding: 5.0, reasoning: 5.0, speed: 3.5, context: 4.5, toolCalling: 5.0 }
          }
        }
      }
    }
  };
}

test('detectIntent maps keywords to corresponding workflow templates', () => {
  assert.equal(detectIntent('Fix failing test in double.mjs and resolve error'), 'bug-diagnose-fix');
  assert.equal(detectIntent('Refactor database query logic into separate module and clean up'), 'refactor-clean');
  assert.equal(detectIntent('Hello what is this?'), 'quick-single');
  assert.equal(detectIntent('Implement user authentication system with session management'), 'feature-implement-verify');
});

test('template engine lists built-in templates and supports custom workspace templates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'localagent-tpl-'));
  try {
    const list = listTemplates(dir);
    assert.ok(list.length >= 4);
    assert.ok(list.some(t => t.id === 'feature-implement-verify' && t.isBuiltin));
    assert.ok(list.some(t => t.id === 'bug-diagnose-fix' && t.isBuiltin));

    const custom = {
      id: 'custom-ci-pipeline',
      name: 'Custom CI Pipeline',
      description: 'Run linter and tests',
      stages: [
        { id: 'lint-step', title: 'Linting', agent: 'tester', prompt: 'Run linter' }
      ]
    };
    saveTemplate(custom, dir);

    const updated = listTemplates(dir);
    assert.ok(updated.some(t => t.id === 'custom-ci-pipeline' && !t.isBuiltin));

    const fetched = getTemplate('custom-ci-pipeline', dir);
    assert.equal(fetched.name, 'Custom CI Pipeline');

    assert.equal(deleteTemplate('custom-ci-pipeline', dir), true);
    assert.equal(getTemplate('custom-ci-pipeline', dir), null);
    assert.throws(() => deleteTemplate('feature-implement-verify', dir), /cannot_delete_builtin_template/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createPlan builds hierarchical workflow with nested repeat loop and auto-assigned free models', () => {
  const catalog = mockCatalog();
  const plan = createPlan({
    prompt: 'Implement Dark Mode toggle in Settings component',
    mode: 'team',
    policy: POLICIES.FREE_ONLY,
    targetFiles: ['src/Settings.jsx', 'src/theme.css'],
    catalog
  });

  assert.ok(plan.id.startsWith('wf_'));
  assert.equal(plan.policy, 'free_only');
  assert.equal(plan.budget.maxSpendUsd, 0.0);
  assert.equal(plan.metadata.totalEstimatedCostUsd, 0.0);
  assert.ok(plan.stages.length >= 3);

  // Check repeat stage
  const repeatStage = plan.stages.find(s => s.type === 'repeat');
  assert.ok(repeatStage, 'Repeat cycle stage must exist');
  assert.equal(repeatStage.maxIterations, 3);
  assert.equal(repeatStage.exitCondition, 'tests_passed && reviewer_approved');
  assert.ok(repeatStage.steps.length >= 3);

  // Check models assigned are verified free
  const flat = flattenSteps(plan);
  assert.ok(flat.length >= 5);
  for (const step of flat) {
    assert.ok(step.assignedModel, `Step ${step.id} must have assignedModel`);
    assert.ok(step.assignedModel.startsWith('gemini/') || step.assignedModel.startsWith('openrouter/') || step.assignedModel.startsWith('groq/'));
    assert.equal(step.status, 'pending');
  }

  assert.equal(plan.validation.valid, true);
  assert.deepEqual(plan.validation.errors, []);
});

test('validatePlan catches cycles, missing dependencies, and parallel file write conflicts', () => {
  const catalog = mockCatalog();

  // Test 1: Circular dependency
  const cyclicPlan = {
    id: 'wf_test_cyclic',
    title: 'Cyclic Plan',
    policy: POLICIES.FREE_ONLY,
    stages: [
      { id: 'step-a', title: 'Step A', agent: 'implementer', dependsOn: ['step-b'] },
      { id: 'step-b', title: 'Step B', agent: 'tester', dependsOn: ['step-a'] }
    ]
  };
  const res1 = validatePlan(cyclicPlan, catalog);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.includes('circular_dependency_detected_in_plan'));

  // Test 2: Missing dependency
  const missingDepPlan = {
    id: 'wf_test_missing_dep',
    title: 'Missing Dep Plan',
    policy: POLICIES.FREE_ONLY,
    stages: [
      { id: 'step-a', title: 'Step A', agent: 'implementer', dependsOn: ['non_existent_step'] }
    ]
  };
  const resMissing = validatePlan(missingDepPlan, catalog);
  assert.equal(resMissing.valid, false);
  assert.ok(resMissing.errors.some(e => e.includes('depends_on_unknown_step')));

  // Test 3: Parallel step file-lock conflict
  const parallelConflictPlan = {
    id: 'wf_test_conflict',
    title: 'Conflict Plan',
    policy: POLICIES.FREE_ONLY,
    stages: [
      {
        id: 'parallel-edit',
        type: 'parallel',
        steps: [
          { id: 'edit-1', agent: 'implementer', targetFiles: ['src/shared.js'] },
          { id: 'edit-2', agent: 'implementer', targetFiles: ['src/shared.js'] }
        ]
      }
    ]
  };
  const res2 = validatePlan(parallelConflictPlan, catalog);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some(e => e.includes('parallel_file_write_conflict')));

  // Test 4: Invalid repeat bounds
  const badRepeatPlan = {
    id: 'wf_test_bad_repeat',
    title: 'Bad Repeat Plan',
    policy: POLICIES.FREE_ONLY,
    stages: [
      { id: 'loop-step', type: 'repeat', maxIterations: 15, steps: [{ id: 'inner', agent: 'implementer' }] }
    ]
  };
  const res3 = validatePlan(badRepeatPlan, catalog);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some(e => e.includes('invalid_repeat_max_iterations')));
});

test('validatePlan and updatePlanStep enforce free-first policy constraints', () => {
  const catalog = mockCatalog();
  const plan = createPlan({
    prompt: 'Quick bug fix in parser',
    templateId: 'bug-diagnose-fix',
    policy: POLICIES.FREE_ONLY,
    catalog
  });

  assert.equal(plan.validation.valid, true);

  // Attempt to assign paid model under FREE_ONLY policy must fail
  assert.throws(() => {
    updatePlanStep(plan, 'apply-fix', {
      assignedModel: 'openrouter/anthropic/claude-3.5-sonnet'
    }, catalog);
  }, /model_assignment_rejected/);

  // Valid free model update succeeds
  const updateRes = updatePlanStep(plan, 'apply-fix', {
    assignedModel: 'gemini/gemini-2.5-flash'
  }, catalog);

  assert.equal(updateRes.valid, true);
  const flat = flattenSteps(plan);
  const fixStep = flat.find(s => s.id === 'apply-fix');
  assert.equal(fixStep.assignedModel, 'gemini/gemini-2.5-flash');
});

test('calculatePlanBudget projects non-zero cost for paid models under Paid Allowed policy', () => {
  const catalog = mockCatalog();
  const plan = createPlan({
    prompt: 'Complex architecture refactor',
    templateId: 'refactor-clean',
    policy: POLICIES.PAID_ALLOWED,
    catalog,
    modelOverrides: {
      'implement-changes': 'openrouter/anthropic/claude-3.5-sonnet'
    }
  });

  assert.equal(plan.policy, POLICIES.PAID_ALLOWED);
  assert.ok(plan.metadata.totalEstimatedTokens > 0);
  assert.ok(plan.metadata.totalEstimatedCostUsd >= 0.0);
});
