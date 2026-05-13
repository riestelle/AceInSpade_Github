//  SHARED UTILS / NAVIGATION / HOME / DEAF / ROUTE / ALERT / VIB

let currentScreen = 'home';
let isOnline = navigator.onLine;

let selectedRouteId = ROUTES[0].id;
let routeSearchQuery = '';

let alertWakeLock   = null;
let alertInterval   = null;
let alertStopName   = '';

let deafLang    = 'fil';
let deafStop    = '';

let vibIntensity = 'medium';
let vibTiming    = 'normal';

function loadStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function saveStorage(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function vibrate(patternOrKey) {
  if (!navigator.vibrate) return;
  const scale      = vibIntensity === 'soft' ? 0.5 : vibIntensity === 'strong' ? 1.8 : 1.0;
  const timescale  = vibTiming    === 'fast' ? 0.6 : vibTiming    === 'slow'   ? 1.5 : 1.0;
  if (typeof patternOrKey === 'string') {
    const pat = ALERT_PATTERNS[vibIntensity]?.[patternOrKey];
    if (pat) navigator.vibrate(pat);
  } else if (Array.isArray(patternOrKey)) {
    navigator.vibrate(patternOrKey.map(v => Math.round(v * scale * timescale)));
  } else {
    navigator.vibrate(Math.round(patternOrKey * scale * timescale));
  }
}

function calcFare(distKm, type) {
  const m = FARE_MATRIX[type];
  if (distKm <= m.baseKm) return m.base;
  return m.base + Math.ceil(distKm - m.baseKm) * m.perKm;
}

function getDistKm(route, a, b) {
  const stops = route.stops;
  return Math.abs(stops[a].km - stops[b].km);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getRouteShortCode(routeId) {
  return (ROUTES.find(r => r.id === routeId) || {}).shortCode || routeId;
}

function navigate(screenId, params = {}) {
  vibrate(30);
  if (currentScreen === 'alert') cleanupAlert();
  if (currentScreen === 'gps' && screenId !== 'gps' && typeof cleanupGPS === 'function') {
    cleanupGPS();
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; gpsAlertActive = false;
    }
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screenId);
  if (!el) return;
  el.classList.add('active');
  currentScreen = screenId;

  if (screenId === 'home')    initHome();
  if (screenId === 'deaf')    initDeaf();
  if (screenId === 'phrases') initPhrases();
  if (screenId === 'fare')    initFare();
  if (screenId === 'route')   initRoute();
  if (screenId === 'gps')     initGPS();
  if (screenId === 'alert')   initAlert(params.stopName || '');
  if (screenId === 'ai')      initAI();
  if (screenId === 'vib')     initVib();
  if (screenId === 'fsl')     {}
}

function initHome() {
  const aiCard = document.getElementById('ai-card');
  const banner = document.getElementById('offline-banner');
  if (!isOnline) {
    banner.classList.remove('d-none');
    aiCard.disabled = true;
    aiCard.style.opacity = '.45';
  } else {
    banner.classList.add('d-none');
    aiCard.disabled = false;
    aiCard.style.opacity = '1';
  }
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', function() {
    const target = this.getAttribute('data-nav');
    if (!this.disabled) navigate(target);
  });
});
document.getElementById('home-vib-btn').addEventListener('click', () => navigate('vib'));

const deafMessages = {
  fil: {
    main:        'BINGI AKO.\nHINDI AKO MAKARINIG.',
    instruction: 'Pakitapik ang aking balikat\npara makuha ang aking atensyon.',
    stopLabel:   'BABABA AKO SA:',
    tapLabel:    'PINDUTIN PARA I-EDIT',
  },
  en: {
    main:        'I AM DEAF.\nI CANNOT HEAR.',
    instruction: 'Please tap my shoulder\nto get my attention.',
    stopLabel:   'I AM GETTING OFF AT:',
    tapLabel:    'TAP TO EDIT STOP',
  },
};

function initDeaf() {
  renderDeaf();
  document.getElementById('lang-btn').textContent = deafLang === 'fil' ? 'FIL → EN' : 'EN → FIL';
}

function renderDeaf() {
  const msg = deafMessages[deafLang];
  document.getElementById('deaf-main-msg').textContent  = msg.main;
  document.getElementById('deaf-instruction').textContent = msg.instruction;
  document.getElementById('deaf-stop-label').innerHTML =
    `<span class="material-symbols-outlined" style="font-size:16px">location_on</span>${msg.stopLabel}`;

  const txt = document.getElementById('deaf-stop-text');
  if (deafStop) {
    txt.textContent = deafStop;
    txt.style.fontSize = '36px';
    txt.style.color = 'var(--amber)';
  } else {
    txt.textContent = '— TAP TO SET STOP —';
    txt.style.fontSize = '22px';
    txt.style.color = '#444';
  }
}

document.getElementById('lang-btn').addEventListener('click', () => {
  deafLang = deafLang === 'fil' ? 'en' : 'fil';
  saveStorage('deaf_lang', deafLang);
  document.getElementById('lang-btn').textContent = deafLang === 'fil' ? 'FIL → EN' : 'EN → FIL';
  renderDeaf();
  vibrate(30);
});

document.getElementById('fsl-btn').addEventListener('click', () => navigate('fsl'));

document.getElementById('deaf-stop-display').addEventListener('click', () => {
  const input = document.getElementById('deaf-stop-input');
  const display = document.getElementById('deaf-stop-display');
  input.value = deafStop;
  input.classList.remove('d-none');
  display.classList.add('d-none');
  input.focus();
});

document.getElementById('deaf-stop-input').addEventListener('blur', saveDeafStop);
document.getElementById('deaf-stop-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveDeafStop(); });

function saveDeafStop() {
  const input   = document.getElementById('deaf-stop-input');
  const display = document.getElementById('deaf-stop-display');
  deafStop = input.value.trim().toUpperCase();
  saveStorage('deaf_stop', deafStop);
  input.classList.add('d-none');
  display.classList.remove('d-none');
  renderDeaf();
  vibrate(50);
}

function initRoute() {
  routeSearchQuery = '';
  document.getElementById('route-search').value = '';
  renderRouteList();
  renderRouteDetail();
}

function renderRouteList() {
  const q = routeSearchQuery.toLowerCase();
  const filtered = q.length > 0
    ? ROUTES.filter(r => r.code.toLowerCase().includes(q) || r.stops.some(s => s.name.toLowerCase().includes(q)))
    : ROUTES;

  const list = document.getElementById('route-list');
  list.innerHTML = filtered.map(r =>
    `<button class="route-btn${r.id === selectedRouteId ? ' active' : ''}" onclick="selectRoute('${r.id}')">${r.shortCode}</button>`
  ).join('');
}

function renderRouteDetail() {
  const route = ROUTES.find(r => r.id === selectedRouteId);
  document.getElementById('windshield-text').textContent = route.code;
  const stopList = document.getElementById('stop-list');
  stopList.innerHTML = route.stops.map(s => `
    <div class="d-flex gap-3">
      <div class="stop-dot mt-1"></div>
      <div>
        <p style="font-size:16px;font-weight:800;color:white;text-transform:uppercase">${s.name}</p>
        <p style="font-size:14px;color:var(--text-var);margin-top:2px">${s.note}</p>
        <p style="font-size:12px;color:var(--outline);margin-top:2px">${s.km} km from start</p>
      </div>
    </div>`).join('');
}

function selectRoute(id) {
  selectedRouteId = id;
  vibrate(30);
  renderRouteList();
  renderRouteDetail();
}

document.getElementById('route-search').addEventListener('input', function() {
  routeSearchQuery = this.value;
  renderRouteList();
});

function initAlert(stopName) {
  alertStopName = stopName;
  document.getElementById('alert-stop-name').textContent = stopName || 'YOUR STOP';
  vibrate('signal');
  alertInterval = setInterval(() => vibrate('signal'), 3000);

  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(wl => { alertWakeLock = wl; }).catch(() => {});
  }
}

function cleanupAlert() {
  clearInterval(alertInterval);
  alertInterval = null;
  if (alertWakeLock) { alertWakeLock.release().catch(() => {}); alertWakeLock = null; }
  const alertEl = document.getElementById('screen-alert');
  if (alertEl) alertEl.classList.remove('active');
}

document.getElementById('alert-dismiss').addEventListener('click', () => {
  cleanupAlert();
  vibrate(100);
  navigate('home');
});

function initVib() {
  vibIntensity = loadStorage('vib_intensity', 'medium');
  vibTiming    = loadStorage('vib_timing', 'normal');
  renderVibOptions();
}

function renderVibOptions() {
  document.querySelectorAll('#intensity-options .vib-option').forEach(btn => {
    const active = btn.dataset.intensity === vibIntensity;
    btn.classList.toggle('active', active);
    btn.querySelector('p').style.color = active ? 'var(--amber)' : 'var(--text)';
  });
  document.querySelectorAll('#timing-options .vib-option').forEach(btn => {
    const active = btn.dataset.timing === vibTiming;
    btn.classList.toggle('active', active);
    btn.querySelector('p').style.color = active ? 'var(--amber)' : 'var(--text)';
  });
}

document.querySelectorAll('#intensity-options .vib-option').forEach(btn => {
  btn.addEventListener('click', () => {
    vibIntensity = btn.dataset.intensity;
    saveStorage('vib_intensity', vibIntensity);
    renderVibOptions();
    vibrate('approach');
  });
});

document.querySelectorAll('#timing-options .vib-option').forEach(btn => {
  btn.addEventListener('click', () => {
    vibTiming = btn.dataset.timing;
    saveStorage('vib_timing', vibTiming);
    renderVibOptions();
    vibrate('approach');
  });
});

window.addEventListener('online',  () => { isOnline = true;  if (currentScreen === 'home') initHome(); if (currentScreen === 'ai') renderAIStatus(); });
window.addEventListener('offline', () => { isOnline = false; if (currentScreen === 'home') initHome(); if (currentScreen === 'ai') renderAIStatus(); });

initHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}