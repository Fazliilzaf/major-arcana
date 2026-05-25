'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FOLLOWUP_VARIANT_BY_MONTH,
  addMonthsUtc,
  isTransplantEncounter,
  planFollowupDrafts,
} = require('../../src/ops/ccoFollowupDraftPlanner');

test('addMonthsUtc lägger till månader korrekt (utan att hoppa över halvmånad)', () => {
  const base = new Date('2026-01-15T08:00:00.000Z');
  assert.equal(addMonthsUtc(base, 4).toISOString().slice(0, 7), '2026-05');
  assert.equal(addMonthsUtc(base, 6).toISOString().slice(0, 7), '2026-07');
  assert.equal(addMonthsUtc(base, 12).toISOString().slice(0, 7), '2027-01');
});

test('isTransplantEncounter accepterar transplant + tp_treatment + hairtransplant', () => {
  assert.equal(isTransplantEncounter({ type: 'transplant' }), true);
  assert.equal(isTransplantEncounter({ type: 'tp_treatment' }), true);
  assert.equal(isTransplantEncounter({ type: 'hair_transplant' }), true);
  assert.equal(isTransplantEncounter({ type: 'prp_treatment' }), false);
  assert.equal(isTransplantEncounter({ type: '' }), false);
});

test('planFollowupDrafts planerar 4/6/12 mån för en signerad transplant', () => {
  const signedAt = '2025-06-01T08:00:00.000Z';
  const today = '2027-01-01T00:00:00.000Z';
  const plan = planFollowupDrafts({
    signedEncounters: [
      {
        encounterId: 'enc-1',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'transplant',
        signedAt,
      },
    ],
    existingFollowups: [],
    plannedState: [],
    today,
    leadDays: 30,
    tenantId: 'tenant-a',
  });
  assert.equal(plan.transplantCount, 1);
  assert.equal(plan.plannedCount, 3);
  const months = plan.planned.filter((row) => row.status === 'planned').map((row) => row.followupMonth);
  assert.deepEqual(months.sort((a, b) => a - b), [4, 6, 12]);
  for (const row of plan.planned) {
    assert.equal(row.formVariant, FOLLOWUP_VARIANT_BY_MONTH[row.followupMonth]);
    assert.equal(row.journalType, 'follow_up');
    assert.equal(row.patientId, 'pat-1');
    assert.equal(row.encounterId, 'enc-1');
  }
});

test('planFollowupDrafts skippar månader där follow-up redan finns', () => {
  const signedAt = '2025-06-01T08:00:00.000Z';
  const today = '2027-01-01T00:00:00.000Z';
  const plan = planFollowupDrafts({
    signedEncounters: [
      {
        encounterId: 'enc-1',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'tp_treatment',
        signedAt,
      },
    ],
    existingFollowups: [
      { treatmentEncounterId: 'enc-1', formVariant: '4_manader', locked: false },
      { treatmentEncounterId: 'enc-1', formVariant: '12_manader', locked: true },
    ],
    plannedState: [],
    today,
    tenantId: 'tenant-a',
  });
  assert.equal(plan.plannedCount, 1);
  assert.equal(plan.skippedExistingCount, 2);
  const plannedMonths = plan.planned
    .filter((row) => row.status === 'planned')
    .map((row) => row.followupMonth);
  assert.deepEqual(plannedMonths, [6]);
});

test('planFollowupDrafts är idempotent — prior plannedState ⇒ skipped_already_planned', () => {
  const signedAt = '2025-06-01T08:00:00.000Z';
  const today = '2027-01-01T00:00:00.000Z';
  const plan = planFollowupDrafts({
    signedEncounters: [
      {
        encounterId: 'enc-1',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'transplant',
        signedAt,
      },
    ],
    existingFollowups: [],
    plannedState: [
      { tenantId: 'tenant-a', encounterId: 'enc-1', followupMonth: 4, plannedAt: today },
    ],
    today,
    tenantId: 'tenant-a',
  });
  assert.equal(plan.plannedCount, 2);
  assert.equal(plan.skippedAlreadyPlannedCount, 1);
  const months = plan.planned
    .filter((row) => row.status === 'planned')
    .map((row) => row.followupMonth)
    .sort((a, b) => a - b);
  assert.deepEqual(months, [6, 12]);
});

test('planFollowupDrafts ignorerar encounters som inte är transplant', () => {
  const plan = planFollowupDrafts({
    signedEncounters: [
      {
        encounterId: 'enc-prp',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'prp_treatment',
        signedAt: '2025-06-01T08:00:00.000Z',
      },
      {
        encounterId: 'enc-tp',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'transplant',
        signedAt: '2025-06-01T08:00:00.000Z',
      },
    ],
    today: '2027-01-01T00:00:00.000Z',
    tenantId: 'tenant-a',
  });
  assert.equal(plan.transplantCount, 1);
  assert.equal(plan.plannedCount, 3);
  assert.ok(plan.planned.every((row) => row.encounterId === 'enc-tp'));
});

test('planFollowupDrafts hoppar över månader som ligger bortom horizon', () => {
  // Signerad nyligen — 12-mån-uppföljning ska inte planeras nu.
  const today = '2026-05-25T00:00:00.000Z';
  const signedAt = '2026-05-01T08:00:00.000Z';
  const plan = planFollowupDrafts({
    signedEncounters: [
      {
        encounterId: 'enc-1',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'transplant',
        signedAt,
      },
    ],
    today,
    leadDays: 30,
    tenantId: 'tenant-a',
  });
  // dueDate +4 = 2026-09 → > today+30 ⇒ ingen plan
  assert.equal(plan.plannedCount, 0);
});

test('planFollowupDrafts respekterar tenantId-filter', () => {
  const today = '2027-01-01T00:00:00.000Z';
  const plan = planFollowupDrafts({
    signedEncounters: [
      {
        encounterId: 'enc-1',
        patientId: 'pat-1',
        tenantId: 'tenant-a',
        type: 'transplant',
        signedAt: '2025-06-01T08:00:00.000Z',
      },
      {
        encounterId: 'enc-2',
        patientId: 'pat-2',
        tenantId: 'tenant-b',
        type: 'transplant',
        signedAt: '2025-06-01T08:00:00.000Z',
      },
    ],
    today,
    tenantId: 'tenant-a',
  });
  assert.equal(plan.transplantCount, 1);
  assert.equal(plan.plannedCount, 3);
  assert.ok(plan.planned.every((row) => row.tenantId === 'tenant-a'));
});
