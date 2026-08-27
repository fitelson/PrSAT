# TwistPrSAT changelog

## 2026-08-27 — Twist-only public release

- Implemented exact six-valued `LET_K+` semantics and base-six truth tables.
- Added reliability `○`/`o`; classical negation `∼`/`cnot` expands to
  implication to falsity.
- Added the production-style Z3 decision path for positive-extension
  probability.
- Added exhaustive connective-table tests and executable certificates for the
  paper's probability propositions, representation translations, Example 1,
  and 36-cell two-formula partition.
- Removed all Classical and three-valued semantic selectors and runtime paths;
  the application now exposes only `LET_K+` twist semantics.
- Expanded the public header with a detailed quick-start guide, syntax,
  coordinate and region formulas, solver guidance, definedness conditions,
  and the four-letter resource bound.
- Added a downloadable, ready-to-load example file for the uniform six-region
  model, verified by Z3.
- Expanded the theorem pack to eleven UNSAT challenges and three SAT
  countermodels, including the gap-glut balance identity and models witnessing
  conflict, uncertainty, and De Morgan noncomplementarity.
- Added `TwistPrSAT_all_examples.txt`, a single labeled master file containing
  the uniform six-region model and every SAT and UNSAT example so far.
- Removed Random Search, its worker, browser equation solver, Maple bridge,
  numerical optimizer, rational reconstruction, and their tests. TwistPrSAT is
  now Z3-only, matching production PrSAT's solver surface.
- Deployed to `https://fitelson.org/PrSAT/twist/`.
