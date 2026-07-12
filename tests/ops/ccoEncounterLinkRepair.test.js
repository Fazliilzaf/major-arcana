'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEncounterLinkRepairPlan,
  previewEncounterLinkRepair,
} = require('../../src/ops/ccoEncounterLinkRepair');

test('buildEncounterLinkRepairPlan behåller omaskerade länkar endast internt', () => {
  const patientInputs = [
    {
      patientId: 'patient-raw',
      assets: [
        {
          id: 'asset-raw',
          patientId: 'patient-raw',
          status: 'VISIBLE_ON_PATIENT_CARD',
          mimeType: 'image/jpeg',
          documentDate: '2026-07-12',
        },
      ],
      bookings: [
        {
          patientId: 'patient-raw',
          encounterId: 'encounter-raw',
          startsAt: '2026-07-12T10:00:00.000Z',
          encounterType: 'consultation',
        },
      ],
    },
  ];
  const plan = buildEncounterLinkRepairPlan({ patientInputs });
  assert.equal(plan.linkable.length, 1);
  assert.equal(plan.linkable[0].assetId, 'asset-raw');
  assert.equal(plan.linkable[0].encounterId, 'encounter-raw');
});

test('previewEncounterLinkRepair föreslår exakt ett date-only-foto utan writes', () => {
  const report = previewEncounterLinkRepair({
    patientInputs: [
      {
        patientId: 'canonical-patient-1',
        journalEntries: [
          {
            patientId: 'canonical-patient-1',
            treatmentDate: '2026-05-05',
            journalType: 'consultation',
          },
        ],
        assets: [
          {
            id: 'asset-photo-1',
            patientId: 'cliento-asset-1',
            mimeType: 'image/jpeg',
            originalFileName: 'IMG_0001.jpg',
            documentDate: '2026-05-05',
            status: 'VISIBLE_ON_PATIENT_CARD',
          },
        ],
      },
    ],
    sampleSize: 5,
  });

  assert.equal(report.zeroWrites, true);
  assert.equal(report.stats.missingEncounterId, 1);
  assert.equal(report.stats.linkable, 1);
  assert.equal(report.stats.linkableMedium, 1);
  assert.equal(report.stats.review, 0);
  assert.equal(report.samples.length, 1);
  assert.equal(report.samples[0].confidence, 'medium');
  assert.equal(report.samples[0].reason, 'date_only');
  assert.ok(report.samples[0].proposedEncounterId);
  assert.match(report.samples[0].patientId, /\*\*\*/);
});

test('previewEncounterLinkRepair skickar tvetydig foto-matchning till review', () => {
  const report = previewEncounterLinkRepair({
    patientInputs: [
      {
        patientId: 'canonical-patient-1',
        journalEntries: [
          { patientId: 'canonical-patient-1', treatmentDate: '2026-05-05', journalType: 'prp' },
          {
            patientId: 'canonical-patient-1',
            treatmentDate: '2026-05-05',
            journalType: 'consultation',
          },
        ],
        assets: [
          {
            id: 'asset-photo-1',
            patientId: 'cliento-asset-1',
            mimeType: 'image/jpeg',
            originalFileName: 'IMG_0001.jpg',
            documentDate: '2026-05-05',
            status: 'VISIBLE_ON_PATIENT_CARD',
          },
        ],
      },
    ],
  });

  assert.equal(report.stats.linkable, 0);
  assert.equal(report.stats.review, 1);
  assert.equal(report.samples[0].reason, 'ambiguous_date');
  assert.equal(report.samples[0].proposedEncounterId, null);
  assert.equal(report.samples[0].candidateDetails.length, 2);
  assert.deepEqual(
    report.samples[0].candidateDetails.map((candidate) => candidate.encounterType).sort(),
    ['consultation', 'prp_hair']
  );
  assert.ok(report.samples[0].candidateDetails.every((candidate) => /\*\*\*/.test(candidate.encounterId)));
});

test('redan länkade media räknas men föreslås inte igen', () => {
  const report = previewEncounterLinkRepair({
    patientInputs: [
      {
        patientId: 'canonical-patient-1',
        assets: [
          {
            id: 'asset-photo-1',
            patientId: 'canonical-patient-1',
            mimeType: 'image/jpeg',
            originalFileName: 'IMG_0001.jpg',
            documentDate: '2026-05-05',
            encounterId: 'existing-encounter',
            status: 'VISIBLE_ON_PATIENT_CARD',
          },
        ],
      },
    ],
  });

  assert.equal(report.stats.alreadyLinked, 1);
  assert.equal(report.stats.missingEncounterId, 0);
  assert.equal(report.stats.linkable, 0);
});
