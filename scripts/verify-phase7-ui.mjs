// Phase 7 End-to-End Verification: Visual Tokens, 4-Pane IDE Grid,
// 5-Tab Inspector Panel, Keyboard Navigation, Accessibility, and Responsive Reflow.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { root, loadConfig } from '../src/config.mjs';
import { launchBrowser } from './browser.mjs';

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const directory = join(root, 'validation/phase7-research');
mkdirSync(directory, { recursive: true });

const project = {
  id: '77777777-7777-7777-7777-777777777777',
  name: 'LocalAgent IDE',
  path: root,
};

const snapshot = {
  state: 'completed',
  messages: [
    {
      id: 'msg_p7_1',
      role: 'user',
      parts: [{ type: 'text', text: 'Refactor the workspace into a modern dark IDE workspace with 5-tab inspector panel.' }],
    },
    {
      id: 'msg_p7_2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: '## Phase 7 Modern Dark IDE Workspace\n\nAll 5 inspector views are now implemented:\n- **Browser**: Builder preview\n- **Files**: Interactive file tree and read-only code viewer\n- **Commands**: Executed agent bash commands and exit status\n- **Changes**: Session diff viewer\n- **Tests**: Test runner status and pass/fail summary\n\n```javascript\n// Verification harness\nexport function verifyPhase7() {\n  return { darkTheme: true, panels: 5, accessible: true };\n}\n```',
        },
        {
          type: 'tool',
          tool: 'bash',
          status: 'completed',
          title: 'Run test suite',
          command: 'npm test',
          output: '✔ 111 tests passed in 3.3s',
          exit: 0,
        },
      ],
    },
  ],
  permissions: [],
  diffs: [
    {
      file: 'apps/workspace/src/tokens.css',
      patch: '@@ -1,5 +1,9 @@\n+:root {\n+  --canvas: #0e120f;\n+  --surface: #141a15;\n+  --moss: #a8c47b;\n+}\n',
    },
  ],
  context: {
    source: 'opencode-reported',
    inputTokens: 2450,
    inputIncludingCache: 3100,
  },
  compaction: { count: 0, auto: false },
};

const server = createWorkspaceServer({
  config: loadConfig(),
  projects: {
    list: () => [project],
    get: (id) => (id === project.id ? project : null),
  },
  tasks: {
    list: () => [{ id: 'ses_phase7', projectId: project.id, title: 'IDE Refactor' }],
    snapshot: async () => snapshot,
    history: async () => ({ messages: [], hasMore: false }),
  },
  credentials: {},
  port: 0,
});

let browser;
const errors = [];
const report = {
  fixture: true,
  checkpoints: {},
  measurements: {},
  audits: [],
  errors,
};

async function audit(page, name) {
  await page.evaluate(axe);
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    });
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
      incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      passes: r.passes.length,
    };
  });
  report.audits.push({ name, ...result });
  assert.deepEqual(result.violations, [], 'Accessibility violations in ' + name + ': ' + JSON.stringify(result.violations));
}

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;

  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/api/v1/status') {
      return route.fulfill({
        json: {
          providers: [{ id: 'openrouter', name: 'OpenRouter', connected: true }],
          plan: {
            targets: [
              {
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                provider: 'openrouter',
                contextWindow: 131072,
              },
            ],
          },
          events: [],
        },
      });
    }
    return route.continue();
  });

  await page.goto('http://127.0.0.1:' + port, { waitUntil: 'networkidle' });

  // 1. Select Project and Task
  await page.getByRole('button', { name: 'LocalAgent IDE' }).first().click();
  await page.getByRole('button', { name: /IDE Refactor/ }).first().click();
  await page.locator('.markdown h2').filter({ hasText: 'Phase 7' }).waitFor();

  // Checkpoint 7.1: Dark Mode Default and Light Mode Toggle
  const defaultTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(defaultTheme, 'dark', 'Default theme should be dark');
  const canvasBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  report.measurements.defaultCanvasBg = canvasBg;

  const themeToggle = page.getByRole('button', { name: /Switch to (light|dark) (theme|mode)/ });
  await themeToggle.click();
  const lightTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(lightTheme, 'light', 'Theme did not switch to light');

  await themeToggle.click();
  const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(restoredTheme, 'dark', 'Theme did not toggle back to dark');
  report.checkpoints.checkpoint7_1_tokens_theme = true;

  // Checkpoint 7.2: 4-Pane IDE Grid & Panel Toggling
  const rail = page.locator('nav.rail');
  const tabs = page.locator('header.tabs');
  const side = page.locator('aside.side');
  const main = page.locator('main.main');
  const panel = page.locator('aside.panel');
  const status = page.locator('footer.status');

  assert.ok(await rail.isVisible(), 'Rail must be visible');
  assert.ok(await tabs.isVisible(), 'Top tabs must be visible');
  assert.ok(await side.isVisible(), 'Side panel must be visible');
  assert.ok(await main.isVisible(), 'Main workspace must be visible');
  assert.ok(await panel.isVisible(), 'Right inspector panel must be visible');
  assert.ok(await status.isVisible(), 'Status bar must be visible');

  // Toggle Inspector Panel via keyboard shortcut (Ctrl+Alt+P)
  await page.keyboard.press('Control+Alt+KeyP');
  assert.ok(!(await panel.isVisible()), 'Panel did not hide on Ctrl+Alt+P');

  await page.keyboard.press('Control+Alt+KeyP');
  assert.ok(await panel.isVisible(), 'Panel did not restore on Ctrl+Alt+P');

  // Toggle Commands Dock via keyboard shortcut (Ctrl+Alt+C)
  const dockBody = page.locator('.dock-body');
  assert.ok(!(await dockBody.isVisible()), 'Commands dock body should be collapsed initially');
  await page.keyboard.press('Control+Alt+KeyC');
  assert.ok(await dockBody.isVisible(), 'Commands dock body did not open on Ctrl+Alt+C');
  await page.keyboard.press('Control+Alt+KeyC');
  assert.ok(!(await dockBody.isVisible()), 'Commands dock body did not close on Ctrl+Alt+C');
  report.checkpoints.checkpoint7_2_layout_grid = true;

  // Checkpoint 7.3: Conversation Thread, Code Highlighting, and Composer Chips
  const thread = page.locator('.thread.conversation');
  assert.ok(await thread.isVisible(), 'Thread container must have classes .thread.conversation');
  assert.ok(await page.locator('code.language-javascript span').first().isVisible(), 'Shiki syntax highlighting missing');
  assert.ok(await page.locator('.tool-card').first().isVisible(), 'Bash tool card missing');

  // Composer draft input and route chip
  const promptInput = page.locator('#task-prompt');
  await promptInput.fill('Verify Phase 7 implementation');
  assert.equal(await promptInput.inputValue(), 'Verify Phase 7 implementation');
  await promptInput.fill('');
  assert.ok(await page.locator('.chip').filter({ hasText: /llama|Guarded coding route/i }).first().isVisible(), 'Model route chip missing');
  report.checkpoints.checkpoint7_3_conversation_composer = true;

  // Checkpoint 7.4: 5-Tab Inspector Panel
  // 1. Files Tab
  await page.getByRole('tab', { name: 'Files' }).click();
  await page.locator('.tree').waitFor();
  assert.ok(await page.getByRole('button', { name: /package\.json/ }).first().isVisible(), 'File tree item package.json not found');

  // Select a file to view
  await page.getByRole('button', { name: /package\.json/ }).first().click();
  await page.locator('.viewer-head').waitFor();
  assert.ok(await page.getByText('package.json', { exact: false }).first().isVisible(), 'Viewer did not display selected file');
  assert.ok(await page.locator('pre.code code').first().isVisible(), 'Read-only code viewer did not render');

  // 2. Commands Tab
  await page.getByRole('tab', { name: 'Commands' }).click();
  await page.locator('.command-card').first().waitFor();
  assert.ok(await page.getByText('npm test').first().isVisible(), 'Commands panel did not display executed bash command');

  // 3. Changes Tab
  await page.getByRole('tab', { name: 'Changes' }).click();
  await page.locator('.diff-card').first().waitFor();
  assert.ok(await page.getByText('tokens.css').first().isVisible(), 'Changes panel did not display diff card');

  // 4. Tests Tab
  await page.getByRole('tab', { name: 'Tests' }).click();
  await page.locator('.test-card').first().waitFor();
  const cardText = await page.locator('.test-card').first().textContent();
  console.log('TEST CARD TEXT:', cardText);
  assert.ok(/passed/i.test(cardText), 'Tests panel did not show test pass indicator');

  // 5. Browser Tab
  await page.getByRole('tab', { name: 'Browser' }).click();
  await page.locator('.preview-empty').waitFor();
  report.checkpoints.checkpoint7_4_inspector_tabs = true;

  // Checkpoint 7.5: Status Bar
  assert.ok(await status.getByText('Local runtime').isVisible(), 'Status bar runtime indicator missing');
  assert.ok(await status.getByText('free-only', { exact: true }).isVisible(), 'Status bar free-only badge missing');
  assert.ok(await status.getByText(/route: meta-llama/).isVisible(), 'Status bar route indicator missing');
  assert.ok(await status.getByText(/last input: 3,100 tokens/).isVisible(), 'Status must label the last completed input including cache, without implying current occupancy');
  report.checkpoints.checkpoint7_5_status_bar = true;

  // Checkpoint 7.6: Accessibility Audit & Responsive Reflow
  await audit(page, 'ide-workspace-desktop');

  // Capture desktop screenshot (Dark Mode)
  await page.screenshot({ path: join(directory, 'phase7-verified.png'), fullPage: false });

  // Light Mode Verification: toggle to light, audit accessibility, capture screenshot
  await themeToggle.click();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  // The theme attribute updates before existing CSS color transitions finish.
  // Audit the settled palette, rather than sampling an intermediate blend.
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await audit(page, 'ide-workspace-light');
  await page.screenshot({ path: join(directory, 'phase7-light-verified.png'), fullPage: false });
  await themeToggle.click(); // revert to dark

  // Responsive Reflow at 1180px
  await page.setViewportSize({ width: 1180, height: 900 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Horizontal overflow at 1180px'
  );

  // Responsive Reflow at Mobile (390px)
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Horizontal overflow at 390px mobile'
  );
  await page.screenshot({ path: join(directory, 'phase7-mobile-verified.png'), fullPage: false });
  report.checkpoints.checkpoint7_6_accessibility_reflow = true;

  assert.equal(errors.length, 0, 'Browser errors during verification: ' + JSON.stringify(errors));
  report.passed = Object.values(report.checkpoints).every(Boolean);
} catch (err) {
  report.passed = false;
  report.error = err.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  writeFileSync(join(directory, 'phase7-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

