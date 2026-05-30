'use strict';

/**
 * P0.10 — generate-cutover-readiness-report.js test.
 *
 * Verifierar:
 *   - parseArgs default + flags
 *   - countCustomers räknar meridiqMeta/driveFolderId/duplicate/via
 *   - countJournalEntries räknar signed/locked/pdf
 *   - evaluateCriteria producerar 10 DoD-punkter
 *   - renderMarkdown innehåller alla 10 punkter + ingen PII
 *   - complianceCheck skyddar mot pnr/email/phone
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  countCustomers,
  countJournalEntries,
  countTemplates,
  evaluateCriteria,
  overallStatus,
  renderMarkdown,
  complianceCheck,
} = require('../../scripts/generate-cutover-readiness-report');

test('P0.10.1 — parseArgs default has date + tenant', () => {
  const args = parseArgs(['node', 'script']);
  assert.match(args.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(args.tenantId, 'hair_tp');
  assert.equal(args.stdout, false);
});

test('P0.10.2 — parseArgs respects --date and --stdout', () => {
  const args = parseArgs(['node', 'script', '--date=2026-05-30', '--stdout']);
  assert.equal(args.date, '2026-05-30');
  assert.equal(args.stdout, true);
});

test('P0.10.3 — countCustomers räknar meridiqMeta + via + dupes', () => {
  const customers = {
    tenants: {
      hair_tp: {
        customerState: {
          directory: {
            k1: { meridiqMeta: { hasJournal: true, via: 'email' }, driveFolderId: 'd1' },
            k2: { meridiqMeta: { hasJournal: true, via: 'phone' } },
            k3: { meridiqMeta: { hasJournal: false, via: 'name' } },
            k4: { noMeridiqJournal: true },
            k5: { duplicateCandidate: true, meridiqMeta: { via: 'new_from_meridiq' } },
          },
        },
      },
    },
  };
  const c = countCustomers(customers, 'hair_tp');
  assert.equal(c.total, 5);
  assert.equal(c.withMeridiq, 4);
  assert.equal(c.withDrive, 1);
  assert.equal(c.withMeridiqHasJournal, 2);
  assert.equal(c.noMeridiqJournal, 1);
  assert.equal(c.duplicateCandidate, 1);
  assert.equal(c.viaEmail, 1);
  assert.equal(c.viaPhone, 1);
  assert.equal(c.viaName, 1);
  assert.equal(c.viaNewFromMeridiq, 1);
});

test('P0.10.4 — countJournalEntries hanterar entriesByTenant-shape', () => {
  const journal = {
    entriesByTenant: {
      hairtpclinic: {
        entries: [
          { entryId: 'e1', status: 'signed', locked: true, pdfHash: 'h', patientId: 'p1' },
          { entryId: 'e2', status: 'draft', patientId: 'p2' },
          { entryId: 'e3', status: 'signed', locked: true, pdfHash: 'h', patientId: 'p1' },
        ],
      },
    },
  };
  const j = countJournalEntries(journal);
  assert.equal(j.total, 3);
  assert.equal(j.signed, 2);
  assert.equal(j.locked, 2);
  assert.equal(j.drafts, 1);
  assert.equal(j.withPdf, 2);
  assert.equal(j.uniquePatients, 2);
});

test('P0.10.5 — countTemplates groups by type', () => {
  const t = countTemplates({
    templates: [
      { type: 'consent' },
      { type: 'consent' },
      { type: 'patient_information' },
      { type: 'health_declaration' },
      { type: 'aftercare' },
    ],
  });
  assert.equal(t.total, 5);
  assert.equal(t.consents, 2);
  assert.equal(t.forms, 3); // patient_info + health_decl + aftercare
});

test('P0.10.6 — evaluateCriteria producerar 10 DoD-punkter', () => {
  const stats = {
    customers: {
      total: 100, withMeridiq: 90, withDrive: 0, withMeridiqHasJournal: 90,
      noMeridiqJournal: 10, duplicateCandidate: 5, viaName: 2,
      viaEmail: 50, viaPhone: 38, viaNewFromMeridiq: 0,
    },
    journal: {
      total: 10, signed: 5, locked: 5, drafts: 5, corrected: 0,
      withPdf: 5, withDriveFileId: 0, historicalImport: 0, uniquePatients: 5,
    },
    templates: { total: 50, byType: {}, consents: 30, forms: 20 },
    photos: { total: 0, byType: {}, bySource: {}, linkedToEncounter: 0 },
  };
  const dod = evaluateCriteria(stats);
  assert.equal(dod.length, 10);
  for (let i = 0; i < dod.length; i++) {
    assert.equal(dod[i].n, i + 1, `criterium ${i + 1} numbering`);
    assert.ok(['green', 'yellow', 'red'].includes(dod[i].status));
  }
  // Drive=0 → #1 ska vara yellow (meridiq finns men inte drive)
  assert.equal(dod[0].status, 'yellow');
  // Sign+lock+pdf finns → #6 ska vara green
  assert.equal(dod[5].status, 'green');
  // Photos=0 → #7 ska vara red
  assert.equal(dod[6].status, 'red');
});

test('P0.10.7 — overallStatus aggregerar korrekt', () => {
  const allGreen = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, status: 'green' }));
  assert.equal(overallStatus(allGreen), 'green');
  const allRed = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, status: 'red' }));
  assert.equal(overallStatus(allRed), 'red');
  const mostlyGreen = [...Array(8).fill({ status: 'green' }), { status: 'yellow' }, { status: 'yellow' }];
  assert.equal(overallStatus(mostlyGreen), 'yellow');
});

test('P0.10.8 — renderMarkdown innehåller alla 10 DoD-punkter', () => {
  const stats = {
    customers: { total: 100, withMeridiq: 90, withDrive: 0, withMeridiqHasJournal: 90, noMeridiqJournal: 10, duplicateCandidate: 5, viaName: 2, viaEmail: 50, viaPhone: 38, viaNewFromMeridiq: 0 },
    journal: { total: 10, signed: 5, locked: 5, drafts: 5, corrected: 0, withPdf: 5, withDriveFileId: 0, historicalImport: 0, uniquePatients: 5 },
    templates: { total: 50, byType: {}, consents: 30, forms: 20 },
    photos: { total: 0, byType: {}, bySource: {}, linkedToEncounter: 0 },
  };
  const dod = evaluateCriteria(stats);
  const md = renderMarkdown({
    date: '2026-05-30', tenantId: 'hair_tp', stats, dod,
    overall: overallStatus(dod), audit: { total: 100, byAction: { 'journal.read': 50 } },
  });
  for (let i = 1; i <= 10; i++) {
    assert.ok(md.includes(`#${i} —`), `missing criterium #${i}`);
  }
  assert.ok(md.includes('Overall readiness'));
  assert.ok(md.includes('Compliance-check'));
});

test('P0.10.9 — complianceCheck flaggar pnr/email/phone i body', () => {
  const v1 = complianceCheck('test 198007101234 patient');
  assert.ok(v1.length > 0, 'should detect 12-digit pnr');
  const v2 = complianceCheck('email: anna@example.se in body');
  assert.ok(v2.length > 0, 'should detect email');
  const v3 = complianceCheck('phone: +46701234567');
  assert.ok(v3.length > 0, 'should detect phone');
  const v4 = complianceCheck('counts: 7257 patients');
  assert.equal(v4.length, 0, 'plain counts ok');
  // regex-rad-undantag
  const v5 = complianceCheck('regex `\\d{6}-\\d{4}` → 0 träffar');
  assert.equal(v5.length, 0, 'regex-pattern documentation allowed');
});
