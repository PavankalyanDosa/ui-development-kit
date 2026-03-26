import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { PeNonSecretSettings } from './preload-api';

const SETTINGS_FILENAME = 'policy-engine-settings.json';

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILENAME);
}

export function defaultPeSettings(): PeNonSecretSettings {
  return {
    sourceMetadata: {
      name: '',
      description: '',
      owner: '',
      governanceGroup: '',
    },
    isc: {
      tenantUrl: '',
      patClientId: '',
    },
    git: {
      committerName: '',
      committerEmail: '',
      remoteUrl: '',
      pushIntervalMinutes: 5,
    },
  };
}

export function readPeSettings(): PeNonSecretSettings {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data) as PeNonSecretSettings;
    }
    return defaultPeSettings();
  } catch (error) {
    console.error('Error reading policy-engine settings:', error);
    return defaultPeSettings();
  }
}

export function writePeSettings(settings: PeNonSecretSettings): void {
  try {
    const settingsPath = getSettingsPath();
    const settingsDir = path.dirname(settingsPath);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error writing policy-engine settings:', error);
    throw error;
  }
}

export function deletePeSettingsFile(): void {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
  } catch (error) {
    console.error('Error deleting policy-engine settings file:', error);
  }
}

export function importPeSettings(data: unknown): { success: boolean; error?: string } {
  try {
    // Validate that data is a plain object (not null, not array)
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { success: false, error: 'Invalid settings format' };
    }

    const record = data as Record<string, unknown>;

    // Validate all expected top-level keys are present
    const requiredKeys: (keyof PeNonSecretSettings)[] = ['sourceMetadata', 'isc', 'git'];
    for (const key of requiredKeys) {
      if (!(key in record)) {
        return { success: false, error: 'Invalid settings format' };
      }
    }

    // Build a clean settings object, never writing secrets even if present in import data
    const merged: PeNonSecretSettings = {
      sourceMetadata: {
        name: '',
        description: '',
        owner: '',
        governanceGroup: '',
      },
      isc: {
        tenantUrl: '',
        patClientId: '',
      },
      git: {
        committerName: '',
        committerEmail: '',
        remoteUrl: '',
        pushIntervalMinutes: 5,
      },
    };

    const src = record as unknown as PeNonSecretSettings;

    if (src.sourceMetadata && typeof src.sourceMetadata === 'object') {
      merged.sourceMetadata.name = String(src.sourceMetadata.name ?? '');
      merged.sourceMetadata.description = String(src.sourceMetadata.description ?? '');
      merged.sourceMetadata.owner = String(src.sourceMetadata.owner ?? '');
      merged.sourceMetadata.governanceGroup = String(src.sourceMetadata.governanceGroup ?? '');
    }

    if (src.isc && typeof src.isc === 'object') {
      merged.isc.tenantUrl = String(src.isc.tenantUrl ?? '');
      merged.isc.patClientId = String(src.isc.patClientId ?? '');
      // Explicitly do NOT copy patSecret even if present
    }

    if (src.git && typeof src.git === 'object') {
      merged.git.committerName = String(src.git.committerName ?? '');
      merged.git.committerEmail = String(src.git.committerEmail ?? '');
      merged.git.remoteUrl = String(src.git.remoteUrl ?? '');
      merged.git.pushIntervalMinutes = typeof src.git.pushIntervalMinutes === 'number'
        ? src.git.pushIntervalMinutes
        : 5;
      // Explicitly do NOT copy gitAuthToken even if present
    }

    writePeSettings(merged);
    return { success: true };
  } catch (error) {
    console.error('Error importing policy-engine settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
