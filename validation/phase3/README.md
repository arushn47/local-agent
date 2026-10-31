# Phase 3 Windows desktop verification

2026-10-24. Windows host acceptance passed. Independent clean-VM acceptance remains open; Phase 4 has not started.

| Check | Evidence | Result and scope |
|---|---|---|
| Safeguard regression | [Tests](regression-tests.txt) | 60/60 under bundled Node, including context/signature/cost/continuation controls, IPC restrictions, cancelled readiness and unsafe uninstall-target rejection |
| Security rebuild | [Build](gateway-build.json) | OmniRoute 3.8.52 / Next 16.4.3; 7,026 verified source blobs; upstream backend profile, no static source patches |
| Gateway compatibility | [Report](gateway-compatibility.json) | Controlled loopback 429/fallback, tool IDs/history and cooldown; zero real provider requests |
| Runtime lifecycle | [Report](runtime-lifecycle.json) | Fresh no-key startup, engine-crash detection, stable authenticated restart and shutdown |
| Bundled binaries | [Report](package-binaries.json) | Node 24.22.1, OpenCode 1.18.31, native SQLite ABI and required files |
| Installed coding and credentials | [Report](desktop-coding.json), [provider summary](provider-summary.json) | One Gemini task; read/edit/write/bash completed; two tests passed. DPAPI save, recovery and removal passed |
| Final installed application | [Report](desktop-app.json) | Fresh profile, isolated renderer, native picker bridge fixture, runtime recovery, draft/project restart, actual-main crash cleanup; no inference |
| Final install/uninstall | [Report](installer.json) | Exit 0 for install, app test and uninstall; application and full installation directory removed |
| Artifact identity | [Report](artifact.json), [archive](archive.json) | Unsigned x64 installer; exact SHA-256, size and shared payload identity |
| Dependency audit | [Disposition](dependency-security.json) | Production graph: seven low, zero moderate/high/critical findings; broader review remains open |

The coding run's installed payload is byte-identical to the final installer payload (archive SHA-256 recorded). The final revision changes only installer cleanup; it was retested without model calls. The agent fixed subtraction to addition in sum.mjs, wrote sum.test.mjs, and ran exactly node --test itself: [2/2 passing output](agent-tests.txt), [actual Git diff](source.diff). Four guarded Gemini requests completed with HTTP 200; quota headers were unknown. Only the user-confirmed free-tier Gemini model was admitted; no independent billing audit or new live failover claim.

Visual evidence from that installed task: [tests](desktop-tests.png), [changes](desktop-changes.png), [routing](desktop-routing.png). Images were inspected. A subsequent screenshot capture timed out after readiness; [failure](attempt-6-screenshot.json) is retained. Final functional verification explicitly skipped screenshots and passed DOM/lifecycle assertions; it does not claim a fresh final-build image.

## Confirmed failures and fixes

- [Missing resource dependencies](attempt-1-missing-package-dependencies.json): explicit runtime node_modules mapping and binary/ABI build gate.
- [Launcher-PID test mistake](attempt-2-launcher-pid-test.json): kill actual Electron main, not Playwright's launcher. [Focused diagnosis](parent-exit-diagnosis.json); no runtime workaround.
- Published OmniRoute's Next 16.3 artifact failed with patched Next 16.4. Rebuild official source; no fabricated manifest or weakened guard.
- [ZIP64 extraction](attempt-3-zip64.json): filter distribution-only artifacts; enforce conservative ZIP32 count. [Inventory](distribution-filter.json).
- [Legacy long-path extraction](attempt-4-long-path.json): hash-checked NSIS build overlay uses Windows built-in tar; [380-character probe](windows-extractor.json), [template contract](installer-template.json). Original installed upstream files remain untouched.
- [Long-path uninstall residue](attempt-5-uninstall-long-path.json): bundled Node removes only the validated sibling runtime payload before standard shallow removal. Real-path, product-marker and version checks reject unrelated targets. User data/projects are retained.

Security references: [OmniRoute ACP advisory](https://github.com/advisories/GHSA-hf57-cqmx-p4gr), [Windows Next advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [withdrawn braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security). Audit results are time-specific, not a full distribution security certification.

Remaining release gates: independent clean Windows VM (Sandbox absent here), signing, upgrade/rollback matrix, manual native-picker/accessibility review and distribution/license review. Installer is about 980 MB; payload about 2.6 GB. Windows built-in tar is required. Atomic upgrade mode is unchanged and unverified. Earlier Gemini → Cohere evidence keeps its original scope; unsupported routes remain excluded. Ephemeral signature/provenance state can prevent old-session continuation after restart. Permissions are not an OS sandbox.
