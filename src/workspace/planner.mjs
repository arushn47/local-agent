import { randomUUID } from 'node:crypto';
import { ROLES, POLICIES, recommendModel, validateModelAssignment, getModel } from './models.mjs';
import { BUILTIN_TEMPLATES, instantiateTemplate, getTemplate } from './workflow-templates.mjs';
import { estimateCost } from './budget-ledger.mjs';

export const WORKFLOW_MODES = Object.freeze({
  QUICK: 'quick',
  GUIDED: 'guided',
  TEAM: 'team',
  CUSTOM: 'custom'
});

export function extractReferencedFiles(text = '') {
  const matches = text.match(/(?:[\w.-]+[/\\])*[\w.-]+\.(?:js|mjs|cjs|jsx|ts|tsx|css|html|json|md|py|rs|go)\b/g);
  return matches ? [...new Set(matches.map(m => m.replace(/\\/g, '/')))] : [];
}

export function extractTestCommand(text = '') {
  const match = text.match(/\b(npm test[^\n;]*|node --test[^\n;]*|pytest[^\n;]*|cargo test[^\n;]*)\b/i);
  return match ? match[1].trim() : 'npm test';
}

export function parseSubtasksFromPrompt(text = '') {
  const lines = text.split('\n');
  const items = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:\d+[\.\)]|[-*•])\s+(.+)$/);
    if (match && match[1].trim().length > 5) {
      items.push(match[1].trim());
    }
  }
  return items;
}

export function detectIntent(prompt = '') {
  const p = prompt.toLowerCase();
  if (/\b(fix|bug|defect|error|failing|broken|crash|issue|exception)\b/.test(p)) {
    return 'bug-diagnose-fix';
  }
  if (/\b(refactor|cleanup|clean up|modularize|reorganize|rename|extract)\b/.test(p)) {
    return 'refactor-clean';
  }
  if (p.trim().length < 60 && !/\b(feature|implement|build|create|system|suite)\b/.test(p)) {
    return 'quick-single';
  }
  return 'feature-implement-verify';
}

export function flattenSteps(plan) {
  if (!plan?.stages || !Array.isArray(plan.stages)) return [];
  const flat = [];

  function walk(node, parentPath = '') {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, parentPath ? `${parentPath}[${index}]` : `stage[${index}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (node.type === 'task' || node.agent) {
      flat.push({
        ...node,
        path: parentPath
      });
    }

    if (node.steps && Array.isArray(node.steps)) {
      node.steps.forEach((child, index) => {
        walk(child, `${parentPath}.steps[${index}]`);
      });
    }
  }

  walk(plan.stages);
  return flat;
}

export function calculatePlanBudget(plan, catalog = null) {
  const flat = flattenSteps(plan);
  let totalEstimatedTokens = 0;
  let totalEstimatedCostUsd = 0.0;

  for (const step of flat) {
    // Standard baseline token estimate per step
    const inputTokens = 2500;
    const outputTokens = 1500;
    const tokens = inputTokens + outputTokens;
    totalEstimatedTokens += tokens;

    if (step.assignedModel && catalog) {
      const model = getModel(catalog, step.assignedModel);
      if (model && model.tier !== 'free') {
        totalEstimatedCostUsd += estimateCost(model, inputTokens, outputTokens);
      }
    }
  }

  return {
    totalEstimatedTokens,
    totalEstimatedCostUsd: Math.round(totalEstimatedCostUsd * 1e6) / 1e6
  };
}

export function getAllNodeIds(plan) {
  const ids = new Set();
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.id) ids.add(node.id);
    if (node.stages && Array.isArray(node.stages)) walk(node.stages);
    if (node.steps && Array.isArray(node.steps)) walk(node.steps);
  }
  if (plan?.stages) walk(plan.stages);
  return ids;
}

export function validatePlan(plan, catalog = null) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['plan_must_be_an_object'] };
  }
  if (!plan.id) errors.push('plan_missing_id');
  if (!plan.title) errors.push('plan_missing_title');
  if (!Object.values(POLICIES).includes(plan.policy)) {
    errors.push(`invalid_policy: ${plan.policy}`);
  }
  if (!Array.isArray(plan.stages) || plan.stages.length === 0) {
    errors.push('plan_must_contain_at_least_one_stage');
  }

  const allNodeIds = getAllNodeIds(plan);
  const graph = new Map(); // id -> dependsOn[]
  const seenIds = new Set();

  function collectNodes(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(collectNodes);
      return;
    }
    if (node.id) {
      if (seenIds.has(node.id)) {
        errors.push(`duplicate_step_id: ${node.id}`);
      }
      seenIds.add(node.id);
      graph.set(node.id, Array.isArray(node.dependsOn) ? node.dependsOn : []);
    }
    if (node.agent && !ROLES[node.agent]) {
      errors.push(`unknown_role: ${node.agent} in step ${node.id}`);
    }
    if (node.assignedModel && catalog) {
      const val = validateModelAssignment({
        catalog,
        modelId: node.assignedModel,
        role: node.agent || 'implementer',
        policy: plan.policy
      });
      if (!val.valid) {
        errors.push(`step_${node.id}_model_invalid: ${val.reason}`);
      }
    }
    if (node.steps && Array.isArray(node.steps)) {
      collectNodes(node.steps);
    }
  }

  collectNodes(plan.stages);

  // Validate dependencies exist and detect cycles (topological sort / DFS)
  for (const [id, deps] of graph.entries()) {
    for (const dep of deps) {
      if (!allNodeIds.has(dep)) {
        errors.push(`step_${id}_depends_on_unknown_step_${dep}`);
      }
    }
  }

  // Cycle detection via DFS
  const visited = new Set();
  const inStack = new Set();

  function hasCycle(node) {
    visited.add(node);
    inStack.add(node);
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }
    inStack.delete(node);
    return false;
  }

  for (const id of graph.keys()) {
    if (!visited.has(id)) {
      if (hasCycle(id)) {
        errors.push('circular_dependency_detected_in_plan');
        break;
      }
    }
  }

  // Validate parallel blocks: no target file write conflicts
  function checkParallelConflicts(stageList) {
    for (const stage of stageList) {
      if (stage.type === 'parallel' && Array.isArray(stage.steps)) {
        const fileOwners = new Map();
        for (const child of stage.steps) {
          const files = Array.isArray(child.targetFiles) ? child.targetFiles : [];
          for (const file of files) {
            if (fileOwners.has(file)) {
              errors.push(`parallel_file_write_conflict: "${file}" modified by both "${fileOwners.get(file)}" and "${child.id}"`);
            } else {
              fileOwners.set(file, child.id);
            }
          }
        }
      }
      if (stage.type === 'repeat') {
        const it = Number(stage.maxIterations);
        if (!Number.isInteger(it) || it < 1 || it > 10) {
          errors.push(`invalid_repeat_max_iterations: ${stage.maxIterations} (must be 1-10)`);
        }
      }
      if (stage.steps && Array.isArray(stage.steps)) {
        checkParallelConflicts(stage.steps);
      }
    }
  }

  if (Array.isArray(plan.stages)) {
    checkParallelConflicts(plan.stages);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createPlan({
  prompt = '',
  mode = WORKFLOW_MODES.TEAM,
  policy = POLICIES.FREE_ONLY,
  templateId = null,
  templateParams = {},
  targetFiles = [],
  catalog = null,
  modelOverrides = {},
  workspaceDir = null,
  customStages = null
}) {
  const referencedFiles = targetFiles.length > 0 ? targetFiles : extractReferencedFiles(prompt);
  const detectedTestCmd = extractTestCommand(prompt);
  const parsedSubtasks = parseSubtasksFromPrompt(prompt);

  // If explicit custom stages are provided, wrap and auto-assign
  if (Array.isArray(customStages) && customStages.length > 0) {
    const workflowId = `wf_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const stages = JSON.parse(JSON.stringify(customStages));

    function assignModels(stageList) {
      for (const step of stageList) {
        if (step.agent) {
          const role = step.agent;
          const override = step.assignedModel || modelOverrides[step.id] || modelOverrides[role];
          if (override) {
            step.assignedModel = override;
            step.fallbackChain = [override];
          } else if (catalog) {
            const rec = recommendModel({ role, policy, catalog });
            if (rec?.recommended) {
              step.assignedModel = rec.recommended.qualifiedId;
              step.fallbackChain = rec.fallbackChain.map(m => m.qualifiedId);
              step.modelRationale = rec.reason;
            }
          }
          step.status = 'pending';
        }
        if (step.steps && Array.isArray(step.steps)) {
          assignModels(step.steps);
        }
      }
    }

    assignModels(stages);

    const plan = {
      id: workflowId,
      title: prompt.slice(0, 50).trim() || 'Custom Workflow',
      description: prompt,
      version: 1,
      mode: mode || 'custom',
      policy,
      budget: {
        maxSpendUsd: policy === POLICIES.FREE_ONLY ? 0.0 : 0.50,
        allocatedUsd: 0.0
      },
      stages,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parameters: { prompt, targetFiles: referencedFiles, testCommand: detectedTestCmd }
      }
    };

    const budget = calculatePlanBudget(plan, catalog);
    plan.metadata.totalEstimatedTokens = budget.totalEstimatedTokens;
    plan.metadata.totalEstimatedCostUsd = budget.totalEstimatedCostUsd;
    plan.validation = validatePlan(plan, catalog);
    return plan;
  }

  // If user provided a prompt with explicit numbered/bulleted subtasks and mode is custom:
  if (parsedSubtasks.length >= 2 && !templateId && mode === WORKFLOW_MODES.CUSTOM) {
    const workflowId = `wf_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const stages = [];
    let previousStepId = null;

    parsedSubtasks.forEach((subtask, index) => {
      const stepId = `step-${index + 1}`;
      const subtaskFiles = extractReferencedFiles(subtask);
      const isTest = /\b(test|assert|verify|suite)\b/i.test(subtask);
      const isReview = /\b(review|check|inspect criteria)\b/i.test(subtask);
      const isResearch = /\b(research|investigate|explore)\b/i.test(subtask);
      const isDebug = /\b(debug|diagnose|fix)\b/i.test(subtask);

      let agent = 'implementer';
      if (isTest) agent = 'tester';
      else if (isReview) agent = 'reviewer';
      else if (isResearch) agent = 'researcher';
      else if (isDebug) agent = 'debugger';

      const step = {
        id: stepId,
        title: subtask.slice(0, 60).trim(),
        type: 'task',
        agent,
        prompt: subtask,
        targetFiles: subtaskFiles.length > 0 ? subtaskFiles : referencedFiles,
        dependsOn: previousStepId ? [previousStepId] : [],
        status: 'pending'
      };

      if (catalog) {
        const rec = recommendModel({ role: agent, policy, catalog });
        if (rec?.recommended) {
          step.assignedModel = rec.recommended.qualifiedId;
          step.fallbackChain = rec.fallbackChain.map(m => m.qualifiedId);
          step.modelRationale = rec.reason;
        }
      }

      stages.push(step);
      previousStepId = stepId;
    });

    const plan = {
      id: workflowId,
      title: prompt.slice(0, 50).trim() || 'Custom Multi-Agent Workflow',
      description: prompt,
      version: 1,
      mode: 'custom',
      policy,
      budget: {
        maxSpendUsd: policy === POLICIES.FREE_ONLY ? 0.0 : 0.50,
        allocatedUsd: 0.0
      },
      stages,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parameters: { prompt, targetFiles: referencedFiles, testCommand: detectedTestCmd }
      }
    };

    const budget = calculatePlanBudget(plan, catalog);
    plan.metadata.totalEstimatedTokens = budget.totalEstimatedTokens;
    plan.metadata.totalEstimatedCostUsd = budget.totalEstimatedCostUsd;
    plan.validation = validatePlan(plan, catalog);
    return plan;
  }

  // Otherwise, use template instantiation with dynamically extracted parameters
  const chosenTemplateId = templateId || detectIntent(prompt);
  const params = {
    featureTitle: prompt.slice(0, 50).trim() || 'New Feature',
    featureDescription: prompt,
    issueDescription: prompt,
    refactorGoal: prompt,
    prompt,
    targetFiles: referencedFiles,
    testCommand: detectedTestCmd,
    ...templateParams
  };

  const plan = instantiateTemplate({
    templateId: chosenTemplateId,
    params,
    catalog,
    policy,
    workspaceDir,
    modelOverrides
  });

  plan.mode = mode;

  // Calculate budget & tokens
  const budget = calculatePlanBudget(plan, catalog);
  plan.metadata.totalEstimatedTokens = budget.totalEstimatedTokens;
  plan.metadata.totalEstimatedCostUsd = budget.totalEstimatedCostUsd;

  // Validate plan
  const validation = validatePlan(plan, catalog);
  plan.validation = validation;

  return plan;
}

export function updatePlanStep(plan, stepId, updates = {}, catalog = null) {
  if (!plan || !plan.stages) throw new Error('invalid_plan');
  let found = false;

  function deepUpdate(stages) {
    for (const step of stages) {
      if (step.id === stepId) {
        found = true;
        if (updates.assignedModel !== undefined) {
          if (catalog) {
            const role = step.agent || 'implementer';
            const val = validateModelAssignment({
              catalog,
              modelId: updates.assignedModel,
              role,
              policy: plan.policy
            });
            if (!val.valid) {
              throw new Error(`model_assignment_rejected: ${val.reason}`);
            }
          }
          step.assignedModel = updates.assignedModel;
        }
        if (updates.fallbackChain !== undefined) {
          step.fallbackChain = Array.isArray(updates.fallbackChain) ? updates.fallbackChain : [updates.fallbackChain];
        }
        if (updates.prompt !== undefined) step.prompt = updates.prompt;
        if (updates.title !== undefined) step.title = updates.title;
        if (updates.targetFiles !== undefined) {
          step.targetFiles = Array.isArray(updates.targetFiles) ? updates.targetFiles : [updates.targetFiles];
        }
        if (updates.dependsOn !== undefined) {
          step.dependsOn = Array.isArray(updates.dependsOn) ? updates.dependsOn : [];
        }
        if (updates.status !== undefined) step.status = updates.status;
        return;
      }
      if (step.steps && Array.isArray(step.steps)) {
        deepUpdate(step.steps);
      }
    }
  }

  deepUpdate(plan.stages);
  if (!found) {
    throw new Error(`step_not_found: ${stepId}`);
  }

  plan.metadata.updatedAt = new Date().toISOString();
  const budget = calculatePlanBudget(plan, catalog);
  plan.metadata.totalEstimatedTokens = budget.totalEstimatedTokens;
  plan.metadata.totalEstimatedCostUsd = budget.totalEstimatedCostUsd;

  const validation = validatePlan(plan, catalog);
  plan.validation = validation;

  return { plan, valid: validation.valid, errors: validation.errors };
}
