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
  /**
   * How visible the Space is on Alkemio: its content public or private, and its status
   * (`ACTIVE`, `ARCHIVED`, `DEMO`, `INACTIVE`). `null` when unreadable.
   */
  visibility: { contentPublic: boolean | null; status: string | null } | null;
  /** How many of the designated classifications are set; `null` when unreadable. */
  classificationStatus: { set: number; designated: number } | null;
  /**
   * What each designated classification holds on this Space — the selected value labels,
   * in designation order; `present: false` when the Space lacks that classification.
   * `null` when unreadable.
   */
  classifications: DesignatedValues[] | null;
}

/** The selected values of one designated classification on one Space. */
export interface DesignatedValues {
  key: DesignatedKey;
  present: boolean;
  values: string[];
}

/** One classification the monitor reads, and the Alkemio label it is matched on. */
export interface Designation {
  key: DesignatedKey;
  /** The configured `displayLabel` (analytics.yml `dashboards.vng.classifications`). */
  label: string;
}

export type SettingsChangeKind = 'seed' | 'update' | 'rename';

/**
 * `GET /api/vng/admin/history` — ONE audit log of every edit to the monitor, newest
 * first: the Included Spaces and classification changes made from the admin area.
 */
export interface AuditLogView {
  entries: AuditEntry[];
  /** Cursor for the next (older) page; `null` at the end. Opaque. */
  next: string | null;
  /** Display names for the nameIDs mentioned, where known. */
  names: Record<string, string>;
}

export type AuditEntry =
  | ({ type: 'spaces' } & SettingsChangeView)
  | {
      type: 'classification';
      /** ISO timestamp. */
      at: string;
      actorName: string | null;
      spaceNameId: string;
      /** The classification's label, e.g. "NDS-prioriteit". */
      entryLabel: string;
      /** Value labels before and after. */
      from: string[];
      to: string[];
    }
  | {
      type: 'access';
      at: string;
      actorName: string | null;
      from: { viewers: AccessSpaceRef[]; admins: AccessSpaceRef[] };
      to: { viewers: AccessSpaceRef[]; admins: AccessSpaceRef[] };
    };

/** A Space in an access set, as recorded in the audit log. */
export interface AccessSpaceRef {
  key: string;
  displayName: string;
}

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
  initiatives: Array<{
    nameId: string;
    displayName: string;
    source: GdInitiativeSource;
    url: string | null;
    /** Selected NDS / VNG 2030 labels as the manager's cached data holds them. */
    nds: string[];
    vng2030: string[];
  }>;
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
  /** False when the deployment left the app ungated (`none`): nothing to set here. */
  editable: boolean;
  /** Whether the sets come from the deployment configuration or were saved here. */
  source: 'config' | 'settings';
  /** For `PUT /access`'s `baseRevision`; 0 while the configuration applies. */
  revision: number;
  updatedAt: string | null;
  updatedByName: string | null;
}

/** `GET`/`PUT /api/vng/admin/included-spaces`. */
export interface IncludedSpacesView {
  revision: number;
  /** The classifications the monitor reads, in column order. */
  designations: Designation[];
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
