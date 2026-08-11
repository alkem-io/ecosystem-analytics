/** A selectable L0 Space returned by the BFF */
export interface SpaceSelectionItem {
  id: string;
  nameId: string;
  displayName: string;
  role: 'MEMBER' | 'LEAD';
  /** Content visibility (public/private) derived from `about.isContentPublic`. */
  visibility: 'PUBLIC' | 'PRIVATE';
  /** Lifecycle status of the space (ACTIVE/ARCHIVED/DEMO/INACTIVE) — shown as a badge. */
  status: 'ACTIVE' | 'ARCHIVED' | 'DEMO' | 'INACTIVE';
}

/** Request body for graph generation */
export interface GraphGenerationRequest {
  spaceIds: string[];
  forceRefresh?: boolean;
  /** Fold in the GemeenteDelers initiative layer (feature 016, US10/FR-039). */
  includeInitiatives?: boolean;
}

/** A GemeenteDelers initiative as fetched from a Knowledge Base callout. */
export interface GdCalloutInput {
  /** Callout UUID (becomes the INITIATIVE node id). */
  id: string;
  /** Callout nameID (alkemio_nameid). */
  nameId: string;
  displayName: string;
  /** Free-text description — the associated gemeentes are mentioned in here. */
  description: string;
  /** Flat tag strings on the callout (themes, gemeente names, gd-YYYY, sdg-NN, classifications). */
  tags: string[];
  /** Original vng.nl source link, if present. */
  sourceUrl?: string | null;
}

/** Dimension key → category counts for the VNG dashboard. */
export interface DashboardDimension {
  key: string;
  /**
   * Each category carries its total count plus the names of the entities in it (for
   * tooltips), split into the selected-spaces and GD-initiative sources so the chart
   * can render them as stacked segments. The synthetic `uncategorised` category
   * (entities matching no category in THIS dimension) is always present and is the
   * FIRST entry, so its bar sits in the same leading position across both charts.
   */
  categories: {
    key: string;
    count: number;
    items: string[];
    /** Names contributed by selected spaces (the base stack segment). */
    spacesItems: string[];
    /** Names contributed by GD initiatives (the GD segment; empty unless gdIncluded). */
    gdItems: string[];
    /** Count of the selected-spaces segment (= spacesItems.length). */
    spacesCount: number;
    /** Count of the GD-initiatives segment (= gdItems.length). */
    gdCount: number;
  }[];
}

/**
 * Distribution of initiatives by the number of associated gemeentes, bucketed into
 * fixed ranges. Each bucket is split into Groei (selected spaces) and GD
 * (GemeenteDelers initiatives) so the frontend can render a stacked bar.
 */
export interface GemeenteDistribution {
  /** True when GD initiatives were folded into the counts (the GD checkbox). */
  gdIncluded: boolean;
  buckets: {
    /** Range label, e.g. "1-3", "50+". */
    key: string;
    /** Count of Groei initiatives (selected spaces) whose gemeente-count is in range. */
    groei: number;
    /** Count of GD initiatives whose gemeente-count is in range (0 unless gdIncluded). */
    gd: number;
    /** Names of the Groei initiatives in this bucket (for the hover tooltip). */
    groeiItems: string[];
    /** Names of the GD initiatives in this bucket (for the hover tooltip). */
    gdItems: string[];
  }[];
}

/**
 * NDS × VNG-2030 cross-tab for the bubble-matrix chart (the 4th dashboard chart).
 *
 * Each initiative is placed at a single (nds, vng2030) intersection using its PRIMARY
 * category on each axis — the first category it maps into (in tag order), or the
 * synthetic `uncategorised` slot when it maps into none. Initiatives carrying more than
 * one category on either axis are additionally listed in `multiCategoryItems` so the
 * detail below the chart can surface everything the primary-only placement omits.
 */
export interface CategoryMatrix {
  /** Ordered NDS axis keys (Y axis) — `uncategorised` leads, mirroring the bar charts. */
  ndsCategories: string[];
  /** Ordered VNG-2030 axis keys (X axis) — `uncategorised` leads. */
  vng2030Categories: string[];
  /** One entry per occupied intersection (count > 0). */
  cells: {
    /** Primary NDS category key (row). */
    nds: string;
    /** Primary VNG-2030 category key (column). */
    vng2030: string;
    /** Number of initiatives at this intersection (= spacesItems + gdItems lengths). */
    count: number;
    /** Names contributed by selected spaces (Groei). */
    spacesItems: string[];
    /** Names contributed by GD initiatives (empty unless gdIncluded). */
    gdItems: string[];
  }[];
  /** Initiatives with more than one category on either axis (for the detail list). */
  multiCategoryItems: {
    label: string;
    source: 'spaces' | 'gd';
    /** All NDS category keys this initiative maps into (never `uncategorised`). */
    nds: string[];
    /** All VNG-2030 category keys this initiative maps into (never `uncategorised`). */
    vng2030: string[];
  }[];
}

/**
 * Number of Groei initiatives in each growth phase ("groeifase"). The phase list is a
 * fixed in-app constant (`server/src/services/groei-phases.ts`), so `phases` is always
 * in pipeline order (pre-intake → beheer) and includes phases with count 0.
 */
export interface PhaseDistribution {
  phases: {
    /** Phase tag key, or `unknown` for the trailing no-phase-tag bucket. */
    key: string;
    /** Ordinal phase number (`fase_nr`); null for the `unknown` bucket. */
    nr: number | null;
    count: number;
    /** Names of the initiatives in this phase (for the hover tooltip). */
    items: string[];
  }[];
  /** Total Groei initiatives placed (including the `unknown` bucket). */
  total: number;
}

/** One plotted municipality on the population × initiative-count chart (feature 018). */
export interface CityPopulationPoint {
  /** Gemeente organisation nameID — the stable key across both series. */
  nameId: string;
  name: string;
  provinceName: string | null;
  /** Always > 0 — municipalities with an unknown population are excluded, not zeroed. */
  population: number;
  /** Distinct initiatives in the current selection; always 0 in `nonParticipating`. */
  initiativeCount: number;
  /** Groei (selected top-level space) share of `initiativeCount` — for the per-dot pie. */
  groeiCount: number;
  /** GemeenteDelers share of `initiativeCount` (0 unless the GD layer is included). */
  gdCount: number;
}

/**
 * Population × initiative-count scatter series (feature 018, US3). Plots BOTH the
 * cities taking part in the current selection and the Dutch municipalities taking part
 * in none, so "large city, no participation" outreach gaps are visible (FR-021).
 */
export interface CityPopulationSeries {
  /** True when GD initiatives were folded into the counts (the GD checkbox). */
  gdIncluded: boolean;
  /** Cities with >= 1 initiative in the current selection. */
  participating: CityPopulationPoint[];
  /** Municipalities with 0 initiatives in the current selection. */
  nonParticipating: CityPopulationPoint[];
  /** Municipalities omitted for unknown population — the UI MUST surface this (FR-023). */
  excludedUnknownPopulation: number;
}

/** Response for POST /api/vng/dashboard (feature 016, US3). */
export interface VngDashboardResponse {
  /** True when GD initiatives were folded into the category counts (stacked segment). */
  gdIncluded: boolean;
  /** Total entities counted (selected spaces, plus GD initiatives when included). */
  totalCounted: number;
  /** Entities matching no category in ANY dimension (shown as a summary line). */
  uncategorisedCount: number;
  dimensions: DashboardDimension[];
  /** Initiatives-by-gemeente-count distribution for the stacked bar chart. */
  gemeenteDistribution?: GemeenteDistribution;
  /** NDS × VNG-2030 bubble-matrix cross-tab (the 4th chart). */
  categoryMatrix?: CategoryMatrix;
  /**
   * Groei initiatives per growth phase. Omitted when no selected space carries a
   * phase tag, so dashboards that don't use groeifases simply have no phase chart.
   */
  phaseDistribution?: PhaseDistribution;
  /** Population × initiative-count scatter series (feature 018, US3). */
  cityPopulation?: CityPopulationSeries;
}

/**
 * One Dutch gemeente's position as held in Alkemio (feature 019, FR-005/005a).
 *
 * Selection-independent: unlike every other dashboard payload, this varies with
 * neither the space selection nor the GD toggle. That independence is what lets the
 * Usage Explorer recompute rankings locally on every zoom without a round trip.
 */
export interface GemeenteLocation {
  /** Alkemio organisation nameID, e.g. "gemeente-groningen" — the join key. */
  nameId: string;
  /** Canonical registry name (NOT the Alkemio display name) so labels stay stable. */
  title: string;
  /** Official CBS municipality code, e.g. "GM0014". Non-null by construction (FR-005c). */
  cbsCode: string;
  /** Null when Alkemio holds no geo-location — the gemeente is then "unplaced" (FR-030). */
  latitude: number | null;
  longitude: number | null;
  provinceCode: string;
  provinceName: string;
}

/** Response for GET /api/<app>/gemeente-locations (contracts/api-gemeente-locations.md). */
export interface GemeenteLocationsResponse {
  /** Every eligible gemeente, sorted by title. Unplaced ones are INCLUDED, with null coords. */
  locations: GemeenteLocation[];
  /** The registry's gemeente count (342) — lets the client detect shortfall without hard-coding. */
  expected: number;
  /** How many carry usable coordinates; `expected - withLocation` is the unplaced total. */
  withLocation: number;
  /** The Alkemio sweep completed but did not reach every gemeente — usable but incomplete. */
  partial: boolean;
  /** When the Alkemio sweep ran (NOT when this response was served). */
  fetchedAt: string;
  /** Served from cache rather than a fresh sweep. Diagnostic only. */
  cached: boolean;
  /** Served from an EXPIRED cache entry because the refresh failed (FR-030a). */
  stale: boolean;
}

/** An entity (space or GD initiative) counted by the dashboard, with its tags. */
export interface DashboardCountable {
  id: string;
  /** Display name (for the per-category tooltip list). */
  label: string;
  tags: string[];
  /** Which stacked segment this entity belongs to; defaults to 'spaces'. */
  source?: 'spaces' | 'gd';
}

/** Progressive loading status */
export interface GraphProgress {
  step: 'acquiring' | 'transforming' | 'ready';
  spacesTotal: number;
  spacesCompleted: number;
  /**
   * nameId of the space currently being fetched from Alkemio (only set during the
   * 'acquiring' step, and only for spaces that miss the cache). Lets the loading UI
   * name what it is waiting on (e.g. "Loading data… Signalen"). Undefined when the
   * data is served from cache or once acquisition finishes.
   */
  currentSpace?: string;
}

/** Authenticated user profile */
export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** SSO session detection response */
export interface SsoDetectResponse {
  detected: boolean;
  displayName?: string;
  avatarUrl?: string | null;
  token?: string;
}

/** API error response */
export interface ApiError {
  error: string;
  message: string;
}

/**
 * Build provenance + behaviour-tuning settings for the About dialog.
 * Public (no auth); contains no connection/OIDC/secret values.
 */
export interface MetaResponse {
  build: {
    /** ISO-8601 image build timestamp, or null if unknown (local dev). */
    time: string | null;
    /** Short git commit the image was built from, or null if unknown. */
    commit: string | null;
  };
  /** Behaviour-tuning config values (the knobs, not connection details). */
  settings: {
    maxSpacesPerRequest: number;
    activitySpacesPerQuery: number;
    cacheTtlHours: number;
    gdCacheTtlHours: number;
    aiQueryEnabled: boolean;
    querySessionTtlMinutes: number;
    maxQueryLength: number;
    maxFeedbackLength: number;
  };
}
