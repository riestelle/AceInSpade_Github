//  AI ASSISTANT

let aiMessages = [];
let aiLoading = false;
let aiContext = null;  // GPS/route context injected when coming from hintuan screen

// Call this before navigate('ai') to inject the current stop/route context
function setAIContext(ctx) {
  aiContext = ctx || null;
}

function getAIWelcomeMessage() {
  if (aiContext && aiContext.stopName) {
    return appLang === 'en'
      ? `Hi! SenyasPo AI here 👋 I can see your stop is set to **${aiContext.stopName}**${aiContext.routeCode ? ' on route ' + aiContext.routeCode : ''}. Ask me anything about your trip!`
      : `Hoy! SenyasPo AI dito 👋 Nakita ko na ang iyong hintuan ay **${aiContext.stopName}**${aiContext.routeCode ? ' sa route ' + aiContext.routeCode : ''}. Tanong mo lang!`;
  }
  return appLang === 'en'
    ? 'Hi! SenyasPo AI here 👋 Ask me about jeepney routes in English, Filipino, or Taglish.'
    : 'Hoy! SenyasPo AI dito 👋 Tanong mo sa akin tungkol sa jeepney routes — sa Filipino, English, o Taglish.';
}

function getAIInputPlaceholder() {
  return appLang === 'en' ? 'Type your question here...' : 'Tanong mo dito...';
}

function getAIStatusOnlineText() {
  return appLang === 'en' ? 'Groq · llama-3.3-70b · Online' : 'Groq · llama-3.3-70b · Online';
}

function getAIStatusOfflineText() {
  return appLang === 'en' ? 'Groq · llama-3.3-70b · Offline' : 'Groq · llama-3.3-70b · Offline';
}

function getAIRoleLabel(role) {
  if (role === 'assistant') return 'AI';
  return appLang === 'en' ? 'YOU' : 'IKAW';
}

function initAI() {
  // Reset conversation if context changed (user came from a different stop)
  const currentContextKey = aiContext ? (aiContext.stopName + '|' + aiContext.routeCode) : '';
  if (aiMessages.length === 0 || aiMessages._contextKey !== currentContextKey) {
    aiMessages = [{ role: 'assistant', text: getAIWelcomeMessage() }];
    aiMessages._contextKey = currentContextKey;
  } else if (aiMessages.length === 1 && aiMessages[0].role === 'assistant') {
    aiMessages[0].text = getAIWelcomeMessage();
    aiMessages._contextKey = currentContextKey;
  }
  renderAIStatus();
  renderMessages();
}

function renderAIStatus() {
  const dot   = document.getElementById('ai-dot');
  const txt   = document.getElementById('ai-status-text');
  const offBanner = document.getElementById('ai-offline-banner');
  if (isOnline) {
    dot.style.background = 'var(--green)';
    txt.textContent = getAIStatusOnlineText();
    offBanner.classList.add('d-none');
  } else {
    dot.style.background = '#ef4444';
    txt.textContent = getAIStatusOfflineText();
    offBanner.classList.remove('d-none');
  }
  const input = document.getElementById('ai-input');
  input.disabled = !isOnline || aiLoading;
  input.placeholder = isOnline ? getAIInputPlaceholder() : (appLang === 'en' ? 'No internet connection' : 'Walang internet connection');
  document.getElementById('ai-send').disabled = !isOnline || aiLoading;
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  container.innerHTML = aiMessages.map(m => `
    <div class="d-flex flex-column" style="align-items:${m.role==='user'?'flex-end':'flex-start'}">
      <span class="tag-mono mb-1" style="color:var(--text-muted)">${getAIRoleLabel(m.role)}</span>
      <div class="chat-bubble ${m.role==='user'?'user':'assist'}" style="color:var(--text)">${escHtml(m.text)}</div>
    </div>`).join('');

  if (aiLoading) {
    container.innerHTML += `
      <div class="d-flex flex-column" style="align-items:flex-start">
        <span class="tag-mono mb-1" style="color:var(--text-muted)">AI</span>
        <div class="chat-bubble assist d-flex gap-2 align-items-center">
          <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
        </div>
      </div>`;
  }
  container.scrollTop = container.scrollHeight;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function sendAI() {
  const input = document.getElementById('ai-input');
  const text  = input.value.trim();
  if (!text || aiLoading || !isOnline) return;
  input.value = '';
  aiMessages.push({ role:'user', text });
  aiLoading = true;
  renderMessages();
  renderAIStatus();
  vibrate(30);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 512,
        temperature: 0.4,
        messages: [
          { role:'system', content: getAISystemPrompt(appLang, aiContext) },
          ...aiMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
        ]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const reply = data.choices?.[0]?.message?.content || (appLang === 'en' ? 'No response. Try again.' : 'Walang response. Try ulit.');
    aiMessages.push({ role:'assistant', text: reply });
  } catch (err) {
    aiMessages.push({ role:'assistant', text: appLang === 'en' ? `Connection error: ${err.message}` : `Connection error: ${err.message}` });
  } finally {
    aiLoading = false;
    renderMessages();
    renderAIStatus();
  }
}

document.getElementById('ai-send').addEventListener('click', sendAI);
document.getElementById('ai-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); } });

function promptApiKey() {
  const slot = prompt('Which key slot? Enter 1, 2, 3, 4, or 5 (use multiple keys to avoid rate limits):') || '1';
  const slotKey = slot === '1' ? 'groq_key' : `groq_key_${slot}`;
  const key = prompt(`Paste Groq API key #${slot} (free at console.groq.com):\nStarts with "gsk_..."`);
  if (key && key.startsWith('gsk_')) {
    saveStorage(slotKey, key);
    document.getElementById('key-display').textContent = `Key ${slot}: ${key.slice(0,8)}...`;
    alert(`Key #${slot} saved!`);
  } else if (key) {
    alert('That doesn\'t look like a Groq key. Keys start with "gsk_".');
  }
}

function initAIKeyDisplay() {
  const key = loadStorage('groq_key', '');
  if (key) document.getElementById('key-display').textContent = key.slice(0,8) + '...';
}