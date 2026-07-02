'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addDaysIso,
  buildOfferSignPageHtml,
  canAcceptOffer,
  getCoolingOffMeta,
} = require('../../src/ops/ccoOfferEsign');
const { HAIR_TP_COOLING_OFF_DAYS } = require('../../src/ops/ccoHairTpCoolingOffPolicy');
const {
  listOfferTemplates,
  resolveTemplateKeyFromPlan,
} = require('../../src/ops/ccoOfferTemplateStore');

test('listOfferTemplates returns 14 templates', () => {
  assert.equal(listOfferTemplates().length, 14);
});

test('offer templates use Hair TP 2-day cooling off', () => {
  for (const t of listOfferTemplates()) {
    assert.equal(t.coolingOffDays, HAIR_TP_COOLING_OFF_DAYS);
  }
});

test('resolveTemplateKeyFromPlan picks combo template for FUE + PRP', () => {
  const key = resolveTemplateKeyFromPlan({
    fields: { method: 'FUE', prpIncluded: true, zones: ['Front'] },
  });
  assert.equal(key, 'combo-fue-prp');
});

test('canAcceptOffer blocks during cooling off', () => {
  const sentAt = '2026-05-22T10:00:00.000Z';
  const gate = canAcceptOffer(
    {
      quoteStatus: 'sent',
      quoteSentAt: sentAt,
      coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS),
    },
    { nowMs: Date.parse('2026-05-23T10:00:00.000Z') }
  );
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /Betänketid/);
});

test('canAcceptOffer allows accept after cooling off', () => {
  const sentAt = '2026-05-01T10:00:00.000Z';
  const gate = canAcceptOffer(
    {
      quoteStatus: 'sent',
      coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS),
    },
    { nowMs: Date.parse('2026-05-03T10:00:00.000Z') }
  );
  assert.equal(gate.allowed, true);
});

test('getCoolingOffMeta reports remaining days', () => {
  const sentAt = new Date().toISOString();
  const meta = getCoolingOffMeta(
    { coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS) },
    Date.now() + 24 * 60 * 60 * 1000
  );
  assert.equal(meta.active, true);
  assert.ok(meta.remainingDays >= 1);
});

test('buildOfferSignPageHtml renders K6-K7 offer data, drawn photos and 2-day Hair TP copy', () => {
  const sentAt = '2026-07-20T10:00:00.000Z';
  const html = buildOfferSignPageHtml({
    origin: 'https://arcana.hairtpclinic.com',
    token: 'tok-k6-k7',
    commercialCase: {
      customerName: 'Anna Kund',
      quoteStatus: 'sent',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      quoteSentAt: sentAt,
      coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS),
      offerPlan: {
        schemaVersion: 'offer-plan.v1',
        method: 'DHI',
        informationDeliveredAt: sentAt,
        planningNote: 'Hårlinje först, därefter mitt och krona enligt ritade konsultationsbilder.',
        grafts: {
          total: '3500',
          zones: [
            { key: 'hairline', label: 'Hårlinje', grafts: '500' },
            { key: 'mid_scalp', label: 'Mitt', grafts: '1000' },
            { key: 'crown', label: 'Krona', grafts: '2000' },
          ],
        },
        price: {
          quotedAmount: '75 000 kr',
          depositAmount: '15 000 kr',
        },
        attachments: [
          {
            photoId: 'photo-front',
            label: 'Hårlinje ritad framifrån',
            hasAnnotation: true,
            annotatedPreviewAvailable: true,
          },
        ],
      },
    },
  });

  assert.match(html, /Hårlinje/);
  assert.match(html, /500<span class="zone-unit"> hårsäckar/);
  assert.match(html, /Mitt/);
  assert.match(html, /1000<span class="zone-unit"> hårsäckar/);
  assert.match(html, /Krona/);
  assert.match(html, /2000<span class="zone-unit"> hårsäckar/);
  assert.match(html, /3500<span class="zone-unit"> hårsäckar/);
  assert.match(html, /75 000 kr/);
  assert.match(html, /15 000 kr/);
  assert.match(html, /Ritade konsultationsbilder/);
  assert.match(html, /Hårlinje ritad framifrån/);
  assert.match(html, /variant=annotated/);
  assert.match(html, /Hair TP:s operativa betänketid är 2 kalenderdagar/);
  assert.doesNotMatch(html, /14 dagars betänketid/);
});
