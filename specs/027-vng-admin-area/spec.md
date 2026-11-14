# Feature Specification: VNG Dashboard Administration Area

**Feature Branch**: `027-vng-admin-area`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "I want to add an administration / settings area to the VNG dashboard. On clicking on it, the user is brought to a back end, where they can a) see what spaces (plural) where members are eligible for viewing the dashboard b) what spaces admins are eligible to update the dashboard settings c) the list of spaces that are to be included in the dashboard d) the ability to select a single initiative and if they have update rights on that space to edit the classifications of the space e) see details of the gemeente delers source of information f) be able to edit the set of spaces to be included"

**Builds on**: feature 026 (Space access gate). It already decides access from a person's roles on an Alkemio Space and reports a **Manage** level that was reserved for this area.

## Overview

The VNG dashboard ("the monitor") gets an administration area for the people who run it. A settings entry in the dashboard header leads to it, and only **Monitor Managers** see that entry. The area explains and controls what the monitor is built from:

| Part | What it covers | Who sees or does it |
|---|---|---|
| Sign-in screen | which Spaces' members may use the monitor, with links | anyone, before signing in |
| a. Viewer Spaces | which Spaces' members may view the monitor | Monitor Managers, in the area |
| b. Admin Spaces | which Spaces' admins are Monitor Managers | Monitor Managers, in the area |
| c. Included Spaces | the Spaces the monitor reports on | Monitor Managers, in the area |
| d. Classifications | pick one initiative and edit its classifications | Monitor Managers who also have update rights on that initiative's Space on Alkemio |
| e. GemeenteDelers source | where the GemeenteDelers initiatives come from and how they were read | Monitor Managers, in the area |
| f. Edit Included Spaces | add or remove Spaces the monitor reports on | Monitor Managers, in the area |

This feature changes the access model from feature 026. The single gate Space becomes two sets:

- **Viewer Spaces**: holding the Member role on **any** of them admits a person to the monitor (**Read**).
- **Admin Spaces**: holding the Admin role on **any** of them makes a person a **Monitor Manager** (**Manage**). Manage includes Read.

Both sets are deployment configuration. The area shows them but does not edit them.

The **Included Spaces** set gets a different home. It moves out of Alkemio's Innovation Hub into the monitor's own permanent settings. This is the first durable state the monitor owns itself: it is moving from a viewer of Alkemio data to an application in its own right.

## Clarifications

### Session 2026-11-14

- Q: Who may open the administration area? → A: Monitor Managers only. Who may use the monitor is shown on the sign-in screen instead, with links to the Viewer Spaces.
- Q: Where is the edited Included Spaces set stored? → A: In the monitor's own permanent settings, managed only from the area and independent of Alkemio's Innovation Hub. The monitor is moving from a viewer to an application with its own durable store.
- Q: Once managers maintain the monitor's own list of Spaces, should viewers still be able to switch the dashboard to a different Alkemio Innovation Hub? → A: No. The hub choice is removed; the monitor always shows the Included Spaces, and viewers can still narrow within them. Follow-up: viewers get no way to add Spaces of their own; the dashboard is for exploring and interacting with the ecosystem the managers define. A wider simplification of the dashboard's front end along those lines is a later feature.
- Q: If the server's storage were lost or corrupted, how much recent change to the monitor's own settings could be lost? → A: Up to one day. Settings survive restarts and redeployments and are backed up daily, restorably. Most of the real data comes from Alkemio, so only configuration is at stake. Follow-up: a starting set of settings ships with the application's build; an empty store is filled from it, instead of being taken over from the Innovation Hub.
- Q: When a manager adds a Space by pasting its link, should the monitor accept a Space the manager cannot see on Alkemio? → A: No. A manager can add only Spaces they can read on Alkemio.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See, before signing in, who can use the monitor (Priority: P1)

Someone arrives at the monitor's sign-in screen. Next to the sign-in button it says the monitor is for members of the listed Spaces. Each Space appears by name with a link to it on Alkemio. A person without access learns which Space to ask to join without contacting anyone. If they sign in and are refused, the no-access screen shows the same list.

**Why this priority**: "How do I get access?" is the most common question since feature 026 shipped. The people asking are, by definition, outside the administration area, so the answer must sit where they actually are.

**Independent Test**: Configure two Viewer Spaces. Open the sign-in screen without signing in: both are listed with working links. Sign in as a non-member: the no-access screen lists the same two.

**Acceptance Scenarios**:

1. **Given** a person who has not signed in, **When** they open the monitor's sign-in screen, **Then** it lists every Viewer Space by display name with a link to it on Alkemio, and explains that members of any of these Spaces can use the monitor.
2. **Given** a signed-in person refused by the gate, **When** the no-access screen is shown, **Then** it lists the same Viewer Spaces in the same way, alongside the existing "check again" and "sign out" actions.
3. **Given** a Viewer Space whose name cannot be read without signing in, **When** the sign-in screen loads, **Then** it uses the configured display name for that Space and still gives the link.
4. **Given** the list of Viewer Spaces cannot be loaded at all, **When** the sign-in screen loads, **Then** sign-in still works and the screen shows a generic "access is limited to members of designated Spaces" line instead of an empty list.

---

### User Story 2 - Enter the area and see who may view and who may manage (Priority: P1)

A Monitor Manager chooses the settings entry in the dashboard header and lands in the administration area. The first section lists the Viewer Spaces and the Admin Spaces, each with a link to it on Alkemio and the role that grants access through it. It also confirms the manager's own standing.

**Why this priority**: This is the entry point that every other part of the area hangs on. It also shows the access model that the area's own access depends on.

**Independent Test**: Configure two Viewer Spaces and one Admin Space. A person who is an admin of the Admin Space sees the settings entry, opens the area, and sees both lists. A person who is only a member of a Viewer Space sees no settings entry, and opening the area's address directly gives "no access".

**Acceptance Scenarios**:

1. **Given** a Monitor Manager on the dashboard, **When** they choose the settings entry in the header, **Then** the area opens, and the dashboard keeps its selection when they return.
2. **Given** the area is open, **When** it loads, **Then** it lists every Viewer Space ("Members of these Spaces can view the monitor") and every Admin Space ("Admins of these Spaces can manage the monitor"), each with display name and link.
3. **Given** a configured Space that Alkemio cannot find, **When** the area loads, **Then** that entry shows as "not found" with its configured identifier, and the rest of the list still renders.
4. **Given** a person admitted to the monitor who is not a Monitor Manager, **When** they view the dashboard, **Then** no settings entry is shown. **When** they open the area's address directly, **Then** they get a "no access" message, and nothing from the area is shown or loaded.

---

### User Story 3 - See the Spaces the monitor reports on (Priority: P1)

The manager sees the Included Spaces, the Spaces whose initiatives make up the monitor. Each Included Space is one of the monitor's initiatives. Each entry shows the Space's name, a link to it on Alkemio, and how many of the monitor's designated classifications it has set. The section also shows when the set was last changed and by whom.

**Why this priority**: It answers "why is (or isn't) this initiative in the monitor?" without needing a developer, and it is the base that story 4 edits.

**Independent Test**: With a known Included Spaces set, open the area. The list matches the set exactly, in order, with correct names, links and classification status, and the dashboard shows the same Spaces.

**Acceptance Scenarios**:

1. **Given** the area is open, **When** the Included Spaces section loads, **Then** it lists exactly the Spaces the dashboard reports on, each with display name, link and classification status, plus who last changed the set and when.
2. **Given** an Included Space the manager has no right to read, **When** the list loads, **Then** that Space is still listed, marked "you cannot see this Space's details", and shows none of its content.
3. **Given** the monitor's settings have never been edited, **When** the section loads for the first time, **Then** the set is the starting set shipped with the application, which matches what the dashboard showed before this feature, and the section shows that it came from the starting set.

---

### User Story 4 - Change which Spaces the monitor reports on (Priority: P2)

A Monitor Manager adds a Space to the Included Spaces, by searching Alkemio by name or pasting the Space's link. They can also remove one. After they save, the dashboard reports on the new set for every viewer. The change is kept permanently in the monitor's own settings, and its history can be viewed.

**Why this priority**: Today, changing the set needs someone with rights on the Alkemio Innovation Hub, or a configuration change. This lets the people who run the monitor curate it themselves.

**Independent Test**: As a Monitor Manager, add one Space and remove another, then save. Open the dashboard as a different viewer: the added Space's initiatives appear and the removed Space's do not. Restart and redeploy the application: the change is still there. As a non-manager, a direct attempt to save is refused.

**Acceptance Scenarios**:

1. **Given** a Monitor Manager in the Included Spaces section, **When** they search by name or paste a Space's Alkemio link, **Then** matching Spaces are offered and can be added. A Space already in the set cannot be added twice, and a pasted link to a Space the manager cannot read on Alkemio is refused with "You can only add Spaces you can see on Alkemio".
2. **Given** pending additions or removals, **When** the manager reviews them, **Then** the section shows what will be added and what removed before saving, and the changes can be discarded.
3. **Given** the manager saves, **When** the save succeeds, **Then** the new set applies to every viewer of the monitor from their next data load. The change is recorded (who, when, added, removed) and appears in the set's history.
4. **Given** someone else changed the set after the manager opened the section, **When** the manager saves, **Then** they are warned, shown the current set, and asked to confirm. Nothing is overwritten silently.
5. **Given** a person who is not a Monitor Manager, or who stopped being one since signing in, **When** they try to save a change by any route, **Then** the change is refused and nothing is altered.
6. **Given** the manager tries to save an empty set, **When** they save, **Then** they must confirm explicitly, because the monitor would then show no initiatives.
7. **Given** a saved set, **When** the application restarts, is redeployed, or has its cached data cleared, **Then** the set and its history are unchanged.

---

### User Story 5 - Edit one initiative's classifications (Priority: P2)

A Monitor Manager picks a single initiative from the monitor, by searching by name or opening it from the Included Spaces list. The area shows the classifications that drive the monitor's charts: NDS priority, VNG 2030 theme, phase and TRL. Each shows its current value(s) and the values its vocabulary allows. If the manager's own Alkemio rights allow them to update that Space, they can change the values and save. Otherwise the values are read-only, with a short explanation.

**Why this priority**: Classifications drive the NDS, VNG 2030 and phase charts. Today, correcting a misclassified initiative means leaving the monitor to find the setting on Alkemio. This brings the fix to where the error is noticed.

**Independent Test**: As a manager with update rights on a given initiative's Space, change its phase and save. Reload the dashboard: the initiative appears in the new phase, and the same value shows on the Space on Alkemio. Repeat with an initiative where the manager has no update rights: no edit control is offered.

**Acceptance Scenarios**:

1. **Given** the area is open, **When** the manager searches for an initiative by part of its name, **Then** matching initiatives from the monitor are offered, and choosing one opens its classification view.
2. **Given** an initiative whose Space the manager may update, **When** its classification view opens, **Then** each designated classification is editable. It offers only the values its vocabulary defines, as single or multiple choice exactly as the vocabulary specifies.
3. **Given** the manager changes values and saves, **When** the save succeeds, **Then** the new values are stored on the Space on Alkemio, a confirmation is shown, and the manager's dashboard reflects the change on their next return to it.
4. **Given** an initiative whose Space the manager may not update, **When** its view opens, **Then** the values are read-only, with "You need update rights on this Space in Alkemio to change its classifications" and a link to the Space.
5. **Given** Alkemio refuses the save (rights withdrawn, value no longer exists, or Alkemio unreachable), **When** the manager saves, **Then** nothing is reported as saved, their edits stay on screen, and a message says what went wrong.
6. **Given** a GemeenteDelers initiative that comes from a post rather than a subspace, **When** the manager picks it, **Then** the view explains that it has no classifications to edit, and why.

---

### User Story 6 - See the GemeenteDelers source in detail (Priority: P3)

The manager sees where the monitor's GemeenteDelers initiatives come from:

- the source Space, with a link;
- how many initiatives were read, and how many come via subspaces versus the temporary posts bridge;
- which posts were set aside because a subspace replaces them;
- when the source was last refreshed, and when it will next be refreshed.

**Why this priority**: The GemeenteDelers migration from posts to subspaces is in progress, and today its state is visible only in the browser's developer console. This lets the programme follow the migration without a developer. It is information only and independent of the rest.

**Independent Test**: Load the area against a GemeenteDelers source with a known mix of subspaces and posts. The counts and per-initiative sources match the dashboard and the existing developer-console summary.

**Acceptance Scenarios**:

1. **Given** the area is open, **When** the GemeenteDelers section loads, **Then** it shows the source Space's name and link, the total number of initiatives, and the split between subspaces and posts.
2. **Given** some posts are replaced by subspaces, **When** the manager expands the details, **Then** each initiative is listed with its source, and each replaced post is listed with the subspace that replaces it.
3. **Given** no initiative comes from posts any more, **When** the section loads, **Then** it states that the migration to subspaces is complete for the monitor.
4. **Given** the source cannot be read or loaded, **When** the section loads, **Then** it says so instead of showing zero counts.

---

### Edge Cases

- **A manager loses the Admin role during a session**: viewing stays as decided at sign-in (feature 026 behaviour). But every **change** (stories 4 and 5) re-checks the Manage level when saving, and is refused if the person no longer holds it.
- **Viewer and Admin Spaces overlap**: the same Space may be in both lists, as the production default is. Its members can view and its admins can manage.
- **An admin of an Admin Space who is a member of no Viewer Space**: admitted as a viewer as well, because Manage includes Read.
- **A configured Viewer or Admin Space no longer exists**: it is listed as "not found" in the area. On the sign-in screen it appears under its configured name. It admits nobody, and the other Spaces in the set still work.
- **An Included Space is archived, deleted or renamed on Alkemio**: it is listed under its current name, or as "not found" with its identifier, and a manager can remove it.
- **The server's storage is lost or corrupted**: the monitor's settings are restored from the latest daily backup. Changes made since then are lost and must be made again. If the monitor starts with an empty store, it fills it from the starting set as on first use and logs a warning, so an operator can see that a restore may be needed.
- **First use after this feature ships**: the store is filled from the starting set shipped with the application. The Innovation Hub is not read. A later change to the starting set does not overwrite a store that already holds settings.
- **The starting set names a Space that no longer exists**: it is still stored, and shown in the area as "not found", so a manager can remove it.
- **A classification vocabulary changes on Alkemio while the view is open**, for example a value is removed: saving a removed value is refused with a message, and the view reloads the vocabulary.
- **A designated classification is not present on a Space**: it is shown as "not set". It can be set only when the manager may update the Space and Alkemio permits it.
- **A large Included Spaces set**: the list stays usable, with a search or filter, up to at least 200 Spaces.
- **Phone and tablet widths**: the area and the sign-in screen's Space list follow the dashboards' single responsive breakpoint. The page never scrolls sideways.
- **Alkemio unreachable while the area loads**: each section shows its own "could not load, try again" state, and one failing section does not blank the others. The Included Spaces set itself still loads, because the monitor holds it; only its names and counts from Alkemio are missing.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-in and no-access screens**

- **FR-001**: The monitor's sign-in screen MUST list every Viewer Space with its display name and a link to it on Alkemio. It MUST explain that members of any listed Space can use the monitor. This MUST work before the person signs in, using only a Space's name and link.
- **FR-002**: Where a Viewer Space's name cannot be read without signing in, the sign-in screen MUST use the configured display name and still give the link. Where the list cannot be loaded at all, sign-in MUST remain available and a generic explanation MUST replace the list.
- **FR-003**: The no-access screen from feature 026 MUST list all Viewer Spaces the same way, instead of a single gate Space.

**Entry and access**

- **FR-004**: The dashboard header MUST show a settings entry to Monitor Managers only. Choosing it MUST open the administration area, and returning MUST keep the dashboard's current selection.
- **FR-005**: The administration area and everything it loads or changes MUST be limited to Monitor Managers. Anyone else reaching it, by its address or by any other route, MUST get "no access" and receive none of its content.
- **FR-006**: A person MUST be admitted to the monitor (**Read**) when they hold the Member role on **any** Viewer Space.
- **FR-007**: A person MUST be a **Monitor Manager** (**Manage**) when they hold the Admin role on **any** Admin Space. Manage MUST include Read.
- **FR-008**: Viewer Spaces and Admin Spaces MUST each be a non-empty set configured per deployment. A missing or invalid configuration MUST stop start-up, as in feature 026. In production both sets MUST default to the Programmagroei Space, so access is unchanged when this feature ships.
- **FR-009**: Every change made through the area (stories 4 and 5) MUST re-verify, at the moment of saving, that the person is a Monitor Manager. It must not rely on a decision taken earlier in the session.

**a, b. Viewer and Admin Spaces**

- **FR-010**: The area MUST list every Viewer Space and every Admin Space with display name, link, and the role that grants access through it. A Space that cannot be found MUST be shown as "not found" with its configured identifier.
- **FR-011**: The area MUST confirm the signed-in manager's own standing.

**c, f. Included Spaces**

- **FR-012**: The Included Spaces set MUST be kept in the monitor's own permanent settings. It MUST be independent of Alkemio's Innovation Hub, and it MUST survive restarts, redeployments and any clearing of cached data. The settings, including their change history, MUST be backed up at least daily, and a backup MUST be restorable, so that losing the server's storage loses at most one day of changes.
- **FR-013**: The application MUST ship with a starting set of monitor settings as part of its build, including the Included Spaces. When the monitor starts with an empty store, it MUST fill the store from that starting set and record this in the history. It MUST NOT overwrite a store that already holds settings. From then on, the stored settings alone are used. An invalid starting set MUST stop start-up.
- **FR-014**: The dashboard MUST always report on the Included Spaces set. The choice of an Alkemio Innovation Hub MUST be removed from the dashboard. Viewers MAY still narrow the view to some of the Included Spaces. The dashboard MUST offer viewers no way to add a Space outside the set, whether by hub, search or link.
- **FR-015**: The area MUST list the Included Spaces in order, each with display name, link and classification status. Spaces the manager cannot read MUST be marked as such without revealing their content.
- **FR-016**: Managers MUST be able to add and remove Included Spaces, finding a Space by name search or by its pasted Alkemio link. Only top-level Spaces can be added, because the monitor's initiatives are top-level Spaces. A manager MUST be able to add only Spaces they can read on Alkemio; a pasted link to a Space they cannot read MUST be refused with the reason. Duplicates MUST be prevented.
- **FR-017**: Before saving, the area MUST show pending additions and removals and allow them to be discarded. Saving an empty set MUST need explicit confirmation.
- **FR-018**: If the set changed after the manager loaded it, saving MUST warn and show the current set before anything is overwritten.
- **FR-019**: A saved change MUST apply to every viewer from their next data load.
- **FR-020**: Every saved change MUST be kept as part of a permanent history (who, when, Spaces added, Spaces removed). The area MUST show the last change and let a manager view the history.

**d. Classifications**

- **FR-021**: The area MUST let a manager pick one initiative from the monitor by name search or from the Included Spaces list. Initiatives are the Included Spaces themselves and the GemeenteDelers initiative subspaces.
- **FR-022**: For the chosen initiative, the area MUST show each classification the monitor designates (NDS priority, VNG 2030 theme, phase, TRL) with its current value(s) and the values its vocabulary allows. Single or multiple choice MUST follow the vocabulary.
- **FR-023**: Editing MUST be offered only when Alkemio confirms the manager may update that Space, in addition to their being a Monitor Manager. Otherwise the values MUST be read-only, with the reason and a link to the Space.
- **FR-024**: Saved values MUST be written to the Space on Alkemio. The monitor MUST NOT keep its own copy of an initiative's classifications. A failed save MUST leave the edits on screen and report the reason, and nothing may be shown as saved unless Alkemio accepted it.
- **FR-025**: After a successful save, the editor's own dashboard MUST reflect the new values on their next return to it. Other viewers MUST see them no later than the monitor's normal data-freshness period.
- **FR-026**: An initiative that comes from a GemeenteDelers post MUST be shown as having no editable classifications, with the reason.
- **FR-027**: Every classification change MUST be recorded: who, which initiative, which classification, from which value(s) to which, and when.

**e. GemeenteDelers source**

- **FR-028**: The area MUST show the GemeenteDelers source Space (name and link), the total number of initiatives, and how many come via subspaces and how many via posts.
- **FR-029**: On request, the area MUST list each initiative with its source, and each set-aside post with the subspace that replaces it.
- **FR-030**: The area MUST show when the source was last read and when it will next be refreshed. It MUST state when no initiative comes from posts any more.
- **FR-031**: When the source cannot be read or loaded, the area MUST say so rather than show zero counts.

**General**

- **FR-032**: All text in the area and on the sign-in and no-access Space lists MUST be available in Dutch and English, following the dashboard's language setting.
- **FR-033**: Each section of the area MUST load and fail independently, with its own retry.
- **FR-034**: The area MUST follow the dashboards' responsive rules: one breakpoint, stacked sections and card lists below it, and no sideways page scrolling at any width.
- **FR-035**: Change records (FR-020, FR-027) MUST NOT contain tokens or other secrets.
- **FR-036**: Only the VNG dashboard gains this area in this feature. The GovTech dashboard and the Explorer are unchanged.

### Out of Scope

- Editing the Viewer Spaces or Admin Spaces from the area. They stay deployment configuration (shown, not edited), so the area can never lock everyone out of itself.
- Granting or removing people's roles on Alkemio. The area links to the Space, and role management stays on Alkemio.
- Choosing an Alkemio Innovation Hub in the dashboard (removed by FR-014).
- The wider simplification of the dashboard's front end around exploring and interacting with the ecosystem. That is a later feature; this one removes only the ways viewers change what the monitor covers.
- Reading the Included Spaces from, or writing them to, Alkemio's Innovation Hub. The monitor no longer uses the hub for its scope.
- Restoring an earlier Included Spaces set in one action. The history is viewable, and a manager can re-apply a change by hand.
- Changing **which** classification drives which chart. That stays configuration.
- Editing other Space content (description, tags, members) or GemeenteDelers posts.
- Forcing a refresh of the GemeenteDelers source or other cached data from the area.
- Administration areas for the GovTech dashboard or the Explorer.
- The **operational guarantees** behind FR-012 (decision 2026-11-14): confirming the production
  storage is persistent, placing backups on storage that survives losing it, and rehearsing a
  restore. They are handled separately. This feature ships the mechanism (durable settings, a
  daily settings-only backup, a restore command); FR-012's "at most one day lost" holds only once
  those operational steps are in place.

### Key Entities

- **Viewer Space**: an Alkemio Space whose members may view the monitor. Attributes: identifier, display name (from Alkemio, with a configured fallback), link, found or not found.
- **Admin Space**: an Alkemio Space whose admins are Monitor Managers. It has the same attributes as a Viewer Space.
- **Monitor Manager**: a person holding the Admin role on at least one Admin Space. Derived, never stored.
- **Monitor Settings**: the monitor's own durable state. It is separate from cached data and outlives restarts and redeployments. In this feature it holds the Included Spaces set and its history, and it is the place future monitor-owned settings will live.
- **Included Space**: a Space the monitor reports on. Attributes: identifier, position in the set, and, as read from Alkemio for display, display name, link, classification status and whether this person can read it.
- **Included Spaces change**: who changed the set, when, which Spaces were added and which removed. It also records each filling of the store from the starting set, marked as such.
- **Initiative**: a Space shown in the monitor as an initiative, either an Included Space (a top-level Space) or a GemeenteDelers initiative subspace, carrying classifications. A GemeenteDelers initiative from a post has no classifications.
- **Designated classification**: one of the vocabularies the monitor charts (NDS priority, VNG 2030 theme, phase, TRL). Attributes: name, allowed values, single or multiple choice, and the initiative's current value(s).
- **Classification change**: who changed which initiative's classification, from what to what, and when.
- **GemeenteDelers source summary**: the source Space, totals by source, each initiative's source, set-aside posts with their replacing subspace, when the source was last read and when it will next be refreshed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person without access can find on the sign-in or no-access screen which Space to join, in under 30 seconds, without help.
- **SC-002**: A Monitor Manager can add or remove an Included Space and see the change in the dashboard in under 2 minutes, with no developer, deployment or Alkemio hub rights involved.
- **SC-003**: A Monitor Manager with update rights can correct an initiative's classification from the monitor in under 1 minute, and the corrected value appears on the same Space on Alkemio.
- **SC-004**: In testing, 100% of attempts by non-managers to reach the area or change anything in it are refused, as are classification edits by managers without update rights on that Space. This includes attempts that bypass the screen.
- **SC-005**: The Included Spaces set and its history are unchanged after a restart, a redeployment and a full cache clear, in every test run. A restore from backup brings back the set as it was at the time of the backup.
- **SC-006**: The GemeenteDelers counts shown in the area match the dashboard's own GemeenteDelers figures exactly, for every load in testing.
- **SC-007**: With Alkemio partly unreachable, every section that can load still loads, and none shows invented zeros or empty lists as if real.
- **SC-008**: On the day this feature ships, the monitor is unchanged for its users: the same people can view it, and the dashboard shows the same Spaces as the day before.

## Assumptions

- **Read and Manage come from roles, as in feature 026**: the Member role gives Read and the Admin role gives Manage. Each now comes from a **set** of Spaces instead of a single gate. Manage no longer needs the Member role on the same Space, because the Admin Spaces are their own list.
- **Viewer and Admin Spaces are shown, not edited**: the user asked to "see" them (a, b) and to "edit" only the Included Spaces (f).
- **The sign-in screen shows Viewer Spaces only.** Admin Spaces matter only to managers, so they appear only in the area.
- **The production default** for both sets is the Programmagroei Space (the current gate), so nobody gains or loses access.
- **Only configuration is at stake.** The monitor's real data comes from Alkemio, so a day's loss of settings is acceptable; this does not justify a separately operated database.
- **The monitor's own settings are a durable store, distinct from today's cache.** Cached data can be cleared at any time without loss. The settings cannot, and they are expected to grow as the monitor takes on more of its own configuration.
- **The starting set** shipped in the first release lists the Spaces of today's production hub (`vih-test`), so the dashboard shows the same Spaces on day one.
- **The Included Spaces are the monitor's whole scope.** The Innovation Hub choice disappears from the dashboard; narrowing within the set stays. Changing what the monitor covers is a management action, done only in the area.
- **"Initiative" means what the monitor already treats as one**: the Included Spaces themselves (top-level Spaces; their subspaces are not initiatives) and GemeenteDelers initiative subspaces.
- **Classification edits go straight to Alkemio**, and Alkemio alone decides whether the manager may make the edit.
- **Data freshness**: other viewers see edits within the monitor's existing data-freshness period. Open dashboards are not updated live.
- **Dependency**: feature 026 (access gate, Manage level, "check again", per-session decision, the sign-in-time gate probe) is in place. This feature extends its gate to sets of Spaces.
