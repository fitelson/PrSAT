# PrSAT 3.1 (experimental) Changelog

> **Note:** Experimental fork of 3.0 to prototype a Random Search solver alongside Z3. Not deployed. See `RANDOM_SEARCH.md` for the design, `CLAUDE.md` for guidance.

## 2026-06-23

### Added: Pr3SAT / trivalent probability mode

Added an experimental Pr3SAT mode for Cooper-style trivalent probability:

- New semantic core in `src/cooper.ts`, with the three-valued truth table over every sentence letter and probability of `A` computed as true mass over true-plus-false mass.
- Z3/SMT wrapper in `src/pr3_sat.ts`; the visible UI keeps the existing solver selector and adds a `Trivalent (ERS)` checkbox so the same language can be read classically or trivalently.
- The object-language conditional remains the single token `->`. In classical mode it has the material semantics; in trivalent mode it has the Cooper conditional semantics. Conditional probability `Pr(B | A)` is translated as `Pr(A -> B)` under the selected semantics.
- Model evaluation uses the selected semantics too, so the evaluator pane reports trivalent values when `Trivalent (ERS)` is checked.
- Random Search is wired through the same semantics flag and imports the pure Cooper translator rather than the Z3-facing Pr3SAT wrapper, keeping the worker bundle independent of Z3.
- Result rendering marks trivalent SMT results as `Pr3SAT: ->_3 / Z3` and trivalent random-search results as `Trivalent Random Search`.
- Fixed trivalent Random Search + Maple branch verification for zero-denominator case expressions: state-index substitution now descends into internal `ite` real expressions, with a regression covering `Pr(P -> Q) = 1/4`, `Pr(Q)=1/6`, `Pr(Q -> P) = 1`, and `Pr(P)=2/3`.

Verification: `npm run build`; `npx vitest --run` (700 passing, 1 skipped); focused `npx vitest --run src/random_search.spec.ts src/pr3_sat.spec.ts` (36 passing).

### Decision: keep Maple as the equation solver for Random Search

Revisited browser-runnable alternatives to Maple for the Random Search equation-solving phase:

- Pyodide/SymPy solved toy systems but timed out on the likelihood-ratio benchmark.
- Browser Giac/Xcas (`giac.js`) ran headlessly and solved toy equations, but returned unusable branches for the simple independence benchmark and errored on the likelihood-ratio benchmark.
- Maple 2024/2026 solved the substantive benchmark systems quickly and returned exactly the rational-function branches the current verification pipeline consumes.

So the supported equation-solving accelerator remains the optional local Maple bridge. `RANDOM_SEARCH.md` records this decision.

## 2026-06-12

### Verified: Regular mode on the independence benchmark

With Regular checked (all a_i > 0), the 3-wise-independence system correctly excludes the all-eighths witness and finds a strictly positive pretty one: a_i ∈ {1/144, 17/144} — the 8/9 : 1/9 mixture of the XOR distribution with the uniform — max denominator 144, ~6s via the bridge, all constraints exactly verified under strict positivity. Both behaviors (non-regular → eighths; regular → 144ths) are bridge-gated regression tests in `src/maple_bridge.spec.ts`.

### Changed: pretty witnesses only

Random Search no longer returns ugly-but-exact models (Branden's rule). On the 16-state 3-wise-independence system, certification previously fell through to fine-tolerance continued fractions, producing exact models with ~10^30 denominators (displayed lossily through floats, e.g. "3.19e+29/6.51e+30"). Now:

- **Prettiness gate** (`is_pretty_model`): a model is only accepted when every state value's denominator is ≤ 10,000 (`DEFAULT_MAX_MODEL_DENOMINATOR`); otherwise the search continues.
- Continued-fraction rationalization is bounded to COARSE tolerances (12 halvings from 1/4) on all certification paths — fine tolerances only produced gate-rejected candidates.
- **Exact display**: `ModelAssignmentOutput` literals now carry exact digit strings (`source`) when the value exceeds 2^53, so big numbers can never again be rendered through lossy floats (display + to_string paths).

Result on the independence system via the bridge: the canonical XOR witness — 1/8 on each state where U matches the parity of X,Y,Z, 0 elsewhere — max denominator 8, in ~9s.

### Added: Web Worker execution + permanent local install

- **Random Search now runs in a Web Worker** (`src/random_search_worker.ts`), like Z3: translation, equation elimination, Gröbner, Maple-branch search, Nelder-Mead, and exact verification all happen off the main thread. No constraint system can freeze the page; Cancel is a clean `worker.terminate()`. The exact rational model crosses the worker boundary as plain data (`rational_model` on the result) and the main thread rebuilds the model evaluator from it.
- **Conversion cap** (20,000 terms) on cross-multiplied equation polynomials: 6-letter systems with triple-product equations (64 state variables) exploded the conversion; oversized equations now stay in numeric division form for the cost function. Confirmed working by Branden on a 64-state, ~35-equation hierarchical-model system.
- **Permanent local install**: `maple_bridge/serve_dist.mjs` (static server with COOP/COEP headers, port 5317) + two LaunchAgents (`org.fitelson.prsat31.web`, `org.fitelson.prsat31.maple` in `~/Library/LaunchAgents`, logs in `~/Library/Logs/prsat31/`) so http://localhost:5317/ and the Maple bridge are always available, surviving reboots.
- Retitled the app to "PrSAT 3.1 (experimental)"; removed the 3.0 webpage/demo header links.

### Added: local Maple bridge — browser as frontend, desktop Maple as equation oracle

Confirmed working in-browser by Branden on both benchmark systems. New architecture option for the experimental fork (deployed PrSAT remains 100% in-browser): `npm run maple-bridge` starts a zero-dependency local server (`maple_bridge/server.mjs`, port 31415) that runs `/Applications/Maple 2024/maple` on the cross-multiplied equation polynomials and returns `solve`'s solution branches. The browser (`src/maple_bridge_client.ts` + `src/maple_expr.ts`) parses each rational-function branch back into RealExpr ASTs (RootOf/float branches discarded — sound incompleteness), substitutes into the remaining inequalities, random-searches the branch's free variables, snaps to small fractions, evaluates the solved variables exactly, and verifies the full system in exact rational arithmetic — PrSAT.m's `sol1[[i]]` loop with Maple as the Solve oracle. UI: "Maple bridge: connected/off" indicator next to the Random Search options (click to re-check); result badge shows "via Random Search + Maple bridge". Automatic fallback to the pure-browser pipeline when the bridge is off or no branch certifies. Tests: `src/maple_bridge.spec.ts` (self-skips without the bridge).

### Fixed: Random Search responsiveness and blowup guards

- Cooperative yielding + abort checks in all certification passes (Random Search runs on the main thread, unlike Z3's WASM workers; heavy passes froze the page — twice, in Branden's live testing).
- Hard term-count cap (1200) on substituted polynomials in the successive elimination: candidates that would explode are skipped (the 16-state 3-wise-independence system detonated the uncapped version).
- Pass-2 certification budgets: q ≤ 48, ≤ 8 subsets, tight in-loop Gröbner caps, ≤ 120 zero-dim solves per attempt, q-outer/subset-inner loop order. Pure-browser certification of the likelihood-ratio system: SAT in ~8 min (vs seconds via the bridge).

### Added: snap-then-re-eliminate + pure-TS Gröbner certification (closes the case study)

The likelihood-ratio-difference system below is now solved EXACTLY by the web-ready pipeline: certified model a = (1/8, 1/8, 5/8, 0, 0, 1/28, 5/112, 5/112) on the first search attempt. New pass 2 in `try_rationalize_and_verify`'s successor (`src/random_search.ts`): pin a snapped subset of the free coordinates, re-run the successive elimination on the full original equation system at those values, and finish any stuck zero-dimensional remainder with `src/groebner.ts` — a pure-TypeScript lex Gröbner basis (capped Buchberger) plus exact rational-root enumeration and back-substitution, i.e. the algorithmic core of a CAS `solve` without shipping a CAS. All answers remain exactly verified; irrational solutions are soundly missed. Regression test: `src/likelihood_ratio_system.spec.ts`. Full suite: 669 passing.

### Case study: likelihood-ratio-difference system (8 states, 4 rational equations)

Documented in RANDOM_SEARCH.md: equation elimination absorbs 3 of the 4 equations, Nelder-Mead then converges on every attempt, but exact certification needs either a CAS-derived branch parameterization (desktop Maple solves the system into 5 rational branches; exact model a = (1/24, 1/24, 7/12, 0, 0, 1/24, 7/48, 7/48)) or the planned snap-then-re-eliminate pass (RANDOM_SEARCH.md "v2.5"). Test harness: `src/tmp_branden_system.spec.ts`.

### Added: Equation elimination — Random Search now handles equational constraints

Random Search was nearly useless on systems containing equations (the cost term `(x−y)² − margin²` only rewards landing within ~1e-3 of the solution manifold, and rationalization rarely snapped onto it). Now, mirroring the Mathematica reference's equation phase (PrSAT.m ~1015–1060, `Solve` + substitute + search inequalities), a new module `src/equation_elimination.ts` solves the equations symbolically BEFORE the search:

- Top-level equation conjuncts are cross-multiplied to polynomials over the state variables (exact rational coefficients). Successive elimination then repeatedly finds an equation linear in some one variable v (E = A·v + B = 0) and substitutes v = −B/A: ordinary linear elimination when A is constant (covers Pr-value and conditional-probability equations and the Σ a_i = 1 axiom), generic-branch (A ≠ 0) rational-function substitution when A is nonconstant (covers independence `Pr(A∧B) = Pr(A)·Pr(B)` and most textbook nonlinear systems). Only equations with every variable squared-or-higher stay in the numeric cost.
- The random search then runs over only the remaining free variables; pinned variables are reconstructed exactly, so all consumed equations hold by construction, and the usual exact verification checks the full original system (SAT answers always sound).
- Sound UNSAT, sometimes: a contradiction derived purely by constant-denominator (linear) steps refutes the system — e.g. `Pr(A) = 1/2 & Pr(A) = 1/3` now reports UNSAT, as does a unique linear solution that violates an inequality. Contradictions reached through generic-branch substitutions only refute that branch and fall back to linear-only elimination.
- Boundary fix: certainty constraints like `Pr(S) = 1` pin states to 0, where non-strict axioms sit exactly on their boundary and the old strict `fMin < 0` acceptance could never fire; acceptance is now `fMin < 1e-9` (`NUMERIC_ACCEPT_EPS`), with exact verification as the judge.
- The old eliminate-last-state-variable step is subsumed (it is just linear elimination of Σ a_i = 1).
- Tests: `src/equation_elimination.spec.ts` — unit tests for the elimination plus end-to-end Random Search runs: Titelbaum 2.10 (four equations, three letters) now SAT; independence + inequalities SAT; unique-solution systems solved with zero search attempts; linear contradictions UNSAT. All 666 unit tests pass.

### Added: Decimals toggle in Evaluate model

New "Decimals" button to the right of Clear in the Evaluate model toolbar. Toggles all evaluation results between exact rationals and 4-decimal-place approximations (e.g. 111/88 vs 1.2614); the button relabels to "Fractions" while decimals are shown. Quadratic-root values use their decimal approximation; higher-degree roots keep their exact display. Implemented via a `show_decimals` editable in `model_evaluators` (`src/text_to_display.ts`) and a new optional `extra_toolbar_buttons` parameter on `generic_input_block` (`src/block_playground.ts`).

### Improved: Random Search now produces small fractions

Random Search models previously came back with huge denominators (worst observed: ~10^20 on the eliminated coordinate). Two fixes in `src/random_search.ts`:

- **Polish pass:** Nelder-Mead early-stops the instant the cost dips below 0, leaving the point barely inside the feasible region. After that first success we now re-run `minimize` from the found point without the early stop, pushing the point deep into the region so coarse rationalizations survive exact verification.
- **Small-denominator rationalization** (`try_rationalize_and_verify` rewritten): first a common-denominator scan -- snap all coordinates to multiples of 1/q for q = 1, 2, ..., 200 and return the first q that verifies exactly (uniform small denominator, Mathematica-style models); then a coarse-to-fine continued-fraction fallback starting at tol = 1/4 (the old code started at reg_margin/2 = 5e-4 and only refined, guaranteeing large denominators).

On the likelihood-ratio test case (`Pr(H1|E1) - Pr(H1) > Pr(H2|E2) - Pr(H2)`, `Pr(E1|H1)/Pr(E1|~H1) < Pr(E2|H2)/Pr(E2|~H2)`, 16 states), three seeds now give max denominators 16, 38, 25 (previously 42, 181, ~7.6e20). Regression test: `src/small_fractions.spec.ts`. All 656 unit tests pass.

## 2026-04-25

### Added: Compiled-NM random search for the Mathematica PrSAT reference

Ported the TS Random Search win back into the Mathematica reference (`../PrSAT 3.0/PrSAT_3_Mathematica/`). The stock `Method -> "Random"` path used `NMinimize[..., Method -> "RandomSearch", ...]` over a *symbolic* `Max`/`Min` cost tree — every optimizer call walked the tree through Mathematica's interpreter. We replaced the inner search with `Compile[..., CompilationTarget -> "C"]` of the same cost expression plus a hand-rolled Nelder-Mead loop. PrSAT's existing rationalization/`Verify` step (lines ~960–985) handles the float→exact-rationals conversion unchanged.

**Approach:** for each constraint `(translated, sol1-substituted)` system, build the same scalar cost `f` the Mathematica path would have built; inline `sysCons` (probability-axiom box constraints) into `f` as `Max` terms so the compiled NM cannot escape the simplex; compile to a `CompiledFunction`; run hand-rolled Nelder-Mead with `EarlyStopBelow -> 0`; return `{value, varRules}` matching `NMinimize`'s signature so downstream rationalization is unchanged.

**End-to-end speedup on `mpr2` (6 events, 2 nontrivial polynomial inequalities, 63-dim state, identical seed):**
| configuration | `SearchAttempts` | wall(s) | model |
|---|---|---|---|
| stock PrSAT.m + NMinimize-RandomSearch | 3 | 23.9 | exact rationals |
| modified PrSAT.m + compiled NM | 10 | 6.3 | exact rationals |

3.8× faster end-to-end despite 3× the retry budget. Inner-loop microbenchmarks (`mathematica_compiled_random/benchmark.m` on 6 small problems) show 200×–25 000× speedup of just the search portion (geomean ~1 000×); on real problems the build/compile prep dominates and the headline becomes ~5×.

**Changes (in the 3.0 Mathematica directory; user explicitly OK'd modifying it):**
- `PrSAT.m`: `Method -> "Random"` (was `"NM"`); `SearchAttempts -> 10` (was 3); ~150 lines of helpers inlined before `MAIN PRSAT FUNCTION` (`AugmentCostWithSysCons`, `CompileCostFunction[, WVM]`, `NelderMead`, `CompiledRandomSearchInner`); `Method == "Random"` branch routed through `CompiledRandomSearchInner`.
- `PrSAT_Cloud.m`: same four changes; helpers inlined since Cloud has no co-located file system.

The default-Method change means plain `PrSAT[constraints]` now uses the compiled path. Users who explicitly pass `Method -> "NM"` still get the legacy `NMinimize` flow (untouched).
- Backups at `PrSAT.m.bak.before-compiled-random-2026-04-25` and `PrSAT_Cloud.m.bak.before-compiled-random-2026-04-25`.
- Both files remain single self-contained packages.

**Standalone PoC kept in this folder:** `mathematica_compiled_random/CompiledRandomSearch.m` plus `benchmark.m` and `README.md`. The latter is a richer entry point for experimenting (exposes `BuildCostExpression`, `RationalizePoint`, `CompiledRandomSearchSolve`).

**Subtleties learned the hard way:**
- `ValueQ[fn]` returns `False` for functions defined via `fn[x_] := ...` because `ValueQ` only inspects `OwnValues`, not `DownValues`. Use `Length[DownValues[fn]] > 0` for "is this defined?" guards. Got us a recursive-load infinite loop the first try.
- `Inequality[a_, b_, c_, d_, e_]` and `Less[a_, b_, c_]` (chain forms) auto-evaluate inside rule LHSs and refuse to match unless wrapped in `HoldPattern[]`.
- Putting both chain-decomposition rules and an `And[xs__] :> Sequence[xs]` rule in a single `ReplaceAll` silently disables the chain rules (Mathematica peculiarity); apply them in two `/.` passes.
- `Simplify` on the augmented cost expression blows up combinatorially on dense equation systems; skip it when `LeafCount[...] >= 5000`. (Compile doesn't need a simplified form.)

## 2026-04-24

### Added: Random Search solver (port of Mathematica `Method -> "Random"`)

Ports the random-search branch of the Mathematica reference PrSAT (`../PrSAT 3.0/PrSAT_3_Mathematica/PrSAT.m` lines 886–995) to pure TypeScript. New "Solver" dropdown lets users pick **Z3 (SMT)** (default) or **Random Search**.

**Algorithm:**
1. Translate user constraints (Pr → state_variable_sum) + enrich with probability axioms and div0 conditions, then eliminate the last state variable.
2. Build a numeric cost function `f` with `f(x) < 0` iff all constraints are satisfied (at `margin = 1e-6`). Equality atoms are relaxed to `(x-y)^2 - margin^2` (divergence from Mathematica's `ZeroJump`, which requires exact zero — Nelder-Mead can't reliably hit that).
3. For up to `search_attempts` (default 3) iterations: sample an initial point from Dirichlet(1,...,1), run Nelder-Mead with early-stop at `f < 0`, then rationalize the numerical result via continued fractions (starting at `reg_margin/2`, halving 40 times) and verify against the enriched constraints under exact BigInt rational arithmetic.
4. If any attempt verifies: SAT. Otherwise: unknown. **Random Search cannot prove UNSAT**.

**New files (all under `src/`):**
- `rationalize.ts` + spec — BigInt Rational type, arithmetic, continued-fraction `rationalize`, exact `evaluate_real_expr_rational` / `evaluate_constraint_rational`, `verify_rational_model`.
- `cost_function.ts` + spec — `normalize_constraint` (De Morgan + iff/imp expansion), numeric evaluator, `build_cost_function` that walks the normalized AST emitting a scalar.
- `optimizer.ts` + spec — self-contained Nelder-Mead simplex (α=1, γ=2, ρ=0.5, σ=0.5) with `earlyStopBelow` and optional AbortSignal polling.
- `random_search.ts` + spec — `random_pr_sat_wrapped` orchestrator (matches `pr_sat_wrapped` signature), Dirichlet sampler, rational → `ModelAssignmentOutput` converter, `evaluate()` closure using rational arithmetic (for the UI's "Evaluate model" feature).

**UI (in `src/text_to_display.ts`):**
- New "Solver:" dropdown (Z3 / Random Search) next to Regular/Timeout.
- Seed + attempts inputs, visible only when Random Search is selected.
- SAT/unknown/cancelled status line shows a small "(via Random Search, seed: ..., attempt k/k, best f=...)" badge for random-search runs.
- Cancel button works for random search (polled between Nelder-Mead iterations and between retry attempts).

**Defaults (match Mathematica):** `margin = 1e-6`, `reg_margin = 1e-3`, `search_attempts = 3`, `max_rationalize_attempts = 40`. **v1 limitations:** free real variables rejected with a clean error; non-integer `RealExpr.power` causes rational verification to fail (returns unknown); Nelder-Mead degrades above ~20 free dimensions (5+ letters).

**Tests:** 88 new unit tests (rationalize: 35, cost_function: 22, optimizer: 9, random_search: 22) + 3 new Playwright e2e tests exercising the solver dropdown. All 655 unit tests pass in this folder (567 pre-existing + 88 new).

**Observed behavior (after initial testing):** Random Search works well on inequality constraints and simple equalities like `Pr(A) = 1/2`. Heavily equational systems (e.g. independence `Pr(A & B) = Pr(A) * Pr(B)`) often require hitting exact irrational/high-denominator rationals and fall back to `unknown` — use Z3 for those. See `CLAUDE.md` "Random Search — where it shines and where it doesn't".

### Fixed: blank page on first load

`solver_method.watch(...).call()` invoked `invalidate()` before `invalidate` was defined in the closure, throwing a `ReferenceError` during module init and leaving the body blank. Removed the eager `.call()` and set the initial `display: none` inline on the random-options row instead.

## Pre-existing 3.0 history (forked from)

## 2026-06-12

### Added: Decimals toggle in Evaluate model

New "Decimals" button to the right of Clear in the Evaluate model toolbar (ported from the 3.1 experimental fork). Toggles all evaluation results between exact values and 4-decimal-place approximations (e.g. 111/88 vs 1.2614); the button relabels to "Fractions" while decimals are shown. Quadratic-root values show their decimal approximation; higher-degree roots keep their exact display. Implemented via a `show_decimals` editable in `model_evaluators` (`src/text_to_display.ts`) and a new optional `extra_toolbar_buttons` parameter on `generic_input_block` (`src/block_playground.ts`). Verification: `npm run build` passes; `npx vitest --run` passes (585 tests, 1 skipped). Committed (3ff62b6), pushed, and deployed to fitelson.org on 2026-06-12.

## 2026-06-10

### Fixed: Soundness and Runtime Bugs from June 2026 Review

- Fixed SMT-LIB emission for nested constraint-level conditionals so `=>` stays binary instead of being flattened into an invalid n-ary/right-association shape.
- Fixed nested subtraction and division emission so right operands are preserved instead of being flattened into left-associative n-ary arithmetic.
- Reworked exponentiation support: integer literal powers are expanded to multiplication/division before reaching Z3, while unsupported non-integer exponents fail with a clear error.
- Fixed parser backtracking for chained sentence/constraint connectives by replacing repeated alternatives with right-associative chain parsing.
- Preserved exact numeric literal source text for large/precise literals so SMT-LIB output no longer silently rounds values or emits JS scientific notation.
- Scoped conditional-probability denominator guards to their logical context instead of globally hoisting `Pr(Y) != 0` assertions under disjunction/conditional/biconditional contexts.
- Declared and evaluated free real variables in solver/evaluator paths, and skipped non-state real declarations during probability-table model extraction.
- Added Z3 native timeout support to the live wrapped solver path.

### Fixed: UI, Input, Display, and Data-Structure Bugs

- Fixed timeout clearing, stale exception/status display, repeated cancel clicks, disabled solve options during active solves, empty-constraint Find Model enablement, save-table-image padding restoration, and global unhandled-rejection messages.
- Fixed batch/file input synchronization, repeated load of the same file, clipboard error handling, stale async display output after edits/removals, focused-row removal, and redundant focus churn.
- Hid the degenerate one-state `a_i` table, model evaluator pane, and save-table-as-image control for arithmetic-only constraints with no sentence letters.
- Fixed rational model stringification, root polynomial exponent/trailing-zero handling, displayed polynomial signs, exact S-expression matching, abortable sleep cleanup, `EditableDLL.watch_remove`, duplicate-data `DLL.insert_before`, and bounded random floats.

### Changed: Build, Deploy, and Documentation

- `npm run build` now refreshes bundled Z3 WASM/JS assets before TypeScript/Vite build.
- `npm run deploy` now uploads `dist/.` so dotfiles such as `.htaccess` are included.
- Production `.htaccess` now caches JS/CSS/WASM assets aggressively while keeping HTML fresh.
- Updated README clone URL, in-app help text, project webpage syntax/results text, and removed the stale Vite favicon link.
- Added regression tests for the critical SMT-LIB soundness failures, parser/numeric-literal fixes, model parsing/display helpers, S-expression matching, and input focus behavior.
- Verification: `npm run build` passes; `npx vitest --run` passes with 585 tests passing and 1 skipped.

## 2026-04-18 (later)

### Upgraded: z3-solver 4.15.4 → 4.16.0

- Bumped `z3-solver` to the latest upstream release. Rebuilt bundled WASM assets. All 567 unit tests pass.

**Changes:**
- `package.json`, `package-lock.json`: `z3-solver` 4.15.4 → 4.16.0
- `public/z3-built.js`, `public/z3-built.wasm`: refreshed via `npm run copy-files`

## 2026-04-18

### Documented: Logical Combinations of Probabilistic Constraints

- Documented on the project webpage that the same logical connectives (`~`, `&`, `v`/`\/`/`∨`, `->`/`>`/`→`, `<->`/`<>`/`↔`) work at two levels: sentence-level (inside `Pr(...)`, joining statements of propositional calculus) and constraint-level (joining whole probabilistic constraints). Added a side-by-side comparison table.
- Fixed two typos in the in-app input instructions where the conditional connective (`->`/`→`/`>`) was mislabeled as "biconditional" in both the Constraint and Sentence sections.

**Changes:**
- `webpage/index.html`: New "Logical Combinations of Probabilistic Constraints" subsection under Syntax & Usage
- `src/constants.ts`: Corrected "biconditional" → "conditional" for the `->`/`→`/`>` rules in `CONSTRAINT_INPUT_INSTRUCTIONS`
- `src/compound_constraint_demo.spec.ts`: Added regression test that parses a compound constraint built from `&` and `<->` and verifies it via Z3

## 2026-02-28

### Added: Contributors Section to README

- Added Contributors section listing Koissi Adjorlolo, Claude, and Branden Fitelson
- Re-authored initial commit to Koissi Adjorlolo so he appears in GitHub's Contributors sidebar

**Changes:**
- `README.md`: Added Contributors section at top of file

### Changed: Source Code Link on Webpage

- Updated the source code link on the project webpage from `github.com/imapersonman/PrSAT` to `github.com/fitelson/PrSAT`

**Changes:**
- `webpage/index.html`: Updated GitHub URL in the Source Code section

## 2026-02-16

### Changed: "No model to display" Punctuation

- Changed "No model to display!" to "No model to display." (period instead of exclamation mark)

**Changes:**
- `src/text_to_display.ts`: Updated message text in `model_finder_display`

### Added: Deploy Script

- Added `npm run deploy` script that builds and uploads `dist/` to fitelson.org via `scp`

**Changes:**
- `package.json`: Added `deploy` script

### Fixed: Dev Server Command in README

- Fixed the "Running the development server" section: changed `npm install` to `npm run dev`

**Changes:**
- `README.md`: Corrected the command in the dev server instructions

## 2026-02-13

### Removed: GitHub Actions CI Workflows

- Removed Playwright and static deployment CI workflows (not needed — tests are run locally)

**Changes:**
- `.github/workflows/playwright.yml`: Deleted
- `.github/workflows/static.yml`: Deleted

## 2026-02-11

### Removed: Redundant Clear Button from Model Evaluate Dialog

- Removed the Clear button that appeared next to the "Evaluate model" heading
- The block's own Clear button (in the Load/Save/Clear/Batch toolbar) remains

**Changes:**
- `src/text_to_display.ts`: Removed `clear_all` function and inline Clear button from model evaluators section

## 2026-02-03

### Added: "v" as Disjunction Symbol

- The parser now accepts lowercase `v` as a disjunction symbol in addition to `∨` and `\/`
- Users can now write `A v B` instead of `A \/ B` or `A ∨ B`

**Changes:**
- `src/pr_sat.ts`: Added `'v'` to `possible_constraint_connectives.disjunction` and `possible_sentence_connectives.disjunction`
- `src/constants.ts`: Updated instruction text to include `v` option and removed "(hint: the '∨' is NOT a v)" notes

### Simplified: Syntax Error Message

- Simplified syntax error display for invalid constraint entries
- Previously showed "ⓘ Error!" button with detailed parser error in popup
- Now shows "Syntax error (not a wff)." directly on the button
- Instructions popup still available when clicked

**Changes:**
- `src/block_playground.ts`: Changed error state button text from `INFO_MESSAGE_ERROR` to `"Syntax error (not a wff)."`; removed error message appended to popup

## 2026-01-31

### Added: Clear Button for Constraint Entry

- Added "Clear" button to the main constraint entry area, positioned to the right of "Show Batch Input"
- Clicking it resets all constraints to a single empty input box

**Changes:**
- `src/block_playground.ts`: Added `clear_button` in `generic_input_block()` that calls `block.set_fields([''])`

## 2026-01-29

### Improved: Simplified Quadratic Irrational Display

- Quadratic irrationals are now displayed in simplified form with decimal approximation
- Previously showed verbose unsimplified quadratic formula: `(-6 + √(6² - 4*8*(-1))) / (2*8)`
- Now shows simplified exact form plus decimal: `(-3 + √17) / 8 ≈ 0.1404`

**Simplifications applied:**
- Computes discriminant `b² - 4ac`
- Extracts perfect square factors from the radical (e.g., `√68 = 2√17`)
- Reduces fraction by GCD of numerator terms and denominator
- Appends 4-decimal approximation

**Special cases:**
- Perfect square discriminant: displays as rational number (no radical)
- Denominator of 1: omits fraction bar
- Zero constant term: shows just the radical term

**Changes:**
- `src/text_to_display.ts`: Added `gcd`, `gcd3`, `extractPerfectSquare`, `simplifyQuadraticRoot` helper functions; rewrote `quad_root_to_display` to use simplified form

## 2026-01-28

### Fixed: False "Division by zero!" in Model Evaluator

- Division-by-zero check now correctly handles the eliminated state variable
- Previously, `Pr(X | ~Y)` would incorrectly show "Division by zero!" even when `Pr(~Y) > 0`, because the eliminated state variable (e.g., `a_4`) was not substituted before evaluation — Z3's model completion assigned it 0

**Example:** With a model where `a_2 = 0` and `a_4 = 1/2`, evaluating `Pr(X | ~Y)` no longer falsely reports division by zero (`Pr(~Y) = a_2 + a_4 = 1/2`)

**Changes:**
- `src/z3_integration.ts`: Div-by-zero constraints now go through `eliminate_state_variable_index_in_constraint_or_real_expr()` before evaluation, matching what was already done for the main expression

### Fixed: Conditional Probability Division by Zero

- Model evaluator now correctly shows "Division by zero!" for conditional probabilities when the condition has probability zero
- Previously, `Pr(A | B)` would incorrectly evaluate to `0` when `Pr(B) = 0`; now it correctly reports undefined (0/0)

**Example:** With a model where `Pr(~Q) = 0`, evaluating `Pr(P | ~Q)` now shows "Division by zero!" instead of `0`

**Changes:**
- `src/pr_sat.ts`: `div0_conditions_in_real_expr()` now generates a div-by-zero check for `given_probability` expressions
- `src/z3_integration.ts`:
  - Fixed `real_expr_to_arith()` to construct state variable sums symbolically (was incorrectly evaluating the first variable)
  - Added `model_completion` parameter to `model.eval()` to correctly evaluate eliminated state variables in div-by-zero checks

### Updated: Video Demo Link

- Changed video demo URL to `https://youtu.be/F_WbzKr7qJQ`

**Changes:**
- `src/text_to_display.ts`: Updated link in the intro section

## 2026-01-26

### Added: Save Table as Image Button

- New "Save table as image" button exports the probability table as a high-resolution PNG (2x pixel ratio)
- Button appears on its own row below the "Save translated constraints" and "Save SMTLIB input" buttons
- Only appears when a model is found (SAT result)
- The other two save buttons now appear for all solver results (SAT, UNSAT, cancelled, etc.)

**Changes:**
- `package.json`: Added `html-to-image` dependency
- `src/text_to_display.ts`: Added import and button logic in `start_search_solver`

### Simplified: Timeout Input

- Replaced hours/minutes/seconds fields with a single "seconds" field
- Default: 60 seconds, range: 1-3600 seconds

**Changes:**
- `src/text_to_display.ts`: Simplified `timeout()` function to single seconds input
- `tests/test_ids.ts`: Removed unused `hours` and `minutes` test IDs
- `tests/simple.spec.ts`: Updated `set_timeout()` helper function

## 2026-01-25

### Updated: Video Demo Link

- Changed video demo URL to `https://youtu.be/KKVGHH0zCQM`
- Link text changed from "brief video demo" to "Here"

**Changes:**
- `src/text_to_display.ts`: Updated link in the intro section

### Added: Demo Text File Download Link

- Added link to download the demo text file after the video demo sentence
- Link points to `https://fitelson.org/PrSAT/PrSAT_3.0_demo_examples.txt`

**Changes:**
- `src/text_to_display.ts`: Added download link in the intro section

### Changed: Consistent State Variable Naming

- State variables now use `a_i` naming (1-indexed) throughout the application
- Previously, saved constraints and SMTLIB output used `s_i` (0-indexed) while the HTML display used `a_i` (1-indexed)
- Now all outputs are consistent: `a_1`, `a_2`, etc.

**Changes:**
- `src/pr_sat.ts`: `state_index_id()` now returns `a_${index + 1}` instead of `s_${index}`
- `src/z3_integration.ts`: `model_to_assigned_exprs()` now converts 1-indexed variable names back to 0-indexed internal indices when parsing Z3 model output

### Improved: Immediate Display of Translated Constraints

- Translated constraints now appear immediately when "Find Model" is pressed, before the solver starts searching
- Previously, constraints only appeared after the solver finished
- Save buttons ("Save translated constraints", "Save SMTLIB input") appear once solving completes

**Changes:**
- `src/z3_integration.ts`: Added `onTranslated` callback to `SolverOptions2`
- `src/text_to_display.ts`: Updated `start_search_solver` to display constraints via the callback

### Fixed: Cancel/Timeout Now Preserves Display

- Translated constraints and probability table now remain visible after cancel or timeout
- Previously, cancelling a search would clear the bottom part of the page

**Root Cause:** When Z3 reinitializes during cancel, it triggered `invalidate()` while state was still 'looking', which set state to 'waiting' and cleared the display.

**Changes:**
- `src/z3_integration.ts`: Z3 now reinitializes after any cancel, ensuring clean state for next search
- `src/text_to_display.ts`:
  - `invalidate()` now skips when state is 'looking' to prevent clearing display during cancel
  - Removed page reload from `cancel_fallback` - Z3 reinitialization is sufficient
  - Exception state now re-enables the "Find Model" button

### Added: Clear Button for Evaluate Model

- Added "Clear" button next to "Evaluate model" heading
- Clicking it resets the section to its initial state (one empty input box)

**Changes:**
- `src/text_to_display.ts`: Added `clear_all()` function and Clear button in `model_evaluators()`

## 2026-01-24

### Updated: Video Demo Link

- Changed video demo link to `https://www.youtube.com/watch?v=HkccWiMYI5Q`

## 2026-01-23

### Updated: Z3 Solver

- Upgraded `z3-solver` npm package from 4.14.0 to 4.15.4
- Updated WASM files in `public/` and `dist/` directories

## 2026-01-22

### Fixed: iOS Safari Compatibility

**Problem:** The app was showing "Unexpected Exception! [object Event]" on iOS Safari, while working fine on desktop browsers.

**Root Cause:** Two issues were identified:
1. CSS `@import` for Google Fonts conflicted with cross-origin isolation headers required by Z3's SharedArrayBuffer
2. The server (ICDSoft/Apache) needed specific headers to enable SharedArrayBuffer on mobile Safari

**Changes:**

#### `src/style.css`
- Removed `@import url('https://fonts.googleapis.com/...')` statement
- Google Fonts CSS imports break cross-origin isolation (COEP) on iOS Safari

#### `index.html`
- Changed page title from "Vite + TS" to "PrSAT 3.0"
- Added Google Fonts via `<link>` tags with `crossorigin` attribute (compatible with COEP)

#### `src/text_to_display.ts`
- Improved `window.onerror` handler to provide meaningful error messages
- Added specific detection for Z3 WebAssembly loading failures
- Error messages now include source location (file:line:column)

#### `dist/.htaccess` (new file)
- Added Apache configuration for proper WASM support and cross-origin isolation
- **Important:** This file must be uploaded to the server with the dist folder

### Notes

- The `.htaccess` file is required for iOS Safari compatibility on Apache servers (e.g., ICDSoft)
- GitHub Pages (imapersonman.github.io) handles these headers automatically
- Desktop browsers are more lenient with cross-origin isolation requirements
