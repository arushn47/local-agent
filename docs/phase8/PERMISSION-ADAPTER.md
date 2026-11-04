# Native permission compatibility — 2026-11-05

OpenCode 1.18.31 supports the required native approval behavior without a binary patch or a second tool engine. LocalAgent must use permission rules alone.

Two legacy compatibility mechanisms caused the bypass:

1. `packages/opencode/src/session/prompt.ts` converts per-prompt tool booleans into session permission rules. A true flag becomes an unconditional allow and replaces existing session rules. LocalAgent supplied those flags after creating an ask-only session.
2. `packages/core/src/v1/config/agent.ts` normalizes agent tool booleans into permission entries before assigning explicit permission properties. Existing object-key positions remain in place. Mixing this map with a later wildcard deny moves the wildcard after specific entries; last-match evaluation then hides all tools. This explains why simply removing prompt flags appeared to break registration.

The official source manifest pins commit `014614d35b397775e5d397a490fc72368c894ec2`. Additional investigation files were fetched from that exact commit and checked against its Git blob hashes. No upstream source, executable, dependency or inference route changed.

`workflowAgents` now emits only permission rules, with wildcard deny first. `workflowStart` omits deprecated prompt tool flags. Before session creation, `verifyNativeRole` inspects the actual legacy `/agent` registry used by these calls and rejects weakened role rules. It does not infer enforcement merely from v2 registry presence. A rejected idle tool now produces `workflow_tool_error`; cancellation rejects retained approval requests.

The native verifier uses actual OpenCode → scoped workflow ingress → actual OmniRoute → authenticated guard → scripted local provider → native filesystem/shell tools. It checks that no mutation occurs while approval is pending, then exercises Allow once, Reject and cancellation for edit and bash. Results are retained locally under `validation/mvp/`; responses are deterministic and **no external model inference occurs**. This is permission compatibility evidence, not model-quality or live-provider acceptance.

Production workflow activation remains separately gated. Revalidate this adapter and all native permission cases whenever changing the OpenCode pin, SDK, role configuration or prompt/session API. Remove the legacy compatibility handling only after an upstream API migration has equivalent tool, permission, history, cancellation and guard evidence.
