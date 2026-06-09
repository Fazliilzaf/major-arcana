'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  enrichJournalEntriesWithMetadata,
  resolveJournalDate,
} = require('../../src/ops/ccoJournalMetadataEnrichment');

describe('ccoJournalMetadataEnrichment', () => {
  it('uses booking fallback for Drive-imported journal treater on matching real date', () => {
    const entries = [
      {
        entryId: 'j1',
        journalType: 'historical_import',
        source: 'drive_import',
        title: 'Journal Kumi 2024-01-10.pdf',
        signedAt: '2026-05-24T10:00:00.000Z',
        signedByName: 'Drive-import',
        importMeta: { importKey: 'December TP 2023 Begum/2024-01-10 Journal Kumi.pdf' },
      },
    ];
    const out = enrichJournalEntriesWithMetadata({
      journalEntries: entries,
      bookings: [
        {
          startsAt: '2024-01-10T08:00:00.000Z',
          serviceName: 'TP behandling',
          staff: 'Egzona',
        },
      ],
    });
    assert.equal(out[0].journalDateReal, '2024-01-10');
    assert.equal(out[0].treater, 'Egzona');
    assert.equal(out[0].treatmentType, 'TP behandling');
    assert.equal(out[0].journalStep, null);
    assert.equal(out[0].journalMetadataSource.treater, 'booking_fallback');
  });

  it('keeps existing journal metadata and does not invent missing step', () => {
    const out = enrichJournalEntriesWithMetadata({
      journalEntries: [
        {
          entryId: 'j2',
          journalType: 'tp_treatment',
          signedAt: '2026-06-01T09:00:00.000Z',
          signedByName: 'Fazli',
          fields: { journeyStep: '5', treatmentType: 'DHI' },
        },
      ],
      bookings: [],
    });
    assert.equal(out[0].journalDateReal, '2026-06-01');
    assert.equal(out[0].treater, 'Fazli');
    assert.equal(out[0].treatmentType, 'DHI');
    assert.equal(out[0].journalStep, '5');
    assert.equal(out[0].journalMetadataSource.journalStep, 'journal');
  });

  it('does not use Drive import signedAt as real journal date', () => {
    assert.equal(
      resolveJournalDate({
        source: 'drive_import',
        title: 'Journal utan datum.pdf',
        signedAt: '2026-05-24T10:00:00.000Z',
      }),
      ''
    );
  });
});
