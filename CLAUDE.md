# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is PrSAT?

PrSAT (Probability Satisfiability) is a web-based tool for checking satisfiability of probabilistic constraints. Users enter constraints involving probabilities (e.g., `Pr(A) > Pr(B)`, `Pr(A|B) = 1/2`) and the tool uses the Z3 SMT solver to find a probability distribution satisfying all constraints, or reports UNSAT if none exists.

**Live deployment:** https://fitelson.org/PrSAT/

## Architecture

- **Frontend:** TypeScript + Vite, runs entirely in browser
- **Solver:** Z3 compiled to WebAssembly (z3-solver npm package)
- **Key constraint:** Z3 WASM requires SharedArrayBuffer, which needs cross-origin isolation headers

## Key Files

| File | Purpose |
|------|---------|
| `src/text_to_display.ts` | Main UI logic, input handling, result display |
| `src/z3_integration.ts` | Z3 solver interface, model parsing, evaluation |
| `src/pr_sat.ts` | Constraint translation, truth table generation |
| `src/parser.ts` | Parsing probability expressions |
| `src/block_playground.ts` | Constraint input block UI (Load, Save, Clear, Batch) |
| `webpage/index.html` | Project webpage (deployed to fitelson.org/PrSAT/) |
| `CHANGELOG.md` | Change history for local/fork changes |

## How It Works

1. User enters constraints like `Pr(A) > Pr(B)`, `Pr(A|B) = 1/2`
2. Parser converts to AST representation
3. Constraints translated to state variable sums (one variable `a_i` per truth table row)
4. One state variable eliminated (set equal to `1 - sum of others`) for efficiency
5. Z3 solves the resulting QF_NRA (quantifier-free nonlinear real arithmetic) problem
6. If SAT, model displayed as probability table with assignments

## State Variables

- Named `a_1, a_2, ...` (1-indexed) in display
- Internally 0-indexed
- Last variable eliminated: `a_n = 1 - (a_1 + ... + a_{n-1})`
- Each `a_i` represents probability of one row of the truth table

## Irrational Number Display

Z3 returns algebraic numbers as `root-obj` expressions (roots of polynomials).

- **Quadratic irrationals (degree 2):** Displayed as simplified `(-b ± √D) / 2a` form with decimal approximation
- **Higher degree:** Displayed as "Root #N of [polynomial]"

Simplification extracts perfect squares from radical, reduces by GCD.

## Build and Test Commands

```bash
npm run dev              # Local dev server at localhost:5173
npm run build            # Refresh Z3 assets, TypeScript compile, Vite build
npx vitest --run         # Unit tests only (fast)
npm test                 # Unit + Playwright e2e tests (slower)
npx vitest --allowOnly   # Run single test (add .only to test)
npx playwright test --project chromium tests/simple.spec.ts  # Single e2e test
```

## Graphify Codebase Graph

- Code-only graph built 2026-06-27 at `graphify-out/`: 607 nodes, 1377 clustered edges, 36 communities, 0 LLM tokens.
- `.graphifyignore` keeps the graph code-only by excluding docs/PDFs, `node_modules/`, `dist/`, generated artifacts, JSON lock/data files, HTML pages, and bundled Z3 assets.
- Query from the repo root with `graphify query "..."`; inspect paths with `graphify path "A" "B"` and node neighborhoods with `graphify explain "X"`.
- After source edits, run `graphify update .` from the repo root to refresh the AST graph.

## Deployment Notes

- **GitHub repo:** `fitelson/PrSAT` (forked from `imapersonman/PrSAT`)
- **Live site:** https://fitelson.org/PrSAT/
- `npm run deploy` builds and uploads `dist/` to the server via scp
- Webpage (`webpage/` directory) deployed separately: `scp webpage/* fitelson@fitelson.org:/home/fitelson/www/www/PrSAT/`
- `dist/.htaccess` required for Apache servers (cross-origin isolation headers)
- iOS Safari requires proper COEP/COOP headers for SharedArrayBuffer

## Logical Connectives: Two Levels

The same connective symbols (`~`/`-`/`!`, `&`/`/\`, `v`/`\/`/`∨`, `->`/`>`/`→`, `<->`/`<>`/`↔`) parse at **two** levels and the parser disambiguates by context:

- **Sentence-level** (inside `Pr(...)`): join statements of propositional calculus. E.g. `Pr(A & B) = 1/4`, `Pr(A <-> B) = 1`.
- **Constraint-level** (outside `Pr(...)`): join whole probabilistic constraints into a single compound `Constraint`. E.g. `Pr(A) = 1/2 & Pr(B) = 1/2`, `~(Pr(A) = Pr(B))`, `(c1 & c2) <-> c3`.

Symbols are defined identically in `src/pr_sat.ts` (`possible_constraint_connectives`, `possible_sentence_connectives`). The browser Find Model path emits SMT-LIB via `constraint_to_smtlib` / `real_expr_to_smtlib` in `src/pr_sat.ts`; the model evaluator uses `constraint_to_bool` / `real_expr_to_arith` in `src/z3_integration.ts`. Compound metalinguistic constraints have always been supported — this enables single-input theorem-checking by entering the negation of a putative theorem and looking for UNSAT.

## Recent Work (2026)

- **2026-08-31:** Added `(*a.k.a.*, The Probability Table Generator)` beneath the PrSAT 3.0 project-page subtitle and deployed the updated webpage to fitelson.org.
- **2026-06-12:** Added Decimals/Fractions toggle button to the Evaluate model toolbar (4-decimal approximations of evaluation results; ported from the 3.1 experimental fork).

- **2026-06-10:** Fixed the June 2026 bug-review set: critical SMT-LIB soundness bugs for nested `=>`, subtraction, and division; exponentiation handling; parser backtracking; exact numeric literal preservation; local conditional-probability denominator guards; free real-variable declaration/evaluation; native Z3 timeout on the wrapped solver path; UI/input async races; model/root display bugs; deploy dotfile upload; production cache headers. Verification: `npm run build` and `npx vitest --run` pass.
- **2026-06-10:** Hid the internal one-state `a_i` truth-table/model UI for arithmetic-only constraints with no sentence letters; these cases now show only SAT/UNSAT, save buttons, and translated constraints.
- **2026-04-18:** Upgraded `z3-solver` 4.15.4 → 4.16.0 and refreshed bundled WASM assets
- **2026-04-18:** Documented the two-level connective overloading on the project webpage; fixed in-app help typo where `->`/`→`/`>` was labeled "biconditional"
- Added Contributors section to README (Koissi Adjorlolo, Claude, Branden Fitelson)
- Added `v` as disjunction symbol (in addition to `∨` and `\/`)
- Simplified syntax error message to "Syntax error (not a wff)." on button
- Added Clear button for constraint entry (resets to single empty input); removed redundant Clear from model evaluate heading
- Fixed division-by-zero detection in model evaluator
- Added "Save table as image" button
- Simplified timeout UI to single seconds field
- Consistent `a_i` naming throughout
- Simplified quadratic irrational display with decimal approximation
- iOS Safari compatibility fixes

## Common Tasks

**Adding a new feature to the UI:** Edit `src/text_to_display.ts`

**Changing how Z3 results are parsed:** Edit `src/z3_integration.ts`

**Modifying constraint translation:** Edit `src/pr_sat.ts`

**After changes:** Run `npm run build` to check for TypeScript errors, then `npx vitest --run` for quick tests.

## Family-Wide Regression Contracts

Canonical shared suite: `fitelson/PrSAT-family-contracts` (local checkout: `../prsat-family-contracts` relative to the `todo` directory). This application uses the `prsat-3.0` profile.

Every bug that can affect more than one PrSAT-style web app must first receive a browser-level regression in `PrSAT-family-contracts/tests/family.spec.mjs`. Keep application-specific semantics in `profiles.mjs`; do not weaken a shared contract merely to accommodate drift.

The branch-local `.github/workflows/family-contracts.yml` calls the complete four-application matrix on every push and pull request. The canonical repository also runs it daily. A failure in another application is a synchronization failure that should be fixed or explicitly modeled as a profile difference.

Run this application locally from the contracts checkout with:

```sh
npm run test:app -- prsat-3.0 "../PrSAT 3.0/PrSAT-main"
```
