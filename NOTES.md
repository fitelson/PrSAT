# PrSAT 3.0 Development Notes

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

Opens at: http://localhost:5173/

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
