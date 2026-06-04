'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildTemplateVersionKey,
  computeSignedAgreementBookable,
  createCcoTemplateVersionApprovalStore,
  resolveAgreementTemplateBinding,
} = require('../../src/ops/ccoTemplateVersionApprovalStore');

describe('ccoTemplateVersionApprovalStore', () => {
  it('buildTemplateVersionKey formaterar templateId@version', () => {
    assert.equal(buildTemplateVersionKey('hair-tp-fue', '1.3'), 'hair-tp-fue@1.3');
  });

  it('recordApproval godkänner mall-version', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-template-approval-'));
    const filePath = path.join(tempDir, 'approvals.json');
    try {
      const store = await createCcoTemplateVersionApprovalStore({ filePath });
      const approval = await store.recordApproval({
        templateId: 'hair-tp-fue',
        version: '1.3',
        status: 'approved',
        approvedBy: 'nordbro',
        note: 'OK för prod',
      });
      assert.equal(approval.status, 'approved');
      assert.equal(approval.approvedBy, 'nordbro');
      const loaded = await store.getApproval({ templateId: 'hair-tp-fue', version: '1.3' });
      assert.equal(loaded.status, 'approved');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('signed avtal utan template-binding är legacy bookable', () => {
    const bookable = computeSignedAgreementBookable({
      agreementStatus: 'bookable',
      templateId: '',
      templateVersion: '',
    });
    assert.equal(bookable, true);
  });

  it('signed avtal med binding kräver approved mall-version', () => {
    const agreement = {
      agreementStatus: 'bookable',
      templateId: 'hair-tp-fue',
      templateVersion: '1.3',
    };
    assert.equal(resolveAgreementTemplateBinding(agreement).requiresApproval, true);
    assert.equal(computeSignedAgreementBookable(agreement, { status: 'pending' }), false);
    assert.equal(computeSignedAgreementBookable(agreement, { status: 'approved' }), true);
  });
});
