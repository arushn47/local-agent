> Investigation record. For current behavior and remaining blockers, see [STATUS.md](STATUS.md); product guidance lives in the root documents.

# Startup verification — 23 October 2026

## Confirmed failing stage

Subprocess startup succeeded and OmniRoute logged Next.js readiness and bootstrap completion. Cold POST /api/auth/login did not complete within a separately measured 15,016 ms timeout. Warm GET /api/auth/status returned HTTP 200; warm login returned HTTP 200 in 293 ms. The old launcher repeatedly used a 2-second login deadline as its readiness probe and wrapped discovery/configuration in the same retry loop. Authentication readiness was the blocking stage; credentials and configuration worked once warm. This does not establish which internal cold initialization consumed the time.

## Narrow fix

Added src/readiness.mjs: poll the read-only status endpoint with a bounded 120-second deadline before submitting credentials. Authentication and configuration then execute once, with existing management authentication timeouts. Startup logs identify readiness, discovery, and authentication/configuration stages. No context, model, quota, cost, or coding safeguards were changed.

## Verification

Original 31 tests passed before editing. All 33 tests passed afterward, including two readiness regressions. One controlled post-fix startup reached ready:true. No repeated post-fix restart was performed.

One --json coding task was attempted in .localagent/startup-coding-check. Gemini read double.mjs and edited return n to return n * 2. The next model turn failed with a missing thought_signature error. The agent did not create a test or run tests. No coding retry was attempted and no provider fix was made. An independently authored test checked the actual edited source: 2 passed, 0 failed. The saved source.diff contains only the agent edit; the independently authored test is explicitly separate. Full coding-task completion and failover are not demonstrated.

Evidence: validation/startup/report.json, readiness.txt, regressions.txt, independent-source-tests.txt, and source.diff.

Commands: npm test; npm start (wait for ready:true). The attempted task used npm run agent -- --project .localagent/startup-coding-check --json PROMPT. Independent check: node --test .localagent/startup-coding-check/independent.test.mjs. Diff: git -C .localagent/startup-coding-check diff -- double.mjs.
