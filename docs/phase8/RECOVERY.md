# Phase 8 Integration Recovery & Hardening

Updated 2026-11-01. This records source and fixture evidence, not production multi-agent acceptance. Recovery is authorized; no paid inference, unapproved live tests, packaging, publication or remote push.

## Verified checkpoints

1. **Git preservation.** Local root commit `21eacb4` preserves 285 source/document/fixture files. `scripts/audit-git-baseline.mjs` checked staged bytes against local environment secrets and high-confidence credential patterns without printing values. Private credentials, runtimes, installers, raw session/evidence data, screenshots and machine inventories remain on disk and ignored. Additional registry/tool credential paths are excluded. No remote operation was performed.
2. **False-success prevention.** Commit `d78ab90` passed 150/150 regressions and UI build. Missing executors fail. Custom runners require explicit outcomes and are labelled `custom_runner`; they do not establish production verification. OpenCode timeout, provider error, retry/busy status and failed/missing observations cannot establish completion. Test/review prose cannot establish a result; missing or negative verifier outcomes fail the step. Blocked/incomplete steps cannot complete the workflow; completed steps cannot be retried. The tree derives stage status from actual child state instead of hardcoded success.
3. **Workflow API and checkpoint safety.** Strict identifiers, bounded graph shape/depth/count, role/dependency/array/text/file validation and duplicate-plan rejection precede instantiation. Persisted plans are revalidated. State writes use exclusive temporary files, fsync, no-clobber creation and atomic rename. Snapshot paths reject private files, traversal, alternate streams, Windows aliases, links/junctions and hardlinks. Text/size/hash/owner checks reject invalid snapshots. Restore requires a preview plus explicit approval bound to current file hashes and snapshot contents. A post-preview edit rejects restoration before writes. Approved restoration first invalidates completion evidence, pauses the workflow and requires a new plan; it cannot silently resume or replay work.

## Final validation

### Supervised lifecycle checkpoint — 2026-11-01

Workflow sessions now enter the existing task supervisor, persist their original session/attempt before prompt dispatch, share progress/deadline checks, expose owned permissions, and propagate pause/cancel to session abort. Workflow sessions stay out of single-agent task navigation. The raw unsupervised workflow engine branch was removed. Test verification requires the exact declared command with completed tool results and exit zero; reviewer prose pauses for explicit review. Restarted/ambiguous sessions stop for recovery without redispatch. Same-process duplicate runners are rejected. Exact-model/role configuration and durable cross-process coordination are the next checkpoints, so production remains gated.

Evidence: **165/165** regressions; production UI build; all three isolated Phase 7/8/recovery browser checks pass. `test/workflow-lifecycle.test.mjs` uses an explicit fake engine to exercise the adapter: success from tool metadata, provider errors, observation loss, retry/length states, wrong/failed commands, cancellation and restarted-supervisor non-replay. No live inference or claim of production path acceptance.

| Check | Result |
|---|---|
| `npm test` | **156/156**, zero failures/skips; includes authenticated HTTP and temporary junction/hardlink fixtures outside the restricted sandbox. |
| `npm run build:ui` | Pass; 117 modules, 2.46 seconds. Existing 769 KB highlighting chunk warning remains. |
| `node scripts/verify-workflow-recovery-ui.mjs` | Pass, zero inference. Real UI → authenticated API → filesystem path: dismiss preserves contents; post-preview edit returns conflict; freshly confirmed restore succeeds and workflow stays paused for replanning. |
| Phase 7 browser fixture, isolated copy | Pass after waiting for existing CSS theme transitions before contrast measurement. Zero automated violations; incomplete contrast/name checks remain. The first transition-race failure was observed and retained in temporary output. Product CSS was unchanged. |
| Phase 8 browser fixture, isolated copy | Pass, zero dark/light axe violations. This is seeded display/interaction evidence, not execution evidence. |

New tests: `test/workflow-hardening.test.mjs` and `test/workflow-security.test.mjs`. Older workflow fixtures were updated to supply explicit verification outcomes and explicit restoration approval; invalid conflicting plans are now rejected rather than bypassing their validation. Test success must not be presented as a live provider, billing or tool-execution result.

## Execution gate and remaining checkpoints

The production workflow API returns **409 `workflow_execution_not_ready`** for activation/resume/retry until integration is explicitly enabled after acceptance. Plans can be saved with `autoStart:false`; the UI states that they do not run agents. Existing single-agent tasks are retained. Paid workflow policy activation is rejected; Free Only remains the default. The incomplete direct session branch is not promoted by these tests.

4. Integrate with the existing task supervisor: persist session/attempt identity before dispatch, share progress/deadline bounds, expose permissions to the correct workflow step, propagate cancellation/abort, bind only registered exact models and collect real tool outcome evidence. Independently verify the pinned SDK/runtime contract without inference first.
5. Add exclusive execution ownership, cross-run file coordination, crash/restart reconciliation and durable loop cursors. An ambiguous dispatched step must reconcile its original session or stop for review, never blindly replay. Replanning after restore must preserve previous attempt evidence.
6. Attribute every workflow inference request at the guard, with durable reservations, real workflow/task identity, conservative unknown-usage handling, explicit spending authorization and tested concurrent/month-rollover recovery. Zero-cost policy remains mandatory until those paid gates pass.
7. Install specialized role definitions into actual OpenCode configuration, enforcing tools and permissions rather than relying on prompt text.
8. Extend adversarial acceptance to real lifecycle crashes, cancellation, concurrent writes, rate limits, budget exhaustion and interrupted recovery. Current negative API and filesystem fixtures cover only the early safety boundary.
9. Verify UI → API → OpenCode → OmniRoute/guard → actual tools → independent tests/review under a separately approved bounded free-only live test. No such test ran during this recovery checkpoint.

## Limits

Atomic JSON persistence is not durable execution recovery. Restoring multiple approved files is not one filesystem transaction: a mid-write filesystem failure can leave a partial approved restore; snapshots remain and the workflow stays paused. Link/path/descriptor checks are not an OS sandbox against a hostile same-user process racing filesystem operations. Human accessibility, independent-machine testing, native licensing, signing and public release gates remain open.

Historical live-double artifacts contain successful guard requests and generated/tested source, plus failed runs. Their custom runner wrote files itself. They do not prove the product's OpenCode workflow path or independent billing verification. Prior all-complete claims are superseded; the original source/claims remain in the preservation commit and raw artifacts remain local.

## Exact model and native role checkpoint

168/168 regressions, production UI build and all three isolated browser checks pass. Exact aliases are registered as one-target OmniRoute combos with a separate workflow egress connection; the existing coding alias is retained. Stale/unavailable/unregistered models fail closed; paid assignments are not authorized. The engine installs six `localagent-*` role definitions with deny-first native permissions and a message-level tool mask. `scripts/verify-workflow-engine-contract.mjs` confirms the roles and deny rules through the actual 1.18.31 API without prompts. It exposed file-backed config loading and asynchronous registry initialization; the adapter now writes its own global profile config. Actual tool enforcement remains an end-to-end acceptance gate. Workflow egress rejects dispatch until attribution is connected; no live inference occurred.

## Coordination and conservative recovery checkpoint

171/171 regressions, production UI build and all three isolated browser checks pass. `test/workflow-coordination.test.mjs` launches a separate owner process, verifies live and dead owners cannot be stolen, confirms failed reconciliation retains ownership, and verifies recovery aborts the original session without redispatch. Workspace-wide exclusive ownership covers workflows, restoration and production single-agent dispatch. Read-only workers may run together; mutation/shell-capable workers serialize regardless of declared targets. This intentionally defers isolated parallel writers.

Loop counters/status and earlier attempt metadata are durable. Completed workflows/loops are skipped. Interrupted/dispatched attempts and actual session retries require reconciliation/replanning; automatic new live loop iterations are stopped for review rather than replaying side effects. A PID reused by another live process conservatively blocks stale-owner recovery. This is safe refusal, not automatic recovery of arbitrary side effects. Unknown abort outcomes retain the lease. Guard budget attribution remains next; production activation is still disabled.
