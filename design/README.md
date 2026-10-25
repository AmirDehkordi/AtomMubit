# Design notes

Working material behind the desk UI polish. Nothing here is loaded by the app.

- `logo/`: six candidate marks for MuTick plus the old one, with `preview.html` and a write-up. Option 4, "M tick", is the one in use (`apps/web/components/brand.tsx`).
- `colour/`: research on colour in finance products, three palettes (A Ink, B Brass, C Mono) with contrast checks, `preview.html` to compare them, screenshots in `shots/`, and `plan.md`. Option A, "Ink", is the one applied (`apps/web/app/globals.css`).

- `charts/`: an audit of the dashboard charts against finance and data-visualisation guidance, with sources, before/after mock-ups and a prioritised list (`findings.md`). F1–F18 are applied, except that the gradient under the sparklines and the margin line is kept.

Open any `preview.html` in a browser. The `.mjs` and `.sh` files regenerate the previews and screenshots.
