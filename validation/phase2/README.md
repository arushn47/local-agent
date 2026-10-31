# Phase 2 acceptance — Windows local web alpha

Verified 2026-10-23. Product launch: `npm run build:ui`, `npm run ui`, then http://127.0.0.1:20140. No upstream source edits, additional agent loop, React runtime or paid inference path.

| Check | Evidence | Result |
|---|---|---|
| Matching upstream build | [Build](../upstream-build.json), [browser smoke](upstream-ui.json), [screenshot](upstream-workspace.png) | OpenCode 1.18.31 / pinned commit; 3,536 source hashes unchanged; frozen Bun 1.3.14 install; build/render pass, inference disabled |
| Regression safeguards | [Test output](../phase2-regression-tests.txt) | 57/57 pass, including original guard/context/signature/provenance tests, browser API security, DPAPI storage/removal and empty onboarding |
| Provider configuration | [First UI attempt](attempt-1-workspace-ui.json) | Existing confirmed Gemini key saved through UI, DPAPI protected, response contains no key. No key screenshot/trace retained |
| Real coding task | [Live attempt](attempt-2-workspace-ui.json), [actions](coding-actions.json), [agent test output](agent-tests.txt), [final Git diff](source.diff) | Gemini read/edited double.mjs, wrote Node tests and executed node --test itself: 2/2 pass |
| Final UI result | [Saved-session review](workspace-ui.json), [changes](localagent-changes.png), [tests](localagent-coding-result.png) | Completed task and both files visible; review requested no inference |
| Behavior/accessibility fixtures | [Report](workspace-flows.json), [reconnect](localagent-reconnect-fixture.png), [cancel](localagent-cancel-fixture.png) | Invalid-project feedback, focus trap/restoration, reconnect/draft, cancel-once, reflow/mobile project switch; zero inference |
| Fresh no-key setup | [Report](empty-workspace.json) | Owned gateway/engine ready, no coding targets, inference key inactive; no inference |
| Routing/cost scope | [Metadata summary](routing-summary.json) | Gemini only in these UI attempts; quota unknown, free-tier attested, no independent billing receipt; no new failover proof |
| Dependency review | [Summary](dependency-audit-summary.json) | 16 affected packages, including 3 critical; release blocker, no forced upstream upgrade |

Additional visuals: [home](localagent-home.png), [connections](localagent-connections.png), [routing](localagent-routing.png), [mobile](localagent-mobile.png). Screenshots inspected for layout and legibility. Automated checks do not certify WCAG conformance or replace screen-reader testing.

## Confirmed fixes and interpretation

The first UI task did not complete coding; its transient snapshot failure is not claimed fully diagnosed. Read-only navigation permissions and defensive partial-tool projection were then tightened. The second task completed and passed tests, but its harness correctly failed because the SDK session summary exposed no diff. LocalAgent now reuses completed upstream edit patches; write content without a baseline is explicitly labelled a snapshot. The independent Git diff confirms final source/test changes. No further model task was needed to validate the display fix.

Fresh no-key startup exposed OmniRoute's create-key schema rejecting an explicit empty allowedConnections array. The adapter omits that field only during empty creation and uses upstream isActive=false plus restricted empty permissions until targets exist. A focused regression and real isolated startup verify the fix; no guard or model-admission policy was weakened.

## Scope and next gate

Phase 2's local workspace gate passed. Sessions, tools, permission execution and history stay in pinned OpenCode. LocalAgent stores project/session references, encrypted credentials and sanitized routing metadata. API tests cover session cookies, exact Host, same-origin mutations and restricted endpoints. Provider reasoning/signatures are excluded from the renderer.

Remaining: verified upgrades for upstream security advisories, Electron packaging/service lifecycle, clean-machine install checks, manual accessibility audit, non-Windows credentials and builder preview isolation. Saved result review works after restart; Gemini continuation may fail closed after ephemeral metadata expires. Groq, reverse and untested continuation routes remain excluded; the earlier Gemini → Cohere proof retains its original limited scope.

Package dry-run: [report](package-check.json) confirms built UI assets are included and secrets, runtime state, disposable projects and validation artifacts are excluded.
