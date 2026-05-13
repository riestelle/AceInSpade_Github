//  GPS STOP ALERT

let gpsSelectedStop  = null;
let gpsAlertActive   = false;
let gpsWatchId       = null;

function initGPS() {
  gpsSelectedStop = null;
  gpsAlertActive  = false;
  document.getElementById('gps-search').value = '';
  document.getElementById('gps-dropdown').classList.add('d-none');
  document.getElementById('selected-stop-card').classList.add('d-none');
  setTimeout(initLeafletMap, 50);
  document.getElementById('alert-active-msg').classList.add('d-none');
  document.getElementById('gps-error').classList.add('d-none');
  document.getElementById('map-label').textContent = 'Select a stop above';
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
}

function panMapToStop(stop) {
  initLeafletMap();
  leafletMap.setView([stop.lat, stop.lon], 16);
  if (leafletMarker) leafletMarker.remove();
  leafletMarker = L.circleMarker([stop.lat, stop.lon], {
    radius: 10, color: '#feb700', fillColor: '#feb700', fillOpacity: 1, weight: 3
  }).addTo(leafletMap).bindPopup(`<b>${stop.name}</b>`).openPopup();
  setTimeout(() => leafletMap.invalidateSize(), 100);
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
      errEl.textContent = 'GPS error: ' + err.message;
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
});