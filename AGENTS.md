# TwistPrSAT instructions

This is the isolated TwistPrSAT worktree. Do not propagate changes into the
PrSAT experimental or public trivalent checkouts unless Branden explicitly
asks for a shared family change.

- Branch: `twistprsat-full`
- Live app: `https://fitelson.org/PrSAT/twist/`
- Server target: `/home/fitelson/www/www/PrSAT/twist/`
- Semantics: `src/letk.ts`
- Z3 adapter: `src/letk_sat.ts`
- Random Search and hand-rolled equation solver: `src/random_search.ts` and
  `src/browser_equation_solver.ts`

Use `~` for De Morgan negation, `○`/`o` for reliability, and `∼`/`cnot` for
classical negation. Keep the mathematical truth-table certificates in
`src/letk.spec.ts` synchronized with semantic changes.

Before deployment, run TypeScript, lint, build, the full serialized unit
suite, and Chromium Playwright. After deployment, require HTTP 200, matching
local/live Z3 WASM checksums, explicit Z3 readiness, and successful live Z3
and Random Search solves.

