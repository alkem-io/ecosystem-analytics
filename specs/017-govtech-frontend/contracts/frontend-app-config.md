# Contract: Frontend `AppConfig` (shared shell parameterisation)

The promoted shared shell `@ea/shared/app/DashboardApp` is brand- and app-neutral. Each wrapper app supplies an `AppConfig` via context; the shell and promoted hooks/components derive every previously-hardcoded `vng` value from it.

## Shape

```ts
interface AppConfig {
  appId: 'vng' | 'govtech';
  apiNamespace: string;        // `/api/${apiNamespace}/dashboard|initiatives`   (= appId)
  storagePrefix: string;       // localStorage `${storagePrefix}_selection|_lang` (= appId)
  eventPrefix: string;         // events `${eventPrefix}:openSpace|:selection`    (= appId)
  Logo: React.ComponentType<{ className?: string }>;
  exportCreator: string;       // XLSX workbook creator
  exportFilenameStem: string;  // XLSX filename stem, e.g. "govtech-dashboard"
}
```

## Consumers (what the audit flagged, now config-driven)

| Hardcoded today (VNG) | Now sourced from |
|---|---|
| `/api/vng/dashboard`, `/api/vng/initiatives` | `apiNamespace` |
| `vng_selection`, `vng_lang` (localStorage) | `storagePrefix` |
| `vng:openSpace`, `vng:selection` (events) | `eventPrefix` |
| `VngLogo` in header/loading/login | `Logo` |
| `wb.creator = 'VNG…'`, `vng-dashboard-*.xlsx` | `exportCreator`, `exportFilenameStem` |
| `app.title` / `app.subtitle` strings | each app's i18n bundle |
| brand colours / radius | each app's `styles/index.css` (scoped) |

## Wrapper responsibilities (per app)

A wrapper (`frontend/vng`, `frontend/govtech`) provides ONLY:
1. `appConfig.ts` — the `AppConfig` literal (+ its `Logo`).
2. `<Logo>` SVG component (own colours/wordmark).
3. `styles/index.css` — brand-token CSS overrides, scoped to that app's root.
4. `i18n/{index.ts,nl.json,en.json}` — own bundle + `${appId}_lang` storage key; NL default.
5. `main.tsx` / `App.tsx` — `createRoot(...).render(<AppConfigProvider value={cfg}><DashboardApp/></AppConfigProvider>)`.
6. `vite.config.ts` (port + proxy + console prefix), `package.json`, `index.html`, tsconfig, tailwind/postcss.

Everything else (3-tab shell, pages, hooks, components, charts, selection context, export) comes from `@ea/shared` and is identical across both apps.

## Invariants

- `appId` MUST equal a server `config.dashboards[appId]` key (or app-aware routes 400).
- Storage/event/API prefixes MUST be unique per app (no cross-app bleed on a shared parent domain).
- Promotion MUST preserve VNG's existing rendered output — verified by VNG's existing Playwright visual snapshots (FR-051 guard).
