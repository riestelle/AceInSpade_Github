//  SHARED UTILS / NAVIGATION / HOME / DEAF / ROUTE / ALERT / VIB

let currentScreen = 'home';
let navHistory = [];   // stack of previous screens for back navigation
let isOnline = navigator.onLine;

let selectedRouteId = (typeof ROUTES !== 'undefined' && Array.isArray(ROUTES) && ROUTES.length > 0)
  ? ROUTES[0].id
  : null;
let routeSearchQuery = '';

let alertWakeLock   = null;
let alertInterval   = null;
let alertStopName   = '';

let deafLang    = 'fil';
let deafStop    = '';

let appLang     = 'fil';
let vibIntensity = 'medium';
let vibTiming    = 'normal';

const STORAGE_VERSION = 1;
const VALID_VIB_INTENSITIES = ['soft', 'medium', 'strong'];
const VALID_VIB_TIMINGS = ['fast', 'normal', 'slow'];
const VALID_APP_LANGS = ['fil', 'en'];
const VALID_PHRASE_LANGS = ['fil', 'en'];
const VALID_DEAF_LANGS = ['fil', 'en'];
const APP_CACHE_PREFIX = 'senyaspo-';

function getAppStorageKeys() {
  return [
    'app_storage_version',
    'vib_intensity',
    'vib_timing',
    'app_lang',
    'phrase_lang',
    'custom_phrases',
    'last_fare',
    'is_pwd',
    'deaf_lang',
    'deaf_stop',
    'gps_permission_requested',
    'gps_selected_stop',
    'gps_alert_active',
    'family_watch_id',
    'family_selected_stop',
    'family_arrived_stop',
    'family_is_watching',
    'install_prompt_dismissed',
    'ios_install_dismissed',
  ];
}

async function clearWebsiteData() {
  const confirmed = confirm('Clear all SenyasPo settings, saved phrases, and offline cache?');
  if (!confirmed) return;

  try {
    getAppStorageKeys().forEach(key => localStorage.removeItem(key));

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith(APP_CACHE_PREFIX))
          .map(name => caches.delete(name))
      );
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    alert('SenyasPo data cleared. The page will reload now.');
    window.location.reload();
  } catch (error) {
    console.warn('Failed to clear website data:', error);
    alert('Could not clear all data. Try reloading the page and again.');
  }
}

function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function saveStorage(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function resetStaleStorage() {
  const storedVersion = loadStorage('app_storage_version', null);
  if (storedVersion === STORAGE_VERSION) return;

  getAppStorageKeys().forEach(k => localStorage.removeItem(k));
  saveStorage('app_storage_version', STORAGE_VERSION);
}

function validateStorageValue(key, value, allowed, fallback) {
  if (allowed.includes(value)) return value;
  saveStorage(key, fallback);
  return fallback;
}

function getAppLanguageLabel(lang = appLang) {
  return lang === 'en' ? 'English' : 'Filipino';
}

function applyAppLanguage(lang) {
  appLang = validateStorageValue('app_lang', lang, VALID_APP_LANGS, 'fil');
  saveStorage('app_lang', appLang);
  renderAppLanguageOptions();

  if (currentScreen === 'ai' && typeof renderAIStatus === 'function') {
    renderAIStatus();
  }
  if (currentScreen === 'ai' && typeof renderMessages === 'function') {
    initAI();
  }
}

resetStaleStorage();

appLang = validateStorageValue('app_lang', loadStorage('app_lang', 'fil'), VALID_APP_LANGS, 'fil');

const VIBRATION_TEST_PATTERNS = {
  single: [200],
  pulse:  [100, 50, 100],
  signal: [300, 75, 300, 75, 300],
  long:   [500, 200, 500],
  stop:   0,
};

// const ALERT_PATTERNS = {
//   soft: {
//     approach: [80, 60, 80],
//     near:     [120, 60, 120, 60, 120],
//     signal:   [150, 75, 150, 75, 150],
//   },
//   medium: {
//     approach: [150, 60, 150],
//     near:     [200, 75, 200, 75, 200],
//     signal:   [300, 75, 300, 75, 300],
//   },
//   strong: {
//     approach: [250, 60, 250],
//     near:     [350, 75, 350, 75, 350],
//     signal:   [500, 100, 500, 100, 500],
//   },
// };

function getVibrationFunction() {
  if (typeof navigator.vibrate === 'function') {
    return function(...args) { return navigator.vibrate.apply(navigator, args); };
  }
  if (typeof navigator.webkitVibrate === 'function') {
    return function(...args) { return navigator.webkitVibrate.apply(navigator, args); };
  }
  return null;
}

function vibrate(patternOrKey) {
  const vibrateFn = getVibrationFunction();
  if (!vibrateFn) return;

  const scale      = vibIntensity === 'soft' ? 0.5 : vibIntensity === 'strong' ? 1.8 : 1.0;
  const timescale  = vibTiming    === 'fast' ? 0.6 : vibTiming    === 'slow'   ? 1.5 : 1.0;
  const safeVibrate = (value) => {
    try {
      vibrateFn(value);
    } catch (e) {
      // Ignore vibration failures so UI still responds.
    }
  };

  if (typeof patternOrKey === 'string') {
    // Try intensity-specific pattern first, fall back to test patterns
    const pat = ALERT_PATTERNS[vibIntensity]?.[patternOrKey]
             || VIBRATION_TEST_PATTERNS[patternOrKey];
    if (pat !== undefined) {
      if (Array.isArray(pat)) {
        safeVibrate(pat.map(v => Math.round(v * scale * timescale)));
      } else { // if (pat)
        safeVibrate(Math.round(pat * scale * timescale));
      }
    }
  } else if (Array.isArray(patternOrKey)) {
    safeVibrate(patternOrKey.map(v => Math.round(v * scale * timescale)));
  } else {
    safeVibrate(Math.round(patternOrKey * scale * timescale));
  }
}

function vibrateDemo(patternKey) {
  vibrate(patternKey);
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

// Screens that should never be pushed to the back-stack
const NO_HISTORY_SCREENS = new Set(['home', 'alert']);

function goBack() {
  // Pop the history stack; fall back to home if empty
  const prev = navHistory.pop() || 'home';
  navigate(prev, {}, true /* skipHistory */);
}

function navigate(screenId, params = {}, skipHistory = false) {
  try {
    vibrate(30);
  } catch (e) {
    // Ignore vibration errors so navigation is not blocked.
  }
  if (currentScreen === 'alert') cleanupAlert();
  if (currentScreen === 'gps' && screenId !== 'gps' && typeof cleanupGPS === 'function') {
    if (!gpsAlertActive) {
      cleanupGPS();
      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; gpsAlertActive = false;
      }
    }
  }

  // Push current screen to history unless going home, or skipHistory
  if (!skipHistory && !NO_HISTORY_SCREENS.has(screenId) && currentScreen !== screenId) {
    navHistory.push(currentScreen);
  }
  // When navigating home, clear the stack
  if (screenId === 'home') navHistory = [];

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
    if (banner) banner.classList.remove('d-none');
    if (aiCard) { aiCard.disabled = true; aiCard.style.opacity = '.45'; }
  } else {
    if (banner) banner.classList.add('d-none');
    if (aiCard) { aiCard.disabled = false; aiCard.style.opacity = '1'; }
  }
}

function requestStartupPermissions() {
  if (!navigator.geolocation) return;
  const gpsRequested = loadStorage('gps_permission_requested', false);
  if (gpsRequested) return;
  navigator.geolocation.getCurrentPosition(
    () => saveStorage('gps_permission_requested', true),
    () => saveStorage('gps_permission_requested', true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function requestStartupNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  if (typeof requestNotifPermission === 'function') {
    requestNotifPermission();
  } else {
    Notification.requestPermission().then(() => {});
  }
}

function requestStartupAccess() {
  requestStartupPermissions();
  requestStartupNotifications();
}

if (document.readyState === 'complete') {
  requestStartupAccess();
} else {
  window.addEventListener('load', requestStartupAccess);
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', function() {
    const target = this.getAttribute('data-nav');
    if (!this.disabled) navigate(target);
  });
});
document.getElementById('home-vib-btn')?.addEventListener('click', () => navigate('vib'));

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
  // Auto-fill deaf stop from GPS selected stop if deaf stop not manually set
  if (!deafStop && typeof gpsSelectedStop !== 'undefined' && gpsSelectedStop && gpsSelectedStop.name) {
    deafStop = gpsSelectedStop.name.toUpperCase();
    saveStorage('deaf_stop', deafStop);
  }
  renderDeaf();
  document.getElementById('lang-btn').textContent = deafLang === 'fil' ? 'FIL → EN' : 'EN → FIL';
}

function renderDeaf() {
  const msg = deafMessages[deafLang];
  const mainEl = document.getElementById('deaf-main-msg');
  if (mainEl) mainEl.innerHTML = msg.main.replace(/\n/g, '<br>');
  const instrEl = document.getElementById('deaf-instruction'); if (instrEl) instrEl.textContent = msg.instruction;
  document.getElementById('deaf-stop-label').innerHTML =
    `<span class="material-symbols-outlined" style="font-size:16px">location_on</span>${msg.stopLabel}`;

  const txt = document.getElementById('deaf-stop-text');
  const displayBtn = document.getElementById('deaf-stop-display');
  if (deafStop) {
    txt.textContent = deafStop;
    txt.style.fontSize = 'clamp(16px, 5.5vw, 36px)';
    txt.style.color = 'var(--amber)';
    if (displayBtn) {
      displayBtn.style.borderBottomStyle = 'solid';
      displayBtn.style.borderBottomColor = '#000';
      displayBtn.style.animation = 'none';
    }
  } else {
    txt.textContent = '— TAP TO SET STOP —';
    txt.style.fontSize = '22px';
    txt.style.color = 'rgba(0,0,0,0.35)';
    if (displayBtn) {
      displayBtn.style.borderBottomStyle = 'dashed';
      displayBtn.style.animation = 'tapHint 1.8s ease-in-out infinite';
    }
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
  if (typeof ROUTES === 'undefined' || !Array.isArray(ROUTES)) {
    document.getElementById('route-list').innerHTML = '<p style="color:var(--text-muted);padding:12px">Route data unavailable.</p>';
    return;
  }

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
  if (typeof ROUTES === 'undefined' || !Array.isArray(ROUTES)) {
    document.getElementById('windshield-text').textContent = 'No routes available';
    document.getElementById('stop-list').innerHTML = '<p style="color:var(--text-muted);padding:12px">Unable to load stops.</p>';
    return;
  }

  const route = ROUTES.find(r => r.id === selectedRouteId) || ROUTES[0];
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
  appLang = validateStorageValue('app_lang', loadStorage('app_lang', 'fil'), VALID_APP_LANGS, 'fil');
  renderAppLanguageOptions();

  vibIntensity = validateStorageValue('vib_intensity', loadStorage('vib_intensity', 'medium'), VALID_VIB_INTENSITIES, 'medium');
  vibTiming    = validateStorageValue('vib_timing', loadStorage('vib_timing', 'normal'), VALID_VIB_TIMINGS, 'normal');
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
      ? 'Vibration API detected — tap a pattern to preview a test pattern or alert pattern.'
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

document.querySelectorAll('[data-app-lang]').forEach(btn => {
  btn.addEventListener('click', () => {
    applyAppLanguage(btn.dataset.appLang);
    document.querySelectorAll('[data-app-lang]').forEach(option => {
      option.classList.toggle('active', option.dataset.appLang === appLang);
    });
    vibrate('approach');
  });
});

function renderAppLanguageOptions() {
  document.querySelectorAll('[data-app-lang]').forEach(option => {
    option.classList.toggle('active', option.dataset.appLang === appLang);
  });
}

renderAppLanguageOptions();

const clearWebsiteDataBtn = document.getElementById('clear-website-data-btn');
if (clearWebsiteDataBtn) {
  clearWebsiteDataBtn.addEventListener('click', clearWebsiteData);
}

window.addEventListener('online',  () => { isOnline = true;  if (currentScreen === 'home') initHome(); if (currentScreen === 'ai') renderAIStatus(); });
window.addEventListener('offline', () => { isOnline = false; if (currentScreen === 'home') initHome(); if (currentScreen === 'ai') renderAIStatus(); });

initHome();
if (document.getElementById('screen-vib')?.classList.contains('active')) {
  renderVibDemo();
}

// PWA Install Prompt Handler
let deferredPrompt = null;
let isInstalled = false;

// Check if app is already installed
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!loadStorage('install_prompt_dismissed', false)) {
    showInstallPrompt();
  }
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
    const app = document.getElementById('app');
    app.insertBefore(banner, app.firstChild);

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
    const app = document.getElementById('app');
    app.insertBefore(banner, app.firstChild);
    
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