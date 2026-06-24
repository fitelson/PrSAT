# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PrSAT 3.1 (experimental)

**This is an experimental fork of PrSAT 3.0.** Source of truth for production: `../PrSAT 3.0/PrSAT-main/`. Do NOT deploy this experimental branch.

The goal of 3.1 is to add a **Random Search** solver as an alternative to Z3, porting the `Method -> "Random"` path from the Mathematica reference implementation (`../PrSAT 3.0/PrSAT_3_Mathematica/PrSAT.m`). See `RANDOM_SEARCH.md` for the design document.

### Random Search — where it shines and where it doesn't

- **Inequalities (strict or non-strict):** Random Search is strong here. The cost function has negative values on a full-measure region of the simplex, so Nelder-Mead reaches it quickly and rationalization almost always snaps to exact rationals that verify.
- **Web Worker (2026-06-12, latest):** the UI runs Random Search in a Web
  Worker (`src/random_search_worker.ts`); never call `random_pr_sat_wrapped`
  directly on the main thread from UI code. Results carry `rational_model`
  (plain data) across the worker boundary; the evaluator is rebuilt with
  `build_rational_evaluator`.
- **Permanent local install:** http://localhost:5317/ serves the built app via
  LaunchAgent `org.fitelson.prsat31.web` (`maple_bridge/serve_dist.mjs`, COOP/
  COEP headers); `org.fitelson.prsat31.maple` keeps the bridge on 31415. After
  `npm run build`, the bookmark serves the new build immediately. Logs:
  `~/Library/Logs/prsat31/`.
- **Local Maple bridge (2026-06-12):** `npm run maple-bridge` starts
  `maple_bridge/server.mjs` (port 31415) wrapping desktop Maple; when reachable,
  Random Search sends the equation system to Maple and searches each rational
  solution branch (`src/maple_bridge_client.ts`, `src/maple_expr.ts`,
  `search_maple_branch` in `src/random_search.ts`). Browser-only deployment is
  unaffected — the bridge is optional and auto-detected. Tests self-skip
  without it (`src/maple_bridge.spec.ts`).
- **Exact certification beyond rationalization (2026-06-12, later):** when the
  symbolic elimination leaves equations (linear in no single variable), the
  certification step pins a snapped subset of free coordinates, re-eliminates
  the ORIGINAL equation system at those values, and finishes any stuck
  zero-dimensional remainder with `src/groebner.ts` — pure-TS lex Buchberger
  (capped) + exact rational-root enumeration + back-substitution. This solved
  the likelihood-ratio research benchmark (`src/likelihood_ratio_system.spec.ts`)
  that desktop Mathematica/Z3 struggled with. The certification passes yield to
  the event loop and honor the abort signal (Random Search runs on the main
  thread, unlike Z3's WASM workers — without yielding it froze the page).
- **Equality constraints (reworked 2026-06-12):** top-level equations are now solved symbolically before the search by `src/equation_elimination.ts` — exact linear elimination plus generic-branch (v = −B/A) substitution for nonlinear equations like independence — so the search runs over a reduced pure-inequality system and consumed equations hold by construction. Linear contradictions yield a sound `unsat`. Only equations linear in no variable (every variable squared+, or under disjunction/negation) still rely on the weak `(x-y)^2 - margin^2` cost term.
- **Mixed systems** that are mostly inequalities with one or two simple equalities usually succeed. Heavy equational systems (independence constraints like `Pr(A & B) = Pr(A) * Pr(B)`) are better served by Z3.
- **Small fractions (2026-06-12):** after the early-stopped Nelder-Mead success, a polish pass re-minimizes without the early stop (deep interior point), then `try_rationalize_and_verify` scans common denominators q = 1..200 (snap all coordinates to p/q, verify exactly) before falling back to coarse-to-fine continued fractions. Models now come out with small uniform denominators (e.g. 16ths); regression test in `src/small_fractions.spec.ts`.
- **UNSAT is provable only via linear-equation contradictions** (see above); otherwise Random Search — it only ever returns `sat` or `unknown`.

## What is PrSAT?

PrSAT (Probability Satisfiability) is a web-based tool for checking satisfiability of probabilistic constraints. Users enter constraints involving probabilities (e.g., `Pr(A) > Pr(B)`, `Pr(A|B) = 1/2`) and the tool uses the Z3 SMT solver to find a probability distribution satisfying all constraints, or reports UNSAT if none exists.

**Live deployment (3.0 only):** https://fitelson.org/PrSAT/

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

## Companion: Mathematica PrSAT Reference

Lives at `../PrSAT 3.0/PrSAT_3_Mathematica/` (separate from the TS source-of-truth at `../PrSAT 3.0/PrSAT-main/`). As of **2026-04-25** the Mathematica `Method -> "Random"` path uses our compiled Nelder-Mead implementation by default (~5× end-to-end on real problems, ~1000× on the inner search). `SearchAttempts` default bumped from 3 to 10. Both `PrSAT.m` and `PrSAT_Cloud.m` remain single self-contained packages — helpers inlined directly. Backups: `<file>.bak.before-compiled-random-2026-04-25` in the same directory.

Standalone PoC for experimenting: `mathematica_compiled_random/CompiledRandomSearch.m` + `benchmark.m` + `README.md` in this folder. Run benchmark with `WolframKernel=/Applications/Wolfram.app/Contents/MacOS/WolframKernel wolframscript -file benchmark.m` (the env var override is required on this machine; plain `wolframscript` errors with "WolframKernel location could not be determined").

## Recent Work (2026)

- **2026-06-23:** Added experimental Pr3SAT/trivalent probability mode in the 3.1 fork, with a `Trivalent (ERS)` UI toggle, Cooper semantics for `->`, trivalent model evaluation, and Random Search support through the same semantics flag. Browser CAS alternatives for Random Search equation solving were tested; Maple remains the supported optional equation-solving bridge. Fixed trivalent Random Search + Maple branch verification for zero-denominator `ite` expressions. Verification: `npm run build` and `npx vitest --run` pass (700 passed, 1 skipped).
- **2026-06-12:** Added Decimals/Fractions toggle button to the Evaluate model toolbar (4-decimal approximations of evaluation results; ported from the 3.1 experimental fork).
- **2026-06-10:** Fixed the June 2026 bug-review set: critical SMT-LIB soundness bugs for nested `=>`, subtraction, and division; exponentiation handling; parser backtracking; exact numeric literal preservation; local conditional-probability denominator guards; free real-variable declaration/evaluation; native Z3 timeout on the wrapped solver path; UI/input async races; model/root display bugs; deploy dotfile upload; production cache headers. Verification: `npm run build` and `npx vitest --run` pass.
- **2026-06-10:** Hid the internal one-state `a_i` truth-table/model UI for arithmetic-only constraints with no sentence letters; these cases now show only SAT/UNSAT, save buttons, and translated constraints.
- **2026-04-25:** Compiled-NM random search backported into the Mathematica PrSAT reference. See `CHANGELOG.md` entry for details.
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
