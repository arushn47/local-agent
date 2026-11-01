# Phase 8 Integration Recovery & Hardening

## Follow-up blocker hardening — local tests only

**Not all three blockers are fixed.** Production remains gated; no live inference was rerun.

Budget: lifetime conservative reservations and admitted request counts survive settlement, release/cancellation and restart. Added sequential/concurrent-instance regressions prove settling or releasing requests cannot replenish either approved ceiling. Old ambiguous reservation history fails closed.

Terminal state: workflow saves now serialize cross-process mutations through a file lock and atomic persistence. Completed/failed/cancelled states reject stale nonterminal or cancellation writes; cleanup cancellation is idempotent and does not rewrite terminal outcomes. Explicit reviewed restore/retry transitions remain separate. Tests cover stale writes and repeated cleanup for completed and failed states.

Permissions: `scripts/verify-native-workflow-permissions.mjs` exercises actual OpenCode 1.18.31 → actual OmniRoute 3.8.52 → guard → deterministic loopback provider → actual filesystem/bash tools. No external inference or credentials. Native role rules report `ask`, and agent selection at session creation is confirmed. Removing legacy per-prompt `tools` flags advertises no tools and returns unavailable-tool errors. Re-enabling those flags makes tools execute without requests, even with explicit session `ask` rules. Thus configuration inspection is insufficient and the legacy/native authorization bridge is not verified.

The final native diagnostic is **FAILED**, intentionally not hidden in unit success totals: edit_allow, bash_allow, edit_deny and bash_deny each observed zero approvals; edit/bash ran. bash_interrupt returned cancelled with neither file edit nor command marker. Evidence: `validation/phase8-permission-blocker/native-result.json`. These are negative compatibility findings, not successful permission acceptance.

Actual runtime workflow dispatch now calls a permission-enforcement check that fails before session creation or scope binding with `workflow_native_permission_bridge_unverified`. Unit fake engines do not establish native enforcement. The diagnostic has an explicit bypass restricted to its credential-free deterministic fixture so the defect remains reproducible. Production exposes neither this bypass nor execution readiness. API readiness requires both execution readiness and permission verification. A Start workflow button is present but disabled in production; its disabled state is browser-tested.

Harness: runtime gate prevents a premature live rerun. During polling, request/conservative token totals, provider failures, usage/cost presence and completed mutating tools without recorded approvals fail immediately. Final evidence also requires completed persisted state, approvals for both roles and all configured limits. No cleanup can convert a completed workflow to cancelled.

Validation: **178/178 unit/regression tests**, production build and all three isolated browser suites pass; automated accessibility incomplete findings remain. The separate native permission end-to-end diagnostic remains red. Fixing the native tool-registration/authorization bridge and proving real approval/rejection are still mandatory before live acceptance. A runtime compatibility adapter/upstream change needs its own tested implementation; no runtime binary was rebuilt or upgraded here.


## Observed live acceptance — 2026-11-01: FAILED

One owner-approved attempt ran through the real browser-authenticated API, shared task supervisor, two native OpenCode sessions, scoped ingress, actual OmniRoute, guard and live Gemini `gemini-3.5-flash-lite`. No custom runner was used. Model discovery required configured free-tier confirmation and zero catalog pricing. The product launch gate stayed closed; only the disposable server received its acceptance capability. The UI start button was not used: the loaded browser called the actual authenticated workflow API.

Observed: 7 upstream requests, all HTTP 200 on the same exact model; one attempt per step; no fallback or repeated-request fingerprints; 15,908 provider-reported tokens; 40.079 seconds through independent verification. Guard ledger cost was $0 under Free Only; this is not an independent billing statement. The generated diff was exactly `return n + 1` → `return n * 2`. The fixed positive/negative/zero test file was unchanged, the real Tester reported a completed test command with exit zero, and two independent test executions passed.

Acceptance failed for three reasons:

1. Total conservative request reservations were **85,855**, exceeding the approved **64,000** ceiling. The ledger enforced actual usage plus pending reservations instead of a cumulative conservative ceiling. This was an authorization-limit breach, despite lower observed usage. A local-only correction now retains a lifetime conservative counter and refuses old ambiguous history; a regression asserts settlement cannot replenish it. No corrected live rerun occurred. Local validation after these corrections: 175/175 regressions and all three isolated browser checks pass.
2. **Zero permission requests/approvals were observed**, despite actual edit and bash tool execution. Native role/per-message permission precedence must be investigated; the permissions requirement is not verified.
3. The workflow was observed `completed` at 39.734 seconds, but harness cleanup called cancellation unconditionally, leaving persisted status `cancelled`. The original harness incorrectly printed `passed:true`; the independent verdict is **false**. Cleanup and final evidence assertions were corrected locally, without altering the original report or running again.

Complete private evidence remains in `validation/phase8-live-1793493550682/`: original `report.json`, authoritative `verdict.json`, routing events, durable budget/scopes and independent test outputs. The disposable project/profile are retained locally. No original user project was edited. No push, package or publication occurred. No second live attempt is authorized.

Release blockers: cumulative-budget correction has no live acceptance yet; permission enforcement/approval evidence is missing; cleanup/final-status consistency needs revalidation. Human-review UI, isolated parallel writers, automatic ambiguous recovery, paid authorization, native compliance, independent-machine and human-accessibility gates also remain open. Production workflow execution must stay gated. Historical proposals/results below are superseded by this observed verdict.


Updated 2026-11-01. Production activation/resume/retry remains gated. No live inference, packaging, publication or remote push.

## Local checkpoints

| Commit | Independently validated scope |
|---|---|
| `21eacb4` | Safe Git preservation; secrets, installers, raw private/generated artifacts remain ignored locally. |
| `d78ab90`, `69fdcc4` | False-success prevention; strict plan/API/state validation; approved content-bound checkpoint restore with stale-edit rejection and paused replanning. 156 tests at that checkpoint. |
| `0d5bf20` | Shared task supervisor handles workflow session creation, deadlines, progress, permissions and cancellation. Original session persists before dispatch. 165 tests and browser checks. |
| `09cb5a0` | Exact one-target model aliases and six installed native role permissions; actual pinned-engine registry probe without inference. 168 tests and browser checks. |
| `17f60a1` | File-backed project ownership, cross-process exclusion, read-only parallel batches, durable loop counters and conservative non-replaying reconciliation. 171 tests and browser checks. |
| Current accounting slice | Session-bound authenticated workflow ingress, per-attempt restricted OmniRoute connections/keys and capability-path guard scopes. Durable attributed budget reservations/reconciliation at actual dispatch. |

## Final evidence

- **175/175 regressions**; production UI build passes. Existing 769 KB highlighting chunk warning remains.
- All three credential-free isolated browser checks pass: Phase 7 UI, Phase 8 display fixture and actual authenticated restore API flow. Automated contrast/name incomplete checks remain; this is not accessibility certification.
- `scripts/verify-workflow-engine-contract.mjs`: actual OpenCode 1.18.31 registers six native role definitions and deny rules. File-backed global config and asynchronous registry bootstrap were verified. No prompt is sent.
- `scripts/verify-workflow-gateway-contract.mjs`: actual OmniRoute 3.8.52 routes one scoped request through the real ingress/guard to a deterministic local upstream; further upstream dispatch is blocked by the guard request cap. Restricted attempt key and connection registration are exercised. Zero live inference.
- `test/workflow-lifecycle.test.mjs`: explicit fake engine covers provider/observation errors, retry/length states, exact command/tool exit verification, permissions, cancellation and restart refusal.
- `test/workflow-coordination.test.mjs`: a separate process holds and loses a lease; active and crashed owners cannot be silently stolen; failed reconciliation retains ownership; confirmed abort pauses for replanning without redispatch.
- `test/workflow-accounting.test.mjs`: durable restart/idempotent reconciliation, concurrent pending reservations, month rollover exposure, locked/corrupt ledger refusal, real ingress/guard HTTP scope and model enforcement, budget exhaustion, rate limits and late closed-scope rejection.

## Accounting and routing boundaries

Legacy single-agent routing retains its coding alias. Workflow sessions use a separate authenticated loopback ingress keyed by the native session header. The ingress maps only a registered session/model to a one-target attempt combo. Its OmniRoute connection embeds a guard scope capability; the guard independently checks provider/model, active lifetime, Free Only policy and attributed workflow/task limits. A namespace derived from the project path prevents same-named workflows in different projects sharing an account. Internal capabilities/keys never enter renderer responses or external provider requests.

The same budget ledger now uses synchronous cross-process file locks and atomic persisted transactions. It reserves before dispatch, includes pending task/workflow/monthly exposure, persists request/token caps and makes settlement idempotent. Unknown usage or a network failure retains the reservation; non-streaming usage without a newline is parsed. Month rollover retains pending exposure. Corrupt/locked/full-size state fails closed. Synthetic paid-policy unit tests require explicit in-process authorization; no product paid authorization path is exposed. Free Only and $0 workflow limits remain mandatory.

## Remaining gaps and limits

The complete live UI → API → native OpenCode tools → independent verification path has not run. Separate native-engine configuration and actual-gateway/local-upstream probes are not live coding proof. Production stays gated. [Proposed bounded acceptance](LIVE-ACCEPTANCE.md) awaits owner approval.

Review text never approves work: a native Reviewer session pauses for human review. An end-to-end human-review approval workflow remains to be completed. Shell/mutation-capable workers serialize; isolated parallel writers are deferred. Actual-session retries and interrupted/new loop attempts require review/replanning rather than automatic replay. Recovery confirms abort/status but does not claim to undo external side effects. A live process reusing an owner PID conservatively blocks recovery.

A crashed accounting lock requires controlled repair; it is never stolen automatically. Unknown reservations intentionally consume budget until reconciled. Attempt keys are disabled on normal release; closed/expired guard scopes remain the fail-closed authority if gateway cleanup fails. Historical scope/workflow metadata has a size ceiling; long-term archival/pruning beyond bounded settlement retention remains release work.

Filesystem checks are not an OS sandbox against a hostile same-user process racing operations. Multi-file restoration is not one atomic transaction; partial approved restores remain paused with snapshots retained. Native licensing, independent Windows testing, human accessibility and all public release gates remain open. Historical live-double custom runners did not prove production execution; their raw artifacts remain local and their original claims remain in the preservation commit.
