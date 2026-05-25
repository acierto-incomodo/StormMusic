const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store'); // 📦 Importamos electron-store

// Inicializamos el almacenamiento
const store = new Store();

let mainWindow;
let tray = null;

// --- 🌐 CONTROLADOR DEL TRAY ICON (BARRA DE TAREAS) ---
function handleTrayIcon(enabled) {
  if (enabled) {
    if (tray) return; // Si ya existe, no lo duplicamos

    // Ruta donde debe estar guardado tu icono (Recomendado: formato .png o .ico de 16x16 o 32x32)
    const iconPath = path.join(__dirname, 'src', 'icon.png'); 
    
    // Verificación de seguridad para evitar que la app crasheé si no encuentra la imagen
    if (!fs.existsSync(iconPath)) {
      console.warn("⚠️ Archivo 'src/icon.png' no encontrado. Crea un icono para que se muestre en el Tray.");
      return;
    }

    try {
      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Mostrar StormMusic', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: 'Salir por completo', click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]);

      tray.setToolTip('StormMusic ⚡');
      tray.setContextMenu(contextMenu);

      // Al hacer clic en el icono del Tray, alterna entre mostrar u ocultar la ventana
      tray.on('click', () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    } catch (error) {
      console.error("Error al inicializar el Tray Icon:", error);
    }
  } else {
    // Si se desactiva, destruimos el recurso de la memoria
    if (tray) {
      tray.destroy();
      tray = null;
    }
  }
}

function createWindow() {
  // Leemos las preferencias del usuario guardadas en electron-store
  const startWindowSetting = store.get('setting-start-window') || 'windowed';
  const trayEnabled = store.get('setting-tray-icon') || false;

  // Si está configurado para iniciar minimizado Y el Tray está activo, arranca invisible (al tray directo)
  let showInitially = true;
  if (startWindowSetting === 'minimized' && trayEnabled) {
    showInitially = false;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false, // Lo inicializamos en false para evitar parpadeos visuales
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  autoUpdater.autoDownload = false;

  // Gestión inteligente del arranque de la ventana
  mainWindow.once('ready-to-show', () => {
    if (startWindowSetting === 'maximized') {
      mainWindow.maximize();
      mainWindow.show();
    } else if (startWindowSetting === 'minimized') {
      if (trayEnabled) {
        mainWindow.hide(); // Se queda oculto directamente en el Tray
      } else {
        mainWindow.minimize();
        mainWindow.show();
      }
    } else {
      mainWindow.show(); // Ventana normal por defecto (windowed)
    }
  });

  // Interceptamos el evento de cierre de ventana (cuando pulsas tu botón personalizado X)
  mainWindow.on('close', (e) => {
    const closeToTray = store.get('setting-close-to-tray') || false;
    const trayEnabledCurrent = store.get('setting-tray-icon') || false;

    // Si está configurado "Cerrar al tray" y el tray está activo, ocultamos la ventana en lugar de destruirla
    if (closeToTray && trayEnabledCurrent && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // Encender el Tray Icon si estaba activo la última vez que se usó la app
  const trayEnabled = store.get('setting-tray-icon') || false;
  handleTrayIcon(trayEnabled);

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

  // 🔄 REACCIÓN EN TIEMPO REAL: Si desde el frontend activas/desactivas el Tray, muta al instante
  if (key === 'setting-tray-icon') {
    handleTrayIcon(value);
  }
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