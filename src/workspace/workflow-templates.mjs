import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROLES, POLICIES, recommendModel, validateModelAssignment } from './models.mjs';

export const BUILTIN_TEMPLATES = Object.freeze({
  'feature-implement-verify': Object.freeze({
    id: 'feature-implement-verify',
    name: 'Feature Implementation & Verification',
    description: 'Full lifecycle with Plan -> Parallel Scaffold/Research -> Repeat (Implement -> Test -> Review, maxIterations: 3) -> Clean Integration',
    mode: 'team',
    parameters: [
      { name: 'featureTitle', label: 'Feature Title', type: 'string', required: true, default: 'New Feature' },
      { name: 'featureDescription', label: 'Feature Description', type: 'string', required: true, default: '' },
      { name: 'targetFiles', label: 'Target Files', type: 'array', required: false, default: [] },
      { name: 'testCommand', label: 'Test Command', type: 'string', required: false, default: 'npm test' },
      { name: 'maxIterations', label: 'Max Repeat Iterations', type: 'number', required: false, default: 3 }
    ],
    stages: [
      {
        id: 'plan-architecture',
        title: 'Analyze Requirements & Plan Architecture',
        type: 'task',
        agent: 'planner',
        promptTemplate: 'Analyze requirements for {{featureTitle}}: {{featureDescription}}. Inspect repository context, specify file changes, and define acceptance criteria.',
        acceptanceCriteria: ['Architecture and file targets clearly defined', 'No regression on existing contracts']
      },
      {
        id: 'parallel-prep',
        title: 'Parallel Preparation & Scaffolding',
        type: 'parallel',
        dependsOn: ['plan-architecture'],
        steps: [
          {
            id: 'research-deps',
            title: 'Investigate Dependencies & Context',
            agent: 'researcher',
            promptTemplate: 'Investigate project dependencies and existing modules relevant to {{featureTitle}}.',
            targetFiles: []
          },
          {
            id: 'scaffold-structure',
            title: 'Scaffold Interfaces & Target Files',
            agent: 'implementer',
            promptTemplate: 'Scaffold initial signatures, interfaces, and stubs for {{featureTitle}} in: {{targetFiles}}.',
            targetFiles: '{{targetFiles}}'
          }
        ]
      },
      {
        id: 'implement-and-verify-cycle',
        title: 'Implement & Verify Cycle',
        type: 'repeat',
        maxIterations: '{{maxIterations}}',
        exitCondition: 'tests_passed && reviewer_approved',
        dependsOn: ['parallel-prep'],
        steps: [
          {
            id: 'implement-changes',
            title: 'Implement Feature Logic',
            agent: 'implementer',
            promptTemplate: 'Implement feature code for {{featureTitle}} adhering to plan: {{featureDescription}}.',
            targetFiles: '{{targetFiles}}'
          },
          {
            id: 'run-test-suite',
            title: 'Run Verification Tests',
            agent: 'tester',
            promptTemplate: 'Execute test command `{{testCommand}}` and report results.',
            dependsOn: ['implement-changes'],
            testCommand: '{{testCommand}}'
          },
          {
            id: 'review-criteria',
            title: 'Review Acceptance Criteria',
            agent: 'reviewer',
            promptTemplate: 'Review code changes and test output for {{featureTitle}}. Verify all acceptance criteria are met.',
            dependsOn: ['run-test-suite']
          }
        ]
      },
      {
        id: 'final-verification',
        title: 'Final Integration & Clean Build',
        type: 'task',
        agent: 'tester',
        promptTemplate: 'Perform final verification of the completed feature: clean build, tests, and sanity check.',
        dependsOn: ['implement-and-verify-cycle']
      }
    ]
  }),

  'bug-diagnose-fix': Object.freeze({
    id: 'bug-diagnose-fix',
    name: 'Bug Diagnosis & Targeted Fix',
    description: 'Reproduce and diagnose defect -> Repeat (Fix -> Test, maxIterations: 3) -> Final Review',
    mode: 'team',
    parameters: [
      { name: 'issueDescription', label: 'Issue Description', type: 'string', required: true, default: '' },
      { name: 'reproCommand', label: 'Repro / Test Command', type: 'string', required: false, default: 'npm test' },
      { name: 'targetFiles', label: 'Suspected Files', type: 'array', required: false, default: [] },
      { name: 'maxIterations', label: 'Max Fix Attempts', type: 'number', required: false, default: 3 }
    ],
    stages: [
      {
        id: 'reproduce-diagnose',
        title: 'Reproduce Defect & Inspect Logs',
        type: 'task',
        agent: 'debugger',
        promptTemplate: 'Reproduce defect using `{{reproCommand}}`. Diagnose root cause: {{issueDescription}}.',
        acceptanceCriteria: ['Root cause identified', 'Failing test or reproduction trace captured']
      },
      {
        id: 'fix-and-verify-cycle',
        title: 'Targeted Fix & Test Cycle',
        type: 'repeat',
        maxIterations: '{{maxIterations}}',
        exitCondition: 'tests_passed',
        dependsOn: ['reproduce-diagnose'],
        steps: [
          {
            id: 'apply-fix',
            title: 'Apply Targeted Code Fix',
            agent: 'implementer',
            promptTemplate: 'Apply minimal, robust fix to resolve defect: {{issueDescription}}. Target files: {{targetFiles}}.',
            targetFiles: '{{targetFiles}}'
          },
          {
            id: 'run-regression-tests',
            title: 'Run Regression Tests',
            agent: 'tester',
            promptTemplate: 'Run regression tests using `{{reproCommand}}`. Verify fix does not break existing functionality.',
            dependsOn: ['apply-fix'],
            testCommand: '{{reproCommand}}'
          }
        ]
      },
      {
        id: 'review-fix',
        title: 'Review Diff & Confirm Fix',
        type: 'task',
        agent: 'reviewer',
        promptTemplate: 'Review diff for defect fix. Confirm root cause is solved with zero unnecessary changes.',
        dependsOn: ['fix-and-verify-cycle']
      }
    ]
  }),

  'refactor-clean': Object.freeze({
    id: 'refactor-clean',
    name: 'Refactoring & Code Quality',
    description: 'Analyze structure -> Refactor -> Run Tests -> Code Review',
    mode: 'guided',
    parameters: [
      { name: 'refactorGoal', label: 'Refactor Goal', type: 'string', required: true, default: '' },
      { name: 'targetFiles', label: 'Target Files', type: 'array', required: true, default: [] },
      { name: 'testCommand', label: 'Test Command', type: 'string', required: false, default: 'npm test' }
    ],
    stages: [
      {
        id: 'analyze-structure',
        title: 'Analyze Code Structure & Call Hierarchy',
        type: 'task',
        agent: 'researcher',
        promptTemplate: 'Analyze structure of {{targetFiles}} for refactoring goal: {{refactorGoal}}.',
        targetFiles: '{{targetFiles}}'
      },
      {
        id: 'apply-refactor',
        title: 'Execute Refactoring & Modularization',
        type: 'task',
        agent: 'implementer',
        promptTemplate: 'Execute refactoring on {{targetFiles}} according to goal: {{refactorGoal}}. Preserve existing behavior.',
        dependsOn: ['analyze-structure'],
        targetFiles: '{{targetFiles}}'
      },
      {
        id: 'verify-suite',
        title: 'Run Full Test Suite',
        type: 'task',
        agent: 'tester',
        promptTemplate: 'Run `{{testCommand}}` to verify refactoring introduced zero regressions.',
        dependsOn: ['apply-refactor'],
        testCommand: '{{testCommand}}'
      },
      {
        id: 'review-quality',
        title: 'Code Quality & Cleanliness Review',
        type: 'task',
        agent: 'reviewer',
        promptTemplate: 'Review refactored files for readability, architectural consistency, and maintainability.',
        dependsOn: ['verify-suite']
      }
    ]
  }),

  'quick-single': Object.freeze({
    id: 'quick-single',
    name: 'Quick Single Task',
    description: 'Single-agent execution with minimal overhead',
    mode: 'quick',
    parameters: [
      { name: 'prompt', label: 'Task Description', type: 'string', required: true, default: '' },
      { name: 'targetFiles', label: 'Target Files', type: 'array', required: false, default: [] }
    ],
    stages: [
      {
        id: 'execute-task',
        title: 'Execute Task',
        type: 'task',
        agent: 'implementer',
        promptTemplate: '{{prompt}}',
        targetFiles: '{{targetFiles}}'
      }
    ]
  })
});

export function getTemplatesDirectory(workspaceDir = null) {
  if (!workspaceDir) return null;
  return join(workspaceDir, '.localagent', 'workflows', 'templates');
}

export function listTemplates(workspaceDir = null) {
  const result = [];
  // 1. Built-in templates
  for (const t of Object.values(BUILTIN_TEMPLATES)) {
    result.push({
      id: t.id,
      name: t.name,
      description: t.description,
      mode: t.mode,
      parameters: t.parameters,
      isBuiltin: true
    });
  }

  // 2. Custom templates from workspace
  const tDir = getTemplatesDirectory(workspaceDir);
  if (tDir && existsSync(tDir)) {
    try {
      const files = readdirSync(tDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = readFileSync(join(tDir, file), 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed.id && parsed.name && Array.isArray(parsed.stages)) {
            result.push({
              id: parsed.id,
              name: parsed.name,
              description: parsed.description || '',
              mode: parsed.mode || 'custom',
              parameters: parsed.parameters || [],
              isBuiltin: false
            });
          }
        } catch {}
      }
    } catch {}
  }

  return result;
}

export function getTemplate(templateId, workspaceDir = null) {
  if (BUILTIN_TEMPLATES[templateId]) {
    return JSON.parse(JSON.stringify(BUILTIN_TEMPLATES[templateId]));
  }
  const tDir = getTemplatesDirectory(workspaceDir);
  if (tDir) {
    const filePath = join(tDir, `${templateId}.json`);
    if (existsSync(filePath)) {
      try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
      } catch {}
    }
  }
  return null;
}

export function saveTemplate(template, workspaceDir) {
  if (!workspaceDir) throw new Error('workspaceDir_required');
  if (!template?.id || !/^[a-z0-9_-]{2,64}$/.test(template.id)) {
    throw new Error('invalid_template_id: must be 2-64 lowercase alphanumeric, dash or underscore');
  }
  if (BUILTIN_TEMPLATES[template.id]) {
    throw new Error(`cannot_overwrite_builtin_template: ${template.id}`);
  }
  if (!template.name || typeof template.name !== 'string') {
    throw new Error('template_name_required');
  }
  if (!Array.isArray(template.stages) || template.stages.length === 0) {
    throw new Error('template_stages_required');
  }

  const tDir = getTemplatesDirectory(workspaceDir);
  mkdirSync(tDir, { recursive: true });
  const targetFile = join(tDir, `${template.id}.json`);
  writeFileSync(targetFile, JSON.stringify(template, null, 2), { mode: 0o600 });
  return { success: true, id: template.id, path: targetFile };
}

export function deleteTemplate(templateId, workspaceDir) {
  if (!workspaceDir) throw new Error('workspaceDir_required');
  if (BUILTIN_TEMPLATES[templateId]) {
    throw new Error(`cannot_delete_builtin_template: ${templateId}`);
  }
  const tDir = getTemplatesDirectory(workspaceDir);
  if (!tDir) return false;
  const targetFile = join(tDir, `${templateId}.json`);
  if (existsSync(targetFile)) {
    unlinkSync(targetFile);
    return true;
  }
  return false;
}

function renderTemplateString(str, params) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const val = params[key];
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  });
}

function resolveStageParameters(stage, params) {
  const s = { ...stage };
  if (s.title) s.title = renderTemplateString(s.title, params);
  if (s.promptTemplate) {
    s.prompt = renderTemplateString(s.promptTemplate, params);
    delete s.promptTemplate;
  }
  if (typeof s.targetFiles === 'string') {
    const rendered = renderTemplateString(s.targetFiles, params);
    s.targetFiles = rendered ? rendered.split(',').map(f => f.trim()).filter(Boolean) : [];
  } else if (!Array.isArray(s.targetFiles)) {
    s.targetFiles = params.targetFiles || [];
  }
  if (typeof s.maxIterations === 'string') {
    s.maxIterations = Number(renderTemplateString(s.maxIterations, params)) || 3;
  }
  if (s.steps && Array.isArray(s.steps)) {
    s.steps = s.steps.map(child => resolveStageParameters(child, params));
  }
  return s;
}

export function instantiateTemplate({
  templateId,
  params = {},
  catalog = null,
  policy = POLICIES.FREE_ONLY,
  workspaceDir = null,
  modelOverrides = {}
}) {
  const template = getTemplate(templateId, workspaceDir);
  if (!template) throw new Error(`template_not_found: ${templateId}`);

  // Merge default parameter values
  const effectiveParams = {};
  if (Array.isArray(template.parameters)) {
    for (const p of template.parameters) {
      effectiveParams[p.name] = params[p.name] !== undefined ? params[p.name] : p.default;
    }
  }
  for (const [k, v] of Object.entries(params)) {
    effectiveParams[k] = v;
  }

  const stages = template.stages.map(stage => resolveStageParameters(stage, effectiveParams));

  // Auto-assign models and fallback chains for each leaf step
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

  const workflowId = `wf_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const title = effectiveParams.featureTitle || effectiveParams.issueDescription || effectiveParams.refactorGoal || effectiveParams.prompt || template.name;

  return {
    id: workflowId,
    title,
    description: template.description || '',
    version: 1,
    templateId: template.id,
    mode: template.mode || 'team',
    policy,
    budget: {
      maxSpendUsd: policy === POLICIES.FREE_ONLY ? 0.0 : (params.budgetLimitUsd || 0.50),
      allocatedUsd: 0.0
    },
    stages,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parameters: effectiveParams
    }
  };
}

