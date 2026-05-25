// --- CONFIGURACIÓN DE FUENTES ---
const DEFAULT_SOURCE = {
  id: 'default-myjoncraft',
  title: 'MyJonCraft SGS',
  filesUrl: 'https://acierto-incomodo.github.io/myjoncraft-sgs-music/music-files.json',
  directoryUrl: 'https://acierto-incomodo.github.io/myjoncraft-sgs-music/music-directory.json',
  isDefault: true
};

let sources = [];
let currentSource = null;
let currentPlaylist = [];
let currentIndex = -1;
let editingSourceId = null; // 🛠️ Flag para saber si editamos o guardamos nuevo
let lastSavedSecond = -1;   // Control de guardado inteligente de tiempo

const audio = new Audio();

// --- DOM ELEMENTS ---
const sourcesList = document.getElementById('sources-list');
const tracksBody = document.getElementById('tracks-body');
const sourceTitle = document.getElementById('source-title');
const formSource = document.getElementById('form-source');
const cardsContainer = document.getElementById('sources-cards-container');
const formViewTitle = document.getElementById('form-view-title');

const SVG_PLAY = `<svg id="svg-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const SVG_PAUSE = `<svg id="svg-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

const views = {
  tracks: document.getElementById('view-tracks'),
  manageSources: document.getElementById('view-manage-sources'),
  sourceForm: document.getElementById('view-source-form'),
  settings: document.getElementById('view-settings')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  initNativeWindowControls(); // 🛠️ Inicializar botones de Windows
  loadSources();
  switchView('tracks');
  initPlayerEvents();
  initUpdaterEvents();
  initNavigation();
  
  // ⚙️ Inicializar y cargar los nuevos ajustes del sistema
  await initSettings();
  
  // 📦 Restaurar todo el estado guardado de reproducción
  await restorePlayerState();
});

// --- ⚙️ MOTOR DE AJUSTES (STORMMUSIC) ---
async function initSettings() {
  const settingResumeMusic = document.getElementById('setting-resume-music');
  const settingTrayIcon = document.getElementById('setting-tray-icon');
  const settingCloseToTray = document.getElementById('setting-close-to-tray');
  const settingShowNotifications = document.getElementById('setting-show-notifications');
  const settingStartWindow = document.getElementById('setting-start-window');
  const optStartMinimized = document.getElementById('opt-start-minimized');

  // 1. Recuperar valores guardados de electron-store (valores por defecto si no existen)
  const resumeMusic = await window.electronAPI.storeGet('setting-resume-music') || false;
  const trayIcon = await window.electronAPI.storeGet('setting-tray-icon') || false;
  const closeToTray = await window.electronAPI.storeGet('setting-close-to-tray') || false;
  const showNotifications = await window.electronAPI.storeGet('setting-show-notifications') || false;
  const startWindow = await window.electronAPI.storeGet('setting-start-window') || 'windowed';

  // 2. Asignar estados a los elementos visuales del HTML
  settingResumeMusic.checked = resumeMusic;
  settingTrayIcon.checked = trayIcon;
  settingCloseToTray.checked = closeToTray;
  settingShowNotifications.checked = showNotifications;
  settingStartWindow.value = startWindow;

  // 3. Aplicar restricciones de dependencias iniciales (Requieren Tray Icon)
  settingCloseToTray.disabled = !trayIcon;
  optStartMinimized.disabled = !trayIcon;

  // 4. Escuchadores de eventos para guardar cambios al hacer click/cambiar
  settingResumeMusic.addEventListener('change', (e) => {
    window.electronAPI.storeSet('setting-resume-music', e.target.checked);
  });

  settingTrayIcon.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    window.electronAPI.storeSet('setting-tray-icon', isEnabled);

    // Habilitar o deshabilitar sub-ajustes dependientes
    settingCloseToTray.disabled = !isEnabled;
    optStartMinimized.disabled = !isEnabled;

    // Regla: Si se desactiva el tray icon, reseteamos las funciones dependientes obligatoriamente
    if (!isEnabled) {
      settingCloseToTray.checked = false;
      window.electronAPI.storeSet('setting-close-to-tray', false);
      
      if (settingStartWindow.value === 'minimized') {
        settingStartWindow.value = 'windowed';
        window.electronAPI.storeSet('setting-start-window', 'windowed');
      }
    }
  });

  settingCloseToTray.addEventListener('change', (e) => {
    window.electronAPI.storeSet('setting-close-to-tray', e.target.checked);
  });

  settingShowNotifications.addEventListener('change', (e) => {
    window.electronAPI.storeSet('setting-show-notifications', e.target.checked);
  });

  settingStartWindow.addEventListener('change', (e) => {
    window.electronAPI.storeSet('setting-start-window', e.target.value);
  });
}

// --- 📦 RESTAURAR ESTADO PERSISTENTE ---
async function restorePlayerState() {
  const savedVolume = await window.electronAPI.storeGet('volume');
  const savedSourceId = await window.electronAPI.storeGet('lastSourceId');
  const savedTrackIndex = await window.electronAPI.storeGet('lastTrackIndex');
  const savedPosition = await window.electronAPI.storeGet('lastPosition');

  // 1. Restaurar Volumen
  if (savedVolume !== undefined && savedVolume !== null) {
    audio.volume = savedVolume;
    document.getElementById('volume-bar').value = savedVolume * 100;
  } else {
    audio.volume = 0.8;
    document.getElementById('volume-bar').value = 80;
  }

  // 2. Restaurar última fuente seleccionada
  const sourceIdToLoad = savedSourceId || DEFAULT_SOURCE.id;
  await selectSource(sourceIdToLoad); 

  // 3. Restaurar última canción y evaluar si se reanuda la reproducción
  if (savedTrackIndex !== undefined && savedTrackIndex !== null && currentPlaylist[savedTrackIndex]) {
    currentIndex = savedTrackIndex;
    const track = currentPlaylist[currentIndex];

    document.getElementById('player-track-title').textContent = track.title;
    document.getElementById('player-track-source').textContent = currentSource.title;
    
    audio.src = track.url;
    
    // Consultar el estado del ajuste de reanudación
    const shouldResume = document.getElementById('setting-resume-music').checked;

    // Esperamos a que carguen los metadatos del archivo para poder posicionar la línea de tiempo
    audio.addEventListener('loadedmetadata', function onMetadata() {
      if (savedPosition && savedPosition < audio.duration) {
        audio.currentTime = savedPosition;
        
        // Actualizar barras e indicadores visuales
        const progressBar = document.getElementById('progress-bar');
        progressBar.value = (audio.currentTime / audio.duration) * 100;
        document.getElementById('time-current').textContent = formatTime(audio.currentTime);
        document.getElementById('time-total').textContent = formatTime(audio.duration);
      }
      
      // Si el ajuste está activado, arranca la música automáticamente
      if (shouldResume) {
        audio.play().catch(err => console.log("Autoplay bloqueado o sin interacción previa:", err));
        document.getElementById('btn-play').innerHTML = SVG_PAUSE;
      }
      
      audio.removeEventListener('loadedmetadata', onMetadata);
    });
  }
}

// --- 🛠️ BOTONES WINDOWS NATIVOS ---
function initNativeWindowControls() {
  document.getElementById('win-min').addEventListener('click', () => window.electronAPI.windowMinimize());
  document.getElementById('win-max').addEventListener('click', () => window.electronAPI.windowMaximize());
  document.getElementById('win-close').addEventListener('click', () => window.electronAPI.windowClose());
}

// --- ROUTING Y NAVEGACIÓN ---
function switchView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === viewName) views[key].classList.remove('hidden');
    else views[key].classList.add('hidden');
  });
}

function initNavigation() {
  document.getElementById('btn-view-manage-sources').addEventListener('click', () => {
    renderManagementCards();
    switchView('manageSources');
  });
  
  document.getElementById('btn-view-settings').addEventListener('click', () => switchView('settings'));
  
  document.getElementById('btn-trigger-add').addEventListener('click', () => {
    editingSourceId = null;
    formViewTitle.textContent = "Añadir Nueva Fuente";
    formSource.reset();
    switchView('sourceForm');
  });

  document.getElementById('btn-form-cancel').addEventListener('click', () => {
    switchView('manageSources');
  });
}

// --- LOGICA DE FUENTES ---
function loadSources() {
  const localData = localStorage.getItem('storm_sources');
  if (localData) {
    sources = [DEFAULT_SOURCE, ...JSON.parse(localData)];
  } else {
    sources = [DEFAULT_SOURCE];
  }
  renderSidebarSources();
}

function renderSidebarSources() {
  sourcesList.innerHTML = '';
  sources.forEach(src => {
    const li = document.createElement('li');
    li.textContent = `🎵 ${src.title}`;
    li.dataset.id = src.id;
    if (currentSource && currentSource.id === src.id) li.classList.add('active');
    
    li.addEventListener('click', () => {
      switchView('tracks');
      selectSource(src.id);
    });
    sourcesList.appendChild(li);
  });
}

// 🛠️ PANTALLA GESTIÓN DE FUENTES (TARJETAS)
function renderManagementCards() {
  cardsContainer.innerHTML = '';
  sources.forEach(src => {
    const card = document.createElement('div');
    card.className = 'source-card';
    
    // Bloquear botones si es la fuente por defecto
    const isDisabled = src.isDefault ? 'disabled' : '';

    card.innerHTML = `
      <div class="source-card-info">
        <h2>${src.title} ${src.isDefault ? '<span style="font-size:11px; opacity:0.5;">(Sistema)</span>' : ''}</h2>
        <p><strong>Music Files:</strong> ${src.filesUrl}</p>
        <p><strong>Music Directory:</strong> ${src.directoryUrl}</p>
      </div>
      <div class="source-card-actions">
        <button class="apple-btn small-btn edit-card-btn" data-id="${src.id}" ${isDisabled}>✏️ Editar</button>
        <button class="apple-btn small-btn delete-card-btn" data-id="${src.id}" style="color:var(--accent);" ${isDisabled}>🗑️ Eliminar</button>
      </div>
    `;
    cardsContainer.appendChild(card);
  });

  // Eventos de las tarjetas
  document.querySelectorAll('.edit-card-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      openEditForm(id);
    });
  });

  document.querySelectorAll('.delete-card-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      deleteSource(id);
    });
  });
}

function openEditForm(id) {
  const src = sources.find(s => s.id === id);
  if (!src || src.isDefault) return;

  editingSourceId = id;
  formViewTitle.textContent = `Editar Fuente: ${src.title}`;
  document.getElementById('input-title').value = src.title;
  document.getElementById('input-files').value = src.filesUrl;
  document.getElementById('input-directory').value = src.directoryUrl;
  
  switchView('sourceForm');
}

function deleteSource(id) {
  if (confirm('¿Seguro que quieres eliminar esta fuente de música?')) {
    let localSources = JSON.parse(localStorage.getItem('storm_sources') || '[]');
    localSources = localSources.filter(s => s.id !== id);
    localStorage.setItem('storm_sources', JSON.stringify(localSources));
    
    // Si la fuente borrada era la activa, volvemos a la default
    if (currentSource && currentSource.id === id) {
      currentSource = DEFAULT_SOURCE;
    }
    
    loadSources();
    renderManagementCards();
  }
}

// --- FORMULARIO GUARDAR / EDITAR FUENTE ---
formSource.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('input-title').value;
  const filesUrl = document.getElementById('input-files').value;
  const directoryUrl = document.getElementById('input-directory').value;

  let localSources = JSON.parse(localStorage.getItem('storm_sources') || '[]');

  if (editingSourceId) {
    // Modo Edición
    localSources = localSources.map(s => {
      if (s.id === editingSourceId) {
        return { ...s, title, filesUrl, directoryUrl };
      }
      return s;
    });
    editingSourceId = null;
  } else {
    // Modo Nuevo
    const newSource = {
      id: 'custom-' + Date.now(),
      title,
      filesUrl,
      directoryUrl,
      isDefault: false
    };
    localSources.push(newSource);
  }

  localStorage.setItem('storm_sources', JSON.stringify(localSources));
  formSource.reset();
  loadSources();
  renderManagementCards();
  switchView('manageSources');
});

// --- TRACKS ENGINE ---
async function selectSource(id) {
  currentSource = sources.find(s => s.id === id) || DEFAULT_SOURCE;
  renderSidebarSources();
  sourceTitle.textContent = currentSource.title;
  tracksBody.innerHTML = '<tr><td colspan="2">Cargando canciones...</td></tr>';

  try {
    const [resFiles, resDirectory] = await Promise.all([
      fetch(currentSource.filesUrl).then(r => r.json()),
      fetch(currentSource.directoryUrl).then(r => r.json())
    ]);
    currentPlaylist = mergeMusicSourceData(resFiles, resDirectory);
    renderTracks(currentPlaylist);
  } catch (error) {
    tracksBody.innerHTML = '<tr><td colspan="2" style="color:var(--accent);">Error cargando las URLs de esta fuente.</td></tr>';
  }
}

function mergeMusicSourceData(files, directory) {
  const merged = [];
  const filesObj = files.files || files;
  const dirObj = directory.directory || directory;

  Object.keys(filesObj).forEach(key => {
    if (dirObj[key]) {
      merged.push({ id: key, title: filesObj[key], url: dirObj[key] });
    }
  });
  return merged.sort((a, b) => parseInt(a.id) - parseInt(b.id));
}

function renderTracks(playlist) {
  tracksBody.innerHTML = '';
  if (playlist.length === 0) {
    tracksBody.innerHTML = '<tr><td colspan="2">No hay canciones mapeadas.</td></tr>';
    return;
  }
  playlist.forEach((track, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="width:50px; color:var(--text-secondary);">${track.id}</td><td>${track.title}</td>`;
    tr.addEventListener('click', () => playTrack(index));
    tracksBody.appendChild(tr);
  });
}

// --- PLAYER AUDIO EVENTS ---
function playTrack(index) {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentIndex = index;
  const track = currentPlaylist[currentIndex];

  document.getElementById('player-track-title').textContent = track.title;
  document.getElementById('player-track-source').textContent = currentSource.title;

  audio.src = track.url;
  audio.play();
  document.getElementById('btn-play').innerHTML = SVG_PAUSE;

  // 📦 Persistir canción y lista actual de manera permanente
  window.electronAPI.storeSet('lastSourceId', currentSource.id);
  window.electronAPI.storeSet('lastTrackIndex', currentIndex);

  // 🔔 NOTIFICACIÓN DE ESCRITORIO (Si está activa)
  const notifyCheckbox = document.getElementById('setting-show-notifications');
  if (notifyCheckbox && notifyCheckbox.checked) {
    if (Notification.permission === 'granted') {
      new Notification('StormMusic ⚡', { body: `Sonando: ${track.title}`, silent: true });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('StormMusic ⚡', { body: `Sonando: ${track.title}`, silent: true });
        }
      });
    }
  }
}

function initPlayerEvents() {
  const btnPlay = document.getElementById('btn-play');
  const progressBar = document.getElementById('progress-bar');
  const volumeBar = document.getElementById('volume-bar');

  btnPlay.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) {
      audio.play();
      btnPlay.innerHTML = SVG_PAUSE;
    } else {
      audio.pause();
      btnPlay.innerHTML = SVG_PLAY;
      // 📦 Guardar inmediatamente al pausar la línea de reproducción
      window.electronAPI.storeSet('lastPosition', audio.currentTime);
    }
  });

  // Salto automático al terminar una canción de manera natural
  audio.addEventListener('ended', () => {
    window.electronAPI.storeSet('lastPosition', 0); // Resetear posición
    if (currentIndex < currentPlaylist.length - 1) {
      playTrack(currentIndex + 1);
    } else {
      btnPlay.innerHTML = SVG_PLAY;
      progressBar.value = 0;
      document.getElementById('time-current').textContent = '0:00';
    }
  });

  document.getElementById('btn-next').addEventListener('click', () => { if (currentIndex < currentPlaylist.length - 1) playTrack(currentIndex + 1); });
  document.getElementById('btn-prev').addEventListener('click', () => { if (currentIndex > 0) playTrack(currentIndex - 1); });

  // Evento de actualización horaria continua
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      progressBar.value = (audio.currentTime / audio.duration) * 100;
      document.getElementById('time-current').textContent = formatTime(audio.currentTime);
      document.getElementById('time-total').textContent = formatTime(audio.duration);

      // 📦 Guardado inteligente cada 3 segundos en segundo plano sin asfixiar el disco I/O
      const currentSecond = Math.floor(audio.currentTime);
      if (currentSecond !== lastSavedSecond && currentSecond % 3 === 0) {
        lastSavedSecond = currentSecond;
        window.electronAPI.storeSet('lastPosition', audio.currentTime);
      }
    }
  });
  
  progressBar.addEventListener('input', () => { 
    if (audio.duration) {
      audio.currentTime = (progressBar.value / 100) * audio.duration;
      window.electronAPI.storeSet('lastPosition', audio.currentTime);
    }
  });

  volumeBar.addEventListener('input', () => { 
    audio.volume = volumeBar.value / 100;
    // 📦 Guardar volumen seleccionado
    window.electronAPI.storeSet('volume', audio.volume);
  });
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// --- THEME SWITCHER ---
const btnTheme = document.getElementById('btn-toggle-theme');
btnTheme.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'light');
    btnTheme.textContent = 'Cambiar a Modo Oscuro';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    btnTheme.textContent = 'Cambiar a Modo Claro';
  }
});

// --- UPDATER ---
function initUpdaterEvents() {
  const btnCheck = document.getElementById('btn-check-update');
  const statusText = document.getElementById('updater-status');
  const actionsContainer = document.getElementById('updater-actions');

  btnCheck.addEventListener('click', () => window.electronAPI.checkUpdate());

  window.electronAPI.onUpdaterMessage((status, data) => {
    switch (status) {
      case 'checking': statusText.textContent = 'Estado: Buscando actualizaciones...'; break;
      case 'available':
        statusText.textContent = `Estado: ¡Nueva versión v${data} disponible!`;
        actionsContainer.innerHTML = `<button id="btn-download-update" class="apple-btn-primary">Descargar Actualización</button>`;
        document.getElementById('btn-download-update').addEventListener('click', () => window.electronAPI.downloadUpdate());
        break;
      case 'not-available': statusText.textContent = 'Estado: Tienes la última versión instalada.'; break;
      case 'downloading': statusText.textContent = `Estado: Descargando... (${data}%)`; break;
      case 'downloaded':
        statusText.textContent = 'Estado: Descargada completa.';
        actionsContainer.innerHTML = `<button id="btn-install-update" class="apple-btn-primary">Reiniciar y Actualizar</button>`;
        document.getElementById('btn-install-update').addEventListener('click', () => window.electronAPI.installUpdate());
        break;
      case 'error': statusText.textContent = 'Estado: Error al consultar actualizaciones.'; break;
    }
  });
}