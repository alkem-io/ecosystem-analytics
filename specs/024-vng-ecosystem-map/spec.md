# Feature Specification: VNG Ecosystem Map

**Feature Branch**: `024-vng-ecosystem-map`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "I want to create a visual along the lines of the draw.io file that I have put into the root of the repo. The core concepts in there are a) a loosely defined "ecosystem" which for now is an innovation hub b) for each ecosystem there is an orchestrator, which is also a space on the platform e.g. for VIH that is programma groei, for opschaling tickets it is "opschaling team" etc. c) there are initiatives that are part of the ecosystem and then there are organisations that are connected into both the orchestrators and the initiatives. We will be adding this first as a single visual to the vng dashboard, for their VIH ecosystem (which has two representations vih + vih-test, we will use the latter as it more filled out. The design should be created with the idea of displaying multiple ecosystems. There is no way at the moment of designating the orchestrating space for an ecosystem so we will hard code that in this application for now. That said it should be possible to derive it to some extent from the profiles of the spaces that are a member of each ecosystem (I tend to mix + match the term space and initiative). But we hard code for now, and when you display an innovation hub give a drop down to select the orchestrator, make a good guess and then save the choice if it is changed"

## Overview

The reference sketch (`alkemio-hyper-connector-map-v2.drawio`, in this spec folder) draws the Dutch
public-sector innovation landscape as a small number of **ecosystems** — soft, cloud-shaped
regions such as the VNG Innovation Centre, Digicampus / GovTech NL, Startup in Residence, and a
health innovation hub. Inside each cloud sits one **orchestrator** (a programme or team that runs
the ecosystem, itself a Space on Alkemio — for VIH that is *Programma Groei*, for the scaling
tickets it is the *Opschaling team*), a fan of **initiatives** (the Spaces that are part of the
ecosystem — "Signalen · 55 cities", "GEM · 17 cities", the individual scaling tickets), and the
**organisations** — municipalities, ministries, provinces, universities, executive agencies —
drawn as circles carrying their logo and linked by lines into the orchestrator and into the
initiatives. The sketch's whole point is that some organisations are *hyper-connectors*: they
touch the orchestrator *and* several initiatives, or sit in more than one cloud at once. That is
the picture VNG wants to be able to show for its own ecosystem, live, from the data already on
the platform, instead of redrawing it by hand.

This feature adds that visual to the VNG Kenniscentrum Innovatie dashboard as a new **Ecosystem**
view. For the first release it draws one ecosystem: the VNG Innovation Hub (VIH), read from the
hub's more complete `vih-test` representation, which is also the dashboard's default hub. The
ecosystem's initiatives are the hub's listed Spaces; the organisations are those holding a lead
or member role on the orchestrator or on any initiative; the orchestrator is one of the hub's
Spaces. Because the platform has no way yet to *designate* which Space orchestrates a hub, the
dashboard ships with a hard-coded default per hub, makes an informed guess for any hub without
one, and lets the viewer correct it from a dropdown. A signed-in viewer's correction follows
them across devices, and the corrections viewers make collectively become the preset shown to
everyone who has not chosen for themselves — so the community's knowledge of who orchestrates
what gradually replaces the hard-coded table.

Although one ecosystem is drawn today, the visual is designed for several: an ecosystem is a
repeatable unit, organisations connected to more than one ecosystem are drawn once and bridge
the clouds, and adding a second ecosystem must be a matter of naming it, not redesigning the
view. The GovTech dashboard and the Explorer are **out of scope** for this release; they gain
nothing and lose nothing.

## Clarifications

### Session 2026-09-20

- Q: Which organisations get their own circle — all of them, or only leads/connectors with the long tail rolled into the initiative card? → A: All of them (every organisation with a role is drawn), plus filters to narrow the map to (a) organisations linked to the orchestrator Space and (b) organisations with multiple memberships.
- Q: Do organisation roles on an initiative's subspaces count? → A: Yes, roll up: a role on any subspace (any depth) of a listed Space counts as a connection to that Space, the line taking the strongest role found (lead beats member) — but a connection that exists *only* through subspace roles is drawn visibly differently from one held directly on the listed Space. Motivation: GemeenteDelers, whose participation lives in subspaces, will likely be included as an ecosystem later.
- Q: Should the orchestrator be drawn with a line to each initiative? → A: Yes — a light "part of" line from the orchestrator to every initiative, always drawn, lighter than any organisation line. Modelled as a distinct *Space–Space connection* (kind "part of"), separate from organisation–Space connections.
- Q: What does the number on an initiative card count? → A: The number of all organisations connected to that initiative (direct or via subspace), regardless of kind.
- Q: Where do the built-in orchestrator defaults live? → A: Baked into the application; changing the table is a code change and release (no per-environment configuration). Hubs not in the table fall back to the community preset / guess.
- Planning addendum (verified against the live platform): the VIH orchestrator `programmagroei` ("Kenniscentrum Innovatie") is **not** among `vih-test`'s 23 listed Spaces. The ecosystem's Space set is therefore *listed Spaces ∪ the resolved orchestrator Space*; an orchestrator outside the hub list is fetched for the Ecosystem view only and never appears on the other tabs. Orchestrator candidates = listed Spaces ∪ Spaces already in the dashboard selection ∪ built-in default ∪ community preset.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the VIH ecosystem as an orchestrator–initiative–organisation map (Priority: P1)

A VNG programme manager opens the dashboard with the VNG Innovation Hub selected and switches
to the new Ecosystem view. They see one cloud-shaped ecosystem labelled with the hub's name. At
its heart is the orchestrator Space (*Programma Groei*), visibly distinct from everything else.
Around it are the hub's initiatives, each drawn as a compact card carrying its name and how
many organisations are connected to it. Around and between those are the organisations — each
a circle showing its logo (or its initials when it has none) — with a line to every initiative
and/or orchestrator they hold a role in. Lead roles read as stronger lines than plain membership.
Organisations that are connected to the orchestrator *and* to at least one initiative are
visibly emphasised as the ecosystem's connectors. Every organisation with a role is drawn, so
the map can be busy for a large hub; two filters let the manager cut it down to the story the
sketch tells — only organisations linked to the orchestrator, and/or only organisations that
are members of more than one Space. The manager can read the whole picture at a glance and
recognise it as the same story the hand-drawn sketch tells.

**Why this priority**: This is the deliverable. Everything else in the feature refines it.

**Independent Test**: Sign in, select the VIH hub, open the Ecosystem view. Confirm the cloud,
the orchestrator, every listed initiative, and every organisation with a role on any of them
are present and connected as the platform data says, and that nothing outside the hub other
than the resolved orchestrator appears.

**Acceptance Scenarios**:

1. **Given** the VIH hub is selected, **When** the Ecosystem view opens, **Then** exactly one
   ecosystem region is drawn, labelled with the hub's display name, containing the orchestrator
   Space and every Space listed in the hub except the orchestrator, each initiative joined to
   the orchestrator by a light "part of" line.
2. **Given** an organisation holds a lead or member role on an initiative or on the
   orchestrator (directly or on one of its subspaces), **When** the view renders, **Then** that
   organisation appears once, with one line per listed Space it has a role in; a lead role is
   drawn visibly heavier than a member role, and a connection held only via subspaces is drawn
   visibly differently from a direct one.
3. **Given** an organisation is connected to the orchestrator and to at least one initiative,
   **When** the view renders, **Then** that organisation is visually emphasised relative to
   organisations connected to only one Space.
4. **Given** an organisation has no logo on the platform, **When** it is drawn, **Then** it
   shows a readable initials fallback in the same circle, and nothing else on the page breaks.
5. **Given** the view is open, **When** the viewer hovers or taps an organisation, initiative or
   the orchestrator, **Then** its name is shown and its connections are highlighted while
   unrelated elements recede, so an individual organisation's reach can be traced.
6. **Given** the view is open at desktop width, **When** the viewer resizes to a phone width,
   **Then** the visual remains legible and pannable/zoomable within its own frame and the page
   does not scroll horizontally.
7. **Given** the full map is showing, **When** the viewer enables the "linked to orchestrator"
   filter, **Then** only organisations with a role on the orchestrator Space remain (with all
   their lines), every initiative stays, and the count of hidden organisations is shown.
8. **Given** the full map is showing, **When** the viewer enables the "multiple memberships"
   filter, **Then** only organisations with roles on two or more Spaces remain; with both
   filters on, only organisations meeting both conditions remain; clearing the filters restores
   every organisation.

---

### User Story 2 - Confirm or correct which Space orchestrates the ecosystem (Priority: P2)

Above the map, a compact control names the ecosystem's orchestrator and offers a dropdown of
the hub's Spaces. For VIH the dropdown is preset to *Programma Groei* from the dashboard's
built-in defaults. For a hub with no built-in default the dashboard makes an informed guess
from the Spaces' own profiles — a Space whose name or tagline describes it as a programme,
team, centre or coordinating body, or failing that the Space whose organisations overlap most
with the rest of the hub — and shows the guess marked as such. When the viewer picks a
different Space, the map redraws immediately with that Space at the centre and its former place
taken by the previous orchestrator among the initiatives. A signed-in viewer's choice is
remembered for them on every device; a guest's for the current visit. Viewers who have not
chosen for themselves see, as the preset, the Space that other signed-in viewers have most
commonly chosen for that hub — and only if nobody has chosen yet, the built-in default or the
guess. The viewer can also revert to that preset.

**Why this priority**: Without a correct orchestrator the map tells the wrong story; without a
way to correct it the hard-coded default becomes a maintenance bottleneck. It is second only
because the P1 map already shows the right thing for VIH out of the box.

**Independent Test**: Open the Ecosystem view for VIH, confirm the orchestrator is preset to
Programma Groei, change it to another Space, confirm the map re-centres, reload the dashboard,
confirm the changed choice is still in effect, then revert to the default.

**Acceptance Scenarios**:

1. **Given** the VIH hub is selected and no viewer has yet saved a choice for it, **When** the
   Ecosystem view opens, **Then** the orchestrator control shows *Programma Groei* and the map
   is drawn around it.
2. **Given** a hub with no built-in orchestrator default, **When** the view opens, **Then** the
   control shows the dashboard's best guess, labelled as a guess, and the map is drawn around
   it; if no plausible guess exists the control asks the viewer to choose and the map draws the
   ecosystem with all Spaces as initiatives and no orchestrator.
3. **Given** the control is showing an orchestrator, **When** the viewer picks a different
   Space, **Then** the map redraws with the new orchestrator at the centre and the previous one
   listed among the initiatives, without a page reload.
4. **Given** a signed-in viewer has changed the orchestrator, **When** they return to the
   dashboard later on any device, **Then** their choice is still in effect for that hub.
5. **Given** a guest has changed the orchestrator, **When** they navigate within the same visit,
   **Then** their choice holds; a new visit starts from the preset again.
6. **Given** one or more signed-in viewers have saved a choice for a hub, **When** a viewer with
   no choice of their own opens the view, **Then** the preset is the Space most commonly chosen
   by those viewers (most recent choice breaking a tie), and the control says it was set from
   other viewers' choices.
7. **Given** the viewer has changed the orchestrator, **When** they choose "use default",
   **Then** their own remembered choice is cleared and the control returns to the preset
   (community choice, built-in default or guess, in that order).
8. **Given** the built-in default names a Space the viewer cannot read, **When** the view
   opens, **Then** the dashboard continues down the resolution order and shows a short notice
   that the configured orchestrator was not found.
9. **Given** the built-in default names a Space that is not listed in the hub but is readable
   (the VIH case), **When** the view opens, **Then** that Space is fetched, drawn as the
   orchestrator, and does not appear on any other tab.

---

### User Story 3 - Drill from the map into the existing dashboard detail (Priority: P3)

Anything on the map that has a home elsewhere in the dashboard opens there in one click: an
initiative or the orchestrator opens the Space details tab for that Space; an organisation that
is a municipality opens the City information tab for that gemeente. The viewer returns to the
Ecosystem view with the map exactly as they left it.

**Why this priority**: Reuses what the dashboard already does well and turns a picture into an
entry point, but the map is complete and useful without it.

**Independent Test**: Click an initiative and confirm the Space details tab opens for it; click
a municipality organisation and confirm the City information tab opens for it; return and
confirm the map state (orchestrator choice, zoom) is intact.

**Acceptance Scenarios**:

1. **Given** the map is showing, **When** the viewer activates an initiative or the
   orchestrator, **Then** the Space details tab opens for that Space.
2. **Given** the map is showing, **When** the viewer activates an organisation that the
   dashboard knows as a municipality, **Then** the City information tab opens for it.
3. **Given** the viewer has drilled into a detail tab, **When** they return to the Ecosystem
   view, **Then** the chosen orchestrator and the map's viewport are unchanged.

---

### Edge Cases

- **Hub with no listed Spaces**: the ecosystem cloud is drawn empty with the hub's name and a
  "no initiatives listed" message; no orchestrator control is offered.
- **Only one Space in the hub**: it is offered as the sole orchestrator candidate; if chosen the
  ecosystem has no initiatives and says so.
- **Space without any organisation roles**: it is still drawn as an initiative, just with no
  lines.
- **Organisation with a role on the orchestrator only**: it is drawn, attached to the
  orchestrator, and *not* emphasised as a connector.
- **Very large hubs** (dozens of initiatives, a hundred-plus organisations): the map must still
  draw and remain interactive with no filter applied; organisation labels may be shown only on
  hover/zoom to avoid clutter, but every node must remain reachable, and the filters are the
  intended way to reduce clutter.
- **Filter hides everything**: if no organisation meets the active filters, the orchestrator,
  the initiatives and their "part of" lines are still drawn and a "no organisations match"
  message with a clear-filters action is shown.
- **No orchestrator set** (guess found nothing): no "part of" lines are drawn; initiatives sit in
  the cloud unconnected to each other.
- **Guest viewer (feature 023)**: Spaces or organisations the guest cannot read are simply
  absent, exactly as elsewhere in the dashboard; the view never errors because a role list is
  incomplete. The guest's orchestrator choice is remembered for the current visit (FR-011).
- **Space appears both as the orchestrator and in a role list of itself**: self-links are never
  drawn.
- **Organisation with roles on several subspaces of one initiative**: one line, strongest role,
  styled "via subspace"; the hover detail may list the subspaces but the map does not multiply
  lines. If the organisation also holds a role directly on the listed Space, the line is styled
  as direct.
- **Two hubs listing the same Space or organisation** (multi-ecosystem readiness): the Space
  belongs to each ecosystem it is listed in; the organisation is drawn once and connected into
  every ecosystem it has roles in.
- **Data request fails**: the Ecosystem view shows the dashboard's standard error state with a
  retry, and the rest of the dashboard is unaffected.

## Requirements *(mandatory)*

### Functional Requirements

**Ecosystem model**

- **FR-001**: The dashboard MUST present an *ecosystem* as: an identity (name), one optional
  *orchestrator* Space, a set of *initiative* Spaces, and the set of organisations holding a
  role on any of those Spaces.
- **FR-002**: For this release an ecosystem MUST be derived from an innovation hub: the hub's
  display name is the ecosystem's name and the hub's listed Spaces are its Spaces (extended by
  FR-003). The VNG
  dashboard MUST draw the currently selected hub, which defaults to VIH via `vih-test`.
- **FR-003**: The initiatives of an ecosystem MUST be all of the hub's listed Spaces (plus any
  Space the viewer has added to the dashboard selection) except the one currently acting as
  orchestrator. An orchestrator that is not a listed Space MUST be included in the ecosystem
  for this view only — it MUST NOT appear on the other tabs as a result.
- **FR-004**: The organisations of an ecosystem MUST be every organisation holding a lead or
  member role on the orchestrator or on any initiative, and every one of them MUST be drawn
  when no filter is active. People are NOT part of this visual.
- **FR-004a**: A role an organisation holds on any subspace, at any depth, of a listed Space
  MUST count as a connection to that listed Space. One organisation–Space connection is drawn
  regardless of how many subspaces the role is held on. Each connection MUST record whether it
  is *direct* (a role on the listed Space itself) or *via subspace* (roles only on subspaces).
- **FR-005**: Each organisation–Space connection MUST carry its role strength (lead vs member)
  so it can be drawn with distinct weight; when roles are found at several levels, the
  connection carries the strongest (lead beats member).
- **FR-006**: An organisation connected to the orchestrator and to at least one initiative MUST
  be flagged as a *connector*.
- **FR-007**: The ecosystem model and the visual MUST accept a list of ecosystems, drawing each
  as its own region and drawing an organisation present in several ecosystems exactly once,
  connected into each. This release passes a single-element list; nothing in the design may
  assume exactly one.

**Orchestrator designation**

- **FR-008**: The dashboard MUST carry a built-in, per-hub default orchestrator table, keyed by
  the hub's stable identifier and maintained in the application itself (changing it is a code
  change and release; there is no per-environment configuration for it). The table MUST be
  kept apart from the visual so it can be replaced by a platform-provided designation later.
  The initial table MUST map VIH (`vih-test`) to *Programma Groei*; hubs absent from the table
  (including the acceptance environment's hub) resolve via the community preset and the guess.
- **FR-009**: The effective orchestrator MUST be resolved in this order, taking the first that
  names a Space the viewer can read (listed in the hub or not): (1) the viewer's own remembered choice; (2) the community
  preset — the Space most commonly saved by signed-in viewers for that hub, most recent
  breaking ties; (3) the built-in default; (4) the profile-based guess. For a hub where (1)–(3)
  yield nothing, the dashboard MUST make an informed guess from the Spaces' own profiles (name,
  tagline, description signalling a programme / team / centre / coordinating role), falling
  back to the Space whose organisations overlap most with the other Spaces, and MUST label the
  result as a guess. If no candidate qualifies, no orchestrator is set.
- **FR-010**: The Ecosystem view MUST offer a dropdown listing every candidate Space — the hub's
  listed Spaces, Spaces in the dashboard selection, the built-in default and the community
  preset — preset to the effective orchestrator; selecting a different Space MUST redraw the
  map immediately. To choose a Space outside these, the viewer adds it to the selection first.
- **FR-011**: A changed orchestrator MUST be remembered per hub: for a signed-in viewer it MUST
  be tied to their identity and in effect on every device they use; for a guest it MUST hold
  for the current visit only. Signed-in viewers' saved choices MUST also feed the community
  preset (FR-009 step 2) shown to viewers without a choice of their own; guest choices MUST
  NOT. The control MUST indicate which source the shown orchestrator came from (own choice,
  other viewers, built-in default, guess).
- **FR-012**: The viewer MUST be able to revert to the preset with one action, which clears
  their own remembered choice for that hub (and, for a signed-in viewer, withdraws it from the
  community preset).
- **FR-013**: When the built-in default names a Space the viewer cannot read (missing, private
  or archived), the view MUST show a brief, non-blocking notice and proceed down the
  resolution order.

**Visual**

- **FR-014**: The Ecosystem view MUST be a new tab in the VNG dashboard alongside the existing
  tabs, subject to the same shell behaviour (drawer, scrollable tab strip, error boundary).
- **FR-015**: Each ecosystem MUST be drawn as a soft, cloud-like region labelled with its name,
  enclosing its orchestrator and initiatives; organisations sit on or near the region's edge so
  that shared organisations can bridge regions.
- **FR-016**: The orchestrator MUST be rendered so that it is unmistakably the centre of its
  ecosystem (prominence, position and labelling), distinct from initiatives, and MUST be joined
  to every initiative by a "part of" line that is always drawn (never hidden by the
  organisation filters) and is visibly lighter than any organisation connection.
- **FR-017**: Initiatives MUST be drawn as compact labelled cards showing the number of
  organisations connected to the initiative (direct or via subspace, any kind, deduplicated),
  derived from the same connections the map draws so the card and the lines never disagree.
  The count reflects the full data, not the active organisation filters; a card with zero
  connected organisations shows no count.
- **FR-018**: Organisations MUST be drawn as circles carrying the organisation's logo, with an
  initials fallback when no logo is available or it fails to load.
- **FR-019**: Connections MUST be drawn as lines whose weight reflects role strength (lead
  heavier than member) and whose style distinguishes a direct connection from one held only
  via subspaces (e.g. solid vs dashed), with a legend; connectors (FR-006) MUST be visually
  emphasised.
- **FR-020**: Hover or focus on any node MUST show its name and highlight its direct
  connections while dimming the rest; the highlight MUST be dismissible.
- **FR-020a**: The view MUST offer two independent, combinable organisation filters: *linked to
  the orchestrator* (organisations with a role on the orchestrator Space) and *multiple
  memberships* (organisations with roles on two or more of the ecosystem's Spaces). Filters
  hide organisations and their lines only — the orchestrator and initiatives always remain —
  show how many organisations are hidden, and are cleared with one action.
- **FR-021**: The map MUST be pannable and zoomable within its own frame, with a "fit to view"
  action, and MUST never cause the page to scroll horizontally at any supported width.
- **FR-022**: The visual MUST be legible in the dashboard's light and dark presentation and
  MUST follow the VNG dashboard's existing visual language (typography, colour tokens, card
  styling) rather than introducing a new one.
- **FR-023**: All labels and messages in the view MUST be localised like the rest of the VNG
  dashboard (Dutch and English).

**Navigation**

- **FR-024**: Activating an initiative or the orchestrator MUST open the Space details tab for
  that Space; activating an organisation the dashboard knows as a municipality MUST open the
  City information tab for it.
- **FR-025**: Returning to the Ecosystem view MUST restore the orchestrator choice, the active
  filters and the map viewport as they were.

**Resilience & access**

- **FR-026**: A Space or organisation the viewer cannot read MUST simply be absent; a partially
  readable hub MUST still draw. A failed request MUST show the dashboard's standard error state
  with a retry, leaving other tabs unaffected.
- **FR-027**: The view MUST work for guests (feature 023) with whatever data they can read, and
  MUST work with no additional sign-in for signed-in users.

### Key Entities

- **Ecosystem**: a named grouping of Spaces and the organisations around them. For now, one per
  innovation hub; conceptually independent of hubs so other groupings can back it later.
- **Orchestrator**: the Space that runs an ecosystem. Exactly zero or one per ecosystem;
  determined by own choice → community preset → built-in default → profile-based guess.
- **Initiative**: a Space listed in the ecosystem that is not its orchestrator. (Distinct from
  the GemeenteDelers "initiatives" already shown on the Initiatives tab, which are knowledge-base
  entries, not Spaces.)
- **Organisation**: a platform organisation with a lead or member role on one or more of the
  ecosystem's Spaces; carries a logo and, where known, its municipality identity. An
  organisation is a **connector** when it touches the orchestrator and ≥1 initiative.
- **Organisation connection**: organisation ↔ listed Space, with a strength of *lead* or
  *member* and a provenance of *direct* or *via subspace*.
- **Space–Space connection**: listed Space ↔ listed Space, with a kind. The only kind in this
  release is *part of* (orchestrator → initiative); the entity exists so further Space-level
  relationships can be added without touching organisation connections.
- **Orchestrator choice**: a signed-in viewer's remembered override of an ecosystem's
  orchestrator, keyed by viewer and hub, with when it was made; the set of all viewers' choices
  for a hub yields the community preset. Guest choices exist only for the visit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A viewer who knows the VIH ecosystem can, within 30 seconds of opening the view
  and without any explanation, identify the orchestrator, name at least three initiatives, and
  point to at least one organisation connected to both.
- **SC-002**: For the VIH hub, 100% of the hub's listed Spaces and 100% of the organisations
  holding a lead or member role on them appear on the map, and no Space or organisation
  outside the hub other than the resolved orchestrator appears.
- **SC-003**: The view is fully drawn and interactive within 3 seconds of opening when the hub's
  data is already loaded, and within the dashboard's existing first-load budget otherwise.
- **SC-004**: Changing the orchestrator redraws the map in under 1 second; a signed-in viewer's
  choice is in effect on 100% of their subsequent visits to that hub from any device, and is
  reflected in the preset shown to other viewers on their next visit.
- **SC-005**: At 390px, 820px and 1440px widths the page never scrolls horizontally, no node
  label is clipped by its own shape, and no rendered text falls below 10px.
- **SC-006**: A second ecosystem can be added to the view by supplying its identity and Spaces
  alone — no change to the visual's layout, styling or interaction code.
- **SC-007**: For a hub with no built-in default, **where the intended orchestrator is among
  the candidate Spaces and carries a descriptive profile**, the profile-based guess picks it —
  verified for the known ecosystems in the reference sketch (VIH → Programma Groei; scaling
  tickets → Opschaling team). An orchestrator outside the candidate set cannot be guessed; that
  is what the built-in table and the community preset exist for.

## Assumptions

- **Ecosystem = innovation hub, for now.** The hub abstraction already drives the whole VNG
  dashboard (hub selection panel, default hub `vih-test`), so the Ecosystem view keys off the
  selected hub rather than adding a second selector. A later feature may back an ecosystem with
  a different grouping.
- **`vih-test` is the VIH ecosystem.** The user named it as the more complete representation and
  it is already the dashboard's production default hub; the `vih` hub is not treated specially.
- **Organisation membership comes from Space roles.** Lead and member organisation roles on a
  Space are the connections the platform actually records, and the dashboard already fetches
  them for the graph. Roles on subspaces are rolled up to the listed Space (FR-004a) because
  that is where participation actually lives — notably in GemeenteDelers, a likely future
  ecosystem. Admin roles held by people are ignored (no people in this visual).
- **Two line weights, not more.** The sketch uses a heavy and a light stroke; lead vs member is
  the natural mapping. Other relationship kinds are not distinguished.
- **The orchestrator need not be a listed Space.** Verified during planning: `programmagroei`
  is not in `vih-test`'s list. The view fetches the resolved orchestrator in addition to the
  selection; the dropdown is restricted to the candidate set in FR-010 rather than to the hub
  list. The profile-based guess still only considers Spaces present in the dataset.
- **Built-in defaults are a deliberate stopgap.** The table is baked in rather than configured
  because it exists only until the platform can designate an orchestrator; the community
  preset already lets viewers correct it without a release, which is why the acceptance hub
  needs no entry.
- **Guessing is best-effort and clearly labelled.** The heuristic only has to be right often
  enough to be a sensible preset; the dropdown is the authority.
- **Clicking through reuses the existing graph→details and cities→city bridges** rather than
  adding new detail views.
- **Community preset = most common choice.** "Most commonly chosen, most recent breaks ties"
  is the simplest rule that lets a handful of informed viewers correct the default for everyone
  without one stray click overriding them. Only signed-in viewers count; guests are anonymous
  and could not be de-duplicated.
- **No new platform capability is required.** The feature reads what the dashboard already
  reads; the only new stored data is the per-viewer remembered orchestrator choice.
