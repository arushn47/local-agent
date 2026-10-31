# LocalAgent security and release scope

Security review, 2026-10-24. This is a local Windows alpha, not an independently audited sandbox. [Release gates](RELEASE.md) remain open.

## Boundaries

- Desktop main owns project selection, process supervision and native Chromium-session authentication. Its renderer is sandboxed, has context isolation and no Node integration. A small preload validates the owned top frame before each native capability. Popups, webviews, permissions and non-owned network requests are blocked.
- Desktop HTTP pages cannot mint API cookies. The native main process injects the runtime's random session cookie into its private Chromium session; status/IPC/disk diagnostics do not expose it. API requests still require exact Host/origin, cookie, bounded JSON and explicit mutation header. Development web mode retains local browser bootstrap and is not a hardened multi-user service. Do not expose either mode to LAN/public interfaces.
- Preview uses a separate listener, opaque sandbox and unguessable capability, with no platform cookies/preload or provider credentials. File containment/link checks, asset/export bounds, CSP and native request restrictions block platform APIs, external requests, popups and arbitrary server execution. Static validation checks syntax without executing project scripts. Browser probes use isolated credential-free profiles and owned lifetimes.
- OpenCode remains the sole agent/tool/permission authority; permissioned shell commands execute as the Windows user and are **not** OS isolation. Only open projects/code you trust sufficiently to approve their commands. Free-only admission, fixed provider egress, context budgets, progress limits and ephemeral Gemini provenance/signatures remain in the existing dispatch path. No failover route is inferred from packaging success.
- DPAPI protects credentials for the current Windows account. It does not protect against malware running as that same account. Native environment allowlists avoid importing development `.env`/inherited provider secrets. Saved keys are never returned to the UI or exports.

## Package hardening

Run-as-Node and Node-options environment injection are disabled; cookie encryption, ASAR-only loading and embedded ASAR integrity are enabled. Disabling file-protocol privileges broke the existing ASAR startup page in a single-variable control, so that fuse stays at its compatible upstream default. Main-process CLI inspection remains at the upstream default for the existing Playwright Electron acceptance mechanism; no debugger endpoint is enabled during a normal launch. Additional release hardening should replace the acceptance attachment mechanism before disabling that fuse. ASAR integrity protects the shell, not unsigned external runtime resources; signing/distribution trust is still required.

Routing/gateway logs have bounded current/previous generations and do not intentionally record raw keys, reasoning or signatures. Upstream data stores and agent conversations have separate lifetimes; this change does not silently delete user history. A local pre-runtime shell failure records only a bounded operation error. Inspect/sanitize logs and project content before sharing; diagnostic output is untrusted data.

## Dependency review

The targeted KaTeX override removes the previously reported seven low findings; both complete and production npm audits now report zero. This does not prove absence of native, Chromium, bundled-code, operational or unreported flaws. Electron 42.11.18 matches the latest same-major version returned by the official release metadata on this review; native versions remain pinned and must be checked again for a public release. The unchanged-source gateway is rebuilt against the patched graph and compatibility-tested before adoption. Preserve Node, Electron/Chromium, OpenCode and transitive notices.

License inventory and missing declarations are release gates, especially Spline's undeclared runtime and native/embedded obligations. No proprietary dependency is implicitly cleared because it is on npm. Do not claim open-source distribution compliance from package metadata alone.

## Updates and reporting

Updates remain manual. Signed-manifest verification is preparation only and has no download/execution path. Never trust an unsigned manifest, unsigned installer or hash as a substitute for a publisher signature. No public update host, signing identity, automatic release or paid service is configured.

A public security contact/repository has not been chosen. Until it is, preserve a private minimal reproduction and sanitized error/version details; do not publish keys, signatures, raw conversations, profiles or exploit-sensitive project data. [Troubleshooting](TROUBLESHOOTING.md).
