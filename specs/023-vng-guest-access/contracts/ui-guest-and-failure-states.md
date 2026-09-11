# Contract: UI states — login screen, guest notice, user menu, data-area failures

**Feature**: 023-vng-guest-access | Shell: `frontend/shared/src/dashboard/`

Behavioural contract the Playwright spec `tests/vng-guest-access.spec.mjs` asserts. Visual details
defer to the existing dashboard tokens (constitution VI).

## Login screen (`LoginScreen.tsx`) — only when `appConfig.guestAccess && features.guestAccess[app]`

```
[ Sign in ]                               ← primary, unchanged
── or ──
[ Explore as guest ]                      ← secondary (outline) button
⚠ You will see only publicly available     ← always visible next to the button, not a tooltip,
  information. Spaces, initiatives, people   not behind a click (FR-002)
  and figures that require an account will
  be missing. Sign in to see everything.
```

- Order/precedence: sign-in above guest; the OIDC error alert (cancelled/failed) renders above both
  and never hides the guest option (FR-004).
- Clicking guest: button shows a spinner, `POST /api/auth/guest`, shell transitions to `guest`
  without navigation. On 403 `GUEST_ACCESS_DISABLED` the option is removed and an inline note shown.
- GovTech renders exactly today's screen (no `or`, no guest button, no warning).

## Guest notice (`GuestNotice.tsx`) — replaces `AuthorizationWarning` while `status === 'guest'`

- Position, styling and `lg` collapse behaviour identical to `AuthorizationWarning`
  (`role="alert"`, full text always in the accessibility tree).
- Content: **Browsing as a guest** — "Data may be incomplete: only public Spaces, initiatives and
  people are shown." + `[Sign in]` button.
- `[Sign in]` → `login(window.location.origin + '/?tab=' + activeTab)`.
- Present on all eight tabs (test iterates the tab strip).

## User menu (`UserMenu.tsx`) in guest mode

- Trigger: generic guest avatar + label "Guest".
- Items: language switch (unchanged), **Sign in**, **Leave** (→ `DELETE /api/auth/guest` → login
  screen). **No** "Sign out".

## Return after sign-in

- On mount, if `?tab=<key>` is present and valid, the shell activates it and removes the parameter
  (`history.replaceState`). Selection is restored from `<prefix>_selection` as today.

## Data-area failure (`DataAreaFailure.tsx`) — every area, both modes

| Error class | Copy (i18n key) | Actions |
|---|---|---|
| `NetworkError` | `failure.network` | Retry |
| `RequiresSignInError` | `failure.requiresSignIn` | Sign in |
| `UpstreamUnavailableError` (alone) | `failure.unavailable` | Retry |
| `UpstreamUnavailableError` (shell banner active) | one-line `failure.seeBanner` | — |
| `RequestFailedError` 429 | `failure.rateLimited` | Retry |
| `RequestFailedError` 4xx other | `failure.generic` | — |
| `RequestFailedError` 5xx | `failure.generic` | Retry |
| partial `spaceFailures` (`failed`) | `failure.spacesPartial` `{{failed}}/{{total}}` | Retry |
| partial `spaceFailures` (`restricted`, guest) | `failure.spacesRestrictedGuest` | Sign in |
| all spaces restricted (guest) | `failure.nothingPublic` (empty-state, not error) | Sign in |

- Never renders `error.message` from the server. `console.error` keeps the raw cause.
- Retry re-invokes only that area's `reload`; no page reload; on success the notice unmounts.
- No automatic retry anywhere (FR-018).

## Slow request (`useDataArea`, `slowAfterMs` default 30 000)

- After the threshold, the loading state shows `failure.slow` ("This is taking longer than usual…")
  with `[Cancel]`; existing progress text (per-space) remains. Cancel aborts the request and shows the
  area's failure state with Retry.

## Consolidated unavailable banner (shell)

- Shown under the header when `UpstreamStatus.unavailable`; text `failure.unavailableBanner`,
  `[Retry all]`. Hidden as soon as any area loads successfully.
- In guest mode the guest notice stays above it (both visible).

## Playwright assertions (summary)

1. VNG: login screen has both options + warning; GovTech: no guest option.
2. Choose guest → dashboard, no navigation, notice on every tab, user menu shows Guest/Sign in/Leave.
3. Mock `POST /api/vng/dashboard` → 503 `ALKEMIO_UNREACHABLE` with graph OK → banner + graph tab
   still renders; Retry all clears when mock restored.
4. Mock `GET /api/vng/initiatives` → 403 `GUEST_FORBIDDEN` → initiatives area shows "requires
   signing in"; **`page.url()` unchanged** (no redirect).
5. Mock graph with `spaceFailures: [{reason:'failed'}]` → partial notice with Retry; after Retry
   with clean mock, notice gone.
6. Member mode: mock any route → 401 → navigation to `/api/auth/login?...` (unchanged behaviour).
7. `mobile-navigation.spec.mjs` continues to pass (no horizontal page scroll with notices present).
