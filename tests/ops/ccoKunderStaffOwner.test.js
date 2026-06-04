'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildActorStaffContext,
  buildStaffOwnerCandidates,
  computeMineMatchReport,
  resolveStaffOwnership,
} = require('../../src/ops/ccoKunderStaffOwner');

describe('ccoKunderStaffOwner', () => {
  it('builds candidates from session user', () => {
    const ctx = buildActorStaffContext(
      { email: 'egzona@hairtpclinic.com', name: 'Egzona Krasniqi' },
      { userId: 'u1', role: 'STAFF' }
    );
    const candidates = buildStaffOwnerCandidates(ctx);
    assert.ok(candidates.some((c) => c.source === 'email'));
    assert.ok(candidates.some((c) => c.value === 'Egzona Krasniqi'));
  });

  it('auto-resolves assignedOwner from email when owners exist', () => {
    const patients = [
      {
        id: 'p1',
        pipedrive: { owner: 'Egzona Krasniqi' },
        fileSummary: {},
        matchStatus: 'matched',
        flags: [],
        updatedAt: new Date().toISOString(),
      },
    ];
    const out = resolveStaffOwnership({
      actor: { email: 'egzona@hairtpclinic.com', userId: 'u1', role: 'STAFF' },
      user: { email: 'egzona@hairtpclinic.com', name: 'Egzona Krasniqi' },
      patients,
    });
    assert.equal(out.filterStatus, 'real');
    assert.ok(out.assignedOwner);
    assert.equal(out.mineCount, 1);
    assert.equal(out.matchRate, 1);
  });

  it('returns disabled when no owner fields on patients', () => {
    const out = resolveStaffOwnership({
      actor: { email: 'staff@hairtpclinic.com', userId: 'u2' },
      user: { email: 'staff@hairtpclinic.com' },
      patients: [
        {
          id: 'x',
          fileSummary: {},
          matchStatus: 'matched',
          flags: [],
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(out.filterStatus, 'disabled');
    assert.equal(out.assignedOwner, '');
    assert.equal(out.disabledReason, 'Kräver ägare per kund · P1');
  });

  it('computeMineMatchReport counts matches', () => {
    const patients = [
      { id: 'a', pipedrive: { owner: 'Anna Test' }, fileSummary: {} },
      { id: 'b', pipedrive: { owner: 'Other' }, fileSummary: {} },
    ];
    const report = computeMineMatchReport(patients, 'anna');
    assert.equal(report.mineCount, 1);
    assert.equal(report.matchRate, 0.5);
  });
});
