# TwistPrSAT project status

Updated: 2026-08-27

## Current implementation

- Separate local worktree on branch `twistprsat-full`, based on the current
  experimental PrSAT `main` so both Z3 and Random Search are present.
- Exact six-valued `LET_K+` semantics with values `T,t,b,f,F,n`, De Morgan
  negation, reliability, conjunction, disjunction, implication, and derived
  biconditional/classical negation.
- Base-six truth tables and positive-extension probability translation.
- Z3 adapter and Random Search adapter, including the hand-rolled browser
  equation solver and exact rational verification.
- TwistPrSAT is the default semantic mode; inherited Classical, ERS, and CCK
  comparison modes remain available.
- Public deployment target: `https://fitelson.org/PrSAT/twist/`.

## Verification gate

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- full serialized Vitest suite
- full Chromium Playwright suite
- post-deployment HTTP, asset, Z3-ready, Z3-solve, and Random-Search checks

## Mathematical certificates

- Every entry of the published unary and `6 x 6` binary truth tables.
- The six singleton regions induced by one formula.
- Proposition 1's positive/negative/reliable extension constraints.
- Proposition 4's reliable-excluded-middle bound, bottom particle,
  classical-negation complement law, and inclusion-exclusion axiom.
- Corollaries 1-3 recovering the one-, three-, and six-dimensional
  probability representations.
- `Pr(A)` as the mass of `T,t,b`; negative and reliable extensions as the
  masses of `b,f,F` and `T,F`.
- Example 1's six-category theistic-belief model and its three marginals.
- Figure 5 / Proposition 14's complete 36-cell two-formula partition and
  row/column marginals.
- Z3 glut satisfiability and reliable-conflict unsatisfiability.
- Random Search exact glut witness through browser algebra.

## Latest local verification

- TypeScript and ESLint: passed.
- Production build: passed.
- Vitest: 764 passed, 1 skipped, 1 todo across 28 files.
- Chromium Playwright: 29 passed, 1 intentionally skipped.
- Production dependency audit: 0 vulnerabilities.

## Scope

The implementation covers probability satisfiability and model evaluation.
Jeffrey-update calculation is not included in version 1.0; it should be added
only using normalized target vectors and set-level update definitions.
