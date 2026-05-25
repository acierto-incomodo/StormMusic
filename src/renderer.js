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

// Audio HTML5 Engine
const audio = new Audio();

// --- DOM ELEMENTS ---
const sourcesList = document.getElementById('sources-list');
const tracksBody = document.getElementById('tracks-body');
const sourceTitle = document.getElementById('source-title');
const formSource = document.getElementById('form-source');

// Vistas
const views = {
  tracks: document.getElementById('view-tracks'),
  addSource: document.getElementById('view-add-source'),
  settings: document.getElementById('view-settings')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadSources();
  switchView('tracks');
  selectSource(DEFAULT_SOURCE.id);
  initPlayerEvents();
  initUpdaterEvents();
});

// --- ROUTING / SYSTEM VIEWS ---
function switchView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === viewName) views[key].classList.remove('hidden');
    else views[key].classList.add('hidden');
  });
}

document.getElementById('btn-view-add-source').addEventListener('click', () => switchView('addSource'));
document.getElementById('btn-view-settings').addEventListener('click', () => switchView('settings'));

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

async function selectSource(id) {
  currentSource = sources.find(s => s.id === id);
  renderSidebarSources();
  sourceTitle.textContent = currentSource.title;
  tracksBody.innerHTML = '<tr><td colspan="2">Cargando catálogo de canciones...</td></tr>';

  try {
    // Peticiones en paralelo de ambos mapeos
    const [resFiles, resDirectory] = await Promise.all([
      fetch(currentSource.filesUrl).then(r => r.json()),
      fetch(currentSource.directoryUrl).then(r => r.json())
    ]);

    currentPlaylist = mergeMusicSourceData(resFiles, resDirectory);
    renderTracks(currentPlaylist);
  } catch (error) {
    console.error(error);
    tracksBody.innerHTML = '<tr><td colspan="2" style="color:var(--accent);">Error cargando los endpoints de esta fuente.</td></tr>';
  }
}

/**
 * Mapea y cruza de manera segura las llaves numéricas o índices de los dos JSONs estructurados.
 */
function mergeMusicSourceData(files, directory) {
  const merged = [];
  
  // Soporta estructuras complejas si vienen encapsuladas en un nodo raíz o son objetos puros directos
  const filesObj = files.files || files;
  const dirObj = directory.directory || directory;

  Object.keys(filesObj).forEach(key => {
    if (dirObj[key]) {
      merged.push({
        id: key,
        title: filesObj[key],
        url: dirObj[key]
      });
    }
  });
  return merged.sort((a, b) => parseInt(a.id) - parseInt(b.id));
}

function renderTracks(playlist) {
  tracksBody.innerHTML = '';
  if (playlist.length === 0) {
    tracksBody.innerHTML = '<tr><td colspan="2">No se encontraron indexaciones de canciones válidas.</td></tr>';
    return;
  }

  playlist.forEach((track, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width: 50px; color: var(--text-secondary);">${track.id}</td>
      <td>${track.title}</td>
    `;
    tr.addEventListener('click', () => {
      playTrack(index);
    });
    tracksBody.appendChild(tr);
  });
}

// --- CONTROLES DE REPRODUCCIÓN ---
function playTrack(index) {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentIndex = index;
  const track = currentPlaylist[currentIndex];

  document.getElementById('player-track-title').textContent = track.title;
  document.getElementById('player-track-source').textContent = currentSource.title;

  audio.src = track.url;
  audio.play();
  document.getElementById('btn-play').textContent = '⏸';
}

function initPlayerEvents() {
  const btnPlay = document.getElementById('btn-play');
  const progressBar = document.getElementById('progress-bar');
  const volumeBar = document.getElementById('volume-bar');

  btnPlay.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) {
      audio.play();
      btnPlay.textContent = '⏸';
    } else {
      audio.pause();
      btnPlay.textContent = '▶';
    }
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentIndex < currentPlaylist.length - 1) playTrack(currentIndex + 1);
  });

  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentIndex > 0) playTrack(currentIndex - 1);
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      const percentage = (audio.currentTime / audio.duration) * 100;
      progressBar.value = percentage;
      document.getElementById('time-current').textContent = formatTime(audio.currentTime);
      document.getElementById('time-total').textContent = formatTime(audio.duration);
    }
  });

  progressBar.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (progressBar.value / 100) * audio.duration;
    }
  });

  volumeBar.addEventListener('input', () => {
    audio.volume = volumeBar.value / 100;
  });
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// --- FORMULARIO NUEVA FUENTE ---
formSource.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('input-title').value;
  const filesUrl = document.getElementById('input-files').value;
  const directoryUrl = document.getElementById('input-directory').value;

  const newSource = {
    id: 'custom-' + Date.now(),
    title,
    filesUrl,
    directoryUrl,
    isDefault: false
  };

  // Obtener almacenamiento existente
  const localData = localStorage.getItem('storm_sources');
  const currentLocal = localData ? JSON.parse(localData) : [];
  currentLocal.push(newSource);
  localStorage.setItem('storm_sources', JSON.stringify(currentLocal));

  formSource.reset();
  loadSources();
  switchView('tracks');
  selectSource(newSource.id);
});

// --- MODO OSCURO / CLARO ---
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

// --- SECCIÓN ACTUALIZADOR (IPC UPDATER) ---
function initUpdaterEvents() {
  const btnCheck = document.getElementById('btn-check-update');
  const statusText = document.getElementById('updater-status');
  const actionsContainer = document.getElementById('updater-actions');

  btnCheck.addEventListener('click', () => {
    window.electronAPI.checkUpdate();
  });

  window.electronAPI.onUpdaterMessage((status, data) => {
    switch (status) {
      case 'checking':
        statusText.textContent = 'Estado: Buscando actualizaciones en el servidor...';
        break;
      case 'available':
        statusText.textContent = `Estado: ¡Nueva versión disponible! (v${data})`;
        actionsContainer.innerHTML = `<button id="btn-download-update" class="apple-btn-primary">Descargar Actualización</button>`;
        document.getElementById('btn-download-update').addEventListener('click', () => {
          window.electronAPI.downloadUpdate();
        });
        break;
      case 'not-available':
        statusText.textContent = 'Estado: Ya estás ejecutando la última versión estable.';
        break;
      case 'downloading':
        statusText.textContent = `Estado: Descargando actualización... (${data}%)`;
        break;
      case 'downloaded':
        statusText.textContent = 'Estado: Descarga completada. Listo para aplicar.';
        actionsContainer.innerHTML = `<button id="btn-install-update" class="apple-btn-primary">Reiniciar y Actualizar</button>`;
        document.getElementById('btn-install-update').addEventListener('click', () => {
          window.electronAPI.installUpdate();
        });
        break;
      case 'error':
        statusText.textContent = `Estado: Error en el update o falta configurar el repositorio remoto.`;
        console.error(data);
        break;
    }
  });
}