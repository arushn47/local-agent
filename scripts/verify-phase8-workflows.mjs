// Phase 8 End-to-End Verification: Intelligent Multi-Agent Workflows,
// Hierarchical Execution Tree, Model Reassignment, Checkpoint Restoration, and Accessibility.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { root, loadConfig } from '../src/config.mjs';
import { launchBrowser } from './browser.mjs';
import { saveCatalog } from '../src/catalog.mjs';
import { createPlan } from '../src/workspace/planner.mjs';
import { createWorkflowInstance, saveWorkflow } from '../src/workspace/workflow-engine.mjs';
import { createCheckpoint } from '../src/workspace/checkpoints.mjs';
import { POLICIES } from '../src/workspace/models.mjs';

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const directory = join(root, 'validation/phase8');
mkdirSync(directory, { recursive: true });

const project = {
  id: '88888888-8888-8888-8888-888888888888',
  name: 'Multi-Agent Workflow Project',
  path: root
};

// Seed a complete hierarchical workflow fixture
const mockCatalog = {
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
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
          tools: true
        },
        'gemini-3.5-flash-lite': {
          id: 'gemini-3.5-flash-lite',
          provider: 'gemini',
          name: 'Gemini 3.5 Flash Lite',
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
saveCatalog(mockCatalog);

const plan = createPlan({
  prompt: 'Implement Mood-Based Music Playlist Discovery with Repeat Verification',
  templateId: 'feature-implement-verify',
  policy: POLICIES.FREE_ONLY,
  catalog: mockCatalog,
  workspaceDir: root
});

const workflowInstance = createWorkflowInstance({ plan, workspaceDir: root });
// Populate step execution statuses
workflowInstance.status = 'running';
workflowInstance.stepStates['plan-architecture'].status = 'completed';
workflowInstance.stepStates['plan-architecture'].durationMs = 18000;
workflowInstance.stepStates['research-deps'].status = 'completed';
workflowInstance.stepStates['research-deps'].durationMs = 24000;
workflowInstance.stepStates['scaffold-structure'].status = 'completed';
workflowInstance.stepStates['scaffold-structure'].durationMs = 32000;
workflowInstance.stepStates['implement-changes'].status = 'running';
workflowInstance.stepStates['implement-changes'].durationMs = 45000;

saveWorkflow(workflowInstance, root);

// Create a checkpoint fixture
const chk = createCheckpoint({
  workspaceDir: root,
  workflowId: workflowInstance.id,
  stageId: 'implement-and-verify-cycle',
  targetFiles: ['package.json'],
  description: 'Pre-implementation repeat cycle snapshot'
});

const snapshot = {
  state: 'idle',
  messages: [
    {
      id: 'msg_wf_1',
      role: 'user',
      parts: [{ type: 'text', text: 'Implement Mood-Based Music Playlist Discovery with Repeat Verification' }]
    },
    {
      id: 'msg_wf_2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'I have started the intelligent multi-agent workflow to implement and verify this feature. You can monitor live execution in the Workflows panel.'
        }
      ]
    }
  ],
  permissions: [],
  diffs: [],
  context: { source: 'opencode-reported', inputTokens: 1800, inputIncludingCache: 2200 },
  compaction: { count: 0, auto: false }
};

const server = createWorkspaceServer({
  config: loadConfig(),
  projects: {
    list: () => [project],
    get: (id) => (id === project.id ? project : null),
    add: () => project,
    remove: () => {}
  },
  tasks: {
    list: () => [{ id: 'task-wf-1', title: 'Implement Mood Discovery', createdAt: new Date().toISOString() }],
    create: async () => ({ id: 'task-wf-1' }),
    snapshot: async () => snapshot,
    active: () => false,
    prompt: async () => {},
    cancel: async () => {},
    permission: async () => {},
    history: async () => []
  },
  credentials: { update: async () => {} },
  previews: null,
  port: 0
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

console.log(`Phase 8 verification server listening at ${base}`);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.addInitScript(({ projId }) => {
    localStorage.setItem('localagent.workspace', JSON.stringify({
      project: projId,
      session: 'task-wf-1',
      theme: 'dark',
      rightPanelOpen: true,
      inspectorTab: 'workflows'
    }));
  }, { projId: project.id });

  await page.goto(base, { waitUntil: 'networkidle' });

  // Switch to Workflows Inspector Tab
  console.log('1. Switching to Workflows inspector tab...');
  const workflowsTab = page.locator('button.panel-tab:has-text("Workflows")');
  await workflowsTab.waitFor({ state: 'visible', timeout: 5000 });
  await workflowsTab.click();

  // 2. Verify Workflow Tree Elements
  console.log('2. Verifying workflow execution tree structure...');
  const wfCard = page.locator('.workflow-tree-card');
  await wfCard.waitFor({ state: 'visible', timeout: 5000 });

  const titleText = await page.locator('.wf-title').textContent();
  assert.ok(titleText.includes('Mood-Based Music Playlist'), 'Workflow title must be displayed');

  const policyChip = await page.locator('.wf-policy-chip').textContent();
  assert.ok(policyChip.includes('Free Only'), 'Free Only policy must be indicated');

  // Check stages
  const stageTitles = await page.locator('.wf-stage-title').allTextContents();
  assert.ok(stageTitles.some(t => t.includes('Analyze Requirements')), 'Plan stage must exist');
  assert.ok(stageTitles.some(t => t.includes('Preparation')), 'Parallel prep stage must exist');
  assert.ok(stageTitles.some(t => t.includes('Implement & Verify')), 'Repeat cycle stage must exist');

  // Check status badges
  const completedBadges = await page.locator('.wf-status-badge.status-completed').count();
  assert.ok(completedBadges >= 3, 'Completed steps must have completed status badge');

  const runningBadges = await page.locator('.wf-status-badge.status-running').count();
  assert.ok(runningBadges >= 1, 'Active step must have running status badge');

  // 3. Test Interactive Model Switcher
  console.log('3. Testing interactive model chip dropdown...');
  const modelChip = page.locator('.wf-model-chip').first();
  await modelChip.click();

  const modelDropdown = page.locator('.wf-model-dropdown');
  await modelDropdown.waitFor({ state: 'visible', timeout: 3000 });
  const optionsCount = await page.locator('.wf-model-option').count();
  assert.ok(optionsCount >= 2, 'Available models must be listed in dropdown');

  // Close dropdown by clicking header
  await page.locator('.wf-card-header').click();

  // 4. Test Checkpoint Controls & Restore Banner
  console.log('4. Verifying Checkpoint controls...');
  const restoreBtn = page.locator('button:has-text("Restore Checkpoint")');
  await restoreBtn.waitFor({ state: 'visible', timeout: 3000 });

  // 5. Accessibility Audit (Dark Mode)
  console.log('5. Running axe-core accessibility audit in Dark Mode...');
  await page.evaluate(axe);
  const darkResults = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: true } }
    });
  });
  console.log(`   Dark mode violations: ${darkResults.violations.length}`);
  if (darkResults.violations.length > 0) {
    console.error(JSON.stringify(darkResults.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help })), null, 2));
  }
  assert.equal(darkResults.violations.length, 0, 'Zero axe-core accessibility violations in dark mode');

  await page.screenshot({ path: join(directory, 'workflows-tree-dark.png') });

  // 6. Test Light Mode
  console.log('6. Testing Light Mode reflow and accessibility...');
  const lightToggle = page.locator('button[aria-label="Switch to light theme"]');
  await lightToggle.click();
  await page.waitForTimeout(300);

  const lightResults = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: true } }
    });
  });
  console.log(`   Light mode violations: ${lightResults.violations.length}`);
  if (lightResults.violations.length > 0) {
    console.error(JSON.stringify(lightResults.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help })), null, 2));
  }
  assert.equal(lightResults.violations.length, 0, 'Zero axe-core accessibility violations in light mode');

  await page.screenshot({ path: join(directory, 'workflows-tree-light.png') });

  console.log('Phase 8 multi-agent workflow verification successfully completed!');
} finally {
  await page.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise(res => server.close(res));
}
