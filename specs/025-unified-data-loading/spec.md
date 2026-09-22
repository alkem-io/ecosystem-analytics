# Feature Specification: Unified Data Loading

**Feature Branch**: `025-unified-data-loading`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "I want to streamline the data loading for the front end applications. At the moment it seems that the tabs have a habit of reloading data. The core data about the initiatives should be loaded once, and used then for further graph analysis if needed (so distinguish between data loading and deriving a graph from the data). Also I want you to examine carefully the data that is loaded from the server, I suspect it is doing way too much data loading so that it is unnecessarily putting load on the alkemio server. Have a joined up progress indicator across all the tabs, and data loading that works across all the tabs at once - so that the tabs then just augment the graph derived from the data if needed. If there is extra data to be loaded then it should be clear what data is being loaded. I want you to clearly separate the data loading from the calculation of the graph from the display."

## Background *(what happens today)*

The two dashboard applications (VNG and GovTech) share one shell with nine tabs — Dashboard, Graph, Initiative details, Initiatives, Cities, City details, Usage Explorer, Funnel, Intake and Ecosystem. A review of the current behaviour found:

- **Every tab loads for itself.** Each tab is a separate view that only exists while it is open. When a viewer opens a tab it asks the analytics service for the complete dataset of the current selection, keeps it privately, and throws it away when the viewer leaves. Switching Dashboard → Initiatives → Graph therefore means three full loads (and three transfers of a dataset that can run to megabytes) of the same selection, each with its own spinner and its own progress polling. The service protects the platform with a short memo (30 s) and a per-viewer cache (24 h), so the platform is usually not re-queried on a tab switch — but the viewer still waits, and the browser still re-receives and re-processes everything.
- **Tabs ask for different variants of the same thing.** Some tabs request the dataset *with* the GemeenteDelers initiative layer and some *without*, and the Dashboard tab additionally requests the pre-computed counts — so one selection produces several distinct datasets that are each loaded, cached and transferred separately.
- **A fresh load asks the platform for far more than the dashboards use.** For each selected Space the service fetches the Space, every readable subspace and sub-subspace (with a privilege check per subspace), every member's full profile (location, avatar, tag sets), **one request per organisation** (with description, references, website, location, tag sets), and two activity-feed sweeps (contributions and member-joins, in chunks of ten Spaces). Of that, the dashboards use roles, organisations, classifications and a small set of profile fields; activity counts appear only in the Initiatives table. Separately, the GemeenteDelers layer resolves gemeenten one request at a time and the Usage Explorer's location set is a 342-gemeente sweep. Organisations are the clearest case: there is no organisation-level cache, so an organisation that appears in six Spaces is fetched six times over, one request at a time, and fetched yet again (twice) when the GemeenteDelers layer resolves it as a gemeente. All of this is repeated **per viewer** (data is cached per user, by design), so ten viewers of the same hub cost the platform ten full acquisitions.
- **There is no single answer to "what is loading?"** Each tab shows its own indicator, only while it is open; opening a second tab during a load shows a second, unrelated indicator; nothing says *which* data is being fetched and why.

## Clarifications

### Session 2026-09-21

- Q: Where should the graph and other derived views be computed once the loaded data exists — browser or analytics service? → A: The service does the work: it acquires the platform data, augments/processes it, and returns it to the browser in a directly usable form, reporting its progress for both the loading and the processing/augmenting stages so the browser can keep the viewer informed. The browser derives only the tab-specific views (funnel, cities, ecosystem, …) from that returned data.
- Q: Should activity data (contribution counts shown only in the Initiatives table) be fetched on demand rather than in every core load? → A: Yes — activity is a separate, on-demand item, kept apart from the core *relational* data (Spaces, hierarchy, roles, organisations, classifications). Fetched once when the Initiatives table is first opened, announced in the indicator, retained for the session.
- Q: Are organisation profiles being loaded over and over? → A: Yes, today — one request per organisation, sequentially, on every acquisition, with no organisation-level cache (an organisation in several Spaces is re-fetched with each of them, per viewer, and again when the GemeenteDelers layer resolves gemeenten). Decision: an organisation's profile is fetched at most once per viewer per cache window, however many Spaces or layers reference it, and always in batches.
- Q: Should loaded data survive a page reload in the browser? → A: No browser cache — a reload re-requests the selection from the service; but a browser reload MUST NOT cause the service to re-fetch anything from Alkemio: it is served entirely from the service's own cache.
- Q: Where does the shared progress indicator live, and does it block tab content? → A: A persistent strip in the shared header (below the tab row), non-blocking; a tab shows its own placeholder only when the data it needs is not there yet.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load once, browse every tab (Priority: P1)

A programme manager at VNG opens the dashboard for the innovation hub. The data for the current selection is loaded **once**. Every tab — counts, graph, initiatives table, cities, funnel, ecosystem map — then opens instantly from that same loaded data, because each tab only *derives* its view from it. Changing the selection (adding or removing Spaces, toggling the GemeenteDelers layer) loads only what that change needs; switching tabs never loads anything.

**Why this priority**: This is the core complaint — tabs reloading the same data — and the largest part of the perceived slowness. It is also the foundation the other stories build on.

**Independent Test**: Open a hub, wait for the load to finish, then visit all nine tabs in turn while watching network activity: every tab must render its content in under a second with no further data requests for that selection.

**Acceptance Scenarios**:

1. **Given** a selection has finished loading, **When** the viewer switches to any other tab, **Then** that tab shows its content within one second and no data request is made.
2. **Given** a selection has finished loading, **When** the viewer switches away from a tab and back to it, **Then** the tab shows exactly the state it had (same data, same derived view) with no reload.
3. **Given** a loaded selection, **When** the viewer adds one Space, **Then** only that Space's data is loaded and every tab reflects the addition without reloading the Spaces already present.
4. **Given** a loaded selection, **When** the viewer toggles the GemeenteDelers layer on, **Then** only the initiative layer is loaded (once) and every tab that shows initiatives reflects it; toggling it off again loads nothing.
5. **Given** a viewer presses Refresh, **When** the load completes, **Then** every tab reflects the fresh data and the refresh happened exactly once, not once per tab.

---

### User Story 2 - One joined-up progress indicator (Priority: P1)

While data is loading, the viewer sees **one** progress indicator that is the same on every tab: what is being loaded (e.g. "Loading 22 Spaces — 14 of 22", "Loading GemeenteDelers initiatives", "Loading gemeente locations"), how far along it is, and — for anything beyond the core load — *why* it is being loaded (which tab or option asked for it). Switching tabs during a load does not restart, hide or duplicate the indicator; tabs whose content is already available show it, tabs that are waiting for an extra item say which item.

**Why this priority**: The user explicitly asked for a joined-up indicator, and it is the visible proof that loading is shared. Without it, even a correct shared load feels like the old behaviour.

**Independent Test**: Start a load on the Dashboard tab, switch to the Graph tab and then to Cities mid-load: the same header strip, with continuing (not restarting) progress, is visible on each, tab content is never covered by it, and it disappears from all tabs at the same moment.

**Acceptance Scenarios**:

1. **Given** a load is in progress on one tab, **When** the viewer switches to another tab, **Then** the same indicator with the same progress is shown there and continues from where it was.
2. **Given** the core load has finished but a tab-specific extra item is still loading (e.g. gemeente locations for the Usage Explorer), **When** the viewer is on a tab that does not need that item, **Then** that tab shows its content and the indicator names the extra item as loading in the background.
3. **Given** a load fails part-way, **When** the viewer looks at any tab, **Then** the indicator states what failed and what is still usable, and offers a retry; tabs that can render from the data already loaded do so.
4. **Given** a load is in progress, **When** the viewer looks at the indicator, **Then** it names the data being fetched in plain language and shows a count-based progress (items done of total) where a total is known, and a named step otherwise.

---

### User Story 3 - Only load what the dashboards use (Priority: P2)

A platform operator watches the load the analytics service places on the Alkemio platform. When a viewer opens a hub, the service asks the platform only for the data the dashboards actually display: Space hierarchy and membership roles, organisations' identity and category information, classifications, and the profile fields that appear on screen. Data that only one view needs (activity counts, detailed organisation profiles, per-gemeente location resolution) is fetched only when that view is opened, and is announced as such (Story 2). Requests that today go one-per-organisation are batched.

**Why this priority**: The user suspects — and the review confirms — that the service over-fetches. Reducing it protects the shared platform and shortens every first load, but it is invisible to viewers once Story 1 makes tabs instant, so it sits behind the viewer-facing stories.

**Independent Test**: Load the default VNG hub (~22 Spaces) fresh and count the platform requests and transferred volume in the service log before and after; the after-count must meet SC-004 and no dashboard view may lose any information it shows today.

**Acceptance Scenarios**:

1. **Given** a fresh (uncached) load of a hub, **When** it completes, **Then** the number of platform requests is at least half of what the same load costs today (SC-004) and every tab shows the same information as before.
2. **Given** a fresh load, **When** the viewer never opens the Initiatives table, **Then** no activity data is fetched for that selection.
3. **Given** the viewer opens a view that needs extra data (Initiatives activity columns, the Usage Explorer's locations), **When** that view opens, **Then** the extra data is fetched once, announced by name in the shared indicator, and reused by any other view that needs it for the rest of the session.
4. **Given** a selection with N organisations, **When** organisations are fetched, **Then** they are fetched in a bounded number of requests independent of N (batched), not one request per organisation.
5. **Given** an organisation that appears in several selected Spaces (or in the GemeenteDelers layer), **When** the selection loads or a Space is added, **Then** that organisation's profile is fetched at most once for the viewer; the service log shows no repeat fetch of the same organisation within the cache window.

---

### User Story 4 - Loading, deriving and displaying are three separate things (Priority: P2)

A developer adding a new tab or a new analysis can plug into three clearly separated layers: (1) the **loaded data** for the selection — the single source that Story 1 keeps; (2) **derivations** of it — the graph, the counts, the funnel, the city rows, the ecosystem model — each computed from the loaded data (and only recomputed when the data or its inputs change); and (3) the **display** — tabs and charts that render a derivation. A tab that needs a new derivation adds one; a tab that needs data nobody has loaded yet declares it, and the shared loader fetches and announces it.

**Why this priority**: This is the structural guarantee behind Stories 1–3 and the user's explicit request; it is what stops the "each tab loads for itself" pattern from creeping back in.

**Independent Test**: Trace any tab from screen to data: it must read a derivation, the derivation must read the loaded data, and neither the tab nor the derivation may trigger a load directly. Trace the Ecosystem and Funnel tabs specifically — both already derive client-side and must continue to, now from the shared loaded data.

**Acceptance Scenarios**:

1. **Given** the loaded data for a selection, **When** two tabs need the same derivation (e.g. the graph), **Then** it is computed once and shared, not once per tab.
2. **Given** a derivation's inputs are unchanged, **When** the viewer switches tabs, **Then** the derivation is not recomputed.
3. **Given** a new tab is added that needs only existing data, **When** it is opened, **Then** it renders without any new load and without any change to the loader.

---

### Edge Cases

- **Selection changes mid-load**: the in-flight load for the old selection is superseded; the indicator switches to the new selection; nothing from the abandoned load leaks into the new one.
- **Page reload**: the browser re-requests the selection; the service answers from its cache with no platform request, and the indicator shows only the transfer/processing, not a platform load.
- **Session expiry mid-load**: the viewer is routed to sign-in as today (one redirect, not one per tab); after signing in they return to the same selection and the load resumes from what is still cached.
- **Partial readability**: Spaces the viewer cannot read are omitted with a note (as today); the indicator counts them as done so progress reaches 100 %.
- **Guest viewers**: guests share one sentinel identity; they must get the same load-once behaviour and the same indicator, and must not be able to trigger more platform load than a signed-in viewer (existing rate limits still apply).
- **Two browser tabs on the same dashboard**: each browser tab is its own session; the service's memo/cache still ensures the platform is not asked twice within the memo window.
- **Force refresh while an extra item is loading**: the refresh restarts the core load and every extra item that has been requested; the indicator shows the whole plan.
- **Very large selections** (up to the configured maximum): progress remains count-based and the browser stays responsive; no tab is blocked on data it does not need.
- **Extra data fails but core data succeeds**: only the views needing the extra item show a fallback ("activity unavailable"); everything else renders.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST hold **one** loaded dataset per selection for the life of the page, shared by every tab; a tab MUST NOT own or request its own copy.
- **FR-001a**: The browser MUST NOT persist loaded data (no browser-side cache); a page reload re-requests the selection from the service. Such a reload MUST be served entirely from the service's cache and MUST NOT cause any request to the platform — only an explicit Refresh (FR-014) or cache expiry may.
- **FR-002**: Switching tabs MUST NOT trigger any data request; a tab MUST render from the shared loaded data (or from its derivation of it) that already exists.
- **FR-003**: A change of selection MUST load only the difference: Spaces added are loaded, Spaces removed are dropped, Spaces retained are kept without reloading.
- **FR-004**: Optional layers (the GemeenteDelers initiatives) MUST be loaded at most once per session and combined with the core data on demand; toggling a layer off and on again MUST NOT reload it.
- **FR-005**: The dashboard MUST distinguish three layers — *loaded data*, *derivations* (funnel, city rows, ecosystem model, usage view, …), and *display* — such that display reads derivations, derivations read loaded data, and only the loader fetches.
- **FR-005a**: The analytics service MUST do the acquisition and the augmenting/processing of platform data (hierarchy, roles, classifications, categories, metrics — everything that today turns raw platform records into the dataset the dashboards use) and return the result to the browser in a directly usable form; the browser MUST NOT re-derive what the service has already computed.
- **FR-005b**: While it works, the service MUST report its progress to the browser as named stages — at minimum *loading* (with Spaces done-of-total) and *processing / augmenting* — so the shared indicator (FR-007, FR-008) reflects service-side work, not only the transfer.
- **FR-006**: A derivation MUST be computed once for a given input and shared by every tab that uses it; it MUST be recomputed only when its inputs change.
- **FR-007**: The dashboard MUST show a single, shared progress indicator visible on every tab while anything is loading, with the same state everywhere.
- **FR-007a**: The indicator MUST be a persistent strip in the shared header, below the tab row, and MUST NOT block tab content; a tab MUST show a placeholder only when the data that tab needs is not yet available, and MUST render as soon as it is.
- **FR-008**: The indicator MUST name each item and stage in plain language (loading core Spaces, processing / augmenting, initiative layer, activity, gemeente locations, …), show items-done-of-total where a total is known, and for any item beyond the core load state which view or option requested it.
- **FR-009**: Switching tabs during a load MUST NOT restart, hide, duplicate or reset the indicator.
- **FR-010**: When the core load completes while an extra item is still loading, tabs that do not need the extra item MUST render immediately; the indicator MUST continue to show the extra item.
- **FR-011**: A failed load MUST be reported once, in the shared indicator, naming what failed and what remains usable, with a retry; views that can render from what loaded MUST do so.
- **FR-012**: The core load MUST be the *relational* data only — Spaces, their hierarchy, membership roles, organisations, classifications and the profile fields the dashboards display. Data used by a single view (activity counts, extended organisation profile, per-gemeente location resolution) MUST be fetched on demand when that view first needs it, announced in the indicator, then retained for the session.
- **FR-012a**: Activity data MUST be a separate item from the core relational data: never fetched, cached or transferred as part of the core load, and fetched once when the Initiatives table is first opened.
- **FR-013**: The service MUST fetch organisations (and any other per-entity lookups on the core path) in batches, so the number of platform requests for N entities is bounded independently of N.
- **FR-013a**: An organisation's profile MUST be fetched at most once per viewer per cache window, regardless of how many selected Spaces, subspaces or layers (including the GemeenteDelers gemeente resolution) reference it; adding a Space whose organisations are already known MUST NOT re-fetch them, and a tab switch, selection change or layer toggle MUST never cause an organisation re-fetch.
- **FR-014**: A Refresh MUST re-fetch the current selection exactly once for all tabs, including any extra items already requested, and MUST update every tab.
- **FR-015**: The dashboard counts MUST come from the same loaded data as the other tabs — computed by the service as part of processing (FR-005a) and delivered with it — never loaded as a separate dataset.
- **FR-016**: Per-viewer data scoping (Constitution IV) MUST be preserved exactly as today: acquired platform data is never shared between viewers. Platform-load reduction comes only from fetching less per load (FR-012, FR-013) and from the browser loading once per session (FR-001–FR-004).
- **FR-017**: No dashboard view may lose information it shows today; every value, chart, table column and map element MUST be present after the change (verified per tab).
- **FR-018**: The Explorer application MUST continue to work unchanged; it benefits from the service-side reductions (FR-012, FR-013) but its own loading behaviour is out of scope.

### Key Entities

- **Selection**: the set of Spaces the viewer is looking at plus the option toggles that change what is loaded (GemeenteDelers layer on/off). Identity of a load.
- **Loaded Data**: the processed dataset the service returns for a selection — Spaces and their hierarchy, membership roles, organisations, classifications and categories, on-screen profile fields, counts and metrics, already augmented by the service — plus any *extra items* fetched on demand (activity, extended profiles, gemeente locations, initiative layer). One per selection per session.
- **Derivation**: a tab-specific view the browser computes from the loaded data — funnel stages, city rows, ecosystem model, usage view, graph layout. Computed once per input, shared.
- **Load Plan / Progress**: the list of items the loader is fetching for the current selection, each with a name, a requester (core, or the view/option that asked), a state (pending / in progress / done / failed), the service-reported stage (loading / processing-augmenting) and, where known, done-of-total counts. Rendered by the shared indicator.
- **Viewer**: a signed-in user or a guest; loaded data is scoped to them (FR-016).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a selection has loaded, every one of the nine tabs opens with its content visible in under 1 second, and a full tour of all tabs issues **zero** data requests.
- **SC-002**: Opening a hub of ~22 Spaces from cold makes exactly **one** core load; the Dashboard, Graph, Initiatives, Cities, Funnel and Ecosystem tabs all populate from it (verified by counting loads in the service log).
- **SC-002a**: Reloading the page on a loaded selection produces **zero** platform requests in the service log.
- **SC-003**: During any load, a viewer can switch between any tabs and always sees one indicator whose progress only moves forward; usability testers describe what is loading without prompting in 5 of 5 sessions.
- **SC-004**: A fresh load of the default VNG hub costs the platform at least **50 % fewer requests** and at least **50 % less transferred data** than today, measured in the service log with the same selection and viewer.
- **SC-005**: Ten viewers browsing the same hub for ten minutes generate no more platform requests than ten fresh loads, each of which is at least 50 % cheaper than today (SC-004).
- **SC-006**: A visual comparison of every tab before and after the change shows no missing values, columns, chart series or map elements.
- **SC-007**: Time from opening a hub to the first tab being usable is no longer than today for a cold load, and at least 3× faster for every subsequent tab.

## Assumptions

- The feature is about the **dashboard applications** (VNG and GovTech, which share one shell). The Explorer application keeps its own loading; it gains only from the service-side fetch reductions.
- "Core data about the initiatives" means the Spaces of the selection with their hierarchy, membership roles, organisations, classifications and on-screen profile fields. The GemeenteDelers *initiative layer* is a separate, optional item loaded once when first enabled.
- Loaded data lives in the browser for the life of the page (no browser cache); the service-side cache is what makes a reload cheap, and its freshness rules (24 h per-Space cache, ~1 week for the archival GemeenteDelers and gemeente-location sets) are unchanged.
- Activity counts are needed only by the Initiatives table today; they are a separate on-demand item, apart from the core relational data (decision recorded in Clarifications). If a future view needs them, it declares them and the loader fetches them once.
- The Ecosystem tab's widened Space set (orchestrator candidates outside the hub's list) is part of the selection's core load for that dashboard, so choosing an orchestrator never triggers a reload.
- Guests are treated as one viewer identity, as today; the existing guest rate limits remain.
- The existing per-viewer service cache and short memo stay as the platform's protection; this feature adds the browser-side single load and the fetch reductions on top rather than replacing them.
- Per-viewer scoping of loaded data is retained unchanged (decision: no cross-viewer sharing).
