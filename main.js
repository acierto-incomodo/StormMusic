const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store'); // 📦 Importamos electron-store

// Inicializamos el almacenamiento
const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  autoUpdater.autoDownload = false;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- 📦 MANEJADORES DE ALMACENAMIENTO (ELECTRON-STORE) ---
ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.on('store-set', (event, key, value) => {
  store.set(key, value);
});

// --- CONTROLES NATIVOS DE VENTANA ---
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// --- Lógica de Actualizaciones ---
ipcMain.on('check-update', () => { autoUpdater.checkForUpdates(); });
ipcMain.on('download-update', () => { autoUpdater.downloadUpdate(); });
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });

autoUpdater.on('checking-for-update', () => { mainWindow.webContents.send('updater-message', 'checking'); });
autoUpdater.on('update-available', (info) => { mainWindow.webContents.send('updater-message', 'available', info.version); });
autoUpdater.on('update-not-available', () => { mainWindow.webContents.send('updater-message', 'not-available'); });
autoUpdater.on('error', (err) => { mainWindow.webContents.send('updater-message', 'error', err.message); });
autoUpdater.on('download-progress', (progressObj) => { mainWindow.webContents.send('updater-message', 'downloading', Math.round(progressObj.percent)); });
autoUpdater.on('update-downloaded', () => { mainWindow.webContents.send('updater-message', 'downloaded'); });