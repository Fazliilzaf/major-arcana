'use strict';

/* ORD-153 §6-åtgärd — offerAutoFlow (offer-accepterad → boka) grindas under
 * CCO_SEND_LIVE. Steg 1–2 (avtal + VIP-token) är interna operationer och körs
 * alltid; steg 3 (SMS + mail-notis) får aldrig skicka skarpt utan CCO_SEND_LIVE. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { onOfferAccepted } = require('../../src/ops/offerAutoFlow');

function buildDeps() {
  const mails = [];
  return {
    mails,
    graphSendConnector: {
      sendMail: async (p) => (mails.push(p), { ok: true, messageId: 'm1' }),
    },
    patientMasterStore: {
      getPatient: async () => ({
        id: 'p1',
        name: 'Anna',
        email: 'anna@example.com',
        phone: '+46700000000',
      }),
    },
    treatmentAgreementStore: {
      upsertAgreement: async (i) => ({ agreementId: 'ag-1', ...i }),
    },
    bookingEngineStore: {
      createVipToken: async () => ({ token: 'vip-1', expiresAt: '2026-09-30' }),
    },
  };
}

const commercialCase = {
  patientId: 'p1',
  tenantId: 'hairtpclinic',
  serviceId: 'fue',
  customerEmail: 'anna@example.com',
  customerPhone: '+46700000000',
  customerSignedName: 'Anna Test',
};

test('ORD-153 §6: autoflow-notisen (SMS+mail) → dry-run utan CCO_SEND_LIVE, avtal/token skapas ändå', async () => {
  delete process.env.CCO_SEND_LIVE;
  const deps = buildDeps();

  const results = await onOfferAccepted({
    commercialCase,
    treatmentAgreementStore: deps.treatmentAgreementStore,
    bookingEngineStore: deps.bookingEngineStore,
    graphSendConnector: deps.graphSendConnector,
    patientMasterStore: deps.patientMasterStore,
  });

  // Steg 1–2 körs (interna operationer, inte patientvända sändningar).
  assert.ok(results.steps.some((s) => s.step === 'agreement_created'), 'avtal ska skapas');
  assert.ok(results.steps.some((s) => s.step === 'vip_token_created'), 'VIP-token ska skapas');

  // Steg 3 grindas: ingen SMS/mail-notis skickas, och det registreras tydligt.
  const gated = results.steps.find((s) => s.step === 'booking_notification_gated');
  assert.ok(gated, 'booking_notification_gated ska registreras');
  assert.equal(gated.dryRun, true);
  assert.equal(gated.reason, 'send_gate_off');
  assert.equal(deps.mails.length, 0, 'graphSendConnector.sendMail får inte kallas när grinden är av');
  assert.ok(!results.steps.some((s) => s.step === 'booking_sms_sent'), 'ingen SMS-sändning');
  assert.ok(!results.steps.some((s) => s.step === 'booking_email_sent'), 'ingen mail-sändning');
});
