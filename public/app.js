const STORAGE_KEY = 'arcana.conversationId';

const els = {
  messages: document.getElementById('messages'),
  input: document.getElementById('messageInput'),
  send: document.getElementById('sendBtn'),
  newChat: document.getElementById('newChatBtn'),
  book: document.getElementById('bookBtn'),
  brandMark: document.getElementById('brandMark'),
  bookingModal: document.getElementById('bookingModal'),
  bookingBackdrop: document.getElementById('bookingBackdrop'),
  bookingClose: document.getElementById('bookingCloseBtn'),
  clientoMount: document.getElementById('clientoMount'),
};

let conversationId = localStorage.getItem(STORAGE_KEY) || '';
let isSending = false;
let publicConfig = null;

function getSourceUrl() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('sourceUrl');
    if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
  } catch {
    // ignore
  }
  return document.referrer || window.location.href;
}

const publicConfigPromise = loadPublicConfig();
const clientoState = { loading: false, loaded: false };

function brandLabel() {
  const brand = publicConfig?.brand;
  if (brand === 'curatiio') return 'Curatiio';
  if (brand === 'hair-tp-clinic') return 'Hair TP Clinic';
  return brand || 'kliniken';
}

function applyBrandUi() {
  const brand = publicConfig?.brand;
  const subtitle = document.getElementById('brandSubtitle');
  if (subtitle) subtitle.textContent = `${brandLabel()} · chat & bokning`;
  document.title = `Arcana · ${brandLabel()}`;

  if (els.brandMark) {
    if (brand === 'hair-tp-clinic') {
      els.brandMark.src = '/assets/hairtpclinic-mark.svg';
      els.brandMark.classList.remove('hidden');
    } else {
      els.brandMark.classList.add('hidden');
    }
  }
}

function applyBrandTheme() {
  const brand = publicConfig?.brand;
  if (!document.body) return;

  if (brand === 'hair-tp-clinic') {
    document.body.style.setProperty('--arcana-primary', '#cabaae');
    document.body.style.setProperty('--arcana-primary-hover', '#d7c9be');
    document.body.style.setProperty('--arcana-primary-text', '#303030');
    document.body.style.setProperty('--cb-color-primary', '#c2aa9c');

    document.body.style.setProperty('--arcana-bg', '#303030');
    document.body.style.setProperty('--arcana-surface', 'rgba(48, 48, 48, 0.72)');
    document.body.style.setProperty('--arcana-surface-solid', 'rgba(38, 38, 38, 0.76)');
    document.body.style.setProperty('--arcana-text', '#f6f1ee');
    document.body.style.setProperty('--arcana-text-muted', 'rgba(246, 241, 238, 0.72)');
    document.body.style.setProperty('--arcana-border', 'rgba(246, 241, 238, 0.14)');
    document.body.style.setProperty('--arcana-glow', 'rgba(202, 186, 174, 0.22)');
  } else if (brand === 'curatiio') {
    document.body.style.setProperty('--arcana-primary', '#4e6f68');
    document.body.style.setProperty('--arcana-primary-hover', '#5a837b');
    document.body.style.setProperty('--arcana-primary-text', '#ffffff');
    document.body.style.setProperty('--cb-color-primary', '#4e6f68');

    document.body.style.setProperty('--arcana-bg', '#060f10');
    document.body.style.setProperty('--arcana-surface', 'rgba(6, 15, 16, 0.72)');
    document.body.style.setProperty('--arcana-surface-solid', 'rgba(8, 24, 22, 0.72)');
    document.body.style.setProperty('--arcana-text', '#f2f7f6');
    document.body.style.setProperty('--arcana-text-muted', 'rgba(242, 247, 246, 0.72)');
    document.body.style.setProperty('--arcana-border', 'rgba(242, 247, 246, 0.14)');
    document.body.style.setProperty('--arcana-glow', 'rgba(78, 111, 104, 0.24)');
  } else {
    document.body.style.removeProperty('--arcana-primary');
    document.body.style.removeProperty('--arcana-primary-hover');
    document.body.style.removeProperty('--arcana-primary-text');
    document.body.style.removeProperty('--cb-color-primary');

    document.body.style.removeProperty('--arcana-bg');
    document.body.style.removeProperty('--arcana-surface');
    document.body.style.removeProperty('--arcana-surface-solid');
    document.body.style.removeProperty('--arcana-text');
    document.body.style.removeProperty('--arcana-text-muted');
    document.body.style.removeProperty('--arcana-border');
    document.body.style.removeProperty('--arcana-glow');
  }
}

function applyBrandSuggestions() {
  const brand = publicConfig?.brand;

  const suggestions =
    brand === 'hair-tp-clinic'
      ? {
          prices: 'Vad kostar en hårtransplantation?',
          process: 'Hur går en hårtransplantation till?',
          aftercare: 'Vad ska jag tänka på efter en hårtransplantation?',
        }
      : brand === 'curatiio'
        ? {
            prices: 'Vad kostar en konsultation eller behandling?',
            process: 'Hur går en konsultation eller behandling till?',
            aftercare: 'Vad ska jag tänka på efter en behandling?',
          }
        : {
            prices: 'Vad kostar en konsultation?',
            process: 'Hur går en konsultation till?',
            aftercare: 'Vad ska jag tänka på efter en behandling?',
          };

  document.querySelectorAll('[data-chip="prices"]').forEach((el) => {
    el.dataset.suggest = suggestions.prices;
  });
  document.querySelectorAll('[data-chip="process"]').forEach((el) => {
    el.dataset.suggest = suggestions.process;
  });
  document.querySelectorAll('[data-chip="aftercare"]').forEach((el) => {
    el.dataset.suggest = suggestions.aftercare;
  });
}

function scrollToBottom() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });
}

function bubbleBase(role) {
  const wrapper = document.createElement('div');
  wrapper.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';

  const bubble = document.createElement('div');
  bubble.className =
    role === 'user'
      ? 'bubble-user max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm'
      : 'bubble-assistant max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm';

  const content = document.createElement('div');
  content.className = 'whitespace-pre-wrap leading-relaxed';
  bubble.appendChild(content);

  wrapper.appendChild(bubble);
  return { wrapper, content };
}

function addMessage(role, text, { scroll = true } = {}) {
  const { wrapper, content } = bubbleBase(role);
  content.textContent = String(text ?? '');
  els.messages.appendChild(wrapper);
  if (scroll) scrollToBottom();
  return wrapper;
}

function setSending(next) {
  isSending = next;
  els.send.disabled = isSending;
  els.input.disabled = isSending;
}

async function loadPublicConfig() {
  try {
    const sourceUrl = getSourceUrl();
    const res = await fetch(`/config?sourceUrl=${encodeURIComponent(sourceUrl)}`);
    const data = await res.json();
    if (!res.ok) return null;
    publicConfig = data;
    applyBrandUi();
    applyBrandTheme();
    applyBrandSuggestions();
    return data;
  } catch {
    return null;
  }
}

async function sendMessage(text) {
  const message = String(text ?? '').trim();
  if (!message) return;
  if (isSending) return;

  addMessage('user', message);
  els.input.value = '';
  setSending(true);

  const typingEl = addMessage('assistant', 'Skriver…');

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationId: conversationId || undefined,
        sourceUrl: getSourceUrl(),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Okänt fel');
    }

    if (typeof data.conversationId === 'string' && data.conversationId) {
      conversationId = data.conversationId;
      localStorage.setItem(STORAGE_KEY, conversationId);
    }

    typingEl.remove();
    addMessage('assistant', data.reply || '—');
  } catch (err) {
    typingEl.remove();
    addMessage('assistant', `Det blev ett fel: ${err.message}`);
  } finally {
    setSending(false);
    els.input.focus();
  }
}

function startNewChat() {
  const oldId = conversationId;
  conversationId = '';
  localStorage.removeItem(STORAGE_KEY);
  els.messages.innerHTML = '';
  seedWelcome();
  els.input.focus();

  if (oldId) {
    const sourceUrl = getSourceUrl();
    fetch(
      `/conversation/${encodeURIComponent(oldId)}?sourceUrl=${encodeURIComponent(sourceUrl)}`,
      { method: 'DELETE' }
    ).catch(() => {});
  }
}

function seedWelcome() {
  addMessage(
    'assistant',
    [
      `Hej! Jag är Arcana, ${brandLabel()}s digitala assistent.`,
      '',
      'Jag kan hjälpa dig med:',
      '- Info om behandling, eftervård och praktiska frågor',
      '- Att boka konsultation (klicka på “Boka tid” så öppnas bokningen)',
      '',
      'Vad vill du ha hjälp med?',
    ].join('\n')
  );
}

els.send.addEventListener('click', () => sendMessage(els.input.value));
els.newChat.addEventListener('click', startNewChat);
els.book.addEventListener('click', () => openBookingModal());

document.addEventListener('click', (e) => {
  const chip = e.target?.closest?.('.chip');
  if (!chip) return;

  const action = chip.dataset.action;
  if (action === 'open-booking') {
    openBookingModal();
    return;
  }

  const suggest = chip.dataset.suggest;
  if (suggest) sendMessage(suggest);
});

els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(els.input.value);
  }
});

function openModal() {
  if (!els.bookingModal) return;
  els.bookingModal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeModal() {
  if (!els.bookingModal) return;
  els.bookingModal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function showBookingStatus(html) {
  if (!els.clientoMount) return;
  els.clientoMount.innerHTML = html;
}

function ensureClientoLoaded() {
  if (clientoState.loaded || clientoState.loading) return;

  const cliento = publicConfig?.cliento || {};
  const accountIds = Array.isArray(cliento.accountIds) ? cliento.accountIds : [];
  const bookingUrl = typeof cliento.bookingUrl === 'string' ? cliento.bookingUrl : '';
  const widgetSrc = typeof cliento.widgetSrc === 'string' && cliento.widgetSrc
    ? cliento.widgetSrc
    : 'https://cliento.com/widget-v2/cliento.js';
  const locale = typeof cliento.locale === 'string' ? cliento.locale : 'sv';
  const mergeLocations = Boolean(cliento.mergeLocations);

  if (accountIds.length === 0) {
    if (bookingUrl) {
      showBookingStatus(
        [
          '<div class="p-3 text-xs text-slate-600">',
          'Bokningen öppnas från Cliento.',
          ` <a class="link-brand underline" target="_blank" rel="noreferrer" href="${bookingUrl}">Öppna i ny flik</a>`,
          '</div>',
          `<iframe class="h-[75vh] w-full" src="${bookingUrl}" title="Boka tid"></iframe>`,
        ].join('')
      );
      return;
    }

    showBookingStatus(
      '<div class="p-4 text-sm text-slate-700">Saknar Cliento-konfiguration. Sätt <code>CLIENTO_ACCOUNT_IDS</code> (eller <code>CLIENTO_BOOKING_URL</code>) i serverns <code>.env</code>.</div>'
    );
    return;
  }

  clientoState.loading = true;
  showBookingStatus('<div class="p-4 text-sm text-slate-700">Laddar bokning…</div>');

  if (!document.getElementById('cliento-booking')) {
    const bookingDiv = document.createElement('div');
    bookingDiv.id = 'cliento-booking';
    els.clientoMount.innerHTML = '';
    els.clientoMount.appendChild(bookingDiv);
  }

  if (!window.cbk) {
    window.cbk = function () {
      window.cbk.p.push(arguments);
    };
    window.cbk.p = [];
  }

  const ids = accountIds.length === 1 ? accountIds[0] : accountIds;
  window.cbk('id', ids);
  window.cbk('locale', locale);
  window.cbk('mergeLocations', mergeLocations);
  window.cbk('onCompleted', () => {
    closeModal();
    addMessage('assistant', 'Toppen! Om du vill kan jag även svara på frågor om förberedelser och eftervård.');
  });

  const scriptId = 'cliento-widget-script';
  if (document.getElementById(scriptId)) return;

  const s = document.createElement('script');
  s.id = scriptId;
  s.async = true;
  s.src = widgetSrc;
  s.onload = () => {
    clientoState.loaded = true;
    clientoState.loading = false;
  };
  s.onerror = () => {
    clientoState.loaded = false;
    clientoState.loading = false;
    showBookingStatus(
      '<div class="p-4 text-sm text-slate-700">Kunde inte ladda bokningswidgeten. Prova igen eller boka via hemsidan.</div>'
    );
  };
  document.head.appendChild(s);
}

async function openBookingModal() {
  openModal();
  await publicConfigPromise;
  ensureClientoLoaded();
}

els.bookingClose?.addEventListener('click', closeModal);
els.bookingBackdrop?.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

async function loadExistingConversation() {
  if (!conversationId) return false;
  try {
    const sourceUrl = getSourceUrl();
    const res = await fetch(
      `/conversation/${encodeURIComponent(conversationId)}?sourceUrl=${encodeURIComponent(sourceUrl)}`
    );
    const data = await res.json();
    if (!res.ok) return false;

    els.messages.innerHTML = '';
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    for (const m of msgs) {
      if (m?.role !== 'user' && m?.role !== 'assistant') continue;
      addMessage(m.role, m.content, { scroll: false });
    }
    if (msgs.length === 0) seedWelcome();
    scrollToBottom();
    return true;
  } catch {
    return false;
  }
}

(async () => {
  await publicConfigPromise;
  const loaded = await loadExistingConversation();
  if (!loaded) seedWelcome();
})();
