const { ipcRenderer } = require('electron');

export const pePreloader = {
  pe: {
    getSettings: () => ipcRenderer.invoke('pe:getSettings'),
    saveSettings: (payload: unknown) => ipcRenderer.invoke('pe:saveSettings', payload),
    clearSecret: (key: string) => ipcRenderer.invoke('pe:clearSecret', key),
    exportSettings: () => ipcRenderer.invoke('pe:exportSettings'),
    importSettings: (data: unknown) => ipcRenderer.invoke('pe:importSettings', data),
    factoryReset: () => ipcRenderer.invoke('pe:factoryReset'),
  }
};
