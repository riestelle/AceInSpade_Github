//  SABIHIN MO

let phraseLang      = 'fil';
let pfActiveLang    = 'fil';
let pfPhrase        = null;
let cachedVoices    = [];
let ttsVoicePopupShown = false;
let phraseVibrationTimer = null;

const TTS_VIBRATION_PATTERN = [70, 40];
const TTS_VIBRATION_REPEAT_MS = 120;

/* ── PHRASE ICON IMAGES (keyed by phrase id) ───────────────────── */
const PHRASE_ICON_URLS = {
  'bayad':     'https://cdn-icons-png.flaticon.com/128/5290/5290777.png',
  'para':      'https://cdn-icons-png.flaticon.com/128/9125/9125142.png',
  'emergency': 'https://cdn-icons-png.flaticon.com/128/2014/2014825.png',
  'tama':      'https://cdn-icons-png.flaticon.com/128/2021/2021551.png',
  'sukli':     'https://cdn-icons-png.flaticon.com/128/17763/17763038.png',
};

const PROFANITY_PATTERNS = [
  /\bfuck(?:ing|er|ers|ed|s)?\b/i,
  /\bshit(?:ty|head|heads|hole|holes)?\b/i,
  /\bbastard(?:s)?\b/i,
  /\bbitch(?:es|y)?\b/i,
  /\bass(?:hole|holes)?\b/i,
  /\bdick(?:s|head|heads)?\b/i,
  /\bcunt(?:s)?\b/i,
  /\bpiss(?:ed|ing|es|er|ers)?\b/i,
  /\bdamn(?:ed|ing)?\b/i,
  /\basshole\b/i,
  /\barsehole\b/i,
  /\basshat\b/i,
  /\bwhore(?:s)?\b/i,
  /\bslut(?:s)?\b/i,
  /\bcrap\b/i,
  /\bidiot(?:s)?\b/i,
  /\bmoron\b/i,
  /\bnigga(?:s)?\b/i,
  /\bnigger(?:s)?\b/i,
  /\bputang\s*ina(?:\s*mo)?\b/i,
  /\bputangina(?:\s*mo)?\b/i,
  /\btang\s*ina(?:\s*mo)?\b/i,
  /\btangina(?:\s*mo)?\b/i,
  /\bkupal\b/i,
  /\bhayop\b/i,
  /\bpakyu\b/i,
  /\btae\b/i,
  /\bwalang\s*kwenta\b/i,
  /\bgago(?:ng)?\b/i,
  /\bpunyeta\b/i,
  /\bulol\b/i,
  /\btarantado\b/i,
  /\bbwisit\b/i,
];

function getTTSVoiceSupportStatus(voices) {
  const status = { fil: false, en: false };
  if (!voices || voices.length === 0) return status;

  voices.forEach(v => {
    const voiceLang = String(v.lang || '').toLowerCase();
    const voiceName = String(v.name || '').toLowerCase();

    if (/^(tl|fil)(-|$)/.test(voiceLang) || voiceName.includes('filipino') || voiceName.includes('tagalog')) {
      status.fil = true;
    }
    if (/^en(-|$)/.test(voiceLang) || voiceName.includes('english')) {
      status.en = true;
    }
  });

  return status;
}

function hasVoiceForLanguage(voices, lang) {
  const status = getTTSVoiceSupportStatus(voices);
  return Boolean(status[lang]);
}

function createPhraseWarningPopup(title, message) {
  const overlay = document.createElement('div');
  overlay.className = 'help-modal-overlay';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="help-modal">
      <div class="help-modal-title">${title}</div>
      <div class="help-modal-section" style="padding:0 8px;">
        <p style="margin:0;font-size:15px;color:var(--text);line-height:1.5">${message}</p>
      </div>
      <button id="phrase-warning-close" style="width:100%;height:48px;background:var(--amber);color:#271900;border:none;border-radius:8px;font-weight:700;margin-top:16px;cursor:pointer">OK</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#phrase-warning-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function showTTSVoiceWarning({ synthAvailable = true, fil = false, en = false } = {}) {
  if (ttsVoicePopupShown) return;
  ttsVoicePopupShown = true;

  if (!synthAvailable) {
    createPhraseWarningPopup(
      'Speech synthesis unavailable',
      'This browser does not support speech synthesis. Sabihin Mo can still show text, but spoken output will not work.'
    );
    return;
  }

  if (!fil && !en) {
    createPhraseWarningPopup(
      'No TTS voices found',
      'No Filipino or English TTS voice was detected in this browser. Speech playback will not work; rely on the displayed text instead.'
    );
    return;
  }

  if (!fil) {
    createPhraseWarningPopup(
      'Filipino voice unavailable',
      'No Filipino/Tagalog TTS voice was detected. English speech may still work, but Filipino playback may fall back to text only.'
    );
    return;
  }

  if (!en) {
    createPhraseWarningPopup(
      'English voice unavailable',
      'No English TTS voice was detected. Filipino speech may still work, but English playback may fall back to text only.'
    );
  }
}

function hasProfanity(text) {
  if (!text) return false;
  const normalized = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return PROFANITY_PATTERNS.some(pattern => pattern.test(normalized));
}

function isBlockedPhrase(filText, enText) {
  return hasProfanity(filText) || hasProfanity(enText);
}

function sanitizeProfanity(text) {
  if (!text) return '';
  let sanitized = String(text);

  PROFANITY_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

// Live version: no trim so spaces while typing are preserved
function sanitizeProfanityLive(text) {
  if (!text) return '';
  let sanitized = String(text);
  PROFANITY_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });
  return sanitized.replace(/\s{3,}/g, '  ');
}

function getPhraseTextOrder(filText, enText, lang) {
  // lang = the language to DISPLAY as main (fil = show Filipino big, en = show English big)
  const mainText = lang === 'fil' ? filText : enText;
  const subText  = lang === 'fil' ? enText  : filText;
  return { sourceLang: lang, targetLang: lang === 'fil' ? 'en' : 'fil', mainText, subText };
}

function getPhraseDirectionLabel(lang) {
  return lang === 'fil' ? 'FILIPINO' : 'ENGLISH';
}

// Preload voices when they become available
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
    if (!ttsVoicePopupShown) checkTTSVoiceSupport();
  };
  // Initial load attempt
  cachedVoices = window.speechSynthesis.getVoices();
}

function checkTTSVoiceSupport() {
  if (!window.speechSynthesis) {
    showTTSVoiceWarning({ synthAvailable: false, fil: false, en: false });
    return;
  }

  const voices = getAvailableVoices();
  if (!voices || voices.length === 0) return;

  const support = getTTSVoiceSupportStatus(voices);
  if (!support.fil && !support.en) {
    showTTSVoiceWarning({ synthAvailable: true, fil: false, en: false });
  } else if (phraseLang === 'fil' && !support.fil) {
    showTTSVoiceWarning({ synthAvailable: true, fil: false, en: support.en });
  } else if (phraseLang === 'en' && !support.en) {
    showTTSVoiceWarning({ synthAvailable: true, fil: support.fil, en: false });
  }
}

function initPhrases() {
  phraseLang = loadStorage('phrase_lang', 'fil');
  if (!['fil','en'].includes(phraseLang)) {
    phraseLang = 'fil';
    saveStorage('phrase_lang', phraseLang);
  }
  document.getElementById('phrases-lang-btn').textContent = getPhraseDirectionLabel(phraseLang);
  renderPhraseList();

  checkTTSVoiceSupport();
}

function getStoredPhrases() {
  return loadStorage('custom_phrases', JSON.parse(JSON.stringify(DEFAULT_PHRASES)));
}

function renderPhraseList() {
  const phrases = getStoredPhrases();
  const lastFare = loadStorage('last_fare', null);
  const list = document.getElementById('phrase-list');
  list.innerHTML = '';

  phrases.forEach((p, idx) => {
    let filText = p.fil, enText = p.en;
    if (p.id === 'bayad' && lastFare) {
      filText = `Bayad po — ₱${Number(lastFare.amount).toFixed(2)}`;
      enText  = `Pass the fare — ₱${Number(lastFare.amount).toFixed(2)}`;
    }

    const phraseText = getPhraseTextOrder(filText, enText, phraseLang);
    const blocked    = isBlockedPhrase(filText, enText);
    const iconUrl    = p.iconUrl || PHRASE_ICON_URLS[p.id] || null;

    /* ── icon: big image if available, else emoji ── */
    const iconHtml = iconUrl
      ? `<img src="${iconUrl}" alt="" style="width:56px;height:56px;object-fit:contain;flex-shrink:0;border-radius:10px;" />`
      : `<span style="font-size:48px;line-height:1;flex-shrink:0">${p.icon || '💬'}</span>`;

    const btn = document.createElement('button');
    btn.className = 'phrase-row' + (p.type === 'emergency' ? ' emergency' : '');
    btn.style.cssText = `width:100%;display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:transparent;border:none;border-bottom:1px solid var(--outline-var);text-align:left;cursor:pointer;gap:14px`;
    if (blocked) {
      btn.style.opacity = '0.65';
      btn.style.cursor  = 'not-allowed';
    }
    btn.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;flex:1;min-width:0">
        ${iconHtml}
        <div style="flex:1;min-width:0">
          <div style="font-size:18px;font-weight:800;${p.type === 'emergency' ? 'color:#ff6b6b' : 'color:var(--text)'};line-height:1.2">${blocked ? 'BLOCKED PHRASE' : phraseText.mainText}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:3px">${blocked ? 'Contains prohibited words' : phraseText.subText}</div>
        </div>
      </div>
      <span class="material-symbols-outlined" style="font-size:22px;color:var(--outline-var);flex-shrink:0">chevron_right</span>`;

    btn.addEventListener('click', () => {
      if (blocked) {
        alert('This phrase contains prohibited words and cannot be used.');
        return;
      }
      openPhraseFullscreen(p, filText, enText);
    });

    if (!DEFAULT_PHRASES.find(d => d.id === p.id)) {
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (confirm('Delete this phrase?')) {
          const all     = getStoredPhrases();
          const updated = all.filter((_, i) => i !== idx);
          saveStorage('custom_phrases', updated);
          renderPhraseList();
        }
      });
    }
    list.appendChild(btn);
  });
}

function openPhraseFullscreen(phrase, filText, enText) {
  if (isBlockedPhrase(filText, enText)) {
    alert('This phrase contains prohibited words and cannot be used.');
    return;
  }
  pfPhrase = { ...phrase, filText, enText };
  pfActiveLang = phraseLang;
  const fs = document.getElementById('phrase-fullscreen');
  fs.classList.remove('d-none');
  fs.className = 'phrase-fullscreen' + (phrase.type === 'emergency' ? ' emergency' : '');
  renderPhraseFullscreen();
  vibrate(50);
  setTimeout(speakPhrase, 300);
}

function renderPhraseFullscreen() {
  const phraseText = getPhraseTextOrder(pfPhrase.filText, pfPhrase.enText, pfActiveLang);
  const iconUrl    = pfPhrase.iconUrl || PHRASE_ICON_URLS[pfPhrase.id] || null;

  const iconEmoji = document.getElementById('pf-icon');
  const iconImg   = document.getElementById('pf-icon-img');

  if (iconUrl && iconImg) {
    iconImg.src           = iconUrl;
    iconImg.style.display = 'block';
    if (iconEmoji) iconEmoji.textContent = '';
  } else {
    if (iconImg) iconImg.style.display = 'none';
    if (iconEmoji) iconEmoji.textContent = pfPhrase.icon || '💬';
  }

  document.getElementById('pf-main').textContent = phraseText.mainText;
  document.getElementById('pf-sub').textContent  = phraseText.subText;
  document.getElementById('pf-lang').textContent = getPhraseDirectionLabel(pfActiveLang);
  document.getElementById('pf-lang-toggle').textContent = pfActiveLang === 'fil' ? 'EN →' : '← FIL';
}

document.getElementById('pf-lang-toggle').addEventListener('click', () => {
  pfActiveLang = pfActiveLang === 'fil' ? 'en' : 'fil';
  renderPhraseFullscreen();
  vibrate(30);
  setTimeout(speakPhrase, 150);
});

document.getElementById('pf-close').addEventListener('click', () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  clearPhraseVibration();
  document.getElementById('phrase-fullscreen').classList.add('d-none');
  vibrate(30);
});

function getPhrasePlaybackLang() {
  return pfActiveLang; // speak whatever language is currently shown as main
}

function getPhrasePlaybackText() {
  return getPhraseTextOrder(pfPhrase.filText, pfPhrase.enText, pfActiveLang).mainText;
}

function getAvailableVoices() {
  if (!window.speechSynthesis) return [];
  return cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
}

function findBestVoiceForLanguage(voices, playbackLang) {
  if (!voices || voices.length === 0) return null;

  const exactTags = playbackLang === 'fil' ? ['tl-PH', 'fil-PH'] : ['en-PH', 'en-US', 'en-GB'];
  const targetPrefixes = playbackLang === 'fil' ? ['fil', 'tl'] : ['en'];
  const searchNames = playbackLang === 'fil' ? ['Filipino', 'Tagalog'] : ['English'];

  let selectedVoice = voices.find(v => exactTags.includes(v.lang));
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang && targetPrefixes.some(prefix => v.lang.toLowerCase().startsWith(prefix)));
  }
  if (!selectedVoice && playbackLang === 'fil') {
    selectedVoice = voices.find(v => v.lang && /^(fil|tl)(-|$)/i.test(v.lang));
  }
  if (!selectedVoice && playbackLang === 'fil') {
    selectedVoice = voices.find(v => v.lang && v.lang.toUpperCase().includes('PH'));
  }
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.name && searchNames.some(term => v.name.includes(term)));
  }
  if (!selectedVoice && playbackLang !== 'fil') {
    selectedVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  }

  return selectedVoice || null;
}

function speakPhrase() {
  if (!window.speechSynthesis) return;

  const text = getPhrasePlaybackText();
  if (hasProfanity(text)) {
    window.speechSynthesis.cancel();
    alert('This phrase contains prohibited words and cannot be spoken.');
    return;
  }
  speakPhraseWithTTS(text);
}

function clearPhraseVibration() {
  if (phraseVibrationTimer !== null) {
    clearInterval(phraseVibrationTimer);
    phraseVibrationTimer = null;
  }
}

function startPhraseVibration() {
  clearPhraseVibration();
  vibrate(TTS_VIBRATION_PATTERN);
  phraseVibrationTimer = setInterval(() => vibrate(TTS_VIBRATION_PATTERN), TTS_VIBRATION_REPEAT_MS);
}

function speakPhraseWithTTS(text) {
  if (!window.speechSynthesis) return;

  clearPhraseVibration();
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);

  const playbackLang = getPhrasePlaybackLang();
  const langTag = playbackLang === 'fil' ? 'tl-PH' : 'en-PH';
  utt.lang = langTag;
  utt.rate = 0.85;
  utt.pitch = 1;

  const voices = getAvailableVoices();
  const selectedVoice = findBestVoiceForLanguage(voices, playbackLang);

  if (selectedVoice) {
    utt.voice = selectedVoice;
  } else if (!voices || voices.length === 0) {
    showTTSVoiceWarning({ synthAvailable: true, fil: false, en: false });
    return;
  } else {
    const support = getTTSVoiceSupportStatus(voices);
    showTTSVoiceWarning({ synthAvailable: true, fil: support.fil, en: support.en });
    const languageLabel = playbackLang === 'fil' ? 'Filipino/Tagalog' : 'English';
    alert(`No ${languageLabel} voice was found. The browser will try its default voice instead.`);
  }

  const btn = document.getElementById('pf-speak');
  if (btn) {
    btn.style.opacity = '0.5';
    utt.onstart = () => {
      startPhraseVibration();
    };
    utt.onend = () => {
      btn.style.opacity = '1';
      clearPhraseVibration();
    };
    utt.onerror = () => {
      btn.style.opacity = '1';
      clearPhraseVibration();
    };
  } else {
    utt.onstart = startPhraseVibration;
    utt.onend = clearPhraseVibration;
    utt.onerror = clearPhraseVibration;
  }

  window.speechSynthesis.speak(utt);
}

document.getElementById('pf-speak').addEventListener('click', speakPhrase);

document.getElementById('phrases-lang-btn').addEventListener('click', () => {
  phraseLang = phraseLang === 'fil' ? 'en' : 'fil';
  saveStorage('phrase_lang', phraseLang);
  document.getElementById('phrases-lang-btn').textContent = getPhraseDirectionLabel(phraseLang);
  renderPhraseList();
  vibrate(30);
});

const addBtn     = document.getElementById('add-phrase-btn');
const addForm    = document.getElementById('add-phrase-form');
const saveNewBtn = document.getElementById('save-phrase-btn');
const cancelBtn  = document.getElementById('cancel-phrase-btn');
const newPhraseFilInput = document.getElementById('new-phrase-fil');
const newPhraseEnInput  = document.getElementById('new-phrase-en');

function enforcePhraseInputRules(inputEl) {
  if (!inputEl) return;
  // Use live version so trailing spaces are preserved while the user is typing
  const cleaned = sanitizeProfanityLive(inputEl.value);
  if (cleaned !== inputEl.value) {
    const pos = inputEl.selectionStart;
    inputEl.value = cleaned;
    inputEl.setSelectionRange(pos, pos);
  }
}

newPhraseFilInput.addEventListener('input', () => enforcePhraseInputRules(newPhraseFilInput));
newPhraseEnInput.addEventListener('input', () => enforcePhraseInputRules(newPhraseEnInput));
newPhraseFilInput.addEventListener('paste', () => setTimeout(() => enforcePhraseInputRules(newPhraseFilInput), 0));
newPhraseEnInput.addEventListener('paste', () => setTimeout(() => enforcePhraseInputRules(newPhraseEnInput), 0));

addBtn.addEventListener('click', () => {
  addForm.classList.remove('d-none');
  addBtn.classList.add('d-none');
  newPhraseFilInput.value = '';
  newPhraseEnInput.value  = '';
});
cancelBtn.addEventListener('click', () => { addForm.classList.add('d-none'); addBtn.classList.remove('d-none'); });
saveNewBtn.addEventListener('click', () => {
  const fil = sanitizeProfanity(newPhraseFilInput.value).trim();
  const en  = sanitizeProfanity(newPhraseEnInput.value).trim();
  if (!fil) return;
  if (hasProfanity(fil) || hasProfanity(en)) {
    alert('Please remove prohibited words before saving this phrase.');
    return;
  }
  const all = getStoredPhrases();
  all.push({ id:'custom-' + Date.now(), fil, en, type:'normal' });
  saveStorage('custom_phrases', all);
  addForm.classList.add('d-none');
  addBtn.classList.remove('d-none');
  renderPhraseList();
  vibrate(50);
});