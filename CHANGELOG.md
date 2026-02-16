# PrSAT 3.0 Changelog

> **Note:** This is a local build for deployment to fitelson.org. These changes are not committed to the GitHub repository (imapersonman/PrSAT).

## 2026-02-16

### Changed: "No model to display" Punctuation

- Changed "No model to display!" to "No model to display." (period instead of exclamation mark)

**Changes:**
- `src/text_to_display.ts`: Updated message text in `model_finder_display`

### Added: Deploy Script

- Added `npm run deploy` script that builds and uploads `dist/` to fitelson.org via `scp`

**Changes:**
- `package.json`: Added `deploy` script

### Fixed: Dev Server Command in README

- Fixed the "Running the development server" section: changed `npm install` to `npm run dev`

**Changes:**
- `README.md`: Corrected the command in the dev server instructions

## 2026-02-13

### Removed: GitHub Actions CI Workflows

- Removed Playwright and static deployment CI workflows (not needed — tests are run locally)

**Changes:**
- `.github/workflows/playwright.yml`: Deleted
- `.github/workflows/static.yml`: Deleted

## 2026-02-11

### Removed: Redundant Clear Button from Model Evaluate Dialog

- Removed the Clear button that appeared next to the "Evaluate model" heading
- The block's own Clear button (in the Load/Save/Clear/Batch toolbar) remains

**Changes:**
- `src/text_to_display.ts`: Removed `clear_all` function and inline Clear button from model evaluators section

## 2026-02-03

### Added: "v" as Disjunction Symbol

- The parser now accepts lowercase `v` as a disjunction symbol in addition to `∨` and `\/`
- Users can now write `A v B` instead of `A \/ B` or `A ∨ B`

**Changes:**
- `src/pr_sat.ts`: Added `'v'` to `possible_constraint_connectives.disjunction` and `possible_sentence_connectives.disjunction`
- `src/constants.ts`: Updated instruction text to include `v` option and removed "(hint: the '∨' is NOT a v)" notes

### Simplified: Syntax Error Message

- Simplified syntax error display for invalid constraint entries
- Previously showed "ⓘ Error!" button with detailed parser error in popup
- Now shows "Syntax error (not a wff)." directly on the button
- Instructions popup still available when clicked

**Changes:**
- `src/block_playground.ts`: Changed error state button text from `INFO_MESSAGE_ERROR` to `"Syntax error (not a wff)."`; removed error message appended to popup

## 2026-01-31

### Added: Clear Button for Constraint Entry

- Added "Clear" button to the main constraint entry area, positioned to the right of "Show Batch Input"
- Clicking it resets all constraints to a single empty input box

**Changes:**
- `src/block_playground.ts`: Added `clear_button` in `generic_input_block()` that calls `block.set_fields([''])`

## 2026-01-29

### Improved: Simplified Quadratic Irrational Display

- Quadratic irrationals are now displayed in simplified form with decimal approximation
- Previously showed verbose unsimplified quadratic formula: `(-6 + √(6² - 4*8*(-1))) / (2*8)`
- Now shows simplified exact form plus decimal: `(-3 + √17) / 8 ≈ 0.1404`

**Simplifications applied:**
- Computes discriminant `b² - 4ac`
- Extracts perfect square factors from the radical (e.g., `√68 = 2√17`)
- Reduces fraction by GCD of numerator terms and denominator
- Appends 4-decimal approximation

**Special cases:**
- Perfect square discriminant: displays as rational number (no radical)
- Denominator of 1: omits fraction bar
- Zero constant term: shows just the radical term

**Changes:**
- `src/text_to_display.ts`: Added `gcd`, `gcd3`, `extractPerfectSquare`, `simplifyQuadraticRoot` helper functions; rewrote `quad_root_to_display` to use simplified form

## 2026-01-28

### Fixed: False "Division by zero!" in Model Evaluator

- Division-by-zero check now correctly handles the eliminated state variable
- Previously, `Pr(X | ~Y)` would incorrectly show "Division by zero!" even when `Pr(~Y) > 0`, because the eliminated state variable (e.g., `a_4`) was not substituted before evaluation — Z3's model completion assigned it 0

**Example:** With a model where `a_2 = 0` and `a_4 = 1/2`, evaluating `Pr(X | ~Y)` no longer falsely reports division by zero (`Pr(~Y) = a_2 + a_4 = 1/2`)

**Changes:**
- `src/z3_integration.ts`: Div-by-zero constraints now go through `eliminate_state_variable_index_in_constraint_or_real_expr()` before evaluation, matching what was already done for the main expression

### Fixed: Conditional Probability Division by Zero

- Model evaluator now correctly shows "Division by zero!" for conditional probabilities when the condition has probability zero
- Previously, `Pr(A | B)` would incorrectly evaluate to `0` when `Pr(B) = 0`; now it correctly reports undefined (0/0)

**Example:** With a model where `Pr(~Q) = 0`, evaluating `Pr(P | ~Q)` now shows "Division by zero!" instead of `0`

**Changes:**
- `src/pr_sat.ts`: `div0_conditions_in_real_expr()` now generates a div-by-zero check for `given_probability` expressions
- `src/z3_integration.ts`:
  - Fixed `real_expr_to_arith()` to construct state variable sums symbolically (was incorrectly evaluating the first variable)
  - Added `model_completion` parameter to `model.eval()` to correctly evaluate eliminated state variables in div-by-zero checks

### Updated: Video Demo Link

- Changed video demo URL to `https://youtu.be/F_WbzKr7qJQ`

**Changes:**
- `src/text_to_display.ts`: Updated link in the intro section

## 2026-01-26

### Added: Save Table as Image Button

- New "Save table as image" button exports the probability table as a high-resolution PNG (2x pixel ratio)
- Button appears on its own row below the "Save translated constraints" and "Save SMTLIB input" buttons
- Only appears when a model is found (SAT result)
- The other two save buttons now appear for all solver results (SAT, UNSAT, cancelled, etc.)

**Changes:**
- `package.json`: Added `html-to-image` dependency
- `src/text_to_display.ts`: Added import and button logic in `start_search_solver`

### Simplified: Timeout Input

- Replaced hours/minutes/seconds fields with a single "seconds" field
- Default: 60 seconds, range: 1-3600 seconds

**Changes:**
- `src/text_to_display.ts`: Simplified `timeout()` function to single seconds input
- `tests/test_ids.ts`: Removed unused `hours` and `minutes` test IDs
- `tests/simple.spec.ts`: Updated `set_timeout()` helper function

## 2026-01-25

### Updated: Video Demo Link

- Changed video demo URL to `https://youtu.be/KKVGHH0zCQM`
- Link text changed from "brief video demo" to "Here"

**Changes:**
- `src/text_to_display.ts`: Updated link in the intro section

### Added: Demo Text File Download Link

- Added link to download the demo text file after the video demo sentence
- Link points to `https://fitelson.org/PrSAT/PrSAT_3.0_demo_examples.txt`

**Changes:**
- `src/text_to_display.ts`: Added download link in the intro section

### Changed: Consistent State Variable Naming

- State variables now use `a_i` naming (1-indexed) throughout the application
- Previously, saved constraints and SMTLIB output used `s_i` (0-indexed) while the HTML display used `a_i` (1-indexed)
- Now all outputs are consistent: `a_1`, `a_2`, etc.

**Changes:**
- `src/pr_sat.ts`: `state_index_id()` now returns `a_${index + 1}` instead of `s_${index}`
- `src/z3_integration.ts`: `model_to_assigned_exprs()` now converts 1-indexed variable names back to 0-indexed internal indices when parsing Z3 model output

### Improved: Immediate Display of Translated Constraints

- Translated constraints now appear immediately when "Find Model" is pressed, before the solver starts searching
- Previously, constraints only appeared after the solver finished
- Save buttons ("Save translated constraints", "Save SMTLIB input") appear once solving completes

**Changes:**
- `src/z3_integration.ts`: Added `onTranslated` callback to `SolverOptions2`
- `src/text_to_display.ts`: Updated `start_search_solver` to display constraints via the callback

### Fixed: Cancel/Timeout Now Preserves Display

- Translated constraints and probability table now remain visible after cancel or timeout
- Previously, cancelling a search would clear the bottom part of the page

**Root Cause:** When Z3 reinitializes during cancel, it triggered `invalidate()` while state was still 'looking', which set state to 'waiting' and cleared the display.

**Changes:**
- `src/z3_integration.ts`: Z3 now reinitializes after any cancel, ensuring clean state for next search
- `src/text_to_display.ts`:
  - `invalidate()` now skips when state is 'looking' to prevent clearing display during cancel
  - Removed page reload from `cancel_fallback` - Z3 reinitialization is sufficient
  - Exception state now re-enables the "Find Model" button

### Added: Clear Button for Evaluate Model

- Added "Clear" button next to "Evaluate model" heading
- Clicking it resets the section to its initial state (one empty input box)

**Changes:**
- `src/text_to_display.ts`: Added `clear_all()` function and Clear button in `model_evaluators()`

## 2026-01-24

### Updated: Video Demo Link

- Changed video demo link to `https://www.youtube.com/watch?v=HkccWiMYI5Q`

## 2026-01-23

### Updated: Z3 Solver

- Upgraded `z3-solver` npm package from 4.14.0 to 4.15.4
- Updated WASM files in `public/` and `dist/` directories

## 2026-01-22

### Fixed: iOS Safari Compatibility

**Problem:** The app was showing "Unexpected Exception! [object Event]" on iOS Safari, while working fine on desktop browsers.

**Root Cause:** Two issues were identified:
1. CSS `@import` for Google Fonts conflicted with cross-origin isolation headers required by Z3's SharedArrayBuffer
2. The server (ICDSoft/Apache) needed specific headers to enable SharedArrayBuffer on mobile Safari

**Changes:**

#### `src/style.css`
- Removed `@import url('https://fonts.googleapis.com/...')` statement
- Google Fonts CSS imports break cross-origin isolation (COEP) on iOS Safari

#### `index.html`
- Changed page title from "Vite + TS" to "PrSAT 3.0"
- Added Google Fonts via `<link>` tags with `crossorigin` attribute (compatible with COEP)

#### `src/text_to_display.ts`
- Improved `window.onerror` handler to provide meaningful error messages
- Added specific detection for Z3 WebAssembly loading failures
- Error messages now include source location (file:line:column)

#### `dist/.htaccess` (new file)
- Added Apache configuration for proper WASM support and cross-origin isolation
- **Important:** This file must be uploaded to the server with the dist folder

### Notes

- The `.htaccess` file is required for iOS Safari compatibility on Apache servers (e.g., ICDSoft)
- GitHub Pages (imapersonman.github.io) handles these headers automatically
- Desktop browsers are more lenient with cross-origin isolation requirements
