# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## PrSAT 3.1 Z3

This is the public-facing PrSAT 3.1 branch for the browser-based Z3 decision procedure. It keeps the classical PrSAT engine and the experimental trivalent ERS/CCK semantic modes, but all solving routes through Z3.

Source of truth for production PrSAT 3.0 remains `../PrSAT 3.0/PrSAT-main/`.

## What is PrSAT?

PrSAT is a web-based tool for checking satisfiability of probabilistic constraints. Users enter constraints involving probabilities, such as `Pr(A) > Pr(B)` or `Pr(A|B) = 1/2`, and the app uses the Z3 SMT solver to find a probability distribution satisfying all constraints or to report UNSAT when Z3 proves none exists.

## Architecture

- Frontend: TypeScript + Vite, running entirely in the browser.
- Solver: Z3 compiled to WebAssembly via the `z3-solver` npm package.
- Deployment constraint: Z3 WASM requires SharedArrayBuffer, which requires cross-origin isolation headers.
- Classical core: `src/pr_sat.ts` translates PrSAT constraints over bivalent truth tables.
- Trivalent ERS core: `src/cooper.ts` plus the Z3 wrapper in `src/pr3_sat.ts`.
- Trivalent CCK core: `src/cck.ts` plus the Z3 wrapper in `src/cck_sat.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `src/text_to_display.ts` | Main UI logic, input handling, result display |
| `src/z3_integration.ts` | Z3 solver interface, model parsing, evaluation |
| `src/pr_sat.ts` | Classical constraint translation and truth tables |
| `src/cooper.ts` | ERS/Cooper trivalent translation |
| `src/pr3_sat.ts` | ERS/Cooper Z3 wrapper |
| `src/cck.ts` | CCK trivalent translation |
| `src/cck_sat.ts` | CCK Z3 wrapper |
| `src/parser.ts` | Parsing probability expressions |
| `src/block_playground.ts` | Constraint input block UI |
| `webpage/index.html` | Project webpage |
| `CHANGELOG.md` | Public-facing change history |

## Semantic Modes

The UI exposes one object-language conditional token, `->`; the semantic controls determine how it is interpreted.

- Classical: bivalent material implication and ordinary probability.
- Trivalent (ERS): Cooper conditional over ERS-style trivalent states; `Pr(A)` is true mass over true-plus-false mass with the totalized zero-denominator convention.
- Trivalent (CCK): strong Kleene `~`, `&`, and `v`; Cooper `->`; Cantwell probability over true-plus-false rows with `T/N/F` atomic rows.

## Build and Test Commands

```bash
npm run dev              # Local dev server at localhost:5173
npm run build            # Refresh Z3 assets, TypeScript compile, Vite build
npx vitest --run         # Unit tests only
npm test                 # Unit + Playwright e2e tests
```

## Recent Work

- 2026-06-24: Created the public-facing Z3-only PrSAT 3.1 branch. The UI now exposes only the Z3 decision procedure while retaining classical, Trivalent (ERS), and Trivalent (CCK) semantic modes.
- 2026-06-24: Added Trivalent (CCK) with a pure CCK translator in `src/cck.ts` and a Z3 wrapper in `src/cck_sat.ts`.
- 2026-06-23: Added Trivalent (ERS) with Cooper semantics in `src/cooper.ts` and a Z3 wrapper in `src/pr3_sat.ts`.
- 2026-06-12: Added the Decimals/Fractions toggle in the Evaluate model toolbar.
- 2026-06-10: Fixed the June 2026 SMT-LIB soundness and runtime/UI bug set inherited from PrSAT 3.0.
