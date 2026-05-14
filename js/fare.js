//  FARE CALCULATOR

let fareRouteId   = ROUTES[0].id;
let fareFromIdx   = 0;
let fareToIdx     = ROUTES[0].stops.length - 1;
let fareJeepType  = 'traditional';
let farePWD       = true;
let fareBill      = null;

function initFare() {
  farePWD = loadStorage('is_pwd', false);
  const routeSel = document.getElementById('fare-route');
  routeSel.innerHTML = ROUTES.map(r => `<option value="${r.id}">${r.shortCode}</option>`).join('');
  routeSel.value = fareRouteId;
  renderFareStops();
  renderFare();
}

function renderFareStops() {
  const route = ROUTES.find(r => r.id === fareRouteId);
  const fromSel = document.getElementById('fare-from');
  const toSel   = document.getElementById('fare-to');
  const opts    = route.stops.map((s,i) => `<option value="${i}">${s.name}</option>`).join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML   = opts;
  fromSel.value = fareFromIdx;
  toSel.value   = fareToIdx;
}

function renderFare() {
  const route    = ROUTES.find(r => r.id === fareRouteId);
  const validTrip = fareFromIdx !== fareToIdx;
  const distKm   = validTrip ? getDistKm(route, fareFromIdx, fareToIdx) : 0;
  const baseFare = validTrip ? calcFare(distKm, fareJeepType) : 0;
  const fare     = farePWD && validTrip ? Math.round(baseFare * 0.80 * 100)/100 : baseFare;

  const pwdBtn   = document.getElementById('pwd-btn');
  const pwdIcon  = document.getElementById('pwd-icon');
  const pwdNotice= document.getElementById('pwd-notice');
  pwdBtn.style.borderColor = farePWD ? 'var(--green)' : 'var(--outline-var)';
  pwdBtn.style.background  = farePWD ? 'var(--green-bg)' : 'var(--surface-lo)';
  pwdBtn.style.color       = farePWD ? 'var(--green)' : 'var(--text-var)';
  pwdIcon.textContent      = farePWD ? 'check_circle' : 'radio_button_unchecked';
  farePWD ? pwdNotice.classList.remove('d-none') : pwdNotice.classList.add('d-none');

  const strike = document.getElementById('pwd-strikethrough');
  if (farePWD && validTrip) {
    strike.classList.remove('d-none');
    strike.textContent = `₱${Math.ceil(baseFare)}`;
  } else {
    strike.classList.add('d-none');
  }
  document.getElementById('fare-meta').textContent   = !validTrip ? 'Select different stops' : farePWD ? `${distKm} km · PWD 20% OFF` : `${distKm} km`;
  document.getElementById('fare-amount').textContent = validTrip ? `₱${Math.ceil(fare)}` : '—';

  const billSection = document.getElementById('bill-section');
  const billBtns    = document.getElementById('bill-buttons');
  if (validTrip) {
    billSection.classList.remove('d-none');
    billBtns.innerHTML = BILL_DENOMINATIONS.map(b =>
      `<button class="btn-bill${fareBill===b?' active':''}" onclick="selectBill(${b})">₱${b}</button>`
    ).join('');
  } else {
    billSection.classList.add('d-none');
    fareBill = null;
  }

  const changeDis = document.getElementById('change-display');
  const billErr   = document.getElementById('bill-error');
  if (fareBill !== null && validTrip) {
    const change = Math.round((fareBill - fare)*100)/100;
    changeDis.classList.remove('d-none');
    billErr.classList.add('d-none');
    document.getElementById('change-amount').textContent = change >= 0 ? `₱${Math.ceil(fareBill - Math.ceil(fare))}` : '—';
    change < 0 ? billErr.classList.remove('d-none') : billErr.classList.add('d-none');
    change < 0 ? changeDis.classList.add('d-none') : {};
  } else {
    changeDis.classList.add('d-none');
    billErr.classList.add('d-none');
  }

  if (validTrip) {
    saveStorage('last_fare', { amount: fare, route: route.shortCode, isPWD: farePWD });
    const wrap = document.getElementById('use-in-sabihin-btn-wrap');
    wrap.classList.remove('d-none');
    document.getElementById('use-sabihin-label').textContent = `Use ₱${Math.ceil(fare)} in Sabihin Mo →`;
  } else {
    document.getElementById('use-in-sabihin-btn-wrap').classList.add('d-none');
  }
}

function setJeepType(type) {
  fareJeepType = type;
  fareBill = null;
  document.getElementById('btn-traditional').classList.toggle('active', type === 'traditional');
  document.getElementById('btn-modern').classList.toggle('active', type === 'modern');
  renderFare();
  vibrate(30);
}

function togglePWD() {
  farePWD = !farePWD;
  saveStorage('is_pwd', farePWD);
  fareBill = null;
  renderFare();
  vibrate(40);
}

function selectBill(b) {
  fareBill = b;
  renderFare();
  vibrate(40);
}

document.getElementById('fare-route').addEventListener('change', function() {
  fareRouteId = this.value;
  fareFromIdx = 0;
  fareToIdx   = ROUTES.find(r => r.id === fareRouteId).stops.length - 1;
  fareBill = null;
  renderFareStops();
  renderFare();
});

document.getElementById('fare-from').addEventListener('change', function() {
  fareFromIdx = Number(this.value); fareBill = null; renderFare();
});
document.getElementById('fare-to').addEventListener('change', function() {
  fareToIdx = Number(this.value); fareBill = null; renderFare();
});

document.getElementById('use-in-sabihin-btn').addEventListener('click', () => navigate('phrases'));