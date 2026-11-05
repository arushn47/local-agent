# Internal candidate validation — 2026-11-05

This report distinguishes deterministic native execution, seeded display fixtures, desktop behavior and live inference. **No live inference was performed.** The product's workflow execution gate remains closed.

| Check | Observed result |
|---|---|
| Regression suite | 183/183 pass; includes role admission, private file/link rejection, exact preflight assignment, stale review approval, budget ceilings and terminal-state preservation |
| Production UI | Builds successfully; existing optional ~770 KB highlighting chunk warning |
| Native permission contract | Six passing cases: edit/bash Allow once, Reject and cancellation while approval is pending; one unique request per case; no forbidden side effects |
| Single-agent browser path | Actual normal route, native read/edit/bash, two UI approvals, independent passing tests, diff/test views and reload without replay; four scripted provider responses |
| Multi-agent browser path | Actual bounded implement/test/review cycle; three distinct native sessions; two tool approvals plus content-bound human review and separate resume; independent fixed tests; completed state retained on reload |
| Workflow budget boundary | Seven scripted requests; 63,351 lifetime conservative reserved tokens; limits 8 / 64,000 / $0; no settlement replenishment. Reported usage is synthetic fixture usage |
| Existing browser suites | IDE, preflight exact-model assignment and authenticated checkpoint restore pass; automated accessibility incomplete findings remain |
| Inspector/races | Keyboard Enter/Space, correct text after delayed responses/project changes, preserved highlighting line numbers, changed absolute paths, honest command/test states, startup draft/typing and 390px reflow pass |
| Dependency payload | Frozen reduced tree `ce7ab567427f8b750f511d31d3e6013c630b9a7a31ab2d8d76ad0dae17da186d` retained; current lock versions/integrities checked; new isolated bundled-Node compatibility passes with 1,039 observed module files and zero escapes |
| Payload scan | 19,244 files / 1,504,981,229 bytes at the validated scan, before final documentation refresh; zero exact known-secret matches, active env/npmrc files or links. `payload-security.json` records the final scan. This is not a complete secret/security audit |
| Packaged desktop | **Passed**: fresh profile, sandboxed renderer, native-picker adapter, two real native task tabs, missing-model gating, placeholder DPAPI save/removal, preview isolation/interaction, syntax check, embedded mobile inspection, native ZIP download, file inspection, saved-plan execution gate, engine crash recovery, app restart/draft/removal retention and owned-process shutdown. Zero renderer errors and guard inference requests |
| Desktop launch observations | 10,154 ms and 6,892 ms; uncontrolled cache state, not clean-machine/cold-start benchmarks |

Raw local reports: `native-result.json`, `native-single-result.json`, `native-ui-result.json`, `inspection.json`, `backend-closure.json`, `backend-proof.json`, `payload-security.json`, `package-binaries.json`, `desktop.json`; adjacent logs are `validation/mvp-*.log`. Raw profiles, source exports and screenshots remain ignored, and are not approved for publication.

Retained failures informed fixes: sandbox loopback EACCES was rerun with authorized local network access; the old mixed tools/permission configuration reproduced bypasses; a 60-second fixture catalog expired during a longer diagnostic; stale UI permission cards needed request-ID deduplication; idle rejected native tools needed explicit failure handling; custom model listbox semantics were replaced by native selects/disclosures; a real desktop restart exposed late draft initialization. An initial Electron export test used the wrong browser download event; the replacement observes native DownloadItem completion. Failed logs are not model success evidence.

Current scope and release blockers: [MVP-CANDIDATE.md](../../docs/MVP-CANDIDATE.md). Native adapter rationale: [PERMISSION-ADAPTER.md](../../docs/phase8/PERMISSION-ADAPTER.md). The historical failed live acceptance remains authoritative for that attempt; these deterministic checks do not replace live-model, independent-machine, licensing or human accessibility acceptance.
