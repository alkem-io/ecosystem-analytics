# Feature Specification: Space-Based Access Gate

**Feature Branch**: `026-space-access-gate`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "the ecosystem analytics application already uses Alkemio identities, we also now want it to make access to the application conditional on being a member (READ privilege) on a particular (sub)space on Alkemio. There are two levels of access identified: read access, update access - tied to the relevent privilege on the identified space. The space to use for access determination on production is https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor. The applicaiton for now only will check for read, but we will shortly be having a separate "management" area which will be tied to the udpate privilege on the identified subspace."

## Overview

Today anyone with an Alkemio account can sign in to Ecosystem Analytics and use it. Signing in
proves *who* someone is; it says nothing about whether they *should* be using the application. What
each person then sees is already limited by their own Alkemio permissions, but the application itself
is open to every Alkemio user.

This feature adds an **access gate**: entry to an application becomes conditional on the signed-in
person holding the **Member role** in the community of one designated Alkemio Space or subspace — that
application's **gate Space**. Each application (Explorer, VNG dashboard, GovTech dashboard) is gated
independently, by its own Space or not at all. In production only the **VNG dashboard** is gated, by
the *Landelijk Innovatiemonitor* subspace of *Programmagroei*
(`https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor`). The GovTech dashboard and
the Explorer stay open to any signed-in Alkemio user, as today, until configured otherwise. Who is let in is therefore
managed entirely on Alkemio, through that subspace's community, by the people who already administer
it — no separate user list is kept in Ecosystem Analytics.

Two access levels are defined, each tied to a role the person holds on the gate Space:

- **Read** — the person has the **Member** role on the gate Space. This admits them to the
  application.
- **Manage** — the person additionally has the **Admin** role on the gate Space. This will admit
  them to a forthcoming, separate *management* area.

Access follows **roles, not privileges**: Alkemio grants the READ privilege on a public Space to
everyone, so a privilege check would admit every signed-in person while the gate Space is public. A
role is held only by the people actually given it, whatever the Space's visibility.

Only the Read level is enforced by this feature. The Manage level is determined and made available
now so that the management area can rely on it the moment it is built, without revisiting how access
is decided.

The gate decides *whether* someone may use the application. It does not change *what* they see once
inside: every dataset is still fetched with the person's own Alkemio permissions, exactly as today.
It protects the **use of the monitor** (the VNG dashboard), not the underlying Alkemio data. That data
stays protected by Alkemio's own permissions, in every application.

## Clarifications

### Session 2026-11-13

- Q: Which applications does the gate cover, and can each have its own gate Space? → A: Each
  application names its own gate Space, or none. In production only the VNG dashboard is gated (by
  Landelijk Innovatiemonitor); GovTech and the Explorer stay open to any signed-in Alkemio user, as
  today.
- Directive: the logic that decides where authorisation comes from must be reusable. → One shared
  access-determination capability that each consumer configures with an Access Policy and never
  re-implements (FR-018a–c).
- Q: Is the gate meant to stop refused people from seeing the VNG data at all, or only from using
  the VNG dashboard itself? → A: The dashboard only — "it is the monitor that they cannot use". The
  data stays protected by each person's own Alkemio permissions; ungated applications (e.g. the
  Explorer) are not restricted by another application's gate (FR-012a).
- Q: How soon after someone is removed from the Landelijk Innovatiemonitor subspace on Alkemio
  should they lose access to the monitor? → A: Only at sign-in. The decision is made when a session
  first uses the application and held for the rest of that session; removal takes effect at the
  person's next sign-in. "Check again" still lets a refused person in immediately (FR-006, FR-015).
- Q: Should access be decided by privileges (READ / UPDATE) or by roles? → A: By **role**, not
  privilege. The production gate subspace is public, so READ is granted to everyone and a privilege
  check would admit every signed-in person. Read = the Member role; Manage = the Member and Admin
  roles (FR-004). The gate Space no longer needs to be private.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A member signs in and uses the application (Priority: P1)

A person who is a member of the gate Space opens the application, signs in through Alkemio as they
do today, and lands in the application exactly where they would have before. Nothing about their
experience changes: the gate is invisible to someone who is allowed in.

**Why this priority**: The gate must never get in the way of the people the application is for. If
members are slowed down, bounced or confused, the feature has failed regardless of how well it keeps
others out.

**Independent Test**: Sign in with an account that has the Member role on the gate Space. Confirm the
application opens on the requested page with all its normal functionality and no additional step,
prompt or notice.

**Acceptance Scenarios**:

1. **Given** a person who has the Member role on the gate Space, **When** they complete Alkemio sign-in,
   **Then** they arrive at the page they originally requested and can use the application normally.
2. **Given** a member with a valid session, **When** they return to the application later within that
   session, **Then** they are not asked to sign in or confirm access again.
3. **Given** a member inside the application, **When** they load any data, **Then** what they see is
   the same as it would have been before this feature (still limited by their own Alkemio
   permissions).

---

### User Story 2 - A non-member is turned away clearly (Priority: P1)

A person with a valid Alkemio account who does **not** have the Member role on the gate Space signs in. Instead
of the application, they see a clear "no access" page that tells them who they are signed in as,
explains that access is granted through membership of the gate Space, names that Space, links to it
on Alkemio so they can request to join, and lets them sign out (for example to switch to another
account). No application data is shown, and no data request on their behalf succeeds.

**Why this priority**: This is the gate itself — the reason the feature exists. Being turned away
must be unambiguous and actionable, not an error screen or a silent sign-in loop.

**Independent Test**: Sign in with an Alkemio account that is not a member of the gate Space. Confirm
the "no access" page appears with the account name, the gate Space name and link, and a sign-out
action; confirm that no application page or data can be reached, including by entering application
URLs directly and by calling data endpoints directly.

**Acceptance Scenarios**:

1. **Given** a signed-in person without the Member role on the gate Space, **When** sign-in completes, **Then**
   they see the "no access" page instead of the application.
2. **Given** that person on the "no access" page, **When** they look at it, **Then** it shows the
   name of the account they are signed in as, the name of the gate Space, a link to that Space on
   Alkemio, and a sign-out action.
3. **Given** that person, **When** they navigate directly to any application URL, **Then** they are
   shown the "no access" page and no application data.
4. **Given** that person's session, **When** any application data is requested on their behalf
   (directly, not through the user interface), **Then** the request is refused with a "forbidden"
   outcome that is distinguishable from "not signed in", and no data is returned.
5. **Given** that person, **When** they sign out from the "no access" page, **Then** their session
   ends and they can sign in again with a different account.

---

### User Story 3 - Access follows membership changes on Alkemio (Priority: P2)

Membership of the gate Space changes over time: new people are admitted, others leave or are removed.
The application follows those changes without any administration in Ecosystem Analytics. A person
who has just been admitted can get in straight away by asking the application to check again. A
person who has been removed keeps the access their current session started with, and is refused from
their next sign-in onwards.

**Why this priority**: Without this, newly admitted people would be kept out until their session
happens to end. Important, but the gate already delivers its core value with the check at sign-in.

**Independent Test**: With a non-member signed in and on the "no access" page, add them to the gate
Space on Alkemio, then use "check again" — confirm they enter the application without signing in
again. With a member signed in and using the application, remove them from the gate Space — confirm
they can keep using the application in that session, then sign out and in again and confirm they now
see the "no access" page and receive no data.

**Acceptance Scenarios**:

1. **Given** a person on the "no access" page who has since been given the Member role on the gate Space,
   **When** they choose "check again", **Then** their access is re-evaluated immediately (not from
   any remembered decision) and they enter the application without signing in again.
2. **Given** a signed-in member whose Member role on the gate Space is removed during their session,
   **When** they keep using the application in that session, **Then** they keep their access until
   the session ends (sign-out or expiry).
3. **Given** a person whose Member role on the gate Space was removed, **When** they next sign in, **Then**
   they are shown the "no access" page and no data is returned to them.
4. **Given** a signed-in member, **When** they use the application throughout their session,
   **Then** no further access check is made after the first one, and none is visible to them.

---

### User Story 4 - The management access level is known to the application (Priority: P3)

For every admitted person, the application knows whether they hold the Manage level (the Admin role on the
gate Space) as well as Read. Nothing in the user interface changes yet; the knowledge exists so the
forthcoming management area can show or hide itself, and refuse its own data requests, using the same
gate and the same rules.

**Why this priority**: The management area does not exist yet, so nothing user-visible depends on
this today. Establishing it now avoids a second rework of the access model when the area is built.

**Independent Test**: Sign in as a person with the Member role only and as a person with the Member and Admin roles on the
gate Space. Confirm the application's report of the signed-in person's access shows "Read" for the
first and "Manage" for the second, and that both can use the application identically.

**Acceptance Scenarios**:

1. **Given** an admitted person with the Member role but not the Admin role on the gate Space, **When** the application
   reports their access, **Then** it reports the Read level only.
2. **Given** an admitted person with both the Member and Admin roles on the gate Space, **When** the application
   reports their access, **Then** it reports the Manage level.
3. **Given** a person with the Admin role but not the Member role on the gate Space, **When** access is determined,
   **Then** they are treated as having no access (Manage requires Read).

---

### Edge Cases

- **Alkemio unavailable during the check**: if the person's roles on the gate Space cannot be
  determined (Alkemio unreachable, timeout, unexpected response), the gate fails **closed** — the
  person is not admitted — and is shown a "could not verify your access, try again" message with a
  retry, distinct from the "no access" page so a member is not told they lack access when the real
  problem is temporary.
- **Gate Space no longer exists, was renamed or moved**: every person is refused; the condition is
  logged as an operator-level configuration error so it is noticed immediately, and users see the
  "could not verify" message rather than being told they are not members.
- **Gate Space is public**: makes no difference. Being able to read a public Space gives no role in
  it, so only people actually given the Member role are admitted.
- **Person is a member of the parent Space but not of the gate subspace**: they are refused — only
  the roles on the gate Space itself count. Roles inherited from elsewhere do not count.
- **Person holds the Lead role but not the Member role**: not admitted. Only Member admits.
- **Person signed in on one application and opens another**: sign-in is shared across the
  applications, but each application's gate is applied separately (FR-003a). A person refused by the
  VNG dashboard can still use the ungated Explorer and GovTech dashboard with the same sign-in, and
  being admitted to VNG grants nothing extra elsewhere.
- **Data endpoints shared by several applications**: the applications share one set of data
  endpoints, so each request MUST be judged by the gate of the application it is made for. A refused
  person MUST NOT be able to use a gated application's own views or features (for example the
  monitor's dashboard counts, initiatives or ecosystem map) by requesting them as if from an ungated
  application. Loading Alkemio data that their own permissions allow, through the Explorer's normal
  features, is not a bypass (FR-012a).
- **Session expires while on the "no access" page**: the person is returned to the normal sign-in
  flow, exactly as for any expired session.
- **Removal during an active session**: a person removed from the gate Space while signed in keeps
  using the application until their session ends (sign-out, idle timeout or loss of the Alkemio
  refresh grant). This delay is an accepted trade-off. Forcibly ending someone's session from
  Ecosystem Analytics is out of scope.
- **Refused person cannot read the gate Space's name**: a private gate Space is invisible to the
  people it refuses, so the name and link shown on the "no access" page MUST NOT depend on the refused
  person being able to read the Space. Its public name and link are known to the application
  independently of the viewer.
- **"Could not verify" is never remembered**: a failed check is not held for the session; the next
  request or retry checks again, so a temporary Alkemio outage never locks a member out for the rest
  of their session.
- **Previously cached data for a person who has since been refused**: no cached dataset is served to
  a refused person, regardless of what was cached for them while they had access.

## Requirements *(mandatory)*

### Functional Requirements

**Gate definition and configuration**

- **FR-001**: Each application (the Explorer, the VNG dashboard, the GovTech dashboard, and any
  future dashboard) MUST independently designate either exactly one gate Space — identified by its
  Alkemio Space and (where applicable) subspace path — or explicitly no gate. Every environment
  (production, acceptance, test, local development) MUST be able to set or change each application's
  gate through configuration alone, with no code change.
- **FR-002**: In production, the **VNG dashboard** MUST be gated by the *Landelijk Innovatiemonitor*
  subspace of *Programmagroei*. The **GovTech dashboard** and the **Explorer** MUST be configured with
  no gate and MUST behave exactly as they do today, admitting any signed-in Alkemio user. Gating either
  of them later MUST need only a configuration change.
- **FR-003**: An application without a gate Space MUST NOT be left ungated by accident. Running an
  application without a gate MUST require an explicit, deliberate per-application setting. If neither
  a gate Space nor that setting is present, the application MUST refuse to start serving. Each
  application's gate status (gated by which Space, or ungated) MUST be logged at start-up.
- **FR-003a**: Access decisions MUST be made **per application**. Sign-in stays shared across the
  applications, but a person refused by one application's gate MUST still be able to use any other
  application that admits them, and admission to one MUST NOT grant access to another.

**Access determination**

- **FR-004**: The system MUST determine a signed-in person's access level from the **roles** (not
  the privileges) Alkemio reports for **that person** in the gate Space's community, using the
  person's own Alkemio identity:
  - **None** — the person does not have the Member role on the gate Space;
  - **Read** — the person has the Member role on the gate Space;
  - **Manage** — the person has both the Member and Admin roles on the gate Space (Admin without
    Member is None).
- **FR-005**: The system MUST determine the access level when sign-in completes, before the person
  is shown any application page or data.
- **FR-006**: The system MUST determine a person's access level for an application **once per
  session**: at the session's first use of that application, which is normally straight after
  sign-in. It MUST hold that decision for the rest of the session and MUST NOT re-check during it, with
  two exceptions. "Check again" MUST re-determine the level immediately. A "could not verify" outcome
  (FR-007) MUST NOT be held. Signing out or the session ending MUST discard every held decision.
- **FR-007**: If the access level cannot be determined, the system MUST treat the person as having no
  access for that request (fail closed) and MUST distinguish this outcome ("could not verify") from a
  determined lack of access ("no access").
- **FR-008**: An access decision MUST belong to one person only; a decision made for one person MUST
  never be applied to another.

**Enforcement**

- **FR-009**: Every request for application data (graph datasets, dashboards, Spaces, hubs,
  initiatives, ecosystem and orchestrator data, queries and any equivalent added later) MUST be
  refused for a person whose access level is None, with a "forbidden" outcome that is distinct from
  "not signed in". Enforcement MUST happen on the server for every request; hiding pages in the user
  interface alone is not sufficient.
- **FR-010**: Sign-in, sign-out, and the endpoint that reports the signed-in person's identity and
  access level MUST remain available to a signed-in person whose access level is None, so the "no
  access" page can identify them and let them sign out or check again.
- **FR-011**: Cached data MUST NOT be served to a person whose current access level is None, even if
  it was cached for that same person while they had access.
- **FR-012**: The gate MUST NOT widen or change what an admitted person sees: every dataset MUST
  still be retrieved with that person's own Alkemio permissions, exactly as before this feature.
- **FR-012a**: The gate controls the **use of an application**, not the visibility of Alkemio data.
  An application's gate MUST NOT restrict what an ungated application shows. A person refused by the
  VNG dashboard (the monitor) MUST still be able to see, through the Explorer or any other ungated
  application, whatever their own Alkemio permissions allow, including Spaces that belong to the VNG
  hub.

**User experience**

- **FR-013**: A person whose access level is None MUST be shown a "no access" page that displays:
  the account they are signed in as; the name of the gate Space; an explanation that access is
  granted through membership of that Space; a link that opens the gate Space on Alkemio; a "check
  again" action; and a sign-out action.
- **FR-014**: A person whose access could not be verified MUST be shown a "could not verify your
  access" message with a retry action, and MUST NOT be told they lack access.
- **FR-015**: Removal from the gate Space MUST take effect at the person's next sign-in, when they
  MUST be shown the "no access" page. A session that started with access keeps that access until it
  ends. Whenever the application refuses someone, it MUST show the "no access" or "could not verify"
  page, never an error screen, a crash or a sign-in loop.
- **FR-016**: The "no access" and "could not verify" pages MUST follow the application's existing
  visual design and MUST be available in the same languages as the application they appear in.

**Management level (forward-looking)**

- **FR-017**: The system MUST report the signed-in person's access level (None, Read or Manage) to
  the application, so that a future management area can decide whether to show itself.
- **FR-018**: The access model MUST allow a future area or request to require the Manage level
  instead of the Read level, using the same determination, re-check and enforcement rules defined
  above. No management area, page or data endpoint is built in this feature.

**Reusability**

- **FR-018a**: The logic that decides where authorisation comes from — which Alkemio Space is
  consulted, which roles map to which Access Level, and how a decision is made, remembered,
  re-checked and refused — MUST exist **once** and be shared. Every consumer MUST obtain access
  decisions from it by supplying only an **Access Policy** (the gate Space, or "ungated", plus the
  required Access Level). Consumers include each application today, the forthcoming management area,
  and any future dashboard, area or individual request. No consumer may hold its own copy of this
  logic.
- **FR-018b**: Adding a new gated consumer (a new dashboard, the management area, or a
  differently gated part of an existing application) MUST require only declaring its Access Policy.
  It MUST NOT require changing how access is determined, re-checked, remembered or refused.
- **FR-018c**: The shared logic MUST be verifiable on its own, independently of any particular
  application: given a person's roles on a Space and an Access Policy, it MUST yield the same
  Access Level and admit/refuse outcome wherever it is used.

**Observability and privacy**

- **FR-019**: The system MUST record each refusal (None or could-not-verify) in its logs with the
  person's stable identifier, the outcome and the time — and MUST NOT log tokens, session
  identifiers or cookie values.
- **FR-020**: The system MUST log an operator-level error when the gate Space cannot be found.

### Key Entities

- **Gate Space**: The Alkemio Space or subspace whose community roles decide access to one application.
  Attributes: its Alkemio path (Space, and subspace where applicable), its display name and its
  public link on Alkemio (both shown on the "no access" page). Configured per application, per
  deployment. An application has either one gate Space or is explicitly ungated.
- **Access Policy**: What one consumer (an application, the future management area, or a single
  protected request) requires: either "ungated", or a gate Space plus a required Access Level (Read
  or Manage). The only thing a consumer supplies to the shared access logic (FR-018a).
- **Access Level**: The outcome of an application's gate for one person at one point in time — None,
  Read or Manage — derived from that person's Member and Admin roles on that application's gate
  Space. For an ungated application, every signed-in person is admitted. The forthcoming management
  area defines its own rule for ungated applications.
- **Access Decision**: A person's current Access Level for one application, together with the time it
  was determined. Belongs to exactly one session and one application. It is held for the life of that
  session, replaced by "check again", and discarded at sign-out or session end. "Could not verify" is
  never held.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of people without the Member role on the gate Space are refused by the VNG dashboard: in
  testing, no VNG dashboard page shows data and no request for VNG dashboard data returns data for
  such a person, whether made through the user interface or directly.
- **SC-001a**: Behaviour of the GovTech dashboard and the Explorer in production is unchanged: any
  signed-in Alkemio user who could use them before this feature still can.
- **SC-002**: 100% of people with the Member role on the gate Space reach the page they requested after
  sign-in, with no additional step compared with today.
- **SC-003**: Signing in as a member takes no more than 1 second longer, end to end, than it did
  before this feature.
- **SC-004**: 100% of people removed from the gate Space on Alkemio are refused at their next
  sign-in. Within a session, no access check is made after the first, so using the application adds
  no wait beyond what SC-003 allows at sign-in.
- **SC-005**: A person newly admitted to the gate Space can enter the application within 1 minute of
  being admitted, using "check again", without signing in again.
- **SC-006**: In usability testing, at least 9 out of 10 refused people can say, from the "no
  access" page alone, why they were refused and what to do to get access.
- **SC-007**: Changing which Space gates an application, or gating or ungating an application,
  requires only a configuration change and a restart — no code change and no data migration.

## Assumptions

- **Membership means the Member role**: "member of the gate Space" is the Member role in its
  community, exactly as Alkemio reports it. The gate Space's visibility (public or private) does not
  matter. On 2026-11-13 the production gate subspace was public, so a READ-privilege check would have
  admitted everyone.
- **Production gate Space (VNG dashboard only)**:
  `https://alkem.io/programmagroei/challenges/landelijkinnovatiemonitor` — Space *programmagroei*,
  subspace *landelijkinnovatiemonitor*. GovTech and the Explorer are explicitly ungated in production.
- **Existing sign-in is reused unchanged**: people still sign in through Alkemio as they do today; the
  gate runs after sign-in and adds no credential step.
- **No guest access**: anonymous "explore as a guest" access (specified in feature 023 but never
  built) is incompatible with a membership gate and is out of scope; gated applications offer
  sign-in only.
- **Administrators**: only roles on the gate Space count. A platform administrator, or an
  administrator of a parent Space, who does not have the Member role on the gate Space is not
  admitted. No allow-list or deny-list is kept in Ecosystem Analytics.
- **Manage = the Admin role**: Admin is the role that carries the UPDATE privilege on an Alkemio
  Space. The Lead role does not grant Manage.
- **Check once per session**: access is decided at sign-in and held for the session. Membership of
  the gate Space changes rarely and the gate protects use of the monitor rather than the data, so a
  removed person keeping access until their session ends is acceptable. It also keeps Alkemio traffic
  to one check per person per session.
- **Management area out of scope**: this feature determines and reports the Manage level only; the
  management area, its pages and its data are a later feature.
- **Single gate per application**: an application is gated by at most one Space; combining several
  Spaces (any-of / all-of) is out of scope. Two applications may name the same gate Space.

## Dependencies

- Alkemio reports a signed-in person's own roles (including Member and Admin) in a named Space's or
  subspace's community, using that person's identity.
- The gate Space exists in each environment that is gated, and its community is administered on
  Alkemio by the programme that owns it.
