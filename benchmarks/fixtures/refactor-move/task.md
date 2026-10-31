# Move clamp into its own module

`repo/math.mjs` defines `clamp`, and `repo/index.mjs` re-exports it.

Move `clamp` into a new `repo/clamp.mjs`, keep `index.mjs` exporting `clamp`
with the same behavior, and leave `math.mjs` without a `clamp` definition.
Do not change the public API. Verify with `node --test`.
