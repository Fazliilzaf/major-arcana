/* ─── CCO Communication-panel — Sprint 1 (Komm/Journey) ───────────────────
 * Renderar kommunikationsfeed + snabbactions i patientkort-dossier.
 *
 * Owner-mandat:
 *  - Inga Drive-länkar
 *  - Ingen extern AI på journalinnehåll
 *  - AI-utkast endast med human approval (Sprint 2)
 *  - Alla actions auditloggas (backend hanterar)
 *  - Mobil = drawer/bottom-sheet
 *
 * Mountar in på dossier-section data-cco-komm-host. Återanvänder
 * --cco-* tokens och .cco-cal-*-pattern där relevant.
 * ─────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function fmtDaysAgo(iso) {
    if (!iso) return null;
    try {
      const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      if (days === 0) return 'idag';
      if (days === 1) return 'igår';
      return days + ' dagar sedan';
    } catch { return null; }
  }

  async function fetchFeed(customerId, opts) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const r = await fetch('/api/v1/cco-customers/' + encodeURIComponent(customerId) +
      '/communication-feed?tenantId=' + tenantId,
      { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function postInternalNote(customerId, body, opts) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const r = await fetch('/api/v1/cco-customers/' + encodeURIComponent(customerId) + '/internal-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cco-role': role, 'x-cco-tenant': tenantId },
      body: JSON.stringify({ body, tenantId }),
    });
    return r.json();
  }

  async function sendForm(customerId, formType, opts) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const r = await fetch('/api/v1/cco-send/form/' + encodeURIComponent(customerId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cco-role': role, 'x-cco-tenant': tenantId },
      body: JSON.stringify({ formKind: formType, dryRun: false, tenantId }),
    });
    return r.json();
  }

  function showToast(msg, kind) {
    document.querySelectorAll('.cco-komm-toast').forEach(n => n.remove());
    const toast = el('div', { class: 'cco-komm-toast cco-komm-toast--' + (kind || 'ok') }, msg);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ─── Render snabbactions-rad ───
  function renderActions(host, customerId, opts) {
    const actions = el('div', { class: 'cco-komm-actions' });

    const buttons = [
      { id: 'send-hd',     label: 'Hälsodekl.',     icon: '📋',
        onclick: () => doAction('send-hd', customerId, opts, host) },
      { id: 'send-ff',     label: 'Friskförsäkran', icon: '⚕',
        onclick: () => doAction('send-ff', customerId, opts, host) },
      { id: 'send-consent', label: 'Samtycke',      icon: '✍',
        onclick: () => doAction('send-consent', customerId, opts, host) },
      { id: 'internal',    label: 'Intern notis',  icon: '🗒',
        onclick: () => openInternalNoteModal(customerId, opts, host) },
    ];

    for (const b of buttons) {
      actions.appendChild(el('button', {
        class: 'cco-komm-action',
        type: 'button',
        dataset: { action: b.id },
        onclick: b.onclick,
      }, [
        el('span', { class: 'cco-komm-action-icon' }, b.icon),
        el('span', {}, b.label),
      ]));
    }
    host.appendChild(actions);
  }

  async function doAction(actionId, customerId, opts, host) {
    try {
      let result;
      if (actionId === 'send-hd') {
        result = await sendForm(customerId, 'health_declaration', opts);
        if (result.ok) showToast('✓ Hälsodeklaration skickad', 'ok');
        else throw new Error(result.error || 'unknown_error');
      } else if (actionId === 'send-ff') {
        result = await sendForm(customerId, 'fitness_certificate', opts);
        if (result.ok) showToast('✓ Friskförsäkran skickad', 'ok');
        else throw new Error(result.error || 'unknown_error');
      } else if (actionId === 'send-consent') {
        // Använd /cco-send/consent
        const tenantId = opts?.tenantId || 'hair_tp';
        const role = opts?.role || 'owner';
        const r = await fetch('/api/v1/cco-send/consent/' + encodeURIComponent(customerId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cco-role': role, 'x-cco-tenant': tenantId },
          body: JSON.stringify({ consentKind: 'consent_treatment', dryRun: false, tenantId }),
        });
        const j = await r.json();
        if (j.ok || r.ok) showToast('✓ Samtycke skickat', 'ok');
        else throw new Error(j.error || 'unknown_error');
      }
      // Reload feed
      reloadFeed(host, customerId, opts);
    } catch (err) {
      showToast('✗ Misslyckades: ' + err.message, 'error');
    }
  }

  // ─── Intern notis-modal (mobile bottom-sheet) ───
  function openInternalNoteModal(customerId, opts, host) {
    document.querySelectorAll('.cco-komm-modal-backdrop').forEach(n => n.remove());
    const backdrop = el('div', { class: 'cco-komm-modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const modal = el('div', { class: 'cco-komm-modal' });
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    modal.appendChild(el('div', { class: 'cco-komm-modal-head' }, [
      el('h3', {}, '🗒 Intern notis'),
      el('button', { class: 'cco-komm-modal-close', onclick: close }, '×'),
    ]));

    const body = el('div', { class: 'cco-komm-modal-body' });
    body.appendChild(el('div', { class: 'cco-komm-modal-lead' },
      'Intern notis till personal. Visas inte för patient. Auditloggas.'));
    body.appendChild(el('div', { class: 'cco-komm-modal-label' }, 'Text (3–2000 tecken)'));
    const textarea = el('textarea', {
      class: 'cco-komm-modal-input',
      rows: '4',
      placeholder: 'Ex: Patient nämnde allergi mot lokalbedövning under konsultation. Kolla journal innan PRP.',
    });
    body.appendChild(textarea);
    const errorBox = el('div', { class: 'cco-komm-modal-error', style: 'display: none;' });
    body.appendChild(errorBox);
    modal.appendChild(body);

    const submitBtn = el('button', { class: 'cco-komm-modal-submit', type: 'button' }, 'Spara notis');
    submitBtn.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (text.length < 3) {
        errorBox.style.display = 'block';
        errorBox.textContent = 'Min 3 tecken.';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sparar…';
      try {
        const r = await postInternalNote(customerId, text, opts);
        if (!r.ok) throw new Error(r.error || 'unknown_error');
        close();
        showToast('✓ Notis sparad', 'ok');
        reloadFeed(host, customerId, opts);
      } catch (err) {
        errorBox.style.display = 'block';
        errorBox.textContent = 'Misslyckades: ' + err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Spara notis';
      }
    });

    modal.appendChild(el('div', { class: 'cco-komm-modal-foot' }, [
      el('button', { class: 'cco-komm-modal-cancel', type: 'button', onclick: close }, 'Avbryt'),
      submitBtn,
    ]));

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    setTimeout(() => textarea.focus(), 50);
  }

  // ─── Render feed ───
  function renderFeed(host, data) {
    let feedRoot = host.querySelector('.cco-komm-feed');
    if (!feedRoot) {
      feedRoot = el('div', { class: 'cco-komm-feed' });
      host.appendChild(feedRoot);
    }
    feedRoot.innerHTML = '';

    // Header med last-contact
    const lc = data.lastContactTs ? fmtDaysAgo(data.lastContactTs) : null;
    feedRoot.appendChild(el('div', { class: 'cco-komm-feed-head' }, [
      el('div', { class: 'cco-komm-feed-counters' }, [
        el('span', { class: 'cco-komm-counter' }, [
          el('strong', {}, String(data.counters?.total || 0)),
          ' händelser',
        ]),
        el('span', { class: 'cco-komm-counter' }, [
          el('strong', {}, String(data.counters?.sends || 0)),
          ' utskick',
        ]),
        el('span', { class: 'cco-komm-counter' }, [
          el('strong', {}, String(data.counters?.internal_notes || 0)),
          ' notiser',
        ]),
      ]),
      lc ? el('div', { class: 'cco-komm-feed-lastcontact' }, 'Senaste kontakt: ' + lc) : null,
    ]));

    if (!data.events || data.events.length === 0) {
      feedRoot.appendChild(el('div', { class: 'cco-komm-empty' },
        'Ingen kommunikation registrerad ännu. Skicka formulär eller skapa en intern notis ovan.'));
      return;
    }

    const list = el('div', { class: 'cco-komm-list' });
    for (const ev of data.events) {
      const isSend = ev.kind === 'send';
      const tone = ev.status === 'sent' ? 'success'
                 : ev.status === 'dry_run' ? 'warning'
                 : ev.kind === 'event' ? 'info' : 'info';
      list.appendChild(el('div', {
        class: 'cco-komm-event cco-komm-event--' + tone,
      }, [
        el('div', { class: 'cco-komm-event-icon' }, ev.icon || '·'),
        el('div', { class: 'cco-komm-event-body' }, [
          el('div', { class: 'cco-komm-event-title' }, ev.title || ev.kind),
          el('div', { class: 'cco-komm-event-meta' }, [
            el('span', { class: 'cco-komm-event-time' }, fmtDate(ev.ts)),
            ev.actor ? el('span', {}, '· av ' + ev.actor) : null,
            ev.detail?.dryRun ? el('span', { class: 'cco-komm-pill cco-komm-pill--warning' }, 'DRY-RUN') : null,
            ev.detail?.recipientMasked ? el('span', {}, '→ ' + ev.detail.recipientMasked) : null,
          ]),
          (ev.kind === 'internal_note' && ev.detail?.body) ?
            el('div', { class: 'cco-komm-event-note-body' }, ev.detail.body) : null,
        ]),
      ]));
    }
    feedRoot.appendChild(list);
  }

  async function reloadFeed(host, customerId, opts) {
    let feedRoot = host.querySelector('.cco-komm-feed');
    if (feedRoot) feedRoot.innerHTML = '<div class="cco-komm-empty">Uppdaterar…</div>';
    try {
      const data = await fetchFeed(customerId, opts);
      renderFeed(host, data);
    } catch (err) {
      if (feedRoot) feedRoot.innerHTML = '<div class="cco-komm-empty">Kunde inte ladda: ' + err.message + '</div>';
    }
  }

  // ─── Public mount ───
  async function mount(hostSelectorOrEl, opts) {
    const host = typeof hostSelectorOrEl === 'string' ? document.querySelector(hostSelectorOrEl) : hostSelectorOrEl;
    if (!host) return;
    const customerId = opts.customerId;
    if (!customerId) return;

    host.innerHTML = '';
    host.classList.add('cco-komm-host');

    // Snabbactions
    renderActions(host, customerId, opts);

    // Feed
    await reloadFeed(host, customerId, opts);
  }

  // Auto-mount: lyssna på dossier-section som rendereras
  function autoMount() {
    const hosts = document.querySelectorAll('[data-cco-komm-host]:not([data-cco-komm-mounted])');
    for (const host of hosts) {
      const customerId = host.dataset.customerId || host.getAttribute('data-customer-id');
      if (!customerId) continue;
      host.setAttribute('data-cco-komm-mounted', '1');
      // Behåll <summary> men ersätt body
      const summary = host.querySelector('summary');
      const newBody = document.createElement('div');
      newBody.className = 'cco-komm-body';
      // Behåll only summary + ny body
      host.innerHTML = '';
      if (summary) host.appendChild(summary);
      host.appendChild(newBody);
      mount(newBody, {
        customerId,
        tenantId: host.dataset.tenantId || 'hair_tp',
        role: host.dataset.role || 'owner',
      }).catch(() => {});
    }
  }

  // Bind: observera DOM-ändringar för late-rendered dossier
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
  // Observer för dossier som re-renderas vid kund-byte
  try {
    const observer = new MutationObserver(() => autoMount());
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  global.CcoKommPanel = { mount, reload: reloadFeed, autoMount };
})(window);
