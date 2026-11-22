const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miseDesktop', {
  importWebsite: request => ipcRenderer.invoke('mise:import-website', request),
});
