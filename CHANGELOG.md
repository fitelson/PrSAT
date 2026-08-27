# TwistPrSAT changelog

## 2026-08-27 — Twist-only public release

- Implemented exact six-valued `LET_K+` semantics and base-six truth tables.
- Added reliability `○`/`o`; classical negation `∼`/`cnot` expands to
  implication to falsity.
- Added Z3 and Random Search paths for positive-extension probability.
- Preserved the hand-rolled browser equation solver, rational reconstruction,
  and exact witness verification for Random Search.
- Added exhaustive connective-table tests and executable certificates for the
  paper's probability propositions, representation translations, Example 1,
  and 36-cell two-formula partition.
- Removed all Classical and three-valued semantic selectors and runtime paths;
  the application now exposes only `LET_K+` twist semantics.
- Expanded the public header with a detailed quick-start guide, syntax,
  coordinate and region formulas, solver guidance, definedness conditions,
  and the four-letter resource bound.
- Added a downloadable, ready-to-load example file for the uniform six-region
  model, verified independently by Z3 and Random Search/browser algebra.
- Added a theorem-challenge index and ten separately loadable UNSAT files for
  central propositions and representation identities from the paper; the
  entire pack is regression-tested through Z3.
- Deployed to `https://fitelson.org/PrSAT/twist/`.
