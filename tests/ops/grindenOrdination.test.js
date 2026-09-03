'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertOperationDayJournalAllowed,
  resolveOrdinationForTodayVisit,
} = require('../../src/ops/ccoOperationDayGate');
const { KRAVER } = require('../../src/ops/ordinationRequirement');

/**
 * ORD-188 — GRINDEN. Inget ingrepp utan godkänd ordination.
 *
 * Allt som byggts i läkarkedjan fram till nu är SYNLIGHET: ordinationskravet per
 * tjänst (ORD-177), ärendet som skapas vid bekräftelse (ORD-179),
 * T−14-fönstret (ORD-180), avbokningen som släcker godkännandet (ORD-171),
 * underlagshashen (ORD-172). Alla svarar på "vad borde hända". Ingen hindrar
 * något.
 *
 * assertOperationDayJournalAllowed är det enda stället som säger nej.
 *
 * PÅ OPERATIONSDAGEN, INTE VID BOKNINGEN. Ordinationen godkänns två veckor före
 * ingreppet, alltså långt efter att tiden bokats. Att kräva ett godkännande vid
 * bokningen hade varit att kräva ett beslut om något som inte finns än.
 *
 * OCH DEN ÄR AVSTÄNGD. Att slå på den i dag hade stoppat kliniken — se testerna
 * längst ned. Det är ett val, inte ett förbiseende, och det syns i utfallet.
 */

const bas = { journalType: 'tp_treatment', todayVisit: true, fitnessSigned: true };

test('godkänd ordination släpper igenom', () => {
  const r = assertOperationDayJournalAllowed({ ...bas, ordinationApproved: true });
  assert.equal(r.allowed, true);
});

test('utan godkännande NEKAS ingreppet', () => {
  const r = assertOperationDayJournalAllowed({ ...bas, ordinationApproved: false });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'operation_day_ordination_required');
  assert.match(r.message, /inte godkänt/);
});

test('OKÄNT ordinationsläge nekar också — tystnad är inte ja', () => {
  // Kärnan. Ett okänt läge betyder att någon länk i kedjan inte svarade:
  // ärendet saknas, storen är nere, tjänsten är oklassificerad. Att tolka
  // tystnad som ja vore att låta ett tekniskt fel bli ett medicinskt beslut.
  const r = assertOperationDayJournalAllowed({ ...bas, ordinationApproved: null });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'operation_day_ordination_unknown');
  assert.match(r.message, /kunde inte fastställas/);
});

test('default är okänt, alltså nekande', () => {
  // Ett anrop som inte skickar ordinationsläge får inte råka godkänna.
  const r = assertOperationDayJournalAllowed(bas);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'operation_day_ordination_unknown');
});

test('friskförsäkran prövas FÖRE ordinationen', () => {
  // Ordningen spelar roll för meddelandet: saknas båda ska personalen få veta
  // det som går att åtgärda först, inte det som kräver läkaren.
  const r = assertOperationDayJournalAllowed({
    ...bas,
    fitnessSigned: false,
    ordinationApproved: false,
  });
  assert.equal(r.reason, 'operation_day_fitness_required');
});

test('en tjänst som inte kräver ordination släpps igenom', () => {
  // Bara ett BESLUTAT nej öppnar. `null` gör det inte — samma princip som i
  // hela kedjan.
  const r = assertOperationDayJournalAllowed({
    ...bas,
    ordinationRequired: false,
    ordinationApproved: null,
  });
  assert.equal(r.allowed, true);
});

test('grinden rör inte journaltyper som inte är ingrepp', () => {
  for (const journalType of ['prp_treatment', 'follow_up', 'health_declaration']) {
    const r = assertOperationDayJournalAllowed({
      journalType,
      todayVisit: true,
      fitnessSigned: false,
      ordinationApproved: false,
    });
    assert.equal(r.allowed, true, `${journalType} ska inte grindas`);
  }
});

test('grinden rör inte en dag utan besök', () => {
  const r = assertOperationDayJournalAllowed({
    ...bas,
    todayVisit: false,
    ordinationApproved: false,
  });
  assert.equal(r.allowed, true);
});

/* ── varför grinden är avstängd ────────────────────────────────────── */

const idag = () => new Date().toISOString();
const arende = (extra = {}) => ({
  id: 'c1',
  tenantId: 'hair-tp-clinic',
  serviceId: 'fue',
  startsAt: idag(),
  ...extra,
});

async function medGrind(pa, run) {
  const tidigare = process.env.ARCANA_ORDINATIONSGRIND_ENABLED;
  if (pa) process.env.ARCANA_ORDINATIONSGRIND_ENABLED = 'true';
  else delete process.env.ARCANA_ORDINATIONSGRIND_ENABLED;
  try {
    await run();
  } finally {
    if (tidigare === undefined) delete process.env.ARCANA_ORDINATIONSGRIND_ENABLED;
    else process.env.ARCANA_ORDINATIONSGRIND_ENABLED = tidigare;
  }
}

test('AVSTÄNGD som standard — påslagen hade stoppat kliniken i morgon', async () => {
  // TVÅ MÄTTA SKÄL:
  //
  // 1. Journalvägen (ccoJournal.js) fick `ccoBookingStore` — den KOMMERSIELLA
  //    storen med 369 triage-ärenden. Ordinationsbesluten bor i
  //    ccoBookingCaseStore, den KLINISKA. Läser grinden fel store hittar den
  //    aldrig ett godkännande och nekar allt. Rättat: den tar bookingCaseStore.
  //
  // 2. Den kliniska storen är TOM i prod. Ärenden skapas först från ORD-179,
  //    vid bekräftelse — inga befintliga bokningar har ett. En fail-closed
  //    grind hade alltså nekat varje operationsjournal.
  //
  // Att slå på den innan kedjan producerar ärenden vore att förväxla "vi vet
  // inte" med "det är fel".
  await medGrind(false, async () => {
    const r = await resolveOrdinationForTodayVisit({
      patient: { primaryEmail: 'kund@example.com' },
      bookingCaseStore: null,
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(r.approved, true, 'avstängd grind blockerar inte');
    assert.equal(r.gateOff, true, 'men det ska SYNAS att den var av');
  });
});

test('påslagen grind nekar när ärendet saknas', async () => {
  await medGrind(true, async () => {
    const r = await resolveOrdinationForTodayVisit({
      patient: { primaryEmail: 'kund@example.com' },
      bookingCaseStore: { listCases: async () => [] },
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(r.approved, null, 'inget ärende = vi vet inte');
    assert.equal(r.required, true);
  });
});

test('påslagen grind godkänner ett godkänt ärende', async () => {
  await medGrind(true, async () => {
    const r = await resolveOrdinationForTodayVisit({
      patient: { primaryEmail: 'kund@example.com' },
      bookingCaseStore: {
        listCases: async () => [arende({ ordinationReview: { status: 'approved' } })],
      },
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(r.approved, true);
  });
});

test('ett SLÄCKT godkännande räknas inte som godkänt', async () => {
  // ORD-171: avbokad tid sätter status 'lapsed'. Det är inte ett ja.
  await medGrind(true, async () => {
    const r = await resolveOrdinationForTodayVisit({
      patient: { primaryEmail: 'kund@example.com' },
      bookingCaseStore: {
        listCases: async () => [arende({ ordinationReview: { status: 'lapsed' } })],
      },
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(r.approved, false);
  });
});

test('en trasig store nekar, den godkänner inte', async () => {
  await medGrind(true, async () => {
    const r = await resolveOrdinationForTodayVisit({
      patient: { primaryEmail: 'kund@example.com' },
      bookingCaseStore: {
        listCases: async () => {
          throw new Error('storen är nere');
        },
      },
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(r.approved, null);
  });
});

test('ett enda oklassificerat ärende bland dagens gör läget okänt', async () => {
  // bleph-upper står som ej beslutad i facit. Ett null bland dagens ärenden
  // räcker för att vi inte vet — och då nekar grinden.
  await medGrind(true, async () => {
    const r = await resolveOrdinationForTodayVisit({
      patient: { primaryEmail: 'kund@example.com' },
      bookingCaseStore: {
        listCases: async () => [
          arende({ ordinationReview: { status: 'approved' } }),
          arende({ id: 'c2', serviceId: 'bleph-upper' }),
        ],
      },
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(r.approved, null);
  });
});

/* ── behandlingsavtalsgrindens lista ───────────────────────────────── */

test('behandlingsavtalet krävs för ALLA ingrepp, även de som tillkom i dag', () => {
  // HÄR STOD EN HÅRDKODAD LISTA: fue, dhi, beard, eyebrow. Den var riktig när
  // den skrevs och blev fel samma dag jag lade till tre ingrepp till —
  // fue-scar, dhi-scar (ORD-177) och dhi-beard (ORD-178). Ingen av dem hamnade
  // i listan, eftersom ingenting kopplade ihop de två ställena. Tre ingrepp gick
  // alltså att boka utan behandlingsavtal.
  //
  // Kravet härleds nu ur samma facit som resten av kedjan.
  // MUTATIONSTESTAT OCH RÄTTAT. Första versionen var villkorad — `if (lista)` —
  // eftersom setet var privat. Den hoppade alltså tyst över kontrollen och var
  // grön även när listan hårdkodades tillbaka till fyra tjänster. Ett test som
  // tystnar är värre än inget: det ser ut som täckning.
  //
  // Setet exporteras nu, och kontrollen är obligatorisk.
  const {
    TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS,
  } = require('../../src/ops/ccoTreatmentBookingGate');
  assert.ok(
    TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS instanceof Set,
    'setet måste exporteras för att gå att mäta'
  );
  assert.deepEqual(
    [...TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS].sort(),
    [...KRAVER].sort(),
    'listan ska vara facit, inte en kopia'
  );
  for (const id of ['fue-scar', 'dhi-scar', 'dhi-beard']) {
    assert.ok(
      TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS.has(id),
      `${id} måste kräva behandlingsavtal`
    );
  }
});

test('requiresTreatmentAgreement svarar ja på de nya ingreppen', () => {
  // Grinden anropar den här funktionen, inte setet. Att bara mäta setet hade
  // lämnat kopplingen obevisad.
  const { requiresTreatmentAgreement } = require('../../src/ops/ccoTreatmentBookingGate');
  for (const id of ['fue', 'dhi', 'beard', 'eyebrow', 'fue-scar', 'dhi-scar', 'dhi-beard']) {
    assert.equal(requiresTreatmentAgreement(id), true, id);
  }
  for (const id of ['consultation-physical', 'prp-hair', 'curatiio-botox']) {
    assert.equal(requiresTreatmentAgreement(id), false, id);
  }
});
