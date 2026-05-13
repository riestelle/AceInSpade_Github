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
  const searchNormal = document.getElementById('gps-search-normal');
  const expandBtn = document.getElementById('gps-expand-btn-map');
  const locationInfo = document.getElementById('gps-location-info');
  const legend = document.getElementById('gps-map-legend');
  
  gpsMapExpanded = !gpsMapExpanded;
  
  if (gpsMapExpanded) {
    map.classList.add('fullscreen');
    controls.classList.remove('d-none');
    expandBtn.classList.add('d-none');
    main.style.padding = '0';
    main.style.gap = '0';
    screen.style.overflow = 'hidden';
    searchNormal.classList.add('d-none');
    
    // Move search bar inside map
    const searchClone = searchNormal.cloneNode(true);
    searchClone.id = 'gps-search-expanded';
    searchClone.className = 'search-wrap gps-search-expanded';
    container.appendChild(searchClone);
    
    // Sync input values
    const expandedInput = searchClone.querySelector('input');
    if (expandedInput) {
      expandedInput.value = document.getElementById('gps-search').value;
      expandedInput.addEventListener('input', function() {
        document.getElementById('gps-search').value = this.value;
        document.getElementById('gps-search').dispatchEvent(new Event('input'));
      });
    }
    
    // Show legend and location info
    locationInfo.classList.remove('d-none');
    legend.classList.remove('d-none');
  } else {
    map.classList.remove('fullscreen');
    controls.classList.add('d-none');
    expandBtn.classList.remove('d-none');
    main.style.padding = '16px 24px';
    main.style.gap = '16px';
    screen.style.overflow = 'auto';
    searchNormal.classList.remove('d-none');
    
    // Remove expanded search bar
    const expandedSearch = container.querySelector('#gps-search-expanded');
    if (expandedSearch) expandedSearch.remove();
    
    // Hide legend and location info
    locationInfo.classList.add('d-none');
    legend.classList.add('d-none');
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

function previewGPSStop(id) {
  const stop = STOPS_DB.find(s => s.id === id);
  if (!stop) return;
  
  // Pan map to this stop
  initLeafletMap();
  leafletMap.setView([stop.lat, stop.lon], 16);
  
  // Update all preview markers - highlight this one
  Object.entries(gpsStopMarkers).forEach(([stopId, marker]) => {
    if (stopId === id) {
      marker.setStyle({ radius: 10, fillOpacity: 0.8, weight: 3 });
      marker.openPopup();
    } else {
      marker.setStyle({ radius: 7, fillOpacity: 0.5, weight: 2 });
      marker.closePopup();
    }
  });
  
  // Show preview card
  const previewCard = document.getElementById('gps-preview-card');
  previewCard.classList.remove('d-none');
  document.getElementById('preview-stop-name').textContent = stop.name;
  document.getElementById('preview-stop-route').textContent = getRouteShortCode(stop.routeId);
  
  // Show distance if available
  if (gpsCurrentPosition) {
    const dist = haversine(
      gpsCurrentPosition.latitude,
      gpsCurrentPosition.longitude,
      stop.lat,
      stop.lon
    );
    const distLabel = dist < 1000 
      ? `${Math.round(dist)}m from your location`
      : `${(dist / 1000).toFixed(2)}km from your location`;
    document.getElementById('preview-stop-distance').textContent = distLabel;
    document.getElementById('preview-stop-distance').classList.remove('d-none');
  } else {
    document.getElementById('preview-stop-distance').classList.add('d-none');
  }
  
  // Set the stop for confirmation
  document.getElementById('preview-confirm-btn').onclick = () => selectGPSStop(id);
  document.getElementById('preview-cancel-btn').onclick = () => {
    previewCard.classList.add('d-none');
  };
}

function initGPS() {
  cleanupGPS();
  gpsSelectedStop = null;
  gpsAlertActive  = false;
  gpsCurrentPosition = null;
  document.getElementById('gps-search').value = '';
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('gps-distance').classList.add('d-none');
  document.getElementById('gps-preview-card').classList.add('d-none');
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

// Flexible regex search matcher - handles ambiguous queries
// Fuzzy search score - rates how well a string matches a pattern
function fuzzySearchScore(str, pattern) {
  str = str.toLowerCase();
  pattern = pattern.toLowerCase();
  
  let score = 0;
  let patternIdx = 0;
  let strIdx = 0;
  
  while (patternIdx < pattern.length && strIdx < str.length) {
    if (pattern[patternIdx] === str[strIdx]) {
      score += 1;
      patternIdx++;
    }
    strIdx++;
  }
  
  // Bonus for contiguous matches
  if (patternIdx === pattern.length) {
    score += (pattern.length * 10);
  }
  
  // Penalty for long search needed
  score -= (strIdx - patternIdx);
  
  return score;
}

function createFlexibleRegex(query) {
  const cleaned = query
    .toLowerCase()
    .replace(/[.,:;!?'\-—–]/g, '')  // Remove punctuation
    .trim();
  
  if (cleaned.length === 0) return null;
  
  // For single character queries, match anything starting with it
  if (cleaned.length === 1) {
    try {
      return new RegExp(`\\b${cleaned}`, 'i');
    } catch (e) {
      return null;
    }
  }
  
  // For longer queries, create flexible pattern allowing partial matches
  // Each character can have optional letters between them
  const chars = cleaned.split('');
  const pattern = chars.map((char, i) => {
    // Last character doesn't need flexibility after it
    if (i === chars.length - 1) {
      return char;
    }
    // Allow 0-3 any characters between search chars
    return char + '.{0,3}?';
  }).join('');
  
  try {
    return new RegExp(pattern, 'i');
  } catch (e) {
    return null;
  }
}

// Score search results by relevance
function scoreSearchResult(stop, query) {
  const stopName = stop.name.toLowerCase();
  const routeCode = getRouteShortCode(stop.routeId).toLowerCase();
  const qLower = query.trim().toLowerCase().replace(/[.,:;!?'\-—–]/g, '');
  
  let score = 0;
  
  // Exact matches (ignoring punctuation)
  const stopNameCleaned = stopName.replace(/[.,:;!?'\-—–]/g, '');
  if (stopNameCleaned === qLower || routeCode === qLower) {
    score += 10000;
  }
  
  // Starts with query
  if (stopNameCleaned.startsWith(qLower) || routeCode.startsWith(qLower)) {
    score += 5000;
  }
  
  // Starts with any word in query
  const queryWords = qLower.split(/\s+/).filter(w => w);
  queryWords.forEach(word => {
    if (stopNameCleaned.startsWith(word)) score += 1000;
    if (routeCode.startsWith(word)) score += 800;
  });
  
  // Contains as word boundary
  queryWords.forEach(word => {
    if (new RegExp(`\\b${word}`, 'i').test(stopName)) score += 300;
    if (new RegExp(`\\b${word}`, 'i').test(routeCode)) score += 200;
  });
  
  // Substring match (no spaces/punctuation)
  if (stopNameCleaned.includes(qLower.replace(/\s+/g, ''))) {
    score += 100;
  }
  
  // Partial substring match
  if (stopName.includes(qLower)) {
    score += 50;
  }
  
  return score;
}

document.getElementById('gps-search').addEventListener('input', function() {
  const q = this.value.trim();
  
  if (q.length < 1) {
    document.getElementById('gps-dropdown').classList.add('d-none');
    if (leafletPreviewMarker) { leafletPreviewMarker.remove(); leafletPreviewMarker = null; }
    Object.values(gpsStopMarkers).forEach(marker => marker.remove());
    gpsStopMarkers = {};
    return;
  }

  // Use flexible regex matching
  const regex = createFlexibleRegex(q);
  
  // Filter and score results
  let results = [];
  if (regex) {
    results = STOPS_DB
      .filter(s => 
        regex.test(s.name) || 
        regex.test(getRouteShortCode(s.routeId))
      )
      .map(s => ({
        stop: s,
        score: scoreSearchResult(s, q)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.stop);
  }

  // Render dropdown results
  const dd = document.getElementById('gps-dropdown');
  if (!results.length) { dd.classList.add('d-none'); return; }
  dd.classList.remove('d-none');
  dd.innerHTML = results.map(s => {
    // Highlight matched portions
    const qLower = q.toLowerCase().replace(/[.,:;!?'\-—–]/g, '');
    let highlightedName = s.name;
    
    // Try to highlight the first matched word
    const nameWords = s.name.split(/(\s+)/);
    let foundMatch = false;
    const highlightedWords = nameWords.map(word => {
      if (!foundMatch && word.toLowerCase().replace(/[.,:;!?'\-—–]/g, '').includes(qLower.split(/\s+/)[0])) {
        foundMatch = true;
        return `<strong style="color:var(--amber)">${word}</strong>`;
      }
      return word;
    });
    highlightedName = highlightedWords.join('');
    
    return `<button class="stop-item" onclick="previewGPSStop('${s.id}')" style="text-align:left">
      <span style="font-size:15px;font-weight:700;text-transform:uppercase">${highlightedName}</span>
      <span style="font-size:12px;color:var(--text-muted)">${getRouteShortCode(s.routeId)}</span>
    </button>`;
  }).join('');

  // Show all results as preview markers on map
  initLeafletMap();
  
  // Clear old preview markers
  Object.values(gpsStopMarkers).forEach(marker => marker.remove());
  gpsStopMarkers = {};
  
  // Add all results as preview markers
  results.forEach(stop => {
    const marker = L.circleMarker([stop.lat, stop.lon], {
      radius: 7,
      color: '#feb700',
      fillColor: '#feb700',
      fillOpacity: 0.5,
      weight: 2,
      dashArray: '3 3',
    }).addTo(leafletMap)
      .bindPopup(`<b>${stop.name}</b><br/>${getRouteShortCode(stop.routeId)}`)
      .on('click', () => previewGPSStop(stop.id));
    
    gpsStopMarkers[stop.id] = marker;
  });

  // Pan to first result to show all results
  if (results.length > 0) {
    const bounds = L.latLngBounds(results.map(s => [s.lat, s.lon]));
    leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    document.getElementById('map-label').style.display = 'none';
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
      
      // Update location info
      const locationInfo = document.getElementById('gps-location-info');
      if (locationInfo && !locationInfo.classList.contains('d-none')) {
        document.getElementById('gps-location-coords').textContent = `${userLat.toFixed(4)}°, ${userLon.toFixed(4)}°`;
        document.getElementById('gps-location-desc').innerHTML = `Accuracy: ±${Math.round(accuracy)}m`;
      }

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
  document.getElementById('gps-preview-card').classList.add('d-none');
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

// Help modal for "How to set stop"
document.getElementById('gps-help-btn').addEventListener('click', () => {
  const modal = document.createElement('div');
  modal.className = 'help-modal-overlay';
  modal.innerHTML = `
    <div class="help-modal">
      <div class="help-modal-title">📍 How to Set Your Stop</div>
      <div class="help-modal-section">
        <div class="help-modal-step"><strong>1. Search:</strong> Type a stop name or route code in the search box.</div>
        <div class="help-modal-step"><strong>2. Preview:</strong> All matching stops appear as dashed markers on the map.</div>
        <div class="help-modal-step"><strong>3. Select:</strong> Tap a marker or result to see a preview card with distance.</div>
        <div class="help-modal-step"><strong>4. Confirm:</strong> Tap "CONFIRM" to set it as your destination.</div>
        <div class="help-modal-step"><strong>5. Alert:</strong> Tap "SET ALERT" to start GPS tracking to your stop.</div>
      </div>
      <div class="help-modal-section">
        <strong style="color:var(--amber);font-size:12px;text-transform:uppercase">Vibration Alerts:</strong>
        <div class="help-modal-step">🟡 250m away: Soft pulse</div>
        <div class="help-modal-step">🟠 200m away: Medium vibration</div>
        <div class="help-modal-step">🔴 ≤150m: Strong vibration + arrival screen</div>
      </div>
      <button onclick="this.closest('.help-modal-overlay').remove()" style="width:100%;height:48px;background:var(--amber);color:#271900;border:none;border-radius:8px;font-weight:700;margin-top:12px;cursor:pointer">CLOSE</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
});

// AI Guide button - provides safe arrival guidance
document.getElementById('gps-ai-guide-btn').addEventListener('click', async () => {
  if (!gpsSelectedStop) {
    alert('Please select a destination stop first.');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'help-modal-overlay';
  modal.innerHTML = `
    <div class="help-modal">
      <div class="help-modal-title">🤖 Safe Arrival Guide</div>
      <div class="help-modal-section">
        <strong style="color:var(--amber);font-size:13px">${gpsSelectedStop.name}</strong>
        <div class="help-modal-step" style="margin-top:8px;font-size:12px;color:var(--text-muted)">Route: ${getRouteShortCode(gpsSelectedStop.routeId)}</div>
      </div>
      <div class="help-modal-section">
        <div class="help-modal-step"><strong>Before You Arrive:</strong></div>
        <div class="help-modal-step">• Keep phone volume on or vibration enabled</div>
        <div class="help-modal-step">• Watch for our GPS alerts at 250m, 200m, and 150m</div>
        <div class="help-modal-step">• Stay seated until the final alert</div>
      </div>
      <div class="help-modal-section">
        <div class="help-modal-step"><strong>When You Arrive (Final Alert):</strong></div>
        <div class="help-modal-step">• Watch for the arrival screen notification</div>
        <div class="help-modal-step">• Signal the driver: "Para po!" or use hand signals</div>
        <div class="help-modal-step">• Wait for jeepney to slow down before standing</div>
        <div class="help-modal-step">• Exit safely on the right side near your stop</div>
      </div>
      <div class="help-modal-section">
        <div class="help-modal-step"><strong>Safety Tips:</strong></div>
        <div class="help-modal-step">• Keep your belonging secure while traveling</div>
        <div class="help-modal-step">• If unsure, ask fellow passengers or the driver</div>
        <div class="help-modal-step">• Use the "Pamilya" feature to share your location</div>
      </div>
      <button onclick="this.closest('.help-modal-overlay').remove()" style="width:100%;height:48px;background:var(--amber);color:#271900;border:none;border-radius:8px;font-weight:700;margin-top:12px;cursor:pointer">CLOSE</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
});