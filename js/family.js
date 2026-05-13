// PAMILYA — Relative Notification via Firebase Realtime Database
// No login needed. Works with a shareable link.
const FIREBASE_URL = 'https://aceinspace-senyaspo-default-rtdb.asia-southeast1.firebasedatabase.app';

let familyGpsWatch = null;
let familyIsWatching = false;
let familyLastPush = 0;
let familyBgInterval = null;

function getFamilyId() {
  let id = loadStorage('family_watch_id', null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    saveStorage('family_watch_id', id);
  }
  return id;
}

function getFamilyShareURL() {
  const url = new URL(window.location.href);
  url.searchParams.set('watch', getFamilyId());
  return url.toString();
}

async function pushFamilyStatus(payload, force = false) {
  if (!force && Date.now() - familyLastPush < 8000) return;
  familyLastPush = Date.now();
  const id = getFamilyId();
  const firebaseUrl = `${FIREBASE_URL}/watch/${encodeURIComponent(id)}.json`;

  try {
    const response = await fetch(firebaseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn('Firebase write failed:', response.status, text);
    }
  } catch (error) {
    console.warn('Firebase write failed:', error);
  }
}

function notifyFamilyAlert(stopName) {
  saveStorage('family_arrived_stop', stopName);
  pushFamilyStatus({ status: 'arrived', stop: stopName, ts: Date.now() }, true);
}

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
    err => {
      console.warn('Background location fetch failed:', err);
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
}

function startFamilyGpsStream() {
  if (familyGpsWatch !== null) return;
  if (!navigator.geolocation) {
    console.warn('Geolocation unavailable.');
    return;
  }

  const savedStop = loadStorage('family_selected_stop', '');

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
      console.warn('Initial GPS position error:', err);
      // Don't push riding+null — watcher will get stuck in GPS placeholder forever
      // Push offline instead so watcher knows signal failed
      pushFamilyStatus({ status: 'offline', ts: Date.now() }, true);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );

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
    err => {
      console.warn('GPS watch error:', err);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );

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

function restoreFamilySharingState() {
  const wasSharingBefore = loadStorage('family_is_watching', false);
  if (wasSharingBefore) {
    familyIsWatching = true;
    startFamilyGpsStream();
  }
}

let familyUIBooted = false;

function renderFamilyStatus() {
  const button = document.getElementById('family-toggle-btn');
  const label = document.getElementById('family-status-label');
  if (!button || !label) return;

  if (familyIsWatching) {
    button.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px">stop_circle</span> Itigil ang Pagbabahagi';
    button.style.background = '#b91c1c';
    label.textContent = '🔴 Live — nababahaginan ang iyong lokasyon';
    label.style.color = '#f87171';
  } else {
    button.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px">share_location</span> Simulan ang Pagbabahagi';
    button.style.background = '';
    label.textContent = '⬜ Hindi pa aktibo';
    label.style.color = 'var(--text-muted)';
  }
}

function initFamilyUI() {
  if (familyUIBooted) return;
  familyUIBooted = true;

  const shareInput = document.getElementById('family-link');
  const idBadge = document.getElementById('family-id-badge');
  const toggleBtn = document.getElementById('family-toggle-btn');
  const copyBtn = document.getElementById('family-copy-btn');
  const shareBtn = document.getElementById('family-share-btn');

  const id = getFamilyId();
  const url = getFamilyShareURL();

  if (shareInput) shareInput.value = url;
  if (idBadge) idBadge.textContent = `ID: ${id}`;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
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
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = 'Nakopya! ✓';
        setTimeout(() => { copyBtn.textContent = 'Kopyahin ang Link'; }, 2000);
      }).catch(() => {
        if (shareInput) {
          shareInput.select();
          document.execCommand('copy');
        }
      });
      vibrate(30);
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: 'SenyasPo — Subaybayan ako',
          text: 'I-click ang link para makita kung nasaan ako sa jeep.',
          url,
        }).catch(e => console.warn('Share failed:', e));
      } else {
        navigator.clipboard.writeText(url).catch(e => console.warn('Clipboard write failed:', e));
        alert('Link nakopya! I-paste sa Viber o SMS.');
      }
      vibrate(30);
    });
  }

  renderFamilyStatus();
  restoreFamilySharingState();
}

document.addEventListener('DOMContentLoaded', initFamilyUI);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initFamilyUI();
}

(function checkWatchMode() {
  const params = new URLSearchParams(window.location.search);
  const watchId = params.get('watch');
  if (!watchId) return;

  const launchWatcher = () => renderWatcherPage(watchId);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launchWatcher);
  } else {
    launchWatcher();
  }
})();

function renderWatcherPage(watchId) {
  if (document.getElementById('watcher-overlay')) return;

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

  let watcherMap = null;
  let watcherMarker = null;
  let notifiedArrival = false;
  let mapInitialized = false;
  let pollIntervalId = null;
  let leafletLoadPromise = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoadPromise) return leafletLoadPromise;

    leafletLoadPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      script.onerror = err => reject(new Error('Failed to load Leaflet: ' + err));
      document.head.appendChild(script);
    }).catch(err => {
      console.warn('Leaflet load failed:', err);
    });

    return leafletLoadPromise;
  }

  function ensureMapInit(lat, lon) {
    if (mapInitialized || !window.L) return;
    const mapEl = document.getElementById('watcher-map');
    if (!mapEl) return;

    mapInitialized = true;
    watcherMap = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([lat, lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(watcherMap);
    setTimeout(() => {
      if (watcherMap) watcherMap.invalidateSize();
    }, 100);
  }

  function showWatcherMap(lat, lon, stopName) {
    const mapWrap = document.getElementById('watcher-map-wrap');
    const placeholder = document.getElementById('watcher-map-placeholder');

    if (mapWrap) mapWrap.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';

    if (!window.L) return;
    ensureMapInit(lat, lon);
    if (!watcherMap) return;

    if (!watcherMarker) {
      watcherMarker = L.circleMarker([lat, lon], {
        radius: 10,
        color: '#feb700',
        fillColor: '#feb700',
        fillOpacity: 1,
        weight: 3,
      }).addTo(watcherMap).bindPopup(stopName || 'Rider').openPopup();
    } else {
      watcherMarker.setLatLng([lat, lon]);
      if (watcherMarker.getPopup()) watcherMarker.getPopup().setContent(stopName || 'Rider');
    }

    watcherMap.setView([lat, lon], 15);
    setTimeout(() => watcherMap.invalidateSize(), 100);
  }

  function notifyArrival(stopName) {
    if (notifiedArrival) return;
    notifiedArrival = true;

    const arrivedBanner = document.getElementById('watcher-arrived-banner');
    const arrivedStop = document.getElementById('watcher-arrived-stop');
    const card = document.getElementById('watcher-card');

    if (arrivedBanner) arrivedBanner.style.display = 'block';
    if (arrivedStop) arrivedStop.textContent = `Hintuan: ${stopName || '—'}`;
    if (card) card.style.borderColor = '#4ade80';

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🎉 Nakarating na!', { body: `Nakarating na sila sa: ${stopName || 'hintuan'}` });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('🎉 Nakarating na!', { body: `Nakarating na sila sa: ${stopName || 'hintuan'}` });
        }
      });
    }

    if (navigator.vibrate) {
      try {
        navigator.vibrate([200, 100, 200, 100, 400]);
      } catch (e) {
        console.warn('Vibrate failed:', e);
      }
    }
  }

  function updateWatcherUI(data) {
    const icon = document.getElementById('watcher-status-icon');
    const label = document.getElementById('watcher-status-text');
    const stop = document.getElementById('watcher-stop-text');
    const time = document.getElementById('watcher-time-text');
    const mapWrap = document.getElementById('watcher-map-wrap');
    const placeholder = document.getElementById('watcher-map-placeholder');

    if (!icon || !label || !stop || !time) return;

    if (!data) {
      icon.textContent = '⏳';
      label.textContent = 'Naghihintay pa...';
      label.style.color = '#fff';
      stop.textContent = 'Hindi pa nagsisimula ang pagbabahagi';
      stop.style.color = '#888';
      time.textContent = '';
      if (mapWrap) mapWrap.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
      return;
    }

    const ago = data.ts ? Math.round((Date.now() - data.ts) / 1000) : null;
    const isStale = ago !== null && ago > 180;

    if (ago !== null) {
      time.textContent = ago < 60
        ? `Na-update ${ago}s na ang nakakaraan`
        : `Na-update ${Math.round(ago / 60)}min na ang nakakaraan`;
    } else {
      time.textContent = '';
    }

    if (data.status === 'arrived') {
      icon.textContent = '🎉';
      label.textContent = 'NAKARATING NA!';
      label.style.color = '#4ade80';
      stop.textContent = `Hintuan: ${data.stop || '—'}`;
      stop.style.color = '#4ade80';
      if (mapWrap) mapWrap.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';
      notifyArrival(data.stop);

    } else if (data.status === 'riding' && !isStale) {
      icon.textContent = '🚌';
      label.textContent = 'Nakasakay sa jeep';
      label.style.color = '#fff';
      stop.textContent = data.stop ? `Papunta: ${data.stop}` : 'Nagsasabay...';
      stop.style.color = '#feb700';

      if (data.lat && data.lon) {
        showWatcherMap(data.lat, data.lon, data.stop);
      } else {
        if (mapWrap) mapWrap.style.display = 'none';
        if (placeholder) {
          placeholder.style.display = 'flex';
          const placeholderLabel = placeholder.querySelector('span:last-child');
          if (placeholderLabel) {
            placeholderLabel.textContent = ago !== null && ago > 30
              ? 'GPS signal mahina, hinihintay...'
              : 'Hinihintay ang GPS signal...';
          }
        }
      }

    } else if (data.status === 'offline' || isStale) {
      icon.textContent = '📵';
      label.textContent = isStale && data.status !== 'offline' ? 'Pahinga (walang update)' : 'Offline';
      label.style.color = '#888';
      stop.textContent = '';
      if (mapWrap) mapWrap.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';

    } else {
      icon.textContent = '⏳';
      label.textContent = 'Naghihintay...';
      label.style.color = '#fff';
      stop.textContent = '';
      if (mapWrap) mapWrap.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    }
  }

  function pollWatcher() {
    const firebaseUrl = `${FIREBASE_URL}/watch/${encodeURIComponent(watchId)}.json`;

    fetch(firebaseUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Firebase poll failed: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        updateWatcherUI(data);
      })
      .catch(err => {
        console.warn('Watcher poll error:', err);
        const label = document.getElementById('watcher-status-text');
        if (label) {
          label.textContent = 'Hindi ma-konekta...';
          label.style.color = '#888';
        }
      });
  }

  loadLeaflet().catch(() => {});
  pollWatcher();
  pollIntervalId = setInterval(pollWatcher, 5000);

  window.addEventListener('beforeunload', () => {
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  });
}