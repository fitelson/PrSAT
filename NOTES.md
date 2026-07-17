# PrSAT 3.0 / 3.1 Development Notes

## Current solver boundary (July 13, 2026)

- Classical, ERS, and CCK Z3 use the direct translated problem after the
  ordinary elimination of the final normalization state.
- Random Search alone performs exact-witness search and equation solving. Its
  default browser equation solver and explicitly selected Maple bridge remain
  available.
- The Z3 interface has no **Solve equations**, **Eliminate ratios**, or
  **Expand products** controls. The automatic canonical-polynomial pass and
  reduced-Z3 chart attempts have also been removed.
- Under regularity, a cheap local sign rule omits a division guard when its
  denominator is syntactically a nonempty sum of strictly positive state
  masses, and removes the impossible zero branch from totalized trivalent
  probabilities. This does not cross-multiply ratios or expand products.
- `ALGEBRAIC_PREPROCESSING_EXPERIMENTS_2026-07-13.md` is the durable record of
  the removed ratio, expansion, canonicalization, Z3 simplification,
  variable-order, reduced-Z3, conditional-chart, Bayes-factor, and Z3-settings
  experiments. On the corrected strict regular ERS Bayes-factor benchmark,
  native Z3's 14.03 s default matched every tested setting combination; keep
  the defaults unless broader evidence supports a change.

The July 11-13 implementation notes below are retained as experiment history;
where they describe Z3 preprocessing or algebra controls, they are superseded
by the current boundary above.

## Superseded experiments: July 13, 2026

### Automatic Polynomial Canonicalization Before Z3

Every Z3 path now runs a bounded canonical polynomial pass after substitutions
and immediately before SMT-LIB generation. On the ordinary path this occurs
after eliminating the normalization state with `a_n = 1 - sum(a_i)`; it also
normalizes residual comparisons produced by equation reduction. Comparisons in
the supported fragment become `P op 0`, with `P` represented as a sparse map of
monomials to exact rational coefficients. This collects duplicate terms and
removes cancellations introduced by substitution.

The pass does not perform general symbolic simplification: symbolic ratios,
free real variables, `ite` expressions, negative or nonliteral powers, and
oversized products are retained unchanged. The 20,000-term cap is checked
before distributive multiplication. User-entered decimal source digits and
unsafe-size integers are converted and emitted exactly rather than through a
JavaScript-number round trip.

### Aggressive Expanded-Ratio Simplification

When both **Eliminate ratios** and **Expand products** are selected, ratio
elimination uses the probability simplex signs. If the normalized denominator
polynomial has no negative monomial coefficients, it is nonnegative on
`a_i >= 0`; its retained nonzero guard therefore makes it positive. Ordered
comparisons can then use the numerator directly instead of the higher-degree
sign-safe `N*D`. This inference is disabled unless both options are on, and
mixed-sign denominators remain conservative.

Focused benchmark:

```text
Pr(C | A) > Pr(C)
Pr(B | A) > Pr(B)
(Pr(A | C) - Pr(A | ~C))/(Pr(A | C) + Pr(A | ~C)) >= (Pr(A | C & B) - Pr(A | ~C & B))/(Pr(A | C & B) + Pr(A | ~C & B))
Pr(B \/ C | A) <= Pr(B \/ C)
```

Under regularity, the ordinary ratio-eliminated backend is 26,782 SMT-LIB
characters. Probability-sign simplification produces 2,299 characters. Direct
Z3 nevertheless remains `unknown` after 60 seconds, so the retained result is
the bounded algebraic reduction itself, not a claim that this preprocessing
decides the regular benchmark.

## Superseded experiments: July 12, 2026

### Optional Ratio Elimination

Z3 now has an independent **Eliminate ratios** checkbox, default off. It runs
after classical/ERS/CCK translation and definedness guarding, and before exact
witness search and optional equation solving. Random Search is unchanged.

For a rational difference `N/D`, equality and disequality use `N = 0` and
`N != 0`; ordered comparisons use the sign-safe polynomial `N*D` and retain
`D != 0`. This handles negative denominators without sign splitting. Canceled
denominator factors remain guarded because definedness is installed before
algebraic normalization. Nested likelihood ratios and negative powers are
supported; exact rational constants such as `1/2` remain native coefficients.
ERS/CCK `ite` expressions are lifted into guarded branches. Bounded conversion
falls back to the original guarded atom when a fragment is unsupported or too
large.

The motivating two-line example is transformed without symbolic ratios in
about 15 ms in the focused test. Direct tests establish exact equivalence for
positive, negative, and zero denominators and for selected ERS/CCK models.

**Expand products** is a dependent, default-off Z3 option. When selected, it
distributes the final `N*D` product used for ordered comparisons into a sum of
monomials. Numerators and denominators were already expanded separately.
Expansion uses the existing 20,000-term ceiling; larger products stay factored.
Expanded polynomials are serialized as balanced expression trees so later
recursive traversals do not overflow on long sums.

### Exact Witness Presearch Separated from Equation Solving

The bounded exact rational-witness probe is now a general pre-backend step for
classical, ERS, and CCK Z3, independent of the **Solve equations** toggle. The
toggle controls only subsequent algebraic elimination, branch solving, and
reduced Z3 attempts. This matters even for inequality-only user input because
PrSAT adds the normalization equation `sum(a_i) = 1`; previously that internal
equation accidentally gated the general witness probe.

Regression input:

```text
Pr(H1 | E1) - Pr(H1) > Pr(H2 | E2) - Pr(H2)
Pr(E1 | H1)/Pr(E1 | ~H1) < Pr(E2 | H2)/Pr(E2 | ~H2)
```

With either toggle setting, the exact probe finds and verifies the same
rational model before the nonlinear Z3 problem is attempted. A separate
inconsistent equation/inequality regression confirms that turning equation
solving off still leaves algebraic reduction disabled.

Verification: focused classical/ERS/CCK/preprocessing and ratio-elimination
tests pass; the full unit suite reports 761 passed, 1 skipped, and 1 todo.
TypeScript, ESLint, the production build, `git diff --check`, and the focused
Chromium control test pass. The permanent app and rebuilt bundle return 200 on
port 5317; no debug server remains running.

## Session: July 11, 2026

### Equation Solver and PrSAT Integration Checkpoint

The experimental branch now has a zero-dependency exact equation-processing
layer rather than relying exclusively on Maple:

- `src/equation_elimination.ts` retains factored rational structure, performs
  guarded cancellation and condition-aware complementary-row reduction, and
  supports exact substitution/reconstruction.
- `src/browser_equation_solver.ts` implements bounded global branching:
  coefficient-aware linear pivots with zero complements, lex Gröbner
  triangularization, pseudo-remainder elimination, factor splitting, and
  back-substitution. Distinct solved chains are included in memoization, so
  different roots cannot be merged. Completed branches are sound; a bounded
  incomplete result is labeled `partial`, never `complete` or UNSAT.
- `src/groebner.ts` supplies exact rational Buchberger/normal-form operations
  and rational root enumeration. Normal-form loops now honor deadlines and
  cancellation checks.
- `src/random_search.ts` always solves/eliminates equations before numerical
  search. The browser branch solver is the default. Maple 2024 is used only
  when explicitly selected and is exclusive with browser algebra. Every Random
  Search SAT witness is rechecked against the full enriched system in exact
  rational arithmetic.

### Superseded Z3 Preprocessing Policy

The **Solve equations** option applies to classical, ERS, and CCK Z3. All three
wrappers use the shared `try_reduced_equation_problem` policy in
`src/z3_integration.ts`:

1. Preprocessing runs in `src/equation_preprocessing_worker.ts`; terminating
   the worker is immediate cancellation and prevents main-thread freezes.
2. Exact full models and sound linear contradictions can replace the backend
   problem directly.
3. Partial rational reductions are compared with the ordinary sparse SMT-LIB;
   expanding reductions are rejected.
4. An accepted reduced solve gets at most one quarter of the requested timeout,
   capped at five seconds.
5. Reduced `unknown` and chart-local UNSAT retry the original sparse problem
   with the remaining time.
6. A reduced SAT result is reconstructed and every original user constraint is
   evaluated under the selected semantics before it is returned.

The older Context API cannot reconstruct compact reduced coordinates, so it
uses preprocessing only for the global `exact-model` and `inconsistent`
outcomes and otherwise sends the original sparse problem.

### Soundness Repairs from the Final Review

- Totalized trivalent equations now preserve the required branch condition:
  `ite(d = 0, 1, n/d) = c`, for `c != 1`, contributes both the polynomial
  equation and `d != 0`. This fixes the confirmed false ERS SAT examples
  `Pr(A -> B)=0, Pr(A)=0` and `Pr(A -> B)=1/2, Pr(A)=0`.
- The legacy API no longer reports false UNSAT by dropping a
  coefficient-zero chart, and no longer returns compact free coordinates as if
  they were the original atom probabilities.
- The regular likelihood-ratio benchmark no longer regresses when equation
  solving is enabled: the expanding reduction is declined and sparse Z3 proves
  UNSAT in the browser regression (about 1.4 seconds in the final run).
- Cancelling a Maple request now aborts the `execFile` child on the bridge.
  Live verification aborted an in-flight solve, left the bridge responsive,
  and left no Maple or `mserver` process behind.

### Final Verification

- `npm run build`: passed; production output includes separate equation and
  Random Search worker bundles.
- `npm run lint`: passed with zero warnings.
- `npx vitest --run`: 749 passed, 1 skipped, 1 todo (751 total).
- `npx playwright test --project chromium`: 27 passed, 1 skipped (28 total).
- `git diff --check`: passed.
- Live services: `http://localhost:5317/` returns 200; Maple bridge `/ping`
  reports `/Applications/Maple 2024/maple`; only the requested web and bridge
  servers remain running.
- Code graph refreshed: 1095 nodes, 3108 edges, 48 communities.

## Session: June 27, 2026

### Graphify Codebase Knowledge Graph

Built a code-only Graphify knowledge graph for the experimental PrSAT 3.1 repo.

**Outputs:**
- `graphify-out/graph.json`: 960 nodes, 2398 edges, 53 communities
- `graphify-out/graph.html`: interactive local graph
- `graphify-out/GRAPH_REPORT.md`: report with local community labels

**Scope control:**
- Added `.graphifyignore` to keep the graph code-only.
- Excluded `node_modules/`, `dist/`, `graphify-out/`, generated Z3 assets, lockfile, HTML shell pages, Markdown/text notes, and macOS metadata.
- `graphify-out/` is generated local output and is ignored by Git.

**Useful commands:**
```bash
graphify query "How does Random Search connect to Maple?"
graphify path "random_pr_sat_wrapped()" "solve_equations_via_maple()"
graphify update .
```

### Permanent Local LaunchAgents

Repaired the permanent local PrSAT 3.1 services:

- `http://localhost:5317/` serves the built app from `dist/` via `maple_bridge/serve_dist.mjs`.
- `http://localhost:31415/ping` checks the optional local Maple bridge.
- `org.fitelson.prsat31.web` and `org.fitelson.prsat31.maple` now launch `/bin/zsh` wrapper scripts in `~/Library/LaunchAgents/`.
- The wrappers then run `/opt/homebrew/bin/node` on the repo scripts.

This avoids launchd directly caching a code requirement for Homebrew's changing `node` symlink, which broke after a Node upgrade. Verified `5317/` and `5317/z3-built.wasm` return `200 OK`, and Maple bridge `/ping` returns `{ "ok": true, ... }`.

Port 5317 is permanently reserved for the always-on built app. Development and
debugging use 5173, Vite preview uses 4173, and Playwright uses 5174. All three
temporary ports are fixed and strict; debugging and tests must never stop,
replace, or reuse the service on 5317.

**Operational commands:**
```bash
launchctl print gui/$(id -u)/org.fitelson.prsat31.web
launchctl print gui/$(id -u)/org.fitelson.prsat31.maple
launchctl kickstart -k gui/$(id -u)/org.fitelson.prsat31.web
launchctl kickstart -k gui/$(id -u)/org.fitelson.prsat31.maple
```

## Session: February 11, 2026

### Removed Redundant Clear Button from Model Evaluate Dialog

The model evaluate dialog had two Clear buttons — one next to the "Evaluate model" heading and another in the block's Load/Save/Clear/Batch toolbar. Removed the one next to the heading since the toolbar one is sufficient.

**Change:**
- `src/text_to_display.ts`: Removed `clear_all` function, the inline Clear button element, and its click handler from the `model_evaluators` section.

---

## Session: January 22, 2026

### 1. UI Styling Updates

Updated `src/style.css` to align with the color scheme from `PrSAT_3.0.html` (the landing page).

**Color Scheme:**
- Primary (dark charcoal): `#2d3436`
- Primary dark: `#1e2527`
- Primary light: `#636e72`
- Accent (teal): `#00b894`
- Accent dark: `#00a381`
- Background: `#ffffff`
- Background alt: `#f5f6fa`
- Border: `#dfe6e9`
- Error (red): `#d63031`

**Typography:**
- UI text: Source Sans Pro (Google Fonts)
- Code/inputs: Source Code Pro (Google Fonts)

**Key Visual Changes:**
- Generate/Find Model button: Teal gradient with shadow and hover lift effect
- Close/delete button: Red gradient (replaces plain pink)
- Add/newline button: Teal gradient (replaces palegreen)
- Focused inputs: Teal-tinted glow (replaces skyblue)
- Tables: Clean headers, hover effects, subtle shadows
- Header: Dark gradient background matching landing page
- All buttons: Consistent styling with smooth hover transitions
- Input fields: Focus states with teal border glow
- Scrollbars: Custom styled for webkit browsers

---

### 2. Header Text Updates

Updated the header in `src/text_to_display.ts` (around line 1713).

**Before:**
- "PrSAT 3.0b: The Probability Table Generator (Beta)"
- Multiple lines describing the software
- Beta warning and contact info

**After:**
- "PrSAT 3.0" (bold, larger)
- Link to official webpage: https://fitelson.org/PrSAT/
- Link to video demo: https://www.youtube.com/watch?v=IGHjYUI0CL4

---

### 3. Running the Development Server

```bash
# Install dependencies (first time only)
npm install

# Start dev server
npm run dev
```

Opens at: http://127.0.0.1:5173/

The dev server hot-reloads on file changes.

---

### 4. Building for Production

```bash
npm run build
```

This creates a `dist/` folder containing:
```
dist/
├── index.html
├── assets/              # CSS and JS bundles
├── coi-serviceworker.js # Required for SharedArrayBuffer
├── z3-built.js          # Z3 solver JavaScript
└── z3-built.wasm        # Z3 solver WebAssembly (~34 MB)
```

---

### 5. Deploying to Web Host (e.g., fitelson.org)

1. Run `npm run build`
2. Upload the entire contents of `dist/` to your web host (e.g., `fitelson.org/PrSAT/`)
3. All files are static — no server-side processing needed

**Note on SharedArrayBuffer:**
The Z3 solver uses SharedArrayBuffer which requires specific HTTP headers. The included `coi-serviceworker.js` handles this automatically on most hosts. If the solver doesn't work, the web host may need to set:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

### 6. File Structure Reference

- `PrSAT_3.0.html` — Landing page / documentation (standalone)
- `src/style.css` — App stylesheet (updated with new design)
- `src/text_to_display.ts` — Main UI component (contains header text)
- `src/z3_integration.ts` — Z3 solver wrapper
- `src/parser.ts` — Constraint parsing
- `src/pr_sat.ts` — Core PrSAT logic
- `public/` — Static assets (Z3 files)
- `dist/` — Production build output
