# PrSAT 3.1 (Experimental) Changelog

## 2026-07-10

### Fixed: solver soundness and trivalent evaluation

- Invalidated parsed constraints immediately when a debounced edit begins, preventing Classical, ERS, and CCK searches from using stale visible input.
- Required nonzero bases for negative powers and capped absolute integer exponents at 1024.
- Made model evaluation use the solver's branch-local division-definedness semantics in all three modes.
- Made ERS and CCK evaluators recognize real variables declared by the solved constraint set.
- Started cancellation deadlines at the abort request and bounded background Z3 reinitialization.
- Added conventional logical precedence: negation, conjunction, disjunction, conditional, then biconditional.

### Changed: resource budgets, browser gate, and caching

- Added a shared 4,096-state budget: at most 12 sentence letters in Classical/ERS and 7 in CCK (2,187 three-valued rows).
- Moved truth-table construction into the search error boundary so oversized inputs fail cleanly instead of freezing or producing an unhandled rejection.
- Upgraded the development toolchain and made Playwright Chromium-only and serial; re-enabled the previously skipped cancellation scenarios.
- Added browser coverage for stale edits, CCK solving/model rows, and CCK resource-limit errors, plus unit regressions for all repaired solver/evaluator paths.
- Restricted immutable caching to content-hashed Vite assets; stable Z3 and service-worker files now revalidate, and Z3 runtime URLs carry the solver version to bypass stale hosting-cache entries.
- Documented exponent, precedence, and semantic-mode resource limits and corrected negative-base MathML grouping.
- Verification: `npm run lint`, `npm run build`, and `npm test` pass (622 unit tests and all 23 Chromium tests). `npm audit` reports 0 vulnerabilities.

## 2026-06-24

### Changed: public-facing Z3 decision-procedure branch

- Retitled the package as `prsat-3.1-z3`.
- Removed the alternate solver UI and kept Z3 as the only decision procedure.
- Kept all three semantic modes: Classical, Trivalent (ERS), and Trivalent (CCK).
- Removed local-only solver service scripts and implementation files that are not part of the public Z3 app.
- Deployed the public build to `https://fitelson.org/PrSAT/trivalent/`.
- Retitled the visible interface as `PrSAT 3.1 (Experimental)` and removed the visible `Decision procedure: Z3` label.
- Added a single-paragraph public header note with links to the PrSAT project page and Branden Fitelson.

### Added: Cantwell-Cooper-Kleene trivalent mode

- Added `Trivalent (CCK)` as a second trivalent semantic mode.
- The user-facing language still has one conditional token, `->`; ERS and CCK are mutually exclusive semantic selections.
- CCK uses `3^n` atomic rows with `T/N/F` values, strong Kleene `~`, `&`, and `v`, Cooper `->`, and Cantwell probability over true-plus-false rows.
- Pure CCK translation lives in `src/cck.ts`; the Z3 wrapper lives in `src/cck_sat.ts`.
- Model tables display CCK atomic rows with `T`, `N`, and `F`; ERS/classical tables remain bivalent.
- In both trivalent modes, conditional probabilities `Pr(B | A)` are translated as probabilities of the corresponding conditionals `Pr(A -> B)` under the selected theory's rules.

## 2026-06-23

### Added: Pr3SAT / ERS trivalent probability mode

- Added a Cooper-style trivalent probability mode selected by `Trivalent (ERS)`.
- New semantic core in `src/cooper.ts` computes probability of `A` as true mass over true-plus-false mass.
- Z3 wrapper in `src/pr3_sat.ts`.
- In classical mode, `->` is material implication; in trivalent mode, `->` has Cooper semantics.
- Conditional probability `Pr(B | A)` is translated as `Pr(A -> B)` under the selected trivalent semantics.
- The model evaluator uses the selected semantics.

## 2026-06-12

### Added: Decimals toggle in Evaluate model

- Added a `Decimals` / `Fractions` toggle in the Evaluate model toolbar.
- Exact model values can be displayed as 4-decimal approximations without changing the underlying model.

## 2026-06-10

### Fixed: Z3 and UI bug-fix pass

- Fixed SMT-LIB soundness bugs for nested conditionals, subtraction, division, integer exponentiation, exact literals, parser backtracking, and conditional-probability denominator guards.
- Fixed runtime/UI issues around free real variables, native Z3 timeouts, model extraction/formatting, cancellation, batch/file/clipboard behavior, and table-image export.
- Hid the internal one-state probability table for arithmetic-only constraints.

## Earlier 3.0 Work

- Upgraded `z3-solver` to 4.16.0 and refreshed bundled WASM assets.
- Documented two-level connective overloading on the project webpage.
- Added save/export controls for translated constraints, SMT-LIB input, and model tables.
- Improved Z3 model display for rationals and algebraic numbers.
