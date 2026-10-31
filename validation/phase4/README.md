# Phase 4 — static builder evidence

Windows host, 2026-10-24. This is a static HTML/CSS/JavaScript workflow; framework servers, installs, HMR, deployment and OS command sandboxing remain outside its scope. No Phase 5 work has begun.

**Scoped acceptance passed.** [Installer](../../release/desktop-0.4.0/LocalAgent-Setup-0.4.0-x64.exe), [artifact identity](artifact.json), [fresh install/app/uninstall](installer.json). All three exit 0; the entire temporary installation directory was removed. The unsigned installer is 979,689,371 bytes, SHA-256 `335b036a2997377a249cab994732dbc3f57eef1412c22f4b65d84db717c58d50`.

## Verified

- [62 regressions](regression-tests.txt): context, authentication, signatures, cost/route admission, lifecycle/credentials and preview confinement. Preview checks reject traversal, secrets, symlinks and hard links; syntax validation never runs a malicious package script; filtered export and file revisions pass.
- [Packaged live coding](packaged-coding.json): one existing OpenCode session generated four files, ran `node --test` (2/2), then removed an injected browser-only error, revised the heading/mobile layout and ran new tests (2/2). [Generation output](generation-tests.txt), [refinement output](refinement-tests.txt), [final diff](source.diff). The injected error is a labelled test fixture, not a provider failure.
- Fresh browser captures: [desktop](coding-desktop.png), [tablet](coding-tablet.png), [mobile](coding-mobile.png). HTTP 200, no console/runtime errors or horizontal overflow, current revisions. Screenshot review is not a full accessibility/design certification.
- [Workspace overview](workspace-overview.png) and [mobile workspace](workspace-mobile.png) review the retained task after restart, with no new inference. Changes/tests remain in the existing inspector. The test credential was removed afterward.
- [Initial packaged fixture](packaged-initial-fixture.json) verifies opaque origin, denied parent/cookie/native access, blocked API/external fetches and popups, refresh, syntax/runtime recovery, export, capability restart and shutdown. Its initial desktop inspection was explicitly stale; the live task's three captures are fresh.
- [Final installed fixture](packaged-fixture.json) records the actual installed executable path and verifies real mouse activation, preservation of existing refinement drafts, all fresh viewports, deliberate engine crash and explicit runtime recovery with only system tools in the inherited PATH. Reloading the desktop document refreshes the changed preview-origin CSP while restoring the draft. Expected connection errors during the injected outage are retained; tasks are not replayed. [Earlier unpacked recovery check](packaged-recovery-fixture.json).
- [Dependency audit](dependency-audit.json): seven low, zero moderate/high/critical; [packaged native/runtime gate](package-binaries.json) passes. [Approved 0.3 installer](phase3-preserved.json) is byte-for-byte unchanged.

## Inference and compatibility

Exactly two task prompts, eight Gemini 3.5 Flash Lite requests, all HTTP 200 and all context budgets fitting. [Cross-profile inference summary](inference-summary.json) confirms no further model requests in the inspected coding/installer acceptance profiles. Confirmed-free admission expected $0 inference; no paid models admitted, browser/model downloads, paid evaluator or failover requests. Account billing dashboard was not inspected. Other unsupported routes remain excluded. This demonstrates same-session iteration, not new cross-provider failover or post-restart signature resumption.

Final installer checks used fixtures only. The coding run preceded final UI polish (draft preservation, stale validation display and screenshot sizing) and the desktop recovery fix; the coding engine, guard, gateway and provider configuration were unchanged. The final installed run verified those changes without repeating inference. The installer hash is identical across both install attempts.

## Diagnosed limitations and failures

- Hidden-window screenshot timeout fixed with Electron's existing offscreen rendering; the isolated probe has no preload, provider credentials or platform access. Development probe launch directory corrected from `apps` to `apps/desktop`.
- Electron/Playwright child-frame bounding boxes ignored CSS scale on this host. Earlier direct/DOM and pointer results remain labelled in the reports. `scripts/preview-pointer.mjs` maps real mouse input through the rendered iframe rectangle only in verification; the installed check passes without changing renderer/security policy.
- The first installed acceptance failed a post-recovery click: visible HTML preceded execution of its deferred JavaScript module. [Diagnostic](module-readiness.json) shows an early missed click and successful activation after load. The driver now uses Playwright's existing frame-load wait before one mouse click. The unchanged installer then passed. [Initial install result](installer-initial.json), [initial installed fixture](installed-initial-fixture.json). No provider retries or extra inference occurred.
- Runtime recovery previously left the loaded page's CSP pointing at the old preview listener. A narrow native-shell reload on preview-origin change fixes this without relaxing policy; the current packaged crash/restart check passes. Web development mode requires a manual page reload after restarting its runtime.
- `development-fixture.json` and `acceptance-failure.png` retain earlier failed diagnostics, not final acceptance. Expected injected syntax/runtime errors are recorded separately from workspace errors.
- Clean-VM validation is unavailable on this host. Signing, upgrades/rollback, manual accessibility/native picker coverage, distribution/license review and broader command isolation remain public-release gates. Current source/export limits and network restrictions are documented in [builder guide](../../docs/BUILDER.md).
