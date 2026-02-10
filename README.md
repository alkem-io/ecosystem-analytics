# ecosystem-analytics

Allowing the visualisation and analysis of ecosystem level connectivity and activity.

## Visual Regression (Pixel-Perfect)

This repo includes a Playwright visual regression harness to keep the UI aligned with the pixel-perfect contract in [specs/001-ecosystem-analytics/design-brief-figma-make.md](specs/001-ecosystem-analytics/design-brief-figma-make.md).

### Option A: Run against the local Figma Make export (recommended for now)

This works if you have the extracted export at `.prototype/alkemio-redesign`.

- Install dependencies: `npm install`
- Install the prototype dependencies: `npm run setup:prototype`
- Install Playwright browsers: `npx playwright install`
- Run visual tests (starts the prototype dev server automatically): `npm run test:visual:prototype`

To approve/update screenshots:
- `npm run test:visual:update`

### Option B: Run against an external app URL

If you have the real app running elsewhere:

- `BASE_URL=http://localhost:5173 npm run test:visual`
