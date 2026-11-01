# Phase 8 Integration Recovery & Hardening

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
