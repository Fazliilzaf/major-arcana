'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  inferStatusFromPatientSignals,
  resolveSignalMetaForType,
} = require('../../src/ops/ccoPatientDocumentAggregator');

describe('inferStatusFromPatientSignals — foto_samtycke', () => {
  const type = { id: 'foto_samtycke' };

  it('returnerar signed när photoConsent.signed är true', () => {
    const status = inferStatusFromPatientSignals(type, { photoConsent: { signed: true } });
    assert.equal(status, 'signed');
  });

  it('returnerar planned (aldrig pending) när photoConsent saknas', () => {
    assert.equal(inferStatusFromPatientSignals(type, {}), 'planned');
    assert.equal(
      inferStatusFromPatientSignals(type, { photoConsent: { signed: false } }),
      'planned'
    );
  });

  it('returnerar planned när photoConsent.signed är false', () => {
    const status = inferStatusFromPatientSignals(type, {
      photoConsent: { signed: false, grantedAt: '', grantedBy: '' },
    });
    assert.equal(status, 'planned');
  });
});

describe('resolveSignalMetaForType — foto_samtycke', () => {
  const type = { id: 'foto_samtycke' };

  it('returnerar signedAt och signedBy från photoConsent när signed är true', () => {
    const meta = resolveSignalMetaForType(type, {
      photoConsent: {
        signed: true,
        grantedAt: '2026-05-15T10:00:00.000Z',
        grantedBy: 'Anna Andersson',
      },
    });
    assert.equal(meta.signedAt, '2026-05-15T10:00:00.000Z');
    assert.equal(meta.signedBy, 'Anna Andersson');
  });

  it('returnerar null-värden när photoConsent.signed är false', () => {
    const meta = resolveSignalMetaForType(type, {
      photoConsent: { signed: false, grantedAt: '2026-05-15', grantedBy: 'Anna' },
    });
    assert.equal(meta.signedAt, null);
    assert.equal(meta.signedBy, null);
  });

  it('returnerar null-värden när kortet saknar photoConsent', () => {
    const meta = resolveSignalMetaForType(type, {});
    assert.equal(meta.signedAt, null);
    assert.equal(meta.signedBy, null);
  });

  it('returnerar null signedAt om grantedAt är tom sträng', () => {
    const meta = resolveSignalMetaForType(type, {
      photoConsent: { signed: true, grantedAt: '', grantedBy: 'Anna' },
    });
    assert.equal(meta.signedAt, null);
    assert.equal(meta.signedBy, 'Anna');
  });

  it('påverkar inte andra dokumenttyper', () => {
    const other = { id: 'friskfoers_tp' };
    const meta = resolveSignalMetaForType(other, {
      photoConsent: { signed: true, grantedAt: '2026-05-15', grantedBy: 'Anna' },
    });
    assert.equal(meta.signedAt, null);
    assert.equal(meta.signedBy, null);
  });
});

describe('foto_samtycke blockerar aldrig bokning', () => {
  it('checkTreatmentBookingGate sätter photoConsent.signed=true oavsett patientkort', async () => {
    const { checkTreatmentBookingGate } = require('../../src/ops/ccoTreatmentBookingGate');
    const prevGate = process.env.CCO_ID_VERIFICATION_HARD_GATE;
    process.env.CCO_ID_VERIFICATION_HARD_GATE = 'false';
    try {
      const treatmentAgreementStore = {
        async getPatientAgreement() {
          return {
            agreementStatus: 'bookable',
            bundleStatus: 'signed',
            signedAt: '2026-05-15T10:00:00.000Z',
            consent: { signed: true, signedAt: '2026-05-15T10:00:00.000Z', signedBy: 'Kund' },
          };
        },
      };
      const patientMasterStore = {
        async findPatientByEmail() {
          return { id: 'patient-no-photo-consent' };
        },
        async getPatient() {
          return {
            id: 'patient-no-photo-consent',
            primaryEmail: 'nophoto@example.com',
            photoConsent: { signed: false },
          };
        },
      };

      const gate = await checkTreatmentBookingGate({
        treatmentAgreementStore,
        patientMasterStore,
        tenantId: 'hair-tp-clinic',
        customerEmail: 'nophoto@example.com',
        body: { serviceId: 'fue' },
      });
      assert.equal(gate.allowed, true, 'Avsaknad av fotosamtycke ska inte blockera bokning');
    } finally {
      if (prevGate === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
      else process.env.CCO_ID_VERIFICATION_HARD_GATE = prevGate;
    }
  });
});
