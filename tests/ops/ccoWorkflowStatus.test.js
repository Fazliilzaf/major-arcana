'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WORKFLOW_STAGES,
  resolveWorkflowReadout,
  resolveWorkflowGates,
  journeyIsReal,
} = require('../../src/ops/ccoWorkflowStatus');

test('resolveWorkflowReadout: endast utkast → offer_draft, offer gate låst', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'draft', esignStatus: 'draft' },
  });
  assert.equal(out.stageKey, 'offer_draft');
  assert.equal(out.stageLabel, 'Offertutkast');
  assert.equal(out.journey, null);
  const gate = out.gates.find((g) => g.id === 'offer');
  assert.equal(gate.state, 'locked');
  assert.equal(out.progressPercent, 0);
});

test('resolveWorkflowReadout: offert skickad → offer active / offer_sent', () => {
  const out = resolveWorkflowReadout({
    commercialCase: {
      quoteStatus: 'sent',
      esignStatus: 'sent',
      quoteSentAt: '2026-08-01T00:00:00Z',
    },
  });
  assert.equal(out.stageKey, 'offer_sent');
  assert.equal(out.gates.find((g) => g.id === 'offer').state, 'active');
});

test('resolveWorkflowReadout: offert signerad → signed, offer gate klar', () => {
  const out = resolveWorkflowReadout({
    commercialCase: {
      quoteStatus: 'accepted',
      esignStatus: 'accepted',
      quoteAcceptedAt: '2026-08-02T00:00:00Z',
    },
  });
  assert.equal(out.stageKey, 'signed');
  assert.equal(out.gates.find((g) => g.id === 'offer').state, 'done');
  assert.equal(out.gates.find((g) => g.id === 'agreement').state, 'active');
});

test('resolveWorkflowReadout: avtal signerat → pre_op', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    treatmentAgreement: { consentSigned: true, phase: 'signed' },
  });
  assert.equal(out.stageKey, 'pre_op');
  assert.equal(out.gates.find((g) => g.id === 'agreement').state, 'done');
  assert.equal(out.gates.find((g) => g.id === 'fitness').state, 'active');
});

test('resolveWorkflowReadout: kundresa vid behandling klar (treatment_done)', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    treatmentAgreement: { bookable: true },
    journey: {
      currentStep: 'treatment_done',
      completedSteps: ['treatment_offered', 'agreement_signed', 'treatment_booked'],
      updatedAt: '2026-08-05T00:00:00Z',
    },
  });
  assert.equal(out.stageKey, 'operation_done');
  assert.equal(out.gates.find((g) => g.id === 'operation').state, 'done');
  assert.equal(out.gates.find((g) => g.id === 'aftercare').state, 'active');
  assert.equal(out.journey.currentLabel, 'Behandling klar');
});

test('resolveWorkflowReadout: eftervård-d7 → aftercare', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    journey: {
      currentStep: 'aftercare_d7',
      updatedAt: '2026-08-10T00:00:00Z',
      steps: [
        { id: 'treatment_done', order: 8, state: 'completed' },
        { id: 'aftercare_d7', order: 9, state: 'current' },
      ],
    },
  });
  assert.equal(out.stageKey, 'aftercare');
  assert.equal(out.gates.find((g) => g.id === 'aftercare').state, 'active');
  assert.equal(out.journey.currentStep, 'aftercare_d7');
});

test('resolveWorkflowReadout: avslutat → completed, eftervård klar', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    journey: {
      currentStep: 'completed',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });
  assert.equal(out.stageKey, 'completed');
  assert.equal(out.gates.find((g) => g.id === 'aftercare').state, 'done');
});

test('resolveWorkflowReadout: sidoläge on_hold rapporteras', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    journey: {
      currentStep: 'treatment_booked',
      sideState: 'on_hold',
      updatedAt: '2026-08-05T00:00:00Z',
    },
  });
  assert.equal(out.sideState, 'on_hold');
});

test('journeyIsReal: default (updatedAt=null) är inte en verklig resa', () => {
  assert.equal(journeyIsReal({ currentStep: 'lead_first_contact', updatedAt: null }), false);
  assert.equal(
    journeyIsReal({ currentStep: 'lead_first_contact', updatedAt: '2026-01-01T00:00:00Z' }),
    true
  );
});

test('resolveWorkflowGates: op-klar kundresa låser inte eftervården', () => {
  const gates = resolveWorkflowGates({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    journey: { currentStep: 'treatment_done', updatedAt: '2026-08-05T00:00:00Z' },
  });
  const byId = Object.fromEntries(gates.map((g) => [g.id, g.state]));
  assert.equal(byId.offer, 'done');
  assert.equal(byId.operation, 'done');
  assert.equal(byId.aftercare, 'active');
});

test('resolveWorkflowGates: friskförsäkran signerad sätter fitness-gaten till Klar', () => {
  const gates = resolveWorkflowGates({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    treatmentAgreement: { bookable: true },
    fitnessCertificate: { signed: true, signedAt: '2026-08-06T00:00:00Z' },
  });
  assert.equal(gates.find((g) => g.id === 'fitness').state, 'done');
  assert.equal(gates.find((g) => g.id === 'fitness').status, 'Klar');
});

test('resolveWorkflowReadout: healthSigned/fitnessSigned flödar genom', () => {
  const out = resolveWorkflowReadout({
    commercialCase: { quoteStatus: 'accepted', esignStatus: 'accepted' },
    healthDeclaration: { signed: true },
    fitnessCertificate: { status: 'signed' },
  });
  assert.equal(out.healthSigned, true);
  assert.equal(out.fitnessSigned, true);
});

test('WORKFLOW_STAGES är ordnad och avslutas med completed', () => {
  assert.equal(WORKFLOW_STAGES[0].key, 'offer_draft');
  assert.equal(WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1].key, 'completed');
});
