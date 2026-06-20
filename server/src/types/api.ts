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

/** Response for POST /api/vng/dashboard (feature 016, US3). */
export interface VngDashboardResponse {
  /** Active counting unit: selected spaces or GD initiatives (FR-022). */
  source: 'spaces' | 'gd-initiatives';
  totalCounted: number;
  uncategorisedCount: number;
  dimensions: DashboardDimension[];
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
