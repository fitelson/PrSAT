# TwistPrSAT project guide

TwistPrSAT is the dedicated browser application for probability
satisfiability over the six-valued logic `LET_K+`. It is deployed at
`https://fitelson.org/PrSAT/twist/` and exposes no alternative semantic modes.

## Architecture

- `src/types.ts`, `src/parser.ts`: shared formula and constraint syntax.
- `src/letk.ts`: six-valued twist tables, base-six valuation enumeration, and
  probability translation.
- `src/letk_sat.ts`: Z3 adapter and model evaluator.
- `src/random_search.ts`: Random Search, exact rational verification, and the
  semantic adapter used by the worker.
- `src/browser_equation_solver.ts`: hand-rolled browser equation solver.
- `src/text_to_display.ts`: the public interface; semantics are always
  `twist-letk`, while the user chooses only Z3 or Random Search.
- `src/letk.spec.ts`: mathematical certificates derived from the paper.

## Syntax

- `~A`, `-A`, `!A`: De Morgan negation.
- `○A`, `oA`: reliability/classicality.
- `∼A`, `cnot A`: classical negation, expanded as `A -> false`.
- `&`, `v`, `->`, `<->`: binary object-language connectives.
- `Pr(B | A)`: `Pr(B & A) / Pr(A)`, with a nonzero-denominator guard.

## Solver boundary

Z3 receives the direct finite-state probability translation plus ordinary
normalization-state elimination. Random Search alone performs equation solving:
browser algebra by default, or the optional local Maple bridge when explicitly
selected. Random Search returns SAT only after exact rational verification and
otherwise returns unknown except for an inconsistent exact linear subsystem.

## Resource bound

The global 4,096-state budget permits at most four propositional letters in
`LET_K+` mode because `6^4 = 1,296` and `6^5 = 7,776`.

## Release gate

```bash
npx tsc --noEmit
npm run lint
npm run build
npm test
npm audit --omit=dev
```

Deploy with `npm run deploy`, then verify HTTP 200, COOP/COEP headers, matching
local/live Z3 WASM checksums, explicit Z3 readiness, and real-browser Z3 and
Random Search solves. See `PROJECT_STATUS.md` for the latest verified state.
