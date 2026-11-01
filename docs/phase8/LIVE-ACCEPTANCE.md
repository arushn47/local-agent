# Proposed minimal live acceptance — approval required

Not executed. No production gate is enabled by this proposal.

- Disposable project and disposable runtime profile. Seed `double.mjs` with `return n + 1` and a fixed test file for positive, negative and zero inputs. Record failing baseline, file hashes and full diff locally.
- Two real OpenCode sessions: Implementer fixes only `double.mjs`; Tester runs exactly `node --test test/double.test.mjs`. Both use one freshly verified, configured free model through registered exact aliases. No model switching, paid fallback, dependency install or autonomous workflow retry.
- Use an isolated acceptance server with its test-only execution capability, leaving the production server gated. Save/inspect the plan in the UI; start through the authenticated workflow API. Answer only the expected file edit and exact test-command permission requests once.
- Guard limits: **8 upstream requests total**, **64,000 conservative reserved input/output tokens total**, **$0 maximum spend**, **120 seconds total wall time**. The outer harness cancels the workflow and revokes scopes at the wall limit. Any provider retry consumes the same guard request/token budget. Stop on failed admission, accounting uncertainty, unexpected permissions or a task/provider failure; retain artifacts without another live attempt.
- Verify UI → API → supervised OpenCode sessions → authenticated workflow ingress → one-target OmniRoute attempt routes → guard → actual tools → completed test command with exit zero. A final model message alone cannot pass. Independently rerun the fixed test and inspect the diff. Human approval of that diff is the review outcome; no extra reviewer inference is needed.
- Retain sanitized aggregate request/token/route/permission/cancellation evidence and before/after hashes locally. Unknown usage remains reserved, not recorded as measured zero. Do not package, publish or push.

Acceptance must also confirm the exact native model/provider IDs and permission/output metadata from this pinned engine. If that contract differs, fail closed and return to local fixtures. Passing this one bounded test does not certify paid accounting, isolated parallel writers, arbitrary restart recovery, all providers or public release.
