> Historical investigation snapshot, superseded by [root ARCHITECTURE](../../ARCHITECTURE.md) and [current status](../STATUS.md). Statements below describe earlier checkpoints and are not current routing instructions.

> Context-budget implementation update: see docs/CONTEXT-DIAGNOSIS.md (or CONTEXT-DIAGNOSIS.md from docs). Automated checks pass; the latest bounded coding check was blocked by runtime startup timeout, so coding continuity and failover are still unverified. Coding routes now require verified models of at least 32K context; the earlier shared-8K description below records the previous checkpoint.

# Product architecture and next increments

## Implemented boundary

CLI/project client -> OpenCode -> authenticated OmniRoute -> LocalAgent cost guard -> Gemini / Groq / OpenRouter / local Ollama.

OpenCode retains coding tools, permissions, sessions, history, context compaction, CLI, and its existing server API. OmniRoute retains priority routing, request replay, connection management, cooldowns, and streaming. LocalAgent supplies provider onboarding, a conservative model catalog, a billing policy boundary, project launch configuration, and metadata-only diagnostics.

The first cloud integration uses OmniRoute's existing OpenAI-compatible provider nodes and the providers' documented compatible endpoints. This avoids an upstream fork and ensures all inference crosses the cost guard. Native Gemini integration would give more control over signatures and provider-specific features, but those need interoperability tests before replacing the common wire format. No thought signatures, tool results, or tool-call IDs are intentionally stripped by the cost guard.

No custom agent loop, coding editor, terminal implementation, or quota-retry engine has been added. A future web/desktop client should use [OpenCode's server API](https://opencode.ai/docs/server/) and [SDK](https://opencode.ai/docs/sdk/), which expose sessions, messages, files, events, and permission flows.

## Provider selection and cost

- Gemini: reviewed free-tier text-model allowlist, user-confirmed billing-disabled project, live model metadata validation. Pricing and generation availability can differ by account.
- Groq: reviewed chat-model allowlist, user-confirmed free-plan organization, live model/context validation. Real request/token quota headers are retained separately.
- OpenRouter: live model catalog, explicit :free identifier, zero values for every listed price dimension, client tools, and at least 8K context. Generation adds provider.max_price with zero caps. Restricted free models may still reject a valid key.
- Ollama: loopback endpoint only, installed tool-capable models, checked training context and configured num_ctx. Cloud-tagged Ollama models are excluded. No automatic weight downloads.

Automatic OpenRouter selection is currently conservative about price and context, not a calibrated coding-quality ranking. The first discovered models exposed a real approved-harness restriction. Operators can pin eligible models in localagent.config.json; do not spoof another application's attribution or change account privacy settings to bypass a restriction.

The generated OpenCode configuration enables only the LocalAgent provider and uses the same route for its small model, avoiding a secondary paid inference path. API keys and provider bases cannot be supplied by a generation request. Public provider hosts are fixed; redirects are rejected. The guard credential is distinct from real upstream credentials.

## Context and failure behavior

OpenCode owns the conversation. Each request carries its prior messages and tool results. OmniRoute retries eligible targets at request boundaries; the guard passes those structures through. Audit records retain hashes of tool-result content and IDs, not source code. A live switch with identical tool-result hashes can substantiate replay without retaining raw prompts.

An upstream stream interruption aborts the downstream response instead of manufacturing a completed response. Recovery from partial tool execution is not promised. Smaller fallback context windows remain a hard limit: all admitted routes currently advertise the same conservative 8K context to OpenCode. Local model quality is materially weaker than larger hosted coding models.

Quota observations are not quota guarantees. Retry-After and Groq request/token limits and reset headers are forwarded unchanged for OmniRoute to interpret. Their windows are not conflated. Missing values remain unknown. The product does not create multiple accounts, rotate identities to evade quotas, or burn requests to force exhaustion.

## Operational constraints before a public release

- Package and lock the currently external, pinned OpenCode/OmniRoute runtime dependencies; test installation and upgrades on Windows/macOS/Linux.
- Replace plaintext .env credential onboarding with OS keychain storage in a distributed desktop product.
- Add log rotation, crash recovery, stronger lifecycle/port collision checks, credential revocation UI, and provider model retirement handling.
- Extend tool/context compatibility tests across all providers, including reasoning models, compaction, cancellation, long sessions, and stream interruptions.
- A hosted edition needs authenticated users, tenant-separated routing credentials, isolated workspaces, and explicit retention policy. A loopback desktop architecture does not supply these.

## Efficient roadmap

1. Complete this local CLI foundation: provider health, free-only guards, diagnostics, and reproducible checks. Keep paid inference disabled.
2. Prove naturally occurring cross-provider coding continuity with real quotas/access failures; retain evidence and classify unobserved scenarios honestly. Add selected model health/quality scoring after measuring it.
3. Add a small onboarding/status interface over these modules and an OpenCode server client. Reuse the existing OpenCode web/desktop capabilities before building a new IDE.
4. Add the web builder as a project/template/preview workflow over the same agent session API. Run builds in isolated workspaces.
5. Evaluate hosting and optional paid-model sponsorship separately. Advertising revenue is speculative and cannot guarantee free upstream capacity.

## Primary references researched

- [OpenCode server](https://opencode.ai/docs/server/) and [SDK](https://opencode.ai/docs/sdk/).
- [OmniRoute source](https://github.com/cheaper-inference/OmniRoute), plus installed version 3.8.50 source: provider validation, compatible executor, combo resolution, keys, and resilience APIs.
- [Gemini compatible API](https://ai.google.dev/gemini-api/docs/openai), [pricing](https://ai.google.dev/gemini-api/docs/pricing), and [billing](https://ai.google.dev/gemini-api/docs/billing).
- [Groq models](https://console.groq.com/docs/models) and [rate limits](https://console.groq.com/docs/rate-limits).
- [OpenRouter provider price caps](https://openrouter.ai/docs/guides/routing/provider-selection#max-price) and [public model catalog](https://openrouter.ai/api/v1/models).
- [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).

Research and local API checks were performed on 23 October 2026, Asia/Kolkata. Free tiers, supported models, and account eligibility are dynamic. The application validates availability rather than relying solely on these notes.
