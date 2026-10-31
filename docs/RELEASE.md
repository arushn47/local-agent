# Windows release operations

0.5.0 and 0.5.1 are approved development milestones. 0.5.2 continues release-blocker stabilization; public release remains blocked. See [release decisions](RELEASE_DECISIONS.md), [license review](LICENSE_REVIEW.md) and [current evidence](../validation/phase52/README.md). All inference safeguards and directed route eligibility remain unchanged. No paid service is configured.

## Build and install

Use pinned Node 24.22.1 on Windows x64. Build UI, prepare the production stage, then run `scripts/build-desktop.mjs installer`. Fresh dependency installs require the documented gateway fetch/build/adopt security recipe before staging; do not distribute the original npm gateway build. Level-6 ZIP compression and distribution-only platform omissions retain notices and the selected engine. Approved 0.3/0.4 artifacts remain unchanged.

For the reduced 0.5.2 graph, run `node scripts/prepare-backend-candidate.mjs .localagent/<new-candidate>/runtime` after gateway adoption. It regenerates seeds from verified source/build traces and refuses existing destinations. Run `node scripts/verify-backend-candidate.mjs` to obtain containment/tool/history/cooldown proof for that candidate; then `node scripts/prepare-desktop.mjs --backend-runtime .localagent/<new-candidate>/runtime`. Proof binds versions, lock graph and exact dependency bytes. Review optional unresolved references and repeat packaged checks; this is not blanket support for every OmniRoute endpoint. Next still requires React peers. Keep source/object compliance materials separate from the installer until reviewed; current source archives are incomplete evidence, not a cleared source offer.

Installer prerequisites: Windows x64 with built-in tar.exe, Windows PowerShell and sufficient disk space for the extracted candidate plus the previous version. No global Node/npm/OpenCode/browser is needed to run the desktop app. Developer test drivers still require this repository's tools.

Close LocalAgent before upgrading. Install into the existing directory. The new installer stages in `<installation>.stage`, validates Node/OpenCode versions, SQLite ABI and required files, then renames the previous directory to `<installation>.rollback` before activating the candidate. It does not modify projects or the user-data directory. A validation/extraction failure leaves the prior app; an activation failure restores it. An interrupted rename can leave the previous app in the rollback folder. Installer shortcuts/registry handling remains upstream; the uninstall-before-extraction section is a hash-pinned LocalAgent overlay.

## Recovery and rollback

The 2026-10-29 installer-only recovery revision replaces the generic retained-folder error with state-specific explanations and safe preservation/recovery choices. It never deletes retained material. Completed-install backups are not automatically rolled back. Silent recovery defaults to cancel; invalid journals or foreign registration require review. A dated `<installation>.recovery-*` folder contains preserved files and its move manifest. See [actual D: repair and verification limits](../validation/phase52-install-fix/README.md). Enter the full destination, e.g. `D:\LocalAgent`; the final automatic directory-display change is compiled but awaits visual verification.

Keep the rollback directory until the candidate works. Do not put projects in an installation, stage or rollback folder. Never delete `%APPDATA%/LocalAgent` to repair an update: it contains settings, conversations and protected credentials. DPAPI credentials belong to the same Windows account and should not be copied to another user/VM as portable secrets.

Close every LocalAgent process. Copy `resources/node/node.exe` and both `resources/upgrade.cjs` and `resources/registration.cjs` from the new installation to a temporary directory **outside** the installation. From that directory run `node.exe upgrade.cjs recover "C:\full\installation\path"`. The helper validates product markers and sibling paths, restores the previous application, and retains the failed candidate as `.stage`. Launch the restored LocalAgent.exe. The 0.5.1 helper restores the exact prior values of only LocalAgent's two per-user registry keys from its format-2 transaction journal, verifies ownership, and retries a pending registry restoration idempotently. It does not repair arbitrary registry damage or roll back user-data schema migrations; no data migration is introduced. Legacy format-1 journals cannot provide automatic registry restoration; keep the legacy payload and repair registration with that version's installer after reviewing retained directories. Old versions may reject newer session metadata and must fail closed.

Windows sharing denials (EPERM/EBUSY) retry directory moves for at most two seconds, without changing permissions or overwriting a destination. Persistent locks fail with payloads/journal retained; close the locking application and use recovery. Other errors fail immediately.

A retained stage/rollback prevents another install from overwriting recovery material. After confirming which version to keep, remove only the reviewed sibling directory for that installation. Do not use recursive cleanup against a computed or unverified path. For format-2 transactions, failure callbacks request recovery automatically and an interrupted activation is recovered on installer retry before any overwrite. Retained candidate directories still require review before continuing. Shortcuts remain upstream-managed and may require reinstall repair. Real power loss, disk-full and quarantine remain distinct gates from controlled process interruption.

## Signing and updates

Unsigned builds are explicitly development candidates. Do not disable Windows reputation checks or install a self-signed root certificate to disguise them as trusted releases. `--signed` requires `LOCALAGENT_SIGNING_CERT_SHA1` (an explicit Windows certificate-store thumbprint) and `LOCALAGENT_SIGNING_PUBLISHER`; the build then requires code signing and SHA-256 signatures. No certificate discovery, purchase, cloud signing account or secret is assumed.

There is no automatic updater or unsigned download-and-execute path. `src/release-manifest.mjs` prepares offline Ed25519 envelope verification: pinned trust, exact signed payload, expiry, platform/channel, size/hash, HTTPS and newer-version admission. It is not wired to network or execution. A public signing key, private-key custody, publisher identity, immutable HTTPS release host, signed installer verification and reviewed recovery policy are required before enabling updates. A hash on the same download page is an integrity check, not publisher authentication. GitHub Releases may supply hosting if the owner selects a repository; nothing has been published.

Free OSS signing through SignPath Foundation may be possible only after its licensing, ownership, release and build-review requirements are met. Eligibility is not guaranteed. Choose LocalAgent's own license and resolve bundled third-party license questions first; do not commit to paid certificates/services without owner approval. [SignPath terms](https://signpath.org/terms), [Electron signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing), [builder update signature checks](https://www.electron.build/docs/features/security/).

## Clean Windows acceptance

A fresh profile or restricted PATH on the development host is **not** a clean VM. This host has Windows 11 Home, hypervisor reported present but no detected guest-management tooling/Windows Sandbox. Do not enable virtualization, reboot, download an OS image, accept a new OS license, or rent a VM implicitly.

On an owner-provided clean Windows x64 VM: record OS/build and installed-app inventory; copy only the installer and its independently verified identity; disconnect the development workspace/shared folders; install as a standard user; launch from Start; check first-use, native folder picker, project opening, provider setup/removal, static preview/inspection/export, restart/crash recovery, uninstall and data preservation. Confirm no Node/npm/Git/Playwright/browser was preinstalled. The agent's ordinary tool commands may still need project-specific tools; the app does not promise every project toolchain. Repeat real 0.3→0.5 and 0.4→0.5 upgrades with same-user credentials and settings, and controlled locked-file/extraction failure. Preserve a VM snapshot for each case. No live provider task is required to repeat deterministic distribution checks.

## Public-release gates

- Independent clean VM and supported Windows-version coverage.
- Genuine keyboard/screen-reader review (Narrator/NVDA), including permissions, native dialogs and long conversations; automated axe/tree checks are partial evidence.
- Own project license/name and complete dependency/native/asset compliance, including missing declarations, LGPL notices/source/relinking obligations and upstream embedded binaries.
- Signing identity, hosted release ownership, verified update publishing and recovery policy.
- Broader failure matrix: power loss, registry failure, disk full, antivirus/quarantine, locked runtime, and upgrade rollback across future data migrations.

Do not label this candidate production-ready while those gates remain open.
