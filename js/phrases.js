//  SABIHIN MO

let phraseLang      = 'fil';
let pfActiveLang    = 'fil';
let pfPhrase        = null;
let pfAudioPlaying  = false;
let pfAudioElement  = null;

// Audio file support: set to true when audio files are available
const AUDIO_ENABLED = false;
const AUDIO_BASE_URL = '/audio'; // e.g., /audio/greeting-fil.mp3

function initPhrases() {
  phraseLang = loadStorage('phrase_lang', 'fil');
  document.getElementById('phrases-lang-btn').textContent = phraseLang.toUpperCase();
  renderPhraseList();
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

    const btn = document.createElement('button');
    btn.className = 'phrase-row' + (p.type === 'emergency' ? ' emergency' : '');
    btn.style.cssText = `width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:transparent;border:none;border-bottom:1px solid var(--outline-var);text-align:left;cursor:pointer`;
    btn.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:36px;line-height:1;flex-shrink:0">${p.icon || '💬'}</span>
        <div>
          <div style="font-size:18px;font-weight:800;${p.type==='emergency'?'color:#ff6b6b':'color:var(--text)'}">${filText}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${enText}</div>
        </div>
      </div>
      <span class="material-symbols-outlined" style="font-size:22px;color:var(--outline-var)">chevron_right</span>`;
    btn.addEventListener('click', () => openPhraseFullscreen(p, filText, enText));

    if (!DEFAULT_PHRASES.find(d => d.id === p.id)) {
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (confirm('Delete this phrase?')) {
          const all = getStoredPhrases();
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
  const main = pfActiveLang === 'fil' ? pfPhrase.filText : pfPhrase.enText;
  const sub  = pfActiveLang === 'fil' ? pfPhrase.enText  : pfPhrase.filText;
  document.getElementById('pf-icon').textContent = pfPhrase.icon || '💬';
  document.getElementById('pf-main').textContent = main;
  document.getElementById('pf-sub').textContent  = sub;
  document.getElementById('pf-lang').textContent = pfActiveLang === 'fil' ? 'FIL' : 'EN';
  document.getElementById('pf-lang-toggle').textContent = pfActiveLang === 'fil' ? 'FIL → EN' : 'EN → FIL';
}

document.getElementById('pf-lang-toggle').addEventListener('click', () => {
  pfActiveLang = pfActiveLang === 'fil' ? 'en' : 'fil';
  renderPhraseFullscreen();
  vibrate(30);
  setTimeout(speakPhrase, 150);
});

document.getElementById('pf-close').addEventListener('click', () => {
  window.speechSynthesis && window.speechSynthesis.cancel();
  if (pfAudioElement) {
    pfAudioElement.pause();
    pfAudioElement.currentTime = 0;
    pfAudioPlaying = false;
  }
  document.getElementById('phrase-fullscreen').classList.add('d-none');
  vibrate(30);
});

function speakPhrase() {
  if (!window.speechSynthesis && !AUDIO_ENABLED) return;

  const text = pfActiveLang === 'fil' ? pfPhrase.filText : pfPhrase.enText;

  // Attempt audio first if enabled
  if (AUDIO_ENABLED && pfPhrase.id) {
    playPhraseAudio();
    return;
  }

  // Fallback to TTS
  speakPhraseWithTTS(text);
}

function playPhraseAudio() {
  // Build audio filename from phrase ID and language
  const audioFile = `${AUDIO_BASE_URL}/${pfPhrase.id}-${pfActiveLang}.mp3`;
  
  // Stop any currently playing audio
  if (pfAudioElement) {
    pfAudioElement.pause();
    pfAudioElement.currentTime = 0;
  }

  // Create or reuse audio element
  if (!pfAudioElement) {
    pfAudioElement = new Audio();
    pfAudioElement.addEventListener('ended', () => {
      pfAudioPlaying = false;
      updatePhrasePlayButton();
    });
    pfAudioElement.addEventListener('error', (err) => {
      // If audio fails to load/play, fall back to TTS
      console.warn(`Audio failed for ${audioFile}:`, err.message);
      const text = pfActiveLang === 'fil' ? pfPhrase.filText : pfPhrase.enText;
      speakPhraseWithTTS(text);
    });
  }

  pfAudioElement.src = audioFile;
  pfAudioPlaying = true;
  updatePhrasePlayButton();
  
  pfAudioElement.play().catch(err => {
    // Fallback on play failure
    console.warn('Audio playback failed:', err.message);
    const text = pfActiveLang === 'fil' ? pfPhrase.filText : pfPhrase.enText;
    speakPhraseWithTTS(text);
  });

  vibrate(30);
}

function speakPhraseWithTTS(text) {
  if (!window.speechSynthesis) return;
  
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = pfActiveLang === 'fil' ? 'fil-PH' : 'en-PH';
  utt.rate   = 0.85;
  utt.pitch  = 1;
  const voices = window.speechSynthesis.getVoices();
  const prefix = pfActiveLang === 'fil' ? 'fil' : 'en';
  const match  = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
  if (match) utt.voice = match;
  const btn = document.getElementById('pf-speak');
  if (btn) {
    btn.style.opacity = '0.5';
    utt.onend   = () => { btn.style.opacity = '1'; };
    utt.onerror = () => { btn.style.opacity = '1'; };
  }
  window.speechSynthesis.speak(utt);
  vibrate(30);
}

function updatePhrasePlayButton() {
  const btn = document.getElementById('pf-speak');
  if (!btn) return;
  if (pfAudioPlaying) {
    btn.style.opacity = '0.5';
  } else {
    btn.style.opacity = '1';
  }
}

document.getElementById('pf-speak').addEventListener('click', speakPhrase);

document.getElementById('phrases-lang-btn').addEventListener('click', () => {
  phraseLang = phraseLang === 'fil' ? 'en' : 'fil';
  saveStorage('phrase_lang', phraseLang);
  document.getElementById('phrases-lang-btn').textContent = phraseLang.toUpperCase();
  renderPhraseList();
  vibrate(30);
});

const addBtn     = document.getElementById('add-phrase-btn');
const addForm    = document.getElementById('add-phrase-form');
const saveNewBtn = document.getElementById('save-phrase-btn');
const cancelBtn  = document.getElementById('cancel-phrase-btn');

addBtn.addEventListener('click', () => {
  addForm.classList.remove('d-none');
  addBtn.classList.add('d-none');
  document.getElementById('new-phrase-fil').value = '';
  document.getElementById('new-phrase-en').value  = '';
});
cancelBtn.addEventListener('click', () => { addForm.classList.add('d-none'); addBtn.classList.remove('d-none'); });
saveNewBtn.addEventListener('click', () => {
  const fil = document.getElementById('new-phrase-fil').value.trim();
  const en  = document.getElementById('new-phrase-en').value.trim();
  if (!fil) return;
  const all = getStoredPhrases();
  all.push({ id:'custom-' + Date.now(), fil, en, type:'normal' });
  saveStorage('custom_phrases', all);
  addForm.classList.add('d-none');
  addBtn.classList.remove('d-none');
  renderPhraseList();
  vibrate(50);
});