# 0.5.4 internal chat-controls candidate

- Change free models in the same chat at an idle boundary; preserve history. Compare all discovered free candidates with explicit task-fit metadata and unavailable reasons; no nine-model cap or quality claims.
- Add a bounded shared project brief with version/conflict checks, and Follow agent in the read-only file inspector.
- Add per-chat message queues with edit/remove/hold/resume and real steering through the pinned runner; Stop/errors/restart hold pending work, and uncertain dispatch never automatically replays.
- Reconcile selected model capacities with the shared automatic compaction buffer. Live summary fidelity and manual compaction remain unaccepted/unavailable respectively.
- Native single-agent, permissions and human-review workflow fixtures and 192 regressions pass without live inference. Production workflows remain gated. [Behavior and limits](CHAT-CONTROLS.md).

# 0.5.3 internal MVP candidate

- Fix pinned OpenCode native permission precedence without changing its binary. Actual edit/bash Allow, Reject and cancellation contracts pass against deterministic local responses.
- Add exact preflight model assignment, custom plan JSON and content-bound human review with separate resume. Production workflow execution stays gated pending authorized live-provider acceptance.
- Harden file inspection; preserve line numbers/keyboard access, isolate stale project/task reads and restore drafts immediately. Commands/tests no longer invent outcomes or exit codes; context labels last completed usage.
- Revalidate the frozen reduced dependency payload and run new isolated native/browser/desktop checks. Unsigned private candidate; previous installers/user data retained, no live inference or publication. [Scope/evidence/blockers](MVP-CANDIDATE.md).

# 0.5.2 stabilization candidate

- Backend-scoped dependency packaging follows pinned build traces, upstream externals/native extras and transitive closure. Excludes unused dashboard packages while retaining Next's framework peers and tested authentication/routing helpers.
- Compatibility proof is tied to the exact dependency payload and lock graph; changed or unverified candidates are rejected before staging. Engine and inference safeguards remain unchanged.
- Exact embedded Bun revision, default WebKit/TinyCC pins, versioned notices, source archive hashes and native provenance inventory improve compliance evidence. Redistribution review is still incomplete.
- Longer no-inference engine and packaged-app soaks, installation/recovery checks and automated accessibility evidence are recorded in validation/phase52. See that report for measured results and failures; these are current-host checks, not independent clean-machine or human screen-reader verification.
- Development candidate only: unsigned, no updater enabled, no publication, paid inference or new failover route.

# 0.5.1 stabilization candidate

Current-host acceptance passes: 76 regressions, installed builder/security/uninstall, twelve accessibility views and 0.3/0.4/0.5 upgrade/registry rollback/failure matrices. No external inference. See [evidence and limitations](../validation/phase51/README.md).

- Version-checked generated Next configuration loads gateway routes on demand, following upstream guidance; upstream source and policy checks are unchanged. First-use gateway tool/context fixture passed without external inference.
- Coalesce concurrent engine/session reads; release completed task bookkeeping; stop repeatedly rereading idle conversations while retaining active-task progress/permission monitoring and reconnection refresh.
- Atomic installer journals capture only LocalAgent's two per-user registry keys. Recovery restores previous files and registration, retries a pending registry restoration safely, and tolerates bounded transient Windows sharing denials without overwriting retained paths. Legacy journals require the documented manual repair path.
- Long project names no longer obscure New task in split preview. Decorative glyph semantics and modal skip-link isolation improved. Automated checks supplement, not replace, human screen-reader testing.
- No new product feature, paid inference or failover route. License/native compliance, clean VM, human accessibility, signing/publishing and broader failure scenarios remain release gates. See [decisions](RELEASE_DECISIONS.md) and [license review](LICENSE_REVIEW.md).

# 0.5.0 hardening candidate

- Smaller Windows-only payload: remove redundant OpenCode postinstall binaries and ONNX binaries for other systems; retain tested Windows x64 runtime and third-party notices. Stronger ZIP compression and the current UI's English-only Electron locale.
- Stage and validate installer payloads before switching versions; retain the previous application and provide explicit rollback. Projects and protected user data remain outside the installation.
- Upstream KaTeX security override, bounded routing/gateway logs, stronger Electron package fuses and bounded shell boot diagnostics.
- Accessible modal background isolation, focus restoration/navigation, select focus, control/metadata contrast and forced-colors treatment. Development-only axe auditing; no new UI runtime.
- Preparation for explicitly selected Windows signing certificates and signed update metadata. No automatic updater, paid service, new provider route or inference-policy change.

This is an unsigned local candidate. Independent clean Windows VM testing, full manual accessibility, license/compliance clearance, signing/publishing ownership and the broader upgrade failure matrix remain public-release gates. [Release operations](RELEASE.md), [evidence](../validation/phase5/README.md).
