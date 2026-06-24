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
  /** Each category carries its count plus the names of the entities in it (for tooltips). */
  categories: { key: string; count: number; items: string[] }[];
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

/** Response for POST /api/vng/dashboard (feature 016, US3). */
export interface VngDashboardResponse {
  /** Active counting unit: selected spaces or GD initiatives (FR-022). */
  source: 'spaces' | 'gd-initiatives';
  totalCounted: number;
  uncategorisedCount: number;
  dimensions: DashboardDimension[];
  /** Initiatives-by-gemeente-count distribution for the stacked bar chart. */
  gemeenteDistribution?: GemeenteDistribution;
}

/** An entity (space or GD initiative) counted by the dashboard, with its tags. */
export interface DashboardCountable {
  id: string;
  /** Display name (for the per-category tooltip list). */
  label: string;
  tags: string[];
}

/** Progressive loading status */
export interface GraphProgress {
  step: 'acquiring' | 'transforming' | 'ready';
  spacesTotal: number;
  spacesCompleted: number;
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
