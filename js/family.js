// PAMILYA — Relative Notification via Firebase Realtime Database
// No login needed. Works with a shareable link.

const FIREBASE_URL = 'https://unique-senyaspo-default-rtdb.firebaseio.com';

let familyWatchId    = null;
let familyGpsWatch   = null;
let familyIsWatching = false;
let familyLastPush   = 0;
let familyBgInterval = null;

// ── Generate or load the watch ID ─────────────────────────────
function getFamilyId() {
  let id = loadStorage('family_watch_id', null);

  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    saveStorage('family_watch_id', id);
  }

  return id;
}

// ── Build the shareable URL ───────────────────────────────────
function getFamilyShareURL() {
  const id = getFamilyId();
  const base = window.location.origin + window.location.pathname;
  return `${base}?watch=${id}`;
}

// ── Firebase write ────────────────────────────────────────────
async function pushFamilyStatus(payload, force = false) {

  if (!force && Date.now() - familyLastPush < 8000) {
    return;
  }

  familyLastPush = Date.now();

  const id = getFamilyId();

  try {

    const res = await fetch(
      `${FIREBASE_URL}/watch/${id}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      throw new Error(`Firebase HTTP ${res.status}`);
    }

    console.log('Firebase updated:', payload);

  } catch (e) {

    console.error('Firebase write failed:', e);

    alert(
      'Firebase write failed. Check Firebase rules.'
    );
  }
}

// ── Called from gps.js when arrived ───────────────────────────
function notifyFamilyAlert(stopName) {

  saveStorage('family_arrived_stop', stopName);

  pushFamilyStatus({
    status: 'arrived',
    stop: stopName,
    ts: Date.now()
  }, true);
}

// ── One-shot GPS fallback ─────────────────────────────────────
function fetchAndPushLocation() {

  if (!navigator.geolocation || !familyIsWatching) {
    return;
  }

  const savedStop =
    loadStorage('family_selected_stop', '');

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

    err => {
      console.error(err);
    },

    {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000
    }
  );
}

// ── Start GPS stream ──────────────────────────────────────────
function startFamilyGpsStream() {

  if (familyGpsWatch !== null) return;

  if (!navigator.geolocation) {
    alert('Geolocation not supported.');
    return;
  }

  const savedStop =
    loadStorage('family_selected_stop', '');

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

    err => {

      console.error(err);

      pushFamilyStatus({
        status: 'riding',
        lat: null,
        lon: null,
        ts: Date.now(),
        stop: savedStop
      }, true);
    },

    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    }
  );

  familyGpsWatch =
    navigator.geolocation.watchPosition(

      pos => {

        const stop =
          loadStorage('family_selected_stop', '');

        pushFamilyStatus({
          status: 'riding',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          ts: Date.now(),
          stop,
        });
      },

      err => {
        console.error(err);
      },

      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000
      }
    );

  if (!familyBgInterval) {

    familyBgInterval =
      setInterval(() => {

        if (familyIsWatching) {
          fetchAndPushLocation();
        }

      }, 30000);
  }
}

// ── Stop GPS stream ───────────────────────────────────────────
function stopFamilyGpsStream() {

  if (familyGpsWatch !== null) {

    navigator.geolocation.clearWatch(
      familyGpsWatch
    );

    familyGpsWatch = null;
  }

  if (familyBgInterval !== null) {

    clearInterval(familyBgInterval);

    familyBgInterval = null;
  }

  pushFamilyStatus({
    status: 'offline',
    ts: Date.now()
  }, true);
}

// ── Restore sharing state ─────────────────────────────────────
function restoreFamilySharingState() {

  const wasSharingBefore =
    loadStorage('family_is_watching', false);

  if (wasSharingBefore) {

    familyIsWatching = true;

    startFamilyGpsStream();
  }
}

// ── Handle visibility ─────────────────────────────────────────
document.addEventListener(
  'visibilitychange',
  () => {

    if (!familyIsWatching) return;

    if (document.visibilityState === 'hidden') {

      if (familyGpsWatch !== null) {

        navigator.geolocation.clearWatch(
          familyGpsWatch
        );

        familyGpsWatch = null;
      }

      fetchAndPushLocation();

    } else {

      startFamilyGpsStream();
    }
  }
);

// ── Screen init ───────────────────────────────────────────────
function initFamily() {

  const id = getFamilyId();

  const url = getFamilyShareURL();

  document.getElementById('family-link').value =
    url;

  document.getElementById('family-id-badge')
    .textContent = `ID: ${id}`;

  restoreFamilySharingState();

  renderFamilyStatus();
}

// ── Render status ─────────────────────────────────────────────
function renderFamilyStatus() {

  const btn =
    document.getElementById(
      'family-toggle-btn'
    );

  const label =
    document.getElementById(
      'family-status-label'
    );

  if (familyIsWatching) {

    btn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:20px">stop_circle</span> Itigil ang Pagbabahagi';

    btn.style.background = '#b91c1c';

    label.textContent =
      '🔴 Live — nababahaginan ang iyong lokasyon';

    label.style.color = '#f87171';

  } else {

    btn.innerHTML =
      '<span class="material-symbols-outlined" style="font-size:20px">share_location</span> Simulan ang Pagbabahagi';

    btn.style.background = '';

    label.textContent =
      '⬜ Hindi pa aktibo';

    label.style.color =
      'var(--text-muted)';
  }
}

// ── Toggle sharing ────────────────────────────────────────────
document.getElementById(
  'family-toggle-btn'
).addEventListener('click', () => {

  if (!familyIsWatching) {

    navigator.geolocation.getCurrentPosition(

      () => {

        familyIsWatching = true;

        startFamilyGpsStream();

        saveStorage(
          'family_is_watching',
          true
        );

        renderFamilyStatus();

        vibrate(40);
      },

      err => {

        console.error(err);

        alert(
          'Location permission required.'
        );
      },

      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );

  } else {

    familyIsWatching = false;

    stopFamilyGpsStream();

    saveStorage(
      'family_is_watching',
      false
    );

    renderFamilyStatus();

    vibrate(40);
  }
});

// ── Copy link ─────────────────────────────────────────────────
document.getElementById(
  'family-copy-btn'
).addEventListener('click', () => {

  const url = getFamilyShareURL();

  navigator.clipboard.writeText(url)
    .then(() => {

      const btn =
        document.getElementById(
          'family-copy-btn'
        );

      btn.textContent = 'Nakopya! ✓';

      setTimeout(() => {

        btn.textContent =
          'Kopyahin ang Link';

      }, 2000);
    });

  vibrate(30);
});

// ── Share link ────────────────────────────────────────────────
document.getElementById(
  'family-share-btn'
).addEventListener('click', () => {

  const url = getFamilyShareURL();

  if (navigator.share) {

    navigator.share({
      title: 'SenyasPo — Subaybayan ako',
      text: 'I-click ang link para makita kung nasaan ako sa jeep.',
      url,
    });

  } else {

    navigator.clipboard.writeText(url);

    alert(
      'Link nakopya! I-paste sa Viber o SMS.'
    );
  }

  vibrate(30);
});

// ── Watch mode ────────────────────────────────────────────────
(function checkWatchMode() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const watchId =
    params.get('watch');

  if (!watchId) return;

  document.addEventListener(
    'DOMContentLoaded',
    () => renderWatcherPage(watchId)
  );

  if (document.readyState !== 'loading') {
    renderWatcherPage(watchId);
  }
})();

// ── Watcher page ──────────────────────────────────────────────
function renderWatcherPage(watchId) {

  const overlay =
    document.createElement('div');

  overlay.id = 'watcher-overlay';

  overlay.style.cssText = `
    position:fixed;
    inset:0;
    background:#0d0d0d;
    color:#fff;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    font-family:'Inter',sans-serif;
    padding:24px;
    z-index:99999;
    text-align:center;
    overflow-y:auto;
  `;

  overlay.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px">🚌</div>

    <div style="
      font-size:22px;
      font-weight:900;
      letter-spacing:1px;
      color:#feb700;
    ">
      SENYASPO
    </div>

    <div style="
      font-size:13px;
      color:#888;
      margin-bottom:28px;
    ">
      Tracker ng Pamilya
    </div>

    <div id="watcher-card" style="
      background:#1a1a1a;
      border-radius:16px;
      padding:24px 28px;
      width:100%;
      max-width:380px;
      border:1px solid #2a2a2a;
    ">

      <div id="watcher-status-icon"
        style="font-size:48px;margin-bottom:8px">
        ⏳
      </div>

      <div id="watcher-status-text"
        style="font-size:20px;font-weight:800;margin-bottom:4px">
        Naghihintay...
      </div>

      <div id="watcher-stop-text"
        style="font-size:14px;color:#feb700;min-height:20px">
      </div>

      <div id="watcher-time-text"
        style="font-size:12px;color:#555;margin-top:8px">
      </div>

      <div id="watcher-map-wrap"
        style="margin-top:16px;display:none">

        <div id="watcher-map"
          style="height:220px;border-radius:12px;overflow:hidden;">
        </div>

        <div style="
          font-size:11px;
          color:#555;
          margin-top:6px">
          📍 Live na lokasyon
        </div>
      </div>

      <div id="watcher-map-placeholder" style="
        display:none;
        margin-top:16px;
        height:80px;
        border-radius:12px;
        background:#111;
        border:1px dashed #333;
        align-items:center;
        justify-content:center;
        flex-direction:column;
        gap:4px;
        color:#555;
        font-size:12px;
      ">
        <span>📡</span>
        <span>Hinihintay ang GPS signal...</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function loadLeaflet(callback) {

    if (window.L) {
      callback();
      return;
    }

    const css =
      document.createElement('link');

    css.rel = 'stylesheet';

    css.href =
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

    document.head.appendChild(css);

    const script =
      document.createElement('script');

    script.src =
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    script.onload = callback;

    document.body.appendChild(script);
  }

  loadLeaflet(startWatcherTracking);

  function startWatcherTracking() {

    let watcherMap = null;
    let watcherMarker = null;

    async function pollWatcherData() {

      try {

        const res = await fetch(
          `${FIREBASE_URL}/watch/${watchId}.json`
        );

        const data = await res.json();

        if (!data) return;

        const statusIcon =
          document.getElementById(
            'watcher-status-icon'
          );

        const statusText =
          document.getElementById(
            'watcher-status-text'
          );

        const stopText =
          document.getElementById(
            'watcher-stop-text'
          );

        const timeText =
          document.getElementById(
            'watcher-time-text'
          );

        if (data.ts) {

          const dt =
            new Date(data.ts);

          timeText.textContent =
            'Huling update: ' +
            dt.toLocaleTimeString();
        }

        if (data.status === 'arrived') {

          statusIcon.textContent = '✅';

          statusText.textContent =
            'Nakarating Na';

          stopText.textContent =
            data.stop || '';

          return;
        }

        if (data.status === 'riding') {

          statusIcon.textContent = '🚌';

          statusText.textContent =
            'Biyahe Pa';

          stopText.textContent =
            data.stop
              ? 'Bababa sa: ' + data.stop
              : '';

          if (data.lat && data.lon) {

            document.getElementById(
              'watcher-map-wrap'
            ).style.display = 'block';

            document.getElementById(
              'watcher-map-placeholder'
            ).style.display = 'none';

            if (!watcherMap) {

              watcherMap =
                L.map('watcher-map', {
                  zoomControl: false,
                  attributionControl: false
                }).setView(
                  [data.lat, data.lon],
                  16
                );

              L.tileLayer(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                {
                  maxZoom: 19
                }
              ).addTo(watcherMap);

              watcherMarker =
                L.marker([
                  data.lat,
                  data.lon
                ]).addTo(watcherMap);

            } else {

              watcherMarker.setLatLng([
                data.lat,
                data.lon
              ]);

              watcherMap.setView([
                data.lat,
                data.lon
              ]);
            }

          } else {

            document.getElementById(
              'watcher-map-wrap'
            ).style.display = 'none';

            document.getElementById(
              'watcher-map-placeholder'
            ).style.display = 'flex';
          }
        }

        if (data.status === 'offline') {

          statusIcon.textContent = '⚫';

          statusText.textContent =
            'Offline';

          stopText.textContent = '';
        }

      } catch (e) {

        console.error(
          'Watcher polling failed:',
          e
        );
      }
    }

    pollWatcherData();

    setInterval(
      pollWatcherData,
      3000
    );
  }
}

// ── Auto restore ──────────────────────────────────────────────
restoreFamilySharingState();