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
      return (
        d.toLocaleDateString('sv-SE') +
        ' ' +
        d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return iso;
    }
  }

  function fmtDaysAgo(iso) {
    if (!iso) return null;
    try {
      const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      if (days === 0) return 'idag';
      if (days === 1) return 'igår';
      return days + ' dagar sedan';
    } catch {
      return null;
    }
  }

  async function fetchFeed(customerId, opts) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const r = await fetch(
      '/api/v1/cco-customers/' +
        encodeURIComponent(customerId) +
        '/communication-feed?tenantId=' +
        tenantId,
      { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function postInternalNote(customerId, body, opts) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const r = await fetch(
      '/api/v1/cco-customers/' + encodeURIComponent(customerId) + '/internal-note',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cco-role': role,
          'x-cco-tenant': tenantId,
        },
        body: JSON.stringify({ body, tenantId }),
      }
    );
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
    document.querySelectorAll('.cco-komm-toast').forEach((n) => n.remove());
    const toast = el('div', { class: 'cco-komm-toast cco-komm-toast--' + (kind || 'ok') }, msg);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ─── Render snabbactions-rad ───
  function renderActions(host, customerId, opts) {
    const actions = el('div', { class: 'cco-komm-actions' });

    const buttons = [
      {
        id: 'svarstudio',
        label: 'Svarstudio',
        icon: '✏',
        onclick: () => openSvarstudio(customerId, opts, host),
      },
      {
        id: 'send-hd',
        label: 'Hälsodekl.',
        icon: '📋',
        onclick: () => doAction('send-hd', customerId, opts, host),
      },
      {
        id: 'send-ff',
        label: 'Friskförsäkran',
        icon: '⚕',
        onclick: () => doAction('send-ff', customerId, opts, host),
      },
      {
        id: 'send-consent',
        label: 'Samtycke',
        icon: '✍',
        onclick: () => doAction('send-consent', customerId, opts, host),
      },
      {
        id: 'internal',
        label: 'Intern notis',
        icon: '🗒',
        onclick: () => openInternalNoteModal(customerId, opts, host),
      },
    ];

    for (const b of buttons) {
      actions.appendChild(
        el(
          'button',
          {
            class: 'cco-komm-action',
            type: 'button',
            dataset: { action: b.id },
            onclick: b.onclick,
          },
          [el('span', { class: 'cco-komm-action-icon' }, b.icon), el('span', {}, b.label)]
        )
      );
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
          headers: {
            'Content-Type': 'application/json',
            'x-cco-role': role,
            'x-cco-tenant': tenantId,
          },
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

  // ─── Svarstudio (Sprint 2) — template-picker + draft + approval-flöde ───
  let _commTemplatesCache = null;

  async function loadCommTemplates(opts) {
    if (_commTemplatesCache) return _commTemplatesCache;
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    try {
      const r = await fetch(
        '/api/v1/cco-comm/templates?brand=' + (tenantId === 'curatiio' ? 'curatiio' : 'hair_tp'),
        { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } }
      );
      const j = await r.json();
      _commTemplatesCache = j.templates || [];
    } catch {
      _commTemplatesCache = [];
    }
    return _commTemplatesCache;
  }

  async function openSvarstudio(customerId, opts, host) {
    const templates = await loadCommTemplates(opts);
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';

    const state = {
      mode: 'pick', // pick | edit
      templateId: null,
      template: null,
      subject: '',
      body: '',
      channel: 'email',
      journeyStep: null,
      mergeFields: {},
      currentDraftId: null,
    };

    document.querySelectorAll('.cco-komm-modal-backdrop').forEach((n) => n.remove());
    const backdrop = el('div', {
      class: 'cco-komm-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
    });
    const modal = el('div', { class: 'cco-komm-modal cco-komm-modal--wide' });
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    modal.appendChild(
      el('div', { class: 'cco-komm-modal-head' }, [
        el('h3', {}, '✏ Svarstudio — utkast'),
        el('button', { class: 'cco-komm-modal-close', onclick: close }, '×'),
      ])
    );

    const body = el('div', { class: 'cco-komm-modal-body cco-komm-svar-body' });
    modal.appendChild(body);

    const footer = el('div', { class: 'cco-komm-modal-foot cco-komm-svar-foot' });
    modal.appendChild(footer);

    function renderPick() {
      body.innerHTML = '';
      footer.innerHTML = '';
      body.appendChild(
        el(
          'div',
          { class: 'cco-komm-modal-lead' },
          '✋ Inget skickas externt automatiskt. Utkast skapas och kräver godkännande innan utskick.'
        )
      );
      body.appendChild(el('div', { class: 'cco-komm-modal-label' }, 'Välj mall · kundresesteg'));

      const grid = el('div', { class: 'cco-komm-svar-templates' });
      const STAGE_LABEL = {
        lead_first_contact: 'Lead välkomnande',
        booking_confirmed: 'Bokningsbekräftelse',
        pre_treatment_reminder: '24h påminnelse',
        post_consultation: 'Sammanfattning konsultation',
        cancellation: 'Avbokningsbekräftelse',
        no_show_followup: 'No-show uppföljning',
        missing_documents_reminder: 'Saknade dokument',
        aftercare_reminder: 'Eftervård vecka 1',
        follow_up_reminder: 'Uppföljning 3 mån',
      };
      for (const tpl of templates) {
        grid.appendChild(
          el(
            'button',
            {
              class: 'cco-komm-svar-template',
              type: 'button',
              onclick: () => {
                state.templateId = tpl.templateId;
                state.template = tpl;
                state.subject = tpl.subject || '';
                state.body = tpl.bodyMarkdown || '';
                state.channel = tpl.channel || 'email';
                state.journeyStep = tpl.journeyStep;
                state.mode = 'edit';
                renderEdit();
              },
            },
            [
              el(
                'div',
                { class: 'cco-komm-svar-template-stage' },
                STAGE_LABEL[tpl.journeyStep] || tpl.journeyStep
              ),
              el(
                'div',
                { class: 'cco-komm-svar-template-subject' },
                tpl.subject || '(SMS — ingen subject)'
              ),
              el(
                'div',
                { class: 'cco-komm-svar-template-meta' },
                tpl.channel.toUpperCase() + ' · ' + tpl.mergeFields.length + ' merge fields'
              ),
            ]
          )
        );
      }
      body.appendChild(grid);

      footer.appendChild(
        el('button', { class: 'cco-komm-modal-cancel', type: 'button', onclick: close }, 'Avbryt')
      );
    }

    function renderEdit() {
      body.innerHTML = '';
      footer.innerHTML = '';

      // Back-länk + meta
      body.appendChild(
        el('div', { class: 'cco-komm-svar-edit-head' }, [
          el(
            'button',
            {
              class: 'cco-komm-svar-back',
              type: 'button',
              onclick: () => {
                state.mode = 'pick';
                renderPick();
              },
            },
            '‹ Tillbaka till mallar'
          ),
          el('div', { class: 'cco-komm-svar-meta' }, [
            el('span', { class: 'cco-komm-pill' }, state.channel.toUpperCase()),
            el('span', {}, state.journeyStep),
          ]),
        ])
      );

      // AI-utkast banner (Sprint 2 P2 — finns inte än)
      body.appendChild(
        el('div', { class: 'cco-komm-svar-banner' }, [
          '✋ Detta är ett utkast. Inget skickas förrän en människa godkänner. Ingen extern AI på journaltext.',
        ])
      );

      // Subject
      if (state.channel === 'email') {
        body.appendChild(el('div', { class: 'cco-komm-modal-label' }, 'Ämne'));
        const subj = el('input', {
          class: 'cco-komm-modal-input',
          type: 'text',
          value: state.subject,
        });
        subj.addEventListener('input', (e) => {
          state.subject = e.target.value;
        });
        body.appendChild(subj);
      }

      // Body
      body.appendChild(el('div', { class: 'cco-komm-modal-label' }, 'Meddelande'));
      const txt = el('textarea', {
        class: 'cco-komm-modal-input cco-komm-svar-textarea',
        rows: '10',
      });
      txt.value = state.body;
      txt.addEventListener('input', (e) => {
        state.body = e.target.value;
      });
      body.appendChild(txt);

      // Merge fields hint
      if (state.template?.mergeFields?.length) {
        body.appendChild(
          el(
            'div',
            { class: 'cco-komm-svar-merge-hint' },
            'Merge fields: ' + state.template.mergeFields.map((f) => '{{' + f + '}}').join(', ')
          )
        );
      }

      // Footer: olika beroende på om draft skapad eller inte
      if (!state.currentDraftId) {
        const saveDraftBtn = el(
          'button',
          { class: 'cco-komm-modal-submit', type: 'button' },
          'Spara som utkast'
        );
        saveDraftBtn.addEventListener('click', async () => {
          saveDraftBtn.disabled = true;
          saveDraftBtn.textContent = 'Sparar…';
          try {
            const r = await fetch('/api/v1/cco-comm/drafts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cco-role': role,
                'x-cco-tenant': tenantId,
              },
              body: JSON.stringify({
                customerId,
                tenantId,
                templateId: state.templateId,
                subject: state.subject,
                body: state.body,
                channel: state.channel,
                journeyStep: state.journeyStep,
                mergeFields: state.mergeFields,
                aiGenerated: false,
              }),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'unknown');
            state.currentDraftId = j.draft.draftId;
            showToast('✓ Utkast sparat', 'ok');
            renderEdit();
            reloadFeed(host, customerId, opts);
          } catch (err) {
            saveDraftBtn.disabled = false;
            saveDraftBtn.textContent = 'Spara som utkast';
            showToast('✗ ' + err.message, 'error');
          }
        });
        footer.appendChild(
          el('button', { class: 'cco-komm-modal-cancel', type: 'button', onclick: close }, 'Avbryt')
        );
        footer.appendChild(saveDraftBtn);
      } else {
        // Draft finns → erbjuda Markera klart-för-godkännande + Godkänn + Queue
        const requestApprovalBtn = el(
          'button',
          { class: 'cco-komm-modal-submit', type: 'button' },
          'Markera klart'
        );
        requestApprovalBtn.addEventListener('click', () =>
          transitionDraft('needs_approval', 'Klar för granskning')
        );
        const approveBtn = el(
          'button',
          { class: 'cco-komm-modal-submit cco-komm-modal-submit--gold', type: 'button' },
          '✓ Godkänn'
        );
        approveBtn.addEventListener('click', () => transitionDraft('approved'));
        const queueBtn = el(
          'button',
          { class: 'cco-komm-modal-submit cco-komm-modal-submit--queue', type: 'button' },
          '⏳ Lägg i kö'
        );
        queueBtn.addEventListener('click', () => transitionDraft('queued'));
        footer.appendChild(
          el('button', { class: 'cco-komm-modal-cancel', type: 'button', onclick: close }, 'Stäng')
        );
        footer.appendChild(requestApprovalBtn);
        footer.appendChild(approveBtn);
        footer.appendChild(queueBtn);
      }
    }

    async function transitionDraft(newStatus, reason) {
      try {
        const r = await fetch(
          '/api/v1/cco-comm/drafts/' + encodeURIComponent(state.currentDraftId) + '/transition',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cco-role': role,
              'x-cco-tenant': tenantId,
            },
            body: JSON.stringify({ status: newStatus, reason }),
          }
        );
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'transition failed');
        showToast('✓ Status: ' + newStatus, 'ok');
        close();
        reloadFeed(host, customerId, opts);
      } catch (err) {
        showToast('✗ ' + err.message, 'error');
      }
    }

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    renderPick();
  }

  // ─── Intern notis-modal (mobile bottom-sheet) ───
  function openInternalNoteModal(customerId, opts, host) {
    document.querySelectorAll('.cco-komm-modal-backdrop').forEach((n) => n.remove());
    const backdrop = el('div', {
      class: 'cco-komm-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
    });
    const modal = el('div', { class: 'cco-komm-modal' });
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    modal.appendChild(
      el('div', { class: 'cco-komm-modal-head' }, [
        el('h3', {}, '🗒 Intern notis'),
        el('button', { class: 'cco-komm-modal-close', onclick: close }, '×'),
      ])
    );

    const body = el('div', { class: 'cco-komm-modal-body' });
    body.appendChild(
      el(
        'div',
        { class: 'cco-komm-modal-lead' },
        'Intern notis till personal. Visas inte för patient. Auditloggas.'
      )
    );
    body.appendChild(el('div', { class: 'cco-komm-modal-label' }, 'Text (3–2000 tecken)'));
    const textarea = el('textarea', {
      class: 'cco-komm-modal-input',
      rows: '4',
      placeholder:
        'Ex: Patient nämnde allergi mot lokalbedövning under konsultation. Kolla journal innan PRP.',
    });
    body.appendChild(textarea);
    const errorBox = el('div', { class: 'cco-komm-modal-error', style: 'display: none;' });
    body.appendChild(errorBox);
    modal.appendChild(body);

    const submitBtn = el(
      'button',
      { class: 'cco-komm-modal-submit', type: 'button' },
      'Spara notis'
    );
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

    modal.appendChild(
      el('div', { class: 'cco-komm-modal-foot' }, [
        el('button', { class: 'cco-komm-modal-cancel', type: 'button', onclick: close }, 'Avbryt'),
        submitBtn,
      ])
    );

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
    feedRoot.appendChild(
      el('div', { class: 'cco-komm-feed-head' }, [
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
      ])
    );

    if (!data.events || data.events.length === 0) {
      feedRoot.appendChild(
        el(
          'div',
          { class: 'cco-komm-empty' },
          'Ingen kommunikation registrerad ännu. Skicka formulär eller skapa en intern notis ovan.'
        )
      );
      return;
    }

    const list = el('div', { class: 'cco-komm-list' });
    for (const ev of data.events) {
      const isDraft = ev.kind === 'comm_draft';
      const draftStatus = isDraft ? ev.detail?.status || 'draft' : null;
      const tone =
        ev.status === 'sent'
          ? 'success'
          : ev.status === 'dry_run'
            ? 'warning'
            : draftStatus === 'sent'
              ? 'success'
              : draftStatus === 'failed'
                ? 'danger'
                : draftStatus === 'cancelled'
                  ? 'muted'
                  : draftStatus
                    ? 'warning'
                    : ev.kind === 'event'
                      ? 'info'
                      : 'info';
      list.appendChild(
        el(
          'div',
          {
            class: 'cco-komm-event cco-komm-event--' + tone,
          },
          [
            el('div', { class: 'cco-komm-event-icon' }, ev.icon || '·'),
            el('div', { class: 'cco-komm-event-body' }, [
              el('div', { class: 'cco-komm-event-title' }, [
                ev.title || ev.kind,
                draftStatus
                  ? el(
                      'span',
                      { class: 'cco-komm-status cco-komm-status--' + draftStatus },
                      draftStatus.replace('_', ' ')
                    )
                  : null,
              ]),
              el('div', { class: 'cco-komm-event-meta' }, [
                el('span', { class: 'cco-komm-event-time' }, fmtDate(ev.ts)),
                ev.actor ? el('span', {}, '· av ' + ev.actor) : null,
                ev.detail?.dryRun
                  ? el('span', { class: 'cco-komm-pill cco-komm-pill--warning' }, 'DRY-RUN')
                  : null,
                ev.detail?.recipientMasked
                  ? el('span', {}, '→ ' + ev.detail.recipientMasked)
                  : null,
                isDraft && ev.detail?.channel
                  ? el('span', {}, '· ' + ev.detail.channel.toUpperCase())
                  : null,
                isDraft && ev.detail?.journeyStep
                  ? el('span', {}, '· ' + ev.detail.journeyStep)
                  : null,
              ]),
              ev.kind === 'internal_note' && ev.detail?.body
                ? el('div', { class: 'cco-komm-event-note-body' }, ev.detail.body)
                : null,
            ]),
          ]
        )
      );
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
      if (feedRoot)
        feedRoot.innerHTML =
          '<div class="cco-komm-empty">Kunde inte ladda: ' + err.message + '</div>';
    }
  }

  // ─── Sprint 4: Conversation thread-view (tabs + actions per thread) ───
  const TAB_DEFS = [
    { id: 'all', label: 'Alla' },
    { id: 'unanswered', label: 'Kräver svar' },
    { id: 'incoming', label: 'Inkommande' },
    { id: 'drafts', label: 'Utkast' },
    { id: 'needs_approval', label: 'Väntar' },
    { id: 'sent', label: 'Skickat' },
    { id: 'internal', label: 'Internt' },
  ];

  async function fetchThreads(customerId, opts, filter) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const url =
      '/api/v1/cco-customers/' +
      encodeURIComponent(customerId) +
      '/conversation-threads?filter=' +
      encodeURIComponent(filter || 'all') +
      '&tenantId=' +
      encodeURIComponent(tenantId);
    const r = await fetch(url, { headers: { 'x-cco-role': role, 'x-cco-tenant': tenantId } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function threadAction(customerId, threadId, action, opts, extra) {
    const tenantId = opts?.tenantId || 'hair_tp';
    const role = opts?.role || 'owner';
    const body = Object.assign({ customerId, threadId, action, tenantId }, extra || {});
    const r = await fetch('/api/v1/cco-conversation-threads/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cco-role': role, 'x-cco-tenant': tenantId },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  function fmtThreadTs(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diff = Math.floor((Date.now() - d.getTime()) / 60000);
      if (diff < 60) return diff + 'm';
      if (diff < 1440) return Math.floor(diff / 60) + 'h';
      return Math.floor(diff / 1440) + 'd';
    } catch {
      return '';
    }
  }

  function renderThreadSection(host, customerId, opts) {
    let root = host.querySelector('.cco-komm-threads');
    if (!root) {
      root = el('div', { class: 'cco-komm-threads' });
      host.appendChild(root);
    }
    root.innerHTML = '';

    root.appendChild(
      el('div', { class: 'cco-komm-threads-head' }, [
        el('h4', {}, '💬 Konversationer'),
        el('span', { class: 'cco-komm-threads-meta' }, 'Sprint 4'),
      ])
    );

    const tabsRow = el('div', { class: 'cco-komm-thread-tabs' });
    root.appendChild(tabsRow);

    const listEl = el('div', { class: 'cco-komm-thread-list' }, 'Laddar…');
    root.appendChild(listEl);

    let activeFilter = 'all';
    let lastCounts = {};

    function renderTabs() {
      tabsRow.innerHTML = '';
      for (const tab of TAB_DEFS) {
        const count = lastCounts[tab.id];
        const btn = el(
          'button',
          {
            class: 'cco-komm-thread-tab' + (tab.id === activeFilter ? ' is-active' : ''),
            type: 'button',
            onclick: () => {
              activeFilter = tab.id;
              loadAndRender();
            },
          },
          [
            tab.label,
            count != null
              ? el('span', { class: 'cco-komm-thread-tab-count' }, String(count))
              : null,
          ]
        );
        tabsRow.appendChild(btn);
      }
    }

    function renderList(threads) {
      listEl.innerHTML = '';
      if (!threads || threads.length === 0) {
        listEl.appendChild(
          el('div', { class: 'cco-komm-empty' }, 'Inga konversationer för detta filter.')
        );
        return;
      }
      for (const t of threads) {
        const row = el(
          'div',
          {
            class: 'cco-komm-thread-row cco-komm-thread-row--' + (t.threadStatus || 'unknown'),
          },
          [
            el('div', { class: 'cco-komm-thread-row-head' }, [
              el('span', { class: 'cco-komm-thread-from' }, t.from || ''),
              el('span', { class: 'cco-komm-thread-ts' }, fmtThreadTs(t.ts)),
            ]),
            el('div', { class: 'cco-komm-thread-subject' }, t.subject || ''),
            t.preview ? el('div', { class: 'cco-komm-thread-preview' }, t.preview) : null,
            el('div', { class: 'cco-komm-thread-meta' }, [
              el(
                'span',
                {
                  class: 'cco-komm-thread-status cco-komm-status--' + (t.threadStatus || 'unknown'),
                },
                (t.threadStatus || '').replace('_', ' ')
              ),
              t.channel ? el('span', {}, '· ' + t.channel.toUpperCase()) : null,
              t.journeyStep ? el('span', {}, '· ' + t.journeyStep) : null,
              t.unanswered ? el('span', { class: 'cco-komm-thread-flag' }, '⚠ obesvarad') : null,
              t.handled
                ? el(
                    'span',
                    { class: 'cco-komm-thread-flag cco-komm-thread-flag--ok' },
                    '✓ hanterad'
                  )
                : null,
              t.snoozedUntil ? el('span', { class: 'cco-komm-thread-flag' }, '⏰ snoozed') : null,
            ]),
            el('div', { class: 'cco-komm-thread-actions' }, [
              !t.handled
                ? el(
                    'button',
                    {
                      class: 'cco-komm-thread-btn',
                      onclick: async () => {
                        const r = await threadAction(customerId, t.threadId, 'mark_handled', opts);
                        if (r.ok) {
                          showToast('✓ Markerad hanterad', 'ok');
                          loadAndRender();
                        } else showToast('✗ ' + (r.error || 'fel'), 'error');
                      },
                    },
                    '✓ Hanterad'
                  )
                : el(
                    'button',
                    {
                      class: 'cco-komm-thread-btn',
                      onclick: async () => {
                        const r = await threadAction(
                          customerId,
                          t.threadId,
                          'unmark_handled',
                          opts
                        );
                        if (r.ok) {
                          showToast('↻ Återöppnad', 'ok');
                          loadAndRender();
                        }
                      },
                    },
                    '↻ Återöppna'
                  ),
              !t.snoozedUntil
                ? el(
                    'button',
                    {
                      class: 'cco-komm-thread-btn',
                      onclick: async () => {
                        const r = await threadAction(customerId, t.threadId, 'snooze', opts, {
                          snoozeUntilIso: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
                        });
                        if (r.ok) {
                          showToast('⏰ Snoozad 24h', 'ok');
                          loadAndRender();
                        }
                      },
                    },
                    '⏰ Snooza'
                  )
                : el(
                    'button',
                    {
                      class: 'cco-komm-thread-btn',
                      onclick: async () => {
                        const r = await threadAction(customerId, t.threadId, 'unsnooze', opts);
                        if (r.ok) {
                          showToast('↻ Avsnoozad', 'ok');
                          loadAndRender();
                        }
                      },
                    },
                    '↻ Avsnooza'
                  ),
              t.requiresApproval
                ? el(
                    'button',
                    {
                      class: 'cco-komm-thread-btn cco-komm-thread-btn--primary',
                      onclick: () => openSvarstudio(customerId, opts, host),
                    },
                    '✏ Öppna i Svarstudio'
                  )
                : null,
              el(
                'button',
                {
                  class: 'cco-komm-thread-btn',
                  onclick: () => openInternalNoteModal(customerId, opts, host),
                },
                '🗒 Notis'
              ),
            ]),
          ]
        );
        listEl.appendChild(row);
      }
    }

    async function loadAndRender() {
      listEl.textContent = 'Laddar…';
      try {
        const data = await fetchThreads(customerId, opts, activeFilter);
        lastCounts = data.counts || {};
        renderTabs();
        renderList(data.threads || []);
      } catch (err) {
        listEl.innerHTML = '';
        listEl.appendChild(
          el('div', { class: 'cco-komm-empty' }, 'Kunde inte ladda trådar: ' + err.message)
        );
      }
    }

    renderTabs();
    loadAndRender();
  }

  // ─── Public mount ───
  async function mount(hostSelectorOrEl, opts) {
    const host =
      typeof hostSelectorOrEl === 'string'
        ? document.querySelector(hostSelectorOrEl)
        : hostSelectorOrEl;
    if (!host) return;
    const customerId = opts.customerId;
    if (!customerId) return;

    host.innerHTML = '';
    host.classList.add('cco-komm-host');

    // Snabbactions
    renderActions(host, customerId, opts);

    // Feed (Sprint 1)
    await reloadFeed(host, customerId, opts);

    // Thread-view (Sprint 4) — tabs + thread-list + actions
    renderThreadSection(host, customerId, opts);
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
  } catch (_e) {
    /* ignore observer-bind fel */
  }

  global.CcoKommPanel = { mount, reload: reloadFeed, autoMount };
})(window);
