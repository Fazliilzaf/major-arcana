'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dedupeDataexportByKundId,
  evaluatePnrEnrichment,
  evaluatePnrEnrichmentRow,
  findPnrEnrichmentCandidates,
  buildPatientPnrEnrichmentPatch,
} = require('../../scripts/lib/enrichPatientMasterPnrFromDataexport');
const { buildClientoPatientLookup } = require('../../src/ops/clientoCustomerDeltaSync');

function patient(id, overrides = {}) {
  return {
    id,
    tenantId: 'hair-tp-clinic',
    personnummer: '',
    displayName: overrides.displayName || `Patient ${id}`,
    primaryEmail: overrides.primaryEmail || '',
    primaryPhone: overrides.primaryPhone || '',
    emails: overrides.emails || (overrides.primaryEmail ? [overrides.primaryEmail] : []),
    phones: overrides.phones || (overrides.primaryPhone ? [overrides.primaryPhone] : []),
    cliento: overrides.cliento || {},
    ...overrides,
  };
}

test('dedupeDataexportByKundId keeps one PNR per Kund-id and flags conflicts', () => {
  const rows = [
    { kundId: '1001', email: 'a@test.se', phone: '+46701111111', personnummer: '19900101-1234' },
    { kundId: '1001', email: 'a@test.se', phone: '+46701111111', personnummer: '19900101-1234' },
    { kundId: '1002', email: 'b@test.se', phone: '+46702222222', personnummer: '' },
    {
      kundId: '1003',
      email: 'c@test.se',
      phone: '+46703333333',
      personnummer: '19800202-5678',
    },
    {
      kundId: '1003',
      email: 'c@test.se',
      phone: '+46703333333',
      personnummer: '19900303-9999',
    },
  ];

  const { deduped, stats } = dedupeDataexportByKundId(rows);
  assert.equal(stats.uniqueKundIds, 3);
  assert.equal(stats.dedupedWithPnr, 1);
  assert.equal(stats.noValidPnr, 1);
  assert.equal(stats.kundIdPnrConflict, 1);

  const byKund = Object.fromEntries(deduped.map((row) => [row.kundId, row]));
  assert.equal(byKund['1001'].dedupeStatus, 'ok');
  assert.equal(byKund['1001'].personnummer, '19900101-1234');
  assert.equal(byKund['1002'].dedupeStatus, 'no_valid_pnr');
  assert.equal(byKund['1003'].dedupeStatus, 'kund_id_pnr_conflict');
});

test('findPnrEnrichmentCandidates prefers clientoId over email and phone', () => {
  const patients = [
    patient('p-cliento', {
      primaryEmail: 'shared@test.se',
      cliento: { clientoId: '9001' },
    }),
    patient('p-email', { primaryEmail: 'shared@test.se' }),
    patient('p-phone', { primaryPhone: '+46704444444' }),
  ];
  const lookup = buildClientoPatientLookup(patients);

  const byCliento = findPnrEnrichmentCandidates(lookup, {
    kundId: '9001',
    email: 'shared@test.se',
    phone: '+46704444444',
  });
  assert.equal(byCliento.length, 3);
  assert.equal(byCliento[0].patientId, 'p-cliento');
  assert.equal(byCliento[0].method, 'clientoId');
});

test('evaluatePnrEnrichment requires exactly one candidate and skips unsafe cases', () => {
  const patients = [
    patient('target-a', { primaryEmail: 'match-a@test.se' }),
    patient('target-b', { primaryEmail: 'match-b@test.se' }),
    patient('has-pnr', {
      primaryEmail: 'has-pnr@test.se',
      personnummer: '19881212-3456',
    }),
    patient('pnr-owner', { personnummer: '19771111-2222' }),
  ];

  const { summary, enrichments } = evaluatePnrEnrichment({
    dedupedRows: [
      {
        kundId: '2001',
        email: 'match-a@test.se',
        phone: '',
        personnummer: '19910404-1111',
        dedupeStatus: 'ok',
      },
      {
        kundId: '2002',
        email: 'ambiguous@test.se',
        phone: '',
        personnummer: '19910505-2222',
        dedupeStatus: 'ok',
      },
      {
        kundId: '2003',
        email: 'has-pnr@test.se',
        phone: '',
        personnummer: '19910606-3333',
        dedupeStatus: 'ok',
      },
      {
        kundId: '2004',
        email: 'match-b@test.se',
        phone: '',
        personnummer: '19771111-2222',
        dedupeStatus: 'ok',
      },
      {
        kundId: '2005',
        email: '',
        phone: '',
        personnummer: '',
        dedupeStatus: 'no_valid_pnr',
      },
    ],
    patients: [
      ...patients,
      patient('target-ambiguous-a', { primaryEmail: 'ambiguous@test.se' }),
      patient('target-ambiguous-b', { primaryEmail: 'ambiguous@test.se' }),
    ],
  });

  assert.equal(summary.wouldEnrich, 1);
  assert.equal(summary.ambiguous, 1);
  assert.equal(summary.skipAlreadyHasPnr, 1);
  assert.equal(summary.skipPnrConflict, 1);
  assert.equal(summary.skipNoValidPnr, 1);
  assert.equal(enrichments[0].patientId, 'target-a');
  assert.equal(enrichments[0].matchMethod, 'email');
});

test('evaluatePnrEnrichmentRow matches on phone when email absent', () => {
  const patients = [patient('phone-target', { primaryPhone: '+46705556666' })];
  const lookup = buildClientoPatientLookup(patients);
  const result = evaluatePnrEnrichmentRow(lookup, {
    kundId: '3001',
    email: '',
    phone: '+46705556666',
    personnummer: '19910707-4444',
    dedupeStatus: 'ok',
  });
  assert.equal(result.outcome, 'would_enrich');
  assert.equal(result.matchMethod, 'phone');
});

test('buildPatientPnrEnrichmentPatch sets personnummer, clientoId and metadata', () => {
  const patch = buildPatientPnrEnrichmentPatch(
    { id: 'p1', displayName: 'Test', cliento: { source: 'cliento' }, metadata: { existing: true } },
    { kundId: '4001', personnummer: '19910808-5555' }
  );
  assert.equal(patch.personnummer, '19910808-5555');
  assert.equal(patch.cliento.clientoId, '4001');
  assert.equal(patch.cliento.source, 'cliento');
  assert.equal(patch.metadata.pnrSource, 'cliento_dataexport');
  assert.ok(patch.metadata.pnrEnrichedAt);
  assert.equal(patch.metadata.existing, true);
});
