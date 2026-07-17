# Algebraic preprocessing experiments (2026-07-12 to 2026-07-13)

This records the preprocessing strategies tried during the July 2026 solver investigation. They are not part of the current Z3 pipeline, but the results and implementation ideas are retained here in case they become useful later.

## Final decision

- Classical, ERS, and CCK Z3 solving uses the direct translated problem, followed only by the ordinary elimination of the final normalization state.
- Random Search owns exact-witness search, equation extraction/elimination, browser algebra, and the optional Maple branch solver.
- Under regularity, PrSAT performs only a cheap denominator-sign simplification: a nonempty sum of strictly positive state masses is known to be positive, so its redundant nonzero division guard is omitted and an `ite(D = 0, 1, N/D)` term with such a denominator collapses to `N/D`.
- There are no **Solve equations**, **Eliminate ratios**, or **Expand products** controls in the Z3 interface.

## Motivating examples

The first example appeared to solve instantly with equation solving enabled even though the user input contained no equations:

```text
Pr(H1 | E1) - Pr(H1) > Pr(H2 | E2) - Pr(H2)
Pr(E1 | H1)/Pr(E1 | ~H1) < Pr(E2 | H2)/Pr(E2 | ~H2)
```

The cause was not equation elimination from the user input. The shared preprocessor always added the probability normalization equation and also ran an exact rational tangent-model search. The option therefore controlled more than its label suggested. This was the main reason to separate the pipelines.

The hard regular benchmark was:

```text
Pr(C | A) > Pr(C)
Pr(B | A) > Pr(B)
(Pr(A | C) - Pr(A | ~C))/(Pr(A | C) + Pr(A | ~C)) >= (Pr(A | C & B) - Pr(A | ~C & B))/(Pr(A | C & B) + Pr(A | ~C & B))
Pr(B \/ C | A) <= Pr(B \/ C)
```

The expected result under regularity is UNSAT.

## Strategies tried

### Shared equation preprocessing before Z3

The classical, ERS, and CCK wrappers temporarily ran the same exact rational tangent-model and equation-reduction machinery used by Random Search. Reduced SAT models were reconstructed and checked against every original constraint; unknown or unsafe reduced results fell back to the original problem. Reduced Z3 attempts were limited to one quarter of the total timeout, with a five-second cap.

This solved some inequality-only SAT examples instantly because exact-witness search was active even when there were no user equations. It also made the option semantics confusing, added worker/cancellation complexity, and did not improve the hard regular UNSAT benchmark. The machinery remains in Random Search, where equation solving is an explicit part of the method.

### Ratio elimination

A sound bounded transformer converted rational comparisons to polynomial comparisons. It retained denominator-definedness conditions, handled nested ratios and negative powers, avoided sign-blind cross multiplication, and lifted bounded `ite` expressions into guarded branches for ERS/CCK totalized probabilities.

This was exposed as **Eliminate ratios**, default off. It sometimes reduced syntactic complexity but did not provide a reliable general decision improvement, and it enlarged the solver interface and test surface.

### Product expansion

A dependent **Expand products** option distributed the final cross-multiplied products into sparse exact-rational polynomial form. Prospective products above 20,000 terms stayed factored, and balanced output trees avoided traversal stack overflow.

Expansion was useful only in conjunction with ratio elimination. It could either reduce cancellation opportunities or create much larger terms, depending on the input, so it was removed with ratio elimination.

### Canonical sparse-polynomial pass

After normalization-state elimination, a bounded canonicalizer collected monomials and exact rational coefficients, rewrote supported comparisons as `P op 0`, and declined unsupported or oversized expressions.

One aggregate unit-suite run in each configuration showed no material wall-time improvement:

| Configuration | Wall time | Sum of reported test times |
| --- | ---: | ---: |
| Canonical core enabled | 17.43 s | 41.88 s |
| Canonical core disabled | 17.43 s | 43.47 s |

The disabled run had two expected failures because those tests asserted the canonical reductions. The equal wall times indicate that the difference in summed test times was noise or parallel scheduling, not a practical gain.

On the hard regular benchmark, an honest core-off representation was 5,031 characters and preprocessing took about 0.80 ms; Z3 still returned `unknown` after about 80.44 seconds wall time despite a 60-second solver timeout. The canonical core produced 2,299 characters in about 1.65 ms, but Z3 still returned `unknown` after about 60.10 seconds. The smaller representation did not change decisiveness.

### Probability-sign inference under regularity

With ratio elimination and expansion active, coefficientwise-nonnegative denominator polynomials were recognized as nonnegative on the probability simplex. A retained `D != 0` guard then made them positive; under regularity, nonzero sums of state masses were positive directly. This allowed some `N/D op 0` atoms to become `N op 0` and allowed redundant guards to be removed.

For the hard regular benchmark, the most aggressive version reduced direct backend SMT-LIB from 26,782 to 2,299 characters, but Z3 still returned `unknown` after 60 seconds. The current implementation retains only the cheap, non-expanding special case: omit a denominator guard and remove an impossible totalized-zero branch when the denominator is syntactically a nonempty state-mass sum under regularity.

### Z3 simplification after ratio elimination

We considered sending the ratio-free expression to Z3's simplifier before solving. This could normalize the representation but could not use knowledge of whether the original problem was SAT or UNSAT; that is precisely what the solver must determine. It was therefore considered only as a representation pass, not a decision method. Given the negative representation benchmarks above, it was not retained.

### Bayes-factor reformulation and Z3 setting sweep

For the strict regular ERS variant, the normalized confirmation comparison is
ordinally equivalent to the following Bayes-factor comparison because
`(x - y)/(x + y)` is strictly increasing in `x/y` when `x,y > 0`:

```text
Pr(C | A) > Pr(C)
Pr(B | A) > Pr(B)
Pr(A | C)/Pr(A | ~C) > Pr(A | C & B)/Pr(A | ~C & B)
Pr(B \/ C | A) < Pr(B \/ C)
```

The corrected ratio keeps `A` in the probability numerator; reversing the
roles of `A` and `C` is not an equivalent reformulation. The Bayes-factor
version returned UNSAT in the browser in about 40 seconds. PrSAT's current
non-browser regular ERS translation produced seven state variables and 816
characters of SMT-LIB; native Z3 4.16.0 returned UNSAT in 14.03 seconds.

A single sequential setting sweep on that exact generated problem found no
speedup:

| Native Z3 configuration | Result | Wall time |
| --- | --- | ---: |
| Default | UNSAT | 14.03 s |
| `nlsat.simple_check=true` | UNSAT | 14.04 s |
| Variable-ordering strategies 1, 2, and 3 | UNSAT | 14.02 s each |
| `nlsat.inline_vars=true` | UNSAT | 14.02 s |
| Shuffled variables with alternate seeds | UNSAT | 14.02 s |
| Groebner and Horner processing disabled | UNSAT | 14.03 s |
| Ordering, shuffling, sign checking, and inlining combined | UNSAT | 14.02 s |

Explicit `qfnra-nlsat`, `simplify`/`qfnra-nlsat`, and `simplify`/`smt`
tactic pipelines failed to return a result under the benchmark resource
limits. Disabling NLSAT's levelwise mode was also substantially worse. The
current default settings were retained; the useful improvement came from the
mathematically justified representation change, not solver-option tuning.

### Variable-order portfolios

We tried 30 one-second attempts and 30 two-second attempts using different NLSAT seeds, shuffle/order settings, strategies, and normalization pivots. Every attempt returned `unknown` on the hard regular benchmark. No portfolio option was added.

### Conditional probability charts

A chart decomposition specialized to conditional-probability denominators proved the hard regular benchmark UNSAT in roughly 0.33 seconds. This was the only approach that cracked that instance. It was not retained because the prototype introduced a substantially more specialized branch decomposition, and the goal was a general pipeline rather than a method tuned to this problem family. This is the most promising strategy to revisit if a principled general chart decomposition is developed.

## Practical conclusions

1. Smaller SMT-LIB is not by itself evidence of a better nonlinear decision procedure.
2. Exact equation work is valuable for Random Search SAT witnesses, but sharing it with Z3 obscures method boundaries and adds fallback complexity.
3. Regularity justifies cheap local sign facts. Those are worth retaining when they avoid constraints without expanding expressions.
4. If the hard regular benchmark is revisited, conditional charts are more promising than canonicalization, ratio expansion, or short variable-order portfolios.
5. For the equivalent strict Bayes-factor form, Z3's default nonlinear settings matched or outperformed every tested setting combination.
