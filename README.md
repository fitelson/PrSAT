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

`public/TwistPrSAT_examples.txt` is a ready-to-load batch file. It gives each
of the six regions probability `1/6` and checks the induced one-, three-, and
six-dimensional quantities and two conditional probabilities.

`public/TwistPrSAT_theorem_examples.txt` explains fourteen separately loadable
files under `public/theorems/`: eleven UNSAT theorem challenges and three SAT
countermodels highlighting conflict, uncertainty, and De Morgan
noncomplementarity.

`public/TwistPrSAT_all_examples.txt` is the single master file containing the
uniform six-region SAT model, every UNSAT theorem challenge, and the SAT
countermodels illustrating conflict, uncertainty, and De Morgan
noncomplementarity. Users should copy or load one labeled block at a time.

## Solvers

- **SMT (Z3)** is the sole decision procedure. Formulas are evaluated on all
  `6^m` valuations, probabilities become finite sums of nonnegative state
  masses, and the resulting real constraints are sent to Z3.

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
constraint language, Z3 integration, and UI. The `LET_K+` semantic core and
solver adapter are in `src/letk.ts` and `src/letk_sat.ts`. Like production
PrSAT, the deployed application is Z3-only.

Contributors to the inherited PrSAT code include Koissi Adjorlolo, Branden
Fitelson, Claude, and Codex.
