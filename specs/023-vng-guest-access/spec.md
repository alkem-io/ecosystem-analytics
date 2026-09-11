# Feature Specification: VNG Guest Access

**Feature Branch**: `023-vng-guest-access`
**Created**: 2026-09-11
**Status**: Draft
**Input**: User description: "I want to update the VNG dashboard to also allow the user to explore the dashboard without being logged in to alkemio. There would then need to be an option to do this on the login screen, and importantly to make the user aware they will likley miss data. Further the applicaiton likely will need to be more robust to requests to retrieve data failing, but should handle that cleanly."

## Overview

Today the VNG Kenniscentrum Innovatie dashboard is only reachable behind an Alkemio sign-in. Anyone
who lands on it — a gemeente policy officer following a link from a colleague, a VNG programme
manager on a phone, a journalist, a councillor — meets a single "Sign in" button and, without an
Alkemio account, gets no further. Much of what the dashboard shows is built from Spaces that are
*public* on Alkemio, so for many of these visitors the sign-in wall guards nothing they could not
already see on the platform itself.

This feature opens a second door on the VNG login screen: **explore as a guest**. A guest sees the
same dashboard — the same tabs, charts, map, funnel and tables — populated with whatever Alkemio
makes available without an account. Because a guest is not authorised to see everything a signed-in
member is (private Spaces, restricted communities, member-only detail), the dashboard must be honest
about that: the visitor is told *before* choosing the guest door that they will likely miss data,
and is reminded throughout the visit, with a one-click path to sign in and see more.

Opening the dashboard to guests also raises the bar on resilience. A guest is more likely to hit
Spaces they cannot read, and the dashboard can no longer assume that every data request either
succeeds or means "your session has expired — go sign in again". A single failing request must never
blank the whole dashboard, must never bounce a guest into a sign-in loop, and must always leave the
visitor with a clear explanation and a way to retry. This hardening applies to signed-in users just
as much as to guests; it is not a guest-only mode.

The GovTech dashboard and the Explorer are **out of scope**: they keep their existing sign-in-only
behaviour unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose to explore without signing in (Priority: P1)

A visitor opens the VNG dashboard without an Alkemio session and sees the login screen. Alongside
"Sign in", there is a clearly secondary option to continue as a guest. Before or as part of choosing
it, the visitor is told plainly what that means: they will see only publicly available information,
some Spaces, initiatives, people and figures will be missing or incomplete, and signing in shows
more. Choosing the guest option takes them straight into the dashboard with no account, no form and
no redirect to Alkemio.

**Why this priority**: This is the door itself. Without it nothing else in the feature is reachable,
and the "aware they will likely miss data" requirement is met at the moment the decision is made —
which is where it matters most.

**Independent Test**: Open the VNG dashboard in a browser with no session. Confirm both options are
present, that the guest option carries the data-completeness warning, and that choosing it lands on
the dashboard without any sign-in redirect. Confirm the sign-in option still works exactly as before.

**Acceptance Scenarios**:

1. **Given** a visitor with no session on the VNG login screen, **When** the screen renders, **Then**
   it offers both "Sign in" (primary) and "Explore as guest" (secondary), and the guest option is
   accompanied by a visible statement that guests see only public data and will likely miss
   information.
2. **Given** the login screen, **When** the visitor chooses the guest option, **Then** the dashboard
   opens directly, no redirect to Alkemio occurs, and no credentials are requested.
3. **Given** the login screen, **When** the visitor chooses "Sign in", **Then** the existing Alkemio
   sign-in flow runs unchanged and, on success, the dashboard opens as a signed-in user with no guest
   notice.
4. **Given** the login screen after a cancelled or failed Alkemio sign-in, **When** the error is
   shown, **Then** the guest option remains available as an alternative.
5. **Given** the GovTech dashboard login screen, **When** it renders, **Then** no guest option is
   offered — its behaviour is unchanged.

---

### User Story 2 - Explore as a guest, always aware of what is missing (Priority: P1)

A guest uses the dashboard: picks a hub and Spaces, moves across the Dashboard, Graph, Funnel,
Cities, Initiatives and other tabs, hovers and drills into details. Everything that is public on
Alkemio appears; anything the guest is not permitted to see is simply absent or shown as restricted,
never as an error. A persistent, unmistakable notice states that they are browsing as a guest with
limited data, and offers "Sign in" right there. Signing in from the notice returns them to the same
dashboard, on the same tab, with the same selection, now with full access.

**Why this priority**: This is the value the feature delivers — a usable dashboard for people without
accounts — and the second half of the awareness requirement: the reminder must survive past the
login screen, because a guest may spend twenty minutes in the tool and share a screenshot of a
figure that is incomplete.

**Independent Test**: Enter as a guest, exercise every tab with a selection that mixes public and
private Spaces, confirm the guest notice is present on every tab, confirm no tab shows an error
purely because of restricted content, then sign in from the notice and confirm the same tab and
selection are restored with the notice gone.

**Acceptance Scenarios**:

1. **Given** a guest in the dashboard, **When** they view any tab, **Then** a guest notice is visible
   stating they are browsing without an account, that data may be incomplete, and offering a sign-in
   action.
2. **Given** a guest with a selection containing Spaces they may not read, **When** any tab loads,
   **Then** the readable Spaces' data is shown, the unreadable ones are omitted or marked as
   restricted, and no error message is shown for the restriction itself.
3. **Given** a guest on a specific tab with a specific hub and Space selection, **When** they sign in
   from the guest notice and complete sign-in, **Then** they land back on that tab with that selection
   and the guest notice is no longer shown.
4. **Given** a guest, **When** a data set is entirely unavailable to guests (for example a whole hub
   or an initiatives corpus that is not public), **Then** the corresponding area explains that this
   content requires signing in, rather than appearing empty or broken.
5. **Given** a guest, **When** they use the user menu, **Then** it identifies them as a guest, offers
   "Sign in" and "Leave" (return to the login screen), and offers no sign-out.

---

### User Story 3 - Data retrieval failures are contained and recoverable (Priority: P2)

Whether signed in or a guest, when one request for data fails — a hub list, a Space's contents, the
initiatives layer, the gemeente locations, a single Space among several in a selection — the
dashboard degrades to exactly that gap. The rest of the tab keeps working with the data it has; the
failed area shows a short plain-language explanation of what could not be loaded and a "Retry"
action; the dashboard never goes blank, never shows raw technical text, and never redirects to the
sign-in page unless the visitor's own session has genuinely expired.

**Why this priority**: The user explicitly called this out, and guest access makes it necessary: a
guest's requests fail for more reasons (no permission, no session to refresh) and the current
"any authentication failure means go sign in" reflex would trap a guest in a redirect loop. But the
same containment benefits signed-in users on a flaky connection or when Alkemio is partially down.

**Independent Test**: With a multi-Space selection, simulate the failure of one backing request at a
time (unreachable service, slow response, permission refusal, malformed reply) and confirm for each
that only the dependent area shows the failure, that Retry re-requests just that data, that the
other areas remain usable, and that no redirect to sign-in occurs. Separately confirm that a
signed-in user whose session has actually expired is still taken to sign in.

**Acceptance Scenarios**:

1. **Given** a selection of several Spaces, **When** retrieval fails for one of them, **Then** the
   tab renders with the remaining Spaces' data and clearly indicates which Space(s) could not be
   loaded, with a Retry action for them.
2. **Given** any tab whose primary data request fails outright, **When** the failure is shown,
   **Then** the message is plain-language (what could not be loaded, and a suggested next step), it
   contains no raw error codes or stack text, and a Retry action re-issues only that request.
3. **Given** a guest, **When** a request is refused because guests are not permitted to access that
   content, **Then** the dashboard does not redirect to sign-in and does not loop; it shows the
   "requires sign-in" explanation inline.
4. **Given** a signed-in user whose session has expired, **When** any request is refused for that
   reason, **Then** the user is taken to sign in and returned afterwards — the existing behaviour is
   preserved.
5. **Given** a request that is taking unusually long, **When** the wait exceeds a reasonable limit,
   **Then** the visitor is told the request is slow and can cancel or keep waiting, rather than
   facing an indefinite spinner.
6. **Given** a request that fails, **When** the visitor chooses Retry and it succeeds, **Then** the
   failure notice disappears and the area renders normally with no page reload.
7. **Given** a Space that the visitor can read only partially (public "about" but restricted
   contents), **When** it loads, **Then** it is shown with its available information and marked as
   restricted — consistent with how restricted subspaces are already shown elsewhere.

---

### User Story 4 - Guests and members stay isolated (Priority: P3)

A guest never sees data that was retrieved for a signed-in user, and a signed-in user is never served
the reduced guest view. Guest browsing does not create an Alkemio account, does not leak anything
about any member, and cannot be used to reach any member-only capability of the dashboard.

**Why this priority**: This is a correctness and privacy guarantee rather than visible functionality,
but it is a hard condition of opening the door at all: the dashboard caches data per person precisely
so that one person's authorised view never leaks to another.

**Independent Test**: Sign in as a member with access to a private Space and load it; then, in a
fresh browser, enter as a guest and load the same Space. Confirm the guest sees only the public view.
Then sign in in the guest browser and confirm the full view appears without stale guest data
persisting.

**Acceptance Scenarios**:

1. **Given** a signed-in member has recently loaded a private Space, **When** a guest requests that
   Space, **Then** the guest receives only what is publicly available — never the member's cached
   view.
2. **Given** a guest has recently loaded a Space, **When** a member signs in and loads it, **Then**
   the member receives their full authorised view, not the guest's reduced one.
3. **Given** a guest, **When** they attempt to reach any capability reserved for signed-in users,
   **Then** they are told it requires signing in; nothing is performed on their behalf.

---

### Edge Cases

- **Every selected Space is unreadable to the guest**: the dashboard shows an explanatory empty state
  ("nothing here is public — sign in to see more"), not a bare "no data" or an error.
- **Alkemio itself is unreachable**: both guests and members see a single clear "service unavailable"
  state with Retry, not a cascade of per-area errors, and not a sign-in redirect.
- **The visitor signs in in another tab while browsing as a guest**: on their next action or reload
  in the guest tab, the dashboard recognises the session and drops the guest notice.
- **A member's session expires while the dashboard is open**: they are taken to sign in and brought
  back, as today; they are never silently downgraded to a guest.
- **A guest returns later in the same browser**: the guest choice does not silently persist across
  browser sessions — a new visit shows the login screen (with its warning) again.
- **A guest follows a shared deep link to a specific tab/selection**: the login screen is shown first;
  after choosing guest, the requested tab/selection is honoured.
- **Slow or repeated failures**: Retry is manual and never automatic in a tight loop; the dashboard
  must not hammer the service with repeated requests after a failure.
- **A response arrives malformed or missing optional fields**: the affected area degrades to what is
  usable (existing graceful-degradation principle) rather than crashing the tab.
- **A guest attempts an action that modifies data or personal state** (feedback, saved preferences
  tied to an account): the action is unavailable to guests and explains why.

## Requirements *(mandatory)*

### Functional Requirements

**Guest entry**

- **FR-001**: The VNG login screen MUST offer a guest option alongside sign-in, visually secondary to
  sign-in.
- **FR-002**: The guest option MUST be accompanied, on the login screen itself, by a plain-language
  warning that guests see only publicly available information and will likely miss Spaces,
  initiatives, people and figures that require an account.
- **FR-003**: Choosing the guest option MUST open the dashboard without any redirect to Alkemio and
  without requesting credentials.
- **FR-004**: The guest option MUST remain available on the login screen after a cancelled or failed
  sign-in.
- **FR-005**: The existing sign-in path MUST be unchanged for members: same flow, same result, no
  guest notice after sign-in.
- **FR-006**: Guest access MUST be enabled for the VNG dashboard only; the GovTech dashboard and the
  Explorer MUST behave exactly as before.

**Guest experience**

- **FR-007**: While browsing as a guest, every tab MUST display a persistent guest notice stating that
  the visitor is browsing without an account, that data may be incomplete, and offering a sign-in
  action. The notice MUST remain available to assistive technology at all times and MAY condense
  visually on small screens, consistent with the existing authorisation notice.
- **FR-008**: A guest MUST see, in every view, all information that Alkemio makes available without an
  account, and MUST NOT see anything that requires an account.
- **FR-009**: Content a guest is not permitted to read MUST be omitted or marked as restricted; the
  restriction itself MUST NOT be presented as an error.
- **FR-010**: Signing in from the guest notice MUST return the visitor to the same tab, hub and Space
  selection they had as a guest.
- **FR-011**: The user menu MUST identify a guest as such, offer "Sign in" and a way back to the login
  screen, and MUST NOT offer sign-out.
- **FR-012**: The guest choice MUST NOT persist across browser sessions; a fresh visit MUST show the
  login screen and its warning again.
- **FR-013**: When an entire data set is unavailable to guests (a hub, a corpus of initiatives, a
  layer), the dependent area MUST explain that the content requires signing in.

**Failure handling (all visitors)**

- **FR-014**: The failure of one data request MUST affect only the area of the dashboard that depends
  on it; every other area MUST continue to render with the data it has.
- **FR-015**: When a selection spans several Spaces and some fail to load, the dashboard MUST render
  the successful ones and identify the failed ones, with a Retry action for the failed ones.
- **FR-016**: Every failure notice MUST be plain-language — what could not be loaded and a suggested
  next step — and MUST NOT expose raw error codes, technical identifiers or stack text.
- **FR-017**: Every failure notice MUST offer a Retry action that re-issues only the failed request,
  without reloading the page; on success the notice MUST clear.
- **FR-018**: Retry MUST be manual; the dashboard MUST NOT automatically re-issue a failed request in a
  tight loop.
- **FR-019**: A request refused because the visitor is a guest MUST NOT trigger a redirect to sign-in
  and MUST NOT cause a redirect loop; it MUST surface as a "requires sign-in" explanation inline.
- **FR-020**: A request refused because a signed-in member's session has genuinely expired MUST still
  take the member to sign in and back, as today; a member MUST never be silently downgraded to guest.
- **FR-021**: A request that exceeds a reasonable waiting time MUST inform the visitor that it is
  slow and let them cancel or keep waiting, rather than showing an indefinite loading state.
- **FR-022**: When the upstream platform is entirely unreachable, the dashboard MUST present one
  consolidated "service unavailable" state with Retry rather than many independent per-area errors.
- **FR-023**: Responses that are malformed or missing optional information MUST degrade the affected
  area to what is usable and MUST NOT crash the tab (existing graceful-degradation principle).

**Isolation and safety**

- **FR-024**: Data retrieved for a guest MUST be held separately from data retrieved for any signed-in
  member; a guest MUST never be served a member's view and a member MUST never be served the guest
  view.
- **FR-025**: Guest browsing MUST NOT create an Alkemio account, sign the visitor in to Alkemio, or
  store any personal information about the visitor.
- **FR-026**: Any capability reserved for signed-in users (actions that modify data or personal
  state) MUST be unavailable to guests and MUST explain that it requires signing in.
- **FR-027**: Guest requests MUST be bounded so that opening the dashboard to the public cannot place
  unbounded load on the upstream platform — guests requesting the same public content MUST be served
  from a shared result rather than each triggering fresh upstream retrieval.

### Key Entities

- **Visitor mode**: whether the current visitor is a *member* (has an Alkemio session) or a *guest*
  (has chosen to explore without one). Determines which data is retrieved, whether the guest notice
  is shown, and how a refused request is interpreted.
- **Guest notice**: the persistent in-dashboard reminder that the visitor is a guest with incomplete
  data, carrying the sign-in action and the return-to context (tab, hub, selection).
- **Data area**: an independently loading region of a tab (hub list, Space contents, initiatives
  layer, gemeente locations, per-Space data within a selection). Each area has its own loading,
  loaded, failed and restricted states and its own Retry.
- **Failure notice**: the plain-language state of a data area that could not load — the reason
  category (unreachable, slow, refused-for-guests, session-expired, partial), the human explanation,
  and the Retry action.

## Assumptions

- "Without being logged in to Alkemio" means genuinely anonymous: anyone who can reach the VNG
  dashboard's address can choose the guest door; no invitation, code or shared password is involved.
- What a guest can see is exactly what Alkemio exposes to a visitor with no account — public Spaces,
  public profiles, public initiatives. The dashboard does not define its own notion of "public"; it
  defers to the platform's visibility rules.
- The GovTech dashboard and the Explorer stay sign-in only. Guest access is a per-dashboard choice,
  and only VNG opts in for now.
- The guest choice lasts for the browser session (until the browser/tab is closed or the visitor
  signs in or leaves); it is deliberately not remembered across visits, so the data-completeness
  warning is seen on every new visit.
- The guest notice is at least as prominent as the existing "you only see data you are authorised
  to see" notice and replaces it for guests (a guest does not need both).
- "Reasonable waiting time" for the slow-request notice follows the dashboard's existing long-request
  progress behaviour (the graph acquisition already reports progress); the notice appears where a
  visitor would otherwise conclude the tool has frozen, on the order of tens of seconds.
- Failure handling is implemented once for the shared dashboard shell, so GovTech benefits from the
  robustness improvements even though it does not gain guest access.
- Guests share one cached view of public content for a bounded period; this both isolates them from
  member data and keeps upstream load bounded regardless of how many guests visit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor with no Alkemio account can reach a populated VNG dashboard from the login
  screen in a single click and under 10 seconds, with no redirect away from the dashboard.
- **SC-002**: 100% of guest sessions display the data-completeness warning both on the login screen
  and on every dashboard tab; in usability checks, at least 90% of guest testers can state
  unprompted that they are seeing incomplete data.
- **SC-003**: For a selection mixing public and private Spaces, a guest sees every public Space's
  data and zero error messages attributable to restricted content.
- **SC-004**: When exactly one backing request fails, 100% of unaffected dashboard areas
  remain rendered and interactive, and Retry restores the failed area without a page reload.
- **SC-005**: Zero guest sessions are redirected to Alkemio sign-in without the visitor choosing it,
  and zero sign-in redirect loops occur in failure testing.
- **SC-006**: Zero failure notices shown to visitors contain raw error codes, technical identifiers
  or stack text.
- **SC-007**: A guest and a member loading the same Space receive different views whenever the Space
  has member-only content, and never each other's — verified for every data area.
- **SC-008**: Signing in from the guest notice returns the visitor to the same tab, hub and selection
  in 100% of tested cases.
- **SC-009**: Signed-in members experience no change in behaviour on the happy path — the existing
  end-to-end sign-in and dashboard tests pass unchanged.
- **SC-010**: One hundred concurrent guests viewing the same public content generate no more upstream
  retrieval than a single guest would.
