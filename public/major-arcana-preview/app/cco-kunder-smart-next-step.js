/**
 * ORD-3 B-sprint — Smart nästa steg (dry-run UI, read-only).
 * Data: customers-shell?includeAutomation=1 → automationSignals[]
 */
(function (global) {
  'use strict';

  const doc = global.document;

  const RISK_ORDER = {
    legal_blocker: 0,
    legal: 1,
    blocker: 2,
    needs_review: 3,
    ready: 4,
    info: 5,
  };

  const RISK_CLASS = {
    legal_blocker: 'dossier-signal--legal',
    legal: 'dossier-signal--legal',
    blocker: 'dossier-signal--blocker',
    needs_review: 'dossier-signal--review',
    ready: 'dossier-signal--ready',
    info: 'dossier-signal--info',
  };

  /** UX-spec v2 Bilaga A — knapp + disabled reason (B-sprint: alla disabled). */
  const SIGNAL_ACTIONS = Object.freeze({
    'customer.missing_health_declaration': {
      buttonLabel: 'Formulär',
      disabledReason: 'Kräver formulärmotor',
    },
    'customer.missing_journal': {
      buttonLabel: 'Journal',
      disabledReason: 'Dry-run — öppna journal via åtgärdsraden',
    },
    'customer.missing_treatment_plan': {
      buttonLabel: 'Offert',
      disabledReason: 'Kräver offertmotor',
    },
    'customer.cooling_off_active': { buttonLabel: null, disabledReason: null },
    'customer.cooling_off_passed': {
      buttonLabel: 'Avtal',
      disabledReason: 'Saknar legal_review/sign',
    },
    'customer.missing_agreement_consent_bundle': {
      buttonLabel: 'Avtal',
      disabledReason: 'Signering ej GO',
    },
    'customer.missing_operation_day_insurance': {
      buttonLabel: 'Portal-länk',
      disabledReason: 'Friskförsäkran krävs på operationsdagen',
    },
    'customer.missing_photo_consent': {
      buttonLabel: 'Samtycke',
      disabledReason: 'Ej publiceringsmall — hårlinje/krona vid foto',
    },
    'customer.has_photo_review': {
      buttonLabel: 'Photo Review',
      disabledReason: 'Ingen autoapprove',
    },
    'customer.ready_for_treatment': {
      buttonLabel: 'Kalender',
      disabledReason: 'Saknar gate ovan',
    },
  });

  const FORBIDDEN_COPY = [
    /T-48/i,
    /14 dagar/i,
    /Auto-skicka/i,
    /Automatiskt skickat/i,
    /AI föreslår/i,
    /missing_form/i,
    /Saknar formulär(?!status)/i,
    /Pre-info separat/i,
  ];

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function riskClass(risk) {
    return RISK_CLASS[risk] || 'dossier-signal--info';
  }

  function sortSignals(signals) {
    return [...(signals || [])].sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'active') return -1;
        if (b.status === 'active') return 1;
      }
      const pa = RISK_ORDER[a.risk] ?? 50;
      const pb = RISK_ORDER[b.risk] ?? 50;
      if (pa !== pb) return pa - pb;
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  function assertCopySafe(text) {
    const s = String(text || '');
    for (const re of FORBIDDEN_COPY) {
      if (re.test(s)) return false;
    }
    return true;
  }

  function injectStyles() {
    if (!doc) return;
    if (doc.getElementById('cco-smart-next-step-styles')) return;
    const el = doc.createElement('style');
    el.id = 'cco-smart-next-step-styles';
    el.textContent = `
      .dossier-smart-next { padding: 10px 14px 12px; border-bottom: 1px solid rgba(132,117,107,0.18); background: linear-gradient(180deg, rgba(255,252,248,0.95), rgba(250,246,242,0.6)); }
      .dossier-smart-next__head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
      .dossier-smart-next__title { font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--cco-text-secondary,#6b5f57); }
      .dossier-smart-next__badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid rgba(132,117,107,0.25); color:var(--cco-text-secondary,#6b5f57); background:#fff; }
      .dossier-smart-next__empty { font-size:12px; color:var(--cco-text-secondary,#6b5f57); padding:6px 0; }
      .dossier-signal-list { display:flex; flex-direction:column; gap:8px; }
      .dossier-signal { border:1px solid rgba(132,117,107,0.2); border-radius:10px; padding:8px 10px; background:#fff; }
      .dossier-signal__pill-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:6px; }
      .dossier-signal__pill { font-size:10px; font-weight:700; padding:3px 8px; border-radius:999px; border:1px solid transparent; }
      .dossier-signal--blocker .dossier-signal__pill { background:#fde8e8; border-color:#e8a8a8; color:#8b2e2e; }
      .dossier-signal--legal .dossier-signal__pill { background:#f3e8fd; border-color:#c9a8e8; color:#5c2d7a; }
      .dossier-signal--review .dossier-signal__pill { background:#fff4e0; border-color:#e8c88a; color:#7a4f12; }
      .dossier-signal--ready .dossier-signal__pill { background:#e8f5ec; border-color:#9fd4ad; color:#1f5c33; }
      .dossier-signal--info .dossier-signal__pill { background:#e8f0fa; border-color:#a8c4e8; color:#2d4a7a; }
      .dossier-signal__what { font-size:13px; font-weight:700; color:var(--cco-text-primary,#2a2420); }
      .dossier-signal__why, .dossier-signal__next { font-size:11px; line-height:1.45; color:var(--cco-text-secondary,#6b5f57); margin-top:4px; }
      .dossier-signal__next strong { color:var(--cco-text-primary,#2a2420); font-weight:600; }
      .dossier-signal__meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; align-items:center; }
      .dossier-signal__approval { font-size:10px; padding:2px 6px; border-radius:6px; background:rgba(132,117,107,0.12); color:#5c534c; }
      .dossier-signal__confidence { font-size:10px; color:#8a7f76; }
      .dossier-signal__btn { font-size:11px; padding:5px 10px; border-radius:8px; border:1px solid rgba(132,117,107,0.28); background:#f7f4f1; color:#6b5f57; cursor:not-allowed; opacity:0.85; }
      .dossier-signal--inactive { opacity:0.55; }
      .dossier-smart-next details { margin-top:8px; font-size:11px; color:var(--cco-text-secondary,#6b5f57); }
      .dossier-smart-next summary { cursor:pointer; font-weight:600; }
      .mk-smart-next { margin-bottom:10px; }
      .mk-smart-next .dossier-smart-next { padding:0; border:0; background:transparent; }
      .mk-smart-next .dossier-signal { border-color:rgba(132,117,107,0.22); }
    `;
    doc.head.appendChild(el);
  }

  function renderSignal(signal) {
    const action = SIGNAL_ACTIONS[signal.ruleId] || {};
    const cls = riskClass(signal.risk);
    const inactive = signal.status !== 'active';
    const what = assertCopySafe(signal.what) ? signal.what : '—';
    const why = assertCopySafe(signal.why) ? signal.why : '—';
    const next = assertCopySafe(signal.next) ? signal.next : '—';
    const btn =
      action.buttonLabel && action.disabledReason
        ? `<button type="button" class="dossier-signal__btn" disabled title="${escapeHtml(action.disabledReason)}">${escapeHtml(action.buttonLabel)}</button>`
        : '';

    return `
      <article class="dossier-signal ${cls}${inactive ? ' dossier-signal--inactive' : ''}" data-rule-id="${escapeHtml(signal.ruleId)}">
        <div class="dossier-signal__pill-row">
          <span class="dossier-signal__pill">${escapeHtml(what)}</span>
          ${inactive ? '<span class="dossier-signal__confidence">inaktiv v1</span>' : ''}
        </div>
        <div class="dossier-signal__why"><strong>Varför:</strong> ${escapeHtml(why)}</div>
        <div class="dossier-signal__next"><strong>Nästa:</strong> ${escapeHtml(next)}</div>
        <div class="dossier-signal__meta">
          ${signal.humanApprovalRequired ? '<span class="dossier-signal__approval">Kräver godkännande</span>' : ''}
          <span class="dossier-signal__confidence">tillförlitlighet: ${escapeHtml(signal.confidence || '—')}</span>
          ${btn}
        </div>
      </article>`;
  }

  /**
   * @param {object} card — kund-readout med automationSignals
   * @param {{ automation?: object }} shellMeta
   */
  function renderPanel(card, shellMeta = {}) {
    injectStyles();
    const automation = shellMeta.automation || null;
    const signals = sortSignals(card?.automationSignals || []);
    const active = signals.filter((s) => s.status === 'active');
    const inactive = signals.filter((s) => s.status !== 'active');

    let body = '';
    if (automation && automation.enabled === false) {
      body = `<p class="dossier-smart-next__empty">${escapeHtml(automation.reason || 'Automation dry-run är avstängd på servern.')}</p>`;
    } else if (!signals.length) {
      body = `<p class="dossier-smart-next__empty">Signaler saknas — kontrollera <code>includeAutomation=1</code> och <code>ENABLE_AUTOMATION_RUNNER</code>.</p>`;
    } else if (!active.length) {
      body = `<p class="dossier-smart-next__empty">Inga öppna signaler — kund är synkad</p>`;
    } else {
      body = `<div class="dossier-signal-list">${active.map(renderSignal).join('')}</div>`;
    }

    const inactiveBlock =
      inactive.length > 0
        ? `<details><summary>Övriga signaler (${inactive.length})</summary><div class="dossier-signal-list" style="margin-top:8px">${inactive.map(renderSignal).join('')}</div></details>`
        : '';

    return `
      <section class="dossier-smart-next" data-smart-next-step="1" aria-label="Smart nästa steg">
        <div class="dossier-smart-next__head">
          <span class="dossier-smart-next__title">Smart nästa steg</span>
          <span class="dossier-smart-next__badge" title="Ingen write, ingen auto-send">Dry-run</span>
        </div>
        ${body}
        ${inactiveBlock}
      </section>`;
  }

  /** Rad i listan: föredra automationTop.what framför legacy nextStep. */
  function listStepLabel(card) {
    const top = card?.automationTop;
    if (top?.status === 'active' && top.what) return top.what;
    return card?.nextStep || card?.nextRequirement || '—';
  }

  function mountMobileWrap(html) {
    return `<div class="mk-smart-next">${html}</div>`;
  }

  global.CcoKunderSmartNextStep = {
    renderPanel,
    mountMobileWrap,
    listStepLabel,
    sortSignals,
    SIGNAL_ACTIONS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : {});
