//  GPS STOP ALERT

let gpsSelectedStop  = null;
let gpsAlertActive   = false;
let gpsWatchId       = null;
let gpsLiveWatchId    = null;
let gpsLiveMarker     = null;
let gpsLiveAccuracy   = null;
let gpsPreviewMarker  = null;
let gpsPreviewStop    = null;
let gpsProgressStartDistance = null;
let gpsPermissionRequested = false;
let gpsPermissionRetryTimeout = null;
let gpsLocatorTimeout = null;
let gpsMapExpanded = false;
let gpsStopMarkers = {};
let gpsCurrentPosition = null;
let gpsWakeLock = null;
let gpsNotifPermission = false;
let gpsLastProgressNotificationAt = 0;
let gpsLastProgressNotificationStage = '';
let gpsSearchFetchTimeout = null;
let gpsSearchController = null;
let gpsCurrentSearchQuery = '';

function saveGPSState() {
  try {
    const storage = window.sessionStorage || window.localStorage;
    if (gpsSelectedStop) {
      storage.setItem('gps_selected_stop', JSON.stringify({
        id: gpsSelectedStop.id,
        name: gpsSelectedStop.name,
        lat: gpsSelectedStop.lat,
        lon: gpsSelectedStop.lon,
        routeId: gpsSelectedStop.routeId || null,
        type: gpsSelectedStop.type || 'local'
      }));
    } else {
      storage.removeItem('gps_selected_stop');
    }
    storage.setItem('gps_alert_active', JSON.stringify(gpsAlertActive));
  } catch (e) {
    // ignore storage errors
  }
}

function loadPersistedGPSState() {
  try {
    const storage = window.sessionStorage || window.localStorage;

    // Clean up any legacy localStorage values from old versions.
    if (window.localStorage && window.sessionStorage) {
      window.localStorage.removeItem('gps_selected_stop');
      window.localStorage.removeItem('gps_alert_active');
    }

    const rawStop = storage.getItem('gps_selected_stop');
    const storedStop = rawStop ? JSON.parse(rawStop) : null;
    if (storedStop && storedStop.id) {
      if (storedStop.type === 'osm') {
        gpsSelectedStop = storedStop;
      } else {
        const stop = STOPS_DB.find(s => s.id === storedStop.id);
        gpsSelectedStop = stop || storedStop;
      }
    }
    const rawActive = storage.getItem('gps_alert_active');
    gpsAlertActive = rawActive !== null ? JSON.parse(rawActive) : false;
  } catch (e) {
    gpsSelectedStop = null;
    gpsAlertActive = false;
  }
}

window.addEventListener('beforeunload', () => {
  try {
    const storage = window.sessionStorage || window.localStorage;
    storage.removeItem('gps_selected_stop');
    storage.removeItem('gps_alert_active');
  } catch (e) {
    // ignore storage errors
  }
});

function syncGPSSearchInput(value) {
  const mainInput = document.getElementById('gps-search');
  if (mainInput) mainInput.value = value;
  const expanded = document.querySelector('#gps-search-expanded input');
  if (expanded) expanded.value = value;
  const dropdown = document.getElementById('gps-dropdown');
  if (dropdown) {
    dropdown.classList.add('d-none');
    dropdown.innerHTML = '';
  }
}

function updateGPSActionButton() {
  const alertBtn = document.getElementById('set-alert-btn');
  if (!alertBtn) return;
  const cancelBtn = document.getElementById('cancel-alert-btn');
  if (gpsAlertActive) {
    alertBtn.disabled = false;
    alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">refresh</span> CHANGE DESTINATION';
    alertBtn.title = 'Choose a new destination for your alert';
    document.getElementById('alert-active-msg').classList.remove('d-none');
    const trackingBadge = document.getElementById('home-tracking-badge');
    if (trackingBadge) trackingBadge.classList.remove('d-none');
    const sakayBtn = document.getElementById('sakay-na-btn');
    if (sakayBtn) sakayBtn.classList.remove('d-none');
    if (cancelBtn) cancelBtn.classList.remove('d-none');
  } else {
    alertBtn.disabled = false;
    alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
    alertBtn.title = 'Set an alert for your selected stop';
    document.getElementById('alert-active-msg').classList.add('d-none');
    const sakayBtn = document.getElementById('sakay-na-btn');
    if (sakayBtn) sakayBtn.classList.add('d-none');
    if (cancelBtn) cancelBtn.classList.add('d-none');
  }
}

function restoreGPSUI() {
  if (!gpsSelectedStop) return;
  document.getElementById('gps-search').value = gpsSelectedStop.name;
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('gps-preview-card').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.remove('d-none');
  document.getElementById('selected-stop-name').textContent = gpsSelectedStop.name;
  document.getElementById('selected-stop-route').textContent = gpsSelectedStop.routeId ? getRouteShortCode(gpsSelectedStop.routeId) : (gpsSelectedStop.type === 'osm' ? 'OpenStreetMap' : '');
  updateGPSActionButton();
  if (gpsCurrentPosition) {
    updateDistanceDisplay();
  } else {
    document.getElementById('gps-progress-wrap')?.classList.add('d-none');
  }
}

function collapseExpandedSearch() {
  if (!gpsMapExpanded) return;
  const container = document.getElementById('gps-map-container');
  const searchNormal = document.getElementById('gps-search-normal');
  const expandedSearch = container ? container.querySelector('#gps-search-expanded') : null;
  if (expandedSearch) expandedSearch.remove();
  if (searchNormal) searchNormal.classList.remove('d-none');

  const map = document.getElementById('leaflet-map');
  const controls = document.getElementById('gps-map-controls');
  const expandBtn = document.getElementById('gps-expand-btn-map');
  const screen = document.getElementById('screen-gps');

  if (map) map.classList.remove('fullscreen');
  if (controls) controls.classList.add('d-none');
  if (expandBtn) expandBtn.classList.remove('d-none');
  if (screen) screen.style.overflow = 'auto';
  gpsMapExpanded = false;
  requestAnimationFrame(() => {
    if (leafletMap) leafletMap.invalidateSize();
  });
}

function toggleMapExpand() {
  const map = document.getElementById('leaflet-map');
  const container = document.getElementById('gps-map-container');
  const controls = document.getElementById('gps-map-controls');
  const screen = document.getElementById('screen-gps');
  const searchNormal = document.getElementById('gps-search-normal');
  const expandBtn = document.getElementById('gps-expand-btn-map');
  const locationInfo = document.getElementById('gps-location-info');
  const legend = document.getElementById('gps-map-legend');
  if (!map || !container || !controls || !screen) return;
  
  gpsMapExpanded = !gpsMapExpanded;
  
  if (gpsMapExpanded) {
    map.classList.add('fullscreen');
    controls.classList.remove('d-none');
    if (expandBtn) expandBtn.classList.add('d-none');
    screen.style.overflow = 'hidden';
    if (searchNormal) searchNormal.classList.add('d-none');
    
    // Move search bar inside map
    if (searchNormal) {
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
    }
    
    // Show legend and location info
    if (locationInfo) locationInfo.classList.remove('d-none');
    if (legend) legend.classList.remove('d-none');
  } else {
    map.classList.remove('fullscreen');
    controls.classList.add('d-none');
    if (expandBtn) expandBtn.classList.remove('d-none');
    screen.style.overflow = 'auto';
    if (searchNormal) searchNormal.classList.remove('d-none');
    
    // Remove expanded search bar
    const expandedSearch = container.querySelector('#gps-search-expanded');
    if (expandedSearch) expandedSearch.remove();
    
    // Hide legend and location info
    if (locationInfo) locationInfo.classList.add('d-none');
    if (legend) legend.classList.add('d-none');
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
  updateGPSProgressIndicator(dist);
}

function syncHomeGPSStatus() {
  const btn = document.getElementById('start-commute-btn');
  const label = document.getElementById('gps-home-cta-label');
  const indicator = document.getElementById('gps-home-cta-indicator');
  if (!btn || !label || !indicator) return;

  if (!gpsSelectedStop) {
    label.textContent = 'Hintuan Ko';
    indicator.classList.add('d-none');
    btn.classList.remove('gps-home-active');
  } else {
    label.textContent = gpsAlertActive ? 'Simulan ang Biyahe' : 'Hintuan Ko Active';
    indicator.classList.remove('d-none');
    btn.classList.add('gps-home-active');
  }
}

function updateGPSProgressIndicator(distMeters) {
  const wrap = document.getElementById('gps-progress-wrap');
  const fill = document.getElementById('gps-progress-fill');
  const state = document.getElementById('gps-progress-state');
  const distanceLabel = document.getElementById('gps-progress-distance');
  if (!wrap || !fill || !state || !distanceLabel || !gpsCurrentPosition || !gpsSelectedStop) {
    if (wrap) wrap.classList.add('d-none');
    return;
  }

  const dist = typeof distMeters === 'number'
    ? distMeters
    : haversine(
        gpsCurrentPosition.latitude,
        gpsCurrentPosition.longitude,
        gpsSelectedStop.lat,
        gpsSelectedStop.lon
      );

  const maxDistance = 10000; // 10 km is full progress range
  const pct = Math.min(100, Math.max(0, Math.round((maxDistance - dist) / maxDistance * 100)));
  fill.style.width = `${pct}%`;
  wrap.classList.remove('d-none');

  distanceLabel.textContent = dist < 1000
    ? `${Math.round(dist)}m`
    : `${(dist / 1000).toFixed(2)}km`;

  if (dist <= 150) {
    state.textContent = 'Almost there';
  } else if (dist <= 500) {
    state.textContent = 'Very close';
  } else if (dist <= 1000) {
    state.textContent = 'Nearby';
  } else if (dist <= 5000) {
    state.textContent = 'Getting closer';
  } else {
    state.textContent = 'Heading to destination';
  }
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
  loadPersistedGPSState();

  if (!gpsSelectedStop) {
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
  } else {
    restoreGPSUI();
    if (!gpsCurrentPosition) {
      document.getElementById('gps-distance').classList.add('d-none');
    }
  }

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

function normalizeSearchText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,:;!?"'’“”`~(){}\[\]\/\\|<>@#%^&*+=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecommendedResult(result, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  const normalizedName = normalizeSearchText(result.name || '');
  const normalizedRoute = normalizeSearchText(result.routeId ? getRouteShortCode(result.routeId) : '');
  if (normalizedName === normalizedQuery || normalizedRoute === normalizedQuery) return true;
  if (normalizedName.startsWith(normalizedQuery) || normalizedRoute.startsWith(normalizedQuery)) return true;

  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .some(word => new RegExp(`\\b${escapeRegex(word)}`, 'i').test(normalizedName) || new RegExp(`\\b${escapeRegex(word)}`, 'i').test(normalizedRoute));
}

function createFlexibleRegex(query) {
  const cleaned = normalizeSearchText(query);
  if (!cleaned) return null;
  const words = cleaned.split(' ').filter(Boolean);

  if (words.length === 1) {
    const token = escapeRegex(words[0]);
    if (token.length <= 2) {
      return new RegExp(`\\b${token}`, 'i');
    }
    return new RegExp(token.split('').map(ch => `${escapeRegex(ch)}.*?`).join(''), 'i');
  }

  const lookaheads = words.map(word => `(?=.*${escapeRegex(word)})`).join('');
  return new RegExp(`^${lookaheads}.*$`, 'i');
}

function scoreOSMResult(place, query) {
  const placeName = normalizeSearchText(place.name || '');
  const q = normalizeSearchText(query);
  if (!q) return 0;

  let score = 0;
  if (placeName === q) score += 10000;
  if (placeName.startsWith(q)) score += 5000;
  if (placeName.includes(q)) score += 300;

  const words = q.split(' ').filter(Boolean);
  words.forEach(word => {
    if (placeName.includes(word)) score += 200;
  });

  return score;
}

async function fetchOSMSearchResults(query, signal) {
  const normalized = normalizeSearchText(query);
  if (!normalized || normalized.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&countrycodes=ph&viewbox=116.87,21.32,126.60,4.58&bounded=1&q=${encodeURIComponent(normalized)}`;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data.map(place => ({
    id: `osm:${place.place_id}`,
    type: 'osm',
    name: place.display_name,
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    routeId: null,
    source: 'OpenStreetMap',
    osmData: place,
  })) : [];
}

async function reverseGeocodeLatLng(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

function formatReverseGeocodeAddress(data) {
  if (!data || !data.address) return null;
  const address = data.address;
  const parts = [];
  if (address.road) parts.push(address.road);
  if (address.suburb && !parts.includes(address.suburb)) parts.push(address.suburb);
  if (address.neighbourhood && !parts.includes(address.neighbourhood)) parts.push(address.neighbourhood);
  if (address.city && !parts.includes(address.city)) parts.push(address.city);
  else if (address.town && !parts.includes(address.town)) parts.push(address.town);
  else if (address.village && !parts.includes(address.village)) parts.push(address.village);
  if (address.state && !parts.includes(address.state)) parts.push(address.state);
  return parts.join(', ') || data.display_name || null;
}

function mergeSearchResults(localResults, osmResults, query) {
  const merged = [...localResults];
  osmResults.forEach(osm => {
    const exists = merged.some(item => item.id === osm.id || item.name === osm.name);
    if (!exists) {
      osm.recommended = isRecommendedResult(osm, query);
      osm.searchScore = scoreOSMResult(osm, query) + (osm.recommended ? 1000 : 0);
      merged.push(osm);
    }
  });
  return merged
    .sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0))
    .slice(0, 8);
}

function renderSearchSuggestions(results) {
  const dd = document.getElementById('gps-dropdown');
  dd.innerHTML = '';
  if (!results.length) {
    dd.classList.add('d-none');
    return;
  }
  dd.classList.remove('d-none');

  results.forEach(result => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stop-item';
    button.style.textAlign = 'left';
    button.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:15px;font-weight:700;text-transform:uppercase">${result.name}</span>
        ${result.recommended ? '<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--amber);background:rgba(254,183,0,0.14);padding:4px 8px;border-radius:999px;letter-spacing:.04em;">recommended</span>' : ''}
      </div>
      <span style="font-size:12px;color:var(--text-muted)">${result.type === 'osm' ? result.source : getRouteShortCode(result.routeId)}</span>`;
    button.addEventListener('click', () => previewSearchResult(result));
    dd.appendChild(button);
  });
}

function renderSearchMarkers(results) {
  initLeafletMap();
  Object.values(gpsStopMarkers).forEach(marker => marker.remove());
  gpsStopMarkers = {};

  results.forEach(result => {
    if (!result.lat || !result.lon) return;
    const marker = L.circleMarker([result.lat, result.lon], {
      radius: result.type === 'osm' ? 7 : 6,
      color: result.type === 'osm' ? '#34d399' : '#feb700',
      fillColor: result.type === 'osm' ? '#34d399' : '#feb700',
      fillOpacity: 0.5,
      weight: 2,
      dashArray: result.type === 'osm' ? '4 3' : null,
    }).addTo(leafletMap)
      .bindPopup(`<b>${result.name}</b><br/>${result.type === 'osm' ? result.source : getRouteShortCode(result.routeId)}`)
      .on('click', () => previewSearchResult(result));
    gpsStopMarkers[result.id] = marker;
  });
}

function showPreviewPopup(result) {
  if (!leafletMap || !result.lat || !result.lon) return;

  if (gpsPreviewMarker) {
    gpsPreviewMarker.remove();
    gpsPreviewMarker = null;
  }

  gpsPreviewMarker = L.circleMarker([result.lat, result.lon], {
    radius: 12,
    color: '#feb700',
    fillColor: '#feb700',
    fillOpacity: 0.9,
    weight: 3,
  }).addTo(leafletMap);

  const popup = L.popup({
      closeButton: true,
      maxWidth: 260,
      className: 'gps-preview-popup',
      autoPanPaddingTopLeft: [16, 16],
      autoPanPaddingBottomRight: [16, 16],
      offset: [0, -18]
    })
    .setLatLng([result.lat, result.lon])
    .setContent(`
      <div class="gps-preview-title" style="font-weight:800;font-size:14px;margin-bottom:8px;text-transform:uppercase;">${result.name}</div>
      <div class="gps-preview-subtitle" style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">${result.routeId ? getRouteShortCode(result.routeId) : (result.type === 'osm' ? 'OpenStreetMap' : '')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        <button class="gps-popup-btn gps-popup-confirm" style="flex:1;min-width:120px;height:38px;background:var(--amber);border:none;border-radius:10px;color:#271900;font-weight:800">CONFIRM</button>
        <button class="gps-popup-btn gps-popup-cancel" style="flex:1;min-width:120px;height:38px;border:1px solid var(--outline-var);border-radius:10px;background:transparent;color:var(--text);font-weight:800">BACK</button>
      </div>
    `);

  gpsPreviewMarker.bindPopup(popup).openPopup();
  gpsPreviewMarker.on('popupopen', async () => {
    const container = popup.getElement();
    if (!container) return;
    const titleEl = container.querySelector('.gps-preview-title');
    const subtitleEl = container.querySelector('.gps-preview-subtitle');
    const confirmBtn = container.querySelector('.gps-popup-confirm');
    const cancelBtn = container.querySelector('.gps-popup-cancel');

    if (result.type === 'custom' && !result.address) {
      const reverseData = await reverseGeocodeLatLng(result.lat, result.lon);
      const address = formatReverseGeocodeAddress(reverseData);
      if (address) {
        result.address = address;
        result.name = address;
        if (titleEl) titleEl.textContent = address;
        if (subtitleEl) subtitleEl.textContent = 'Dropped Pin';
        syncGPSSearchInput(address);
      } else if (subtitleEl) {
        subtitleEl.textContent = `${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`;
      }
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        if (result.type === 'custom') {
          if (!result.address) {
            const reverseData = await reverseGeocodeLatLng(result.lat, result.lon);
            const address = formatReverseGeocodeAddress(reverseData);
            if (address) {
              result.address = address;
              result.name = address;
              syncGPSSearchInput(address);
            }
          }
          selectCustomPin(result);
        } else if (result.type === 'osm') {
          selectOSMPlace(result);
        } else {
          selectGPSStop(result.id);
        }
        popup.remove();
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        popup.remove();
        if (gpsPreviewMarker) {
          gpsPreviewMarker.remove();
          gpsPreviewMarker = null;
        }
        gpsPreviewStop = null;
        if (!gpsSelectedStop) {
          renderPreviewSelectedStop(null);
        }
      };
    }
  });
}

function renderPreviewSelectedStop(result) {
  const selectedStopCard = document.getElementById('selected-stop-card');
  if (!selectedStopCard) return;

  if (!result) {
    selectedStopCard.classList.add('d-none');
    return;
  }

  selectedStopCard.classList.remove('d-none');
  document.getElementById('selected-stop-name').textContent = result.name;
  document.getElementById('selected-stop-route').textContent =
    result.type === 'osm'
      ? 'OpenStreetMap'
      : result.routeId
        ? getRouteShortCode(result.routeId)
        : result.address
          ? 'Dropped Pin'
          : 'Preview Stop';

  const distanceEl = document.getElementById('selected-stop-distance');
  if (gpsCurrentPosition && result.lat && result.lon && distanceEl) {
    const dist = haversine(gpsCurrentPosition.latitude, gpsCurrentPosition.longitude, result.lat, result.lon);
    distanceEl.textContent = dist < 1000 ? `${Math.round(dist)}m away` : `${(dist / 1000).toFixed(2)}km away`;
  } else if (distanceEl) {
    distanceEl.textContent = '';
  }

  const progressWrap = document.getElementById('gps-progress-wrap');
  if (progressWrap) progressWrap.classList.add('d-none');

  const alertBtn = document.getElementById('set-alert-btn');
  if (alertBtn) {
    alertBtn.disabled = false;
    alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
  }
}

function previewSearchResult(result) {
  collapseExpandedSearch();
  gpsPreviewStop = result;
  syncGPSSearchInput(result.name);
  renderPreviewSelectedStop(result);
  document.getElementById('gps-preview-card').classList.add('d-none');
  panMapToStop(result);
  showPreviewPopup(result);
  updateStopMarkers();
}

async function selectCustomPin(place) {
  gpsPreviewStop = null;
  gpsSelectedStop = {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    routeId: null,
    type: 'custom',
    address: place.address || null,
  };

  if (!gpsSelectedStop.address) {
    const reverseData = await reverseGeocodeLatLng(gpsSelectedStop.lat, gpsSelectedStop.lon);
    const address = formatReverseGeocodeAddress(reverseData);
    if (address) {
      gpsSelectedStop.address = address;
      gpsSelectedStop.name = address;
    }
  }

  syncGPSSearchInput(gpsSelectedStop.name);
  if (gpsPreviewMarker) {
    gpsPreviewMarker.remove();
    gpsPreviewMarker = null;
  }
  document.getElementById('gps-preview-card').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.remove('d-none');
  document.getElementById('selected-stop-name').textContent = gpsSelectedStop.name;
  document.getElementById('selected-stop-route').textContent = gpsSelectedStop.address ? 'Dropped Pin' : 'Custom Pin';
  updateStopMarkers();
  if (gpsCurrentPosition) updateDistanceDisplay();

  if (typeof saveStorage === 'function') {
    saveStorage('family_selected_stop', gpsSelectedStop.name);
  }
  saveGPSState();
  syncHomeGPSStatus();

  const alertBtn = document.getElementById('set-alert-btn');
  if (alertBtn) {
    alertBtn.disabled = false;
    alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
  }
}

function selectOSMPlace(place) {
  gpsPreviewStop = null;
  gpsSelectedStop = {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    routeId: null,
    type: 'osm',
  };

  syncGPSSearchInput(gpsSelectedStop.name);
  document.getElementById('gps-preview-card').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.remove('d-none');
  document.getElementById('selected-stop-name').textContent = gpsSelectedStop.name;
  document.getElementById('selected-stop-route').textContent = 'OpenStreetMap';
  updateStopMarkers();

  if (typeof saveStorage === 'function') {
    saveStorage('family_selected_stop', gpsSelectedStop.name);
  }
  saveGPSState();
  syncHomeGPSStatus();

  const alertBtn = document.getElementById('set-alert-btn');
  if (alertBtn) {
    alertBtn.disabled = false;
    alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
  }
}

// Score search results by relevance
function scoreSearchResult(stop, query) {
  const stopName = String(stop.name || '').toLowerCase();
  const routeCode = String(getRouteShortCode(stop.routeId) || '').toLowerCase();
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
  gpsCurrentSearchQuery = q;

  if (gpsSearchFetchTimeout) {
    clearTimeout(gpsSearchFetchTimeout);
    gpsSearchFetchTimeout = null;
  }
  if (gpsSearchController) {
    gpsSearchController.abort();
    gpsSearchController = null;
  }

  if (q.length < 1) {
    document.getElementById('gps-dropdown').classList.add('d-none');
    if (leafletPreviewMarker) { leafletPreviewMarker.remove(); leafletPreviewMarker = null; }
    Object.values(gpsStopMarkers).forEach(marker => marker.remove());
    gpsStopMarkers = {};
    return;
  }

  const regex = createFlexibleRegex(q);
  const localResults = regex ? STOPS_DB
    .map(stop => ({ ...stop, type: 'local' }))
    .filter(stop => {
      const normalizedName = normalizeSearchText(stop.name);
      const normalizedRoute = normalizeSearchText(getRouteShortCode(stop.routeId));
      return regex.test(normalizedName) || regex.test(normalizedRoute);
    })
    .map(stop => {
      const recommended = isRecommendedResult(stop, q);
      return {
        ...stop,
        searchScore: scoreSearchResult(stop, q) + (recommended ? 1000 : 0),
        recommended,
      };
    })
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, 6) : [];

  renderSearchSuggestions(localResults);
  renderSearchMarkers(localResults);

  if (q.length >= 3) {
    gpsSearchFetchTimeout = setTimeout(async () => {
      gpsSearchFetchTimeout = null;
      gpsSearchController = new AbortController();
      try {
        const osmResults = await fetchOSMSearchResults(q, gpsSearchController.signal);
        if (gpsCurrentSearchQuery !== q) return;
        const merged = mergeSearchResults(localResults, osmResults, q);
        renderSearchSuggestions(merged);
        renderSearchMarkers(merged);
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('OSM search failed', error);
      } finally {
        gpsSearchController = null;
      }
    }, 220);
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

  // Allow tapping/clicking anywhere on the map to create a custom stop pin
  leafletMap.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    // Remove any existing preview marker
    if (leafletPreviewMarker) { leafletMap.removeLayer(leafletPreviewMarker); leafletPreviewMarker = null; }
    // Create a custom stop from the tapped location
    const customStop = {
      id: 'custom:' + Date.now(),
      type: 'custom',
      name: 'Custom Pin',
      lat: lat,
      lon: lon,
      routeId: null,
      source: 'Map Pin'
    };
    // Show preview for the custom pin
    leafletPreviewMarker = L.circleMarker([lat, lon], {
      radius: 10,
      color: '#fff',
      fillColor: '#feb700',
      fillOpacity: 1,
      weight: 2
    }).addTo(leafletMap);
    previewSearchResult(customStop);
  });

  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
  }, 100);
}

function startLocationWatch() {
  if (gpsLiveWatchId !== null) return;
  // Clear any existing timeout
  if (gpsLocatorTimeout) clearTimeout(gpsLocatorTimeout);

  // Set 30-second timeout for location watch
  gpsLocatorTimeout = setTimeout(() => {
    if (gpsLiveWatchId !== null && !gpsLiveMarker) {
      const errEl = document.getElementById('gps-error');
      errEl.classList.remove('d-none');
      errEl.textContent = 'Location timeout. Retrying GPS tracking...';
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

      // Clear any previous error state once we have a fix
      const errEl = document.getElementById('gps-error');
      if (errEl) errEl.classList.add('d-none');

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

      if (gpsSelectedStop) {
        updateDistanceDisplay();
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
        errEl.textContent = 'Location timeout. Retrying GPS tracking...';
        if (gpsLiveWatchId !== null) {
          navigator.geolocation.clearWatch(gpsLiveWatchId);
          gpsLiveWatchId = null;
        }
        if (gpsLocatorTimeout) {
          clearTimeout(gpsLocatorTimeout);
          gpsLocatorTimeout = null;
        }
        setTimeout(() => {
          if (gpsLiveWatchId === null) startLocationWatch();
        }, 5000);
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
  collapseExpandedSearch();
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
  gpsProgressStartDistance = null;
  
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

function getProgressBar(percent) {
  const totalBlocks = 10;
  const filled = Math.min(totalBlocks, Math.max(0, Math.round((percent / 100) * totalBlocks)));
  const empty = totalBlocks - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

function fireProgressNotification(distance) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !gpsSelectedStop) return;
  const now = Date.now();
  const stage = distance > 1000 ? 'far' : distance > 500 ? 'nearby' : distance > 250 ? 'approaching' : 'almost';
  const minAge = stage === gpsLastProgressNotificationStage ? 60000 : 30000;
  if (now - gpsLastProgressNotificationAt < minAge) return;

  let percent = 0;
  if (gpsProgressStartDistance && gpsProgressStartDistance > distance) {
    percent = Math.round(((gpsProgressStartDistance - distance) / gpsProgressStartDistance) * 100);
  }
  percent = Math.min(100, Math.max(0, percent));
  const progressBar = getProgressBar(percent);

  let summary;
  if (distance > 1000) {
    summary = `🚶 ${progressBar} ${percent}% — ${(distance / 1000).toFixed(2)}km to ${gpsSelectedStop.name}`;
  } else if (distance > 500) {
    summary = `🚶 ${progressBar} ${percent}% — ${Math.round(distance)}m to ${gpsSelectedStop.name}`;
  } else if (distance > 250) {
    summary = `🚶 ${progressBar} ${percent}% — less than 500m to ${gpsSelectedStop.name}`;
  } else {
    summary = `🏁 ${progressBar} ${percent}% — almost at ${gpsSelectedStop.name}`;
  }

  new Notification('🚶 Destination progress', {
    body: summary,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: 'gps-progress',
    renotify: true,
    silent: true,
  });

  gpsLastProgressNotificationAt = now;
  gpsLastProgressNotificationStage = stage;
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
  gpsPreviewStop = null;
  collapseExpandedSearch();
  gpsSelectedStop = stop;
  syncGPSSearchInput(stop.name);
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
  saveGPSState();
  syncHomeGPSStatus();
  const alertBtn = document.getElementById('set-alert-btn');
  alertBtn.disabled = false;
  alertBtn.textContent = '';
  alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
  vibrate(40);
}

function cancelSelectedStop() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  gpsAlertActive = false;
  gpsProgressStartDistance = null;
  saveGPSState();
  gpsSelectedStop = null;
  document.getElementById('gps-search').value = '';
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('gps-preview-card').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.add('d-none');
  document.getElementById('gps-distance').classList.add('d-none');
  document.getElementById('gps-progress-wrap')?.classList.add('d-none');
  document.getElementById('alert-active-msg').classList.add('d-none');
  const alertBtn = document.getElementById('set-alert-btn');
  if (alertBtn) {
    alertBtn.disabled = true;
    alertBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:22px">notifications_active</span> SET ALERT';
  }
  if (typeof saveStorage === 'function') {
    saveStorage('family_selected_stop', '');
  }
  const trackingBadge = document.getElementById('home-tracking-badge');
  if (trackingBadge) trackingBadge.classList.add('d-none');
  const sakayBtn = document.getElementById('sakay-na-btn');
  if (sakayBtn) sakayBtn.classList.add('d-none');
  hideGPSPermissionButton();
  syncHomeGPSStatus();
}

document.getElementById('gps-cancel-btn')?.addEventListener('click', cancelSelectedStop);

document.getElementById('set-alert-btn').addEventListener('click', () => {
  if (!gpsSelectedStop) return;
  if (gpsAlertActive) {
    // Keep the active alert running, but let the user choose a new stop.
    cancelSelectedStop();
    return;
  }
  gpsAlertActive = true;
  saveGPSState();
  vibrate([100,50,100]);

  // Keep screen on + request notification permission
  requestWakeLock();
  requestNotifPermission();

  updateGPSActionButton();

  if (!navigator.geolocation) {
    const err = document.getElementById('gps-error');
    err.classList.remove('d-none');
    err.textContent = 'GPS not available on this device.';
    return;
  }

  if (gpsCurrentPosition) {
    gpsProgressStartDistance = haversine(
      gpsCurrentPosition.latitude,
      gpsCurrentPosition.longitude,
      gpsSelectedStop.lat,
      gpsSelectedStop.lon
    );
  } else {
    gpsProgressStartDistance = null;
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
      fireProgressNotification(dist);
      
      if (dist <= 150) {
        vibrate('signal');
        fireStopNotification(gpsSelectedStop.name);
        releaseWakeLock();
        // Notify family if sharing is active
        if (typeof notifyFamilyAlert === 'function') {
          notifyFamilyAlert(gpsSelectedStop.name);
        }
        gpsAlertActive = false;
        saveGPSState();
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

const cancelAlertButton = document.getElementById('cancel-alert-btn');
if (cancelAlertButton) {
  cancelAlertButton.addEventListener('click', () => {
    cancelSelectedStop();
  });
}

// Help modal for "How to set stop"
['gps-help-btn','gps-selected-help-btn'].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener('click', () => {
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
  }
});

// Destination Guide button - provides safe arrival guidance
document.getElementById('gps-destination-guide-btn').addEventListener('click', async () => {
  if (!gpsSelectedStop) {
    alert('Please select a destination stop first.');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'help-modal-overlay';
  modal.innerHTML = `
    <div class="help-modal">
      <div class="help-modal-title">🧭 Guide</div>
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