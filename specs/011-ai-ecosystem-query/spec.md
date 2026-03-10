# Feature Specification: AI Ecosystem Query — Natural Language Discovery

**Feature Branch**: `011-ai-ecosystem-query`  
**Created**: March 6, 2026  
**Status**: Draft  
**Input**: Enable users to query the ecosystem analytics data using natural language, so they can discover people, projects, organisations, and collaboration opportunities through a conversational AI interface.

## Context & Problem Statement

The ecosystem analytics tool provides a powerful visual overview of portfolio networks — but users often need to answer specific questions quickly without manually navigating the graph. The core pain point: **people don't know who to talk to, who's already working on something, or where to find the right expertise to start a collaboration**.

Feedback from innovation management experts confirms that networking and discovery should be the **first step** of the journey, not the last. A project really begins when you find the right like-minded people with the right skills. Today, this requires knowing the right people, who then connect you to other people — a slow, opaque, and unreliable process. Knowledge from past projects sits locked in individuals' heads and is lost when projects end.

This feature makes the entire ecosystem data set queryable through a natural language conversational interface, letting users ask open questions and receive structured, visual answers — turning the ecosystem map into an interactive discovery and matchmaking tool.

## Clarifications

### Session 2026-03-06

- Q: What data scope should the AI query search across — only currently loaded spaces, all spaces the user has access to, or all platform spaces? → A: All spaces the user has access to across the platform (broader discovery beyond what is currently loaded on the graph).
- Q: How should the AI query interface be presented — side panel alongside the graph, full-screen overlay, floating chat widget, or separate page? → A: Full-screen overlay that replaces the graph view while the query interface is open. The graph can be distracting and cause users to interpret noise rather than the answer. Users can optionally choose "Show on graph" to visualize results on the graph when useful.
- Q: How transparent should the AI be about its reasoning and confidence — numeric scores, plain-language explanations, or no explanations? → A: Plain-language explanations per result (e.g., "matched because: involved in 2 circular economy projects in Rotterdam") but no numeric confidence scores. Numeric scores create a false sense of precision and erode trust.
- Q: Should the AI query system log or store user queries beyond the current session? → A: Store queries server-side for the current session only (enables multi-turn conversation context), then discard on session end. No persistent query history across sessions.
- Q: When the AI produces an incorrect or misleading answer, what recourse does the user have? → A: A small "This doesn't look right" feedback button on each answer that logs the issue for quality monitoring. No immediate correction or regeneration; users can refine via follow-up questions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Find People by Expertise (Priority: P1)

A user working on a new project needs to find people with a specific skill or expertise within their ecosystem. They open the AI query interface and type a question like "Who has experience with circular economy in the Rotterdam region?" The system interprets the query, searches across all people, their skills, roles, project involvement, and geographic information, and returns a structured list of matching people with context on why they matched — their relevant projects, roles, and expertise.

**Why this priority**: This is the single most requested capability. Every interview highlights that finding the right person is the biggest bottleneck in starting multi-stakeholder collaborations. If the tool solves only this, it already delivers transformative value.

**Independent Test**: Can be fully tested by entering a skill/expertise query and verifying the system returns relevant people with contextual details. Delivers immediate value by replacing the "ask around" process.

**Acceptance Scenarios**:

1. **Given** a user is viewing the ecosystem analytics for their space(s), **When** they open the AI query panel and type "Who has experience with urban farming?", **Then** the system returns a ranked list of people whose profiles, skills, or project involvement match "urban farming", with a brief explanation of why each person matched.
2. **Given** a user queries for expertise in a specific geographic region, **When** they ask "Find people with data science skills in Amsterdam", **Then** results are filtered by both the skill and the geographic location, showing only relevant matches.
3. **Given** no people match the query, **When** the user asks for an extremely niche or non-existent expertise, **Then** the system responds with a clear "no results" message and suggests related or broader queries the user might try.

---

### User Story 2 — Discover Relevant Projects and Spaces (Priority: P1)

A user wants to find out if any projects or spaces in the ecosystem are already working on a topic relevant to them. They ask a question like "Which projects are working on sustainable mobility?" and receive a structured overview of matching projects/spaces, including what they're about, who's involved, and how they relate to the user's interests.

**Why this priority**: Equally critical to finding people. Users waste enormous time reinventing the wheel because they don't know what already exists. Making projects discoverable through natural language removes this barrier and preserves institutional knowledge.

**Independent Test**: Can be tested by querying for a topic and verifying the system returns relevant projects/spaces with descriptive context. Delivers value by surfacing existing work that would otherwise be invisible.

**Acceptance Scenarios**:

1. **Given** a user is in the AI query interface, **When** they ask "What projects are related to mental healthcare in Limburg?", **Then** the system returns a list of matching projects/spaces with summaries, participant counts, and relevant tags.
2. **Given** the user's query matches projects across multiple spaces, **When** results are returned, **Then** each result indicates which space it belongs to and how it relates to the query.
3. **Given** a user asks about a topic that partially overlaps with multiple projects, **When** results are returned, **Then** the system explains the degree of relevance for each match (e.g., "directly about this topic" vs. "tangentially related").

---

### User Story 3 — Identify Collaboration Opportunities (Priority: P2)

A user has an existing project and wants to find synergies — other projects, spaces, or organisations they could partner with. They describe their project context and ask "Who or what should we collaborate with?" The system analyses overlap in topics, skills, geography, and stakeholders to suggest concrete collaboration opportunities.

**Why this priority**: This goes beyond simple search — it requires the system to reason about relationships and overlap. It's the feature that turns analytics into actionable recommendations. High value but builds on the discovery capabilities of P1 stories.

**Independent Test**: Can be tested by describing a project context and verifying the system returns partnership suggestions with reasoning. Delivers value by surfacing non-obvious connections.

**Acceptance Scenarios**:

1. **Given** a user describes their project focus, **When** they ask "We're working on youth employment in The Hague — who could we partner with?", **Then** the system returns organisations, projects, and people that share overlapping themes, geography, or stakeholders, with an explanation of the overlap.
2. **Given** a user asks about collaboration between spaces, **When** they ask "Which organisations overlap between Space A and Space B?", **Then** the system identifies shared organisations, shared contributors, and common topics.
3. **Given** a user wants to find the most strategic partnerships, **When** they ask "Which partnerships make the most sense for our project?", **Then** the system ranks suggestions by degree of overlap and complementarity, explaining its reasoning.

---

### User Story 4 — Identify Connectors and Key People (Priority: P2)

A user wants to understand the social fabric of their ecosystem — who are the bridges, the connectors, the people who link different communities together. They ask "Who are the key connectors in my space?" and receive a structured answer identifying people who participate across multiple projects, spaces, or topic areas.

**Why this priority**: Understanding the social network topology provides strategic value for ecosystem facilitators and portfolio managers. However it builds on the same underlying data as P1 stories, making it a natural extension.

**Independent Test**: Can be tested by querying for connectors and verifying the system identifies people with cross-cutting involvement. Delivers value for facilitators managing ecosystem health.

**Acceptance Scenarios**:

1. **Given** a user asks "Who are the connectors in my space?", **When** results are returned, **Then** the system identifies people who are members of multiple projects or sub-spaces, ranked by their cross-cutting involvement.
2. **Given** a user asks about bridges between specific topic areas, **When** they ask "Who connects the sustainability and technology communities?", **Then** the system identifies people active in both areas.

---

### User Story 5 — Visual Answer Integration with the Graph (Priority: P3)

When the AI query returns results, the user can choose to highlight those results on the existing ecosystem graph. Matched nodes (people, projects, organisations) are visually emphasised — the rest fades into the background — providing spatial and relational context for the query answer.

**Why this priority**: This connects the conversational interface to the visual graph, making it more than a standalone chatbot. However, the core value of answering questions exists without graph integration, so this is an enhancement.

**Independent Test**: Can be tested by running a query and verifying matched nodes are highlighted on the graph while non-matched nodes dim. Delivers value by combining textual answers with visual spatial context.

**Acceptance Scenarios**:

1. **Given** a user has received query results in the full-screen query overlay, **When** they click "Show on graph", **Then** the overlay transitions to the graph view with matched nodes visually highlighted and non-matched nodes faded.
2. **Given** the user is viewing highlighted query results on the graph and clicks on a highlighted node, **When** the details panel opens, **Then** it shows why that node matched the query in addition to its standard details.
3. **Given** the user wants to return to the conversation, **When** they navigate back from the graph view, **Then** the query overlay reappears with the conversation intact and the graph returns to its normal state.

---

### User Story 6 — Conversational Follow-up Questions (Priority: P3)

The interface supports multi-turn conversations. After an initial answer, the user can ask follow-up questions that build on the context of the conversation — refine results, drill deeper into a specific match, or pivot the query direction.

**Why this priority**: Conversational flow significantly improves usability and enables complex exploratory workflows. However, single-shot queries (P1/P2) already deliver substantial value, making this an enhancement.

**Independent Test**: Can be tested by asking a question, then asking a follow-up that references the previous answer, and verifying the system maintains context.

**Acceptance Scenarios**:

1. **Given** the user has received an answer to a query, **When** they ask a follow-up like "Tell me more about the second person" or "Which of those projects are also active in Utrecht?", **Then** the system uses the conversation context to interpret and answer the follow-up correctly.
2. **Given** a multi-turn conversation, **When** the user starts a new unrelated query, **Then** the system recognises the topic shift and resets context appropriately.

---

### Edge Cases

- What happens when a user asks a question that is completely unrelated to the ecosystem data (e.g., "What's the weather today?")? → The system politely explains its scope and suggests relevant question types.
- What happens when the ecosystem data is very sparse (few contributors, few projects)? → The system returns whatever matches exist and proactively notes the limited data scope.
- What happens when a user's query is ambiguous or could be interpreted multiple ways? → The system asks a clarifying question before returning results, or provides results for the most likely interpretation with a note about alternatives.
- What happens when a query matches an extremely large number of results (hundreds of people)? → Results are ranked by relevance and presented in manageable pages, with the option to refine the query.
- What happens when the underlying ecosystem data changes between queries in the same session? → The system uses the most recently loaded dataset; if data is refreshed mid-session, subsequent queries reflect the new data.
- What happens when the AI produces a factually incorrect answer (e.g., wrong project attributed to a person)? → The user can click "This doesn't look right" to flag the answer for quality monitoring, and can refine their question via follow-up queries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a conversational AI query interface as a full-screen overlay that replaces the graph view, keeping users focused on the conversation. Users MUST be able to optionally switch to a graph view to see query results highlighted on the ecosystem graph.
- **FR-002**: The system MUST accept natural language questions about the ecosystem data — including questions about people, projects, spaces, organisations, skills, topics, geography, and roles.
- **FR-003**: The system MUST return structured, readable answers that identify matching entities (people, projects, organisations, spaces) with plain-language explanations of why they matched. The system MUST NOT display numeric confidence or relevance scores.
- **FR-004**: The system MUST rank results by relevance to the user's query. Ranking order is determined internally but exposed only through result ordering and plain-language explanations, not numeric scores.
- **FR-005**: The system MUST support queries about relationships and overlap between entities (e.g., shared contributors, shared topics, organisational overlap between spaces).
- **FR-006**: The system MUST support follow-up questions that reference previous answers within the same conversation session.
- **FR-007**: The system MUST gracefully handle out-of-scope questions by explaining what it can help with and suggesting relevant query types.
- **FR-008**: The system MUST handle ambiguous queries by either asking for clarification or returning the most likely interpretation with a note about alternatives.
- **FR-009**: The system MUST only expose data that the authenticated user is authorised to see — query results MUST respect the same access controls as the Alkemio platform. The system MUST search across all spaces the user has access to, not only those currently loaded on the graph.
- **FR-010**: The system MUST provide a way to visually highlight query results on the ecosystem graph.
- **FR-011**: The system MUST maintain conversation history within a session so users can see their previous questions and answers.
- **FR-012**: The system MUST provide suggested/example questions to help users understand its capabilities when they first open the query interface.
- **FR-013**: The system MUST store conversation context (queries and answers) server-side only for the duration of the current session. All conversation data MUST be discarded when the session ends. The system MUST NOT persist query history across sessions.
- **FR-014**: The system MUST provide a "This doesn't look right" feedback button on each answer. Activating it MUST log the query, answer, and feedback for quality monitoring. The feedback mechanism MUST NOT require the user to provide additional detail (though an optional comment field is acceptable).

### Key Entities

- **Query**: A natural language question submitted by the user. Has a text body, timestamp, and belongs to a conversation session.
- **Answer**: A structured response to a query. Contains matched entities, explanations, relevance rankings, and optionally suggested follow-up questions.
- **Conversation Session**: A sequence of query-answer pairs forming a coherent dialogue. Scoped to a single user session within the ecosystem analytics tool. Conversation data is ephemeral and discarded when the session ends.
- **Matched Entity**: A person, project, space, or organisation returned as part of an answer. Includes a plain-language explanation of why it matched (no numeric scores exposed to the user).

## Assumptions

- The existing ecosystem analytics data model (nodes and edges representing people, projects, spaces, organisations, and their relationships) provides sufficient structured data for the AI to query against.
- The ecosystem analytics tool already has an authentication and authorisation framework that can be extended to the query interface.
- Users are expected to ask questions in English or Dutch; the system should handle both languages.
- The AI query layer searches across all spaces the user has access to on the platform, not only those currently loaded on the graph. This may require fetching or indexing data beyond the currently displayed dataset.
- Performance expectations for initial answers are in the range of typical chatbot response times (a few seconds), not instant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can find a relevant person for a specific expertise within 30 seconds of opening the query interface, compared to the current process of asking multiple contacts over days.
- **SC-002**: 80% of natural language queries return at least one relevant result on the first attempt without the user needing to rephrase.
- **SC-003**: Users rate the relevance of query results at 4 or higher on a 5-point scale in usability testing.
- **SC-004**: The query interface supports at least 50 distinct question patterns covering people discovery, project discovery, collaboration matching, and network analysis.
- **SC-005**: Users can complete a "find and connect" workflow (query → identify person → view their profile details) in under 1 minute.
- **SC-006**: 90% of users who try the query feature use it more than once in subsequent sessions, indicating perceived value.
- **SC-007**: The system correctly enforces access controls — no user ever sees data from spaces or entities they are not authorised to access through query results.


