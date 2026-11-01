# Development phases

Blocker hardening: cumulative budget and terminal cleanup regressions pass; permission enforcement remains UNRESOLVED. Deterministic real OpenCode/OmniRoute edit/bash cases reproduce absent approvals and unprevented operations. Production now rejects native workflow dispatch before session creation, independently of the API gate. No live rerun. See docs/phase8/RECOVERY.md.

## Phase 8 Integration Recovery & Hardening — 2026-11-01

Phase 8 remains partial. Recovery checkpoints 1–3 have source/fixture evidence; checkpoints 4–9 remain open. Production workflow activation is blocked with `workflow_execution_not_ready` until the supervised execution and guard-attribution gates pass. Existing single-agent tasks remain available. No live inference, packaging, publishing or push.

| Recovery checkpoint | Current evidence |
|---|---|
| 1. Git preservation | Local baseline `21eacb4`; credential scan passed; private/generated data stays ignored on disk. |
| 2. False-success reporting | `d78ab90`; 150/150 suite and production UI build passed. Missing executors, timeout/provider/observation failures, and unverified test/review prose cannot establish success. |
| 3. API/checkpoint safety | Strict identifiers and bounded plan validation; confined state paths, link/hardlink rejection, atomic state publication; owner-bound snapshots; explicit preview/approval with stale-content rejection; restore pauses and requires replanning. 156/156 suite, production UI build and real authenticated browser restore check pass. See [recovery evidence](docs/phase8/RECOVERY.md). |
| 4–7. Production integration | Source/local contracts pass: supervised sessions, exact aliases, native roles, conservative recovery and attributed durable guard accounting. Actual live tool-path acceptance is pending. Paid activation is rejected. |
| 8–9. Adversarial and end-to-end acceptance | Early negative API/security fixtures pass. Crash/restart, runtime concurrency, budget/rate-limit and actual tool-execution acceptance remain open. Live tests need explicit bounded authorization. |

Updated 2026-10-29. This plan specifies completion gates, not fixed delivery promises. [PRD](PRD.md) defines scope; [architecture](ARCHITECTURE.md) defines ownership. Phases 1-4 and 0.5.0/0.5.1 are accepted development milestones. Phase 5.2 addresses release blockers; independent clean-machine, stability, licensing and human-accessibility gates remain open. See [current status](docs/STATUS.md), [MEMORY](MEMORY.md) and [Phase 5.2 evidence](validation/phase52/README.md).

Phase 4's scoped static builder passes current-host acceptance and is approved. [Evidence](validation/phase4/README.md). Phase 5 is authorized and in progress; public-release gates below remain open. [Hardening evidence](validation/phase5/README.md), [release operations](docs/RELEASE.md).

| Phase | Work | Exit evidence |
|---|---|---|
| 0 — Documentation | Review resources; establish the five root guides; reconcile historical docs | Consistent links and status; no runtime/dependency changes |
| 1 — Reliable product foundation | Pin and package tested runtimes; add directed route eligibility; centralize lifecycle/progress supervision and config contracts | Reproducible Windows setup; unsupported continuation cannot dispatch; existing 39 tests pass plus focused new policy tests |
| 2 — Original local workspace | Build matching upstream app unchanged; compose LocalAgent project home, provider onboarding, routing controls and diagnostics using Solid/OpenCode SDK | User opens project, configures provider, grants permissions, gets an actual edit, agent-run tests and diff; cancel/reconnect/error/keyboard flows verified |
| 3 — Desktop alpha | Reuse upstream Electron infrastructure; keychain onboarding/removal, secure bridge, service ownership, installer and version checks | Clean-machine install/restart/uninstall behavior; no global-runtime dependency; GUI enforces equivalent safeguards; saved secrets never returned to renderer |
| 4 — Builder | Templates, managed preview, iterative agent edits, tests and export using existing sessions | Disposable app built and revised locally; preview isolated from platform; build/install permission and isolation model verified |
| 5 — Public release hardening | Upgrade/rollback path, log retention, notices, measured performance, broader OS validation | Compatibility checks and installer matrix pass; documented limitations/support path; no unsupported routing claims |
| 6 — Free-first efficiency & context | Honest context visibility, compaction scheduling, safe Markdown/code rendering, benchmark fixtures | 110/110 regressions pass; benchmark fixtures sealed; context projected beside composer |
| 7 — Dark IDE workspace | Dark charcoal/moss IDE layout, 5-panel right inspector (Browser, Files, Commands, Changes, Tests), collapsible bottom commands dock, resizable panels & keyboard navigation, polished light mode | 111/111 regressions preserved; UI build clean; automated multi-panel, keyboard, reflow and accessibility checks pass with 0 axe violations |
| 8 — Multi-Agent Workflows & Model Orchestration | Free-first model-aware orchestration, intelligent planning DAG, specialized roles (Planner, Implementer, Researcher, Debugger, Tester, Reviewer), safe parallelism with file-lock conflict matrix, workflow modes (Quick, Guided, Team, Custom), interactive graph UI, free/paid policy controls with atomic budget ledger | Verification fixtures & regression tests pass; zero unapproved spend; safe parallel handoff & conflict detection verified |

Phase 5 current-host milestone: 0.5.0 installer is 31.24% smaller; 68 regressions, actual fresh install/builder/accessibility/uninstall and 0.3/0.4 upgrade/app-file-rollback matrices pass. No new inference or routes. The phase's public-release gate remains open for a clean VM, human accessibility/native-dialog review, license/signing/publishing decisions, broader failure coverage and cold-start/memory work. [Evidence](validation/phase5/README.md). Later development requires explicit owner authorization; it does not close the public-release gates.

## Completed implementation sequence

1. Create MEMORY with the verified baseline, then inventory dependency packaging and version-matched upstream app build requirements.
2. Implement a small compatibility registry and route-plan compiler around existing gateway configuration. Initially preserve supported standalone use and exclude unsupported automatic edges. Promote the tested Gemini → Cohere route only after current availability/pricing validation and policy tests; no broad discovery-based promotion.
3. Expose lifecycle/status through a narrow runtime contract and carry current progress limits to server/GUI sessions. Define typed errors and sanitized events before attaching views.
4. Build a functional, original project-home/onboarding/routing prototype around the upstream workspace, then review real screenshots and keyboard behavior. Do not start with a new editor or agent loop.

Each slice needs its relevant tests and evidence; use fixtures instead of rerunning live providers unnecessarily. A blocked phase can progress on independent work, but cannot claim its exit gate passed.

Phase 3 uses a verified OmniRoute security rebuild, isolated Electron shell and shared runtime lifecycle. Installed coding, credential recovery/removal, app/crash restart, install and complete uninstall passed on the current Windows host. On 2026-10-24 the user accepted Phase 3 and explicitly authorized Phase 4; independent clean-VM validation is re-scoped to the public-release gate. Current-host acceptance must not be labelled clean-machine validation.

Phase 4's first supported project type is static HTML/CSS/JavaScript using relative assets. Its scoped acceptance passed and Phase 5 is authorized. Arbitrary framework dev servers, installs, server-side applications and HMR remain deferred; explicit agent command permissions remain necessary and do not provide OS isolation.

## Deferred decisions and blockers

- **Release license/name:** retain LocalAgent as working name; choose our distribution license and check branding before public release. Upstream MIT notices remain required; dependencies/assets need their own review.
- **Packaging:** OpenCode 1.18.31 / OmniRoute 3.8.52 / Next 16.4.3 security build and bundled Node 24.22.1 are pinned and compatibility-tested. Installer signing, clean-VM validation and upgrade coverage remain release gates; see the desktop guide.
- **Routing:** Gemini → Groq completion is quota-blocked; Groq → Gemini is signature-blocked; other untested routes and unavailable Ollama remain excluded. Smaller OpenCode profiles may help Groq but require evidence.
- **Durability:** current Gemini signature expiry/restart limits session resumption. Prefer an upstream mechanism that still crosses the guard; no weakened validation or improvised persistent signature store.
- **Credentials and preview:** Windows UI onboarding now uses native DPAPI, including removal/restart tests. Other operating systems still need secure adapters. Document generated-process isolation before builder/release gates.
- **Costs:** inference remains free/local/BYOK under policy. Signing, distribution, CI capacity and support may cost money; ad-funded inference and hosted execution have no committed budget or scope.

No product need currently justifies a graph database, another orchestration framework, a React UI runtime or an always-on cloud service. Reevaluate only against a concrete bottleneck.

Phase 5.1 (authorized 2026-10-27): startup/memory profiling, recovery/registry durability, license/accessibility/independent-machine gates and owner release decisions only. 0.5.0 is an approved development milestone, not public-release acceptance. Current evidence: [phase51](validation/phase51/README.md). This was the Phase 5.1 scope restriction; the owner subsequently authorized Phase 6 development with release gates kept separate.

Phase 5.1 current-host stabilization: 0.5.1 passes 76 regressions, installed builder/security/twelve-view accessibility/uninstall and 0.3/0.4/0.5 upgrade/registry rollback/failure matrices. Startup and gateway memory improved with documented cache/load limits. [Final evidence](validation/phase51/README.md). Independent VM, human accessibility, native/Spline licensing and owner signing/publishing decisions remain gates; Phase 5 public-release acceptance has not passed.

Phase 5.2 is authorized release-blocker work: verified backend dependency closure, exact embedded/native provenance, longer memory/packaged soaks, startup measurements and expanded distribution checks. No new product features, inference routes or automatic updates. [Evidence](validation/phase52/README.md) separates verified results from remaining gates; owner approval is required for license/publication/signing choices and independent-environment changes or costs.


## Phase 6 — Free-First Intelligence, Context Management & Validation

Authorized 2026-10-29: prioritize coding reliability and resource efficiency, retain current visual identity. This supersedes earlier feature freezes for these checkpoints only; Phase 5 public-release blockers remain open. No publishing, automatic updates, new provider transitions or paid inference.

| Checkpoint | Work | Measurable acceptance |
|---|---|---|
| 6.0 Focused audit | Map existing workflows and pinned upstream mechanisms; evaluate Ponytail without installation | Evidence-linked capability/gap inventory, baseline limitations and benchmark protocol in docs/PHASE6-AUDIT.md |
| 6.1 Honest context visibility | Project safe upstream token metadata beside composer | Missing/partial/streaming metadata tests; no reasoning/signature exposure; keyboard/reflow browser fixture; label last-request usage and unknown occupancy |
| 6.2 Safe compaction | Reuse upstream manual summarize and automatic compaction; reconcile alias capacity and conservative guard threshold | Fixture and bounded coding evidence: requirements/objectives/errors survive, original history retained, permissions/tool IDs/signatures intact, no replay, failure stops within existing budgets; manual action disabled during active work |
| 6.3 Essential conversation usability | Safe Markdown/code rendering using reusable upstream components; improve tools, errors and long-history access | Untrusted markup/link tests, syntax/code readability, keyboard/reflow tests, older-history navigation without another conversation store |
| 6.4 Free-model efficiency and routing clarity | Small opt-in execution guidance and checkpointing; availability/quota explanations | Deterministic no-extra-call tests; unsupported routes excluded; compare matched runs before claiming gains |
| 6.5 Reproducible validation | Existing-project understanding, bug fix, feature, multi-file refactor, debugging/tests, long-context fixtures | Baseline OpenCode/current LocalAgent/optimized LocalAgent use isolated identical repos/models; record edit/test/diff evidence, tokens, tools, repeats, time, interruptions, compaction and cost; unrun cells stay unrun |

Checkpoint status (2026-10-30): 6.0 complete; 6.1 initial context visibility complete; 6.2 partial — upstream compaction is now scheduled ahead of the unchanged guard bound and preservation fixtures pass, but the pinned 1.18.31 engine answers **503** for manual compaction, so that half of the exit criteria awaits upstream support per owner decision; 6.3 accepted as a source checkpoint (96 regressions at the time); 6.4 has verified scale/recovery fixtures and a gated, unexecuted live compaction probe; 6.5 has an opt-in guidance/tool-output implementation, an aggregate behavior audit and five verified benchmark fixtures, with all three-arm live comparisons still unrun. [6.4 evidence](validation/phase64/README.md), [6.5 evidence](validation/phase65/README.md).

Implement one checkpoint at a time. Extensive live benchmark runs require owner approval of request/token/time caps; no deliberate real quota exhaustion. Zero-inference fixtures and benchmark preparation can proceed autonomously. A UI fixture is not real coding or failover evidence. No performance superiority claim without comparable measurements.

Phase 6.3 (2026-10-30): safe Markdown/code rendering, tool titles/exit status, older-message paging and all task tabs implemented. Manual compaction stays disabled until upstream supports it, with wording confined to technical details. [Evidence and limits](validation/phase63/README.md). No packaged release or live inference.

Phase 6.4 (2026-10-30): 102 regressions, eleven-page history fixture with scroll anchoring/500-message bound/task switching and an axe/AX/keyboard pass; packaged soak reproduced cleanly for 40 rounds, so the old closure remains a diagnosis gap rather than a patched defect; compaction interruption/restart fixtures and a summary-fidelity validator pass, and the live compaction probe is built but blocked on regenerating the engine config and on owner approval. [Evidence](validation/phase64/README.md). Nothing was packaged.

Phase 6.5 (2026-10-30): 110 regressions. Opt-in execution guidance and bounded tool output (600 lines/16 KiB) use only supported upstream mechanisms, with no extra request and no permission/routing change; aggregate-only behavior metrics and five fail-before/pass-after benchmark fixtures are verified with zero inference. No live arm ran, so no efficiency, token or completion claim is made. [Evidence](validation/phase65/README.md).


## Phase 7 — Dark IDE Workspace Redesign

Authorized 2026-10-30: Transform the LocalAgent workspace into an original, modern dark IDE layout based on the approved visual foundation (`docs/phase7/mockup.html`). Retain all existing free-first routing, security boundaries, and zero-inference regression guarantees.

| Checkpoint | Work | Measurable acceptance |
|---|---|---|
| 7.1 Design Tokens & Shell Layout | Adopt neutral charcoal palette (`#0e120f`, `#141a15`), restrained moss green accents (`#a8c47b`), 4-pane grid (Rail, Sidebar, Central Thread/Dock, Right Inspector, Status Bar) | WCAG 2.2 AA contrast verified; responsive reflow at 1180px and 390px; reduced-motion and forced-colors support |
| 7.2 Sidebar & Project/Task Navigation | Project switcher with folder selection modal; task history grouped by recency; honest token context gauge; free-only route indicator | Project switching, new task creation, task state preservation across sessions verified with zero data loss |
| 7.3 Central Thread, Composer & Commands Dock | Sanitized Markdown, syntax highlighting, inline tool cards with fold/unfold, inline diffs, inline permission prompts, composer with model chip and shortcut hints, collapsible bottom commands dock | Command outputs and exit codes visible in dock; permissions interactive; zero CSP/XSS bypasses; keyboard shortcuts operable |
| 7.4 Right Multi-Panel Inspector | 5-tab inspector: Browser (Builder preview iframe, build check, Playwright inspect, console, zip export), Files (project tree + read-only syntax code viewer), Commands (command log), Changes (session diffs), Tests (aggregated test outcomes) | Seamless tab switching; project boundary and secret exclusion enforced on file reads; diffs and test results update with live tasks |
| 7.5 Ergonomics, Resizing & Shortcuts | Keyboard navigation (`Ctrl+Alt+P` panel toggle, `Ctrl+Alt+C` commands dock toggle, `Escape` close, `Enter`/`Shift+Enter` composer); resizable/collapsible panel toggles; status bar indicators | Accessible keyboard focus trapping; no keyboard traps; clean ARIA landmark tree |
| 7.6 Regression & UI Verification | Automated Playwright verification (`scripts/verify-phase7-ui.mjs`); production UI bundle build; preservation of test baseline | 111/111 regressions pass; zero console errors; production bundle builds cleanly |

Checkpoint status (2026-10-30): Checkpoints 7.1 through 7.6 are complete and verified. 111/111 regressions pass with zero external inference. Production UI builds in 2.04s. Dark and light modes verified via automated Playwright test with 0 axe-core accessibility violations (`ide-workspace-desktop` and `ide-workspace-light`). Light mode polish resolved dark dock, preview canvas, mobile selector leakage, and syntax contrast. Multi-panel inspector (Browser, Files, Commands, Changes, Tests) and commands dock fully operational with keyboard shortcuts. Evidence: `validation/phase7-research/`. Packaging/release gates remain separated per Phase 5.2/5.3 requirements.


## Phase 8 — Intelligent Multi-Agent Workflows & Model Orchestration

Authorized 2026-10-30: Build a free-first, model-aware orchestration system that plans coding tasks, recommends optimal individual models, delegates work to specialized agents, executes independent tasks in parallel when beneficial, and verifies the final result. Supports both free ($0.00 default) and optional paid models with strict user spending limits.

Core promise: **Get the most useful coding work from the resources users choose to provide, with free models as the default and paid models entirely optional.**

| Checkpoint | Work | Measurable acceptance |
|---|---|---|
| 8.1 Model Discovery & Capability Catalog | Discover individual models across Gemini, Groq, OpenRouter, and Ollama. Capture pricing, context windows, max tokens, tool calling, and observable rate limits. Model recommendation matrix by role (coding, reasoning, speed, context). Support manual overrides and multiple models per provider. | Discovery tests verify all supported provider models and price tiers; zero-price models verified; manual assignment & fallback chains pass unit tests. |
| 8.2 Free-First Spending Policy & Budget Ledger | Implement Free Only, Free Preferred, and Paid Allowed policy tiers. Configurable per-task, per-workflow, and monthly spending caps. Atomic budget reservation for concurrent agents. Actual cost reconciliation from provider usage headers. Gated approval prompts before incurring charges or crossing budgets. | Unit tests prove zero silent escalation from free to paid; atomic reservation blocks overruns across concurrent tasks; budget alerts trigger before charges occur. |
| 8.3 Hierarchical Planner & Template Engine | Analyze user requests; construct hierarchical workflow trees with nested steps, conditional branches, dependencies, milestones, and acceptance criteria; support reusable workflow templates (`.localagent/workflows/templates/*.json`); pre-execution model inspection & editing. | Plan generation produces valid hierarchical trees; dependencies and milestones parsed reliably; plan approval and pre-execution model override round-trip with zero inference. |
| 8.4 Specialized Roles, Bounded Loops & Safe Parallelism | Planner, Implementer, Researcher, Debugger, Tester, Reviewer roles; iterative Implement → Test → Review → Fix cycles with bounded `repeat` loops (`maxIterations: 3`), timeout and budget termination predicates; file-lock conflict matrix for safe parallelism; explicit integration/verification stage. | Concurrent execution of non-conflicting tasks verified; overlapping write tasks safely serialized; repeat loops terminate on success or max bounds; integration stage verifies full output. |
| 8.5 Durable State Engine, Checkpoints & Recovery | Workflow lifecycle management (Quick, Guided, Team, Custom); state persistence in `.localagent/workflows/<id>.json`; project file snapshots before loops and major steps; interactive Pause, Resume, Cancel, and Retry; Checkpoint Restore (revert to pre-loop snapshot) on failure or budget pause. | Durable state recovers after app restart; checkpoint restore cleanly reverts uncommitted edits; pause/resume/retry transitions verified without side-effect replay. |
| 8.6 Expandable Live Workflow Tree UI | Expandable live workflow execution tree in chat message cards and right-panel inspector; displays nested steps, status badges (`✓`, `⟳`, `⊗`, `⏳`, `⏸`), exact provider/model assignment chip, duration, live outputs, errors, and dependencies; pre-execution model switcher and mid-flight model reassignment; pause/cancel/retry action buttons; checkpoint restore and continue banners; 0 axe violations. | Expandable tree renders interactively in chat and inspector; live updates stream smoothly; pause/cancel/retry buttons operable; 0 axe-core accessibility violations in dark and light modes. |
| 8.7 Benchmarks, Multi-Agent Fixtures & Regression | Comparative benchmark fixtures (single agent vs sequential vs parallel multi-agent with repeat loop); zero unapproved spend verification; 100% regression suite preservation (all existing 111 unit tests pass). Automated Playwright verification of live tree interactions, pausing, retries, and checkpoint restore. | 111/111 regression tests pass; multi-agent execution and repeat loop fixtures pass; Playwright verification succeeds cleanly. |

## Historical Phase 8 evidence and limits

The original 141/147-test and browser runs covered units, custom runners and seeded UI state. They did not close production integration. Saved live-double runs include successful guard requests, a generated fix and deterministic test/review output, but used a custom runner that wrote files itself, rather than the UI → API → OpenCode tool path. Two successful and two failed runs remain preserved locally. Model scores and Gemini/Groq paid pricing include heuristics; they are not measured capability or billing verification. No new live run was performed during recovery.
