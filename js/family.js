// PAMILYA — Relative Notification via Firebase Realtime Database
// No login needed. Works with a shareable link.

const FIREBASE_URL = 'https://console.firebase.google.com/u/0/project/unique-senyaspo/database/unique-senyaspo-default-rtdb/data/';

let familyWatchId    = null;
let familyGpsWatch   = null;
let familyIsWatching = false;
let familyLastPush   = 0;
let familyBgInterval = null;   // fallback interval for background GPS

// ── Generate or load the watch ID ────────────────────────────────────────────
function getFamilyId() {
  let id = loadStorage('family_watch_id', null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    saveStorage('family_watch_id', id);
  }
  return id;
}

// ── Build the shareable URL ───────────────────────────────────────────────────
function getFamilyShareURL() {
  const id = getFamilyId();
  const base = window.location.origin + window.location.pathname;
  return `${base}?watch=${id}`;
}

// ── Write status to Firebase ──────────────────────────────────────────────────
async function pushFamilyStatus(payload, force = false) {
  if (!force && Date.now() - familyLastPush < 8000) return;
  familyLastPush = Date.now();
  const id = getFamilyId();
  try {
    await fetch(`${FIREBASE_URL}/watch/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('Firebase write failed:', e);
  }
}

// ── Called from gps.js when the GPS alert fires (arrived at stop) ─────────────
function notifyFamilyAlert(stopName) {
  saveStorage('family_arrived_stop', stopName);
  pushFamilyStatus({ status: 'arrived', stop: stopName, ts: Date.now() }, true);
}

// ── One-shot GPS fetch for background fallback ────────────────────────────────
function fetchAndPushLocation() {
  if (!navigator.geolocation || !familyIsWatching) return;
  const savedStop = loadStorage('family_selected_stop', '');
  navigator.geolocation.getCurrentPosition(
    pos => {
      pushFamilyStatus({
        status: 'riding',
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        ts: Date.now(),
        stop: savedStop,
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
}

// ── Start streaming live GPS location to Firebase ─────────────────────────────
function startFamilyGpsStream() {
  if (familyGpsWatch !== null) return;
  if (!navigator.geolocation) return;

  const savedStop = loadStorage('family_selected_stop', '');

  // Push real coords immediately using getCurrentPosition (not null)
  navigator.geolocation.getCurrentPosition(
    pos => {
      pushFamilyStatus({
        status: 'riding',
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        ts: Date.now(),
        stop: savedStop,
      }, true);
    },
    () => {
      // GPS unavailable — still push riding so watcher doesn't stay "Naghihintay"
      pushFamilyStatus({ status: 'riding', lat: null, lon: null, ts: Date.now(), stop: savedStop }, true);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );

  // Continuous watch (works best when tab is visible)
  familyGpsWatch = navigator.geolocation.watchPosition(
    pos => {
      const stop = loadStorage('family_selected_stop', '');
      pushFamilyStatus({
        status: 'riding',
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        ts: Date.now(),
        stop,
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );

  // Background interval fallback: push every 30s even if watchPosition is throttled
  if (!familyBgInterval) {
    familyBgInterval = setInterval(() => {
      if (familyIsWatching) fetchAndPushLocation();
    }, 30000);
  }
}

function stopFamilyGpsStream() {
  if (familyGpsWatch !== null) {
    navigator.geolocation.clearWatch(familyGpsWatch);
    familyGpsWatch = null;
  }
  if (familyBgInterval !== null) {
    clearInterval(familyBgInterval);
    familyBgInterval = null;
  }
  if (familyIsWatching) {
    pushFamilyStatus({ status: 'offline', ts: Date.now() }, true);
  }
}

// ── Restore sharing state on app load ────────────────────────────────────────
function restoreFamilySharingState() {
  const wasSharingBefore = loadStorage('family_is_watching', false);
  if (wasSharingBefore) {
    familyIsWatching = true;
    startFamilyGpsStream();
  }
}

// ── Handle tab visibility changes ─────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!familyIsWatching) return;
  if (document.visibilityState === 'hidden') {
    // Stop watchPosition — browser throttles/kills it in background anyway
    if (familyGpsWatch !== null) {
      navigator.geolocation.clearWatch(familyGpsWatch);
      familyGpsWatch = null;
    }
    // Push one update so Firebase timestamp stays fresh
    fetchAndPushLocation();
    // interval fallback keeps running in the background
  } else if (document.visibilityState === 'visible') {
    startFamilyGpsStream(); // re-start watchPosition when tab returns
  }
});

// ── Screen init ───────────────────────────────────────────────────────────────
function initFamily() {
  const id  = getFamilyId();
  const url = getFamilyShareURL();

  document.getElementById('family-link').value = url;
  document.getElementById('family-id-badge').textContent = `ID: ${id}`;

  const wasSharingBefore = loadStorage('family_is_watching', false);
  if (wasSharingBefore && !familyIsWatching) {
    familyIsWatching = true;
    startFamilyGpsStream();
  }

  renderFamilyStatus();
}

function renderFamilyStatus() {
  const btn   = document.getElementById('family-toggle-btn');
  const label = document.getElementById('family-status-label');
  if (familyIsWatching) {
    btn.innerHTML   = '<span class="material-symbols-outlined" style="font-size:20px">stop_circle</span> Itigil ang Pagbabahagi';
    btn.style.background = '#b91c1c';
    label.textContent   = '🔴 Live — nababahaginan ang iyong lokasyon';
    label.style.color   = '#f87171';
  } else {
    btn.innerHTML   = '<span class="material-symbols-outlined" style="font-size:20px">share_location</span> Simulan ang Pagbabahagi';
    btn.style.background = '';
    label.textContent   = '⬜ Hindi pa aktibo';
    label.style.color   = 'var(--text-muted)';
  }
}

document.getElementById('family-toggle-btn').addEventListener('click', () => {
  familyIsWatching = !familyIsWatching;
  if (familyIsWatching) {
    startFamilyGpsStream();
  } else {
    stopFamilyGpsStream();
  }
  saveStorage('family_is_watching', familyIsWatching);
  renderFamilyStatus();
  vibrate(40);
});

document.getElementById('family-copy-btn').addEventListener('click', () => {
  const url = getFamilyShareURL();
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('family-copy-btn');
    btn.textContent = 'Nakopya! ✓';
    setTimeout(() => { btn.textContent = 'Kopyahin ang Link'; }, 2000);
  }).catch(() => {
    document.getElementById('family-link').select();
    document.execCommand('copy');
  });
  vibrate(30);
});

document.getElementById('family-share-btn').addEventListener('click', () => {
  const url = getFamilyShareURL();
  if (navigator.share) {
    navigator.share({
      title: 'SenyasPo — Subaybayan ako',
      text: 'I-click ang link para makita kung nasaan ako sa jeep.',
      url,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).catch(() => {});
    alert('Link nakopya! I-paste sa Viber o SMS.');
  }
  vibrate(30);
});

// ── Relative/Watcher page ─────────────────────────────────────────────────────
(function checkWatchMode() {
  const params  = new URLSearchParams(window.location.search);
  const watchId = params.get('watch');
  if (!watchId) return;

  document.addEventListener('DOMContentLoaded', () => renderWatcherPage(watchId));
  if (document.readyState !== 'loading') renderWatcherPage(watchId);
})();

function renderWatcherPage(watchId) {
  const overlay = document.createElement('div');
  overlay.id = 'watcher-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:#0d0d0d;color:#fff;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'Inter',sans-serif;padding:24px;z-index:99999;text-align:center;
    overflow-y:auto;
  `;
  overlay.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px">🚌</div>
    <div style="font-size:22px;font-weight:900;letter-spacing:1px;color:#feb700">SENYASPO</div>
    <div style="font-size:13px;color:#888;margin-bottom:28px">Tracker ng Pamilya</div>

    <div id="watcher-card" style="
      background:#1a1a1a;border-radius:16px;padding:24px 28px;
      width:100%;max-width:380px;border:1px solid #2a2a2a;
      transition: border-color 0.3s;
    ">
      <div id="watcher-status-icon" style="font-size:48px;margin-bottom:8px">⏳</div>
      <div id="watcher-status-text" style="font-size:20px;font-weight:800;margin-bottom:4px">Naghihintay...</div>
      <div id="watcher-stop-text" style="font-size:14px;color:#feb700;min-height:20px"></div>
      <div id="watcher-time-text" style="font-size:12px;color:#555;margin-top:8px"></div>

      <div id="watcher-map-wrap" style="margin-top:16px;display:none">
        <div id="watcher-map" style="height:220px;border-radius:12px;overflow:hidden;"></div>
        <div style="font-size:11px;color:#555;margin-top:6px">📍 Live na lokasyon</div>
      </div>

      <div id="watcher-map-placeholder" style="
        display:none;margin-top:16px;height:80px;border-radius:12px;
        background:#111;border:1px dashed #333;
        align-items:center;justify-content:center;
        flex-direction:column;gap:4px;color:#555;font-size:12px;
      ">
        <span>📡</span>
        <span>Hinihintay ang GPS signal...</span>
      </div>
    </div>

    <div id="watcher-arrived-banner" style="
      display:none;margin-top:16px;background:#166534;border:2px solid #4ade80;
      border-radius:12px;padding:16px 24px;width:100%;max-width:380px;
    ">
      <div style="font-size:32px">✅</div>
      <div style="font-size:18px;font-weight:900;color:#4ade80">NAKARATING NA!</div>
      <div id="watcher-arrived-stop" style="font-size:14px;color:#86efac;margin-top:4px"></div>
    </div>

    <div style="margin-top:20px;font-size:12px;color:#444">
      Awtomatikong nag-a-update · ID: ${watchId}
    </div>
  `;
  document.body.appendChild(overlay);
  

  // Load Leaflet CSS + JS
  if (!window.L) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(script);
  }

  let watcherMap      = null;
  let watcherMarker   = null;
  let notifiedArrival = false;
  let mapInitialized  = false;

  function ensureMapInit(lat, lon) {
    if (mapInitialized || !window.L) return;
    mapInitialized = true;
    watcherMap = L.map('watcher-map', { zoomControl: true, attributionControl: false })
      .setView([lat, lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(watcherMap);
  }

  function showWatcherMap(lat, lon, stopName) {
    if (!window.L) return; // will show on next poll once Leaflet finishes loading

    document.getElementById('watcher-map-wrap').style.display = 'block';
    document.getElementById('watcher-map-placeholder').style.display = 'none';

    ensureMapInit(lat, lon);

    if (watcherMap) {
      if (!watcherMarker) {
        watcherMarker = L.circleMarker([lat, lon], {
          radius: 10, color: '#feb700', fillColor: '#feb700', fillOpacity: 1, weight: 3
        }).addTo(watcherMap).bindPopup(stopName || 'Rider').openPopup();
      } else {
        watcherMarker.setLatLng([lat, lon]);
      }
      watcherMap.setView([lat, lon], 15);
      // Fix tiles when container was hidden during Leaflet init
      setTimeout(() => watcherMap.invalidateSize(), 100);
    }
  }

  function notifyArrival(stopName) {
    if (notifiedArrival) return;
    notifiedArrival = true;

    document.getElementById('watcher-arrived-banner').style.display = 'block';
    document.getElementById('watcher-arrived-stop').textContent = `Hintuan: ${stopName || '—'}`;
    document.getElementById('watcher-card').style.borderColor = '#4ade80';

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🎉 Nakarating na!', { body: `Nakarating na sila sa: ${stopName || 'hintuan'}` });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted')
          new Notification('🎉 Nakarating na!', { body: `Nakarating na sila sa: ${stopName || 'hintuan'}` });
      });
    }

    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  }

  function poll() {
    fetch(`${FIREBASE_URL}/watch/${watchId}.json`)
      .then(r => r.json())
      .then(data => {
        const icon  = document.getElementById('watcher-status-icon');
        const label = document.getElementById('watcher-status-text');
        const stop  = document.getElementById('watcher-stop-text');
        const time  = document.getElementById('watcher-time-text');

        if (!data) {
          icon.textContent  = '⏳';
          label.textContent = 'Naghihintay pa...';
          label.style.color = '#fff';
          stop.textContent  = 'Hindi pa nagsisimula ang pagbabahagi';
          stop.style.color  = '#888';
          time.textContent  = '';
          return;
        }

        const ago     = data.ts ? Math.round((Date.now() - data.ts) / 1000) : null;
        const isStale = ago !== null && ago > 180;

        if (ago !== null) {
          time.textContent = ago < 60
            ? `Na-update ${ago}s na ang nakakaraan`
            : `Na-update ${Math.round(ago / 60)}min na ang nakakaraan`;
        }

        if (data.status === 'arrived') {
          icon.textContent  = '🎉';
          label.textContent = 'NAKARATING NA!';
          label.style.color = '#4ade80';
          stop.textContent  = `Hintuan: ${data.stop || '—'}`;
          stop.style.color  = '#4ade80';
          document.getElementById('watcher-map-wrap').style.display = 'none';
          document.getElementById('watcher-map-placeholder').style.display = 'none';
          notifyArrival(data.stop);

        } else if (data.status === 'riding' && !isStale) {
          icon.textContent  = '🚌';
          label.textContent = 'Nakasakay sa jeep';
          label.style.color = '#fff';
          stop.textContent  = data.stop ? `Papunta: ${data.stop}` : 'Nagsasabay...';
          stop.style.color  = '#feb700';

          if (data.lat && data.lon) {
            showWatcherMap(data.lat, data.lon, data.stop);
          } else {
            // Riding but GPS still acquiring — show placeholder
            document.getElementById('watcher-map-wrap').style.display = 'none';
            document.getElementById('watcher-map-placeholder').style.display = 'flex';
          }

        } else if (data.status === 'offline' || isStale) {
          icon.textContent  = '📵';
          label.textContent = isStale && data.status !== 'offline' ? 'Pahinga (walang update)' : 'Offline';
          label.style.color = '#888';
          stop.textContent  = '';
          document.getElementById('watcher-map-wrap').style.display = 'none';
          document.getElementById('watcher-map-placeholder').style.display = 'none';

        } else {
          icon.textContent  = '⏳';
          label.textContent = 'Naghihintay...';
          label.style.color = '#fff';
          stop.textContent  = '';
        }
      })
      .catch(() => {
        document.getElementById('watcher-status-text').textContent = 'Hindi ma-konekta...';
      });
  }

  poll();
  setInterval(poll, 5000);
}

// Auto-restore sharing state on app start
restoreFamilySharingState();
