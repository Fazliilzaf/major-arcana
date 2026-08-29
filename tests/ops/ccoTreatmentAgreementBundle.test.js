'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  BUNDLE_STATUSES,
  assertBundleReadyToSend,
  applyConsentTemplateToAgreement,
  buildSignedBundleAgreementUpdate,
  computeBundleStatus,
  parsePublicConsentAck,
  resolveConsentTemplateForAgreement,
} = require('../../src/ops/ccoTreatmentAgreementBundle');
const {
  buildTreatmentAgreementSignPageHtml,
} = require('../../src/ops/ccoTreatmentAgreementDocument');
const { resolveTemplate } = require('../../src/ops/meridiqConsentCatalogRuntime');

describe('ccoTreatmentAgreementBundle', () => {
  it('resolveTemplate hittar Hair TP-samtycke för fue', () => {
    const resolution = resolveTemplate('fue');
    assert.equal(resolution.found, true);
    assert.equal(resolution.template.apiId, 170917);
    assert.ok(resolution.checkboxes.some((box) => box.name === 'consent_ack' && box.required));
  });

  it('buildSignedBundleAgreementUpdate registrerar signeringsbevis och aldrig "Kund"', () => {
    const updated = buildSignedBundleAgreementUpdate(
      {
        agreementStatus: 'sent',
        patientId: 'p-123',
        patientName: 'Anna Exempel',
        agreementDocumentId: 'doc-xyz',
        templateVersion: '2026.03',
        consent: {},
      },
      {
        signer: 'Anna Exempel',
        signedAt: '2026-05-20T10:00:00.000Z',
        signatureProof: { source: 'bankid', bankIdSessionId: 'sess-abc' },
      }
    );
    assert.equal(updated.customerSignedName, 'Anna Exempel');
    assert.notEqual(updated.customerSignedName, 'Kund');
    const proof = updated.signatureProof[0];
    assert.equal(proof.source, 'bankid');
    assert.equal(proof.bankIdSessionId, 'sess-abc');
    assert.equal(proof.documentId, 'doc-xyz');
    assert.equal(proof.documentVersion, '2026.03');
    assert.equal(proof.signerPatientId, 'p-123');
    assert.equal(proof.signedAt, '2026-05-20T10:00:00.000Z');
  });

  it('buildSignedBundleAgreementUpdate utan signer faller INTE tillbaka på "Kund"', () => {
    const updated = buildSignedBundleAgreementUpdate({
      agreementStatus: 'sent',
      patientId: 'p-456',
      consent: {},
    });
    assert.equal(updated.customerSignedName, '');
    assert.notEqual(updated.customerSignedName, 'Kund');
    assert.equal(updated.signatureProof[0].source, 'typed');
    assert.equal(updated.signatureProof[0].signerName, '');
  });

  it('computeBundleStatus: missing_consent_template utan dokument', () => {
    const resolution = resolveConsentTemplateForAgreement({ treatmentType: 'fue' });
    const status = computeBundleStatus(
      { agreementStatus: 'draft', treatmentType: 'fue' },
      { consentResolution: resolution }
    );
    assert.equal(status, 'missing_consent_template');
  });

  it('computeBundleStatus: ready_to_send med dokument och godkänd mall', () => {
    const resolution = resolveConsentTemplateForAgreement({ treatmentType: 'fue' });
    const status = computeBundleStatus(
      {
        agreementStatus: 'draft',
        treatmentType: 'fue',
        agreementDocumentId: 'doc-1',
        templateId: 'hair-tp-fue',
        templateVersion: '251203',
      },
      {
        consentResolution: resolution,
        templateApproval: { status: 'approved', approvedBy: 'nordbro' },
      }
    );
    assert.equal(status, 'ready_to_send');
  });

  it('assertBundleReadyToSend blockerar utan avtalsdokument', () => {
    const gate = assertBundleReadyToSend({
      agreementStatus: 'draft',
      treatmentType: 'fue',
    });
    assert.equal(gate.allowed, false);
    assert.equal(gate.bundleStatus, 'missing_consent_template');
  });

  it('assertBundleReadyToSend blockerar när bundle redan är sent', () => {
    const gate = assertBundleReadyToSend({
      agreementStatus: 'sent',
      agreementDocumentId: 'doc-1',
      treatmentType: 'fue',
    });
    assert.equal(gate.allowed, false);
    assert.equal(gate.bundleStatus, 'sent');
  });

  it('parsePublicConsentAck accepterar consent_ack från formulär', () => {
    assert.equal(parsePublicConsentAck({ consent_ack: '1' }), true);
    assert.equal(parsePublicConsentAck({ consentAck: true }), true);
    assert.equal(parsePublicConsentAck({}), false);
  });

  it('applyConsentTemplateToAgreement sätter consent-fält', () => {
    const resolution = resolveTemplate('dhi');
    const agreement = applyConsentTemplateToAgreement(
      { tenantId: 't', patientId: 'p', agreementStatus: 'draft' },
      resolution
    );
    assert.equal(agreement.consent.templateApiId, 170917);
    assert.equal(agreement.treatmentType, 'dhi');
    assert.ok(BUNDLE_STATUSES.includes(agreement.bundleStatus));
  });

  it('sign page HTML innehåller required consent_ack när mall finns', () => {
    const resolution = resolveTemplate('fue');
    const html = buildTreatmentAgreementSignPageHtml({
      agreement: { patientName: 'Test', offerType: 'FUE' },
      token: 'tok',
      origin: 'https://arcana.hairtpclinic.com',
      consentBundle: resolution,
    });
    assert.match(html, /name="consent_ack"/);
    assert.match(html, /required/);
    assert.doesNotMatch(html, /signering är blockerad/);
  });
});

describe('ccoTreatmentAgreementBundle audit + store', () => {
  it('persist bundleStatus och consent via upsert', async () => {
    const {
      createCcoTreatmentAgreementStore,
    } = require('../../src/ops/ccoTreatmentAgreementStore');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-bundle-store-'));
    const filePath = path.join(tempDir, 'cco-treatment-agreements.json');
    try {
      const store = await createCcoTreatmentAgreementStore({ filePath });
      const resolution = resolveTemplate('fue');
      const saved = await store.upsertAgreement(
        applyConsentTemplateToAgreement(
          {
            tenantId: 'hair-tp-clinic',
            patientId: 'bundle-patient',
            agreementStatus: 'draft',
            agreementDocumentId: 'doc-abc',
            treatmentType: 'fue',
          },
          resolution
        )
      );
      assert.equal(saved.consent.templateApiId, 170917);
      assert.equal(saved.bundleStatus, 'ready_to_send');

      const signed = await store.upsertAgreement({
        ...saved,
        agreementStatus: 'bookable',
        bundleStatus: 'signed',
        signedAt: '2026-05-20T12:00:00.000Z',
        consent: { ...saved.consent, signed: true, signedAt: '2026-05-20T12:00:00.000Z' },
        events: [
          ...(Array.isArray(saved.events) ? saved.events : []),
          {
            type: 'bundle_signed_public',
            label: 'Avtal + behandlingssamtycke signerat (publik)',
            detail: 'Anna · consent 170917',
          },
        ],
      });
      const event = signed.events.find((e) => e.type === 'bundle_signed_public');
      assert.ok(event);
      assert.equal(signed.bundleStatus, 'signed');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
