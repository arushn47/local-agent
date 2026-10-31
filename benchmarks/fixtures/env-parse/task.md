# Fix the failing parser test

`node --test` fails in this project. The bug is in `repo/parse.mjs`.

`parseEnv(line)` must return `{key, value}` where both sides are trimmed and a
value wrapped in matching single or double quotes is unquoted. Values may
contain `=`. Do not weaken the tests. Verify with `node --test`.
