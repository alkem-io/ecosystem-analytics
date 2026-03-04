/** A selectable L0 Space returned by the BFF */
export interface SpaceSelectionItem {
  id: string;
  nameId: string;
  displayName: string;
  role: 'MEMBER' | 'LEAD';
  visibility: 'PUBLIC' | 'PRIVATE';
}

/** Request body for graph generation */
export interface GraphGenerationRequest {
  spaceIds: string[];
  forceRefresh?: boolean;
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
