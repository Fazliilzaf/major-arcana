const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCommercialCaseReadout,
  createCcoCommercialStore,
} = require('../../src/ops/ccoCommercialStore');

test('cco commercial store skapar och uppdaterar kommersiella ärenden idempotent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-store-'));
  const filePath = path.join(tempDir, 'cco-commercial.json');

  try {
    const store = await createCcoCommercialStore({ filePath });

    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      offerType: 'PRP paket',
    });

    const second = await store.upsertCase({
      ...first,
      commercialStatus: 'deposit_pending',
      quoteStatus: 'sent',
      paymentStatus: 'blocked',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      requiredActions: ['Lös deposition eller betalningsblockerare'],
    });

    assert.equal(second.commercialCaseId, first.commercialCaseId);
    assert.equal(second.commercialStatus, 'deposit_pending');
    assert.equal(second.paymentStatus, 'blocked');
    assert.deepEqual(second.requiredActions, ['Lös deposition eller betalningsblockerare']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('cco commercial readout prioriterar blockerad betalning och tydlig nästa åtgärd', () => {
  const readout = buildCommercialCaseReadout({
    customerName: 'Anna',
    offerType: 'PRP paket',
    commercialStatus: 'deposit_pending',
    quoteStatus: 'sent',
    paymentStatus: 'blocked',
    quotedAmount: '75 000 kr',
    depositAmount: '15 000 kr',
    dueDateIso: '2026-03-26T12:00:00.000Z',
    requiredActions: ['Lös deposition eller betalningsblockerare'],
    notes: 'Depositionen behöver lösas innan nästa steg kan bokas.',
  });

  assert.equal(readout.phase, 'payment_blocked');
  assert.equal(readout.queueBucket, 'critical');
  assert.equal(readout.waitingOn, 'operator');
  assert.match(readout.nextStep, /betalningsblockerare|deposition/i);
  assert.equal(readout.operatorActions[0]?.key, 'resolve_payment_blocker');
  assert.equal(readout.operatorActions[0]?.type, 'surface_action');
  assert.equal(readout.operatorActions[0]?.surfaceAction, 'commercial_open');
  assert.equal(readout.operatorActions[1]?.surfaceAction, 'note_open');
  assert.equal(readout.operatorActions[1]?.label, 'Betalningsnot');
});

test('cco commercial readout skickar redo commercial direkt mot bokningshandoff', () => {
  const readout = buildCommercialCaseReadout({
    customerName: 'Anna',
    offerType: 'PRP paket',
    commercialStatus: 'ready',
    quoteStatus: 'accepted',
    paymentStatus: 'paid',
    quotedAmount: '75 000 kr',
    depositAmount: '15 000 kr',
    requiredActions: ['Lämna vidare till bokning med ekonomiskt klartecken'],
  });

  assert.equal(readout.phase, 'ready_for_booking');
  assert.equal(readout.waitingOn, 'booking');
  assert.equal(readout.operatorActions[0]?.key, 'review_commercial_booking_handoff');
  assert.equal(readout.operatorActions[0]?.surfaceAction, 'booking_surface');
  assert.equal(readout.operatorActions[0]?.label, 'Bokningshandoff');
  assert.equal(readout.operatorActions[1]?.surfaceAction, 'note_open');
  assert.equal(readout.operatorActions[1]?.label, 'Bekräfta klartecken');
});
