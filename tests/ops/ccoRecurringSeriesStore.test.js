'use strict';

/**
 * CCO Recurring Series Store — Block 4 (WORKFLOW-IN-I-CCO-TODO-2026-08-26).
 *
 * Håller ihop:
 *   4.1  Persistering av serien + "riktiga reservationer" i bokningsmotorn.
 *   4.2  Föreslå followup-transplant-serien vid transplantation (förslag,
 *        inte bokning).
 *   4.3  Koppla PRP-serierna till samma väg.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoRecurringSeriesStore } = require('../../src/ops/ccoRecurringSeriesStore');
const {
  findSeriesTemplatesForJournal,
  SERIES_TEMPLATES,
} = require('../../src/ops/recurringBookings');

function tmpPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-recurring-'));
  return path.join(dir, 'series.json');
}

test('journal-matchn: transplantation → followup-transplant, PRP → respektive serie', () => {
  assert.deepEqual(
    findSeriesTemplatesForJournal(['tp_treatment', 'fue']).map((t) => t.templateId),
    ['followup-transplant']
  );
  assert.deepEqual(
    findSeriesTemplatesForJournal(['prp_treatment', 'prp_hair']).map((t) => t.templateId),
    ['prp-hair-3']
  );
  assert.deepEqual(
    findSeriesTemplatesForJournal(['prp_treatment', 'prp-skin']).map((t) => t.templateId),
    ['prp-skin-3']
  );
  // Generisk journalTyp ska inte träffa allt på en gång — specifik nyckel krävs.
  assert.deepEqual(findSeriesTemplatesForJournal(['prp_treatment']), []);
  assert.deepEqual(findSeriesTemplatesForJournal(['botox']), []);
});

test('followup-transplant-mallen börjar 4 månader (17 veckor) efter op-dagen', () => {
  const template = SERIES_TEMPLATES.find((t) => t.templateId === 'followup-transplant');
  assert.equal(template.count, 3);
  assert.equal(template.intervalWeeks, 17);
  assert.equal(template.firstOccurrenceOffsetWeeks, 17);
  assert.ok(template.suggestOnTreatmentKeys.includes('fue'));
});

test('Väg A — createSeries sparar serien och skriver riktiga reservationer', async () => {
  let engineInput = null;
  const bookingEngineStore = {
    upsertSeriesReservations: async (input) => {
      engineInput = input;
      return input.occurrences.map((occ) => ({ reservationId: `r:${occ.occurrenceId}` }));
    },
  };
  const store = await createCcoRecurringSeriesStore({
    filePath: tmpPath(),
    bookingEngineStore,
    tenantId: 'hair-tp-clinic',
  });

  const result = await store.createSeries({
    tenantId: 'hair-tp-clinic',
    conversationId: 'conv-1',
    templateId: 'prp-hair-3',
    patientId: 'p-123',
    patientName: 'Anna Test',
    customerEmail: 'anna.test@example.com',
    resourceId: 'veronica',
    startDate: '2026-09-01',
  });

  assert.equal(result.series.seriesId, result.series.seriesId);
  assert.equal(result.series.status, 'active');
  assert.equal(result.series.templateId, 'prp-hair-3');
  assert.equal(result.series.occurrences.length, 3);
  assert.equal(result.series.occurrences[0].status, 'ready_to_book');
  assert.equal(result.reservations.length, 3);
  // Bokningsmotorn fick en reservation per tillfälle, märkt med serie-id.
  assert.equal(engineInput.seriesId, result.series.seriesId);
  assert.equal(engineInput.occurrences.length, 3);
  assert.match(engineInput.occurrences[0].scheduledDate, /^\d{4}-\d{2}-\d{2}$/);

  // Serien finns sedan kvar (persisterad).
  const fetched = store.getSeries(result.series.seriesId);
  assert.equal(fetched.templateId, 'prp-hair-3');
});

test('Väg B — suggestSeriesFromJournal bygger förslag (inte bokning)', async () => {
  let engineCalled = false;
  const bookingEngineStore = {
    upsertSeriesReservations: async () => {
      engineCalled = true;
      return [];
    },
  };
  const store = await createCcoRecurringSeriesStore({
    filePath: tmpPath(),
    bookingEngineStore,
    tenantId: 'hair-tp-clinic',
  });

  const opDate = '2026-05-20';
  const result = await store.suggestSeriesFromJournal({
    tenantId: 'hair-tp-clinic',
    journalType: 'tp_treatment',
    treatmentKey: 'fue',
    serviceId: 'fue',
    patientId: 'p-456',
    patientName: 'Bedir Test',
    startDate: opDate,
  });

  assert.equal(result.matched, 1);
  const suggestion = result.suggestions[0];
  assert.equal(suggestion.templateId, 'followup-transplant');
  assert.equal(suggestion.mode, 'suggest');
  assert.equal(suggestion.status, 'suggested');
  assert.equal(suggestion.occurrences.length, 3);
  // Alla tillfällen är 'planned' — inget 'ready_to_book' som skulle boka.
  assert.ok(suggestion.occurrences.every((o) => o.status === 'planned'));
  // Första tillfället ligger 4 månader efter op-dagen.
  assert.equal(suggestion.occurrences[0].scheduledDate, '2026-09-16');
  // Förslag skriver aldrig ut som bokning i motorn.
  assert.equal(engineCalled, false);
});

test('PRP-journalföring föreslår respektive PRP-serie', async () => {
  const store = await createCcoRecurringSeriesStore({ filePath: tmpPath() });

  const hair = await store.suggestSeriesFromJournal({
    journalType: 'prp_treatment',
    treatmentKey: 'prp_hair',
    serviceId: 'prp-hair',
    patientId: 'p-a',
    patientName: 'A',
    startDate: '2026-08-01',
  });
  assert.deepEqual(
    hair.suggestions.map((s) => s.templateId),
    ['prp-hair-3']
  );

  const skin = await store.suggestSeriesFromJournal({
    journalType: 'prp_treatment',
    treatmentKey: 'prp_skin',
    serviceId: 'prp-skin',
    patientId: 'p-b',
    patientName: 'B',
    startDate: '2026-08-01',
  });
  assert.deepEqual(
    skin.suggestions.map((s) => s.templateId),
    ['prp-skin-3']
  );
});

test('samma journalpost föreslås inte dubbelt (idempotent på källa)', async () => {
  const store = await createCcoRecurringSeriesStore({ filePath: tmpPath() });
  const input = {
    journalType: 'tp_treatment',
    treatmentKey: 'fue',
    patientId: 'p-dup',
    patientName: 'Dubbel',
    startDate: '2026-06-01',
    sourceEncounterId: 'enc-1',
  };
  const first = await store.suggestSeriesFromJournal(input);
  assert.equal(first.suggestions.length, 1);
  const second = await store.suggestSeriesFromJournal(input);
  assert.equal(second.suggestions.length, 1);
  // Ingen ny serie skapades — samma serieId.
  assert.equal(second.suggestions[0].seriesId, first.suggestions[0].seriesId);
});

test('markOccurrenceBooked lämnar föreslagsvägen och blir aktiv serie', async () => {
  const store = await createCcoRecurringSeriesStore({ filePath: tmpPath() });
  const result = await store.suggestSeriesFromJournal({
    journalType: 'tp_treatment',
    treatmentKey: 'fue',
    patientId: 'p-789',
    patientName: 'C',
    startDate: '2026-06-01',
  });

  const series = result.suggestions[0];
  const firstOcc = series.occurrences[0];
  const res = await store.markOccurrenceBooked(series.seriesId, firstOcc.occurrenceId, 'bk-1');
  assert.equal(res.series.status, 'active');
  assert.equal(res.occurrence.status, 'booked');
  assert.equal(res.occurrence.bookingId, 'bk-1');
  // Nästa tillfälle blir redo att bokas.
  const got = store.getSeries(series.seriesId);
  assert.equal(got.occurrences[1].status, 'ready_to_book');
});
