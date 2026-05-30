const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');

// Detectores de runtime para Linux
let isFlatpak = false;
let distroId = null;
let hasPacman = false;
try {
  isFlatpak = !!process.env.FLATPAK_SANDBOX_DIR || !!process.env.FLATPAK_INSTANCE_DIR || !!process.env.FLATPAK_ID;
} catch (e) {
  isFlatpak = false;
}
try {
  const osr = fs.readFileSync('/etc/os-release', 'utf8');
  const m = osr.match(/^ID=(.+)$/m);
  distroId = m ? m[1].replace(/"/g, '') : null;
} catch (e) {
  distroId = null;
}
try { hasPacman = fs.existsSync('/usr/bin/pacman'); } catch (e) { hasPacman = false; }

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
  onUpdaterMessage: (callback) => ipcRenderer.on('updater-message', (event, status, data) => callback(status, data)),

  // Info de runtime útil para decidir comportamiento en Linux
  runtimeInfo: {
    isFlatpak,
    distroId,
    hasPacman
  }
});