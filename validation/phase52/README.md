# Phase 5.2 evidence — 0.5.2 development candidate

2026-10-28. **Public release remains blocked.** No publication, purchase, automatic updates, own-license selection or new inference route. This report separates current-host results from unverified gates.

## Artifact and backend distribution

- [Installer identity](artifact.json): `release/desktop-0.5.2/LocalAgent-Setup-0.5.2-x64.exe`, **528,384,756 bytes**, unsigned. SHA-256 `10c41c2110e74bbfd11f7abd8c564deb82819d15cbcd218c560db5c4534830f7`.
- Down **145,336,251 bytes / 21.57%** from 0.5.1's 673,721,007 bytes. Frozen [archive](archive.json): 19,215 files, 1,503,850,819 uncompressed bytes; previous payload had 65,534 files. All four accepted older installer hashes remain unchanged.
- [Backend closure](backend-closure.json): 278 selected external packages; [staged license inventory](licenses.json) counts 296 manifests including nested examples/compiled packages, versus 1,217 previously. These counts have different scopes.
- Reuses upstream's backend-only build. Combines file traces, hash-verified server externals/native-worker extras, literal runtime references and installed dependency/optional/peer closure. Preserves generated server/worker code and the existing CLI-token authentication helper. No dashboard stubs invented by LocalAgent.
- Spline, Giscus, Lobe UI/icons, Ant Design and Monaco external packages excluded. Next's React/react-dom framework peers remain required; LocalAgent UI remains Solid. A Lobe/Ant Design name in generated Next optimization configuration is not a runtime import or package. Optional upstream features are not universally certified.
- [Strict isolated proof](backend-proof.json): 1,032 observed module files, zero imports escaping to development dependencies; [tool/history/cooldown fixture](gateway-compatibility.json) passes using loopback only. [Candidate, stage and packaged dependency hashes](backend-stage.json) match. Staging rejects stale proof, wrong versions/lock graph, changed bytes, missing runtime packages and excluded UI packages.

## Functional, security and distribution checks

- **77/77 regressions**: [final log](regression-final.log). Context/signature, authentication, free-only admission, fixed egress and existing routing restrictions remain unchanged.
- [Production npm audit](npm-audit-production.json) and [full audit](npm-audit-full.json): zero findings. Native/embedded components are outside complete npm advisory coverage; this is not a complete security audit.
- [Frozen payload scan](payload-security.json): no exact known-secret matches, active env/npmrc files or links across 19,215 files. Scope is known values, not a comprehensive secret-pattern certification.
- Actual installer fresh install, installed builder/security/preview/refinement-draft/export, intentional engine crash/restart and complete uninstall pass. Test registration is removed. [Installed workflow](packaged-fixture.json), [installation log](installed.log).
- [Serial distribution matrix](distribution.json) passes all four versions: [0.3](upgrade-0.3.0.json), [0.4](upgrade-0.4.0.json), [0.5.0](upgrade-0.5.0.json) and [0.5.1](upgrade-0.5.1.json) to 0.5.2 and back. Each retains project/settings/draft and the same decryptable DPAPI placeholder ciphertext, restores exact registration and completes uninstall cleanup. This passing distribution matrix does not clear the failed long-soak gate.
- 0.5.1 boundary additionally tests real held-file rejection, extraction interruption, incomplete-candidate rejection and a private post-registration failure installer. Its real registration commit must return zero before failure injection; automatic recovery restores old files/registration. Production installer is unchanged. [Native registry/sharing check](registry-recovery.json) passes.
- No external inference calls; inference cost **$0**. Loopback fixture failover is not new live-provider or coding-continuity evidence. Historical real coding remains in Phase 4.

## Performance and stability limits

[Machine-readable measurements](summary.json). All launches use the current Windows host with uncontrolled file caches/competing load. Fresh application profiles and restricted PATH are not true cold or clean-machine tests.

- Installed accessibility launch: **6,795 ms**. Fresh-upgrade launch timings are recorded per matrix; no additional Phase 5.2 startup improvement is established against 0.5.1. A loaded source-runtime observation took 28.7 seconds.
- [31-minute session/static-build baseline](profile-baseline.json): 30 samples, final engine **703 MiB private / 391 MiB resident**. Last 15 samples: 686.4–703.7 MiB private, net -0.7 MiB. This limited workload shows no sustained upward trend; high memory and long coding/large-repository behavior remain open.
- [Short Bun low-memory pilot](profile-smol-pilot.json) did not show convincing improvement. No production flag, engine replacement or speculative upstream change was adopted.
- **Long packaged UI soaks did not pass.** [First sustained attempt](soak/failed-round17.json) completed 17 cycles then timed out waiting for refresh. [Foreground attempt](foreground-soak/packaged-fixture.json) completed 16 cycles then reported the browser closed. Runtime shutdown was recorded. The scoped [Windows event query](windows-app-exit-events.json) succeeded and found no matching native crash report; closure cause is still unestablished.
- Hide/show did not exercise Chromium's hidden state in this environment; it cannot explain the previous failure. Foreground activation did not establish a complete soak. Do not turn failed attempts into a passing stability claim or repeatedly restart them.
- [Installed renderer probe](packaged-fixture.json) stores numerical forced-GC/DOM counters only, not heap contents. A small before/after difference is not proof of a leak or leak freedom. Additional packaged checks, when present, have separate provenance below.
- [Repeated packaged renderer probe](renderer-probe/packaged-fixture.json) passes: after warm-up and another 20 navigation cycles, documents remain 2, DOM nodes 793 and listeners 33; retained JS heap changes about 57 KiB in the second batch. No growing DOM/listener count was observed across those two samples. This does not establish long-session leak freedom or reduce the separate Bun engine's memory.
- [Final cleanup](process-cleanup.json): 27 tracked PIDs, no original live test processes; creation times distinguish PID reuse. Upgrade checkpoints also report all owned processes exited. Scope is tracked tests, not every host process.
- Initial concurrent screenshot timeout is retained in [builder log](builder.log); the early ambiguous frame/comment probe and unsupported visibility probe are retained in the soak folders. Later short installed acceptance passes do not erase long-run failures.

## Accessibility and independent Windows

[Installed accessibility](accessibility.json): **13 views, zero automated violations**, keyboard/focus/modal/AX-tree, reduced motion/transparency, higher contrast, forced colors and 200% zoom checks pass. `color-contrast`/`frame-tested` incomplete items require review; the owned starter iframe is independently audited. Any extended WCAG 2.2/400% packaged result is stored separately in `extended-a11y/`, not relabelled as the installed 13-view run.

[Extended packaged audit](extended-a11y/accessibility.json) also passes **14 views with zero automated violations**, adding WCAG 2.2 AA tags and 400% reflow/zoom. The same incomplete categories remain. [Workspace screenshot](extended-a11y/release-workspace.png), [400% screenshot](extended-a11y/accessibility-zoom400.png). These are automated current-host checks, not a WCAG certification.

Human Narrator/NVDA announcements, native folder dialogs, OS scaling and long keyboard sessions remain unverified. Automated tree/emulation evidence is not human screen-reader acceptance.

[Read-only Windows inventory](windows-environment.json): Home build 26300, hypervisor present; no verified independent guest or detected guest-management command. No virtualization software/configuration change, OS-image download or paid service was initiated. Preferred option is an owner-provided licensed spare device/guest. Evaluation images require terms/environment approval. Hosted Windows CI includes development tools and is supplemental, not clean-machine proof. The old Microsoft developer-VM URL redirects to a generic development guide.

## Compliance and owner decisions

[Engineering compliance inventory](compliance.json), [review](../../docs/LICENSE_REVIEW.md), [decisions](../../docs/RELEASE_DECISIONS.md). Notices and metadata do not constitute legal clearance.

- Seven exact-revision source archives were acquired and indexed locally: OpenCode, Bun, TinyCC, libvips, Sharp, sharp-libvips and native Windows build recipes. Hashes/URLs are recorded; archives remain outside the installer and are not a complete cleared source offer.
- Engine reports Bun **1.3.14+0d9b296af**. Exact source defaults identify WebKit `5488984d20e0dbfe4be2c3ba8fb18eb81a5e0e8b` and TinyCC `12882eee073cfe5c7621bcfadf679e1372d4537b`; matching notices/build pins retained. Original build overrides and full source/object/relinking materials are unverified. WebKit archive endpoint returned **422: Content creation is blocked**; exact commit and JSC notice were independently fetched.
- wreq Windows binding exactly matches upstream manifest SHA-256. [Main libvips DLL](sharp-native-match.json) exactly matches the official 8.18.7 asset and its published SHA-256. Sharp's C++ DLL is separately built by its pinned binding recipe, not expected to equal the removed upstream C++ DLL.
- Sharp's aggregate LGPL-3 declaration spans additional libraries; the base libvips LGPL-2.1 notice alone does not settle it. Additional version-matched notice table/build recipes/native LICENSE were acquired after payload freeze and are held in `.localagent/compliance-review`; they are not silently claimed to be packaged. Full transitive source/notices/build/replacement review remains open.
- Spline exclusion addresses the reduced artifact only; older installers are not retroactively cleared. Remaining embedded/native/MPL/notice obligations and owner license/name/publisher decisions block public distribution.

Owner decisions: choose own license/legal publisher/name/contacts and a competent redistribution review path; provide an independent licensed Windows environment or approve a specific setup/terms; choose signing identity/key custody and release hosting before any publication. No signing purchase, new trust key, license choice or updater activation was made.

Launch locally by running the installer, then **LocalAgent** from Start; or keep the complete `win-unpacked` folder and run its executable. No global runtime is needed for the app. [Launch/build](../../docs/DESKTOP.md), [recovery](../../docs/RELEASE.md). User projects may need their own development tools.
