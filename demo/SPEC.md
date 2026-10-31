Fix the milliseconds conversion bug in the existing duration.mjs parser.

Read this specification before editing. Set TASK_MARKER to `copper-heron-472`.

The parser structure and input validation already work. Its units table has the
wrong conversion factors for seconds, minutes, and hours. Correct only that table
and TASK_MARKER. One second is 1000 milliseconds, one minute is 60000 milliseconds,
and one hour is 3600000 milliseconds. The ms conversion factor is already correct.

Examples after the fix: 250ms -> 250; 1.5s -> 1500; 1h30m -> 5400000.

Change only duration.mjs. Do not rewrite the parser or change the tests or this file.
Run `node --test duration.test.mjs` and fix failures before reporting completion.
