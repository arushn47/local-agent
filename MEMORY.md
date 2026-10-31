# Development memory

Latest recovery checkpoint: 171/171 regressions, UI build and all three browser checks pass. File-backed project ownership coordinates runners/processes and single-agent dispatch; only read-only roles share parallel batches. Crashed leases require session abort/reconciliation; ambiguous retries and interrupted loops require review/replanning, never replay. Production remains gated. Attributed durable guard accounting is next.

## Authoritative recovery status — 2026-11-01

Local baseline `21eacb4` preserves source/docs; credential scan passed, no push, private data/installers/raw evidence remain ignored locally. False-success checkpoint `d78ab90` passed 150/150 regressions and UI build. Security checkpoint now has 156/156 regressions, production UI build and a browser check using the actual authenticated restore API: dismiss preserves files, post-preview edits reject the entire preflight, explicit fresh approval restores and leaves a paused workflow requiring replanning.

Production workflow activation/resume/retry is deliberately gated pending supervised OpenCode lifecycle, exact-model registration, durable concurrency/recovery, workflow budget attribution and enforced role tools. Plan saving and existing single-agent tasks remain available. Paid workflow activation is rejected. No live inference, packaging, publishing or remote push. Next is recovery checkpoint 4, with acceptance gates in [recovery evidence](docs/phase8/RECOVERY.md).

Updated 2026-10-30. Phases 1-4, 0.5.0/0.5.1, Phase 6.5 (110/110 tests), and Phase 7 (111/111 tests) are accepted development milestones. **0.5.2 is a Phase 5.2 development candidate; public release is blocked.** Phase 7 Dark IDE Workspace and light mode polish are complete and verified (111/111 tests); Phase 8 is partially implemented and under integration recovery.



## Phase 7 — Dark IDE Workspace Redesign & Light Mode Polish — 2026-10-30

Phase 7 builds upon the approved dark IDE workspace visual foundation (`docs/phase7/mockup.html`) and Freebuff comparative research (`validation/phase7-research/`). The user approved the mockup as the visual foundation for LocalAgent's next evolution.

Visual direction & ergonomics:
- Neutral charcoal surfaces (Dark): `--canvas: #0e120f`, `--surface: #141a15`, `--surface-2: #19201a`, `--surface-3: #1f271f`, `--line: #26302a`.
- Clean parchment surfaces (Light): `--canvas: #f8faf6`, `--surface: #ffffff`, `--surface-2: #f0f4ee`, `--surface-3: #e5ebe2`, `--line: #d8e2d4`.
- Restrained moss green accents: `--moss: #a8c47b` (dark), `--moss: #4a6738` (light); `--moss-dim: #3d5132` (dark), `#dfead7` (light); `--moss-ink: #0f150e` (dark), `#ffffff` (light).
- 4-pane grid: 52px Product Rail, 258px Left Sidebar, 1fr Central Conversation Workspace, 470px Right Inspector, 26px Bottom Status Bar.
- Central Workspace includes conversational message thread, inline tool call cards with fold/unfold, inline diffs, inline permission cards, composer with model/route chips, and a collapsible bottom Commands dock.
- Right Inspector hosts 5 tabs:
  1. Browser: isolated static preview builder with viewport scaling, syntax check, Playwright check, console logs, and export.
  2. Files: project file tree and read-only code viewer with syntax highlighting and line numbers.
  3. Commands: agent-issued command history, exit codes, elapsed times, outputs.
  4. Changes: session diffs and additions/deletions.
  5. Tests: dedicated test runner status, commands, and outputs.
- Keyboard navigation: `Ctrl+Alt+P` (toggle right panel), `Ctrl+Alt+C` (toggle commands dock), `Ctrl+O` (folder picker), `Escape` (modals), `Enter`/`Shift+Enter` (composer).

Light Mode Polish:
- Eliminated pitch-black dock and preview-board backgrounds by converting to `var(--surface-2)`.
- Replaced hardcoded dark backgrounds across diff cards, code blocks, tool cards, and badges with adaptive variables and `color-mix()` tints.
- Scoped mobile project selector (`#mobile-project`) strictly to `@media (max-width: 768px)`, preventing desktop header pollution.
- Bound theme switching to Markdown and FilesPanel code rendering, dynamically applying Shiki `github-light` on `#ffffff` background with elevated comment contrast (`#57606a`), achieving WCAG AA.
- Refined sidebar quota line with single-line ellipsis truncation.

Backend feasibility & security verified:
- Browser panel: fully supported by existing `BuilderPanel.jsx` and `previews.mjs`.
- Files panel: supported via safe project file listing (`/api/v1/projects/:id/files`) and content (`/api/v1/projects/:id/file`) endpoints adhering to strict project boundary, symlink rejection, and secret exclusion (`.env*`, `credentials*`, `.localagent`, etc.).
- Commands panel: projected directly from session snapshot tool calls (`bash`), exit codes, timestamps, and active permissions.
- Changes panel: projected directly from `snapshot.diffs` and `toolChanges`.
- Tests panel: projected from bash tool runs matching test patterns (`vitest`, `pytest`, `node --test`), summarizing passed/failed state.

Verification outcomes:
- 111/111 regression tests pass (`test/*.test.mjs`) with zero external inference.
- Production UI bundle builds cleanly with zero errors (`npm run build:ui`).
- Automated Phase 7 verification (`scripts/verify-phase7-ui.mjs`): 0 axe-core violations in dark mode (`ide-workspace-desktop`), 0 violations in light mode (`ide-workspace-light`).
- Responsive reflow verified at 1180px desktop and 390px mobile.
- Conversation scale fixture (`scripts/verify-conversation-scale.mjs`) maintains scroll anchoring to 0.078px with 0 axe violations.
- Evidence screenshots recorded in `validation/phase7-research/` (`phase7-verified.png`, `phase7-light-verified.png`, `phase7-mobile-verified.png`).

Safeguards preserved:
- OpenCode remains single source of truth for sessions and tools.
- OmniRoute remains internal dispatch engine with zero-price caps.
- LocalAgent guard continues enforcing free-only inference, context ceilings, and ephemeral Gemini signature constraints.
- Git repository initialized on branch main with remote origin pointing to https://github.com/arushn47/local-agent.git.

## Phase 6.5 — 2026-10-30

Audit of the pinned engine found only three supported efficiency levers: ambient `AGENTS.md` (the `instructions` config array has no consumer in 1.18.31), `tool_output` truncation defaults of 2000 lines / 50 KiB, and per-agent `steps`. No new engine features were invented.

Implemented opt-in (`executionGuidance: true`, boolean-validated, default off, no prompt change, no extra request): a ≤1.8 KB ambient guidance file written to the engine profile's global `opencode/AGENTS.md` (targeted search, no unchanged re-reads/repeated commands, narrow tests, small tool output, objective/checkpoint discipline, honest failure reporting; it never overwrites user instructions), and upstream `tool_output` limits of 600 lines / 16 KiB in the generated config. `src/workspace/engine.mjs` applies it at launch.

`src/workspace/behavior-audit.mjs` aggregates steps, tool calls, output bytes, failures and duplicate reads/commands without retaining prompts, paths or output text; `compareArms` returns null for unknown values rather than guessing. Five immutable benchmark fixtures (boundary bug, feature, refactor, failing-test diagnosis, 56 KB long-context rule) live under `benchmarks/` with hidden acceptance checks; `scripts/verify-benchmarks.mjs` proves fail-before/pass-after for all five, zero inference. **110/110 regressions.**

**Not verified:** no three-arm comparison was run and no efficiency claim is made; guidance wording and effect on a real small model are unmeasured. Live benchmark arms require owner approval. [Evidence](validation/phase65/README.md).

## Phase 6.4 — 2026-10-30

Extended-conversation, soak and compaction-boundary work. **102/102 regressions**, production UI build, and the new scale fixture pass with zero inference.

Long history: eleven 50-message page loads through the real UI — dedupe at page boundaries, scroll anchoring worst case **0.86 px**, 500-message view bound enforced (11 requests for 12 pages, a DOM click on the capped control issues none), task switch isolates and resets paging. Two source defects were found by the fixture and fixed: paging measured scroll *after* the request (a mid-request reflow was mistaken for the reading position; metrics are now captured before awaiting), and the paging button was `disabled` while busy, which drops focus; it now uses `aria-disabled`/`aria-busy` with an in-handler guard. Accessibility: axe 0 violations on the long conversation and second task (two `color-contrast` nodes incomplete, manual review needed), named region/heading/focused `group` in the AX tree, keyboard paging and code scrolling; a skipped heading level in the builder inspector and unnamed fenced-block roles were fixed.

Packaged soak: the instrumented reproduction ran **40 rounds with no error** (226-465 ms refresh, revision advancing, 141 DOM nodes, ~5 MB heap); both failed profiles' lifecycle logs showed a healthy runtime that stopped only when the driver gave up. The refresh path is therefore not deterministically broken. The 20 s marker wait stalls in one of two places the old artifacts cannot separate: an unpublished preview revision or a renderer poll that does not run while the window is occluded (`document.hidden` stays false under this driver). **Not fixed, not masked with retries**; the failure report now also records the iframe revision beside the server preview state.

Compaction boundaries: `test/compaction-recovery.test.mjs` proves cancel at a boundary keeps the pre-compaction patch, restart from the durable session reference restores marker/history without resending a prompt, and a second unproductive compaction stops as `progress_budget_exhausted`. `src/workspace/summary-fidelity.mjs` (+ tests) validates objective/constraint/unresolved-error/pending-task/read-files survival. `scripts/verify-live-compaction.mjs` is approval-gated and currently **blocked**: `.localagent/opencode.json` predates this build (no `compaction` block), so automatic compaction is unscheduled until `npm run configure` runs with it. No live compaction, real fidelity or packaged restart evidence. [Evidence](validation/phase64/README.md).

## Phase 6 — 2026-10-29

Owner authorized free-first coding/context validation while keeping public-release gates separate. Focused audit and checkpoints: [audit](docs/PHASE6-AUDIT.md), [plan](PHASES.md). Ponytail inspected as an untrusted reference, not installed; no dependencies or upstream source changed. First implementation projects metadata-only last-completed OpenCode input/cache counts beside the composer. Current occupancy, capacity/percentage and category breakdown remain explicitly unknown; no arbitrary route-model attribution. Automatic/manual compaction behavior and guard budgets are unchanged. 86/86 regressions, production UI build and loopback-only Playwright context/keyboard/missing-data/mobile checks pass; screenshots and results are in validation/phase6. This is an initial context-visibility slice, not complete context management. No live inference, packaged upgrade or new failover evidence in this checkpoint.

## Phase 6.3 - 2026-10-30

Owner decision: keep manual compaction disabled until upstream supports it; mention only in Context > Technical details. Phase 6.2 scheduling/guards/signatures/credentials are unchanged.

Assistant Markdown uses existing pinned Marked 15.0.12, DOMPurify 3.4.17 and lazy Shiki 4.5.0. Raw HTML is literal text, remote images are placeholders, links allow only absolute HTTP(S)/mailto. Syntax tokens are text nodes; seven supported languages and 8K-char highlighting limit, otherwise plain code. Exact already-locked production versions are now direct dependencies; no new versions/install scripts. Notices and grammar/transitive distribution review remain required.

Older-history navigation uses SDK session.messages(before,limit:50), safe projection and validated cursors/ownership. UI pages merge/deduplicate in transient memory, reset per session, preserve scroll/focus and stop at 500 older messages plus latest 100. All saved task tabs are reachable; tools show titles/exit codes. No new history store or tool replay.

Verified: 96/96 regressions, production UI build, context/compaction fixture and new conversation Playwright fixture (Markdown/highlighting, hostile-content exclusion, keyboard paging/focus, mobile reflow, zero browser errors). Zero inference; source-only, installed app/approved installers unchanged. Main JS 129.40 KB / 45.28 KB gzip; optional highlighting 757.76 KB / 127.87 KB gzip. Large-chunk warning retained. [Evidence](validation/phase63/README.md).

Next: longer/live history and reconnect/switch validation; actual compaction fidelity remains unverified. No performance/full accessibility/public-release claim. Phase 6.4/6.5 remain open.

## Phase 6.2 — compaction mapping — 2026-10-30

**Manual compaction is unavailable in the pinned engine.** A zero-inference probe (`scripts/verify-engine-compaction.mjs`) started the installed 1.18.31 binary in a throwaway profile, created a session and called the documented route: `POST /api/session/:id/compact` → **503 "Session compact is not available yet"**. Pinned source confirms `V2Session.compact` raises `OperationUnavailableError`; `client.session.summarize` targets the deprecated v1 route upstream's migration checklist replaces. No manual control, no second summarizer. Route probe also fixes the mapping: `/api/session/:id/message` pages durable history, `/api/session/:id/context` is post-compaction only, legacy `/session/:id/message` serves the workspace.

Threshold reconciliation: guard unchanged at `contextWindow - output - max(512,5%)` in UTF-8 bytes; upstream default 20K-token buffer fired ~4x later, so compaction could never precede a `422 context_budget_error`. New `inputCeiling`/`compactionSettings` in `src/context.mjs` (single source of truth, reused by `requestBudget`) schedule upstream `compaction.buffer`/`keep.tokens` at 85% of that ceiling; `src/omniroute.mjs` writes them into the generated engine config. Guard bounds, error codes, retryability and progress budgets unchanged.

Preservation fixtures: `test/compaction.test.mjs` proves earlier messages/tool results/patches/permissions survive projection, compaction is metadata-only (no summary, reasoning or signatures), and repeated snapshots never replay the prompt. UI shows a metadata-only "Earlier history summarized" divider and states manual compaction is unavailable.

**94/94 regressions, production UI build and loopback UI fixture (compaction marker, keyboard, missing usage, 390px reflow, zero errors) pass.** Zero external inference. [Evidence](validation/phase6/README.md), [audit](docs/PHASE6-AUDIT.md). Not verified: a live compaction event and therefore real summary fidelity; large single tool outputs can still exceed the summary prompt budget. 6.2 is not complete.

Next: obtain a bounded live compaction observation (owner-approved free-route task) before claiming fidelity, keep manual compaction blocked per owner decision; 6.3 now has its first verified implementation. Routed capacity/occupancy stays unknown. Real-workflow/benchmark comparisons remain pending, not inferred from historical successes.

## Installation repair — 2026-10-29

User clarified the intended destination is D:, not C:. Actual blocker: `D:\LocalAgent` was empty, `D:\LocalAgent.stage` contained 0.5.1, and a format-2 journal said `rolled_back` from 0.5.1 to 0.3.0; prior payload/rollback and both registration keys were absent. Original removal/interruption cause is unestablished. Separately observed C: material was not changed.

New installer-only preflight classifies retained states, uses trusted Node extracted from its own unchanged archive, defaults to cancellation, preserves material by dated rename with a manifest, and never deletes recovery files. Completed upgrades are not automatically rolled back. Ambiguous/foreign/invalid states fail closed. Tested original failure, silent decline, unknown-material preservation, real upgrade/rollback/retry and committed-version retention in disposable directories. **84/84 regressions pass.**

Actual D: installation completed interactively using recovery revision 2: registry and journal confirm committed **0.5.2 at D:\LocalAgent**. Old stage/journal retained at `D:\LocalAgent.recovery-1793244277903-d31c3afc`. **7,387 user-data file hashes unchanged**, including credentials, settings and conversation stores. Installed D: application passed isolated-profile builder/security/preview/crash-restart/shutdown checks; zero inference.

Upstream appends the app subfolder only when Install is pressed, so the selection page can show only `D:\`. A directory-page normalization callback was added in recovery revision 4. It compiles; live visual verification was stopped by the user's physical Escape. **Do not claim the final directory-field behavior is verified.** No further Computer Use until explicitly resumed. User then confirmed downloading/installing; no reinstall is needed. Final candidate: `release/desktop-0.5.2-recovery4/LocalAgent-Setup-0.5.2-recovery4-x64.exe`; original 0.5.2 payload/archive retained. Evidence: [installation repair](validation/phase52-install-fix/README.md). Phase 5.3 not started.

## Architecture and safeguards

OpenCode owns agent/sessions/tools; OmniRoute owns dispatch/cooldowns. Pins: OpenCode 1.18.31, OmniRoute 3.8.52, Next 16.4.3 security build, Node 24.22.1, Electron 42.11.18. Upstream source is unchanged. Version/template-checked generated Next configuration retains Phase 5.1's documented on-demand route loading.

Free-only admission, fixed egress, native authentication, context/task limits, DPAPI and ephemeral Gemini signatures/provenance remain. Only previously evidenced directed Gemini -> OpenRouter Cohere continuation may qualify with fresh free-model metadata. Unsupported routes remain unavailable; old Gemini history may fail closed after restart. No new live coding/failover claim. [Phase 4 coding proof](validation/phase4/packaged-coding.json) is historical; Phase 5.2 used zero external inference.

## Phase 5.2 verified

- Backend-only packaging uses pinned upstream traces, server externals/native-worker extras and dependency/optional/peer closure. Selected external graph: 278 packages; actual inventory: 296 manifests including nested/compiled examples, versus 1,217 before. Spline/Giscus/Lobe UI/icons/Ant Design/Monaco external packages excluded; Next React peers retained. Existing CLI-token helper retained for authentication.
- Isolated loopback tool/history/cooldown fixture passes: 1,032 observed module files, zero development-module escapes. Candidate/stage/packaged dependency byte hashes match. Staging guards bind exact bytes, lock graph and supported versions; no universal optional-endpoint certification.
- **77/77 regressions**, zero production/full npm findings; frozen payload scan: 19,215 files, no exact known-secret matches, active env/npmrc or links. Native/embedded security coverage is incomplete.
- Actual fresh install, installed builder/security/export/crash-restart and uninstall pass. Real **0.3/0.4/0.5.0/0.5.1 -> 0.5.2 -> prior version** matrices pass, preserving projects/settings/draft and unchanged decryptable DPAPI placeholder ciphertext, exact registry restoration and uninstall cleanup.
- The 0.5.1 boundary additionally passes actual held-file rejection, extraction interruption, incomplete-candidate rejection and private post-registration failure recovery. Format-2 atomic journals and bounded sharing retries remain intact; legacy journals cannot invent missing registration snapshots. [Phase 5.1 evidence](validation/phase51/README.md) retains earlier failure investigations.
- Installed **13-view** accessibility and extended packaged **14-view WCAG 2.2-tag/400% zoom** checks pass with zero automated violations. Keyboard/focus/AX, reduced motion/transparency, contrast and forced colors pass; incomplete contrast/frame review and human screen-reader/native-dialog checks remain.
- Repeated renderer probe: after warm-up, another 20 navigation cycles keep 2 documents, 793 DOM nodes and 33 listeners; retained heap rises about 57 KiB. No unbounded growth demonstrated or leak-freedom claim. Final tracked-PID audit: 27 PIDs, no original live test processes; per-upgrade shutdown checkpoints also pass.

## Artifact and measurements

Installer: `release/desktop-0.5.2/LocalAgent-Setup-0.5.2-x64.exe`, **528,384,756 bytes**, SHA-256 `10c41c2110e74bbfd11f7abd8c564deb82819d15cbcd218c560db5c4534830f7`, unsigned. **21.57% smaller** than 0.5.1 (673,721,007 bytes); all four accepted older installer hashes unchanged. Frozen artifact/resources must not be edited without rebuilding and re-verifying. [Final evidence](validation/phase52/README.md), [identity](validation/phase52/artifact.json).

Installed accessibility launch: 6.8 seconds; new-version upgrade launches 18.7-20.9 seconds. Host caches/load are uncontrolled; no additional causal startup win over 0.5.1 or true cold-machine claim. A loaded source launch took 28.7 seconds.

31-minute no-inference engine/session baseline: final 703 MiB private / 391 MiB resident; last 15 samples range 686.4-703.7 MiB, net -0.7 MiB. High engine memory remains unresolved. Short documented Bun --smol pilot did not justify adoption; no production memory flag or engine replacement.

## Open release gates

- **Long packaged UI stability did not pass:** one run stopped after 17 cycles at refresh timeout; foreground run ended after 16 cycles with browser closed. Both recorded runtime shutdown. Scoped Windows event query found no native crash report; closure cause remains unestablished. Hide/show did not exercise Chromium hidden state. Retain failed evidence; do not repeatedly restart, infer visibility as root cause or claim leak freedom.
- Exact Bun 1.3.14+0d9b296af, default WebKit/TinyCC pins, notices, seven indexed source archives and native hashes collected. wreq binding and main libvips DLL match official hashes; Sharp's separate C++ wrapper recipe identified. Full JSC/native source/object/relinking and transitive redistribution review remains incomplete. WebKit archive endpoint returns HTTP 422 content-creation blocked.
- Additional Sharp native notices/build recipes acquired after payload freeze remain outside the installer in ignored compliance-review storage. Sources are not a complete cleared source offer. Spline exclusion only addresses the reduced candidate, not older artifacts. Own license/name/legal publisher remain undecided.
- Independent clean Windows/OS-cold testing unavailable: Home build 26300, hypervisor present, no verified guest or detected management tooling. No virtualization installation/configuration/OS-image download/cost. Human Narrator/NVDA/native picker/OS scaling, power loss, disk-full, quarantine and actual registry-write denial remain unverified.

## Next work and owner decisions

Diagnose the long UI closure/refresh failure with sanitized close/visibility/renderer-exit evidence in a controlled environment; no speculative production patch. Continue engine allocation attribution and complete exact native source/relinking review. Obtain independent-machine and human-accessibility evidence before public acceptance.

Owner must choose own license/name/legal publisher/contacts and compliance-review path, provide a licensed independent Windows device/guest or approve a specific environment/terms, then select signing identity/key custody and release hosting. No purchase, license selection, publication, trust key or automatic updater was created. [Decisions](docs/RELEASE_DECISIONS.md), [review](docs/LICENSE_REVIEW.md), [release/recovery](docs/RELEASE.md). Tool approval review briefly failed at the account usage limit; the user resumed and remaining checks completed.

## Historical Phase 8 evidence correction

Earlier summaries asserted 8.1–8.7 completion and full OpenCode integration. The 2026-11-01 audit disproved that scope. Unit/custom-runner and seeded UI evidence remain useful but do not establish production multi-agent execution. Live-double artifacts include two successes and two failures; the runner called the guard and wrote generated source itself. They do not validate the UI → API → OpenCode tool-execution path, nor independent billing verification. The remote is configured, but no push was performed. Historical source and claims are retained in the local baseline commit.
