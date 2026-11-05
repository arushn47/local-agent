# Chat controls and free-model routing

Updated 2026-11-06. LocalAgent is a secondary free-quota coding workspace. It uses each provider's API/account quotas; it cannot transfer a consumer subscription's allowance or bypass exhausted quotas. Model metadata and routing heuristics do not establish parity with a paid coding product.

## Model choice in the same chat

The composer offers Automatic free route, a task-specific recommendation, and each admitted exact free model. Switching at an idle boundary changes the next message's route in the **same OpenCode session**, retaining history and task navigation. It never starts a replacement chat. Running tasks keep their model until completion or Stop. Provider continuation/signature and context guards still apply: an incompatible continuation fails visibly rather than discarding history or stripping required metadata.

Exact selections use a provider-qualified registry and hashed single-target OmniRoute aliases through ordinary guarded egress, with no paid fallback. The registry is generated at runtime configuration; adding a newly discovered model requires runtime restart. Availability is rechecked against fresh catalog metadata when selected/dispatched. Invalid, stale, unregistered, paid and coding-unvalidated candidates remain unavailable.

The comparison lists **all discovered free candidates for connected eligible providers**, with no nine-model cap. Task types rank declared context for project understanding; reasoning support for planning/debugging; coding-specialized names for implementation; and a Groq/lite-family preference for small tasks. These are explicit metadata heuristics, **not measured quality, speed, reliability, or remaining quota**. Changing task type alone sorts recommendations; choose “Recommended for task type” or an exact model to change the route. Existing workflow plans offer per-role exact assignment; production multi-agent Start/Resume/Retry remains gated pending live acceptance.

## Shared project memory

Every chat operates in its project directory and can inspect current code/docs through native tools. “Project memory” adds an explicit user-maintained 4 KB brief in `.localagent/project-memory/context.json`: goals, conventions, fixed test commands, preferences and confirmed findings. All project chats receive the current revision on their next normal message; a revision is not repeatedly injected into the same session. New workflow role sessions receive it too. Clearing adds a superseding marker to existing chats. Saving checks revisions to reject stale overwrites; files/parents reject links and hardlinks.

This does not automatically upload the repository, merge other chats' transcripts, infer long-term preferences, or perform automatic self-learning. Notes may be stale; tools must inspect current files. Shared notes do not grant permissions. Secrets belong outside the brief.

## Queue and steer

Sending while the selected chat is running queues the message. Up to ten messages / 64,000 characters are retained per chat in private runtime session state. Edit and Remove act on pending messages; Hold queue stops automatic delivery. After successful completion, the supervisor sends the oldest pending message through the normal guarded prompt path. A failed observation cannot establish completion. Stop, provider failure, uncertain delivery and runtime restart hold pending work; explicit Resume is required. Ambiguous dispatch is marked uncertain and never automatically retried. Inspect history before removing an uncertain item.

“Steer now” immediately appends that pending message through the pinned legacy runner's supported prompt API and joins its existing loop. The next input boundary consumes it; an executing tool may finish first. The same model, permission prompts, request/deadline limits and original session remain authoritative. Steering does not abort/replay a tool or create a competing runner. The newer V2 inbox accepted input but did not promote it into this legacy execution path during the deterministic native investigation, so LocalAgent does not use that inbox for steering.

## Follow agent and compaction

Files → Follow agent opens the public project file reported by native read/edit/write activity and refreshes its contents when that tool's state changes. Browsing another file turns following off. Paths are confined and filtered before projection; contents still come from the existing safe text-file API. It shows real file contents at tool boundaries, not character-by-character speculative edits. Changes retains actual tool patches. Unsupported multi-file tool locations or shell-written files may not be followable.

Automatic summarization remains OpenCode's responsibility. Its global buffer and retained tail are configured to trigger before the unchanged conservative byte guard. Selected routes have different capacities, so their logical engine context limits translate each model's own guard threshold against the shared buffer; catalog/provider capacities and OmniRoute limits remain unchanged. A larger route therefore retains a larger effective input allowance. No separate summarizer is added. History is kept by OpenCode; a failed or unproductive compaction stops the task instead of silently clearing/restarting the chat. Real-model summary fidelity remains unverified. Manual compaction is unavailable in pinned 1.18.31.

## Metadata research, no inference

The unauthenticated [OpenRouter model catalog](https://openrouter.ai/api/v1/models) was checked 2026-11-06 IST: 12 `:free` variants, 11 declaring tools, zero token/request prices and at least 32K context. The task-fit inventory below is metadata only. It does not admit unvalidated models to coding or prove provider uptime or accuracy.

| Free candidate | Declared context | Metadata-based use to investigate |
|---|---:|---|
| nvidia/nemotron-3.5-super-vl:free | 1,000,000 | Large project scans; reasoning declared |
| nvidia/nemotron-3.5-lightning:free | 1,000,000 | Large project scans; reasoning declared |
| nvidia/nemotron-3-ultra-550b-a55b:free | 1,000,000 | Large project scans; reasoning declared |
| dots-studio/dots-3-note-preview:free | 512,000 | Project understanding; reasoning declared |
| recursive/flint-v1.0:free | 262,144 | Planning/debugging; reasoning declared |
| xingchen-agi/xing4.0-29b-a4b:free | 262,144 | Planning/debugging; reasoning declared |
| google/gemma-4-26b-a4b-it:free | 262,144 | General tasks; reasoning declared |
| google/gemma-4-31b-it:free | 262,144 | General tasks; reasoning declared |
| cohere/north-mini-code:free | 256,000 | Coding specialization; existing reviewed admission |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 256,000 | Reasoning tasks to validate |
| liquid/lfm-2.5-2.6b:free | 65,536 | Small-task candidate; speed unmeasured |

Ranking ties are resolved deterministically by qualified ID in the UI. The comparison includes unavailable candidates and states why they are unavailable. Provider names and marketing descriptions alone never establish coding compatibility. Review [free-variant limits](https://openrouter.ai/docs/guides/routing/model-variants/free), [Gemini API free-tier pricing](https://ai.google.dev/gemini-api/docs/pricing), and [Groq models](https://console.groq.com/docs/models) / [account rate limits](https://console.groq.com/docs/rate-limits). Connected Gemini/Groq discovery ranks all returned candidates that the catalog identifies as free; admission remains separate from listing.

## Acceptance and remaining work

`test/chat-controls.test.mjs` checks same-session switches/history, bounded/versioned memory, ranking beyond nine candidates, stale/paid/unvalidated admission, queue ordering/edit/hold/restart/uncertainty, native steering calls and private-file activity filtering. `test/context.test.mjs` checks per-model threshold ordering without weakening the guard.

The actual browser/native fixture (`scripts/verify-native-workflow-permissions.mjs --single`) selects an exact model, checks task-type persistence across polling, applies its recommendation, saves shared memory, reads/edits a real file, queues/edits/steers while edit approval is pending, drains a follow-up after completion, refreshes followed contents, switches to Automatic in the same session, then sends another message and reloads without replay. Queued-message keyboard typing is checked across a live refresh: snapshots reconcile native IDs so polling preserves focus. Fixed tests run independently. Scripted loopback responses are not live model-quality or compaction-fidelity evidence.

Interactive terminal/PTY UI, arbitrary API/database/cloud connectors, automatic learned memory and OS sandboxing remain unimplemented. The Commands dock is an agent command log. Existing debugging/test tools and supervised workflow units exist; unrestricted autonomous production multi-agent orchestration remains gated. See [candidate matrix and public blockers](MVP-CANDIDATE.md).
