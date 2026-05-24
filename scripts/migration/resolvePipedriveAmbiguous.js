#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { resolveMigrationPaths } = require('./lib/migrationEnv');
const {
  discoverPipedriveCsvPair,
  normalizeEmail,
  parseCsv,
  phoneMatchKey,
} = require('./lib/migrationUtils');
const {
  normalizePipedrivePersonRecord,
  normalizePipedriveDealRecord,
  buildPipedrivePatientLookup,
  findPatientsForPipedrivePerson,
} = require('../../src/ops/ccoPatientMasterStore');

function parseArgs(argv) {
  const paths = resolveMigrationPaths();
  const args = {
    tenantId: paths.tenantId,
    patientMasterPath: paths.patientMasterPath,
    reviewPath: path.join(process.cwd(), 'migration/pipedrive/review-ambiguous-2026-05-24.json'),
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--review') args.reviewPath = argv[++i];
    else if (token === '--dry-run') args.dryRun = true;
  }
  return args;
}

function pickAutoCandidate(caseRow) {
  const withCliento = caseRow.candidates.filter((item) => item.hasCliento);
  if (withCliento.length === 1) {
    return { patientId: withCliento[0].id, reason: 'single_cliento_candidate' };
  }

  const pipedriveEmail = normalizeEmail(String(caseRow.emails || '').split(';')[0]);
  if (pipedriveEmail && caseRow.candidates.length === 2) {
    const exact = caseRow.candidates.filter(
      (item) => normalizeEmail(item.email) === pipedriveEmail
    );
    if (exact.length === 1) {
      return { patientId: exact[0].id, reason: 'exact_email_match' };
    }
  }

  const pipedrivePhone = phoneMatchKey(String(caseRow.phones || '').split(';')[0]);
  if (pipedrivePhone && caseRow.candidates.length === 2) {
    const exact = caseRow.candidates.filter(
      (item) => phoneMatchKey(item.phone) === pipedrivePhone
    );
    if (exact.length === 1) {
      return { patientId: exact[0].id, reason: 'exact_phone_match' };
    }
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const pair = discoverPipedriveCsvPair(process.cwd());
  if (!pair) throw new Error('Saknar migration/pipedrive/*.csv');

  const review = JSON.parse(fs.readFileSync(args.reviewPath, 'utf8'));
  const peopleRows = parseCsv(fs.readFileSync(pair.peoplePath, 'utf8'));
  const dealRows = parseCsv(fs.readFileSync(pair.dealsPath, 'utf8'));

  const peopleById = new Map();
  for (const row of peopleRows) {
    const person = normalizePipedrivePersonRecord(row);
    if (person.personId) peopleById.set(person.personId, person);
  }

  const dealsByPersonId = new Map();
  for (const row of dealRows) {
    const deal = normalizePipedriveDealRecord(row);
    if (!deal.contactPersonId) continue;
    if (!dealsByPersonId.has(deal.contactPersonId)) dealsByPersonId.set(deal.contactPersonId, []);
    dealsByPersonId.get(deal.contactPersonId).push(deal);
  }

  const store = await createCcoPatientMasterStore({ filePath: args.patientMasterPath });
  const list = await store.listPatients({ tenantId: args.tenantId, limit: 20000 });
  const patientById = new Map(list.patients.map((item) => [item.id, item]));

  const resolved = [];
  const manual = [];

  for (const caseRow of review.cases) {
    const pick = pickAutoCandidate(caseRow);
    if (!pick) {
      manual.push(caseRow);
      continue;
    }
    const person = peopleById.get(caseRow.pipedriveId);
    const patient = patientById.get(pick.patientId);
    if (!person || !patient) {
      manual.push({ ...caseRow, skipReason: 'missing_person_or_patient' });
      continue;
    }
    resolved.push({ caseRow, pick, person, patient });
  }

  if (!args.dryRun) {
    for (const { caseRow, pick, person, patient } of resolved) {
      const deals = dealsByPersonId.get(person.personId) || [];
      const methodEntry = caseRow.candidates.find((item) => item.id === pick.patientId);
      const confidence = methodEntry?.confidence || 0.9;
      const backfillPnr =
        !patient.personnummer && person.personnummer ? person.personnummer : patient.personnummer;

      let matchStatus = patient.matchStatus || 'cliento_only';
      if (patient.cliento && patient.drive) matchStatus = 'matched';
      else if (patient.cliento) matchStatus = 'matched';
      else if (patient.drive) matchStatus = 'matched';

      await store.upsertPatient({
        ...patient,
        tenantId: args.tenantId,
        personnummer: backfillPnr,
        displayName: patient.displayName || person.name,
        emails: [...new Set([...(patient.emails || []), ...person.emails])],
        phones: [...new Set([...(patient.phones || []), ...person.phones])],
        primaryEmail: patient.primaryEmail || person.primaryEmail,
        primaryPhone: patient.primaryPhone || person.primaryPhone,
        pipedrive: {
          source: 'pipedrive',
          personId: person.personId,
          name: person.name,
          firstName: person.firstName,
          lastName: person.lastName,
          emails: person.emails,
          phones: person.phones,
          organization: person.organization,
          owner: person.owner,
          matchMethod: methodEntry?.method || pick.reason,
          matchConfidence: confidence,
          resolveReason: pick.reason,
          deals,
          importedAt: new Date().toISOString(),
        },
        matchStatus,
        matchConfidence: Math.max(Number(patient.matchConfidence) || 0, confidence),
      });
    }
  }

  const manualPath = path.join(
    path.dirname(args.reviewPath),
    'review-ambiguous-manual-2026-05-24.json'
  );
  fs.writeFileSync(
    manualPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        manualCount: manual.length,
        cases: manual,
      },
      null,
      2
    )
  );

  const stats = await store.getTenantStats({ tenantId: args.tenantId });
  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        autoResolved: resolved.length,
        manualReviewRemaining: manual.length,
        manualPath,
        needsReviewNow: stats.needsReview,
        pipedriveLinked: stats.pipedriveLinked,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
