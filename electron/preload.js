const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  showSaveDialog: (defaultName) => ipcRenderer.invoke('save-dialog', defaultName)
});
