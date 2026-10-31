# Phase 6 focused audit

2026-10-29. Source audit and historical evidence are distinct from new live validation. Public-release gates remain in MEMORY.md and docs/RELEASE.md.

## Existing capabilities and gaps

| Workflow | Existing implementation / evidence | Current gap and next check |
|---|---|---|
| Understand, generate, edit, test | OpenCode tools via `src/workspace/engine.mjs`; Phase 2/4 historical edit/test/diff evidence | No current matched multi-file/refactor/debug benchmark; do not claim broad reliability |
| Permissions / changes | Once-only approvals, explicit deny, upstream diffs/tool patches in `tasks.mjs` | Tool outputs are bounded projections; shell permissions are not an OS sandbox |
| Interrupt / cancel | SDK abort, 120-second deadline, 30-request/two-compaction supervision | Long tasks stop at the deadline; no new resumable-task semantics; long UI soaks remain failed |
| History / restart | OpenCode owns persisted history; LocalAgent stores session references | UI fetches last 100 messages, truncates text/output, shows only six task tabs; old Gemini tool history may fail closed after provenance expiry/restart |
| Provider recovery | Existing guard, cooldowns, evidence-backed directed route, sanitized routing events | Unsupported edges stay excluded; quota unknown without observed headers; freshness and signature constraints still apply |
| Context | Conservative UTF-8 byte estimate at guard, output reservation and margin; upstream compaction | Byte bound is not actual token usage. UI omitted usage. No session-specific guard-request correlation; routing alias cannot identify actual provider/model |
| Chat usability | Plain escaped Solid text, collapsible tools, command results and diffs | Markdown/code fences shown raw; no highlighting or older-history navigation; evaluate upstream rendering dependency boundary before adoption |

## Pinned upstream investigation

Reference checkout: `.localagent/upstream/source-014614d35b397775e5d397a490fc72368c894ec2` (OpenCode 1.18.31). `packages/app/src/components/session/session-context-metrics.ts` reads the last assistant token record and sums input/output/reasoning/cache for its upstream display. LocalAgent instead labels input/cache as **last completed request**, avoiding a claim of current occupancy or a sum of lifetime tokens. Source comparison does not prove provider-reported raw accounting survives every OmniRoute transformation.

`packages/core/src/session/compaction.ts` has automatic threshold estimation, a 20,000-token default buffer, 8,000-token recent retention and a structured anchored summary preserving objectives, constraints, work state and files. It publishes compaction events and retains full source history separately from the summarized request. The SDK exposes `/session/{sessionID}/summarize`; existence alone does not prove behavior through our deployed compatibility adapter. Verify actual runtime/API mapping before enabling it.

LocalAgent's generated OpenCode configuration (`src/omniroute.mjs`) already assigns the coding alias a conservative shared route capacity. The guard can reject based on its larger byte estimate before upstream compaction triggers; its distinct 422 deliberately prevents unchanged overflow retries. **Do not change that error to retryable or relax the bound.** Next checkpoint must reconcile thresholds using exact serialized fixtures and the pinned upstream mechanism. Do not build another summarizer. Preserve signatures, tool/result pairs and permission/replay boundaries. Never promise a summary cannot omit facts: check required invariants with fixtures and bounded workflows.

## Highest-value order

1. Honest context metadata and missing-data states; zero inference.
2. Guard/alias/upstream compaction compatibility, manual action, status notification and history retention tests. Fixtures first; a small live task only after safety gates pass.
3. Safe Markdown/code rendering, readable failure/permission states and older-history navigation. Keep visual identity and Solid; no redesign.
4. Concise task guidance: inspect existing code, retrieve relevant sections, avoid unchanged repeated reads, checkpoint objectives/errors, bound outputs. Measure before claiming fewer tokens or calls.
5. Matched coding benchmarks and routing UX improvements based on measured failures. No new continuation routes.

## Ponytail evaluation

Reviewed the [repository](https://github.com/DietrichGebert/ponytail) and [skill text](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md). The published MIT-labelled prompt advocates existing-code reuse, platform primitives and minimal necessary implementation without dropping validation/security/accessibility. These principles fit RULES.md already. No installation, runtime hooks, telemetry or prompt copying is necessary. Its Claude/Opus-specific benchmark claims are not evidence for Gemini/LocalAgent. Any future copied material needs exact-version license/attribution review. External instructions do not override our policy. No other repository search or new tools undertaken.

## Benchmark protocol (fixtures ready, live arms not executed)

Five of these are implemented under `benchmarks/fixtures/` with hidden acceptance checks, a reference solution and sealed hashes; `node scripts/verify-benchmarks.mjs` proves each fails before and passes after the fix without inference. The architecture-explanation task still needs a symbol-rubric fixture.

Use six small versioned disposable repositories/tasks: architecture explanation with checkable symbols; boundary bug with hidden edge tests; feature with acceptance tests; multi-file API refactor; failing-test diagnosis; long conversation retaining requirements and resolved-tool results. Keep immutable initial files and task text, independent correctness checks and final diffs. A final assistant answer alone never passes an edit task.

Three arms: pinned baseline OpenCode without LocalAgent prompt optimizations; current LocalAgent; optimized LocalAgent. All cloud calls, including baseline auxiliaries, must still pass the same free-only guard. Match model, routing constraints, tool permissions, output/request/time caps and project state. Use isolated profiles; record timestamps/catalog validity and alternate run order to expose free-tier variability. One run is exploratory, not statistically persuasive. No automatic provider switching in a same-model comparison. Evaluate controlled cross-provider recovery separately.

Record completion/tests, edits, agent-run test commands, final diff, upstream token fields (unknown stays unknown), tool counts, exact-repeat reads/commands with justified repeats distinguished, wall time, interruptions/recovery, summary events and preserved invariants. Cost evidence must distinguish verified zero-price policy from a provider billing statement; no invented totals. Never retain hidden reasoning/signatures/credentials in reports. Keep raw project/assistant data local and out of public diagnostics.

Preparing fixtures, validators and browser UI tests costs no inference. Extensive live runs require an explicit owner-approved matrix and total request/token/time budget. No large benchmark run or provider quota test has been started.

## Checkpoint evidence

### 6.2 Compaction mapping and threshold reconciliation (2026-10-30)

**Manual compaction is not available in the pinned runtime.** A zero-inference probe of the installed engine 1.18.31 (`scripts/verify-engine-compaction.mjs`, [result](../validation/phase6/engine-routes.json)) creates a session and calls the documented compaction route: `POST /api/session/:id/compact` answers **503 "Session compact is not available yet"**. The pinned source explains why: `V2Session.compact` in `packages/core/src/session.ts` validates the session and then raises `OperationUnavailableError({operation:"compact"})`, which the server handler maps to `ServiceUnavailableError`. The SDK method `client.session.summarize` points at `/session/:sessionID/summarize`, the deprecated v1 route upstream's `packages/app/V1_API_MIGRATION.md` marks as replaced by the compact API. Exposing a "Compact now" control would therefore report a false capability; none was added, and no second summarizer was written. Revisit when an upstream build implements the operation.

The probe also fixes the message/context mapping: `GET /api/session/:id/message` pages the full durable message table, `GET /api/session/:id/context` returns only messages after the last compaction, and the legacy `GET /session/:id/message` the workspace uses serves the same session. History retention is upstream's, not a LocalAgent store.

**Threshold reconciliation.** The guard still rejects at `contextWindow - output - max(512, 5%)` measured in UTF-8 bytes, while upstream compacts when its `chars/4` estimate exceeds `contextWindow - max(output, buffer)` with a 20,000-token default buffer. Because the estimates differ by roughly 4x, a 32K route hit the guard at about 29 KB while upstream would only compact near 51 KB: automatic compaction could never fire, and the user got an unchanged `422 context_budget_error`. `src/context.mjs` now exports `inputCeiling` (the guard's own bound, reused by `requestBudget` so the two cannot diverge) and `compactionSettings`, which converts 85% of that ceiling into the supported `compaction.buffer` and a bounded `keep.tokens`. `src/omniroute.mjs` writes those settings into the generated engine config. The guard bound, error type, retryability and progress budgets are unchanged; upstream compaction is merely scheduled early enough to run.

Preservation is covered by fixtures rather than live work: `test/compaction.test.mjs` projects a compaction marker, earlier tool calls, patches and permissions from a fake engine and proves the prompt is not replayed across repeated snapshots, while `test/context.test.mjs` proves the ordering property for 32K–1M windows and that the guard ceiling itself did not move. The conversation now shows a metadata-only "Earlier history summarized" divider and states that manual compaction is unavailable.

**Still open:** a live compaction event, and therefore real summary fidelity (objective, constraints, failing command, file list) after compaction, is unverified. Large single tool outputs can still exceed the summary prompt budget, in which case upstream declines and the guard rejects as before. 6.2 is not complete.

### 6.1 Context visibility

6.1 adds `context-summary.mjs`, safe snapshot metadata and a keyboard-operable details indicator beside the composer. It exposes no hidden reasoning, signatures, prompts or provider metadata. Missing cache values stay unknown. Capacity/percentage/category breakdown remain unavailable until correctly correlated; no compaction changes or inference calls. New source changes are not yet packaged into the installed 0.5.2 application.


Verification (2026-10-29): **86/86 regression tests pass**, including two new metadata/privacy cases. Vite production UI build passes. `node scripts/verify-context-ui.mjs` passes a loopback-only fixture: reported tokens, keyboard expansion, missing usage, 390px reflow and zero browser errors. Screenshots: `validation/phase6/context-desktop.png` and `context-mobile.png`; report: `validation/phase6/context-ui.json`. Regression log: `validation/phase6/regression.log`. Initial sandbox-denied localhost failures were environmental; the full rerun with local networking permitted passed. No live coding, compaction preservation, model switching or comparative benchmark was executed. 6.0 audit is complete; 6.1 visibility is an initial slice, not the requested complete context-management experience.

### 6.5 Free-first optimization and benchmark preparation (2026-10-30)

**Audit (pinned 1.18.31):** the only supported efficiency levers are ambient `AGENTS.md` in the global config directory, `tool_output.max_lines/max_bytes` (defaults 2000/50 KiB, full text saved with a marker) and per-agent `steps`. The `instructions` config array has no consumer in this build and is unused. Existing deadline and progress budgets remain the outer bounds.

**Implemented opt-in:** `executionGuidance: true` writes a ≤1.8 KB guidance file to the engine profile's global `AGENTS.md` and adds `tool_output` 600/16 KiB to the generated config; disabling removes only LocalAgent's marked file. No prompt is appended, no permission or route changes and no extra model request. `src/workspace/behavior-audit.mjs` reports aggregate tool usage, duplicate reads/commands and output bytes without retaining content.

**Benchmark spine:** five disposable fixtures (boundary bug, feature, multi-file refactor, failing-test diagnosis with a partly passing baseline, 56 KB long-context rule) with hidden acceptance checks; `scripts/verify-benchmarks.mjs` requires a failing run before the reference solution and a passing run after, and seals fixture hashes in `benchmarks/manifest.json`. 5/5 pass, 110/110 regressions, zero inference.

**Not done:** no baseline/current/optimized arm was executed, so guidance has no measured effect on calls, tokens, completion or time; that requires an approved, budgeted matrix. [Evidence](../validation/phase65/README.md).

### 6.4 Scale, soak diagnosis and compaction boundaries (2026-10-30)

**Verified, zero inference:** 102/102 regressions; eleven paged history loads with boundary dedupe, scroll anchoring within 0.86 px, the 500-message view bound refusing an extra request, task-switch isolation/reset, axe 0 violations and a named AX tree with keyboard paging. The fixture found two real defects, both fixed at source: scroll metrics were read after the request (so a mid-request reflow was taken as the reading position), and the busy paging control was `disabled`, dropping focus. A skipped heading level and unnamed fenced-block roles were also corrected.

**Packaged soak:** 40 instrumented rounds pass (226-465 ms refresh, monotonic revisions, 141 DOM nodes, ~5 MB heap); both failed profiles recorded a healthy runtime that stopped only after the driver gave up. The refresh path is not deterministically broken. The 20 s wait can still stall at either an unpublished preview revision or a poll that does not run while the window is occluded (`document.hidden` stays false here, so hidden-state throttling is untestable with this driver). This is a diagnosis gap, not a fix, and no retries were added; failure reports now retain the iframe revision beside the server preview state.

**Compaction:** `test/compaction-recovery.test.mjs` proves interruption at a boundary keeps prior patches, restart restores marker/history without prompt replay, and unproductive repeat compaction stops as `progress_budget_exhausted`. `summary-fidelity.mjs` and its tests enforce objective/constraint/error/pending/files survival. `scripts/verify-live-compaction.mjs` is the bounded end-to-end probe (6 requests / 6 minutes, explicit approval flag) and is currently blocked by a stale `.localagent/opencode.json` from the installed build. Live compaction, real summary fidelity and packaged restart remain unverified. [Evidence](../validation/phase64/README.md).

### 6.3 Initial usability implementation (2026-10-30)

Markdown/readability and bounded history navigation now have source implementation and fixture evidence; see [Phase 6.3](../validation/phase63/README.md). Earlier gap inventory describes the pre-change baseline. Manual compaction will stay unavailable until upstream implements it, per owner decision; its wording is technical-only. No actual compaction or comparative benchmark claim.
