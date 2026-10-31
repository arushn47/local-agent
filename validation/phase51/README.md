# Phase 5.1 stabilization evidence

**Current-host checks pass; public release is not cleared.** [Machine-readable summary](final-summary.json). No external inference, paid service, new provider route or product feature.

Installer: `release/desktop-0.5.1/LocalAgent-Setup-0.5.1-x64.exe`, **673,721,007 bytes**, SHA-256 **a1ffe81ba54f155e05da2ecc9daa5f742f9757f5a37a4e5d4d2f5fff225bd055**, unsigned. Previous 0.5.0: 673,675,277 bytes; 0.4: 979,689,371 bytes. Phase 5.1 adds 45,730 bytes (not a new size-reduction claim). Launch the installer, then LocalAgent from Start; keep all files if using win-unpacked.

## Verified results

| Evidence | Scope/result |
|---|---|
| [Regressions](regressions.txt) | 76/76 pass |
| [Production audit](audit-production.json), [full audit](audit-all.json) | Zero npm findings; not complete native/embedded security coverage |
| [Payload](payload-security.json) | 65,534 files; no exact known-key matches, active env/npmrc or links. Not a complete secret-pattern scanner |
| [Installed workflow](installer.json), [builder](packaged-fixture.json) | Actual install → builder/browser interaction/diagnostics/isolation/export → crash/restart → uninstall and registry cleanup |
| [Accessibility](accessibility.json) | Twelve axe views, zero automated violations; keyboard/focus/AX tree, split-preview action, forced colors and 200% zoom. Remaining incomplete/human checks documented |
| [0.3 matrix](upgrade-0.3.0.json), [0.4 matrix](upgrade-0.4.0.json), [0.5 matrix](upgrade-0.5.0.json) | Real upgrades and rollback, exact registry restoration, projects/settings/draft/unchanged decryptable DPAPI placeholder, complete uninstall and data retention |
| [Registry fixture](registry-recovery.json) | Actual HKCU typed values, interruption after rename, pending-registry retry/idempotence and real held-file sharing recovery (1,395ms). Only two owned keys, cleaned afterward |
| [Gateway first-use](gateway-compatibility.json) | Optimized gateway + loopback 429/tool/history/cooldown; zero real-provider requests. No new real failover claim |
| [Integrity](final-integrity.json), [packaged helper](final-package-check.json) | Approved old installers unchanged; final candidate identity matches; packaged recovery helper equals tested source |

0.4 tests include an actually locked executable safely rejecting an update. 0.5 tests include external termination during extraction (prior app/registration unchanged) and a separately compiled, private installer-only fixture that fails **after a verified registry commit**. Its automatic callback restores old files/registration; marker records commit exit 0. This is controlled fault evidence, not real power-loss proof. The normal candidate contains no injected failure. Credentials used in the matrix are offline placeholders with free-tier admission unset, and routing plans remained empty.

## Performance and memory

[Stage/byte summary](performance-summary.json), individual `profile-*.json`, [soak](profile-soak.json), [idle UI](idle-ui.json). Fresh app profiles; **OS cache/load uncontrolled, not independent cold-VM benchmarks**.

- Original runtime ready: 55,241ms first observation / 11,132ms cached repeat. Optimized: 6,749 / 6,378ms. Original gateway readiness alone: 50,293ms; optimized 2,660–2,772ms. Credentials 28–49ms, configuration 1.5–3.9s and engine 1.2–1.7s.
- Final matrix: 0.3 51.0s → 20.2s, 0.4 52.2s → 19.8s, 0.5 46.7s → 19.8s. Cached installed accessibility launch: 8.4s. Other mixed-load observations were slower; no guaranteed cold-start SLA.
- Gateway post-workload private bytes: original 316–318 MB → 211–213 MB (~33% less). Engine peaked ~1,227 MiB and settled ~817 MiB over the two-minute fixture; high engine memory and long-session behavior remain open. Private bytes differ from RSS and total physical RAM.
- Ten-second idle UI sample: zero session reads. Required worker/gateway/engine are singular; recorded packaged shutdown checkpoints show owned processes exited. No universal leak-freedom claim.

The documented [Next preload option](https://nextjs.org/docs/app/guides/memory-usage) is applied only to generated, version/template-checked configuration; [hashes](gateway-tuning.json). No upstream source or provider/security transform was patched.

## Failed attempts and limits

[First 0.4 rollback failure](upgrade-0.4.0-first-attempt.json) hit EPERM. [Shutdown/rename probes](shutdown-probe.json) found no lingering owned processes. Bounded EPERM/EBUSY directory moves were added and tested with a real held file, then all final matrices passed. The original handle owner was not identified; no antivirus attribution or permission bypass.

[Initial 0.5 baseline failure](upgrade-0.5.0-initial-baseline-failure.json): original immutable 0.5.0 installer returned 1 after `prepared`; payload validation had passed. Exact failing filesystem operation was not captured. One bounded attempt succeeded unchanged, followed by the complete passing matrix. This does not establish reliability of the old fresh installer. Prior pre-final 0.5.1 hashes/reports are historical and are not the final artifact's acceptance evidence.

Independent Windows guest unavailable; [environment](windows-environment.json) reports Home build 26300, hypervisor present, no detected guest-management commands. No clean-machine verification. Human Narrator/NVDA/native dialogs/OS scaling, incomplete contrast/decorative checks, long-session memory, real power loss/disk-full/quarantine/registry-write denial remain open. The owned starter iframe was separately audited; arbitrary user sites are not certified.

[License review](../../docs/LICENSE_REVIEW.md): Spline runtime permission, native LGPL/Bun/JSC exact source/object/relinking and other embedded obligations block publication. Giscus/ONNX version-proven notices were bundled; metadata inventory alone is not clearance. [Owner decisions](../../docs/RELEASE_DECISIONS.md), [release/recovery](../../docs/RELEASE.md). No signing certificate, release key, purchase, public host or updater execution was enabled.
