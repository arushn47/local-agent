# Local website builder

Phase 4 adds an integrated **static HTML/CSS/JavaScript** workflow to the existing desktop coding workspace. It uses OpenCode sessions/tools and the same guarded OmniRoute route; there is no second coding engine.

## Use it

1. Open LocalAgent, connect a confirmed-free provider in **Connections**, and choose a project folder.
2. Ask the agent for `index.html` with relative CSS/module-script URLs and tests. Approve only the intended file/command permissions. For an empty folder, **Preview → Add starter** is also available.
3. Select **Preview → Start isolated preview**. File changes automatically reload it. Desktop, tablet and mobile buttons change the actual CSS viewport, scaled to fit the panel.
4. **Validate static build** checks the entry point and JavaScript syntax. **Inspect with Playwright** captures the current viewport and reports console errors, failed resources and horizontal overflow. Changed revisions mark previous results stale.
5. Review the console and screenshot. **Refine with these findings** fills a draft in the current conversation; review it and describe the intended change before starting the agent. **Changes** and **Tests** retain real engine diffs and command output.
6. **Export source** downloads a filtered ZIP. **Stop preview** revokes its URL; app shutdown stops the listener and owned browser/validator processes.

Desktop inspection reuses bundled Electron. No global browser, Node, model download, paid evaluator or separate terminal is needed. Development web mode needs an existing Chromium executable via `PLAYWRIGHT_CHROMIUM_EXECUTABLE` or the matching Playwright cache; no automatic download occurs.

Desktop runtime recovery reloads the page when the preview origin changes, restoring saved project/session/draft state and refreshing its strict framing policy. Restart the preview explicitly; tasks are never replayed. In development web mode, manually reload the browser page after restarting its runtime.

## Boundaries

- Preview content runs at a separate localhost origin with a per-start capability and opaque `allow-scripts` sandbox. It has no platform cookies, native bridge or Node. CSP blocks network connections, nested frames, workers, forms, popups and external assets. The main UI separately enforces framing and authenticated API access.
- Only bounded, allowlisted project assets are served. Dot/secret/credential/key/token paths, dependency trees, links and traversal are rejected. Export adds JSON/Markdown and applies the same path/link limits (512 files, 20 MB; 5 MB/file). This cannot identify secrets manually embedded in ordinary source files: inspect source before sharing exports.
- Preview startup never runs package scripts. Static validation uses bounded `node --check` through stdin; it does not execute code. Agent test/build/install commands still require existing OpenCode permissions and **are not OS sandboxed**.
- Initial support excludes framework dev servers/HMR, npm install/build automation, server-side apps, remote assets/API access, service workers and deployment. Root-absolute asset URLs are unsupported; use relative URLs. Syntax validation is not a framework/type/build or accessibility audit.
- Console and project content are untrusted. Diagnostics are bounded and never automatically submitted as instructions. Screenshot inspection is local and deterministic; no screenshot is automatically sent to a model.
- On this Windows build, Playwright's child-frame bounding boxes ignore CSS scaling. Verification maps normal mouse input through the rendered iframe rectangle; the product uses standard browser input without a custom event bridge. Manual accessibility/native picker coverage remains a release gate.

## Development and acceptance

```powershell
npm run build:ui
$env:LOCALAGENT_NODE_EXE = "$PWD\.localagent\desktop-node\node.exe"
.\node_modules\electron\dist\electron.exe apps\desktop
node scripts/verify-builder.mjs --packaged
```

`--coding` additionally authorizes two bounded prompts using the locally configured confirmed-free Gemini key, in a fresh disposable project and isolated profile. It verifies same-session generation/refinement and two agent-run test commands; do not rerun it for screenshot-only changes. No new provider failover routes are tested or enabled here. Evidence is in [validation/phase4](../validation/phase4/README.md).
