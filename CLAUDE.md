# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PrSAT 3.1 (experimental)

**This is an experimental fork of PrSAT 3.0.** Source of truth for production: `../PrSAT 3.0/PrSAT-main/`. Do NOT deploy this experimental branch.

The goal of 3.1 is to add a **Random Search** solver with a zero-dependency
equation-solving layer, while retaining the optional local Maple 2024 bridge
as a comparison/acceleration path. Random Search began as a port of
the `Method -> "Random"` path from the Mathematica reference implementation
(`../PrSAT 3.0/PrSAT_3_Mathematica/PrSAT.m`). See `RANDOM_SEARCH.md` for the
original design document.

### Random Search — where it shines and where it doesn't

- **Inequalities (strict or non-strict):** Random Search is strong here. The cost function has negative values on a full-measure region of the simplex, so Nelder-Mead reaches it quickly and rationalization almost always snaps to exact rationals that verify.
- **Web Worker (2026-06-12, latest):** the UI runs Random Search in a Web
  Worker (`src/random_search_worker.ts`); never call `random_pr_sat_wrapped`
  directly on the main thread from UI code. Results carry `rational_model`
  (plain data) across the worker boundary; the evaluator is rebuilt with
  `build_rational_evaluator`, `build_rational_cooper_evaluator`, or
  `build_rational_cck_evaluator`, according to the selected semantics. Worker
  crashes and structured-clone failures must resolve as visible exceptions;
  Cancel terminates the worker.
- **Permanent local install:** http://localhost:5317/ serves the built app via
  LaunchAgent `org.fitelson.prsat31.web` (`maple_bridge/serve_dist.mjs`, COOP/
  COEP headers); `org.fitelson.prsat31.maple` keeps the bridge on 31415. The
  agents intentionally launch stable wrapper scripts in `~/Library/LaunchAgents/`
  (`org.fitelson.prsat31.web.zsh`, `org.fitelson.prsat31.maple.zsh`) rather than
  `/opt/homebrew/bin/node` directly, because Homebrew Node upgrades can stale
  launchd's cached code requirement and break restart. After `npm run build`,
  the bookmark serves the new build immediately. Logs: `~/Library/Logs/prsat31/`.
- **Port ownership is permanent:** port 5317 is reserved exclusively for the
  always-on built app. Never use, stop, replace, or repurpose 5317 for debugging,
  Vite, previews, tests, or temporary servers. Development/debugging uses 5173,
  Vite preview uses 4173, and Playwright uses 5174. These ports are strict: a
  conflict must fail visibly rather than silently selecting another address.
- **Local Maple bridge (2026-07-11 current policy):** `npm run maple-bridge` starts
  `maple_bridge/server.mjs` (port 31415) wrapping desktop Maple; when reachable,
  Random Search sends the equation system to Maple and searches each rational
  solution branch (`src/maple_bridge_client.ts`, `src/maple_expr.ts`,
  `search_maple_branch` in `src/random_search.ts`). Browser-only deployment is
  unaffected. The UI auto-detects the bridge, but Maple is used only when the
  user explicitly checks **Use Maple bridge**; it is exclusive with the
  zero-dependency browser branch solver, not a silent fallback. Tests self-skip
  without the bridge (`src/maple_bridge.spec.ts`). Cancelling the browser
  request aborts the server-side Maple child; do not regress to client-only
  cancellation.
  The bridge accepts browser requests only from the fixed local app origins
  (4173 preview, 5173 development, 5174 tests, and 5317 permanent), limits
  bodies/equations/variables/output/branches, and permits one Maple solve at a
  time. Keep it bound to `127.0.0.1`; do not restore wildcard CORS.
- **Exact certification beyond rationalization (2026-06-12, later):** when the
  symbolic elimination leaves equations (linear in no single variable), the
  certification step pins a snapped subset of free coordinates, re-eliminates
  the ORIGINAL equation system at those values, and finishes any stuck
  zero-dimensional remainder with `src/groebner.ts` — pure-TS lex Buchberger
  (capped) + exact rational-root enumeration + back-substitution. This solved
  the likelihood-ratio research benchmark (`src/likelihood_ratio_system.spec.ts`)
  that desktop Mathematica/Z3 struggled with. The certification passes yield to
  the event loop and honor the abort signal. The entire pipeline runs inside
  `src/random_search_worker.ts`, so CPU-heavy certification cannot freeze the
  UI thread.
- **Zero-dependency global equation solver (2026-07-11):**
  `src/browser_equation_solver.ts` preprocesses rational rows, performs exact
  linear/rational pivots with coefficient-zero complements, bounded lex
  Gröbner triangularization, pseudo-remainder elimination, factor branching,
  and back-substitution. It returns Maple-compatible guarded branches. A
  returned branch is always sound, but the bounded decomposition may be
  incomplete; diagnostics must distinguish `complete`, `partial`, capped, and
  `unresolved`. Never infer UNSAT from an incomplete/empty bounded search.
- **Simple Z3 boundary (2026-07-13):** classical, ERS, and CCK Z3 receive the
  direct semantic translation after ordinary normalization-state elimination.
  There is no Z3 equation preprocessor, exact-witness presearch, reduced-chart
  attempt, ratio elimination, product expansion, or automatic polynomial
  canonicalization. Do not add those back as implicit Z3 work or UI toggles
  without new benchmark evidence. Under regularity, `enrich_constraints`
  performs only one cheap denominator-sign simplification: a nonempty sum of
  strictly positive state masses needs no separate nonzero division guard, and
  `ite(D = 0, 1, N/D)` collapses to `N/D` for such a denominator. This rule
  does not cross-multiply or expand anything. Random Search remains
  the sole equation-solving mode. The removed strategies and exact benchmark
  results are recorded in `ALGEBRAIC_PREPROCESSING_EXPERIMENTS_2026-07-13.md`.
  A native-Z3 sweep on the corrected strict regular ERS Bayes-factor benchmark
  found no improvement from sign precheck, variable-order strategies,
  shuffling/seeds, inlining, or combined settings (all about 14.02-14.04 s);
  explicit simplification/tactic pipelines were worse. Keep Z3 defaults unless
  a broader benchmark demonstrates a general gain.
- **Equality constraints (reworked 2026-06-12):** top-level equations are now solved symbolically before the search by `src/equation_elimination.ts` — exact linear elimination plus generic-branch (v = −B/A) substitution for nonlinear equations like independence — so the search runs over a reduced pure-inequality system and consumed equations hold by construction. Linear contradictions yield a sound `unsat`. Only equations linear in no variable (every variable squared+, or under disjunction/negation) still rely on the weak `(x-y)^2 - margin^2` cost term.
- **Mixed systems** that are mostly inequalities with one or two simple
  equalities usually succeed. Random Search always eliminates equations before
  numerical search; it first tries the browser branch solver, or Maple 2024
  when explicitly selected, then falls back to exact generic elimination plus
  exact witness verification. Z3 remains the complete decision path when the
  nonlinear backend can decide the resulting QF_NRA problem.
- **Small fractions (2026-06-12):** after the early-stopped Nelder-Mead success, a polish pass re-minimizes without the early stop (deep interior point), then `try_rationalize_and_verify` scans common denominators q = 1..200 (snap all coordinates to p/q, verify exactly) before falling back to coarse-to-fine continued fractions. Models now come out with small uniform denominators (e.g. 16ths); regression test in `src/small_fractions.spec.ts`.
- **UNSAT is provable only via linear-equation contradictions** (see above); otherwise Random Search — it only ever returns `sat` or `unknown`.

## What is PrSAT?

PrSAT (Probability Satisfiability) is a web-based tool for checking satisfiability of probabilistic constraints. Users enter constraints involving probabilities (e.g., `Pr(A) > Pr(B)`, `Pr(A|B) = 1/2`) and the tool uses the Z3 SMT solver to find a probability distribution satisfying all constraints, or reports UNSAT if none exists.

**Live deployment (3.0 only):** https://fitelson.org/PrSAT/

## Architecture

- **Frontend:** TypeScript + Vite, runs entirely in browser
- **Solver:** Z3 compiled to WebAssembly (z3-solver npm package)
- **Key constraint:** Z3 WASM requires SharedArrayBuffer, which needs cross-origin isolation headers

## Codebase Graph

This repo has a local, code-only Graphify knowledge graph in `graphify-out/`.
Generated graph output is intentionally ignored by Git; `.graphifyignore` is the
scope file that keeps the graph code-only.

```bash
graphify query "How does Random Search connect to Maple?"
graphify path "random_pr_sat_wrapped()" "solve_equations_via_maple()"
graphify update .
```

Current experimental-repo graph, updated 2026-07-11: 1095 nodes, 3108 edges, 48
communities. Use `graphify update .` after source edits.

## Key Files

| File | Purpose |
|------|---------|
| `src/text_to_display.ts` | Main UI logic, input handling, result display |
| `src/z3_integration.ts` | Z3 solver interface, model parsing, evaluation |
| `src/pr_sat.ts` | Constraint translation, truth table generation |
| `src/equation_elimination.ts` | Exact rational-row extraction, localized reductions, substitution/back-substitution |
| `src/browser_equation_solver.ts` | Bounded global triangularization and guarded branch decomposition |
| `src/groebner.ts` | Capped exact lex Gröbner and rational-root machinery |
| `src/parser.ts` | Parsing probability expressions |
| `src/block_playground.ts` | Constraint input block UI (Load, Save, Clear, Batch) |
| `webpage/index.html` | Project webpage (deployed to fitelson.org/PrSAT/) |
| `CHANGELOG.md` | Change history for local/fork changes |

## How It Works

1. User enters constraints like `Pr(A) > Pr(B)`, `Pr(A|B) = 1/2`
2. Parser converts to AST representation
3. Constraints translated to state variable sums (one variable `a_i` per truth table row)
4. Z3 enriches the translated problem with probability bounds and definedness
   guards; under regularity it omits redundant guards on positive state sums
5. One state variable is eliminated as `1 - sum of others`
6. Z3 solves that direct formulation
7. Random Search instead performs equation solving before numerical search and
   exactly verifies any SAT witness
8. If SAT, the verified model is displayed as a probability table

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
npm run dev              # Development/debugging at 127.0.0.1:5173
npm run preview          # Built-app preview at 127.0.0.1:4173
npm run build            # Refresh Z3 assets, TypeScript compile, Vite build
npm run lint             # ESLint over source, tests, and config
npm run test:unit        # Unit tests only
npm run test:e2e         # Chromium Playwright tests only (never Firefox)
npm test                 # Unit + Playwright e2e tests (slower)
npx vitest --allowOnly   # Run single test (add .only to test)
npx playwright test --project chromium tests/simple.spec.ts  # Single e2e test
```

## Local-Only Operational Notes

- This experimental checkout is local-only. It has no `deploy` npm script and
  must never be uploaded over PrSAT 3.0 or the public Z3-only 3.1 fork.
- `npm run build` refreshes `dist/`; the permanent local server at
  `http://localhost:5317/` reads the updated files immediately.
- Port 5317 belongs only to that permanent service. Use 5173 for manual
  development/debugging, 4173 for preview, and 5174 for Playwright. Do not
  debug against 5317 or start any temporary server there.
- Restart services with `launchctl kickstart -k gui/$(id -u)/org.fitelson.prsat31.web`
  and the corresponding
  `org.fitelson.prsat31.maple` label.
- Both services provide only the local experimental workflow. Production
  deployment remains owned by the separate production/public checkouts.

## Resource and Soundness Limits

- Classical and ERS truth tables support at most 12 sentence letters (4096
  states). CCK supports at most 7 letters (2187 states).
- Solver and Random Search exponent magnitudes are capped at 1024.
- Random Search accepts 1–100 search attempts and 1–200 rationalization
  attempts. SAT results must always pass exact rational verification; numerical
  success alone is never sufficient.
- For totalized trivalent probability `ite(d = 0, 1, n/d) = c` with `c != 1`,
  polynomial extraction must retain the logically required condition `d != 0`.
  Dropping it produces false SAT results on zero-denominator models.
- A rational substitution with a nonconstant coefficient describes only the
  chart where that coefficient is nonzero. Its coefficient-zero complement
  must be retained, or the backend must fall back to the original formula.
- The legacy Context API may consume only global terminal preprocessing results
  (`exact-model` or `inconsistent`); it cannot return compact reduced
  coordinates as an original state model.
- A negative power requires a nonzero base. Definedness is branch-local for
  conjunctions, disjunctions, conditionals, biconditionals, and `ite` terms.
- Logical precedence is: negation, conjunction, disjunction, conditional,
  biconditional. Parenthesize intentionally when departing from that order.

## Logical Connectives: Two Levels

The same connective symbols (`~`/`-`/`!`, `&`/`/\`, `v`/`\/`/`∨`, `->`/`>`/`→`, `<->`/`<>`/`↔`) parse at **two** levels and the parser disambiguates by context:

- **Sentence-level** (inside `Pr(...)`): join statements of propositional calculus. E.g. `Pr(A & B) = 1/4`, `Pr(A <-> B) = 1`.
- **Constraint-level** (outside `Pr(...)`): join whole probabilistic constraints into a single compound `Constraint`. E.g. `Pr(A) = 1/2 & Pr(B) = 1/2`, `~(Pr(A) = Pr(B))`, `(c1 & c2) <-> c3`.

Symbols are defined identically in `src/pr_sat.ts` (`possible_constraint_connectives`, `possible_sentence_connectives`). The browser Find Model path emits SMT-LIB via `constraint_to_smtlib` / `real_expr_to_smtlib` in `src/pr_sat.ts`; the model evaluator uses `constraint_to_bool` / `real_expr_to_arith` in `src/z3_integration.ts`. Compound metalinguistic constraints have always been supported — this enables single-input theorem-checking by entering the negation of a putative theorem and looking for UNSAT.

## Companion: Mathematica PrSAT Reference

Lives at `../PrSAT 3.0/PrSAT_3_Mathematica/` (separate from the TS source-of-truth at `../PrSAT 3.0/PrSAT-main/`). As of **2026-04-25** the Mathematica `Method -> "Random"` path uses our compiled Nelder-Mead implementation by default (~5× end-to-end on real problems, ~1000× on the inner search). `SearchAttempts` default bumped from 3 to 10. Both `PrSAT.m` and `PrSAT_Cloud.m` remain single self-contained packages — helpers inlined directly. Backups: `<file>.bak.before-compiled-random-2026-04-25` in the same directory.

Standalone PoC for experimenting: `mathematica_compiled_random/CompiledRandomSearch.m` + `benchmark.m` + `README.md` in this folder. Run benchmark with `WolframKernel=/Applications/Wolfram.app/Contents/MacOS/WolframKernel wolframscript -file benchmark.m` (the env var override is required on this machine; plain `wolframscript` errors with "WolframKernel location could not be determined").

## Recent Work (2026)

- **2026-07-13:** Restored the simple solver boundary. Classical, ERS, and CCK
  Z3 now use direct translation plus normalization-state elimination; the Z3
  equation preprocessor, exact-witness presearch, reduced-chart fallback,
  ratio/product controls, and canonical polynomial pass were removed. Random
  Search retains browser/Maple equation solving. Regular Z3 retains only the
  cheap omission of redundant nonzero guards and impossible totalized-zero
  branches for nonempty state-mass sums.
  See `ALGEBRAIC_PREPROCESSING_EXPERIMENTS_2026-07-13.md` for the superseded
  strategies and benchmark results. The corrected Bayes-factor form of the
  strict regular ERS benchmark solved UNSAT in about 40 seconds in-browser and
  14.03 seconds in native Z3; a focused settings sweep produced no speedup.
- **2026-07-11:** Completed the equation-solver implementation and soundness
  review. Added factored rational-row preprocessing, condition-aware localized
  ideal reduction, a zero-dependency guarded branch solver with bounded lex
  Gröbner triangularization, pseudo-resultants, factor branching, and exact
  back-substitution. Wired equation solving before Random Search and optionally
  before classical/ERS/CCK Z3; Maple 2024 is an explicit Random Search choice.
  Fixed branch-root memoization, expanding-reduction regressions, legacy API
  coefficient-zero branch loss/compact-model corruption, and false ERS SAT at
  totalized zero denominators. Centralized reduced Z3 validation/fallback,
  moved Z3 preprocessing to a cancellable worker, made Gröbner work
  deadline-aware, and made bridge cancellation kill Maple. Verification:
  production build and lint pass; 749 unit tests pass (1 skipped, 1 todo); 27
  Chromium tests pass (1 skipped); live localhost 5317 and Maple 2024 bridge
  healthy.
- **2026-07-10:** Completed the full experimental-branch review repair set.
  Fixed negative-power soundness in classical/ERS/CCK, branch-local model and
  exact-rational evaluation (including Random Search), conventional connective
  precedence, stale debounced-input solving, bounded cancellation cleanup,
  declared-real ERS/CCK evaluation, worker crash/message handling, and
  truth-table/exponent/search resource caps. Hardened the localhost Maple bridge
  against cross-origin and oversized/concurrent requests without breaking its
  six integration benchmarks. Upgraded Vite/Vitest/Playwright/ESLint, removed
  the local repo's deploy command and every Firefox test target, and reduced
  `npm audit` to zero vulnerabilities. Verification: `npm run build` and
  `npm run lint`; 723 unit tests passed; 24 Chromium tests passed; 6 Maple
  integration tests passed; `http://localhost:5317/` and port 31415 healthy.
- **2026-06-24:** Added `Trivalent (CCK)` as a second trivalent semantic mode. The user-facing language still has one conditional token, `->`; ERS and CCK are mutually exclusive semantic selections. CCK uses `3^n` atomic rows with `N` values, strong Kleene `~`, `&`, `v`, Cooper `->`, and Cantwell probability over true-plus-false rows. Pure CCK translation lives in `src/cck.ts`; the Z3 wrapper is separate in `src/cck_sat.ts` so Random Search workers stay Z3-free. Fixed the shared ERS/CCK Random Search + Maple extractor so non-`1` totalized `ite(d = 0, 1, n/d)` probability equations contribute the `n/d = c` polynomial branch to Maple; `= 1` cases stay residual because the zero-denominator branch can really satisfy them. Verification: `npm run build`; `npx tsc --noEmit`; full `npx vitest --run` (710 passed, 1 skipped); focused ERS/CCK/Maple suite (13 passed).
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

**After changes:** Run `npm run build` to check for TypeScript errors, then
`npm run test:unit` for the unit suite. The script serializes test files so
optional Maple integration tests do not race against the bridge's one-request
limit.

## Family-Wide Regression Contracts

Canonical shared suite: `fitelson/PrSAT-family-contracts` (local checkout: `../prsat-family-contracts` relative to the `todo` directory). This application uses the `prsat-3.1-experimental` profile.

Every bug that can affect more than one PrSAT-style web app must first receive a browser-level regression in `PrSAT-family-contracts/tests/family.spec.mjs`. Keep application-specific semantics in `profiles.mjs`; do not weaken a shared contract merely to accommodate drift.

The branch-local `.github/workflows/family-contracts.yml` calls the complete four-application matrix on every push and pull request. The canonical repository also runs it daily. A failure in another application is a synchronization failure that should be fixed or explicitly modeled as a profile difference.

Run this application locally from the contracts checkout with:

```sh
npm run test:app -- prsat-3.1-experimental "../PrSAT 3.1 (experimental)"
```
