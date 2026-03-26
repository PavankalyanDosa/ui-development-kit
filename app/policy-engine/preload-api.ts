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

export interface IpcPolicyEngineApi {
  getSettings: () => Promise<PeSettingsResult>;
  saveSettings: (payload: PeSettingsPayload) => Promise<{ success: boolean }>;
  clearSecret: (key: 'patSecret' | 'gitAuthToken') => Promise<{ success: boolean }>;
  exportSettings: () => Promise<PeNonSecretSettings>;
  importSettings: (data: unknown) => Promise<{ success: boolean; error?: string }>;
  factoryReset: () => Promise<{ success: boolean }>;
}

// Extend Window interface so Angular code gets type-safety
declare global {
  interface Window {
    electronAPI: {
      pe: IpcPolicyEngineApi;
    } & Record<string, unknown>;
  }
}
