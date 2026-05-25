const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Almacenamiento persistente
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, val) => ipcRenderer.send('store-set', key, val),

  // Controles de ventana
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  
  // Actualizador
  checkUpdate: () => ipcRenderer.send('check-update'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdaterMessage: (callback) => ipcRenderer.on('updater-message', (event, status, data) => callback(status, data))
});