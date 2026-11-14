/**
 * The monitor's scope and administration read models (feature 027, data-model.md), shared
 * with the frontends via `@server/types/admin.js`.
 *
 * This file MUST NOT import from outside `server/src/types/` (types-boundary.test.ts): the
 * frontend Docker stage copies only this folder.
 */
import type { GateLink } from './access.js';

/** `GET /api/vng/scope` — what the dashboard reports on. */
export interface MonitorScope {
  revision: number;
  /** The orchestrator key for the Ecosystem tab (`vih-test` in the first seed). */
  ecosystemKey: string;
  spaceNameIds: string[];
}

/** One Included Space as the admin area shows it, resolved with the manager's token. */
export interface IncludedSpaceView {
  nameId: string;
  spaceId: string | null;
  position: number;
  /** `null` when the manager cannot read the Space (only the nameID is shown). */
  displayName: string | null;
  url: string | null;
  readable: boolean;
  /** `false` when Alkemio has no Space by that nameID (or UUID). */
  found: boolean;
  /** How many of the designated classifications are set; `null` when unreadable. */
  classificationStatus: { set: number; designated: number } | null;
}

export type SettingsChangeKind = 'seed' | 'update' | 'rename';

/** One row of the Included Spaces history. */
export interface SettingsChangeView {
  revision: number;
  kind: SettingsChangeKind;
  /** ISO timestamp. */
  at: string;
  /** `null` for a seed or an automatic rename. */
  actorName: string | null;
  added: string[];
  removed: string[];
  note: string | null;
}

export type InitiativeKind = 'included' | 'gd-subspace' | 'gd-post';

/** An initiative a manager can pick in the classifications section. */
export interface InitiativeRef {
  nameId: string;
  displayName: string;
  kind: InitiativeKind;
}

export type DesignatedKey = 'nds' | 'vng2030' | 'phase' | 'trl';

/** One of the monitor's designated classifications on one Space. */
export interface DesignatedClassificationView {
  key: DesignatedKey;
  /** The classification's label (the configured designation when absent). */
  label: string;
  /** `false` when the Space has no such classification: shown "not set", read-only. */
  present: boolean;
  entryId: string | null;
  cardinality: 'SINGLE_SELECT' | 'MULTI_SELECT' | null;
  values: Array<{ id: string; label: string }>;
  selectedValueIds: string[];
}

export type ClassificationsReadOnlyReason = 'NO_UPDATE_RIGHT' | 'GD_POST' | 'NOT_READABLE';

export interface InitiativeClassificationsView {
  initiative: InitiativeRef & { url: string | null };
  canEdit: boolean;
  reason: ClassificationsReadOnlyReason | null;
  classifications: DesignatedClassificationView[];
}

export type ClassificationOutcome =
  | 'SAVED'
  | 'CHANGED_ON_ALKEMIO'
  | 'VALUE_REMOVED'
  | 'NOT_PERMITTED'
  | 'FAILED';

/** `PUT /api/vng/admin/initiatives/:nameId/classifications` — one result per entry. */
export interface ClassificationChangeResult {
  entryId: string;
  outcome: ClassificationOutcome;
  current: DesignatedClassificationView | null;
}

export type GdInitiativeSource = 'subspace' | 'post';

/** `GET /api/vng/admin/gd-source` — the GemeenteDelers source in detail. */
export interface GdSourceSummaryView {
  space: { displayName: string; url: string } | null;
  available: boolean;
  error: 'GD_SPACE_UNREADABLE' | 'LOAD_FAILED' | null;
  total: number;
  viaSubspaces: number;
  viaPosts: number;
  initiatives: Array<{ nameId: string; displayName: string; source: GdInitiativeSource }>;
  superseded: Array<{
    postNameId: string;
    subspaceNameId: string;
    subspaceDisplayName: string | null;
    subspaceUrl: string | null;
    rule: string;
  }>;
  /** `null` for a GD row cached before feature 027. */
  ambiguous: string[] | null;
  /** ISO; `null` for an old row. */
  readAt: string | null;
  nextRefreshAt: string | null;
  migrationComplete: boolean;
}

/** `GET /api/vng/admin/access`. */
export interface AdminAccessView {
  viewers: GateLink[];
  admins: GateLink[];
  me: { displayName: string; viewer: boolean; manager: boolean };
}

/** `GET`/`PUT /api/vng/admin/included-spaces`. */
export interface IncludedSpacesView {
  revision: number;
  spaces: IncludedSpaceView[];
  lastChange: SettingsChangeView | null;
}

/** A Space found by search or by a pasted link. */
export interface SpaceCandidate {
  nameId: string;
  displayName: string;
  url: string;
  included: boolean;
}

export type IncludedSpaceProblem = 'NOT_READABLE' | 'NOT_TOP_LEVEL' | 'DUPLICATE' | 'TOO_MANY';
