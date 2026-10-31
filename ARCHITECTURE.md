# LocalAgent architecture

2026-11-01 implementation correction: the Phase 8 architecture below includes intended behavior not yet integrated. Specialized roles are not yet installed into generated OpenCode config; exact catalog assignments, supervised workflow lifecycle, durable recovery and per-workflow boundary attribution remain recovery gates. Custom-runner/live-double artifacts do not verify that production path. False-success recovery now fails on missing executors/timeouts/provider/observation errors, treats prose as unverified, and checks every step before workflow completion. **150/150** regressions and UI build pass; API/checkpoint security is the next checkpoint. No release artifact was rebuilt.

Status: architecture and implementation boundaries, 2026-10-24. Windows desktop host acceptance passed; clean-VM and public-release gates remain open.

Phase 5 keeps one runtime/agent/dispatch path. Windows distribution pruning removes only postinstall duplicate engines and non-x64 ONNX binaries, retaining selected runtime assets and notices. Installer activation is a sibling-directory transaction: validate candidate, retain prior payload, swap, expose explicit rollback; user data stays outside the transaction. Hash-pinned NSIS overlays preserve upstream registration/shortcuts. No user-data migration or automatic update execution is introduced. Signing is explicit and fail-closed; future signed release metadata has no network/execution authority yet. Routing/gateway diagnostics rotate locally; upstream database retention is separate.

## Boundaries and ownership

```text
LocalAgent CLI / Solid web workspace / Electron desktop
                         |
                OpenCode server + SDK
       agent, sessions, tools, permissions, history, compaction
                         |
                     OmniRoute
           dispatch, streaming, connections, cooldowns
                         |
                  LocalAgent guard
      auth, pricing, context, signatures, fixed provider egress
                         |
            Gemini / Groq / OpenRouter / Ollama

LocalAgent runtime manager supervises services, owns credentials,
compiles eligible route plans and exposes product status/events.
```

OpenCode is the source of truth for sessions and tool execution. Do not build a second agent loop or conversation database. LocalAgent owns product configuration, credential references, route evidence and sanitized diagnostics. OmniRoute remains an internal service, not the public product API. All inference, including auxiliary requests, crosses the guard.

Reuse OpenCode's version-matched app, desktop shell, UI primitives and SDK. Keep the Solid stack and Electron packaging initially; a replacement shell or React runtime requires a demonstrated benefit. Develop original project/onboarding/routing/builder workflows around these components, not just a theme overlay.

## Decisions

1. **Pin before extending.** Current pins: OpenCode 1.18.31, OmniRoute 3.8.52 with security-rebuilt Next 16.4.3, bundled Node 24.22.1 and Electron 42.11.18. The matching upstream app was built unchanged before product composition. Record source commits, checksums and dependency locks; verify upstream changes separately from product behavior.
2. **Small upstream patch surface.** Keep LocalAgent modules separate; use public server/SDK and management adapters. A pinned source checkout with explicit patches is acceptable for app composition/branding. Maintain patch rationale and license notices; do not copy individual workspace packages without their dependency graph.
3. **Compile directional plans.** Standalone eligibility and continuation eligibility are distinct. A route record identifies source/destination model, runtime versions, task/tool profile, evidence date and limitations. Fresh pricing/availability/context checks still apply to a verified route. Unknown, incompatible or untested edges are excluded, not guessed. Phase 1 compiles these directed plans and checks hashed tool-call provenance at the guard; unknown or expired history fails closed.
4. **Conservative switching.** Keep session affinity when useful; switch only at safe request boundaries. Preserve tool-call IDs/results and provider-required metadata. Do not replay completed side effects or silently recover a partially interrupted tool stream. No compatible fallback means an actionable stop; reconnecting must not imply a new tool execution.
5. **Bound all clients.** Move equivalent request/compaction/deadline supervision from the CLI-only path to shared runtime control before serving the GUI. Retain the current conservative byte-based context budget, output reservation and safety margin until a verified replacement exists.
6. **Local security boundary.** Services bind loopback with authentication and restricted origins. The renderer gets no provider secrets, guard bearer tokens, OmniRoute admin credentials, or unrestricted Electron bridge. The runtime uses OS keychain references; existing ignored .env loading remains development-only until migration. Separate public config from secrets.
7. **Phase 2 composition.** An original Solid/Vite workspace uses the exact OpenCode SDK through a narrow Node backend. The unchanged upstream app is a verified compatibility reference, not a second embedded application. OpenCode still owns sessions/tools; no editor or agent loop was rewritten. Current-user Windows DPAPI protects UI-saved credentials; submitted keys are cleared from the form and never returned by APIs. Disconnect tombstones override inherited development keys. Non-Windows secure onboarding fails closed until an OS adapter exists.
8. **Desktop ownership.** A thin Electron shell directly reuses the pinned upstream destruction-safe window helper and adopts its isolation/lifecycle/NSIS patterns. Importing the entire WSL/updater/V2-server shell would add unrelated coupling. Sandboxed preload exposes only native folder selection, lifecycle status and explicit failed-runtime restart. A bundled Node worker runs the same web application lifecycle; OpenCode/OmniRoute remain child services. Stable per-profile loopback ports preserve local UI state; worker IPC disconnect and main-process supervision stop owned children. No automatic coding replay or development-key import.
9. **Security build contract.** The published OmniRoute Next 16.3 bundle cannot load patched Next 16.4. Rebuild its exact official source with the upstream backend-only profile, restore temporary source stubs, then adopt its artifact/native colocation into the locked npm graph. No static upstream source patches. Package native dependencies for bundled Node's ABI, never Electron's ABI. The shell ASAR excludes the production dependency graph; resources carry it separately.
10. **Installer extension.** Keep upstream NSIS registry/shortcuts and uninstaller generation. Its legacy ZIP extractor failed ZIP64 and deep dependency paths; a generated, hash-checked template overlay changes decompression to Windows' built-in tar. Its normal removal also leaves long paths: a documented hook runs bundled Node to delete only the validated sibling runtime payload before shallow cleanup. Validate real path, product marker and Node version; never touch user data/projects. Use the validated sibling-directory transaction; the upstream automatic updater remains disabled. Do not patch installed builder files. Distribution filters remove declarations, maps, non-license docs and dependency test fixtures while preserving runtime code/data and licenses. No cloud installer or runtime downloader is introduced.

## API, state and failure handling

Use the matching OpenCode SDK for project/session operations and event streams. A narrow, versioned LocalAgent API (`/api/v1`) owns runtime health, provider setup, routing status and settings; do not proxy arbitrary management paths. Validate input at boundaries; use stable error codes, safe messages and correlation IDs. Represent startup, unavailable, quota wait, context rejection, signature loss and cancellation distinctly. Retry only recoverable failures within explicit bounds; preserve Retry-After and report absent quota as unknown.

Solid feature stores hold transient view state. OpenCode events reconcile session state; the runtime owns provider/routing state. Refresh snapshots after reconnect, avoid duplicate listeners and stale cross-project state. Persist only necessary user preferences and product metadata locally; no duplicate message persistence. Logs contain metadata/hashes, never keys, raw prompts, source, signatures or hidden reasoning; redact support exports and bound retention.

The builder initially serves static HTML/CSS/JavaScript with relative assets, without executing project scripts. A separate localhost listener uses a random per-start capability and an opaque sandbox (`allow-scripts` only), restrictive CSP, bounded asset allowlist and symlink/hardlink rejection. UI APIs stay on authenticated 127.0.0.1. Console messages are bounded untrusted data, never automatic agent instructions. File revisions drive refresh; Node syntax validation reads code through stdin without executing it. Playwright uses a credential-free, offscreen Electron probe with request/permission restrictions, owner-death cleanup and a 30-second lifetime. No browser download is needed in desktop. Export buffers a bounded filtered source ZIP. The existing session/permission loop handles edits and test commands. Framework servers, dependency installation and arbitrary generated builds need a future explicit execution/isolation model; agent permissions are not an OS sandbox.

## Structure: evolve as features land

Current `src/*.mjs` remains the working foundation; do not move everything before a feature needs it. Target ownership:

```text
apps/cli, apps/workspace, apps/desktop   product entry points and composition
packages/runtime                      lifecycle, configuration, credentials
packages/routing                      eligibility, compatibility, plan compilation
packages/guard                        existing cost/context/signature boundary
packages/contracts                    shared API/event validation and types
packages/ui                           LocalAgent Solid components/tokens, when shared
integrations/opencode, integrations/omniroute  version-specific adapters/patch metadata
test/                                 policy, contract, integration tests; UI e2e as needed
scripts/                              build/release and explicitly separate verification
docs/, validation/                    decisions/research and sanitized evidence
```

Keep business logic out of components and upstream patches. Extract shared modules only for real consumers. Preserve historical `demo/`, `evidence/` and validation artifacts as research; exclude them from release packages and normal runtime startup. Inventory before removing duplicates or dead code.

## Implemented baseline and blockers

`src/` contains the existing policy/runtime foundation; `src/workspace/` contains isolated credentials, project metadata, OpenCode supervision and the browser API. `apps/workspace/` contains Solid views, a focus-managed dialog and CSS tokens. `integrations/opencode/source.json` pins the unchanged app reference. No upstream source patches exist.

The workspace owns ports 20140 (browser), 20144 (authenticated engine), 20151 (gateway), 20152 (guard) and `.localagent/workspace-runtime/`; the CLI keeps its original ports/state. Browser APIs require an HttpOnly SameSite cookie, exact loopback Host and same-origin mutation header. Only explicit session/provider/project methods are exposed. Messages omit reasoning/signatures; changes reuse upstream summaries/tool patches, with written-content snapshots explicitly labelled when no baseline exists. Tasks retain the shared progress budget and 120-second deadline. Permission approvals are once-only; secret reads and external directories are denied. These are agent permissions, not an OS sandbox.

Desktop services use a separate per-user profile and dynamically allocated persisted loopback ports; the web workspace retains its fixed ports above. Bundled runtime checks, process recovery and packaging evidence are in the [desktop guide](docs/DESKTOP.md) and [Phase 3 evidence](validation/phase3/README.md). Phase 4's isolated static builder lives in the existing workspace modules; [boundaries](docs/BUILDER.md) exclude arbitrary framework servers. Independent clean-VM testing, signing, upgrade coverage and cross-platform credential adapters remain release work. The 2026-10-27 production and full npm audits report zero vulnerabilities; embedded/native components are outside complete npm advisory coverage. This is not a full security audit. Gemini provenance is memory-only; saved results can be reviewed after restart, but continuation may fail safely. Groq and other unsupported continuation routes remain excluded. See [cross-provider validation](docs/CROSS-PROVIDER-VALIDATION.md) and [signature details](docs/GEMINI-SIGNATURES.md).

Sources: [OpenCode app](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/app/package.json), [desktop](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/desktop/package.json), [SDK](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/sdk/js/package.json), [server API](https://docs.opencode.ai/docs/server/), [OmniRoute](https://github.com/cheaper-inference/OmniRoute). Resource/license decisions: [evaluation](docs/RESOURCE-EVALUATION.md).


Phase 5.1 keeps the same process architecture. The gateway adoption/staging adapter changes only generated standalone Next configuration: `experimental.preloadEntriesOnStart: false`, following [Next guidance](https://nextjs.org/docs/app/guides/memory-usage). It requires OmniRoute 3.8.52 and the expected standalone template, records before/after hashes, and fails on incompatible upgrades. Review/remove this adapter when upstream supplies equivalent lazy startup. No route, provider, signature, authentication or egress code is changed. First-use loopback tool/history/cooldown checks must accompany upgrades.

Installer format-2 journals capture only the two fixed per-user product registry keys before activation. Recovery validates installation ownership and restores files plus typed registration values; a pending registry restore can retry without moving payloads twice. Failure callbacks apply to the current activation attempt, and retry preserves retained candidates. No machine-wide key or user-data rollback is introduced; legacy journals cannot reconstruct missing registry snapshots.

Phase 5.2 reduces distribution dependencies at the packaging boundary. Reproduce seeds from hash-verified upstream Next traces/configuration and standalone native/worker extras, close installed dependencies/optional peers, then verify the isolated candidate with module-resolution containment. Staging requires matching versions, lock graph, compatibility proof and payload digest. Generated backend code remains unchanged; the existing CLI-token helper is retained because LocalAgent authentication imports it. React framework peers remain for Next; dashboard libraries are excluded only after closure checks. The tested surface is LocalAgent management and routing, not all optional OmniRoute features. No engine memory flag or alternate engine is enabled without measured benefit and parity evidence.


Phase 6 starts with a read-only context projection from OpenCode session records (`src/workspace/context-summary.mjs`), not a parallel tracker or summarizer. Renderer receives whitelisted numeric last-completed-request usage only. Actual routed model capacity/current occupancy is not inferred from an alias or global event log; missing values stay unknown. Reconcile upstream compaction thresholds with the unchanged guard before exposing manual compaction or changing scheduling. No provider path, upstream source or dependency changes are part of this first checkpoint.

Phase 6.2 keeps the guard bound unchanged and instead schedules upstream's supported `compaction.buffer`/`keep.tokens` from `inputCeiling`, the single definition of the guard's usable input budget, so automatic compaction runs before the guard rejects the same request. Manual compaction is deliberately not exposed: the pinned 1.18.31 engine answers 503 for `/api/session/:sessionID/compact` and the v1 summarize route is deprecated. LocalAgent still stores no history or summary; a compaction marker plus its auto flag are projected as metadata, and conversation context is read only through the pinned message/context APIs.


## Phase 8 — Multi-Agent Workflows & Free-First Model Orchestration Architecture

Phase 8 introduces dependency-aware multi-agent orchestration and evolves the routing policy from free-only to a free-first, user-controlled architecture supporting both free and optional paid models.

### 1. Multi-Agent Engine & OpenCode Integration
OpenCode remains the authoritative execution engine. We do not invent a separate agent runner. Instead, LocalAgent composes OpenCode sessions and prompts:
- **Role-based Agents**: Defined in generated `opencode.json` under `agent.<role>` with role-specific system prompts, tool permissions (`read`, `write`, `bash`, `glob`, `grep`), and model bindings.
  - **Planner**: Read-only tools (`read`, `glob`, `grep`), model chosen for reasoning/context.
  - **Researcher**: Exploration tools (`read`, `glob`, `grep`), model chosen for speed/context.
  - **Implementer**: Code editing tools (`write`, `read`, `glob`, `grep`), model chosen for coding.
  - **Debugger**: Diagnostic tools (`bash`, `read`, `write`), model chosen for problem solving.
  - **Tester**: Test verification tools (`bash`, `read`), executes test suites.
  - **Reviewer**: Read-only tools (`read`, `glob`), verifies diff against acceptance criteria.
  - **Custom**: User-defined roles, instructions, tools, and model bindings.
- **Session Coordination**: The Orchestration Engine creates an isolated OpenCode session for each workflow node. Handoffs occur by passing structured task briefs and artifact diffs from upstream dependencies.
- **Safe Parallelism & Conflict Detection**: A File-Lock Conflict Matrix tracks planned file edits per node. Nodes with disjoint file targets or read-only tools run in parallel across concurrent OpenCode sessions. Overlapping write nodes are serialized or staged through safe patch merge verification.
- **Durable Workflow State**: Workflow definitions, dependency DAGs, node states (`planned`, `running`, `blocked`, `completed`, `failed`), and task handoffs persist in `.localagent/workflows/<id>.json`. Interrupted workflows resume cleanly without replaying side-effects.

### 2. Free-First, User-Controlled Spending & Guard Architecture
LocalAgent defaults to free models and zero-price inference. Paid inference is strictly opt-in:
- **Policy Modes**:
  - `Free Only` (Default): Only verified $0.00 models admitted. Zero-price headers enforced.
  - `Free Preferred`: Automatically prioritizes free models; falls back to paid models only if enabled and within configured budget limits.
  - `Paid Allowed`: Permits direct assignment of authorized paid models, gated by budgets.
- **Atomic Budget Reservation Ledger**:
  - Tracks `perTaskBudgetUsd`, `perWorkflowBudgetUsd`, and `monthlySpendingLimitUsd`.
  - Concurrent agents must atomically reserve an estimated ceiling before dispatch. When a task completes, actual cost from provider usage data is reconciled, and excess reservation is returned.
  - If reservation exceeds remaining workflow or monthly budget, execution halts with a user approval prompt. Never silently incur charges or escalate costs.
- **Individual Model Discovery & Capability Matrix**:
  - Discovers specific models per provider (Gemini, Groq, OpenRouter, Ollama) rather than a single provider default.
  - Discovers and caches context window, max completion tokens, tool-calling support, pricing per token (input/output/request), and observable rate limits.
  - Multiple distinct models from the same provider can be mapped to different agent roles simultaneously.
- **Safeguards Preserved**:
  - Loopback authentication, DPAPI credential security, Gemini thought signature preservation, and prompt injection/path escape boundaries remain fully enforced.

### 3. Hierarchical Workflows, Bounded Repeat Loops & Execution Tree Engine
Phase 8 adopts an expandable, visible workflow execution tree pattern:
- **Hierarchical Node Structure**: Workflows are composed of nested steps: `Workflow -> Stage -> Step -> Loop -> Action`. Steps can declare explicit dependencies (`dependsOn: string[]`), input artifacts, target files, and expected outputs.
- **Bounded Repeat Loops (`Implement -> Test -> Review -> Fix`)**:
  - Supports iterative verification cycles via `repeat` blocks with explicit `maxIterations` (default 3) and termination conditions.
  - Bounded to prevent runaway execution: exits when tests pass and review criteria are met, or when `maxIterations` / spending limits are reached.
  - Preserves loop iteration history (`loop 1`, `loop 2`) so users can compare diffs and test results across attempts.
- **Checkpoints, Pausing & Safe Recovery**:
  - The engine captures a clean project file checkpoint before major stages and loop boundaries.
  - Interactive lifecycle controls: Pause (`||`), Resume (`▶`), Cancel (`⏹`), and Retry (`↺`).
  - On failure (e.g. quota limit, network error, or test failure), LocalAgent provides explicit options: **Restore Checkpoint** (rolls back uncommitted partial changes) and **Retry Step** (optionally with an alternate model).
- **Expandable Live Tree State Protocol**:
  - The runtime streams hierarchical workflow events over the existing session event pipe: node ID, parent ID, title, role, exact provider/model, status (`pending`, `running`, `completed`, `failed`, `paused`, `skipped`), start time, elapsed duration, output diffs, and errors.
- **Declarative, Reusable Workflow Templates**:
  - Workflows are defined in modular JSON/YAML schemas stored in `.localagent/workflows/templates/`.
  - Standard templates include `feature-implement-verify`, `bug-diagnose-fix`, `refactor-clean`, and `quick-single`.
  - Users can inspect, edit, parameterize, save, and reuse custom workflow presets without hardcoded constraints.
