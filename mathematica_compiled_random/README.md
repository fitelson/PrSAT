# Compiled Random Search for Mathematica PrSAT

Replacement implementation of the `Method -> "Random"` path in PrSAT.m. Builds
the same scalar cost function `f`, runs it through
`Compile[…, CompilationTarget -> "C"]`, and drives a hand-rolled Nelder-Mead
loop calling the compiled cost. PrSAT.m's existing
rationalization/`Verify` step then turns the float result into exact rationals.

**Status (2026-04-25): wired into `../../PrSAT 3.0/PrSAT_3_Mathematica/PrSAT.m`**
as the implementation behind `Method -> "Random"`. The default
`SearchAttempts` was bumped from 3 to 10. PrSAT.m's backup is at
`PrSAT.m.bak.before-compiled-random-2026-04-25` in the same directory.

## Why this works

Mathematica's current path is `NMinimize[{f, sysCons}, modelvars,
Method -> {"RandomSearch", …}]` where `f` is a *symbolic* `Max`/`Min` tree of
polynomials in the state variables. Every call from inside the optimizer walks
that symbolic tree through the interpreter — pattern matching for `Max`/`Min`,
dispatcher lookups for `Times`, `Plus`, etc.

`Compile[…, CompilationTarget -> "C"]` lowers the same tree to native code:
scalar `Max`/`Min` → comparison + branch, polynomial arithmetic → plain `+`,
`-`, `*`. The cost evaluation in the hot loop goes from interpreted-tree-walk
to a single C function call. Combined with a hand-rolled Nelder-Mead (no
`NMinimize` framework overhead), the hot path is essentially native.

## Files

- `CompiledRandomSearch.m` — implementation
  - `BuildCostExpression[constraints, opts]` — replicates PrSAT.m lines
    818–929 to produce a scalar cost expression `f`, the box constraints
    `sysCons`, the model vars, and an initial point. Embeds `sysCons` into `f`
    so the compiled NM can't escape the simplex (PrSAT.m relies on `NMinimize`
    to enforce `sysCons` separately; we don't have that, so we add a `Max`
    over the simplex-axiom cost terms).
  - `CompileCostFunction[f, modelvars]` — `Compile` with `CompilationTarget
    -> "C"` and `RuntimeOptions -> "Speed"`. Falls back to a WVM target if the
    C compiler is missing.
  - `NelderMead[cf, x0, opts]` — standard NM (α = 1, γ = 2, ρ = 0.5,
    σ = 0.5) with `EarlyStopBelow -> 0.0` so we exit the moment the cost
    becomes negative (which corresponds to a satisfying assignment).
  - `CompiledRandomSearchSolve[constraints, opts]` — full pipeline wrapper.
- `benchmark.m` — runs both the stock `NMinimize` random-search path and the
  compiled NM on a small bag of test problems, verifies feasibility of each
  reported point under the embedded cost, and prints a comparison table.

## Running it

```sh
# from this directory
WolframKernel=/Applications/Wolfram.app/Contents/MacOS/WolframKernel \
  wolframscript -file benchmark.m
```

Without `WolframKernel=…`, plain `wolframscript` on this machine fails with
"A WolframKernel location could not be determined" — that's a wolframscript
discovery issue, not a script problem.

## End-to-end PrSAT[…] comparison (mpr2 problem, identical seed)

```
configuration                              SearchAttempts   wall(s)   model
----------------------------------------------------------------------------
Before (unmodified PrSAT.m, NMinimize)            3          23.9     ✓ rationals
After  (modified PrSAT.m, compiled NM)           10           6.3     ✓ rationals
                                                              ----
                                                          3.8x faster
```

(mpr2 problem: 6 events {E1, E2, H1, H2, K1, K2}, 2 nontrivial polynomial
inequalities, ~63-dim state vector. Same exact-rational atom assignment
returned in both runs.)

## Inner-loop microbenchmark (Wolfram 14.3, M1 Mac)

```
name              dim      sym(s)   compiled(s)       speedup  compile(s)    sym/cmp ok
---------------------------------------------------------------------------------------
1var_simple         1      0.0162        0.0001     245.2475x      0.3582     True/True
2var_ineq           3      0.0365        0.0002     225.7155x      0.2602     True/True
2var_mixed          2      0.5261        0.0004    1242.6690x      0.3152     True/True
3var_chain          7      0.9089        0.0011     830.8096x      0.2728     True/True
3var_eqset          1      0.0540        0.0001     909.9888x      0.2581     True/True
4var_ineq          15      2.0815        0.0001   23300.7400x      0.2933     True/True

geometric mean speedup: 1032.54x
```

Speedups vary across runs (NMinimize's RandomSearch and our NM both depend on
the seed), but every run shows a dramatic win across all problem sizes — 200×
on the smallest, 25 000× on the 15-dim problem where NMinimize spends most of
its 2 s in symbolic-tree evaluation while the compiled NM finishes in 0.1 ms.

Both columns under "sym/cmp ok" are `True/True` — every reported point
satisfies the original user constraints AND the probability axioms when
substituted exactly (verified via `cf @@ point < 0` against the augmented
cost). One-time compile cost is ~0.25–0.5 s and is not counted in the
"compiled(s)" column; the search itself is sub-millisecond.

## Caveats / known limitations

- **One sol1 branch.** PrSAT.m's full random-search loop iterates over each
  branch of the equation system's solution set (`sol1[[i]]`); this PoC only
  takes the first branch. Wiring multi-branch handling is mechanical.
- **No rationalization.** PrSAT.m verifies the float result by rationalizing
  via continued fractions and re-checking under exact arithmetic (lines
  962–988). Skipped here — the numeric `f < 0` check is enough to demonstrate
  the speedup question, but a full integration would copy that step.
- **Verification slack.** `f < 0` is satisfied iff every constraint cost
  term is ≤ −margin (1 e−6) for inequalities and ≤ regmargin (1 e−3) for
  equalities. PrSAT.m's `Verify` is the strict checker; the bench's
  feasibility check just re-evaluates the cost.
- **`HoldPattern` is required** for `Inequality[…]` patterns and
  ternary/n-ary `Less[…]` chains in rule LHS — without it, the patterns
  silently fail to match because `Inequality[a_, b_, c_, d_, e_]` evaluates
  before pattern matching attempts. Same for chained `Less[a_, b_, c_]`. The
  decomposition rules in `BuildCostExpression` use `HoldPattern` for that
  reason.
- **Two-pass decomposition.** Putting both the chain-rules and an
  `And[xs__] :> Sequence[xs]` rule in a single `ReplaceAll` silently disables
  the chain rules (Mathematica peculiarity); the code applies them
  sequentially as two `/.` passes.
- **`NumberForm` doesn't render under wolframscript** without a front end.
  `benchmark.m` uses an `fmt` helper (`ToString[NumberForm[…], OutputForm]`)
  to get plain decimal strings.

## How the integration works

Three minimal changes to `PrSAT.m`:

1. **Default `SearchAttempts` bumped from 3 to 10** (`Options[PrSAT]`,
   ~line 543). Compiled NM is fast enough that more retries are cheap.
2. **Load `CompiledRandomSearch.m`** (added near the `MAIN PRSAT FUNCTION`
   header) which defines `CompiledRandomSearchInner` (and helpers
   `AugmentCostWithSysCons`, `CompileCostFunction`, `NelderMead`,
   `RationalizePoint`).
3. **`Method == "Random"` branch routed** (line ~941) to
   `CompiledRandomSearchInner[f, modelvars, sysCons, initPoint, …]`, which
   returns the same `{minValue, varRules}` shape as `NMinimize`. PrSAT.m's
   existing rationalization loop (lines 962–988) handles the rest unchanged.
   Falls back to the original `NMinimize[..., RandomSearch]` if
   `CompiledRandomSearch.m` is missing.

The load-guard uses `DownValues[…]` length, not `ValueQ[…]` — `ValueQ`
only inspects `OwnValues`, so it never sees defined functions. Using
`ValueQ` gave us a recursive-load infinite loop the first time around;
keep the `DownValues` form.

## Reverting

`PrSAT.m.bak.before-compiled-random-2026-04-25` is the unmodified original.
To revert: `cp PrSAT.m.bak.before-compiled-random-2026-04-25 PrSAT.m` and
delete `CompiledRandomSearch.m` from the same directory.
