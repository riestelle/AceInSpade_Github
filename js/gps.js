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

function initGPS() {
  cleanupGPS();
  gpsSelectedStop = null;
  gpsAlertActive  = false;
  document.getElementById('gps-search').value = '';
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.add('d-none');
  document.getElementById('alert-active-msg').classList.add('d-none');
  document.getElementById('gps-error').classList.add('d-none');
  const mapLabel = document.getElementById('map-label');
  if (mapLabel) mapLabel.textContent = 'Select a stop above';
  initLeafletMap();
  requestAnimationFrame(() => {
    if (leafletMap) {
      leafletMap.invalidateSize();
    }
  });
  startLiveLocator();
}

document.getElementById('gps-search').addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  if (q.length < 2) { document.getElementById('gps-dropdown').classList.add('d-none'); return; }

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
});

let leafletMap = null;
let leafletMarker = null;

function initLeafletMap() {
  if (leafletMap) return;
  leafletMap = L.map('leaflet-map', { zoomControl: true, attributionControl: false })
    .setView([14.5995, 120.9842], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(leafletMap);
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

  hideGPSPermissionButton();
}

function panMapToStop(stop) {
  initLeafletMap();
  leafletMap.setView([stop.lat, stop.lon], 16);
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

  const alertBtn = document.getElementById('set-alert-btn');
  alertBtn.disabled = true;
  alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> ALERT ACTIVE';
  document.getElementById('alert-active-msg').classList.remove('d-none');

  if (!navigator.geolocation) {
    const err = document.getElementById('gps-error');
    err.classList.remove('d-none');
    err.textContent = 'GPS not available on this device.';
    return;
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const dist = haversine(pos.coords.latitude, pos.coords.longitude, gpsSelectedStop.lat, gpsSelectedStop.lon);
      if (dist <= 150) {
        vibrate('signal');
        // Notify family if sharing is active
        if (typeof notifyFamilyAlert === 'function') {
          notifyFamilyAlert(gpsSelectedStop.name);
        }
        navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null;
        navigate('alert', { stopName: gpsSelectedStop.name });
      } else if (dist <= 200) {
        vibrate('near');
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