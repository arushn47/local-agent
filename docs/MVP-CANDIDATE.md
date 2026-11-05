# LocalAgent 0.5.3 internal candidate

Updated 2026-11-05. This is an unsigned Windows internal candidate, **not public-release acceptance**. Production multi-agent activation remains gated. No live inference, paid inference, remote push, publication or installation into the user's existing app was performed during this mission.

## Feature completion matrix

| Feature | Current implementation and independently checked scope | Remaining limit |
|---|---|---|
| Native edit/bash permissions | Permission-only OpenCode adapter; real Allow once, Reject and cancellation at pending approval for both tools; no side effects before approval or after rejection/cancellation | Agent permissions are not an OS sandbox. Revalidate on engine/API changes |
| Single-agent coding | Browser Start task → normal coding alias → actual OpenCode/OmniRoute/guard → native read/edit/bash → visible diff/tests; independent fixed tests pass; reload does not replay | Provider responses in this mission are scripted local fixtures. Existing live-model evidence is historical |
| Planning and exact assignment | Templates/numbered-list planning, editable custom plan JSON, durable provider-qualified model reassignment before execution | Planning/recommendation scores are heuristics, not measured model intelligence. Paid policies remain unavailable |
| Supervised multi-agent execution | Actual browser Start, distinct native Implementer/Tester/Reviewer sessions, exact model binding, scoped routing, durable budgets and actual tool exit verification | Production Start/Resume/Retry remains gated pending separately authorized live-provider acceptance |
| Human review | Reviewer text pauses; explicit approval binds workflow state and current file bytes; stale approvals reject; separate Resume; approved repeat cycle skips completed sessions | Review requires bounded existing text files. Deletions/unsupported recovery require a new plan; no approval inferred from model prose |
| Parallelism, loops and recovery | Read-only batches, serialized mutation/shell roles, bounded loops, ownership leases, checkpoint preview/approval and non-replaying recovery | Isolated parallel writers, arbitrary nested execution and automatic ambiguous retries/new native iterations remain deferred |
| Files and project/task navigation | Confined text reads; private directories, Windows aliases, junctions and hardlinks rejected; keyboard file selection, retained line numbers, refresh, normalized changed paths; late reads/lists cannot cross projects | Read-only text inspection, 1 MB/file and bounded listing; no general editor |
| Commands, changes, tests and context | Actual outputs/diffs; running, failure and unknown exit distinguished; no invented exit codes; context labels last completed input including cache | Test-command recognition is bounded. Current context occupancy/capacity and actual live compaction fidelity remain unknown |
| Static builder | Existing isolated preview, syntax checks, embedded browser inspection, interaction and ZIP source export retained | Static relative HTML/CSS/JS only; no framework servers, HMR, dependency installation or deployment |
| Desktop/onboarding | Packaged 0.5.3 passes current-host fresh-profile startup, native-picker adapter, task creation/navigation, placeholder DPAPI save/removal, missing-model/workflow gating, preview/inspection/native ZIP export, file inspection, engine-crash recovery, app restart/draft retention and shutdown; zero renderer errors and guard inference requests | Placeholder onboarding is not proof of valid provider credentials. Native picker/save choices are controlled fixtures, not human accessibility acceptance |
| Distribution | Exact preserved reduced dependency bytes revalidated against historical proof and current locked versions/integrities; fresh isolated bundled-Node compatibility proof; payload security scan | Unsigned private candidate; no clean-VM, license/native redistribution, human accessibility or long-soak clearance |

## Verification evidence

Sanitized, reproducible summary: [validation/mvp/README.md](../validation/mvp/README.md). Raw reports/screenshots remain ignored locally in `validation/mvp/` and adjacent `validation/mvp-*.log` files.

- `npm test`: **183/183** regressions at this checkpoint, zero inference.
- `npm run build:ui`: production bundle passes; the existing optional highlighting chunk warning remains.
- `node scripts/verify-native-workflow-permissions.mjs`: six real native permission cases, actual gateway and local scripted provider.
- Same command with `--single`: actual single-agent browser coding flow, fixed tests independently rerun.
- Same command with `--browser`: three-session bounded implement/test/review cycle, human approval and explicit resume. Seven fixture requests, **63,351** cumulative reserved tokens under 8 requests / 64,000 tokens / $0. Completed state survives reload. These are fixture accounting values, not provider billing.
- `node scripts/verify-recovery-regressions.mjs`: isolated IDE, workflow preflight assignment and authenticated checkpoint-restore browser suites; automated incomplete accessibility findings remain.
- `node scripts/verify-mvp-inspection.mjs`: file selection/highlighting/theme, stale requests, project/task races, startup draft/typing preservation, command/test states and 390px reflow.
- `node scripts/verify-mvp-desktop.mjs`: **packaged desktop acceptance passes** for the matrix above. Two launches measured 10,154 ms and 6,892 ms with uncontrolled cache state; these are not cold-machine benchmarks. `desktop.json` records the actual outcome separately from packaging.

The native source fix is described in [PERMISSION-ADAPTER.md](phase8/PERMISSION-ADAPTER.md). The original failed live acceptance and earlier negative permission evidence remain historical findings in [RECOVERY.md](phase8/RECOVERY.md). No new live attempt is authorized by a deterministic result.

## Internal build and reproduction

Use `release/desktop-0.5.3/Launch-Internal.cmd` for a separate profile at `%LOCALAPPDATA%/LocalAgent-Internal-0.5.3`. Keep the **whole candidate folder** together. The underlying executable is `win-unpacked/LocalAgent.exe`; launching it directly uses the normal application data location. Do not replace the installed 0.5.2 payload with individual files. Previous installers and user data are preserved. No 0.5.3 installer/upgrade acceptance is claimed.

The old staging graph was stale and historical Next build traces had been removed. `prepare-preserved-backend.mjs` therefore verifies the frozen dependency tree against its historical proof and compares every retained package version/integrity with the current lock, before copying into a new candidate. `verify-backend-candidate.mjs` then runs a fresh isolated compatibility check with bundled Node; staging still requires a proof bound to the current lock and exact bytes. It does not waive graph or payload checks.

```powershell
npm run build:ui
node scripts/prepare-preserved-backend.mjs
$env:LOCALAGENT_BUILD_EVIDENCE = 'validation/mvp'
node scripts/verify-backend-candidate.mjs
node scripts/prepare-desktop.mjs --backend-runtime .localagent/mvp-backend/runtime
node scripts/build-desktop.mjs pack
node scripts/write-internal-launcher.mjs
node scripts/verify-payload.mjs
node scripts/verify-mvp-desktop.mjs
```

The preservation command intentionally refuses an existing candidate directory. For a clean checkout without that frozen payload, use the source-based gateway build and backend-candidate recipe in [DESKTOP.md](DESKTOP.md) / [RELEASE.md](RELEASE.md); do not fabricate cached proof. Build outputs, profiles and reports stay local.

## Public-release blockers

No current live-provider acceptance of the corrected workflow path; no authorization for another live run. Production workflows stay gated. Also open: independent clean Windows testing, native/embedded licensing and source/relinking compliance, signing/publishing ownership, human screen-reader/native-dialog review, unresolved historical long-soak behavior, real compaction fidelity and broader installer/power-loss/disk-full/quarantine coverage. Paid inference remains disabled in product workflows. This candidate does not establish broad model quality, universal failover, full accessibility or an OS sandbox.
