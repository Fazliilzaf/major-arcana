'use strict';

const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const {
  DEFAULT_COOLING_OFF_DAYS,
  HAIR_TP_COOLING_OFF_DAYS,
  resolveHairTpCoolingOffDays,
} = require('./ccoHairTpCoolingOffPolicy');

function addDaysIso(isoString, days) {
  const baseMs = Date.parse(normalizeText(isoString) || new Date().toISOString());
  const safeDays = resolveHairTpCoolingOffDays(days);
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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePhotoAttachment(value = {}) {
  const item = asObject(value);
  const photoId = normalizeText(item.photoId);
  if (!photoId) return null;
  return {
    photoId,
    fileName: normalizeText(item.fileName || item.label) || 'Konsultationsbild',
    label: normalizeText(item.label || item.fileName) || 'Konsultationsbild',
    hasAnnotation: Boolean(item.hasAnnotation || item.annotatedPreviewAvailable),
    annotatedPreviewAvailable: Boolean(item.annotatedPreviewAvailable),
    dataUrl: normalizeText(item.dataUrl),
  };
}

function mergePhotoAttachments(...groups) {
  const seen = new Set();
  return groups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .map(normalizePhotoAttachment)
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.photoId)) return false;
      seen.add(item.photoId);
      return true;
    });
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

const ZONE_META = {
  hårlinje: { cls: 'z-front', label: 'Hårlinje' },
  hairline: { cls: 'z-front', label: 'Hårlinje' },
  front: { cls: 'z-front', label: 'Hårlinje' },
  mitt: { cls: 'z-mid', label: 'Mitt' },
  mid: { cls: 'z-mid', label: 'Mitt' },
  middle: { cls: 'z-mid', label: 'Mitt' },
  mitten: { cls: 'z-mid', label: 'Mitt' },
  krona: { cls: 'z-crown', label: 'Krona' },
  crown: { cls: 'z-crown', label: 'Krona' },
  vertex: { cls: 'z-crown', label: 'Vertex' },
  tempel: { cls: 'z-front', label: 'Tempel' },
  temple: { cls: 'z-front', label: 'Tempel' },
};

function buildOfferSignPageHtml({
  commercialCase = {},
  planSnapshot = {},
  token = '',
  origin = '',
  coolingOff = null,
} = {}) {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const patientName =
    normalizeText(planSnapshot.displayName) || normalizeText(commercialCase.customerName) || 'Kund';
  const initials =
    patientName
      .split(/\s+/)
      .map((w) => w[0] || '')
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'K';

  const cooling = coolingOff || getCoolingOffMeta(commercialCase);
  const acceptDisabled = cooling.active;
  const acceptUrl = `${origin}/api/v1/cco-commercial/offer-accept-public?token=${encodeURIComponent(token)}`;

  const fields =
    planSnapshot.fields && typeof planSnapshot.fields === 'object' ? planSnapshot.fields : {};
  const offerPlan = asObject(commercialCase.offerPlan);
  const planGrafts = asObject(offerPlan.grafts);
  const planZones = Array.isArray(planGrafts.zones) ? planGrafts.zones : [];
  const zones = planZones.length
    ? planZones.map((zone) => zone.label || zone.key).filter(Boolean)
    : Array.isArray(fields.zones)
      ? fields.zones.filter(Boolean)
      : [];
  const graftsTotal = normalizeText(planGrafts.total) || normalizeText(fields.graftsTotal);
  const method = normalizeText(offerPlan.method) || normalizeText(fields.method);
  const offerType = normalizeText(commercialCase.offerType) || method || 'Behandlingsplan';
  const quotedAmount =
    normalizeText(offerPlan.price?.quotedAmount) || normalizeText(commercialCase.quotedAmount);
  const depositAmount =
    normalizeText(offerPlan.price?.depositAmount) || normalizeText(commercialCase.depositAmount);
  const consultationDate =
    normalizeText(offerPlan.consultationDate) || normalizeText(fields.consultationDate);
  const informationDeliveredAt =
    normalizeText(offerPlan.informationDeliveredAt) || normalizeText(commercialCase.quoteSentAt);
  const planningNote = normalizeText(offerPlan.planningNote) || normalizeText(fields.notes);

  const graftsZones =
    fields.graftsZones && typeof fields.graftsZones === 'object' ? fields.graftsZones : {};

  const photosToShow = mergePhotoAttachments(offerPlan.attachments, planSnapshot.attachments);
  const photoSrc = (p) => {
    if (normalizeText(p.dataUrl)) return normalizeText(p.dataUrl);
    if (!token || !origin) return '';
    const v = p.annotatedPreviewAvailable ? '&variant=annotated' : '';
    return `${origin}/api/v1/cco-commercial/offer-photo?token=${encodeURIComponent(token)}&photoId=${encodeURIComponent(p.photoId)}${v}`;
  };

  // Zone grid HTML
  const zoneItemsHtml = zones
    .map((z) => {
      const key = z.toLowerCase().trim();
      const meta = ZONE_META[key] || { cls: 'z-front', label: z };
      const zoneFromPlan = planZones.find(
        (zone) =>
          normalizeText(zone.label).toLowerCase() === key ||
          normalizeText(zone.key).toLowerCase() === key
      );
      const zoneGrafts = normalizeText(zoneFromPlan?.grafts) || graftsZones[key] || '';
      return `<div class="zone-item ${meta.cls}">
      <div class="zone-label-row"><span class="zone-dot"></span>${esc(meta.label)}</div>
      ${zoneGrafts ? `<div class="zone-num">${esc(zoneGrafts)}<span class="zone-unit"> hårsäckar</span></div>` : ''}
      <div class="zone-bar"></div>
    </div>`;
    })
    .join('');

  const totalHtml = graftsTotal
    ? `<div class="zone-item z-total full">
      <div class="zone-label-row"><span class="zone-dot"></span>Totalt</div>
      <div class="zone-num">${esc(graftsTotal)}<span class="zone-unit"> hårsäckar</span></div>
      <div class="zone-bar"></div>
    </div>`
    : '';

  const zonesSection =
    zones.length > 0 || graftsTotal
      ? `<div class="section-card">
    <div class="card-label">Behandlingsplan · Zoner</div>
    <div class="zone-visual">
      ${zoneItemsHtml}
      ${totalHtml}
    </div>
  </div>`
      : '';

  const photosSection =
    photosToShow.length > 0
      ? `<div class="section-card">
    <div class="card-label">Ritade konsultationsbilder</div>
    <div class="photo-note">Bilderna visas bara via din säkra offertlänk. Markerade bilder används som underlag för planeringen.</div>
    <div class="photos-grid">
      ${photosToShow
        .map((p) => {
          const src = photoSrc(p);
          if (!src) return '';
          return `<figure class="consult-photo-card">
            <a href="${esc(src)}" target="_blank" rel="noopener">
              <img class="consult-photo" src="${esc(src)}" alt="${esc(p.label)}" loading="lazy" />
            </a>
            <figcaption>
              <span>${esc(p.label)}</span>
              ${p.hasAnnotation ? '<strong>Ritad plan</strong>' : '<em>Originalbild</em>'}
            </figcaption>
          </figure>`;
        })
        .filter(Boolean)
        .join('')}
    </div>
  </div>`
      : '';

  const priceSection =
    quotedAmount || depositAmount
      ? `<div class="section-card">
    <div class="card-label">Pris</div>
    ${quotedAmount ? `<div class="price-row"><span class="price-label">Behandlingspris</span><span class="price-val">${esc(quotedAmount)}</span></div>` : ''}
    ${depositAmount ? `<div class="price-row"><span class="price-label">Förskott</span><span class="price-val">${esc(depositAmount)}</span></div>` : ''}
    ${quotedAmount ? `<div class="price-row total-row"><span class="price-label">Totalt</span><span class="price-val total">${esc(quotedAmount)}</span></div>` : ''}
  </div>`
      : '';

  const betanketidSection = cooling.active
    ? `<div class="betatid-card info">
    <div class="betatid-icon">⏳</div>
    <div class="betatid-body">
      <div class="betatid-title">Betänketid — ${esc(String(cooling.remainingDays))} dagar kvar</div>
      <div class="betatid-text">Hair TP:s operativa betänketid är ${esc(String(HAIR_TP_COOLING_OFF_DAYS))} kalenderdagar från att du mottagit tjänstespecifikation, patientinformation och offertunderlag. Du kan signera offerten från och med <strong>${esc(cooling.endsAt.slice(0, 10))}</strong>.</div>
    </div>
  </div>`
    : `<div class="betatid-card ready">
    <div class="betatid-icon">✓</div>
    <div class="betatid-body">
      <div class="betatid-title">Redo att acceptera</div>
      <div class="betatid-text">Betänketiden är avklarad. Signera nedan för att bekräfta din behandlingsplan.</div>
    </div>
  </div>`;

  const stepConn2Cls = acceptDisabled ? '' : 'done';
  const step3Dot = acceptDisabled ? 'active' : 'done';
  const step3Label = acceptDisabled ? 'active' : 'done';
  const step3Text = acceptDisabled ? '3' : '✓';
  const stepConn3Cls = acceptDisabled ? '' : 'done';

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#bb4779" />
  <title>Din offert · Hair TP Clinic</title>
  <style>
    :root{
      --bg:#faf6f2;--surface:#fff;
      --accent:#bb4779;--accent-light:#fdeef4;
      --violet:#6b31c9;--gold:#8a5f1e;--sage:#2f6f54;--info:#2f6595;
      --text:#221c15;--text2:#574d40;--text3:#6d6354;
      --border:rgba(180,165,150,0.22);
      --sh-sm:0 1px 2px rgba(56,40,28,0.06);
      --sh-md:0 3px 10px rgba(56,40,28,0.08),inset 0 1px 0 rgba(255,255,255,0.86);
      --r:14px;--r-sm:10px;--r-pill:999px;
      --max-w:480px;
      --pad:clamp(1rem,0.5rem + 2vw,1.5rem);
      --gap:0.75rem;
    }
    *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html{overflow-x:clip;scroll-behavior:smooth}
    body{
      margin:0;
      background:
        radial-gradient(ellipse at 12% 0%,rgba(255,225,200,0.4),transparent 38%),
        radial-gradient(ellipse at 88% 4%,rgba(255,210,225,0.3),transparent 42%),
        var(--bg);
      color:var(--text);
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      font-size:0.875rem;line-height:1.5;
      padding-bottom:calc(4rem + env(safe-area-inset-bottom,0px));
    }
    /* topbar */
    .topbar{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:0.6rem;
      padding:calc(0.65rem + env(safe-area-inset-top,0px)) var(--pad) 0.65rem;
      background:linear-gradient(180deg,rgba(250,246,242,0.97),rgba(250,246,242,0.82) 80%,transparent);
      backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .brand-pill{font-weight:900;font-size:0.6rem;letter-spacing:0.14em;text-transform:uppercase;
      padding:0.32rem 0.75rem;border-radius:var(--r-pill);
      background:linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,238,232,0.86));
      color:var(--accent);box-shadow:var(--sh-sm)}
    .topbar-spacer{flex:1}
    .avatar{width:2.25rem;height:2.25rem;border-radius:50%;
      background:linear-gradient(180deg,var(--accent),#8c2455);
      color:#fff;font-weight:800;font-size:0.78rem;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 12px rgba(176,53,110,0.32),inset 0 1px 0 rgba(255,255,255,0.2);
      border:1.5px solid rgba(255,255,255,0.5);flex-shrink:0}
    /* page */
    .page{max-width:var(--max-w);margin-inline:auto;padding:0.75rem var(--pad) 1rem}
    /* journey */
    .journey{display:flex;align-items:flex-start;
      padding:0.9rem 1.1rem;
      background:linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,241,236,0.86));
      border:1px solid var(--border);box-shadow:var(--sh-md);border-radius:20px;
      margin-bottom:var(--gap);overflow-x:auto;scrollbar-width:none}
    .journey::-webkit-scrollbar{display:none}
    .step{display:flex;flex-direction:column;align-items:center;gap:0.28rem;flex:1;min-width:44px}
    .step-dot{width:2rem;height:2rem;border-radius:50%;display:flex;align-items:center;
      justify-content:center;font-size:0.62rem;font-weight:800;flex-shrink:0}
    .step-dot.done{background:linear-gradient(180deg,var(--sage),#1b4f3a);color:#fff;
      box-shadow:0 4px 12px rgba(42,110,82,0.28),inset 0 1px 0 rgba(255,255,255,0.2)}
    .step-dot.active{background:linear-gradient(180deg,var(--accent),#8c2455);color:#fff;
      box-shadow:0 4px 14px rgba(176,53,110,0.42),inset 0 1px 0 rgba(255,255,255,0.2);
      animation:pulse 2.4s ease-in-out infinite}
    .step-dot.locked{background:rgba(167,145,125,0.1);color:var(--text3);
      border:1.5px dashed rgba(167,145,125,0.32)}
    @keyframes pulse{
      0%,100%{box-shadow:0 4px 14px rgba(176,53,110,0.42),inset 0 1px 0 rgba(255,255,255,0.2)}
      50%{box-shadow:0 4px 22px rgba(176,53,110,0.62),0 0 0 6px rgba(176,53,110,0.08),inset 0 1px 0 rgba(255,255,255,0.2)}
    }
    .step-label{font-size:0.55rem;font-weight:700;letter-spacing:0.02em;
      color:var(--text3);text-align:center;white-space:nowrap}
    .step-label.active{color:var(--accent)}
    .step-label.done{color:var(--sage)}
    .step-conn{height:2px;flex:1;min-width:8px;background:rgba(167,145,125,0.14);
      margin-top:1rem;border-radius:2px}
    .step-conn.done{background:linear-gradient(90deg,var(--sage),rgba(47,111,84,0.3))}
    /* cards */
    .section-card{background:linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,241,236,0.86));
      border:1px solid var(--border);box-shadow:var(--sh-md);border-radius:var(--r);
      padding:1rem 1.1rem;margin-bottom:var(--gap)}
    .card-label{font-size:0.6rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;
      color:var(--text3);margin-bottom:0.65rem}
    /* zones */
    .zone-visual{display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;margin-bottom:0.2rem}
    .zone-item{padding:0.75rem 0.875rem;border-radius:var(--r-sm);
      background:linear-gradient(180deg,rgba(255,255,255,0.84),rgba(247,241,236,0.78));
      border:1px solid var(--border);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8)}
    .zone-item.full{grid-column:1/-1}
    .zone-dot{width:7px;height:7px;border-radius:50%;display:inline-block;
      margin-right:0.3rem;vertical-align:middle;flex-shrink:0}
    .zone-label-row{font-size:0.66rem;font-weight:700;letter-spacing:0.04em;
      text-transform:uppercase;color:var(--text3);display:flex;align-items:center;margin-bottom:0.3rem}
    .zone-num{font-size:clamp(1.1rem,1rem + 1vw,1.45rem);font-weight:800;
      letter-spacing:-0.03em;line-height:1}
    .zone-unit{font-size:0.6rem;font-weight:600;letter-spacing:0.02em;
      color:var(--text3);margin-left:0.15rem}
    .zone-bar{height:3px;border-radius:2px;margin-top:0.5rem;opacity:0.55}
    .z-front .zone-dot{background:var(--accent)}
    .z-front .zone-num{color:var(--accent)}
    .z-front .zone-bar{background:linear-gradient(90deg,var(--accent),rgba(187,71,121,0.15))}
    .z-mid .zone-dot{background:var(--violet)}
    .z-mid .zone-num{color:var(--violet)}
    .z-mid .zone-bar{background:linear-gradient(90deg,var(--violet),rgba(107,49,201,0.15))}
    .z-crown .zone-dot{background:var(--gold)}
    .z-crown .zone-num{color:var(--gold)}
    .z-crown .zone-bar{background:linear-gradient(90deg,var(--gold),rgba(138,95,30,0.15))}
    .z-total .zone-dot{background:var(--sage)}
    .z-total .zone-num{color:var(--sage)}
    .z-total .zone-bar{background:linear-gradient(90deg,var(--sage),rgba(47,111,84,0.15))}
    /* photos */
    .photo-note{font-size:0.72rem;color:var(--text2);line-height:1.45;margin-bottom:0.65rem}
    .photos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:0.5rem}
    .consult-photo-card{margin:0;padding:0.4rem;border-radius:var(--r-sm);
      background:rgba(255,255,255,0.72);border:1px solid rgba(167,145,125,0.14)}
    .consult-photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r-sm);
      border:1px solid var(--border)}
    .consult-photo-card figcaption{display:flex;align-items:center;justify-content:space-between;
      gap:0.35rem;margin-top:0.38rem;font-size:0.66rem;color:var(--text2)}
    .consult-photo-card figcaption strong{font-size:0.58rem;text-transform:uppercase;
      letter-spacing:0.03em;color:var(--accent);background:var(--accent-light);
      border-radius:var(--r-pill);padding:0.14rem 0.34rem;white-space:nowrap}
    .consult-photo-card figcaption em{font-style:normal;color:var(--text3);white-space:nowrap}
    /* price */
    .price-row{display:flex;justify-content:space-between;align-items:baseline;
      padding:0.5rem 0;border-bottom:1px solid rgba(167,145,125,0.12)}
    .price-row:last-child{border-bottom:0;padding-bottom:0}
    .price-row.total-row{margin-top:0.2rem;padding-top:0.65rem;
      border-top:1px solid rgba(167,145,125,0.16);border-bottom:0}
    .price-label{font-size:0.75rem;color:var(--text2);font-weight:500}
    .price-val{font-size:0.75rem;font-weight:700;font-variant-numeric:tabular-nums}
    .price-val.total{font-size:1.25rem;font-weight:800;letter-spacing:-0.03em;
      background:linear-gradient(135deg,var(--accent),var(--violet));
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    /* betänketid */
    .betatid-card{display:flex;align-items:flex-start;gap:0.875rem;
      padding:1rem 1.1rem;border-radius:var(--r);margin-bottom:var(--gap)}
    .betatid-card.info{
      background:linear-gradient(180deg,rgba(255,255,255,0.96),rgba(47,101,149,0.05));
      border:1px solid rgba(47,101,149,0.16);
      box-shadow:0 4px 12px rgba(47,101,149,0.08),0 1px 2px rgba(47,101,149,0.04)}
    .betatid-card.ready{
      background:linear-gradient(180deg,rgba(255,255,255,0.96),rgba(47,111,84,0.05));
      border:1px solid rgba(47,111,84,0.2);
      box-shadow:0 4px 12px rgba(47,111,84,0.1),0 1px 2px rgba(47,111,84,0.06)}
    .betatid-icon{width:2.25rem;height:2.25rem;border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0}
    .betatid-card.info .betatid-icon{background:rgba(47,101,149,0.1)}
    .betatid-card.ready .betatid-icon{background:rgba(47,111,84,0.1)}
    .betatid-body{flex:1}
    .betatid-title{font-size:0.8rem;font-weight:700;margin-bottom:0.2rem}
    .betatid-card.info .betatid-title{color:var(--info)}
    .betatid-card.ready .betatid-title{color:var(--sage)}
    .betatid-text{font-size:0.72rem;color:var(--text2);line-height:1.45}
    /* form */
    .form-card{background:linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,241,236,0.86));
      border:1px solid var(--border);box-shadow:var(--sh-md);border-radius:var(--r);
      padding:1rem 1.1rem}
    .form-field-label{font-size:0.72rem;font-weight:700;color:var(--text2);
      display:block;margin-bottom:0.4rem}
    .form-input{width:100%;padding:0.7rem 0.875rem;border:1px solid var(--border);
      border-radius:var(--r-sm);background:rgba(255,255,255,0.9);color:var(--text);
      font:inherit;font-size:0.875rem;outline:none;transition:border-color 0.15s,box-shadow 0.15s}
    .form-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(187,71,121,0.1)}
    .submit-btn{display:block;width:100%;margin-top:0.875rem;padding:0.9rem 1rem;
      border:0;border-radius:var(--r-pill);
      background:linear-gradient(135deg,var(--accent),#8c2455);
      color:#fff;font:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;
      box-shadow:0 4px 14px rgba(176,53,110,0.36);transition:opacity 0.15s}
    .submit-btn:disabled{opacity:0.4;cursor:not-allowed}
    .submit-btn:not(:disabled):hover{opacity:0.88}
    /* footer */
    .page-footer{text-align:center;font-size:0.68rem;color:var(--text3);
      margin-top:1.5rem;line-height:1.7}
    @media(max-width:360px){
      .zone-visual{grid-template-columns:1fr}
      .photos-grid{grid-template-columns:1fr 1fr}
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand-pill">HAIR TP</div>
    <div class="topbar-spacer"></div>
    <div class="avatar">${esc(initials)}</div>
  </div>

  <div class="page">
    <div class="journey">
      <div class="step">
        <div class="step-dot done">✓</div>
        <div class="step-label done">Konsultation</div>
      </div>
      <div class="step-conn done"></div>
      <div class="step">
        <div class="step-dot active">2</div>
        <div class="step-label active">Offert</div>
      </div>
      <div class="step-conn ${stepConn2Cls}"></div>
      <div class="step">
        <div class="step-dot ${step3Dot}">${step3Text}</div>
        <div class="step-label ${step3Label}">Betänketid</div>
      </div>
      <div class="step-conn ${stepConn3Cls}"></div>
      <div class="step">
        <div class="step-dot locked">4</div>
        <div class="step-label">Operation</div>
      </div>
    </div>

    <div class="section-card">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:0.2rem">Hej, ${esc(patientName)}</div>
      <div style="font-size:0.82rem;color:var(--text2)">Här är din behandlingsoffert från Hair TP Clinic. Granska planen nedan och signera när betänketiden löpt ut.</div>
      <div style="margin-top:0.6rem;font-size:0.72rem;color:var(--text3)">
        <strong>Behandling:</strong> ${esc(offerType)}${consultationDate ? ` &nbsp;·&nbsp; <strong>Konsultation:</strong> ${esc(consultationDate)}` : ''}${informationDeliveredAt ? ` &nbsp;·&nbsp; <strong>Patientinformation:</strong> ${esc(informationDeliveredAt.slice(0, 10))}` : ''}
      </div>
      ${planningNote ? `<div style="margin-top:0.5rem;font-size:0.76rem;color:var(--text2)"><strong>Planering:</strong> ${esc(planningNote)}</div>` : ''}
    </div>

    ${zonesSection}
    ${photosSection}
    ${priceSection}
    ${betanketidSection}

    <div class="form-card">
      <div class="card-label">Signering</div>
      <form method="post" action="${acceptUrl}">
        <label class="form-field-label" for="csnField">Ditt fullständiga namn</label>
        <input
          class="form-input"
          type="text"
          id="csnField"
          name="customerSignedName"
          required
          placeholder="Förnamn Efternamn"
          autocomplete="name"
        />
        <button class="submit-btn" type="submit"${acceptDisabled ? ' disabled' : ''}>
          ${acceptDisabled ? `Öppnar ${esc(cooling.endsAt.slice(0, 10))}` : 'Jag accepterar offerten'}
        </button>
      </form>
    </div>

    <div class="page-footer">
      Hair TP Clinic &nbsp;·&nbsp; Konfidentiell offert<br />
      Dela inte denna länk med obehöriga.
    </div>
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
