'use strict';

const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const DEFAULT_COOLING_OFF_DAYS = 14;

function addDaysIso(isoString, days) {
  const baseMs = Date.parse(normalizeText(isoString) || new Date().toISOString());
  const safeDays = Number.isFinite(Number(days)) ? Number(days) : DEFAULT_COOLING_OFF_DAYS;
  return new Date(baseMs + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function buildEsignToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getCoolingOffMeta(commercialCase = {}, nowMs = Date.now()) {
  const endsAt = normalizeText(commercialCase.coolingOffEndsAt);
  if (!endsAt) {
    return {
      active: false,
      endsAt: '',
      remainingMs: 0,
      remainingDays: 0,
    };
  }
  const endsMs = Date.parse(endsAt);
  if (!Number.isFinite(endsMs)) {
    return {
      active: false,
      endsAt: '',
      remainingMs: 0,
      remainingDays: 0,
    };
  }
  const remainingMs = Math.max(0, endsMs - nowMs);
  return {
    active: remainingMs > 0,
    endsAt,
    remainingMs,
    remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
  };
}

function canAcceptOffer(commercialCase = {}, options = {}) {
  const quoteStatus = normalizeText(commercialCase.quoteStatus);
  if (quoteStatus === 'accepted') {
    return { allowed: false, reason: 'Offerten är redan accepterad.' };
  }
  if (quoteStatus !== 'sent') {
    return { allowed: false, reason: 'Offerten måste skickas för signering innan accept.' };
  }
  const cooling = getCoolingOffMeta(commercialCase, options.nowMs);
  if (cooling.active && options.forceAccept !== true) {
    return {
      allowed: false,
      reason: `Betänketid gäller till ${cooling.endsAt.slice(0, 10)} (${cooling.remainingDays} dagar kvar).`,
      coolingOff: cooling,
    };
  }
  return { allowed: true, reason: '', coolingOff: cooling };
}

function buildOfferSignPageHtml({
  commercialCase = {},
  planSnapshot = {},
  token = '',
  origin = '',
  coolingOff = null,
} = {}) {
  const patientName =
    normalizeText(planSnapshot.displayName) || normalizeText(commercialCase.customerName) || 'Kund';
  const cooling = coolingOff || getCoolingOffMeta(commercialCase);
  const acceptDisabled = cooling.active;
  const acceptUrl = `${origin}/api/v1/cco-commercial/offer-accept-public?token=${encodeURIComponent(token)}`;

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Acceptera offert — ${patientName}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 32px; background: #faf7f4; color: #1f2937; }
    .shell { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #eadfd4; border-radius: 16px; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .muted { color: #6b7280; }
    .notice { margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; }
    .notice.is-blocked { background: #fef2f2; border-color: #fecaca; }
    button { margin-top: 16px; padding: 12px 18px; border-radius: 999px; border: 0; background: #8b5e3c; color: #fff; font: inherit; cursor: pointer; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="shell">
    <h1>Offert från Hair TP Clinic</h1>
    <p class="muted">Kund: ${patientName}</p>
    <p><strong>Behandling:</strong> ${normalizeText(commercialCase.offerType) || '—'}</p>
    <p><strong>Pris:</strong> ${normalizeText(commercialCase.quotedAmount) || 'Enligt offert'}</p>
    ${
      cooling.active
        ? `<div class="notice is-blocked"><strong>Betänketid</strong><br/>Du kan acceptera offerten tidigast ${cooling.endsAt.slice(0, 10)} (${cooling.remainingDays} dagar kvar).</div>`
        : `<div class="notice"><strong>Redo att acceptera</strong><br/>Genom att acceptera bekräftar du behandlingsplanen och avtalad omfattning.</div>`
    }
    <form method="post" action="${acceptUrl}">
      <label>
        <span class="muted">Ditt namn</span><br/>
        <input name="customerSignedName" required style="width:100%;margin-top:6px;padding:10px;border:1px solid #eadfd4;border-radius:10px;" />
      </label>
      <button type="submit"${acceptDisabled ? ' disabled' : ''}>Jag accepterar offerten</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = {
  DEFAULT_COOLING_OFF_DAYS,
  addDaysIso,
  buildEsignToken,
  getCoolingOffMeta,
  canAcceptOffer,
  buildOfferSignPageHtml,
};
