# Alkemio Data Briefing — Student Project Preparation

**For**: Intro meeting with Haagse Hogeschool BDM/DGA students  
**Date**: March 2026

---

## 1. What is Alkemio? (30-second version)

Alkemio is an **open innovation platform** where organizations and individuals collaborate on shared challenges. Think of it as a structured collaboration environment where:

- **Spaces** are the main containers (like projects or challenges)
- **Users** are people who join and participate
- **Organizations** are companies/institutions that host or join Spaces

Everything is connected: users join Spaces, organizations host Spaces, people have roles (member, lead, admin), and all activity is tracked.

---

## 2. What Data Do We Already Use? (Ecosystem Analytics)

Our current app pulls the following from the Alkemio GraphQL API:

| Data | What it contains | How we use it |
|------|-----------------|---------------|
| **Spaces** (3 levels) | Name, description, tagline, avatar, banner, location (city/country/GPS), tags, privacy mode, visibility, creation date | Nodes on a network graph |
| **Users** | Display name, avatar, location (city/country/GPS), tags (skills, keywords), creation date | Nodes on a network graph |
| **Organizations** | Display name, avatar, location, tags, website, contact email, description, owner, associate count | Nodes on a network graph |
| **Roles/Relationships** | Who is a member/lead/admin of which Space | Edges (connections) on the graph |
| **Activity feed** | Timestamped events: posts created, comments, members joined, whiteboards edited, links shared, etc. | Activity pulse (timeline charts, activity tiers) |

**What we do with it**: We build a force-directed network graph showing how people, organizations, and Spaces are connected. We calculate metrics like network density, average connections, super-connectors (very active people), and isolated nodes.

---

## 3. What EXTRA Data Is Available? (Not yet used)

This is the interesting part for the students. Below is a precise breakdown: what we use vs. what we don't.

### Approach: How data access works

The Alkemio platform exposes a **GraphQL API** with ~30 top-level "query endpoints." Our project currently uses only **7** of them. The rest are untouched.

> **Important caveat**: The API has **authorization rules** — not all data is visible to all users. Some fields return `null` if you don't have permission, some queries are admin-only. The schema tells us what *exists*, but actual access depends on the logged-in user's role. Items marked with ⚠️ below may require elevated privileges or may only return your own data.

### 3a. Root Query Endpoints — Used vs. Not Used

**WE USE (7 queries):**
| Query | What it does |
|-------|-------------|
| `me` | Get current logged-in user's profile + Space memberships |
| `mySpacesHierarchical` | List all Spaces the user belongs to (with hierarchy) |
| `spaceByName` | Fetch a specific Space by its name identifier |
| `subspaceDetails` | Fetch details of a specific subspace |
| `usersByIDs` | Batch-fetch user profiles by their IDs |
| `organizationByID` | Fetch a single organization's profile |
| `activityFeedGrouped` | Get activity events (posts, comments, joins, etc.) |

**WE DON'T USE (20+ queries — all available to the students):**
| Query | What it gives you | Student potential |
|-------|------------------|-------------------|
| `accounts` | All Accounts on the platform — who hosts what, license plans, subscription tiers. ⚠️ May require elevated privileges | Business model analysis, host mapping |
| `activityFeed` | **Paginated** activity feed (cursor-based, not just grouped) — can page through ALL history | Full historical activity analysis |
| `activityLogOnCollaboration` | Activity log for a **specific** Collaboration, with child inclusion option | Per-Space deep activity analysis |
| `aiServer` | AI server config, all AI personas, their engines (OpenAI/Expert/Guidance/etc.) | AI adoption analysis |
| `exploreSpaces` | Spaces ranked by most active in the past N days (configurable) | Trending/popularity ranking |
| `organizations` | **All** organizations on the platform (filterable, paginated) | Organization landscape analysis |
| `organizationsPaginated` | Same but with cursor pagination, filter by name/domain/email/website/verification status | Large-scale org data export |
| `platform` | Platform config, Forum (platform-level discussions), Innovation Library, licensing, metadata, settings. Some sub-fields may require elevated privileges | Platform governance analysis |
| `rolesUser` | Complete cross-platform role mapping for any user — every Space they're in, every role they hold, with subspace breakdown | Participation breadth/depth analysis |
| `rolesOrganization` | Same for organizations — all Spaces an org participates in + roles | Org engagement mapping |
| `rolesVirtualContributor` | Roles for AI assistants | AI deployment footprint |
| `search` | Full-text search across all content — returns scored results for Spaces, Users, Orgs, Callouts, Posts, Whiteboards, Memos | Content discoverability, knowledge mapping |
| `spaces` | All Spaces on the platform (filterable by visibility: ACTIVE/ARCHIVED/DEMO) | Platform-wide Space catalog |
| `spacesPaginated` | Cursor-paginated version | Large-scale Space export |
| `users` | **All** users on the platform (filterable, with limit) | Full user base analysis |
| `usersPaginated` | Cursor-paginated, with `withTags` option to include tag data | User skills/keyword analysis |
| `virtualContributor` | Specific AI contributor details — knowledge base, engine, body of knowledge, prompt graphs, interaction modes, data access mode, status | AI capability analysis |
| `virtualContributors` | All AI contributors — ⚠️ **explicitly platform admin only** | AI landscape overview |
| `usersWithAuthorizationCredential` | Users holding specific credentials — ⚠️ likely requires admin privileges | Permission/role analysis |
| `lookup` | Direct entity lookup by ID — can look up ANY entity type (Space, Callout, Post, Room, Calendar, Contribution, etc.) | Targeted deep-dives |

### 3b. Unused Fields on Entities We DO Query

Even on the entities we already fetch, we skip a LOT of fields:

**On Users (we fetch name, avatar, location, tags):**
| Unused field | What it is |
|-------------|------------|
| `firstName`, `lastName` | Separate first/last name fields |
| `isContactable` | Whether the user accepts messages |
| `profile.description` | User bio (Markdown) |
| `profile.references` | External links (LinkedIn, website, etc.) with name + URI + description |
| `email` | ⚠️ Email address — may be restricted by authorization; we only fetch it for the logged-in user |
| `phone` | ⚠️ Phone number — may return null for privacy |
| `authentication.authenticatedAt` | ⚠️ Last login timestamp — **the schema exposes this on the User type, but authorization rules may restrict it to the user themselves or admins** |
| `authentication.createdAt` | ⚠️ Same caveat — when the Kratos account was created |
| `authentication.methods` | ⚠️ Same caveat — sign-in methods (email, LinkedIn, Microsoft, GitHub) |
| `settings` | ⚠️ Communication preferences, home Space — likely only accessible to the user themselves |

**On Organizations (we fetch name, avatar, location, tags, website, email):**
| Unused field | What it is |
|-------------|------------|
| `domain` | Verified domain name |
| `legalEntityName` | Legal business name |
| `metrics` | Platform-computed activity metrics (name-value pairs) |
| `verification` | Verification status |
| `groups` | Internal user groups within the org |
| `settings` | Membership settings (e.g., allow domain-matching users to auto-join) |

**On Spaces (we fetch name, tagline, location, tags, privacy, visibility, community roles):**
| Unused field | What it is |
|-------------|------------|
| `about.metrics` | **Platform-computed Space metrics** (name-value pairs — member counts, activity counts, etc.) |
| `about.who` | "Who should get involved" description |
| `about.why` | Purpose/goal description |
| `about.guidelines` | Community guidelines |
| `about.provider` | The host organization/user |
| `about.membership.policy` | Open/Closed/Invitation-only |
| `collaboration.calloutsSet` | **All Callouts** (=contribution boards) inside the Space, with their contributions, comments, tags |
| `collaboration.calloutsSet.tags` | All tags used across all callouts and contributions |
| `collaboration.timeline.calendar.events` | **Calendar events** (meetings, milestones, deadlines) |
| `collaboration.innovationFlow` | Workflow states within the Space |
| `settings.collaboration` | Rules: can guests contribute? Can members create subspaces? Can members video-call? |
| `settings.membership` | Policy + trusted organizations list |
| `settings.privacy.mode` | PUBLIC or PRIVATE |
| `license.entitlements` | What features the Space has access to |
| `subscriptions` | Active subscription plan(s) |
| `account.host` | Who owns/pays for this Space |
| `level` | Explicit L0/L1/L2 level value |
| `sortOrder` | Display ordering |
| `updatedDate` | Last modification timestamp |

### 3c. Entirely Untouched Deep Data (accessible through Space → Collaboration)

This is the richest untapped area. Each Space has a `collaboration` object containing:

**Callouts (contribution boards)** — The core content containers:
| Data | Description |
|------|-------------|
| `callout.activity` | Activity count (number of contributions or comments) |
| `callout.contributions[]` | Each contribution: who created it, when, what type |
| `callout.contributions[].post` | Full Post: profile (title, description, tags), comments room |
| `callout.contributions[].whiteboard` | Whiteboard content + modification history |
| `callout.contributions[].memo` | Memo: markdown content |
| `callout.contributions[].link` | Link: URI + profile |
| `callout.comments` | Comment room with individual messages |
| `callout.createdBy` | Who created the callout |
| `callout.publishedBy` / `publishedDate` | Who published it and when |
| `callout.framing` | The framing content (description, whiteboard, profile) |
| `callout.contributionDefaults` | Default settings for new contributions |
| `callout.contributionsCount` | Counts by type (posts, whiteboards, memos, links, others) |

**Messages & Rooms:**
| Data | Description |
|------|-------------|
| `room.messages[]` | Actual message content (Markdown), sender, timestamp, thread ID |
| `room.messagesCount` | Count of messages in the room |
| `room.lastMessage` | Most recent message (for previews) |
| `message.reactions[]` | Emoji reactions on messages — who reacted, when |

**Calendar Events:**
| Data | Description |
|------|-------------|
| `calendarEvent.profile` | Event name, description, tags |
| `calendarEvent.startDate` | Start date |
| `calendarEvent.durationMinutes` / `durationDays` | How long |
| `calendarEvent.type` | EVENT, MEETING, MILESTONE, or DEADLINE |
| `calendarEvent.createdBy` | Who created it |
| `calendarEvent.comments` | Discussion on the event |
| `calendarEvent.subspace` | Which subspace it belongs to |
| `calendarEvent.wholeDay` / `multipleDays` | Duration flags |

### 3d. Platform-Level Data (via `platform` query)

| Data | Description | Student potential |
|------|-------------|-------------------|
| **Forum & Discussions** | Platform-wide forum with categorized discussions (COMMUNITY_BUILDING, HELP, RELEASES, etc.), each with comments room, creator, timestamps, privacy settings | Community engagement analysis, help-seeking patterns |
| **Innovation Library** | All Innovation Packs, their templates, listed Innovation Hubs and Virtual Contributors | Template/pattern reuse analysis |
| **Licensing Framework** | How licenses work across the platform | Business model understanding |
| **Metadata** | Services metadata (versions, etc.) | Platform health monitoring |

### 3e. AI & Virtual Contributors (via `virtualContributor` / `aiServer` queries)

| Data | Description | Student potential |
|------|-------------|-------------------|
| `aiPersona.engine` | Engine type: EXPERT, COMMUNITY_MANAGER, GUIDANCE, OPENAI_ASSISTANT, GENERIC_OPENAI, LIBRA_FLOW | AI strategy analysis |
| `bodyOfKnowledgeType` | Knowledge source: ALKEMIO_SPACE, ALKEMIO_KNOWLEDGE_BASE, WEBSITE, OTHER, NONE | How AI is being trained |
| `dataAccessMode` | NONE or SPACE_PROFILE — what data the AI can see | Data governance analysis |
| `interactionModes` | How users interact with the AI | Usage pattern analysis |
| `status` | Active/inactive status | Adoption tracking |
| `promptGraphDefinition` | Full prompt graph with nodes, edges, state — the AI's reasoning pipeline | AI architecture analysis |
| `knowledgeBase.callouts` | The callouts that feed the AI's knowledge | Knowledge management analysis |
| `listedInStore` / `searchVisibility` | Whether the AI is publicly discoverable | AI governance |

### 3f. User Engagement Deep Data

> **Critical limitation**: Everything under `me.*` is **only for the currently logged-in user**. You cannot see other users' notifications, conversations, or applications. This limits analytics unless you aggregate by having each user export their own data, or have admin-level access.

| Data | Description | Student potential |
|------|-------------|-------------------|
| `me.notifications` | In-app notifications with read/unread status, types, triggers — **own data only** | Limited — only for the logged-in user |
| `me.communityApplications` | Pending membership applications — **own data only** | Limited |
| `me.communityInvitations` | Pending invitations — **own data only** | Limited |
| `me.conversations` | Direct messaging (user-to-user, user-to-AI) — **own conversations only** | Limited to own data |
| `me.mySpaces` | Spaces with additional personal context | Personal engagement mapping |
| `user.authentication.methods` | ⚠️ Sign-in methods — **may be restricted to own profile or admins** | Auth preference analysis (if accessible) |
| `user.authentication.authenticatedAt` | ⚠️ Last login — **may be restricted to own profile or admins** | Login frequency / churn (if accessible) |

### 3g. Text Content Available for Analysis

Posts, Memos, Whiteboards, Discussions, and Calendar Events all have **full text content** (Markdown format) accessible via their profiles. This means students could do:
- **Text/NLP analysis** on contributions
- **Sentiment analysis** on discussions
- **Topic modeling** across Spaces
- **Content quality scoring**
- **Knowledge extraction**

> **Note**: Text content within Spaces respects Space-level privacy. If a Space is PRIVATE and the user doesn't have membership, the content won't be accessible.

### 3h. Confidence Summary — What's Definitely Accessible vs. What Needs Testing

**HIGH CONFIDENCE (we use these or they're clearly public):**
- All Space data: names, descriptions, tags, locations, creation dates, privacy modes, visibility
- User profiles: display name, avatar, location, tags/skills, creation date
- Organization profiles: display name, avatar, location, tags, website, email, description
- Roles/memberships: who is member/lead/admin of what
- Activity feed: all 12 event types with timestamps, across any Space you have access to
- `spaces` / `spacesPaginated` queries: list all visible Spaces
- `organizations` / `organizationsPaginated` queries: list all organizations
- `users` / `usersPaginated` queries: list all users (basic profiles)
- `exploreSpaces`: Spaces ranked by activity
- `search`: full-text search across visible content
- `rolesUser` / `rolesOrganization`: complete role mapping
- Space → collaboration → callouts → contributions: content within Spaces you can access

**NEEDS VERIFICATION (schema exposes it but authorization may restrict it):**
- `user.email` for other users (we only fetch our own today)
- `user.authentication` (last login, auth methods) for other users
- `user.phone`, `user.settings` for other users
- `accounts` query (may need admin)
- `platform` sub-fields (Forum probably public; licensing details may need admin)
- `virtualContributor` by ID (probably accessible; the list-all query is admin-only)
- Space `about.metrics` (NVP metrics — unclear what's populated and whether it requires admin)

**DEFINITELY ADMIN-ONLY:**
- `virtualContributors` (all VCs — explicitly admin only)
- `adminIdentitiesUnverified`
- `platformAdmin.*` queries
- `usersWithAuthorizationCredential`
- `ContributorRoles.applications` / `.invitations` (explicitly admin only)

---

## 4. Data Volume & Shape (What to expect)

- **Format**: All data is accessed via a **GraphQL API** (like a flexible database query language)
- **Authentication**: Requires a logged-in user session — data access is scoped by permissions
- **Size**: Depends on the Alkemio instance. A typical active instance has hundreds of Users, dozens of Organizations, and dozens of Spaces with multiple levels
- **Time span**: All entities have `createdDate` and `updatedDate` timestamps — historical analysis is possible
- **Relationships**: The data is inherently a **graph/network** — entities connect to each other through roles, memberships, and contributions

---

## 5. Which Semester Programs Could This Fit?

| Semester | Focus | Alkemio fit |
|----------|-------|-------------|
| **Sem 3: Business Intelligence** | Dashboards, KPIs, data warehouse, decision support | **Strong fit** — Build a dashboard showing ecosystem health, Space activity KPIs, user engagement metrics, organization contribution patterns |
| **Sem 4: Data Science for Business** | Predictive models, statistical analysis | **Good fit** — Predict Space success based on early activity patterns, predict user churn, identify what makes a Space thrive |
| **Sem 7: Data Governance** | Data maturity, governance assessment, change management | **Good fit** — Assess Alkemio's data management maturity, advise on data governance practices for a platform that handles sensitive collaboration data |
| **Sem 2: Data Housekeeping** | Map data landscape, identify issues, improvement advice | **Good fit** — Map the complete Alkemio data model, identify data quality issues, recommend improvements |

---

## 6. Concrete Project Ideas (Conversation starters)

1. **Ecosystem Health Dashboard** (Sem 3: BI) — Use `exploreSpaces`, `about.metrics`, `activityFeed`, and role queries to build KPIs: active users/month, Space growth rate, average contributions per Space, member retention rates. Data: activity timestamps, membership events, Space creation dates.

2. **Engagement Prediction Model** (Sem 4: Data Science) — Using the full `activityFeed` (paginated, historical), predict which Spaces will stay active. Features: early activity volume, member count at various stages, contribution diversity (posts vs. whiteboards vs. links), calendar event frequency. Target: Space still active after 6 months?

3. **Community Network Analysis** (Sem 3/4) — Go deeper than our current graph. Use `rolesUser` for each user to map ALL their memberships across ALL Spaces. Find bridge-builders, detect silos, measure knowledge flow based on shared membership patterns.

4. **Content & Contribution Intelligence** (Sem 3/4) — Pull actual Post content, Memo text, Discussion messages via the Callouts path. Analyze: what content types drive engagement? Are whiteboards or posts more effective? What topics appear across Spaces? NLP on Markdown content for topic modeling.

5. **AI Adoption Dashboard** (Sem 3: BI) — Use `virtualContributor` data: how many AI assistants are deployed, which engines are used, what's their knowledge source, are they active? Cross-reference with Space activity to see if AI presence correlates with more/less human activity.

6. **Data Governance Assessment** (Sem 7: DGA) — Audit the platform: how are permissions structured (Space privacy modes, membership policies)? What data quality issues exist (empty profiles, missing locations, unused Spaces)? Use `organizations` verification status, Space `settings`, user profile completeness. Recommend governance improvements.

7. **Geographic Collaboration Map** (Sem 3: BI) — All users, organizations, and Spaces have location data (city/country/GPS coordinates). Build a dashboard: where are contributors located? How does geography affect collaboration? Are there regional clusters? Cross with `activityFeed` for "when do different timezones collaborate?"

---

## 7. What We Can Offer the Students

- **API access** to a live Alkemio instance (with proper authentication)
- **This existing codebase** as a reference (TypeScript, GraphQL, data transformation pipeline)
- **The full typed GraphQL schema** (14,000+ lines — every data field documented)
- **A working example** (the Ecosystem Analytics app) showing how to fetch and transform the data
- **A contact person** (you!) for questions about the domain and data
- **Real data** from a production collaboration platform — not dummy data

---

## 8. Key Terms Cheat Sheet

| Term | Plain English |
|------|---------------|
| **Space** | A project or challenge area where people collaborate |
| **Subspace** (L1/L2) | A Space nested inside another Space (like folders in folders) |
| **Callout** | A prompt or card where people can contribute ideas, posts, links |
| **Contribution** | Any content a user adds (post, link, whiteboard, memo) |
| **Role** | Member, Lead, or Admin — defines what someone can do in a Space |
| **GraphQL** | The query language used to fetch data from Alkemio (flexible, typed) |
| **Node** | A point in a network (user, org, or Space) |
| **Edge** | A connection between two nodes (membership, leadership) |
| **BFF** | Backend-For-Frontend — our server that talks to Alkemio on behalf of the web app |
