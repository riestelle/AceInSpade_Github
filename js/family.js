// PAMILYA — Relative Notification via Firebase Realtime Database
// No login needed. Works with a shareable link.

const FIREBASE_URL = 'https://unique-senyaspo-default-rtdb.firebaseio.com';

let familyWatchId    = null;   // ID stored in localStorage
let familyGpsWatch   = null;   // geolocation watchPosition handle
let familyIsWatching = false;

// ── Generate or load the watch ID ────────────────────────────────────────────
function getFamilyId() {
  let id = loadStorage('family_watch_id', null);
  if (!id) {
    // random 8-char alphanumeric
    id = Math.random().toString(36).slice(2, 10);
    saveStorage('family_watch_id', id);
  }
  return id;
}

// ── Build the shareable URL ───────────────────────────────────────────────────
function getFamilyShareURL() {
  const id = getFamilyId();
  // Works on vercel deploy; also works on localhost for testing
  const base = window.location.origin + window.location.pathname;
  return `${base}?watch=${id}`;
}

// ── Write status to Firebase ──────────────────────────────────────────────────
async function pushFamilyStatus(payload) {
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

// ── Called from gps.js when the GPS alert fires ───────────────────────────────
// Integrate into existing GPS flow without rewriting gps.js
function notifyFamilyAlert(stopName) {
  pushFamilyStatus({
    status: 'arriving',
    stop: stopName,
    ts: Date.now(),
  });
}

// Patch into the GPS watchPosition callback to stream live location
function startFamilyGpsStream() {
  if (familyGpsWatch !== null) return;
  if (!navigator.geolocation) return;

  familyGpsWatch = navigator.geolocation.watchPosition(
    pos => {
      pushFamilyStatus({
        status: 'riding',
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        ts: Date.now(),
        stop: loadStorage('deaf_stop', '') || '',
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}

function stopFamilyGpsStream() {
  if (familyGpsWatch !== null) {
    navigator.geolocation.clearWatch(familyGpsWatch);
    familyGpsWatch = null;
  }
  pushFamilyStatus({ status: 'offline', ts: Date.now() });
}

// ── Screen init ───────────────────────────────────────────────────────────────
function initFamily() {
  const id = getFamilyId();
  const url = getFamilyShareURL();

  document.getElementById('family-link').value = url;
  document.getElementById('family-id-badge').textContent = `ID: ${id}`;

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
    // fallback for older browsers
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
// Runs automatically if ?watch=<id> is in the URL
(function checkWatchMode() {
  const params = new URLSearchParams(window.location.search);
  const watchId = params.get('watch');
  if (!watchId) return;

  // Hide app, show watcher UI
  document.addEventListener('DOMContentLoaded', () => {
    renderWatcherPage(watchId);
  });
  // Also fire immediately if DOM is ready
  if (document.readyState !== 'loading') renderWatcherPage(watchId);
})();

function renderWatcherPage(watchId) {
  // Hide entire app container
  const appRoot = document.getElementById('app') || document.body.firstElementChild;

  // Build watcher overlay
  const overlay = document.createElement('div');
  overlay.id = 'watcher-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:#0d0d0d;color:#fff;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'Inter',sans-serif;padding:24px;z-index:99999;text-align:center;
  `;
  overlay.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px">🚌</div>
    <div style="font-size:22px;font-weight:900;letter-spacing:1px;color:#feb700">SENYASPO</div>
    <div style="font-size:13px;color:#888;margin-bottom:28px">Tracker ng Pamilya</div>

    <div id="watcher-card" style="
      background:#1a1a1a;border-radius:16px;padding:24px 28px;
      width:100%;max-width:380px;border:1px solid #2a2a2a;
    ">
      <div id="watcher-status-icon" style="font-size:40px;margin-bottom:8px">⏳</div>
      <div id="watcher-status-text" style="font-size:18px;font-weight:800;margin-bottom:4px">Naghihintay...</div>
      <div id="watcher-stop-text" style="font-size:14px;color:#feb700;min-height:20px"></div>
      <div id="watcher-time-text" style="font-size:12px;color:#555;margin-top:8px"></div>
    </div>

    <div style="margin-top:20px;font-size:12px;color:#444">
      Awtomatikong nag-a-update · ID: ${watchId}
    </div>
  `;
  document.body.appendChild(overlay);

  // Poll Firebase every 5 seconds
  function poll() {
    fetch(`${FIREBASE_URL}/watch/${watchId}.json`)
      .then(r => r.json())
      .then(data => {
        if (!data) {
          document.getElementById('watcher-status-icon').textContent = '⏳';
          document.getElementById('watcher-status-text').textContent = 'Naghihintay pa...';
          document.getElementById('watcher-stop-text').textContent = 'Hindi pa nagsisimula';
          return;
        }
        const icon   = document.getElementById('watcher-status-icon');
        const label  = document.getElementById('watcher-status-text');
        const stop   = document.getElementById('watcher-stop-text');
        const time   = document.getElementById('watcher-time-text');

        const ago = data.ts ? Math.round((Date.now() - data.ts) / 1000) : null;
        time.textContent = ago !== null ? `Na-update ${ago}s na ang nakakaraan` : '';

        if (data.status === 'arriving') {
          icon.textContent  = '🚨';
          label.textContent = 'BABABA NA!';
          label.style.color = '#ef4444';
          stop.textContent  = `Hintuan: ${data.stop || '—'}`;
          stop.style.color  = '#ef4444';
        } else if (data.status === 'riding') {
          icon.textContent  = '🚌';
          label.textContent = 'Nakasakay sa jeep';
          label.style.color = '#fff';
          stop.textContent  = data.stop ? `Papunta: ${data.stop}` : '';
          stop.style.color  = '#feb700';
        } else {
          icon.textContent  = '📵';
          label.textContent = 'Offline';
          label.style.color = '#888';
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