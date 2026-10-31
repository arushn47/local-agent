import { ROLES } from './models.mjs';

export const ROLE_DEFINITIONS = Object.freeze({
  planner: Object.freeze({
    id: 'planner',
    name: 'Planner',
    description: 'Analyzes requirements, decomposes tasks into hierarchical DAGs, and specifies acceptance criteria',
    allowedTools: ['read', 'glob', 'grep'],
    prohibitedTools: ['write', 'edit', 'bash'],
    systemInstruction: 'You are the Planner agent in LocalAgent. Analyze requirements, inspect code structure, specify exact target files, and define verifiable acceptance criteria. Do not write or execute code.'
  }),

  implementer: Object.freeze({
    id: 'implementer',
    name: 'Implementer',
    description: 'Writes clean code, creates files, and implements features according to plan',
    allowedTools: ['read', 'write', 'edit', 'glob', 'grep'],
    prohibitedTools: ['bash'],
    systemInstruction: 'You are the Implementer agent in LocalAgent. Write clean, production-ready code that satisfies specifications. Only modify designated target files. Do not run destructive shell commands.'
  }),

  researcher: Object.freeze({
    id: 'researcher',
    name: 'Researcher',
    description: 'Explores repositories, scans dependencies, and investigates documentation/APIs',
    allowedTools: ['read', 'glob', 'grep'],
    prohibitedTools: ['write', 'edit', 'bash'],
    systemInstruction: 'You are the Researcher agent in LocalAgent. Explore the repository, scan packages and configs, and summarize relevant architectural patterns. Do not modify files or run shell scripts.'
  }),

  debugger: Object.freeze({
    id: 'debugger',
    name: 'Debugger',
    description: 'Investigates test failures, runtime errors, and inspects logs to diagnose and fix defects',
    allowedTools: ['read', 'write', 'edit', 'glob', 'grep', 'bash'],
    prohibitedTools: [],
    systemInstruction: 'You are the Debugger agent in LocalAgent. Reproduce defects, analyze logs and stack traces, diagnose root causes, and apply targeted fixes.'
  }),

  tester: Object.freeze({
    id: 'tester',
    name: 'Tester',
    description: 'Runs unit and integration test suites, parses test outputs, and checks assertions',
    allowedTools: ['read', 'bash', 'glob', 'grep'],
    prohibitedTools: ['write', 'edit'],
    systemInstruction: 'You are the Tester agent in LocalAgent. Execute tests, measure test outcomes, parse failures, and verify that test assertions pass. Do not write feature code.'
  }),

  reviewer: Object.freeze({
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews code diffs, verifies acceptance criteria, and checks for regressions',
    allowedTools: ['read', 'glob', 'grep'],
    prohibitedTools: ['write', 'edit', 'bash'],
    systemInstruction: 'You are the Reviewer agent in LocalAgent. Review diffs and test results against defined acceptance criteria. Evaluate code quality, edge cases, and safety. Return a structured decision: approved or changes_requested with actionable feedback.'
  })
});

export function getRoleDefinition(roleId) {
  return ROLE_DEFINITIONS[roleId] || ROLE_DEFINITIONS.implementer;
}

// Message-level deny mask complements the installed agent permission rules.
// Unknown/custom tools stay disabled; no task, web, skill or plugin escape.
export function workflowToolMask(roleId) {
  if (!Object.hasOwn(ROLE_DEFINITIONS, roleId)) throw Error('workflow_unknown_role');
  const allowed = new Set(ROLE_DEFINITIONS[roleId].allowedTools);
  return Object.fromEntries(['read','glob','grep','write','edit','apply_patch','bash','task','webfetch','websearch','skill','question','todowrite'].map(tool => [tool, allowed.has(tool)]));
}

export function formatHandoffContext({
  iteration = 1,
  previousRole = null,
  previousStepTitle = null,
  testOutput = null,
  reviewFeedback = null,
  modifiedFiles = []
}) {
  const parts = [];
  parts.push(`[Handoff Context - Iteration ${iteration}]`);
  if (previousRole && previousStepTitle) {
    parts.push(`Preceding Step: "${previousStepTitle}" (${previousRole})`);
  }
  if (modifiedFiles.length > 0) {
    parts.push(`Files Modified: ${modifiedFiles.join(', ')}`);
  }
  if (testOutput) {
    parts.push(`Test Results:\n\`\`\`\n${testOutput.trim().slice(-2000)}\n\`\`\``);
  }
  if (reviewFeedback) {
    parts.push(`Reviewer Feedback:\n${reviewFeedback.trim()}`);
  }
  return parts.join('\n');
}

export function buildRolePrompt({
  roleId = 'implementer',
  stepTitle = '',
  taskPrompt = '',
  targetFiles = [],
  acceptanceCriteria = [],
  handoffContext = null
}) {
  const role = getRoleDefinition(roleId);
  const sections = [];

  sections.push(`${role.systemInstruction}\n`);
  sections.push(`Task: ${stepTitle}`);
  sections.push(`Instructions: ${taskPrompt}`);

  if (targetFiles.length > 0) {
    sections.push(`Target Files: ${targetFiles.join(', ')}`);
  }

  if (acceptanceCriteria.length > 0) {
    sections.push(`Acceptance Criteria:\n${acceptanceCriteria.map(c => `- ${c}`).join('\n')}`);
  }

  if (handoffContext) {
    sections.push(`\n${handoffContext}`);
  }

  return sections.join('\n\n');
}

