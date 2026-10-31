# LocalAgent

A local-first AI coding workspace built on OpenCode and OmniRoute. An original Solid interface combines projects, provider onboarding, guarded coding tasks, changes/tests, routing and an integrated static website builder. Windows desktop alpha and local web workspace.

## Windows desktop

Run the **unsigned development candidate** `release/desktop-0.5.2/LocalAgent-Setup-0.5.2-x64.exe`, then open **LocalAgent** from Start. The per-user installer bundles Node, OpenCode, OmniRoute and preview inspection; no separate terminal or global runtime installation is required. Use **Choose folder…** or **Ctrl+O** to open a project, configure keys through Connections, and select **Preview**. Windows DPAPI encrypts saved credentials; development `.env` files are not imported.

The installer is **528.4 MB, 21.57% smaller than 0.5.1**. The portable executable is `release/desktop-0.5.2/win-unpacked/LocalAgent.exe`; keep the entire folder intact. [Launch/build](docs/DESKTOP.md), [release/recovery](docs/RELEASE.md), [troubleshooting](docs/TROUBLESHOOTING.md), [Phase 5.2 evidence](validation/phase52/README.md). All four accepted earlier installers remain unchanged. Public release is blocked by stability, clean-VM, human accessibility, licensing and signing/publishing gates.

Current-host verification: **77 regressions**, zero npm advisory findings, actual 0.5.2 install/builder/uninstall and thirteen-view automated accessibility, including transparency/contrast preferences, keyboard/focus, forced colors and 200% zoom. The 0.5.1 upgrade, registry rollback, protected-data preservation and controlled locked-file/interruption/post-registration failure cases pass. [Evidence](validation/phase52/README.md) records the exact legacy-version matrix and failures. No external inference or new failover route. [Owner decisions](docs/RELEASE_DECISIONS.md), [license blockers](docs/LICENSE_REVIEW.md).

The installed accessibility launch measured 6.8 seconds on this host; caches/load were uncontrolled and true cold-machine testing remains open. A 31-minute engine/session soak settled near 703 MiB private memory. Long packaged UI runs stopped after 17 and 16 cycles; neither is a passing stability test. See the evidence report for failures and limits. [Phase 4's coding proof](validation/phase4/README.md) remains historical. Static relative HTML/CSS/JavaScript is supported; framework servers/HMR and deployment remain deferred. [Builder guide](docs/BUILDER.md).

## Launch the workspace

Development requires Windows, Node 24–26 and npm. Pinned runtimes: OpenCode 1.18.31, OmniRoute 3.8.52 / patched Next 16.4.3; global runtime installs are unnecessary. The gateway source build is required after a fresh dependency install.

```powershell
npm ci --no-audit --no-fund
npm run gateway:fetch
npm run gateway:build
npm run gateway:adopt
npm run check:runtime
npm run build:ui
npm run ui
```

Keep the terminal open; visit **http://127.0.0.1:20140** once startup prints the workspace URL. Stop with Ctrl+C. First gateway startup can be slow; readiness is bounded. UI-owned ports: 20140 (browser), 20144 (authenticated engine), 20151 (gateway), 20152 (guard). State: ignored .localagent/workspace-runtime/.

1. Open **Connections**. Supply your key; confirm Gemini billing is disabled or Groq uses its free plan. Windows DPAPI encrypts UI-saved keys for the current account. Saved keys are never returned to the browser. Availability checks use metadata, not inference.
2. Open a project by its full directory path. Describe a small task, then approve individual edits/commands when prompted.
3. Review **Changes**, **Tests** and **Routing**. Stop tasks from the composer. Written-content snapshots are labelled when an upstream diff baseline is unavailable.

Ignored .env / .env.local remain supported for development; see [.env.example](.env.example). DPAPI does not remove these plaintext files. Disconnect overrides inherited/file credentials inside this workspace. Do not share runtime state or raw session exports. Non-Windows secure onboarding is not implemented.

## Verification and upstream reference

```powershell
npm test
npm run verify:ui:flows
npm run verify:ui
```

Tests/browser behavior fixtures make no model calls. verify:ui expects a running workspace, opens a disposable project and makes no inference by default. `node scripts/verify-workspace-ui.mjs --review-session` reviews the retained completed fixture; `--coding` explicitly runs a bounded real task and consumes provider quota. Playwright needs Chromium; set PLAYWRIGHT_CHROMIUM_EXECUTABLE for an existing executable or install its Chromium browser. [Phase 2 evidence](validation/phase2/README.md) includes screenshots.

Reproduce the unchanged upstream compatibility build separately:

```powershell
npm run upstream:fetch
npm run upstream:install
npm run upstream:build
npm run upstream:verify
npm run verify:upstream-ui
```

These use the pinned official Git manifest, verify blob hashes, install frozen Bun 1.3.14 dependencies and build/render without changing source. Downloads are required. Product launch uses its own built interface; the upstream browser smoke test disables inference.

## CLI and safeguards

The original CLI retains separate state/ports 20141/20142: npm start, npm run doctor, npm run status, and `npm run agent -- --project "PATH" --json "Fix the failing tests"`. Historical poc: commands are not product startup.

All inference crosses the authenticated guard: context/output limits, fixed egress, free-tier attestations, fresh zero-price OpenRouter admission/request caps, ephemeral Gemini signatures and bounded continuation provenance. Tasks have a 120-second deadline. BYOK does not prove free billing; quotas/resumption are not guaranteed. Only evidenced Gemini → Cohere forward continuation enters a qualifying plan. Phase 2 adds no failover proof.

This is a local alpha. The security rebuild passes compatibility checks; production audit currently reports seven low findings, no moderate/high/critical findings. Independent clean-VM testing, signing, upgrade coverage and a broader distribution review remain release gates. Agent permissions are not an OS sandbox. See [status](docs/STATUS.md) and [validation](docs/CROSS-PROVIDER-VALIDATION.md).

Guides: [PRD](PRD.md), [ARCHITECTURE](ARCHITECTURE.md), [RULES](RULES.md), [PHASES](PHASES.md), [DESIGN](DESIGN.md), [MEMORY](MEMORY.md). [Resource evaluation](docs/RESOURCE-EVALUATION.md) records choices; [notices](THIRD_PARTY_NOTICES.md) retain licenses.
