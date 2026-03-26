import { ipcMain } from 'electron';
import { getSecureValue, setSecureValue, deleteSecureValue } from '../authentication/config';
import { readPeSettings, writePeSettings, deletePeSettingsFile, importPeSettings } from './settings';
import { PeSettingsResult, PeSettingsPayload } from './preload-api';

const PE_ENV = 'policy-engine';

export function setupPolicyEngineHandlers(): void {
  // Guard against hot-reload double-registration
  ipcMain.removeHandler('pe:getSettings');
  ipcMain.removeHandler('pe:saveSettings');
  ipcMain.removeHandler('pe:clearSecret');
  ipcMain.removeHandler('pe:exportSettings');
  ipcMain.removeHandler('pe:importSettings');
  ipcMain.removeHandler('pe:factoryReset');

  // pe:getSettings — returns non-secret settings + stored boolean flags
  // NEVER includes decrypted patSecret or gitAuthToken values
  ipcMain.handle('pe:getSettings', async (): Promise<PeSettingsResult> => {
    const nonSecrets = readPeSettings();
    const patSecretStored = getSecureValue('pe.isc.patSecret', PE_ENV) !== '';
    const gitAuthTokenStored = getSecureValue('pe.git.authToken', PE_ENV) !== '';
    return {
      ...nonSecrets,
      patSecretStored,
      gitAuthTokenStored,
    };
  });

  // pe:saveSettings — persists non-secret settings; stores secrets only when provided
  ipcMain.handle('pe:saveSettings', async (_event, payload: PeSettingsPayload): Promise<{ success: boolean }> => {
    writePeSettings(payload.nonSecrets);
    if (typeof payload.patSecret === 'string' && payload.patSecret.length > 0) {
      setSecureValue('pe.isc.patSecret', PE_ENV, payload.patSecret);
    }
    if (typeof payload.gitAuthToken === 'string' && payload.gitAuthToken.length > 0) {
      setSecureValue('pe.git.authToken', PE_ENV, payload.gitAuthToken);
    }
    return { success: true };
  });

  // pe:clearSecret — deletes a single secret by logical key
  ipcMain.handle('pe:clearSecret', async (_event, key: 'patSecret' | 'gitAuthToken'): Promise<{ success: boolean }> => {
    const keyMap: Record<string, string> = {
      patSecret: 'pe.isc.patSecret',
      gitAuthToken: 'pe.git.authToken',
    };
    const mappedKey = keyMap[key];
    if (mappedKey) {
      deleteSecureValue(mappedKey, PE_ENV);
    }
    return { success: true };
  });

  // pe:exportSettings — returns non-secret settings only (no secrets)
  ipcMain.handle('pe:exportSettings', async () => {
    return readPeSettings();
  });

  // pe:importSettings — validates and persists imported settings (never writes secrets)
  ipcMain.handle('pe:importSettings', async (_event, data: unknown): Promise<{ success: boolean; error?: string }> => {
    return importPeSettings(data);
  });

  // pe:factoryReset — deletes all settings and secrets
  ipcMain.handle('pe:factoryReset', async (): Promise<{ success: boolean }> => {
    deletePeSettingsFile();
    deleteSecureValue('pe.isc.patSecret', PE_ENV);
    deleteSecureValue('pe.git.authToken', PE_ENV);
    return { success: true };
  });
}
