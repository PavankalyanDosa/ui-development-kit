import { Injectable } from '@angular/core';
import { PeSettingsPayload, PeSettingsResult } from '../models/pe-settings.models';

@Injectable({ providedIn: 'root' })
export class PolicyEngineIpcService {
  getSettings(): Promise<PeSettingsResult> {
    return window.electronAPI['pe']['getSettings']();
  }

  saveSettings(payload: PeSettingsPayload): Promise<{ success: boolean }> {
    return window.electronAPI['pe']['saveSettings'](payload);
  }

  clearSecret(key: 'patSecret' | 'gitAuthToken'): Promise<{ success: boolean }> {
    return window.electronAPI['pe']['clearSecret'](key);
  }

  exportSettings(): Promise<unknown> {
    return window.electronAPI['pe']['exportSettings']();
  }

  importSettings(data: unknown): Promise<{ success: boolean; error?: string }> {
    return window.electronAPI['pe']['importSettings'](data);
  }

  factoryReset(): Promise<{ success: boolean }> {
    return window.electronAPI['pe']['factoryReset']();
  }
}
