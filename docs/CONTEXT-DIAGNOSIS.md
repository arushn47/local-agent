> Investigation record. For current behavior and remaining blockers, see [STATUS.md](STATUS.md); product guidance lives in the root documents.

# Context investigation — 23 October 2026

## Revalidated evidence

Read STATUS, README, architecture, and current implementation before changes. Existing regression suite was rerun; see validation/diagnostic-regression-tests.txt.

A local interception endpoint captured request sizes only. It never forwarded requests to a model provider. Its first synthetic response supplied an explicitly offline diagnostic compaction summary so the next request could be inspected. This is diagnostic evidence, not a completed coding task or real provider test.

See validation/context-diagnostic.json:

- Initial compaction request: 2,504 serialized bytes; no tools.
- Following coding request: 36,329 serialized bytes.
- Messages: 14,715 bytes; tool schemas: 21,471 bytes across ten standard tools.
- The first coding request already exceeds a practical 8K budget once output and a safety margin are reserved. Compaction cannot remove the fixed tool-schema overhead.

## Confirmed implementation defects

1. All models are advertised as the same 8K context despite heterogeneous provider capabilities. Discovery checks minimum context but discards model-specific capability values.
2. The guard does not budget input messages plus tool schemas plus output reservation before inference.
3. Guard rejection reasons are collapsed into generic policy_blocked errors, obscuring compatibility failures.
4. OmniRoute logs show context errors being tried against later targets, including the 8K local fallback.
5. The launcher has no termination rule for repeated context errors or unproductive compaction.

## Unresolved cause — do not infer

The historical 209,171-token estimate is present for BOTH Gemini and the local model in the OmniRoute logs. It is not reproduced by this fresh 36KB coding-request capture. The installed estimator sums adapted messages, tools, system, and instructions using a character heuristic. The precise payload transformation or earlier input responsible for 209K remains unverified. Global plugin/MCP inheritance has NOT been established as the cause; plugin-free and isolated-profile attempts previously failed.

The installed OmniRoute context path also contains last-resort compression. Its effect on task state must be examined before any reliable continuity claim.

## Status

No production routing fix has been implemented during this diagnostic checkpoint. Cost controls remain intact. No paid inference was used by the offline capture. No coding completion, real provider failover, OpenRouter suitability, or real quota-exhaustion recovery is claimed. Finish the payload-estimator trace before implementing the requested capability-aware routing and bounded compaction changes.

## Estimator trace and implementation follow-up

Installed OmniRoute 3.8.50 chatCore.ts calls estimateFinalInputTokens after provider transformation and last-resort compression. handlers/chatCore/contextEstimation.ts adapts the body through compression/bodyAdapter.ts, then sums messages, tools, system and instructions. contextManager.ts uses serialized character length divided by four, plus structured image budgets. The error therefore describes the transformed intermediate body, before final provider dispatch. Original transformed messages/schemas for the historical 209,171 estimate were not retained: metadata-only logs and the fresh size capture cannot reconstruct them. No reproduction fixture for that historical value is claimed.

Implemented: model-specific discovered capabilities; conservative UTF-8-byte input estimate including schemas/framing; output and safety reservations; specific 422 context_budget_error before guard dispatch; coding routes require approved tools-capable models with >=32K verified context; unapproved OpenRouter and 8K local models are excluded from automatic coding continuation. JSON launcher monitoring stops context errors immediately and limits compaction/request attempts. Stale 8K generated configs cannot launch a coding run. No history or tool schemas are silently truncated by these changes.

Verification: see validation/context-tests.txt. One bounded disposable clamp coding task was attempted, but the platform did not finish its authenticated startup/configuration within the startup timeout. No source edit or completed model/tool cycle was observed. Its verification process was stopped. A controlled provider-switch test was not run because the prerequisite coding test failed. Existing provider integrations were not re-proven in this attempt. Natural quota recovery and OpenRouter coding compatibility remain unverified.

Commands: npm test; npm start (wait for ready:true); npm run configure; npm run agent -- --project PATH --json PROMPT. Noninteractive coding requires --json to enable termination monitoring. This remains an experimental increment until live startup, context estimates against usage, coding completion, and provider switching are verified.
