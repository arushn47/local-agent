# Add slugify

Implement `slugify` in `repo/slug.mjs` (already exported):
- lowercase ASCII letters and digits
- any run of other characters becomes a single `-`
- no leading or trailing `-`
- maximum 60 characters, never ending in `-`

Add tests if useful and verify with `node --test`.
