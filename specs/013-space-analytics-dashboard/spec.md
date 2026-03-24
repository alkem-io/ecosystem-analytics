# Feature Specification: Space Analytics Dashboard

**Feature Branch**: `013-space-analytics-dashboard`  
**Created**: 2026-03-17  
**Status**: Draft  
**Input**: User description: "Add a new single-space analytics dashboard mode with multiple D3 visualizations for analyzing activity, contributions, and engagement within a specific space. Driven by client feedback requesting up-to-date stats (questions, answers, comments, contributors) and product direction to offer an 'analytics inside a space' mode."

## Context & Motivation

The existing Ecosystem Analytics tool focuses on **cross-space network visualization** — users select multiple spaces and explore the relationships between people, organizations, and spaces via force-directed graphs.

Client feedback (TIP) shows demand for a different lens: **inward-looking analytics for a single space**. Their immediate interest is in up-to-date stats — total questions, answers, comments, and active contributors — but the opportunity is broader. A dashboard approach lets us surface many dimensions of a space's health and activity through purpose-built visualizations, rather than trying to answer every question with a single graph.

### Questions a Space Dashboard Can Answer

The TIP email asks about raw counts, but a well-designed dashboard can answer a much richer set of questions about a space. The Alkemio content model is: **Space → Collaboration (phases/tabs) → Callouts → Contributions (posts, memos, links, whiteboards) → Comments**. A callout is a container (e.g. a challenge, a question prompt); contributions are the content within it; comments are threaded discussion on contributions.

**Content & Volume** — "How much is happening?"
- Total callouts created
- Total contributions to those callouts (posts + memos + links + whiteboards)
- Total comments across all contributions
- Total whiteboards and whiteboard modifications
- Average contributions per callout
- Average comments per contribution

**Engagement Quality** — "How healthy is the interaction?"
- Unanswered callouts — count and % of callouts with zero contributions (are prompts being ignored?)
- Response rate — % of callouts that received at least one contribution
- ~~Average time from callout publication to first contribution (how alive is this space?)~~ — *out of scope for v1; requires per-contribution timestamp correlation not available in current query*
- Contributor concentration — are a few people doing 90% of the work, or is it spread? (top-5 vs. rest)
- ~~Comment depth — average thread length (substantive discussions or one-and-done?)~~ — *out of scope for v1; requires fetching full message threads per post*

**Community & People** — "Who is driving this?"
- Total members vs. total unique contributors who posted at least once (engagement ratio)
- Top contributors ranked by contribution count
- Most cross-active contributors — people contributing across multiple subspaces
- Organization leaderboard — which orgs are most represented and active?
- Activity split by role (admin/lead/member) — are leads leading or are members driving?
- New contributors over time — how many people made their first contribution each month?
- Return rate — of people who contributed last month, how many contributed again this month?

**Structure & Focus** — "Where should I pay attention?"
- Activity by subspace — which subspaces are hot vs. dormant?
- Activity by phase/tab — Knowledge Base vs. Innovation Flow vs. others
- Top callouts by engagement — which callouts generated the most contributions + comments?
- Dormant callouts — callouts with no activity in the last 30/60/90 days

**Trends** — "Where is this going?"
- Activity volume over time by week/month (growing, stable, declining)
- Activity bursts around specific events or periods
- Content type mix trends — is the balance shifting?

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View Space Headline Metrics (Priority: P1)

A portfolio owner navigates to the Space Analytics Dashboard, selects their space, and immediately sees the key numbers: total callouts, total contributions, total comments, unique contributors, engagement ratio, unanswered callout %, and average contributions per callout. This directly answers the TIP client's request and gives an instant health snapshot.

**Why this priority**: This is the exact ask from the client — simple, high-value, and the foundation everything else builds on.

**Independent Test**: Can be fully tested by selecting a space and verifying that headline metric cards display correct, up-to-date counts matching the underlying data.

**Acceptance Scenarios**:

1. **Given** the user is authenticated and on the Space Analytics Dashboard, **When** they select a space, **Then** they see headline metric cards showing: total callouts, total contributions (posts + memos + links + whiteboards), total comments, total unique contributors, engagement ratio (contributors/members), unanswered callout %, and average contributions per callout (defaulting to all-time, all phases).
2. **Given** a space has subspaces, **When** the user views headline metrics, **Then** the counts aggregate across the space and all its subspaces.
3. **Given** a space has no activity, **When** the user views headline metrics, **Then** all counts display as zero with a friendly empty state message.
4. **Given** the user has selected a time range via the global selector, **When** they view headline metrics, **Then** the counts reflect only contributions within the selected time range.

---

### User Story 2 — Explore Activity Over Time (Priority: P2)

A space manager wants to understand whether their space is growing or declining. They view a timeline visualization showing contributions plotted over time, with the ability to see trends and spot activity spikes.

**Why this priority**: Trends over time are the natural follow-up to "how much" — clients want to know the trajectory, not just the snapshot.

**Independent Test**: Can be fully tested by selecting a space and verifying a time-series chart renders with contribution data points plotted across a date axis, and that it visually indicates overall trend direction.

**Acceptance Scenarios**:

1. **Given** a space with contributions spanning several months, **When** the user views the activity timeline, **Then** they see contributions plotted over time with a visible trend.
2. **Given** the user is viewing the activity timeline, **When** they hover over a data point or time period, **Then** they see a tooltip with the specific count and date range.
3. **Given** a space with contributions of multiple types, **When** the user views the timeline, **Then** they can distinguish between contribution types (e.g. by color or stacking).

---

### User Story 3 — See Top Contributors and Community Breakdown (Priority: P2)

A portfolio owner wants to understand who is driving activity in their space. They view a contributor ranking, plus breakdowns of engagement ratio, organization representation, and activity by role.

**Why this priority**: Understanding the people behind the numbers is essential for community management and directly complements the headline metrics.

**Independent Test**: Can be tested by selecting a space and verifying a leaderboard/bar chart of top contributors renders with correct names and counts, and that engagement distribution and org representation visualizations are accurate.

**Acceptance Scenarios**:

1. **Given** a space with multiple contributors, **When** the user views the contributors panel, **Then** they see a ranked list or bar chart showing the most active contributors by contribution count.
2. **Given** a space with many members but few active contributors, **When** the user views the engagement breakdown, **Then** they see a visualization distinguishing active contributors from inactive members, including the engagement ratio.
3. **Given** a contributor has activity across multiple subspaces, **When** the user views that contributor's entry, **Then** the count reflects their total space-wide activity.
4. **Given** a space with members from multiple organizations, **When** the user views the community panel, **Then** they see organization representation and activity levels.
5. **Given** a space with members in different roles, **When** the user views the community panel, **Then** they see the activity split by role (admin/lead/member).

---

### User Story 4 — Analyze Subspace Activity Distribution (Priority: P3)

A space manager with a multi-level space wants to see how activity is distributed across subspaces. They view a hierarchical visualization (treemap or sunburst) showing relative subspace sizes by activity volume.

**Why this priority**: Valuable for larger spaces with deep hierarchies but depends on the foundational data from P1/P2. Not needed for flat or small spaces.

**Independent Test**: Can be tested by selecting a space with L1/L2 subspaces and verifying a hierarchical chart renders with subspaces sized by contribution volume.

**Acceptance Scenarios**:

1. **Given** a space with L1 and L2 subspaces, **When** the user views the subspace distribution, **Then** they see a hierarchical visualization with areas proportional to activity.
2. **Given** a subspace has no activity, **When** it appears in the visualization, **Then** it is visually minimal but still visible with a label.
3. **Given** a space has no subspaces, **When** the user views the dashboard, **Then** the subspace distribution panel shows a message indicating the space has no subspaces and this visualization is not applicable.

---

### User Story 5 — Filter Dashboard by Phase/Tab (Priority: P2)

A space manager wants to see stats for a specific section of their space — for example, only the Knowledge Base tab. They select a phase from a filter and all dashboard panels update to reflect only that phase's data.

**Why this priority**: Directly requested by client (TIP). Many spaces concentrate activity in one phase; aggregate stats across all phases dilute the signal. Essential for actionable insights.

**Independent Test**: Can be tested by selecting a space, then selecting a specific phase from the filter, and verifying all dashboard panels (metrics, timeline, contributors) update to reflect only that phase's data.

**Acceptance Scenarios**:

1. **Given** a space with multiple phases/tabs, **When** the user selects a specific phase from the filter, **Then** all dashboard panels update to show metrics only for callouts/posts/responses within that phase.
2. **Given** the user has a phase filter active, **When** they switch to a different phase, **Then** all panels re-render with the new phase's data.
3. **Given** the user has a phase filter active, **When** they select "All phases" (default), **Then** the dashboard returns to showing aggregate data across the entire space.

---

### User Story 6 — View Content Type Mix & Whiteboard Activity (Priority: P3)

A portfolio owner wants to understand the composition of activity — are people mostly posting, creating whiteboards, sharing links, or writing memos? A proportional visualization shows the content type mix, plus dedicated whiteboard metrics.

**Why this priority**: Provides nuanced understanding of what kind of engagement the space fosters, and specifically addresses whiteboard activity as a distinct collaboration indicator.

**Independent Test**: Can be tested by selecting a space and verifying a chart accurately reflects the proportion of posts, memos, links, and whiteboards, plus whiteboard-specific metrics.

**Acceptance Scenarios**:

1. **Given** a space with mixed contribution types, **When** the user views the type breakdown, **Then** they see a proportional visualization showing the volume of posts, memos, links, and whiteboards.
2. **Given** a space with whiteboards, **When** the user views whiteboard metrics, **Then** they see total whiteboards, total whiteboard modifications, and average modifications per whiteboard.
3. **Given** a space with varying engagement, **When** the user views engagement quality, **Then** they see unanswered callout %, average contributions per callout, and average comments per contribution.

---

### User Story 7 — Navigate Between Network View and Space Dashboard (Priority: P1)

A user who is exploring the existing multi-space network graph wants to switch to the single-space dashboard view, and vice versa. The Space Dashboard is a separate page accessible from the top-level navigation menu, alongside the existing Explorer.

**Why this priority**: Without clear navigation, the new mode is undiscoverable. A dedicated nav entry makes the dashboard a first-class feature rather than a hidden toggle.

**Independent Test**: Can be tested by clicking the Dashboard link in the top-level navigation, verifying it loads the Space Dashboard page, and clicking back to the Explorer.

**Acceptance Scenarios**:

1. **Given** the user is authenticated, **When** they look at the top-level navigation, **Then** they see a distinct "Dashboard" entry alongside the existing "Explorer" entry.
2. **Given** the user is on the Explorer page, **When** they click the Dashboard nav link, **Then** they are taken to the Space Dashboard page.
3. **Given** the user is on the Space Dashboard, **When** they click the Explorer nav link, **Then** they return to the Explorer.
4. **Given** the user has a space selected in the Explorer, **When** they navigate to the Space Dashboard, **Then** that space is pre-selected in the dashboard.
5. **Given** the user navigates directly to the Dashboard with no space context, **When** the page loads, **Then** they see an inline space picker prompting them to select a space.
6. **Given** the user is on the Dashboard viewing one space, **When** they use the inline space picker to switch to a different space, **Then** the dashboard reloads with the new space's data.

---

### Edge Cases

- What happens when the user selects a space they do not have access to? — The system shows a permission error and does not display partial data.
- What happens when the space has no contributions at all? — Dashboard renders with zero-value metrics and empty-state messages per panel, not a blank page.
- What happens when contribution data is very skewed (e.g. one contributor with 99% of posts)? — Visualizations scale gracefully; the contributor chart remains readable rather than showing one oversized bar.
- What happens when the space hierarchy is very deep (L0 → L1 → L2 → beyond)? — The system only processes up to the supported depth and indicates if deeper levels were excluded.
- What happens when the BFF is loading data? — Each dashboard panel shows an individual loading skeleton while its data is being fetched.

## Requirements *(mandatory)*

### Functional Requirements

#### P1 — Headline Metrics & Navigation

- **FR-001**: System MUST provide a dedicated Space Dashboard page accessible as a separate route in the top-level navigation, alongside the existing network Explorer.
- **FR-002**: System MUST allow the user to select a single space to analyze. If a space is already selected (from the Space Selector page or Explorer context), it MUST be pre-selected on the Dashboard. The Dashboard MUST also provide an inline space picker (e.g. dropdown) so the user can switch spaces without leaving the page.
- **FR-003**: System MUST display headline metric cards for the following P1 metrics:
  - Total callouts
  - Total contributions to callouts (posts + memos + links + whiteboards)
  - Total comments (messages across all contribution rooms)
  - Total unique contributors (members who contributed at least once)
  - Engagement ratio (active contributors / total members)
  - Unanswered callout % (callouts with zero contributions)
  - Average contributions per callout
- **FR-012**: System MUST allow users to navigate between the Network Explorer and Space Dashboard via top-level navigation links without losing space selection context.
- **FR-013**: The Space Dashboard MUST work within the existing authentication flow — no separate login required.

#### P2 — Visualizations & Filtering

- **FR-004**: System MUST display a time-series visualization showing contribution volume over time (by week or month), with visible trend direction.
- **FR-005**: System MUST display a contributor ranking showing the most active contributors by contribution count.
- **FR-006**: System MUST display an engagement distribution visualization showing the spread of active vs. inactive members, including engagement ratio.
- **FR-015**: System MUST provide a global time-range selector that filters all dashboard panels. The default view shows all-time data. Preset options (e.g. last 30 days, last quarter, last year, all time) MUST be available.
- **FR-016**: System MUST provide a phase/tab filter that allows the user to view dashboard metrics for a specific phase (e.g. Knowledge Base, Innovation Flow step) or for the entire space. The default is the entire space.
- **FR-018**: System MUST display new contributors over time — how many people made their first contribution each month.
- **FR-019**: System MUST display activity split by role (admin/lead/member).
- **FR-020**: System MUST display organization representation and activity levels.

#### P3 — Advanced & Structural

- **FR-007**: System MUST display a content type mix breakdown (posts, memos, links, whiteboards) using a proportional visualization.
- **FR-008**: System MUST display a subspace activity distribution for spaces that have subspaces, using a hierarchical visualization.
- **FR-017**: System MUST display additional engagement quality metrics beyond the P1 headline cards (FR-003): average comments per contribution. (Unanswered callout % and average contributions per callout are already covered by FR-003.)
- **FR-021**: System MUST display whiteboard-specific metrics: total whiteboards, total whiteboard modifications, and average modifications per whiteboard.
- **FR-022**: System MUST display top callouts by engagement (most contributions + comments).
- **FR-023**: System MUST display dormant callouts — callouts with no activity in a configurable period (e.g. last 30/60/90 days).
- **FR-024**: System MUST display contributor concentration — showing whether activity is spread evenly or dominated by a few contributors (e.g. top 5 contributors' share of total).
- **FR-025**: System MUST display contributor return rate — of people who contributed in one period, how many contributed again in the next.
- **FR-026**: System MUST display most cross-active contributors — people contributing across multiple subspaces.
- **FR-027**: System MUST allow users to export dashboard data (e.g. CSV download or PDF report) so portfolio owners can share stats with stakeholders.

#### Infrastructure

- **FR-009**: System MUST aggregate metrics across all subspace levels (L0/L1/L2) when computing totals for a space.
- **FR-010**: System MUST show individual loading states per dashboard panel while data is being fetched.
- **FR-011**: System MUST show meaningful empty states when a space has no activity or no subspaces.
- **FR-014**: The BFF MUST provide an endpoint (or extend existing ones) that returns space-level analytics data suitable for the dashboard, including per-type contribution counts, contributor lists with activity counts, time-bucketed activity data, and callout-level engagement data.

### Key Entities

- **Space**: The top-level entity being analyzed. Has a name, profile (avatar, tagline), and a hierarchy of subspaces. Relationships: contains Subspaces, has Members.
- **Subspace**: A child space (L1 or L2) within the selected space. Has its own contributions and members. Relationships: belongs to a parent Space, contains Contributions.
- **Member**: A user who belongs to the space in any role (admin, lead, member). Has a name, avatar, and organizational affiliation. A member may or may not have contributed.
- **Contributor**: A member who has made at least one contribution. Has contribution counts by type and an activity timeline.
- **Callout**: A container within a CalloutsSet that organizes related content (e.g. a challenge, a question prompt, a call for ideas). Has a title, a type, a publication date, and contains Contributions. A callout with zero contributions is "unanswered".
- **Contribution (CalloutContribution)**: A piece of content within a Callout. Exactly one of: Post, Memo, Link, or Whiteboard. Has a timestamp and an author.
- **Post**: A forum-style contribution within a callout. Has a Room for threaded comments.
- **Memo**: A collaborative rich-text document within a callout.
- **Link**: An external reference within a callout.
- **Whiteboard**: A collaborative visual canvas within a callout. Tracks content modifications.
- **Comment (Message)**: A threaded message within a Post's Room or a Callout's top-level Room. Has a timestamp, author, and optional thread ID.
- **Phase/Tab (CalloutsSet)**: A top-level organizational section within a space's Collaboration. Either COLLABORATION or KNOWLEDGE_BASE type. Contains Callouts. The InnovationFlow states correspond to workflow phases.
- **Organization**: An entity that members may be affiliated with. Relevant for understanding which organizations are represented in a space.

## Clarifications

### Session 2026-03-17

- Q: Should the dashboard show all-time totals only, or include time-range filtering? → A: All-time default with a global time-range selector that filters all panels.
- Q: Should the dashboard use client-specific labels (Questions/Answers) or generic Alkemio content types? → A: Generic Alkemio content model — Callouts, Contributions (posts, memos, links, whiteboards), and Comments. Clients infer their own domain vocabulary. Additionally, the dashboard must support filtering by space phase/tab (e.g. Knowledge Base) because users care about stats for specific sections, not just the whole space.
- Q: What specific metrics should the dashboard show? → A: Full tiered catalog: P1 headline cards (total callouts, contributions, comments, contributors, engagement ratio, unanswered callout %, avg contributions per callout), P2 visualizations (activity timeline, contributor ranking, new contributors over time, org leaderboard, role activity split, subspace/phase breakdown), P3 advanced (whiteboard metrics, top callouts by engagement, dormant callouts, contributor concentration, return rate, cross-active contributors, comment depth).
- Q: How should users navigate to the Space Dashboard? → A: Separate route in the top-level navigation. The Dashboard is a distinct page alongside the existing Explorer, not a toggle within the Explorer.
- Q: How should users select a space on the Dashboard page? → A: Both — if a space is already selected (from Space Selector or Explorer context), pre-select it on the Dashboard. Otherwise, show an inline space picker on the Dashboard page itself.
- Q: Should the dashboard support exporting/sharing metrics? → A: Yes — add as P3 feature (CSV/PDF export for sharing with stakeholders).

## Assumptions

- The existing Alkemio GraphQL API provides sufficient data to compute all required metrics (contribution types, timestamps, member lists, roles). The current codebase already fetches most of this data for the network graph.
- The dashboard uses generic Alkemio content types (Callouts, Contributions of type post/memo/link/whiteboard, and Comments as Messages) rather than client-specific vocabulary. Clients map to their own domain terminology (e.g. TIP reads callouts as "questions" and post contributions as "answers").
- Alkemio spaces organize content into CalloutsSet collections (typed as COLLABORATION or KNOWLEDGE_BASE) and InnovationFlow states (phases). The API provides sufficient data to identify which section a callout belongs to, enabling per-phase filtering.
- The dashboard targets the same authenticated users as the existing tool — space managers, community leads, and platform administrators.
- Dashboard data can be cached with the same per-user, per-space TTL strategy already used for network graph data.
- The dashboard is a read-only view with no write operations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select a space and see all headline metrics within 5 seconds of space selection.
- **SC-002**: The dashboard displays at least 5 distinct visualization panels covering different analytical dimensions (headline metrics, activity timeline, contributor ranking, subspace/phase distribution, content type mix, engagement quality).
- **SC-003**: Users can navigate between the Network Explorer and Space Dashboard in a single click/tap.
- **SC-004**: All metric values displayed on the dashboard match the actual underlying data — no miscounts or dropped contributions.
- **SC-005**: 80% of first-time users can find and use the Space Dashboard without guidance.
- **SC-006**: The dashboard renders correctly and remains usable on screen widths from 1024px up to 2560px.
- **SC-007**: Each dashboard panel handles zero-data states gracefully with informative empty state messaging rather than blank areas or errors.
