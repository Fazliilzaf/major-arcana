'use strict';

const ANGER_BLANKET_URL =
  'https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTreatmentAgreementHtml({
  agreement = {},
  commercialCase = {},
  patientName = '',
  origin = '',
} = {}) {
  const name =
    normalizeText(patientName) ||
    normalizeText(agreement.patientName) ||
    normalizeText(commercialCase.customerName) ||
    'Kund';
  const deliveryMode = normalizeText(agreement.deliveryMode) || 'plats';
  const isDistans = deliveryMode === 'distans';
  const offerType =
    normalizeText(agreement.offerType || commercialCase.offerType) || 'Hårtransplantation DHI';
  const quotedAmount =
    normalizeText(agreement.quotedAmount || commercialCase.quotedAmount) || 'Enligt offert';
  const patientInfoUrl = `${origin}/patientinformation/hartransplantation-dhi-prp-minimal.pdf`;

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Behandlingsavtal — ${escapeHtml(name)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; margin: 0; padding: 40px; color: #1f2937; line-height: 1.55; }
    .page { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 28px 0 8px; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    p { margin: 0 0 12px; }
    ul { margin: 0 0 12px; padding-left: 20px; }
    .box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; margin: 16px 0; background: #fafafa; }
    a { color: #8b5e3c; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Behandlingsavtal</h1>
    <p class="meta">Hair TP Clinic · Version ${escapeHtml(agreement.agreementVersion || '251203')} · ${isDistans ? 'Distansavtal' : 'Avtal på plats'}</p>

    <h2>1. Parter</h2>
    <p><strong>Klinik:</strong> Hair TP Clinic AB<br/>
    <strong>Patient:</strong> ${escapeHtml(name)}</p>

    <h2>2. Behandling</h2>
    <p>Behandlingen avser: <strong>${escapeHtml(offerType)}</strong>.</p>
    <p>Pris enligt offert: <strong>${escapeHtml(quotedAmount)}</strong> (moms enligt offert).</p>

    <h2>3. Bilagor</h2>
    <ul>
      <li><strong>Bilaga 1</strong> — Patientinformation &amp; tjänstespecifikation (<a href="${escapeHtml(patientInfoUrl)}">PDF</a>)</li>
      <li>Behandlingsplan från konsultation (om bifogad)</li>
      ${
        isDistans
          ? `<li><strong>Bilaga 3</strong> — <a href="${ANGER_BLANKET_URL}">Konsumentverkets ångerblankett</a></li>`
          : ''
      }
    </ul>

    <h2>4. Av- och ombokning</h2>
    <p>Av- och ombokningsregler enligt klinikens villkor i patientinformation och offert.</p>

    ${
      isDistans
        ? `<div class="box">
      <h2 style="margin-top:0">5. Distansavtal och ångerrätt</h2>
      <p>Detta avtal ingås på distans. Du har 14 dagars ångerrätt från avtalets ingående enligt Distansavtalslagen.</p>
      <p>Ångerblankett: <a href="${ANGER_BLANKET_URL}">${ANGER_BLANKET_URL}</a></p>
      <p>Särskilt samtycke krävs om behandling eller bokning ska påbörjas innan ångerfristen löpt ut.</p>
    </div>`
        : `<div class="box">
      <h2 style="margin-top:0">5. Avtal på plats</h2>
      <p>Avtalet ingås på kliniken. Distansavtalslagen och 14 dagars ångerrätt gäller inte.</p>
    </div>`
    }

    <h2>6. Signering</h2>
    <p>Genom signering bekräftar patienten att bilaga 1 mottagits och att villkoren accepteras.</p>
  </div>
</body>
</html>`;
}

function buildTreatmentAgreementSignPageHtml({
  agreement = {},
  token = '',
  origin = '',
  coolingOff = null,
  consentBundle = null,
} = {}) {
  const patientName = normalizeText(agreement.patientName) || 'Kund';
  const cooling = coolingOff || { active: false, endsAt: '', remainingDays: 0 };
  const acceptDisabled = cooling.active;
  const acceptUrl = `${origin}/api/v1/cco-treatment-agreement/accept-public?token=${encodeURIComponent(token)}`;
  const isDistans = normalizeText(agreement.deliveryMode) === 'distans';
  const checkboxes = Array.isArray(consentBundle?.checkboxes) ? consentBundle.checkboxes : [];
  const consentTitle = normalizeText(consentBundle?.template?.title) || 'Behandlingssamtycke';
  const consentBlocks = checkboxes.length
    ? checkboxes
        .map(
          (box) => `
    <label class="consent-row">
      <input type="checkbox" name="${escapeHtml(box.name || 'consent_ack')}" value="1"${box.required ? ' required' : ''} />
      <span>${escapeHtml(box.label || consentTitle)}</span>
    </label>`
        )
        .join('')
    : `
    <label class="consent-row">
      <input type="checkbox" name="consent_ack" value="1" required />
      <span>Behandlingssamtycke saknas i katalog — signering är blockerad.</span>
    </label>`;
  const bundleMissing = consentBundle?.found !== true;

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Signera behandlingsavtal — ${escapeHtml(patientName)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 32px; background: #faf7f4; color: #1f2937; }
    .shell { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #eadfd4; border-radius: 16px; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .muted { color: #6b7280; }
    .notice { margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; }
    .notice.is-blocked { background: #fef2f2; border-color: #fecaca; }
    button { margin-top: 16px; padding: 12px 18px; border-radius: 999px; border: 0; background: #8b5e3c; color: #fff; font: inherit; cursor: pointer; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    input { width: 100%; margin-top: 6px; padding: 10px; border: 1px solid #eadfd4; border-radius: 10px; box-sizing: border-box; }
    .consent-row { display: flex; gap: 10px; align-items: flex-start; margin: 12px 0; font-size: 14px; line-height: 1.45; }
    .consent-row input { width: auto; margin-top: 3px; }
    .bundle-box { margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="shell">
    <h1>Behandlingsavtal — Hair TP Clinic</h1>
    <p class="muted">Patient: ${escapeHtml(patientName)}</p>
    <p><strong>Behandling:</strong> ${escapeHtml(agreement.offerType || '—')}</p>
    <p><strong>Pris:</strong> ${escapeHtml(agreement.quotedAmount || 'Enligt offert')}</p>
    ${
      isDistans
        ? `<p class="muted"><a href="${ANGER_BLANKET_URL}" target="_blank" rel="noopener">Konsumentverkets ångerblankett (bilaga 3)</a></p>`
        : ''
    }
    ${
      cooling.active
        ? `<div class="notice is-blocked"><strong>Betänketid</strong><br/>Du kan signera avtalet tidigast ${cooling.endsAt.slice(0, 10)} (${cooling.remainingDays} dagar kvar).</div>`
        : `<div class="notice"><strong>Redo att signera bundle</strong><br/>Avtal + behandlingssamtycke signeras i samma steg (en transaktion).</div>`
    }
    <div class="bundle-box">
      <strong>Behandlingssamtycke (steg 7)</strong>
      ${consentBlocks}
    </div>
    <form method="post" action="${acceptUrl}">
      <label>
        <span class="muted">Ditt namn</span><br/>
        <input name="customerSignedName" required />
      </label>
      <button type="submit"${acceptDisabled || bundleMissing ? ' disabled' : ''}>Jag signerar avtal och samtycke</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = {
  ANGER_BLANKET_URL,
  buildTreatmentAgreementHtml,
  buildTreatmentAgreementSignPageHtml,
};
