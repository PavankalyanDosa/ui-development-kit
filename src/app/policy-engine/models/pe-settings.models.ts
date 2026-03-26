/**
 * PE settings models mirroring app/policy-engine/preload-api.ts.
 * Source of truth: preload-api.ts — keep in sync when adding fields.
 */

export interface PeNonSecretSettings {
  sourceMetadata: {
    name: string;
    description: string;
    owner: string;
    governanceGroup: string;
  };
  isc: {
    tenantUrl: string;
    patClientId: string;
  };
  git: {
    committerName: string;
    committerEmail: string;
    remoteUrl: string;
    pushIntervalMinutes: number;
  };
}

export interface PeSettingsResult extends PeNonSecretSettings {
  patSecretStored: boolean;
  gitAuthTokenStored: boolean;
}

export interface PeSettingsPayload {
  nonSecrets: PeNonSecretSettings;
  patSecret?: string;     // present only when user types a new value
  gitAuthToken?: string;  // present only when user types a new value
}
