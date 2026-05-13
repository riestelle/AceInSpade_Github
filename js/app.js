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

const VIBRATION_TEST_PATTERNS = {
  single: [200],
  pulse:  [100, 50, 100],
  signal: [300, 75, 300, 75, 300],
  long:   [500, 200, 500],
  stop:   0,
};

function getVibrationFunction() {
  return navigator.vibrate || navigator.webkitVibrate || null;
}

function vibrate(patternOrKey) {
  const vibrateFn = getVibrationFunction();
  if (!vibrateFn) return;

  const scale      = vibIntensity === 'soft' ? 0.5 : vibIntensity === 'strong' ? 1.8 : 1.0;
  const timescale  = vibTiming    === 'fast' ? 0.6 : vibTiming    === 'slow'   ? 1.5 : 1.0;

  if (typeof patternOrKey === 'string') {
    const pat = ALERT_PATTERNS[vibIntensity]?.[patternOrKey];
    if (pat) vibrateFn(pat.map(v => Math.round(v * scale * timescale)));
  } else if (Array.isArray(patternOrKey)) {
    vibrateFn(patternOrKey.map(v => Math.round(v * scale * timescale)));
  } else {
    vibrateFn(Math.round(patternOrKey * scale * timescale));
  }
}

function vibrateDemo(patternKey) {
  const vibrateFn = getVibrationFunction();
  if (!vibrateFn) return;
  const pattern = VIBRATION_TEST_PATTERNS[patternKey];
  if (pattern === undefined) return;
  vibrateFn(pattern);
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
  if (screenId === 'family')  initFamily();
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
  renderVibDemo();
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

function renderVibDemo() {
  const supported = Boolean(getVibrationFunction());
  document.querySelectorAll('[data-vib-pattern]').forEach(btn => {
    btn.disabled = !supported;
    btn.style.opacity = supported ? '1' : '.5';
  });
  const status = document.getElementById('vib-support-status');
  if (status) {
    status.textContent = supported
      ? 'Vibration API detected — tap a pattern to preview it.'
      : 'Vibration API unsupported on this device/browser.';
  }
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

document.querySelectorAll('[data-vib-pattern]').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.vibPattern;
    vibrateDemo(key);
  });
});

window.addEventListener('online',  () => { isOnline = true;  if (currentScreen === 'home') initHome(); if (currentScreen === 'ai') renderAIStatus(); });
window.addEventListener('offline', () => { isOnline = false; if (currentScreen === 'home') initHome(); if (currentScreen === 'ai') renderAIStatus(); });

initHome();

// PWA Install Prompt Handler
let deferredPrompt = null;
let isInstalled = false;

// Check if app is already installed
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallPrompt();
});

window.addEventListener('appinstalled', () => {
  isInstalled = true;
  deferredPrompt = null;
  hideInstallPrompt();
  console.log('✓ SenyasPo installed as app');
});

function showInstallPrompt() {
  // Create install banner if it doesn't exist
  if (!document.getElementById('install-banner')) {
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.className = 'banner banner-info';
    banner.style.cssText = 'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
    banner.innerHTML = `
      <span style="flex:1;font-size:13px;">📦 Install SenyasPo as an app for quick access</span>
      <div style="display:flex;gap:8px;">
        <button id="install-btn" style="background:#feb700;color:#271900;border:none;border-radius:6px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em;">Install</button>
        <button id="dismiss-install" style="background:transparent;color:var(--text-muted);border:1px solid var(--outline-var);border-radius:6px;padding:8px 12px;font-weight:700;font-size:12px;cursor:pointer;">✕</button>
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    
    document.getElementById('install-btn').addEventListener('click', handleInstallClick);
    document.getElementById('dismiss-install').addEventListener('click', hideInstallPrompt);
  } else {
    document.getElementById('install-banner').style.display = 'flex';
  }
}

function hideInstallPrompt() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
  saveStorage('install_prompt_dismissed', true);
}

function handleInstallClick() {
  if (!deferredPrompt) return;
  
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('✓ User accepted install prompt');
    } else {
      console.log('✗ User dismissed install prompt');
    }
    deferredPrompt = null;
  });
}

// Check if install was dismissed and only show once per session
if (!loadStorage('install_prompt_dismissed', false)) {
  // Install prompt will show if beforeinstallprompt fires
}

// iOS Install Guide (since iOS doesn't support beforeinstallprompt)
function showIOSInstallGuide() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true;
  
  if (isIOS && !isStandalone && !loadStorage('ios_install_dismissed', false)) {
    const banner = document.createElement('div');
    banner.id = 'ios-install-banner';
    banner.className = 'banner banner-info';
    banner.style.cssText = 'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
    banner.innerHTML = `
      <span style="flex:1;font-size:13px;">📱 Tap Share, then "Add to Home Screen"</span>
      <button id="dismiss-ios-install" style="background:transparent;color:var(--text-muted);border:1px solid var(--outline-var);border-radius:6px;padding:8px 12px;font-weight:700;font-size:12px;cursor:pointer;">✕</button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
    
    document.getElementById('dismiss-ios-install').addEventListener('click', () => {
      banner.style.display = 'none';
      saveStorage('ios_install_dismissed', true);
    });
  }
}

// Show iOS install guide on first load
setTimeout(showIOSInstallGuide, 1000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}