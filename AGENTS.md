# TwistPrSAT instructions

This is the isolated TwistPrSAT worktree. Do not propagate changes into sibling
PrSAT checkouts unless Branden explicitly asks for a shared family change.

- Branch: `twistprsat-full`
- Live app: `https://fitelson.org/PrSAT/twist/`
- Server target: `/home/fitelson/www/www/PrSAT/twist/`
- Semantics: `src/letk.ts`
- Z3 adapter: `src/letk_sat.ts`

Use `~` for De Morgan negation, `○`/`o` for reliability, and `∼`/`cnot` for
classical negation. Keep the mathematical truth-table certificates in
`src/letk.spec.ts` synchronized with semantic changes.

Before deployment, run TypeScript, lint, build, the full serialized unit
suite, and Chromium Playwright. After deployment, require HTTP 200, matching
local/live Z3 WASM checksums, explicit Z3 readiness, and successful live Z3
solves. The public app is Z3-only; do not reintroduce a solver selector.
