# LocalAgent product requirements

Status: development baseline, 2026-10-23. Implementation sequence: [PHASES.md](PHASES.md).

## Product and users

LocalAgent is an original, local-first AI coding platform combining a CLI, a desktop coding workspace, and eventually a web-app builder. It serves independent developers, learners, and people constrained by subscription costs or hardware. Users own their projects and credentials; no LocalAgent account or mandatory subscription is required for local use.

The differentiator is understandable, conservative routing across available free cloud models and local models: choose a compatible destination, preserve supported coding context, explain switches, and stop clearly when no safe route exists. Our onboarding, project workflows, routing controls, recovery experience, and builder make the product our own. OpenCode supplies the agent infrastructure; OmniRoute supplies dispatch.

## First release scope

| Requirement | Acceptance evidence |
|---|---|
| Install and launch locally on Windows first | Clean-machine setup without preinstalled global OpenCode/OmniRoute; actionable startup failures |
| Open a project and complete a coding task | One session reads, edits, runs tests itself, and exposes the final diff and test result |
| Configure Gemini, Groq, OpenRouter, or Ollama | Metadata-first onboarding distinguishes configured, available, coding-eligible, and continuation-eligible; missing providers do not block others |
| Free-first, user-controlled inference | Default to verified free models ( charges); allow explicit user opt-in for paid models with BYOK API keys; enforce Free Only, Free Preferred, Paid Allowed policies, atomic budget reservation, and spending limits |
| Explain routing | Show current provider/model, reason for switching or stopping, observed quota/reset, and unknown values honestly |
| Safe continuation | Only evidence-backed directional routes enter automatic plans; retain tool history, permissions, context and signature constraints |
| User control | Cancel work, inspect changes, respond to tool permissions, resume supported sessions, remove credentials |
| Local privacy | Keychain-backed desktop onboarding; explicit cloud disclosure; redacted diagnostics; project data stays local except selected provider requests |

CLI and GUI must use the same policy and equivalent progress limits. Loss of local connectivity must preserve access to local project state; coding offline requires a running, compatible local model. Resumption is constrained by provider metadata lifetime, including the current memory-only Gemini signature cache.

## Later scope

The builder adds local templates, preview, iterative edits, tests and export on the same agent/session system. Broader OS support follows Windows validation. Hosted workspaces, collaboration, ad sponsorship, and marketplace integrations are deferred. Paid inference is supported under user-controlled, free-first policies with strict spending limits. Advertising is a possible future funding source, not a promise of unlimited free inference.

## Success and limits

Release requires the phase acceptance checks, no safeguard regressions, a complete UI coding flow, and an evidence-backed route policy. Measure setup success, time to first passing task, task completion, routing outcomes, startup latency and UI responsiveness locally; no default analytics upload. Set numeric performance budgets after a baseline on the target Windows hardware.

Current evidence proves Gemini-only coding and one Gemini → Cohere OpenRouter continuation under controlled failure. Other routes are unavailable for automatic continuation until validated. [Evidence and limitations](docs/CROSS-PROVIDER-VALIDATION.md) are authoritative for claims; a successful request or catalog listing alone is insufficient.

Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Engineering constraints: [RULES.md](RULES.md). UX: [DESIGN.md](DESIGN.md). Tool selection: [resource evaluation](docs/RESOURCE-EVALUATION.md).


## Phase 6 priority

Make limited free AI resources accomplish useful coding reliably, especially for students and developers unable to afford subscriptions. Prioritize measured coding correctness, efficient relevant context and clear provider limits over feature parity. Keep the existing visual identity. Add honest context visibility, upstream-based automatic/manual compaction and safe Markdown/code readability incrementally; preserve original history and enforce existing context/signature/permission/cost controls. Distinguish provider/OpenCode reports, estimates and unavailable measurements. Benchmark against matched OpenCode before claiming improvement. Extensive live runs need explicit quota approval; release gates remain separate. See [Phase 6 plan](PHASES.md).


## Phase 8 — Intelligent Multi-Agent Workflows & Model Orchestration

Build a free-first, model-aware orchestration system that plans coding tasks, recommends optimal models, delegates to specialized agents, executes independent tasks in parallel when beneficial, and verifies the final result.

Core Promise: Get the most useful coding work from the resources users choose to provide, with free models as the default and paid models entirely optional.

1. Model Discovery & Selection: Discover individual models in Gemini, Groq, OpenRouter, and Ollama with verified capabilities, context limits, and free-tier eligibility. Recommend models based on coding ability, reasoning, tool-calling, speed, and quotas. Allow manual overrides and multiple models per provider.
2. Free-First, User-Controlled Policies: Support Free Only (default,  cap), Free Preferred (free first, optional fallback), and Paid Allowed (with explicit opt-in). Enforce per-task, per-workflow, and monthly spending limits. Display estimated and verified actual costs. Prevent overruns via atomic pre-execution budget reservations.
3. Intelligent Planning: Break complex tasks into structured subtasks with dependencies and acceptance criteria. Recommend specialized planning models. Present plans for review and editing.
4. Multi-Agent Roles: Support Planner, Implementer, Researcher, Debugger, Tester, and Reviewer roles plus custom agents. Enable safe parallel execution with file conflict detection.
5. Workflow Modes: Quick (single agent), Guided (sequential with approval), Team (dependency-aware parallel multi-agent), and Custom (user presets).
6. Workflow UI: Interactive execution graph integrated into the Phase 7 IDE workspace, real-time status tracking, individual agent inspector, and seamless manual reassignment.