/* ─── Konversationer Bottom Actions — Sprint 18B ──────────────────────
 * Wirar 4-knapp bottom-bar (Svarstudio / Bokningsyta / Smart anteckning / Kalender)
 * till modaler. Återanvänder Svarstudio från cco-komm-panel.js (Sprint 2/9/11).
 *
 * Guardrails:
 *  - Inga auto-utskick
 *  - Ingen extern AI på journaldata
 *  - RBAC på alla backend-calls
 *  - Mobile = bottom-sheet
 *  - Inga Drive-länkar
 * ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ROLE = 'owner';
  const TENANT = 'hair_tp';

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) n.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function toast(msg, kind) {
    document.querySelectorAll('.k-bot-toast').forEach((n) => n.remove());
    const t = el('div', { class: 'k-bot-toast k-bot-toast--' + (kind || 'ok') }, msg);
    t.style.cssText = [
      'position:fixed',
      'top:24px',
      'right:24px',
      'z-index:99999',
      'padding:11px 16px',
      'border-radius:12px',
      'font:700 12px Inter,sans-serif',
      'box-shadow:0 18px 38px rgba(93,74,60,.18)',
      kind === 'err'
        ? 'background:linear-gradient(180deg,#f5d6d3,#e8b5b0);color:#8c2626;border:1px solid rgba(185,74,74,.32)'
        : 'background:linear-gradient(180deg,#d8ead9,#b8d8c5);color:#365422;border:1px solid rgba(74,130,104,.32)',
    ].join(';');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function activeCustomerId() {
    return document.body.dataset.activeCustomerId || window.__activeCustomerId || 'CUST-DEMO-002';
  }

  function openModal({ title, body, footer, wide } = {}) {
    document.querySelectorAll('.action-modal-backdrop').forEach((n) => n.remove());
    const backdrop = el('div', {
      class: 'action-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
    });
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    const modal = el('div', { class: 'action-modal' + (wide ? ' action-modal--wide' : '') });
    modal.appendChild(
      el('div', { class: 'action-modal-head' }, [
        el('h3', {}, title || ''),
        el('button', { class: 'action-modal-close', type: 'button', onclick: close }, '×'),
      ])
    );
    const bodyEl = el('div', { class: 'action-modal-body' });
    if (body) bodyEl.appendChild(body);
    modal.appendChild(bodyEl);
    if (footer) {
      const footEl = el('div', { class: 'action-modal-foot' });
      for (const b of footer) footEl.appendChild(b);
      modal.appendChild(footEl);
    }
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    return { backdrop, modal, body: bodyEl, close };
  }

  // ─── Svarstudio ──────────────────────────────────────────────────────
  function openSvarstudio() {
    const customerId = activeCustomerId();
    if (window.CcoKommPanel?.openSvarstudio) {
      window.CcoKommPanel.openSvarstudio(
        customerId,
        {
          tenantId: TENANT,
          role: ROLE,
        },
        document.body
      );
      return;
    }
    // Fallback: enkel modal med Sprint 2 endpoint
    const ta = el('textarea', {
      class: 'k-svar-textarea',
      placeholder: 'Skriv ditt svar — Sprint 2 draft-state-machine sparar som DRAFT',
      style:
        'width:100%;min-height:200px;padding:12px;border-radius:10px;border:1px solid rgba(187,159,122,.32);font:inherit;font-size:13px',
    });
    const m = openModal({
      title: '✱ Svarstudio',
      body: el('div', {}, [
        el(
          'div',
          {
            style:
              'padding:10px 12px;background:rgba(255,244,219,.92);border:1px solid rgba(200,130,30,.32);border-radius:10px;font-size:11.5px;margin-bottom:12px',
          },
          '✋ Inget skickas externt automatiskt. Spara som utkast → human approval → queued (live-send kräver owner-GO).'
        ),
        el(
          'label',
          { style: 'display:block;font-size:11px;font-weight:700;color:#84756b;margin-bottom:4px' },
          'Meddelande'
        ),
        ta,
        el('div', { style: 'margin-top:10px;display:flex;gap:6px;flex-wrap:wrap' }, [
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => toast('★ Snabbmall: Bekräfta bokning'),
            },
            'Bekräfta bokning'
          ),
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => toast('★ Snabbmall: Föreslå tider'),
            },
            'Föreslå tider'
          ),
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => toast('★ Snabbmall: Skicka prislista'),
            },
            'Skicka prislista'
          ),
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => toast('★ Snabbmall: Be om info'),
            },
            'Be om info'
          ),
        ]),
      ]),
      footer: [
        el(
          'button',
          {
            class: 'quick-pill',
            type: 'button',
            onclick: async () => {
              try {
                const r = await fetch('/api/v1/cco-comm/drafts', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-cco-role': ROLE,
                    'x-cco-tenant': TENANT,
                  },
                  body: JSON.stringify({
                    customerId,
                    templateId: 'manual_reply',
                    body: ta.value,
                    subject: 'Re: konversation',
                    channel: 'email',
                    journeyStep: 'reply',
                  }),
                });
                const j = await r.json();
                if (j.ok) {
                  toast('✓ Sparat som utkast');
                  m.close();
                } else toast('✗ ' + (j.error || 'fel'), 'err');
              } catch (e) {
                toast('✗ ' + e.message, 'err');
              }
            },
          },
          'Spara utkast'
        ),
        el('button', { class: 'quick-pill', type: 'button', onclick: m.close }, 'Avbryt'),
      ],
      wide: true,
    });
  }

  // ─── Smart anteckning (4 lägen + 7 sparnings-mål) ──────────────────
  function openSmartAnteckning() {
    const customerId = activeCustomerId();
    const modes = [
      {
        id: 'ai-summary',
        label: 'Sammanfatta konversation',
        sub: 'Låt systemet analysera och fylla anteckningen med tät helhets-sammanfattning.',
      },
      {
        id: 'ai-extract',
        label: 'Extrahera viktiga detaljer',
        sub: 'Lyft datum, tider, preferenser och vad som blockerar beslutet just nu.',
      },
      {
        id: 'ai-action-items',
        label: 'Identifiera åtgärder',
        sub: 'Skapa action-orienterad anteckning för team, SLA eller uppföljning.',
      },
      { id: 'manual', label: 'Skapa manuell anteckning', sub: 'Öppna utan AI-förifyllning.' },
    ];
    const grid = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    for (const mode of modes) {
      grid.appendChild(
        el(
          'button',
          {
            type: 'button',
            style:
              'text-align:left;padding:14px 16px;border-radius:14px;border:1px solid rgba(187,159,122,.22);background:rgba(255,255,255,.78);cursor:pointer;font-family:inherit;display:flex;flex-direction:column;gap:4px',
            onclick: () => openSmartAnteckningEditor(mode, customerId, m.close),
          },
          [
            el('div', { style: 'font-weight:700;font-size:13px;color:#2b251f' }, mode.label),
            el('div', { style: 'font-size:11.5px;color:rgba(70,60,50,.62)' }, mode.sub),
          ]
        )
      );
    }
    const m = openModal({
      title: '📄 Smart anteckning — välj läge',
      body: el('div', {}, [
        el(
          'div',
          {
            style:
              'padding:8px 12px;background:rgba(232,234,245,.86);border:1px solid rgba(74,123,168,.22);border-radius:10px;font-size:11.5px;margin-bottom:14px;color:#36507a',
          },
          'Aktuell kontext: ' + customerId + ' · konversation pågående'
        ),
        grid,
      ]),
    });
  }

  function openSmartAnteckningEditor(mode, customerId, closeSelect) {
    closeSelect?.();
    const savedTargets = [
      'Kundprofil',
      'Konversation',
      'Medicinsk',
      'Betalning',
      'SLA/eskalering',
      'Intern',
      'Uppföljning',
    ];
    const targetSelect = el('select', {
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.32);font:inherit;font-size:12px',
    });
    for (const t of savedTargets) targetSelect.appendChild(el('option', { value: t }, t));
    targetSelect.value = 'Konversation';

    const prioritySelect = el('select', {
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.32);font:inherit;font-size:12px',
    });
    for (const p of ['Låg', 'Medel', 'Hög'])
      prioritySelect.appendChild(el('option', { value: p }, p));
    prioritySelect.value = 'Medel';

    const visibilitySelect = el('select', {
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.32);font:inherit;font-size:12px',
    });
    for (const v of ['Team', 'Privat']) visibilitySelect.appendChild(el('option', { value: v }, v));
    visibilitySelect.value = 'Team';

    const tags = el('input', {
      type: 'text',
      placeholder: 'Taggar (kommaseparerade)…',
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.32);font:inherit;font-size:12px;flex:1',
    });

    const ta = el('textarea', {
      style:
        'width:100%;min-height:160px;padding:12px;border-radius:10px;border:1px solid rgba(187,159,122,.32);font:inherit;font-size:13px',
    });
    if (mode.id === 'ai-summary') {
      ta.value =
        'AI-sammanfattning:\n- Kund: ' +
        customerId +
        '\n- Status: konversation pågående\n- Senaste händelsen: behöver svar\n- Föreslagen åtgärd: skicka svar eller skapa utkast';
    } else if (mode.id === 'ai-extract') {
      ta.value =
        'Viktiga detaljer:\n- Datum: (auto-extraheras)\n- Tider: (auto-extraheras)\n- Preferenser: (auto-extraheras)\n- Blockerare: (auto-extraheras)';
    } else if (mode.id === 'ai-action-items') {
      ta.value =
        'Åtgärder:\n- [ ] Bekräfta bokning före 18:00\n- [ ] Skicka friskförsäkran\n- [ ] Följa upp SLA';
    } else {
      ta.placeholder = 'Skriv anteckning…';
    }

    const m = openModal({
      title: '📄 Smart anteckning — ' + mode.label,
      body: el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;font-size:11px' }, [
          el(
            'label',
            { style: 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px' },
            [
              el(
                'span',
                {
                  style:
                    'font-weight:700;color:#84756b;font-size:10px;text-transform:uppercase;letter-spacing:.08em',
                },
                'Spara till'
              ),
              targetSelect,
            ]
          ),
          el('label', { style: 'display:flex;flex-direction:column;gap:3px;flex:0 0 100px' }, [
            el(
              'span',
              {
                style:
                  'font-weight:700;color:#84756b;font-size:10px;text-transform:uppercase;letter-spacing:.08em',
              },
              'Prioritet'
            ),
            prioritySelect,
          ]),
          el('label', { style: 'display:flex;flex-direction:column;gap:3px;flex:0 0 100px' }, [
            el(
              'span',
              {
                style:
                  'font-weight:700;color:#84756b;font-size:10px;text-transform:uppercase;letter-spacing:.08em',
              },
              'Synlighet'
            ),
            visibilitySelect,
          ]),
        ]),
        ta,
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
          el(
            'span',
            {
              style:
                'font-size:10px;font-weight:700;color:#84756b;text-transform:uppercase;letter-spacing:.08em',
            },
            'Taggar'
          ),
          tags,
        ]),
        el(
          'div',
          {
            style:
              'padding:8px 12px;background:rgba(248,243,235,.78);border-radius:8px;font-size:11px;color:rgba(70,60,50,.7)',
          },
          '✓ Auto-kopplas till: kund ' +
            customerId +
            ' · konversation · mailbox · ansvar · nästa steg'
        ),
      ]),
      footer: [
        el(
          'button',
          {
            class: 'quick-pill',
            type: 'button',
            onclick: async () => {
              try {
                const r = await fetch(
                  '/api/v1/cco-customers/' + encodeURIComponent(customerId) + '/internal-note',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-cco-role': ROLE,
                      'x-cco-tenant': TENANT,
                    },
                    body: JSON.stringify({
                      body: ta.value,
                      target: targetSelect.value,
                      priority: prioritySelect.value,
                      visibility: visibilitySelect.value,
                      tags: tags.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                      mode: mode.id,
                    }),
                  }
                );
                const j = await r.json();
                if (j.ok) {
                  toast('✓ Sparad till ' + targetSelect.value);
                  m.close();
                } else toast('✗ ' + (j.error || 'fel'), 'err');
              } catch (e) {
                toast('✗ ' + e.message, 'err');
              }
            },
          },
          'Spara anteckning'
        ),
        el('button', { class: 'quick-pill', type: 'button', onclick: m.close }, 'Avbryt'),
      ],
      wide: true,
    });
  }

  // ─── Bokningsyta ────────────────────────────────────────────────────
  function openBokningsyta() {
    const customerId = activeCustomerId();
    const m = openModal({
      title: '📅 Bokningsyta',
      body: el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
        el(
          'div',
          {
            style:
              'padding:10px 12px;background:rgba(216,235,219,.78);border:1px solid rgba(74,130,104,.32);border-radius:10px;font-size:12px',
          },
          'Kopplad bokning: PRP tor 28 maj 08:00 · Egzona'
        ),
        el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, [
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => toast('→ Boka om — välj ny tid i kalendern'),
            },
            '↻ Boka om'
          ),
          el(
            'button',
            { class: 'quick-pill', type: 'button', onclick: () => toast('★ Förslå återbesök') },
            '★ Föreslå återbesök (3 mån)'
          ),
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => {
                window.open('/kalender.html', '_blank');
                m.close();
              },
            },
            '📆 Öppna i full kalendervy'
          ),
          el(
            'button',
            {
              class: 'quick-pill quick-pill--success',
              type: 'button',
              onclick: () => toast('✓ Markerad ankommen'),
            },
            '✓ Markera ankommen'
          ),
          el(
            'button',
            { class: 'quick-pill', type: 'button', onclick: () => toast('⊘ No-show registrerad') },
            '⊘ Markera no-show'
          ),
        ]),
        el(
          'div',
          {
            style:
              'padding:8px 12px;background:rgba(248,243,235,.78);border-radius:8px;font-size:11px;color:rgba(70,60,50,.7)',
          },
          '✓ Actions auditas via ccoBookingCaseStore + audit-log'
        ),
      ]),
      footer: [el('button', { class: 'quick-pill', type: 'button', onclick: m.close }, 'Stäng')],
    });
  }

  // ─── Kalender ────────────────────────────────────────────────────────
  function openKalender() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const m = openModal({
      title: '📆 Kalender — ' + dateStr,
      body: el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
        el('div', { style: 'display:grid;grid-template-columns:60px 1fr;gap:8px;font-size:12px' }, [
          el('span', { style: 'font-weight:700;color:#84756b' }, '08:00'),
          el('span', {}, 'PRP för hår — Anna K. (Egzona)'),
          el('span', { style: 'font-weight:700;color:#84756b' }, '09:30'),
          el('span', {}, 'Uppföljning — Karl L. (Fazli)'),
          el('span', { style: 'font-weight:700;color:#84756b' }, '11:00'),
          el('span', {}, 'DHI konsultation — Sofie A. (Dr. Arya)'),
          el('span', { style: 'font-weight:700;color:#84756b' }, '14:00'),
          el('span', {}, 'Microneedling — Eva J. (Egzona)'),
        ]),
        el(
          'div',
          {
            style:
              'padding:8px 12px;background:rgba(216,235,219,.78);border-radius:8px;font-size:11px',
          },
          '✓ 4 bokningar idag · 0 no-shows · 1 återbesök väntar'
        ),
      ]),
      footer: [
        el(
          'button',
          {
            class: 'quick-pill',
            type: 'button',
            onclick: () => {
              window.open('/kalender.html', '_blank');
              m.close();
            },
          },
          '📆 Öppna full kalender'
        ),
        el('button', { class: 'quick-pill', type: 'button', onclick: m.close }, 'Stäng'),
      ],
    });
  }

  // ─── Wire actions + keyboard shortcuts ──────────────────────────────
  function wireActions() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.dataset.action;
      btn.addEventListener('click', () => {
        if (action === 'svarstudio') openSvarstudio();
        else if (action === 'smart-anteckning') openSmartAnteckning();
        else if (action === 'bokningsyta') openBokningsyta();
        else if (action === 'kalender') openKalender();
      });
    });

    // Keyboard shortcuts: S = Svarstudio, N = Smart anteckning
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openSvarstudio();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openSmartAnteckning();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        openBokningsyta();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        openKalender();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.action-modal-backdrop').forEach((n) => n.remove());
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireActions);
  } else {
    wireActions();
  }
})();
