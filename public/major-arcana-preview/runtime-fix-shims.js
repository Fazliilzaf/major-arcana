/**
 * runtime-fix-shims.js — körs efter app.js för att patcha P0-buggar i preview
 *
 * P0-1: Persistera selectedMailboxIds mellan sessions (localStorage)
 * P0-2: Fallback för "Okänd avsändare" — extrahera namn från email-localpart
 *
 * Dessa är non-invasive shims som hookar DOM + storage utan att ändra app.js.
 * När fixen byggs in i app.js permanent kan denna fil tas bort.
 */
(() => {
  'use strict';

  const LS_KEY_SELECTED = 'cco.selectedMailboxIds.v1';
  const DEFAULT_MAILBOXES = ['contact','egzona','fazli','info','kons','marknad'];

  // ============================================================
  // P0-1: Mailbox-val persistens
  // ============================================================

  function readPersistedMailboxes() {
    try {
      const raw = localStorage.getItem(LS_KEY_SELECTED);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }

  function writePersistedMailboxes(ids) {
    try {
      const safe = Array.isArray(ids) ? ids : [];
      localStorage.setItem(LS_KEY_SELECTED, JSON.stringify(safe));
    } catch (e) {}
  }

  function getCurrentlyCheckedMailboxes() {
    const checks = document.querySelectorAll('input[type="checkbox"][data-mailbox-id], input[type="checkbox"][data-mailbox-key]');
    const ids = [];
    checks.forEach(cb => {
      if (cb.checked) {
        const id = cb.dataset.mailboxId || cb.dataset.mailboxKey;
        if (id) ids.push(id);
      }
    });
    return ids;
  }

  function findMailboxRowsInDom() {
    // Mailbox-options container kan ha olika klassnamn — försök flera
    const containers = [
      '.mailbox-options',
      '[data-mailbox-options]',
      '[data-mailbox-list]',
      '[data-mailbox-picker]',
    ];
    for (const sel of containers) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function applyPersistedMailboxes() {
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return false;

    let applied = 0;
    // Strategi: hitta alla mailbox-checkboxes och markera de som matchar persisted-listan
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
      const labelEl = cb.closest('label') || cb.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      const matchedKey = persisted.find(k => labelText.includes(k.toLowerCase()));
      if (matchedKey && !cb.checked) {
        // Trigga click istället för bara setChecked så app.js sin event-handler körs
        cb.click();
        applied += 1;
      }
    });
    if (applied > 0) {
      console.log('[fix-shim] Återställde', applied, 'mailbox-val från localStorage');
    }
    return applied > 0;
  }

  function findMailboxToggleButton() {
    // Försök olika selektorer
    const selectors = [
      '[data-mailbox-toggle]',
      '[data-mailbox-picker-toggle]',
      '[data-truth-mailbox-toggle]',
      '.mailbox-toggle',
      '.mailbox-picker-toggle',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: text-baserad sökning. Mailbox-väljaren har label som "Hair TP Clinic - Inga mailboxar"
    // eller "Hair TP Clinic - Egzona +5"
    const candidates = document.querySelectorAll('button, label, [role="button"], [role="combobox"]');
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (txt.length > 0 && txt.length < 80 && /Hair TP Clinic|mailboxar|mailboxes/i.test(txt)) {
        return el;
      }
    }
    return null;
  }

  async function autoOpenAndApplyAtBootstrap() {
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return;

    // Vänta först på att appen är någorlunda klar
    await new Promise(r => setTimeout(r, 1500));

    // Kolla om checkboxes redan finns i DOM (dropdown öppen)
    const existingCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => {
        const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
        return DEFAULT_MAILBOXES.some(m => lbl.includes(m));
      });
    if (existingCheckboxes.length > 0) {
      // Kanske redan öppen — försök applicera direkt
      applyPersistedMailboxes();
      return;
    }

    // Annars: hitta toggle och öppna
    const toggle = findMailboxToggleButton();
    if (!toggle) {
      console.warn('[fix-shim] Hittar inte mailbox-toggle vid bootstrap — kan inte återställa val automatiskt');
      return;
    }

    // Klicka för att öppna dropdown
    toggle.click();
    await new Promise(r => setTimeout(r, 600)); // Vänta på render

    // Klicka checkboxes
    const applied = applyPersistedMailboxes();

    // Stäng dropdown genom att klicka utanför
    await new Promise(r => setTimeout(r, 300));
    const outside = document.body;
    outside.click();
    // Klick på Escape som backup
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    if (applied) {
      console.log('[fix-shim] Auto-återställde', persisted.length, 'mailbox-val vid bootstrap');
    }
  }

  function watchMailboxChanges() {
    // Lyssna på alla checkbox-changes globalt och spara tillstånd
    document.addEventListener('change', (e) => {
      if (e.target?.type !== 'checkbox') return;
      const labelEl = e.target.closest('label') || e.target.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      // Bara om det ser ut som en mailbox-checkbox
      const isMailboxCheckbox = DEFAULT_MAILBOXES.some(m => labelText.includes(m));
      if (!isMailboxCheckbox) return;

      // Samla alla nu-checkade mailbox-namn
      const checked = [];
      document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
        const matched = DEFAULT_MAILBOXES.find(m => lbl.includes(m));
        if (matched) checked.push(matched);
      });
      writePersistedMailboxes([...new Set(checked)]);
    }, true);
  }

  function bootstrapMailboxPersistence() {
    watchMailboxChanges();
    // Strategi 1: om dropdown råkar vara öppen vid någon polling-tick
    let attempts = 0;
    const maxAttempts = 6;
    const interval = setInterval(() => {
      attempts += 1;
      const container = findMailboxRowsInDom();
      if (container) {
        clearInterval(interval);
        applyPersistedMailboxes();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 500);
    // Strategi 2: forcera öppna dropdown och applicera
    autoOpenAndApplyAtBootstrap().catch(e => console.warn('[fix-shim] auto-open fel:', e));
  }

  // ============================================================
  // P0-2: "Okänd avsändare" fallback från worklist-API
  // ============================================================

  // Map: threadId → { name, email }
  const threadCustomerMap = new Map();

  function buildWorklistConsumerUrl() {
    // Hämta sparade mailbox-val (eller default-listan)
    let mailboxIds = [];
    try {
      const persisted = localStorage.getItem(LS_KEY_SELECTED);
      if (persisted) {
        const parsed = JSON.parse(persisted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          mailboxIds = parsed.map(k => `${k}@hairtpclinic.com`);
        }
      }
    } catch (e) { /* tyst */ }
    if (mailboxIds.length === 0) {
      mailboxIds = DEFAULT_MAILBOXES.map(k => `${k}@hairtpclinic.com`);
    }
    const params = new URLSearchParams();
    params.set('mailboxIds', mailboxIds.join(','));
    params.set('limit', '500');
    return `/api/v1/cco/runtime/worklist/consumer?${params.toString()}`;
  }

  async function fetchWorklistAndBuildMap() {
    try {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN') || '';
      if (!token) return false;
      const res = await fetch(buildWorklistConsumerUrl(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!res.ok) return false;
      const data = await res.json();
      const rows = Array.isArray(data?.rows)
        ? data.rows
        : (Array.isArray(data?.items) ? data.items : []);
      let added = 0;
      for (const row of rows) {
        const id = row.id
          || row.conversationKey
          || row.conversation?.key
          || row.conversation?.mailboxConversationId
          || row.conversation?.conversationId
          || row.conversation?.id
          || row.conversationId;
        if (!id) continue;
        const customer = row.customer || row.contact || {};
        const name = customer.name || customer.displayName || row.customerName || row.from?.name || '';
        const email = customer.email || customer.address || row.customerEmail || row.from?.address || '';
        // Lagra med flera nyckelvarianter eftersom DOM-id kan vara annan format
        const norm = String(id).toLowerCase();
        threadCustomerMap.set(norm, { name, email });
        // Spara även lowercase utan symboler för fuzzy match
        const stripped = norm.replace(/[^a-z0-9]/g, '');
        threadCustomerMap.set(stripped, { name, email });
        added += 1;
      }
      console.log('[fix-shim] Hämtade', added, 'trådar från worklist-API → kund-namn-karta');
      return added > 0;
    } catch (e) {
      console.warn('[fix-shim] worklist-fetch fel:', e);
      return false;
    }
  }

  function lookupCustomerForCard(cardEl) {
    const tid = cardEl.dataset.runtimeThread || cardEl.dataset.historyConversation || cardEl.dataset.threadId;
    if (!tid) return null;
    const norm = String(tid).toLowerCase();
    if (threadCustomerMap.has(norm)) return threadCustomerMap.get(norm);
    const stripped = norm.replace(/[^a-z0-9]/g, '');
    if (threadCustomerMap.has(stripped)) return threadCustomerMap.get(stripped);
    return null;
  }

  function humanizeLocalpart(localpart) {
    if (!localpart) return '';
    // foo.bar → Foo Bar, john_doe → John Doe
    return localpart
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function fixUnknownSenderInCard(cardEl) {
    if (!cardEl) return;
    // Sök efter "Okänd avsändare" text i kortet
    const walker = document.createTreeWalker(cardEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => /Okänd avsändare/i.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    if (targets.length === 0) return;

    // Slå upp kund-data i karta byggd från worklist-API
    let humanName = '';
    const customer = lookupCustomerForCard(cardEl);
    if (customer?.name) {
      humanName = customer.name;
    } else if (customer?.email) {
      humanName = humanizeLocalpart(customer.email.split('@')[0]);
    }

    // Fallback: leta efter email i DOM (om kortet ändå har email någonstans)
    if (!humanName) {
      let email = '';
      const allElements = [cardEl, ...cardEl.querySelectorAll('*')];
      for (const el of allElements) {
        for (const attr of el.attributes || []) {
          const m = (attr.value || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (m) { email = m[0]; break; }
        }
        if (email) break;
      }
      if (!email) {
        const m = cardEl.textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (m) email = m[0];
      }
      if (email) humanName = humanizeLocalpart(email.split('@')[0]);
    }

    if (!humanName) return; // Vi har inget att ersätta med

    targets.forEach(textNode => {
      textNode.nodeValue = textNode.nodeValue.replace(/Okänd avsändare/gi, humanName);
    });
    cardEl.dataset.shimNameFixed = 'true';
  }

  function scanAndFixUnknownSenders(root) {
    const cards = (root || document).querySelectorAll('.thread-card:not([data-shim-name-fixed])');
    cards.forEach(fixUnknownSenderInCard);
  }

  function observeUnknownSenders() {
    // MutationObserver — fixa nya thread-cards när de renderas
    const obs = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) needsScan = true;
        if (m.type === 'characterData' && /Okänd avsändare/.test(m.target.nodeValue || '')) needsScan = true;
      }
      if (needsScan) scanAndFixUnknownSenders();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Initial scan
    scanAndFixUnknownSenders();
  }

  // ============================================================
  // P1-1: Klick på thread-card uppdaterar inte FOKUSYTA
  // ============================================================
  //
  // App.js har en delegerad click-handler någonstans men träffas inte konsekvent
  // av enkelt click. Vi lyssnar globalt på click som bubblar upp till
  // .thread-card och dispatchar en kedja av events som app.js sannolikt lyssnar
  // på (pointerdown + pointerup + click + mousedown). Plus markerar kortet som
  // selected via DOM-class så användaren ser visuell feedback omedelbart.

  function handleThreadCardClick(event) {
    const card = event.target.closest('.thread-card');
    if (!card) return;
    // Skippa om klicket var på en knapp/action inom kortet (de har egna handlers)
    if (event.target.closest('button, [role="button"], [data-quick-action], a, input, label')) return;
    // Förhindra dubbel-trigger
    if (card.dataset.shimSelectInFlight === '1') return;
    card.dataset.shimSelectInFlight = '1';

    // Visuell feedback omedelbart: markera detta som selected, avmarkera andra
    document.querySelectorAll('.thread-card.is-selected, .thread-card.thread-card-selected').forEach(c => {
      if (c !== card) {
        c.classList.remove('is-selected', 'thread-card-selected');
      }
    });
    card.classList.add('is-selected', 'thread-card-selected');
    card.setAttribute('aria-pressed', 'true');

    // Permanent fix: använd workspace-API direkt om exponerad
    const threadId = card.dataset.runtimeThread || card.dataset.historyConversation || '';
    if (threadId && window.__ccoWorkspace?.setSelectedThreadId) {
      try {
        window.__ccoWorkspace.setSelectedThreadId(threadId);
        // Dispatcha state-change event som många runtime-moduler lyssnar på
        window.dispatchEvent(new CustomEvent('cco:state-change', { detail: { selectedThreadId: threadId } }));
      } catch (e) { console.warn('[fix-shim] setSelectedThreadId fel:', e); }
    }

    // Backup: dispatcha pointer-event-kedja om workspace-API saknas
    if (!window.__ccoWorkspace) {
      const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      for (const ev of eventTypes) {
        const e = new PointerEvent(ev, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 });
        card.dispatchEvent(e);
      }
    }

    setTimeout(() => { delete card.dataset.shimSelectInFlight; }, 200);
  }

  function bootstrapThreadCardClickFix() {
    // Lyssna på capture-fas så vi får eventet innan app.js
    document.addEventListener('click', handleThreadCardClick, false);
    console.log('[fix-shim] thread-card click-handler aktiv');
  }

  // ============================================================
  // P1-4: Live-räknare i topbar (preview-live-pill)
  // ============================================================
  //
  // Pill defaultar till "Demo" (gul). När live-data finns visar pill
  // "Live · N" (grön/teal) där N = antal trådar i nuvarande lista.
  // Live-tillstånd avgörs av:
  //   1. window.__ccoWorkspace?.getState?.()?.runtime?.live === true, ELLER
  //   2. det finns minst 1 .thread-card i DOM (= preview har laddat riktig data)

  let livePillTimer = null;
  let lastPillSig = '';

  function detectLiveState() {
    let isLive = false;
    let threadCount = 0;
    try {
      const ws = window.__ccoWorkspace;
      if (ws && typeof ws.getState === 'function') {
        const st = ws.getState();
        const runtime = st?.runtime || {};
        if (runtime.live === true || runtime.mode === 'live') isLive = true;
        if (Array.isArray(runtime.threads)) {
          threadCount = runtime.threads.length;
          if (threadCount > 0) isLive = true;
        } else if (Array.isArray(st?.threads)) {
          threadCount = st.threads.length;
        }
      }
    } catch (e) { /* tyst */ }

    // Räkna .thread-card i DOM som fallback / bekräftelse
    const domCount = document.querySelectorAll('.thread-card').length;
    if (domCount > 0) {
      isLive = true;
      threadCount = Math.max(threadCount, domCount);
    }

    // Om mailboxar är valda och token finns men inga trådar — fortfarande "Live · 0"
    // istället för Demo, så användaren förstår att det är riktig data men tomt.
    try {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN');
      const mailboxes = localStorage.getItem(LS_KEY_SELECTED);
      if (token && mailboxes && JSON.parse(mailboxes)?.length > 0) {
        isLive = true;
      }
    } catch (e) { /* tyst */ }

    return { isLive, threadCount };
  }

  function updateLivePill() {
    const pill = document.getElementById('preview-live-status');
    if (!pill) return;

    const { isLive, threadCount } = detectLiveState();
    const labelEl = pill.querySelector('.preview-live-pill-label');
    if (!labelEl) return;

    const newLabel = isLive ? `Live · ${threadCount}` : 'Demo';
    const newDemoClass = !isLive;
    const sig = `${newLabel}|${newDemoClass}`;
    if (sig === lastPillSig) return;
    lastPillSig = sig;

    labelEl.textContent = newLabel;
    pill.classList.toggle('preview-live-pill--demo', newDemoClass);
    pill.title = isLive
      ? `Live-data — ${threadCount} tråd${threadCount === 1 ? '' : 'ar'} i kö`
      : 'Demo-läge — välj mailboxar för att hämta live-data';
  }

  function bootstrapLivePill() {
    // Initial uppdatering så pill inte sitter och säger "Demo" oändligt
    updateLivePill();
    // Snabb polling i början, sen lugnare
    let ticks = 0;
    livePillTimer = setInterval(() => {
      ticks += 1;
      updateLivePill();
      if (ticks === 30) {
        // Efter 30 snabba ticks (~30s) — sänk frekvensen
        clearInterval(livePillTimer);
        livePillTimer = setInterval(updateLivePill, 5000);
      }
    }, 1000);

    // Lyssna också på custom events från app.js / shim
    window.addEventListener('cco:state-change', updateLivePill);
    window.addEventListener('cco:runtime-update', updateLivePill);
    document.addEventListener('change', (e) => {
      if (e.target?.type === 'checkbox') setTimeout(updateLivePill, 200);
    }, true);
  }

  // ============================================================
  // P2-3: Räknare per mailbox i mailbox-väljaren
  // ============================================================
  //
  // Bygger en karta { mailboxKey → count } från worklist-API och DOM-patchar
  // mailbox-rader i dropdown så att de visar "Egzona · 47" istället för bara
  // "Egzona". Köras varje gång dropdown öppnas.

  const mailboxCountMap = new Map();

  function rebuildMailboxCounts(rows) {
    mailboxCountMap.clear();
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      // worklist/consumer rader har shape { mailbox: { mailboxId, mailboxAddress }, conversation: {...} }
      const candidates = [
        row?.mailbox?.mailboxId,
        row?.mailbox?.mailboxAddress,
        row?.mailbox?.address,
        row?.mailbox?.id,
        row?.mailbox?.key,
        row?.mailboxId,
        row?.mailboxAddress,
        row?.assignedMailboxId,
        row?.primaryMailboxId,
      ].filter(Boolean);
      // Räkna bara EN gång per rad — ta första matchande mailbox
      let counted = false;
      for (const c of candidates) {
        if (counted) break;
        const norm = String(c).toLowerCase();
        const localpart = norm.includes('@') ? norm.split('@')[0] : norm;
        // Hitta vilken DEFAULT_MAILBOXES-prefix som matchar localpart
        const key = DEFAULT_MAILBOXES.find(m => localpart === m || localpart.startsWith(m));
        if (!key) continue;
        mailboxCountMap.set(key, (mailboxCountMap.get(key) || 0) + 1);
        counted = true;
      }
    }
  }

  async function fetchMailboxCounts() {
    try {
      const token = localStorage.getItem('ARCANA_ADMIN_TOKEN') || '';
      if (!token) return;
      // Bygg URL med ALLA defaultmailboxar så vi får räknare även för ej-valda
      const params = new URLSearchParams();
      params.set('mailboxIds', DEFAULT_MAILBOXES.map(k => `${k}@hairtpclinic.com`).join(','));
      params.set('limit', '500');
      const res = await fetch(`/api/v1/cco/runtime/worklist/consumer?${params.toString()}`, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data?.rows)
        ? data.rows
        : (Array.isArray(data?.items) ? data.items : []);
      rebuildMailboxCounts(rows);
    } catch (e) { /* tyst */ }
  }

  function applyMailboxCountsToDom() {
    if (mailboxCountMap.size === 0) return;
    // Hitta alla mailbox-options i dropdown
    const labels = document.querySelectorAll('label');
    labels.forEach(label => {
      const cb = label.querySelector('input[type="checkbox"]');
      if (!cb) return;
      const text = (label.textContent || '').toLowerCase();
      const matched = DEFAULT_MAILBOXES.find(m => text.includes(m));
      if (!matched) return;
      const count = mailboxCountMap.get(matched) || 0;
      // Hitta primär label-text-noden (oftast en <span> eller direkt textnode)
      // Lägg till count-suffix som ett <span class="shim-mbx-count"> om det inte redan finns
      if (label.querySelector('.shim-mbx-count')) {
        label.querySelector('.shim-mbx-count').textContent = count > 0 ? ` · ${count}` : '';
        return;
      }
      const countSpan = document.createElement('span');
      countSpan.className = 'shim-mbx-count';
      countSpan.style.cssText = 'opacity:0.7;margin-left:6px;font-variant-numeric:tabular-nums;font-size:0.85em;white-space:nowrap;';
      countSpan.textContent = count > 0 ? ` · ${count}` : '';
      // Föredra .mailbox-option-copy (innehåller namnet) framför .mailbox-option-box (avatar)
      // Annars fall back till sista non-input child
      const labelTextEl =
        label.querySelector('.mailbox-option-copy')
        || label.querySelector('[class*="copy"]')
        || label.querySelector('[class*="label"]')
        || Array.from(label.children).reverse().find(c => c.tagName !== 'INPUT' && !c.className.includes('box'))
        || label;
      labelTextEl.appendChild(countSpan);
    });
  }

  function bootstrapMailboxCounts() {
    // Initial fetch
    fetchMailboxCounts().then(applyMailboxCountsToDom);
    // Re-applicera när DOM ändras (dropdown öppnas/stängs)
    const obs = new MutationObserver(() => {
      // Throttle: kör max var 250ms
      if (bootstrapMailboxCounts._t) return;
      bootstrapMailboxCounts._t = setTimeout(() => {
        applyMailboxCountsToDom();
        bootstrapMailboxCounts._t = null;
      }, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Re-fetcha periodiskt
    setInterval(() => {
      fetchMailboxCounts().then(applyMailboxCountsToDom);
    }, 60000);
  }

  // ============================================================
  // P2-1: Översätt raw status-codes som leakar till DOM
  // ============================================================
  //
  // app.js har nu utökad humanizeCode-mapping (commit P2-1) men om någon
  // render-path går runt humanizeCode kan koden fortfarande synas. Detta är
  // en defensiv DOM-replace som fångar raw codes och översätter.

  const STATUS_LABEL_MAP = {
    needs_reply: 'Behöver svar',
    needs_action: 'Behöver åtgärd',
    needs_review: 'Behöver granskning',
    in_progress: 'Pågår',
    in_review: 'Under granskning',
    ready_to_book: 'Redo att boka',
    ready_now: 'Redo att boka',
    low_confidence: 'Låg konfidens',
    high_confidence: 'Hög konfidens',
    waiting: 'Väntar',
    waiting_reply: 'Väntar på svar',
    waiting_customer: 'Väntar på kund',
    awaiting_customer: 'Väntar på kund',
    awaiting_owner: 'Behöver åtgärd',
    awaiting_confirmation: 'Väntar på bekräftelse',
    closed: 'Stängd',
    resolved: 'Löst',
    done: 'Klar',
    paused: 'Pausad',
    snoozed: 'Senare',
    escalated: 'Eskalerad',
    open: 'Öppen',
    reopened: 'Återöppnad',
    pending: 'Väntar',
    scheduled: 'Schemalagd',
    booked: 'Bokad',
    cancelled: 'Avbokad',
    no_show: 'Uteblev',
    response_needed: 'Svar krävs',
    follow_up_pending: 'Återbesök väntar',
    booking_ready: 'Redo att boka',
    blocked_medical: 'Medicinsk kontroll',
    not_relevant: 'Ej relevant',
    active_dialogue: 'Aktiv dialog',
  };

  // Title-cased English varianter (humanizeCode-fallbacks)
  const STATUS_LABEL_TITLECASE = {};
  for (const [k, v] of Object.entries(STATUS_LABEL_MAP)) {
    const titleCased = k.split(/[_-]+/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    STATUS_LABEL_TITLECASE[titleCased] = v;
  }

  function translateStatusText(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    // Exakt match på snake_case raw
    const lower = trimmed.toLowerCase();
    if (STATUS_LABEL_MAP[lower]) return STATUS_LABEL_MAP[lower];
    // Exakt match på title-cased English ("In Progress")
    if (STATUS_LABEL_TITLECASE[trimmed]) return STATUS_LABEL_TITLECASE[trimmed];
    return null;
  }

  function fixStatusLabelsInRoot(root) {
    const target = root || document.body;
    if (!target) return;
    // Begränsa till element som troligen är status-pills (inte hela body)
    const candidates = target.querySelectorAll('[class*="status"], [data-status], [class*="tag"], [class*="badge"], [class*="chip"], [class*="pill"]');
    candidates.forEach(el => {
      // Bara om elementet bara har text-innehåll (inga child-element)
      if (el.children.length > 0) {
        // Kolla bara direkt-text noder
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const translated = translateStatusText(node.nodeValue);
            if (translated && translated !== node.nodeValue.trim()) {
              node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), translated);
            }
          }
        }
        return;
      }
      const translated = translateStatusText(el.textContent);
      if (translated && translated !== el.textContent.trim()) {
        el.textContent = translated;
      }
    });
  }

  function bootstrapStatusLabelFix() {
    fixStatusLabelsInRoot();
    const obs = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) needsScan = true;
        if (m.type === 'characterData') needsScan = true;
      }
      if (needsScan) fixStatusLabelsInRoot();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    try { bootstrapMailboxPersistence(); } catch (e) { console.warn('[fix-shim] mailbox-persistens fel:', e); }
    try { bootstrapThreadCardClickFix(); } catch (e) { console.warn('[fix-shim] thread-card-click fel:', e); }
    try { bootstrapLivePill(); } catch (e) { console.warn('[fix-shim] live-pill fel:', e); }
    try { bootstrapStatusLabelFix(); } catch (e) { console.warn('[fix-shim] status-label-fix fel:', e); }
    try { bootstrapMailboxCounts(); } catch (e) { console.warn('[fix-shim] mailbox-counts fel:', e); }
    try {
      // Fetcha worklist-API först så namn-kartan finns innan observer scannar
      await fetchWorklistAndBuildMap();
      observeUnknownSenders();
      // Re-fetcha kartan + re-scan periodiskt så nya trådar får namn
      setInterval(async () => {
        await fetchWorklistAndBuildMap();
        // Forcera re-scan på alla kort genom att rensa shim-fixed-flag
        document.querySelectorAll('.thread-card[data-shim-name-fixed]').forEach(c => delete c.dataset.shimNameFixed);
        scanAndFixUnknownSenders();
        updateLivePill();
      }, 60000); // Var 60 sek
    } catch (e) { console.warn('[fix-shim] okänd-avsändare-fix fel:', e); }
    console.log('[fix-shim] runtime-fix-shims aktiv (mailbox-persistens + okänd-avsändare + thread-card-click + live-pill + status-labels + mailbox-counts)');
  }
})();
