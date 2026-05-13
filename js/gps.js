//  GPS STOP ALERT

let gpsSelectedStop  = null;
let gpsAlertActive   = false;
let gpsWatchId       = null;
let gpsLiveWatchId    = null;
let gpsLiveMarker     = null;
let gpsLiveAccuracy   = null;
let gpsPermissionRequested = false;
let gpsPermissionRetryTimeout = null;
let gpsLocatorTimeout = null;
let gpsMapExpanded = false;
let gpsStopMarkers = {};
let gpsCurrentPosition = null;
let gpsWakeLock = null;
let gpsNotifPermission = false;

function toggleMapExpand() {
  const map = document.getElementById('leaflet-map');
  const container = document.getElementById('gps-map-container');
  const controls = document.getElementById('gps-map-controls');
  const screen = document.getElementById('screen-gps');
  const main = screen.querySelector('main');
  
  gpsMapExpanded = !gpsMapExpanded;
  
  if (gpsMapExpanded) {
    map.classList.add('fullscreen');
    controls.classList.remove('d-none');
    main.style.padding = '0';
    main.style.gap = '0';
    screen.style.overflow = 'hidden';
  } else {
    map.classList.remove('fullscreen');
    controls.classList.add('d-none');
    main.style.padding = '16px 24px';
    main.style.gap = '16px';
    screen.style.overflow = 'auto';
  }
  
  requestAnimationFrame(() => {
    if (leafletMap) {
      leafletMap.invalidateSize();
    }
  });
}

function updateStopMarkers() {
  if (!leafletMap) return;
  
  const bounds = leafletMap.getBounds();
  const visibleStops = STOPS_DB.filter(stop => {
    const latlng = L.latLng(stop.lat, stop.lon);
    return bounds.contains(latlng);
  });
  
  // Remove old markers
  Object.values(gpsStopMarkers).forEach(marker => marker.remove());
  gpsStopMarkers = {};
  
  // Add new markers for visible stops
  visibleStops.forEach(stop => {
    const marker = L.circleMarker([stop.lat, stop.lon], {
      radius: 6,
      color: gpsSelectedStop?.id === stop.id ? '#feb700' : '#888',
      fillColor: gpsSelectedStop?.id === stop.id ? '#feb700' : '#999',
      fillOpacity: 0.6,
      weight: 2,
    }).addTo(leafletMap)
      .bindPopup(`<b>${stop.name}</b><br/>${getRouteShortCode(stop.routeId)}`)
      .on('click', () => selectGPSStop(stop.id));
    
    gpsStopMarkers[stop.id] = marker;
  });
}

function updateDistanceDisplay() {
  if (!gpsCurrentPosition || !gpsSelectedStop) return;
  
  const dist = haversine(
    gpsCurrentPosition.latitude,
    gpsCurrentPosition.longitude,
    gpsSelectedStop.lat,
    gpsSelectedStop.lon
  );
  
  const distLabel = dist < 1000 
    ? `${Math.round(dist)}m away`
    : `${(dist / 1000).toFixed(2)}km away`;
  
  document.getElementById('selected-stop-distance').textContent = `📍 ${distLabel}`;
}

function initGPS() {
  cleanupGPS();
  gpsSelectedStop = null;
  gpsAlertActive  = false;
  gpsCurrentPosition = null;
  document.getElementById('gps-search').value = '';
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('gps-distance').classList.add('d-none');
  if (leafletPreviewMarker) { leafletPreviewMarker.remove(); leafletPreviewMarker = null; }
  document.getElementById('selected-stop-card').classList.add('d-none');
  document.getElementById('alert-active-msg').classList.add('d-none');
  document.getElementById('gps-error').classList.add('d-none');
  const mapLabel = document.getElementById('map-label');
  if (mapLabel) mapLabel.textContent = 'Select a stop above';
  initLeafletMap();
  requestAnimationFrame(() => {
    if (leafletMap) {
      leafletMap.invalidateSize();
      updateStopMarkers();
    }
  });
  startLiveLocator();
}

document.getElementById('gps-search').addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  if (q.length < 2) {
    document.getElementById('gps-dropdown').classList.add('d-none');
    // Clear any preview markers if query too short
    if (leafletPreviewMarker) { leafletPreviewMarker.remove(); leafletPreviewMarker = null; }
    return;
  }

  const results = STOPS_DB.filter(s =>
    s.name.toLowerCase().includes(q) ||
    getRouteShortCode(s.routeId).toLowerCase().includes(q)
  ).slice(0, 6);

  const dd = document.getElementById('gps-dropdown');
  if (!results.length) { dd.classList.add('d-none'); return; }
  dd.classList.remove('d-none');
  dd.innerHTML = results.map(s =>
    `<button class="stop-item" onclick="selectGPSStop('${s.id}')">
      <span style="font-size:15px;font-weight:700;text-transform:uppercase">${s.name}</span>
      <span style="font-size:12px;color:var(--text-muted)">${getRouteShortCode(s.routeId)}</span>
    </button>`
  ).join('');

  // Show map and pan to first result as preview
  if (results.length > 0) {
    const first = results[0];
    initLeafletMap();
    leafletMap.setView([first.lat, first.lon], 15);
    document.getElementById('map-label').style.display = 'none';

    // Show a dim preview marker
    if (leafletPreviewMarker) leafletPreviewMarker.remove();
    leafletPreviewMarker = L.circleMarker([first.lat, first.lon], {
      radius: 8, color: '#888', fillColor: '#888', fillOpacity: 0.5, weight: 2,
      dashArray: '4 4',
    }).addTo(leafletMap).bindTooltip(first.name, { permanent: false });

    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 50);
  }
});

let leafletMap = null;
let leafletMarker = null;
let leafletPreviewMarker = null;

function initLeafletMap() {
  if (leafletMap) return;
  leafletMap = L.map('leaflet-map', { zoomControl: true, attributionControl: false })
    .setView([14.5995, 120.9842], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(leafletMap);
  
  // Update stop markers when map moves/zooms
  leafletMap.on('moveend', updateStopMarkers);
  
  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
  }, 100);
}

function startLocationWatch() {
  // Clear any existing timeout
  if (gpsLocatorTimeout) clearTimeout(gpsLocatorTimeout);

  // Set 30-second timeout for location watch
  gpsLocatorTimeout = setTimeout(() => {
    if (gpsLiveWatchId !== null && !gpsLiveMarker) {
      const errEl = document.getElementById('gps-error');
      errEl.classList.remove('d-none');
      errEl.textContent = 'Location timeout. Ensure GPS is enabled and try again.';
    }
  }, 30000);

  gpsLiveWatchId = navigator.geolocation.watchPosition(
    pos => {
      // Clear timeout on first successful position
      if (gpsLocatorTimeout) {
        clearTimeout(gpsLocatorTimeout);
        gpsLocatorTimeout = null;
      }

      const userLat = pos.coords.latitude;
      const userLon = pos.coords.longitude;
      const accuracy = Math.max(15, pos.coords.accuracy || 50);

      // Store current position for distance calculations
      gpsCurrentPosition = { latitude: userLat, longitude: userLon };

      initLeafletMap();

      if (!gpsLiveMarker) {
        gpsLiveMarker = L.circleMarker([userLat, userLon], {
          radius: 8,
          color: '#60a5fa',
          fillColor: '#60a5fa',
          fillOpacity: 1,
          weight: 3,
        }).addTo(leafletMap).bindPopup('You are here');
      } else {
        gpsLiveMarker.setLatLng([userLat, userLon]);
      }

      if (!gpsLiveAccuracy) {
        gpsLiveAccuracy = L.circle([userLat, userLon], {
          radius: accuracy,
          color: '#60a5fa',
          fillColor: '#60a5fa',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(leafletMap);
      } else {
        gpsLiveAccuracy.setLatLng([userLat, userLon]);
        gpsLiveAccuracy.setRadius(accuracy);
      }
      
      // Update distance if a stop is selected
      if (gpsSelectedStop) {
        updateDistanceDisplay();
      }
    },
    err => {
      const errEl = document.getElementById('gps-error');
      errEl.classList.remove('d-none');
      if (err.code === 1) {
        errEl.textContent = 'Location permission denied. Tap "Enable Location" button below.';
        showGPSPermissionButton();
      } else if (err.code === 3) {
        errEl.textContent = 'Location timeout. Check GPS settings.';
      } else {
        errEl.textContent = 'GPS error: ' + err.message;
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

function requestGPSPermission() {
  if (!navigator.geolocation) {
    const err = document.getElementById('gps-error');
    err.classList.remove('d-none');
    err.textContent = 'Live GPS locator is not available on this device.';
    return;
  }

  // Clear any pending retry
  if (gpsPermissionRetryTimeout) clearTimeout(gpsPermissionRetryTimeout);

  gpsPermissionRequested = true;
  saveStorage('gps_permission_requested', true);

  navigator.geolocation.getCurrentPosition(
    pos => {
      // Permission granted, start watching location
      document.getElementById('gps-error').classList.add('d-none');
      hideGPSPermissionButton();
      startLocationWatch();
    },
    err => {
      if (err.code === 1) {
        // Permission denied - show button but don't retry
        const errEl = document.getElementById('gps-error');
        errEl.classList.remove('d-none');
        errEl.textContent = 'Location permission denied. Tap "Enable Location" button below.';
        showGPSPermissionButton();
      } else if (err.code === 3) {
        // Timeout - show button to retry
        const errEl = document.getElementById('gps-error');
        errEl.classList.remove('d-none');
        errEl.textContent = 'Location request timed out. Tap "Enable Location" to retry.';
        showGPSPermissionButton();
      } else {
        const errEl = document.getElementById('gps-error');
        errEl.classList.remove('d-none');
        errEl.textContent = 'Error: ' + err.message;
      }
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function showGPSPermissionButton() {
  let permBtn = document.getElementById('gps-permission-btn');
  if (!permBtn) {
    permBtn = document.createElement('button');
    permBtn.id = 'gps-permission-btn';
    permBtn.className = 'btn-primary-sp';
    permBtn.style.marginTop = '12px';
    permBtn.innerHTML = '<span class="material-symbols-outlined">location_on</span> Enable Location Access';
    permBtn.addEventListener('click', requestGPSPermission);
    document.querySelector('#screen-gps main').appendChild(permBtn);
  }
  permBtn.classList.remove('d-none');
}

function hideGPSPermissionButton() {
  const permBtn = document.getElementById('gps-permission-btn');
  if (permBtn) permBtn.classList.add('d-none');
}

function startLiveLocator() {
  if (!navigator.geolocation) {
    const err = document.getElementById('gps-error');
    err.classList.remove('d-none');
    err.textContent = 'Live GPS locator is not available on this device.';
    return;
  }

  // Check if we've already asked for permission
  const wasRequested = loadStorage('gps_permission_requested', false);
  
  if (!gpsPermissionRequested && !wasRequested) {
    // First time - request permission
    gpsPermissionRequested = true;
    requestGPSPermission();
  } else if (gpsPermissionRequested) {
    // Already requested in this session - just start watching
    startLocationWatch();
  } else {
    // Was requested before - try to start watching directly
    gpsPermissionRequested = true;
    startLocationWatch();
  }
}

function cleanupGPS() {
  // Clear all timeouts
  if (gpsLocatorTimeout) clearTimeout(gpsLocatorTimeout);
  if (gpsPermissionRetryTimeout) clearTimeout(gpsPermissionRetryTimeout);
  gpsLocatorTimeout = null;
  gpsPermissionRetryTimeout = null;

  // Release wake lock
  releaseWakeLock();

  // Clear location watches
  if (gpsLiveWatchId !== null) {
    navigator.geolocation.clearWatch(gpsLiveWatchId);
    gpsLiveWatchId = null;
  }
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }

  // Remove markers
  if (gpsLiveMarker) {
    gpsLiveMarker.remove();
    gpsLiveMarker = null;
  }
  if (gpsLiveAccuracy) {
    gpsLiveAccuracy.remove();
    gpsLiveAccuracy = null;
  }
  
  // Remove stop markers
  Object.values(gpsStopMarkers).forEach(marker => marker.remove());
  gpsStopMarkers = {};
  
  // Hide tracking indicator
  const trackingBadge = document.getElementById('home-tracking-badge');
  if (trackingBadge) trackingBadge.classList.add('d-none');
  
  // Reset map expand state
  gpsMapExpanded = false;
  const map = document.getElementById('leaflet-map');
  if (map) {
    map.classList.remove('fullscreen');
  }
  const controls = document.getElementById('gps-map-controls');
  if (controls) {
    controls.classList.add('d-none');
  }
  const screen = document.getElementById('screen-gps');
  if (screen) {
    const main = screen.querySelector('main');
    if (main) {
      main.style.padding = '16px 24px';
      main.style.gap = '16px';
    }
    screen.style.overflow = 'auto';
  }

  hideGPSPermissionButton();
}

// ── WAKE LOCK ──────────────────────────────────────────────────────────────────
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    gpsWakeLock = await navigator.wakeLock.request('screen');
    gpsWakeLock.addEventListener('release', () => { gpsWakeLock = null; });
  } catch (e) {
    // Wake lock failed silently — not critical
  }
}

function releaseWakeLock() {
  if (gpsWakeLock) {
    gpsWakeLock.release();
    gpsWakeLock = null;
  }
}

// Re-acquire wake lock if page becomes visible again (e.g. user switched back)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && gpsAlertActive && !gpsWakeLock) {
    await requestWakeLock();
  }
});

// ── NOTIFICATIONS ──────────────────────────────────────────────────────────────
async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    gpsNotifPermission = true;
    return;
  }
  if (Notification.permission !== 'denied') {
    const result = await Notification.requestPermission();
    gpsNotifPermission = result === 'granted';
  }
}

function fireStopNotification(stopName) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('🚏 You\'re almost there!', {
    body: `Approaching ${stopName} — time to get ready!`,
    icon: '/icon.png',
    tag: 'gps-stop-alert',       // prevents duplicate notifs
    renotify: false,
    requireInteraction: true,    // stays on screen until dismissed
  });
}

function fireNearNotification(stopName) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('📍 Getting close!', {
    body: `Less than 200m from ${stopName}`,
    icon: '/icon.png',
    tag: 'gps-near-alert',
    renotify: true,
  });
}

function panMapToStop(stop) {
  initLeafletMap();
  leafletMap.setView([stop.lat, stop.lon], 16);
  if (leafletPreviewMarker) { leafletPreviewMarker.remove(); leafletPreviewMarker = null; }
  if (leafletMarker) leafletMarker.remove();
  leafletMarker = L.circleMarker([stop.lat, stop.lon], {
    radius: 10, color: '#feb700', fillColor: '#feb700', fillOpacity: 1, weight: 3
  }).addTo(leafletMap).bindPopup(`<b>${stop.name}</b>`).openPopup();
  requestAnimationFrame(() => {
    if (leafletMap) leafletMap.invalidateSize();
  });
}

function selectGPSStop(id) {
  const stop = STOPS_DB.find(s => s.id === id);
  if (!stop) return;
  gpsSelectedStop = stop;
  document.getElementById('gps-search').value = stop.name;
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.remove('d-none');
  document.getElementById('selected-stop-name').textContent  = stop.name;
  document.getElementById('selected-stop-route').textContent = getRouteShortCode(stop.routeId);
  panMapToStop(stop);
  updateStopMarkers();
  
  // Update distance display if we have current position
  if (gpsCurrentPosition) {
    updateDistanceDisplay();
  }
  
  // Save for family sharing
  if (typeof saveStorage === 'function') {
    saveStorage('family_selected_stop', stop.name);
  }
  const alertBtn = document.getElementById('set-alert-btn');
  alertBtn.disabled = false;
  alertBtn.textContent = '';
  alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
  vibrate(40);
}

document.getElementById('set-alert-btn').addEventListener('click', () => {
  if (!gpsSelectedStop || gpsAlertActive) return;
  gpsAlertActive = true;
  vibrate([100,50,100]);

  // Keep screen on + request notification permission
  requestWakeLock();
  requestNotifPermission();

  const alertBtn = document.getElementById('set-alert-btn');
  alertBtn.disabled = true;
  alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> ALERT ACTIVE';
  document.getElementById('alert-active-msg').classList.remove('d-none');
  
  // Show tracking indicator on home screen
  const trackingBadge = document.getElementById('home-tracking-badge');
  if (trackingBadge) trackingBadge.classList.remove('d-none');

  if (!navigator.geolocation) {
    const err = document.getElementById('gps-error');
    err.classList.remove('d-none');
    err.textContent = 'GPS not available on this device.';
    return;
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const dist = haversine(pos.coords.latitude, pos.coords.longitude, gpsSelectedStop.lat, gpsSelectedStop.lon);
      
      // Update distance display during alert
      const distLabel = dist < 1000 
        ? `${Math.round(dist)}m to stop`
        : `${(dist / 1000).toFixed(2)}km to stop`;
      document.getElementById('gps-distance').classList.remove('d-none');
      document.getElementById('gps-distance').textContent = `📍 ${distLabel}`;
      
      if (dist <= 150) {
        vibrate('signal');
        fireStopNotification(gpsSelectedStop.name);
        releaseWakeLock();
        // Notify family if sharing is active
        if (typeof notifyFamilyAlert === 'function') {
          notifyFamilyAlert(gpsSelectedStop.name);
        }
        navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null;
        navigate('alert', { stopName: gpsSelectedStop.name });
      } else if (dist <= 200) {
        vibrate('near');
        fireNearNotification(gpsSelectedStop.name);
      } else if (dist <= 250) {
        vibrate('approach');
      }
    },
    err => {
      const errEl = document.getElementById('gps-error');
      errEl.classList.remove('d-none');
      if (err.code === 1) {
        errEl.textContent = 'Location permission denied for alert.';
      } else {
        errEl.textContent = 'GPS error: ' + err.message;
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
});