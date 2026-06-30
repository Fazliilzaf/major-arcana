'use strict';

const { getOfferTemplate, resolveTemplateKeyFromPlan } = require('./ccoOfferTemplateStore');
const { getCoolingOffMeta } = require('./ccoOfferEsign');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeZoneKey(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  if (/hår|hair|front|linje|temp/.test(raw)) return 'hairline';
  if (/mitt|mid|middle|scalp|central/.test(raw)) return 'mid_scalp';
  if (/krona|crown|vertex/.test(raw)) return 'crown';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeZoneLabel(value, fallback = '') {
  const raw = normalizeText(value || fallback);
  const key = normalizeZoneKey(raw);
  const labels = {
    hairline: 'Hårlinje',
    mid_scalp: 'Mitt',
    crown: 'Krona',
  };
  return labels[key] || raw || 'Zon';
}

function normalizeZoneGrafts(value) {
  const text = normalizeText(value);
  if (!text) return '';
  const number = text.match(/\d[\d\s.]*/)?.[0]?.replace(/[^\d]/g, '') || '';
  return number || text;
}

function buildPlanSnapshot(journalEntry = {}, patient = {}) {
  const entry = asObject(journalEntry);
  const fields = asObject(entry.fields);
  const attachments = asArray(entry.attachments)
    .filter((item) => normalizeText(item.type) === 'consultation_photo' && item.photoId)
    .map((item) => ({
      attachmentId: normalizeText(item.attachmentId),
      photoId: normalizeText(item.photoId),
      fileName: normalizeText(item.fileName) || normalizeText(item.label) || 'Konsultationsbild',
      label: normalizeText(item.label),
      hasAnnotation: Boolean(item.hasAnnotation),
      annotatedPreviewAvailable: Boolean(item.annotatedPreviewAvailable),
      planSummary: asObject(item.planSummary),
    }));

  return {
    entryId: normalizeText(entry.entryId),
    journalType: normalizeText(entry.journalType),
    title: normalizeText(entry.title) || 'Konsultation — behandlingsplan',
    status: normalizeText(entry.status),
    signedAt: normalizeText(entry.signedAt) || null,
    patientId: normalizeText(entry.patientId) || normalizeText(patient.id),
    personnummer: normalizeText(entry.personnummer) || normalizeText(patient.personnummer),
    displayName: normalizeText(patient.displayName) || normalizeText(patient.fullName),
    fields: {
      consultationDate: normalizeText(fields.consultationDate),
      method: normalizeText(fields.method),
      graftsTotal: normalizeText(fields.graftsTotal),
      zones: asArray(fields.zones)
        .map((zone) => {
          if (zone && typeof zone === 'object')
            return normalizeText(zone.label || zone.name || zone.zone || '');
          return normalizeText(zone);
        })
        .filter(Boolean),
      graftsZones: asArray(fields.zones).reduce((acc, zone) => {
        if (!zone || typeof zone !== 'object') return acc;
        const label = normalizeText(zone.label || zone.name || zone.zone || '').toLowerCase();
        const grafts = normalizeText(zone.grafts || zone.graftCount || zone.count || '');
        if (label && grafts) acc[label] = grafts;
        return acc;
      }, {}),
      prpIncluded: fields.prpIncluded,
      notes: normalizeText(fields.notes),
    },
    attachments,
    capturedAt: new Date().toISOString(),
  };
}

function buildOfferPlanData(planSnapshot = {}, commercialCase = {}) {
  const fields = asObject(planSnapshot.fields);
  const graftsZones = asObject(fields.graftsZones);
  const rawZones = asArray(fields.zones);
  const zones = rawZones
    .map((zone) => {
      const zoneObject = asObject(zone);
      const rawLabel =
        normalizeText(zoneObject.label || zoneObject.name || zoneObject.zone) ||
        normalizeText(zone);
      const key = normalizeZoneKey(rawLabel);
      if (!key && !rawLabel) return null;
      const grafts =
        normalizeZoneGrafts(zoneObject.grafts || zoneObject.graftCount || zoneObject.count) ||
        normalizeZoneGrafts(graftsZones[rawLabel.toLowerCase()] || graftsZones[key]);
      return {
        key: key || normalizeZoneKey(rawLabel),
        label: normalizeZoneLabel(rawLabel),
        grafts,
        note: normalizeText(zoneObject.note || zoneObject.notes || zoneObject.comment),
        source: 'consultation_plan',
      };
    })
    .filter(Boolean);

  const totalFromZones = zones.reduce((sum, zone) => {
    const parsed = Number(String(zone.grafts || '').replace(/[^\d]/g, ''));
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const graftsTotal =
    normalizeZoneGrafts(fields.graftsTotal) || (totalFromZones ? String(totalFromZones) : '');
  const quotedAmount = normalizeText(commercialCase.quotedAmount);
  const depositAmount = normalizeText(commercialCase.depositAmount);
  const quoteSentAt = normalizeText(commercialCase.quoteSentAt);

  return {
    schemaVersion: 'offer-plan.v1',
    treatmentLabel:
      normalizeText(commercialCase.offerType) || normalizeText(fields.method) || 'Behandlingsplan',
    method: normalizeText(fields.method),
    consultationDate: normalizeText(fields.consultationDate),
    informationDeliveredAt: quoteSentAt || null,
    planningNote: normalizeText(commercialCase.notes) || normalizeText(fields.notes),
    grafts: {
      total: graftsTotal,
      zones,
    },
    price: {
      quotedAmount,
      depositAmount,
      currency: normalizeText(commercialCase.currency) || 'SEK',
    },
    prpIncluded: fields.prpIncluded === true ? true : fields.prpIncluded === false ? false : null,
    attachments: asArray(planSnapshot.attachments).map((item) => ({
      photoId: normalizeText(item.photoId),
      label: normalizeText(item.label || item.fileName) || 'Konsultationsbild',
      hasAnnotation: Boolean(item.hasAnnotation || item.annotatedPreviewAvailable),
      annotatedPreviewAvailable: Boolean(item.annotatedPreviewAvailable),
    })),
  };
}

function buildOfferDefaultsFromPlan(planSnapshot = {}, overrides = {}) {
  const fields = asObject(planSnapshot.fields);
  const method = normalizeText(overrides.method) || normalizeText(fields.method);
  const zones = asArray(fields.zones).join(', ');
  const offerType = method
    ? zones
      ? `${method} — ${zones}`
      : method
    : normalizeText(overrides.offerType) || 'Behandlingsplan';

  const notesParts = [
    normalizeText(fields.notes),
    fields.graftsTotal ? `Grafts: ${fields.graftsTotal}` : '',
    zones ? `Zoner: ${zones}` : '',
  ].filter(Boolean);

  return {
    offerType,
    offerTemplateKey: resolveTemplateKeyFromPlan(planSnapshot, overrides.templateKey),
    quotedAmount: normalizeText(overrides.quotedAmount),
    depositAmount: normalizeText(overrides.depositAmount),
    notes: normalizeText(overrides.notes) || notesParts.join('\n'),
    nextStep: 'Skicka offert till kund och invänta accept',
  };
}

async function resolvePlanPhotoDataUrls({
  journalPhotoStore,
  tenantId,
  patientId,
  planSnapshot = {},
}) {
  if (!journalPhotoStore) return asArray(planSnapshot.attachments);
  const patient = normalizeText(patientId) || normalizeText(planSnapshot.patientId);
  const rows = [];
  for (const photo of asArray(planSnapshot.attachments)) {
    let payload = null;
    if (photo.annotatedPreviewAvailable) {
      payload = await journalPhotoStore.readAnnotatedPreview({
        tenantId,
        patientId: patient,
        photoId: photo.photoId,
      });
    }
    if (!payload) {
      payload = await journalPhotoStore.readPhoto({
        tenantId,
        patientId: patient,
        photoId: photo.photoId,
      });
    }
    rows.push({
      ...photo,
      dataUrl: payload?.buffer
        ? `data:${payload.mimeType || 'image/jpeg'};base64,${payload.buffer.toString('base64')}`
        : '',
    });
  }
  return rows;
}

function photoUrl(origin, patientId, photoId, variant = '') {
  const params = new URLSearchParams({ patientId, photoId });
  if (variant) params.set('variant', variant);
  return `${origin}/api/v1/cco-journal/photo?${params.toString()}`;
}

function buildOfferDocumentHtml({
  origin = '',
  commercialCase = {},
  planSnapshot = {},
  generatedAt = new Date().toISOString(),
  embeddedPhotos = null,
} = {}) {
  const patientName =
    normalizeText(planSnapshot.displayName) || normalizeText(commercialCase.customerName) || 'Kund';
  const fields = asObject(planSnapshot.fields);
  const offerPlan = asObject(commercialCase.offerPlan).schemaVersion
    ? commercialCase.offerPlan
    : buildOfferPlanData(planSnapshot, commercialCase);
  const planZones = asArray(offerPlan.grafts?.zones);
  const zones = planZones.length
    ? planZones
        .map((zone) => zone.label)
        .filter(Boolean)
        .join(', ')
    : asArray(fields.zones).join(', ');
  const template = getOfferTemplate(commercialCase.offerTemplateKey);
  const cooling = getCoolingOffMeta(commercialCase);
  const photoRows = Array.isArray(embeddedPhotos)
    ? embeddedPhotos
    : asArray(planSnapshot.attachments);
  const photos = photoRows.map((photo) => {
    const src =
      normalizeText(photo.dataUrl) ||
      (photo.annotatedPreviewAvailable
        ? photoUrl(origin, planSnapshot.patientId, photo.photoId, 'annotated')
        : photoUrl(origin, planSnapshot.patientId, photo.photoId));
    return `
      <figure class="offer-photo">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(photo.fileName)}" />
        <figcaption>${escapeHtml(photo.label || photo.fileName)}${
          photo.hasAnnotation ? ' · markerad behandlingsplan' : ''
        }</figcaption>
      </figure>`;
  });

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Offert — ${escapeHtml(patientName)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; color: #1f2937; margin: 0; padding: 32px; background: #fff; }
    .offer-shell { max-width: 920px; margin: 0 auto; }
    .offer-head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    .offer-brand h1 { margin: 0 0 6px; font-size: 28px; }
    .offer-brand p { margin: 0; color: #6b7280; }
    .offer-meta { text-align: right; font-size: 14px; color: #4b5563; }
    .offer-section { margin: 24px 0; padding: 20px; border: 1px solid #eadfd4; border-radius: 16px; background: #fffaf6; }
    .offer-section h2 { margin: 0 0 12px; font-size: 18px; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 8px 16px; margin: 0; }
    dt { color: #6b5648; }
    dd { margin: 0; }
    .offer-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    .offer-photo { margin: 0; }
    .offer-photo img { width: 100%; border-radius: 12px; border: 1px solid #eadfd4; }
    .offer-photo figcaption { margin-top: 8px; font-size: 12px; color: #6b7280; }
    .offer-agreement { white-space: pre-wrap; line-height: 1.5; }
    .offer-footer { margin-top: 32px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="offer-shell">
    <header class="offer-head">
      <div class="offer-brand">
        <h1>Hair TP Clinic</h1>
        <p>Offert baserad på konsultation och behandlingsplan</p>
      </div>
      <div class="offer-meta">
        <div><strong>Datum:</strong> ${escapeHtml(generatedAt.slice(0, 10))}</div>
        <div><strong>Offert-ID:</strong> ${escapeHtml(commercialCase.commercialCaseId || '')}</div>
        <div><strong>Mall:</strong> ${escapeHtml(template.label)} (${escapeHtml(template.wordFileHint)})</div>
      </div>
    </header>

    <section class="offer-section">
      <h2>Kund</h2>
      <dl>
        <dt>Namn</dt><dd>${escapeHtml(patientName)}</dd>
        <dt>Personnummer</dt><dd>${escapeHtml(planSnapshot.personnummer || '—')}</dd>
        <dt>Plan signerad</dt><dd>${escapeHtml(planSnapshot.signedAt ? planSnapshot.signedAt.slice(0, 10) : 'Utkast')}</dd>
      </dl>
    </section>

    <section class="offer-section">
      <h2>Överenskommen behandlingsplan</h2>
      <dl>
        <dt>Behandling</dt><dd>${escapeHtml(commercialCase.offerType || fields.method || '—')}</dd>
        <dt>Metod</dt><dd>${escapeHtml(offerPlan.method || fields.method || '—')}</dd>
        <dt>Grafts</dt><dd>${escapeHtml(offerPlan.grafts?.total || fields.graftsTotal || '—')}</dd>
        <dt>Zoner</dt><dd>${escapeHtml(zones || '—')}</dd>
        <dt>PRP</dt><dd>${fields.prpIncluded === true ? 'Ja' : fields.prpIncluded === false ? 'Nej' : '—'}</dd>
        <dt>Pris</dt><dd>${escapeHtml(offerPlan.price?.quotedAmount || commercialCase.quotedAmount || 'Enligt separat prislista')}</dd>
        <dt>Moms</dt><dd>Inkluderad enligt gällande skattesats (25 % om inget annat anges)</dd>
        <dt>Deposition</dt><dd>${escapeHtml(offerPlan.price?.depositAmount || commercialCase.depositAmount || '—')}</dd>
        <dt>Patientinformation</dt><dd>${escapeHtml(offerPlan.informationDeliveredAt ? offerPlan.informationDeliveredAt.slice(0, 10) : 'Skickas med offerten')}</dd>
      </dl>
      ${
        planZones.length
          ? `<h3>Zonfördelning</h3><dl>${planZones
              .map(
                (zone) =>
                  `<dt>${escapeHtml(zone.label)}</dt><dd>${escapeHtml(zone.grafts || '—')} hårsäckar${zone.note ? ` · ${escapeHtml(zone.note)}` : ''}</dd>`
              )
              .join('')}</dl>`
          : ''
      }
      ${
        offerPlan.planningNote || fields.notes || commercialCase.notes
          ? `<div class="offer-agreement"><strong>Anteckning</strong>\n${escapeHtml(
              offerPlan.planningNote || commercialCase.notes || fields.notes
            )}</div>`
          : ''
      }
    </section>

    ${
      photos.length
        ? `<section class="offer-section">
      <h2>Markerade konsultationsbilder</h2>
      <p>Dessa bilder visar den plan ni kommit överens om vid konsultationen.</p>
      <div class="offer-photos">${photos.join('')}</div>
    </section>`
        : ''
    }

    <section class="offer-section">
      <h2>Avtal</h2>
      <p class="offer-agreement">${escapeHtml(template.agreementText)}</p>
      <p class="offer-agreement">Genom att acceptera denna offert bekräftar kunden behandlingsplanen ovan, inklusive markerade zoner och omfattning. Offerten gäller enligt klinikens villkor.</p>
      ${
        normalizeText(commercialCase.quoteSentAt)
          ? `<p class="offer-agreement"><strong>Skickad:</strong> ${escapeHtml(commercialCase.quoteSentAt.slice(0, 10))}</p>`
          : ''
      }
      ${
        cooling.endsAt
          ? `<p class="offer-agreement"><strong>Betänketid till:</strong> ${escapeHtml(cooling.endsAt.slice(0, 10))}${
              cooling.active ? ' (pågår)' : ' (passerad)'
            }</p>`
          : ''
      }
      ${
        normalizeText(commercialCase.quoteAcceptedAt)
          ? `<p class="offer-agreement"><strong>Accepterad:</strong> ${escapeHtml(commercialCase.quoteAcceptedAt.slice(0, 10))} av ${escapeHtml(commercialCase.customerSignedName || 'Kund')}</p>`
          : ''
      }
    </section>

    <footer class="offer-footer">
      Genererad ${escapeHtml(generatedAt.replace('T', ' ').slice(0, 16))} · Hair TP Clinic CCO
    </footer>
  </div>
</body>
</html>`;
}

module.exports = {
  buildOfferDefaultsFromPlan,
  buildOfferDocumentHtml,
  buildOfferPlanData,
  buildPlanSnapshot,
  resolvePlanPhotoDataUrls,
  photoUrl,
};
