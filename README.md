# TwistPrSAT

TwistPrSAT is a browser-based probability-satisfiability checker for the
six-valued logic `LET_K+` used in Borja Macias, Coniglio, and
Hernandez-Tello, *Probabilities beyond Belnap-Dunn logic: dealing with gaps,
gluts and reliability* (arXiv:2608.20228).

Live app: <https://fitelson.org/PrSAT/twist/>

## Semantics

Each propositional letter takes one of six values:

| Value | Meaning | Twist triple |
| --- | --- | --- |
| `T` | reliable belief | `(1,0,1)` |
| `t` | belief | `(1,0,0)` |
| `b` | conflict | `(1,1,0)` |
| `f` | disbelief | `(0,1,0)` |
| `F` | reliable disbelief | `(0,1,1)` |
| `n` | uncertainty | `(0,0,0)` |

`Pr(A)` is the total mass of the designated values `T`, `t`, and `b`.
Consequently the paper's three coordinates are available as `Pr(A)`,
`Pr(~A)`, and `Pr(○A)`. Its six region masses are probabilities of the six
region-identification formulas.

Object-language syntax:

- `~A`, `-A`, or `!A`: De Morgan negation;
- `○A` or `oA`: reliability/classicality;
- `∼A` or `cnot A`: classical negation, expanded as `A -> false`;
- `&`, `v`, `->`, `<->`: conjunction, disjunction, implication, biconditional.

Conditional probability `Pr(B | A)` is the ordinary ratio
`Pr(B & A) / Pr(A)` and therefore requires `Pr(A) != 0`.

## Solvers

- **SMT (Z3)** is the decision-procedure path. Formulas are evaluated on all
  `6^m` valuations, probabilities become finite sums of nonnegative state
  masses, and the resulting real constraints are sent to Z3.
- **Random Search** uses the inherited hand-rolled browser equation solver,
  followed by numerical search, rational reconstruction, and exact
  verification. It returns `SAT` only with an exact rational witness; failure
  to find one is reported as `unknown`, never `UNSAT` (except for an
  inconsistent exact linear subsystem).

The current 4,096-state resource budget permits at most four distinct
propositional letters in `LET_K+` mode (`6^4 = 1,296`).

## Development

```bash
npm ci
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

Development uses Vite on port 5173; Playwright uses strict port 5174. Deploy:

```bash
npm run deploy
```

This builds and uploads `dist/.` to
`fitelson@fitelson.org:/home/fitelson/www/www/PrSAT/twist/`.

## Provenance

TwistPrSAT is an isolated branch of PrSAT 3.1. It reuses the PrSAT parser,
constraint language, Z3 integration, Random Search engine, browser equation
solver, rational verifier, and UI. The `LET_K+` semantic core and solver
adapter are in `src/letk.ts` and `src/letk_sat.ts`. The deployed application
exposes only `LET_K+`; there are no alternative semantic modes.

Contributors to the inherited PrSAT code include Koissi Adjorlolo, Branden
Fitelson, Claude, and Codex.
