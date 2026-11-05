# Windows desktop alpha

LocalAgent 0.5.4 is an **unsigned internal candidate, not a cleared public release**. It uses Electron 42.11.18, bundled Node 24.22.1, OpenCode 1.18.31 and security-rebuilt OmniRoute 3.8.52 / Next 16.4.3. No global Node, OpenCode, OmniRoute or separate browser installation is required to run it. [Current feature matrix, actual validation and limits](MVP-CANDIDATE.md).

## Install and launch

For the new internal build, keep the entire `release/desktop-0.5.4/` candidate folder and run `Launch-Internal.cmd`. It selects `%LOCALAPPDATA%/LocalAgent-Internal-0.5.4` instead of the installed app's profile. The underlying `win-unpacked/LocalAgent.exe` uses normal application data if launched directly. Do not copy individual files into the installed app. The earlier 0.5.2 installer remains preserved and no 0.5.4 installer/upgrade acceptance is claimed. [Historical installer evidence](../validation/phase52/README.md).

Startup shows credential/gateway/engine progress. **Choose folder…** or **Ctrl+O** opens a native project picker. Configure free-tier keys in Connections, describe a task, approve individual edits/commands, then review Changes, Tests and Routing. The Browser inspector supports static relative HTML/CSS/JavaScript. Workflows can be saved/edited; production Start/Resume/Retry stays gated pending live acceptance. [Builder workflow](BUILDER.md).

Closing the app stops owned services. A runtime crash exposes an explicit restart; drafts survive, and no prompt is automatically replayed. Old Gemini tool history can fail closed after signature expiry/restart. Agent command permissions are not OS sandboxing.

Data defaults to `%APPDATA%/LocalAgent/`. Credentials use Windows current-user DPAPI; saved keys never return to the renderer. Development .env/inherited keys are not imported. Uninstall preserves user data and external projects. [Recovery/upgrades](RELEASE.md), [troubleshooting](TROUBLESHOOTING.md), [security boundaries](SECURITY.md).

Native **Help → Local help and recovery…** reveals bundled documentation. RELEASE/TROUBLESHOOTING/SECURITY/RELEASE-NOTES describe 0.5; bundled DESKTOP also retains the earlier Phase 4 build record. This source guide tracks the current build recipe and final evidence.

## Reproduce

Build on Windows x64 with Node 24 and npm; the native ABI is checked against bundled Node. Fresh installs require the gateway security rebuild, not just its published Next bundle:

```powershell
npm ci --no-audit --no-fund
npm run desktop:node
npm run upstream:fetch
npm run gateway:fetch
npm run gateway:build
npm run gateway:adopt
npm run build:ui
npm run desktop:icon
npm run desktop:prepare
npm run desktop:installer
```

Icon/build acceptance tooling needs the documented Playwright browser on the development machine; desktop preview inspection itself reuses bundled Electron. Official source blobs and runtime checksums are verified. The gateway uses its existing backend-only assembly/layout helper; same-drive temporary output avoids Windows cross-volume junction privilege failures. No upstream source patch is introduced.

The stage copies the locked production graph and selected native artifacts, excluding declarations/maps/tests/non-license docs, active package env files, duplicate OpenCode executables and non-Windows-x64 ONNX binaries. Existing licenses/notices remain. The current UI ships English Electron locale only. The shell is thin ASAR; Node runtimes stay separate for their native ABI.

`desktop:pack` creates the versioned unpacked app. `node scripts/build-desktop.mjs installer --prepackaged` archives a verified payload with yazl/ZIP level 6 and compiles NSIS. Installer-only changes can use `--prepackaged --reuse-archive` only while payload is unchanged and its archive hash matches. Windows tar ZIP64 extraction is verified; the old NSIS ZIP plugin is not used. Byte-identical cross-machine builds are not claimed.

Hash-pinned NSIS overlays stage and validate before directory activation, retain the prior payload, remove only the obsolete uninstall chain, and preserve upstream registration/shortcuts/uninstaller generation. Compiler warnings remain errors. The uninstall hook validates exact sibling runtime, real path, identity and Node version before long-path cleanup; user data/projects are outside that payload. Read [release operations](RELEASE.md) before another upgrade or rollback.

## Acceptance and limitations

```powershell
npm test
node scripts/verify-builder.mjs --packaged
node scripts/verify-desktop-install.mjs --builder --accessibility
node scripts/verify-upgrade.mjs --from=0.3.0
node scripts/verify-upgrade.mjs --from=0.4.0
```

Installer tests write app-specific registration/shortcuts: use a disposable host with no registered LocalAgent installation. `--coding` is explicitly quota-consuming and unnecessary for deterministic release checks. Legacy verify:desktop / verify:desktop:runtime scripts retain Phase 3 fixtures/evidence; the commands above are current.

77 safeguard regressions pass. [Phase 5.2 evidence](../validation/phase52/README.md) records packaged/installed builder, accessibility and upgrade/recovery checks with their exact verified scope. No new live inference or provider route was added. Earlier approved installers remain preserved. Clean-machine and human screen-reader acceptance remain release gates.

Clean-VM acceptance, human screen-reader/native-dialog review, license/compliance clearance, signing/publishing ownership and broader failure coverage remain public-release gates. This Windows 11 Home development host has no available clean VM. Restricted PATH is not clean-machine validation. The [release guide](RELEASE.md) gives the required matrix and signing/update preparation; no paid service, certificate or automatic updater is configured.
