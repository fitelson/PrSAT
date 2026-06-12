# Random Search Solver (PrSAT 3.1 experimental)

Port of the `Method -> "Random"` branch from the Mathematica reference (`../PrSAT 3.0/PrSAT_3_Mathematica/PrSAT.m`, lines 886–995).

## Algorithm

Given a constraint list `C` over state variables `a_1, ..., a_{n-1}` (with `a_n = 1 - Σa_i` eliminated):

1. Build a numeric cost function `f: R^{n-1} → R` such that `f(x) < 0` iff all constraints are satisfied at `x`.
   Atom rewrite table (each term is ≤ 0 iff satisfied):

   | Atom      | Cost term                        |
   |-----------|----------------------------------|
   | `x == y`  | `zeroJump((x-y)^2)`              |
   | `x != y`  | `margin^2 - (x-y)^2`             |
   | `x > y`   | `margin + (y - x)`               |
   | `x < y`   | `margin + (x - y)`               |
   | `x >= y`  | `y - x`                          |
   | `x <= y`  | `x - y`                          |

   `And → Math.max`, `Or → Math.min`. Negation/conditional/biconditional are eliminated first by normalization.

2. For up to `SearchAttempts` attempts (default 3):
   - Sample initial point `x0` from Dirichlet(1,...,1) over `n` atoms; drop last coordinate.
   - Run Nelder-Mead on `f` starting from `x0`, with `earlyStopBelow: 0`.
   - If `f(x*) < 0`, proceed to verification.

3. Verification: Rationalize `x*` via continued fractions with `diff = regMargin/2`, halving `diff` up to 40 times until exact rational `x_rat` is found such that original constraints hold under exact rational arithmetic.

4. Result:
   - Success: `{ status: 'sat', assignments: x_rat }`
   - No numerical solution in `SearchAttempts`: `{ status: 'unknown' }`
   - Numerical success but rationalization never verifies: `{ status: 'unknown' }`
   - UNSAT (since 2026-06-12): only when equation elimination derives a
     contradiction by constant-denominator (linear) steps, or a uniquely
     determined solution fails exact verification; otherwise Random Search
     cannot prove UNSAT.

## Constants (from Mathematica defaults)

- `margin = 1e-6`
- `regMargin = 1e-3`
- `SearchAttempts = 3`
- Max rationalization iterations: 40
- Nelder-Mead: `α=1, γ=2, ρ=0.5, σ=0.5`; `maxIter = 500 * dim`

## 2026-06-12 updates

See CHANGELOG.md (2026-06-12) for details on:
- **Equation elimination** (`src/equation_elimination.ts`): top-level equations
  are solved symbolically before the search — exact Gaussian elimination for
  linear equations, generic-branch `v = −B/A` rational-function substitution
  for nonlinear ones (independence etc.). The search then runs over the reduced
  pure-inequality system; consumed equations hold by construction.
- **Small-fraction models**: common-denominator scan (q = 1..200) before
  coarse-to-fine continued fractions, plus a Nelder-Mead polish pass.
- Acceptance threshold `fMin < 1e-9` (boundary-pinned non-strict inequalities).

## Known limitations (v1)

- `RealExpr.power` with non-integer exponent in rational verification → falls back to `'unknown'`.
- Free real variables (beyond state variables) are rejected with a clean error.
- Nelder-Mead quality degrades above ~20 dims (i.e., 5+ letters → 16+ free state vars).
- Equation elimination gives up on equations linear in no variable (every
  variable squared or higher, e.g. `Pr(A)^2 = 1/2`) and on equations under
  disjunction/negation — those stay in the numeric cost, where the old
  weaknesses apply. Algebraic (irrational) solutions are out of reach entirely:
  exact verification only speaks rationals. Use the Z3 solver for these.

## Case study (2026-06-12): likelihood-ratio-difference system

Branden's research system (3 letters / 8 states; 4 rational equations + 1
inequation; Mathematica's `Solve` struggles, Z3 didn't settle in 10 min):

- E1: a1/(a1+a2) − a5/(a5+a6) = (a1+a3)/S1234 − (a5+a7)/(1−S1234)
- E2: a1/(a1+a2) − a3/(a3+a4) = (a1+a5)/S1256 − (a3+a7)/(1−S1256)
- E3: (a1+a3)/S1234 − (a5+a7)/(1−S1234) = 1/2
- E4: (a1+a5)/S1256 − (a3+a7)/(1−S1256) = −1/2
- a1/(a1+a2) − (a3+a5+a7)/(1−a1−a2) ≠ 0

Findings (test harness: `src/tmp_branden_system.spec.ts`):
- Equation elimination absorbs 3 of 4 equations (a8 via sum; a7, a6 via
  generic-branch rational substitutions); the remaining 2 are linear in no
  single variable and stay in the cost.
- Nelder-Mead converges on EVERY attempt (fMin ≈ −1e-12, all seeds) — the
  numeric layer handles this system reliably. Exact certification fails:
  independent snapping of 5 free coordinates misses the codim-2 residual
  variety.
- Maple (`/Applications/Maple 2024/maple`) solves the system in seconds:
  5 solution branches, ALL rational-function parameterizations. Branch 2
  yields an exact admissible model: a = (1/24, 1/24, 7/12, 0, 0, 1/24, 7/48,
  7/48), inequation value −13/44.
- Key structural lesson: Maple branch 3 is parameterized by (a1, a2, a5) with
  the rest rational functions of them — i.e. after PINNING a subset of free
  variables to rationals, the residual equations become linear-in-one-variable
  and our own elimination can finish the job.

## Implemented (2026-06-12, later): snap-then-re-eliminate + TS Gröbner certification

Implemented as pass 2 of `try_rationalize_reconstruct_verify`
(`src/random_search.ts`) + the new `src/groebner.ts`:

1. After Nelder-Mead converges, snap a SUBSET of the free coordinates to small
   rationals (q-scan; subsets of the leftover-equation variables, ranked by
   degree, ≤ 12 subsets, q ≤ 96).
2. Re-run the successive elimination on the FULL ORIGINAL equation system
   specialized at the pinned values (NOT on the leftover polys — pinning can't
   lower the degrees of the unpinned variables there; this was a bug in the
   first attempt).
3. Equations the successive elimination still can't absorb form a
   zero-dimensional system in the few remaining unknowns: `src/groebner.ts`
   enumerates its EXACT rational solutions — pure-TS Buchberger (lex order,
   product criterion, pair/term caps so blowups degrade to "no answer"), then
   rational-root extraction (rational root theorem over bigint) and recursive
   back-substitution. This is the same algorithmic core a CAS `solve` uses.
4. Evaluate the chain for the remaining variables exactly; run the usual exact
   verification of the full original system. SAT answers remain always sound;
   irrational solutions are simply never found (sound incompleteness).

Result on the case-study system: certified exact model
a = (1/8, 1/8, 5/8, 0, 0, 1/28, 5/112, 5/112) on the first attempt
(regression test: `src/likelihood_ratio_system.spec.ts`).

Still-open cheap win: report "numerically SAT (uncertified)" with the float
model and per-constraint residuals when optimization converges but
certification fails, instead of a bare `unknown`.

## Implemented (2026-06-12, latest): local Maple bridge

The "use the browser as a frontend" option, confirmed working by Branden:
`npm run maple-bridge` (alongside `npm run dev`) starts a local server wrapping
desktop Maple. The Random Search hands it the equation polynomials, gets back
`solve`'s branches as rational functions, and runs the PrSAT.m `sol1[[i]]`
loop in the browser: per branch, substitute into the inequalities, Nelder-Mead
over the branch's free variables, snap to small fractions, evaluate solved
variables exactly, verify everything exactly. Falls back to the pure-browser
pipeline automatically. Files: `maple_bridge/server.mjs`,
`src/maple_bridge_client.ts`, `src/maple_expr.ts`, branch search in
`src/random_search.ts`. UI indicator: "Maple bridge: connected/off".
Both benchmark systems (likelihood-ratio, 16-state 3-wise independence) are
handled; the deployed site remains 100% in-browser.

## Future work (v3): general equation solving via an embedded CAS

Why we did NOT just use a general equation-solving package (2026-06-12
discussion):

1. **Browser constraint.** Mathematica's `Solve` (what PrSAT.m calls) is not
   embeddable. JS-native CAS libraries (nerdamer, Algebrite, mathjs) lack
   reliable multivariate polynomial *system* solving — no Gröbner machinery,
   and the first two are semi-abandoned. The serious options are full CAS
   builds compiled to WASM: **Giac** (what GeoGebra embeds, ~20 MB) or SymPy
   via Pyodide (~30+ MB, slow startup) — roughly doubling the app's payload
   for a feature only the Random Search path uses.
2. **Exact-verification constraint.** Our soundness story requires
   reconstructing pinned variables in exact rational arithmetic and verifying
   the original system exactly. General solvers return radicals / `RootOf`
   objects, which the verifier cannot certify without algebraic-number
   arithmetic (a much bigger project than the elimination itself). Filtering a
   CAS's output down to rational-function-parameterized solutions yields
   exactly the fragment `equation_elimination.ts` already solves — minus a
   fragile layer of parsing another system's symbolic output.
3. **Hard cases already have a solver.** Systems with genuinely algebraic
   solutions are exactly the cases for the Z3 solver in the dropdown, which
   handles algebraic numbers natively (root-obj display).

**The v3 path, if concrete examples demand it:** lazy-load a Giac WASM build
as an optional "Solve engine" — fetched only when equation elimination leaves
unconsumed equations; ask Giac to `solve` the leftover system; keep solution
branches that are rational functions of the free variables (discard radical /
`RootOf` branches); feed each kept branch through the existing
substitute/search/verify pipeline, trying branches in order like PrSAT.m's
`sol1[[i]]` loop. Fall back to today's behavior when Giac yields nothing
usable. Prerequisite: a maintained giac.js/WASM artifact with acceptable load
size; evaluate GeoGebra's build. The 2026-06-12 case study (above) confirms the
value: desktop Maple produced exactly the rational-function branch
parameterizations this pipeline would consume.
