'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const {
  serviceRequiresOrdination,
  caseRequiresOrdination,
  mayRequireOrdination,
  KRAVER,
  KRAVER_INTE,
  EJ_BESLUTAT,
  FACIT,
} = require('../../src/ops/ordinationRequirement');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

/**
 * ORD-177 — ordinationskravet läses ur katalogen, inte ur etiketten.
 *
 * DET SOM STOD HÄR FÖRUT var en regex i staffPortal.js:
 *
 *   /tp|transplant|hårtransplant|dhi|fue|lokalbedöv/
 *
 * körd mot serviceLabel + serviceId + treatmentType + treatment + procedure +
 * encounterType hopslaget till en sträng.
 *
 * TVÅ SORTERS FEL, båda mätta:
 *
 * 1. FALSKA JA. "Uppföljning hårtransplantation", "TP uppföljning" och
 *    "PRP efter TP" innehåller alla en träff. Alla tre är efterkontroller där
 *    ingen bedövning ges. De hamnade i läkarens ordinationskö.
 *
 * 2. FALSKA NEJ, och det här är det allvarliga. 2026-09-03 låg 369 ärenden i
 *    /var/data/cco-booking.json i produktion. Inte ett enda hade `serviceId`.
 *    Tjänsten stod i `requestedTreatment` — ett fält regexen aldrig läste.
 *    Alltså svarade den nej på samtliga 369, inte för att den bedömt dem utan
 *    för att den letade i tomma fält.
 *
 *    Ett nej av okunskap är omöjligt att skilja från ett nej av bedömning.
 *    Det är hela skälet till att den här filen finns.
 */

test('facit är internt konsistent — inget id står på två ställen', () => {
  const alla = [...KRAVER, ...KRAVER_INTE, ...EJ_BESLUTAT];
  const dubbletter = alla.filter((id, i) => alla.indexOf(id) !== i);
  assert.deepEqual(dubbletter, [], 'id på flera ställen: ' + JSON.stringify(dubbletter));
  assert.ok(KRAVER.size > 0, 'något måste kräva ordination, annars är filen meningslös');
});

test('de fyra transplantationerna kräver ordination', () => {
  // Ordinationen 2026-05-18 och delegeringen gäller lokalbedövning vid
  // hårtransplantation. Skägg och ögonbryn är samma ingrepp på annan plats.
  for (const id of ['fue', 'dhi', 'beard', 'eyebrow']) {
    assert.equal(serviceRequiresOrdination(id), true, `${id} ska kräva ordination`);
  }
});

test('konsultationer kräver inte ordination — ägarens egen regel', () => {
  // Fazli 2026-09-03: "det är inte på konsultationer ordinationer ska skapas."
  for (const id of [
    'consultation-online',
    'consultation-physical',
    'consultation-bleph',
    'consultation-ortho',
    'consultation-curatiio-aesthetic',
  ]) {
    assert.equal(serviceRequiresOrdination(id), false, `${id} ska inte kräva ordination`);
  }
});

test('efterkontroller kräver inte ordination — regexens falska ja', () => {
  // "Uppföljning hårtransplantation" matchade /transplant/ och krävde
  // ordination. Det är hela poängen med att sluta läsa etiketter.
  assert.equal(serviceRequiresOrdination('followup-transplant'), false);
  assert.equal(serviceRequiresOrdination('followup'), false);

  const gamlaRegexen = /tp|transplant|hårtransplant|dhi|fue|lokalbedöv/;
  assert.equal(
    gamlaRegexen.test('uppföljning hårtransplantation'),
    true,
    'regexen träffade — bevarat här så nästa läsare ser skillnaden'
  );
});

test('ett okänt id ger null, aldrig false', () => {
  // Skillnaden mellan "vi har beslutat nej" och "vi vet inte" måste överleva
  // hela vägen ut. Samma princip som delegeringarnas TILLS_VIDARE.
  assert.equal(serviceRequiresOrdination('bleph-upper'), null);
  assert.equal(serviceRequiresOrdination('botox'), null);
  assert.equal(serviceRequiresOrdination('nagot-som-inte-finns'), null);
  assert.notEqual(serviceRequiresOrdination('bleph-upper'), false);
});

test('ärendet läses via requestedTreatment — fältet produktionen faktiskt använder', () => {
  // MÄTT I PROD 2026-09-03: 369 ärenden, noll med serviceId.
  //   92 consultation-online, 59 consultation-physical,
  //   56 followup-transplant, 162 tomma.
  assert.equal(caseRequiresOrdination({ requestedTreatment: 'consultation-online' }), false);
  assert.equal(caseRequiresOrdination({ requestedTreatment: 'followup-transplant' }), false);
  assert.equal(caseRequiresOrdination({ requestedTreatment: 'fue' }), true);
  assert.equal(caseRequiresOrdination({ requestedTreatment: 'bleph-upper' }), null);
});

test('serviceId vinner över requestedTreatment när båda finns', () => {
  assert.equal(
    caseRequiresOrdination({ serviceId: 'dhi', requestedTreatment: 'consultation' }),
    true
  );
});

test('en behandlingstext utan id ger null — aldrig false', () => {
  // MITT EGET FEL, fångat av den befintliga sviten. Första versionen svarade
  // false så fort inget id fanns. Fixturen i staffPortalOrdinationWrite bär
  // serviceLabel 'Hårtransplantation' och tomt serviceId — och fick därmed
  // "nej, ingen ordination behövs" på en transplantation.
  //
  // Det är exakt samma nej-av-okunskap som regexen gav på 369 ärenden i prod.
  // Skillnaden är bara att det här nejet gällde ett ingrepp.
  //
  // Texten får aldrig svara JA. Den får bara hindra ett nej.
  assert.equal(caseRequiresOrdination({ serviceLabel: 'Hårtransplantation' }), null);
  assert.equal(caseRequiresOrdination({ treatmentType: 'DHI' }), null);
  assert.equal(caseRequiresOrdination({ procedure: 'något helt annat' }), null);
  assert.notEqual(caseRequiresOrdination({ serviceLabel: 'Hårtransplantation' }), true);
});

test('ett ärende utan vald tjänst ger false — det finns inget att ordinera ännu', () => {
  // De 162 tomma. Att ge dem null hade lagt varenda en i läkarens kö utan att
  // en enda gick att ta ställning till. Kravet uppstår när tjänsten sätts.
  assert.equal(caseRequiresOrdination({}), false);
  assert.equal(caseRequiresOrdination({ requestedTreatment: '' }), false);
  assert.equal(caseRequiresOrdination({ serviceId: null }), false);

  // Och när tjänsten sedan sätts ska kravet slå om.
  const arende = { requestedTreatment: '' };
  assert.equal(caseRequiresOrdination(arende), false);
  arende.requestedTreatment = 'fue';
  assert.equal(caseRequiresOrdination(arende), true, 'kravet uppstår när tjänsten sätts');
});

test('mayRequireOrdination är fail-safe: null räknas som ja', () => {
  assert.equal(mayRequireOrdination({ requestedTreatment: 'fue' }), true);
  assert.equal(mayRequireOrdination({ requestedTreatment: 'bleph-upper' }), true, 'null → visa');
  assert.equal(mayRequireOrdination({ requestedTreatment: 'consultation-online' }), false);
});

test('etiketten kan inte längre påverka svaret', () => {
  // Kärnan. Oavsett hur någon formulerar sig ska bedömningen komma från id:t.
  const lockande = {
    serviceLabel: 'DHI hårtransplantation med lokalbedövning',
    treatmentType: 'FUE transplantation',
    procedure: 'lokalbedövning',
    requestedTreatment: 'consultation-online',
  };
  assert.equal(
    caseRequiresOrdination(lockande),
    false,
    'etiketten skriker transplantation men tjänsten är ett samtal'
  );

  // Och omvänt: ett id som säger transplantation vinner över en etikett som
  // säger konsultation. Id:t bestämmer, i båda riktningarna.
  assert.equal(
    caseRequiresOrdination({ serviceLabel: 'Kostnadsfritt samtal', requestedTreatment: 'fue' }),
    true
  );
});

test('katalogen bär flaggan, och den stämmer med facit', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord177-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    await createCcoBookingEngineStore({ filePath });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const avvikelser = [];
    for (const service of raw.services) {
      const vantat = serviceRequiresOrdination(service.id);
      if (service.requiresOrdination !== vantat) {
        avvikelser.push(`${service.id}: katalog ${service.requiresOrdination} men facit ${vantat}`);
      }
    }
    assert.deepEqual(avvikelser, [], avvikelser.join(' | '));

    const kravande = raw.services.filter((s) => s.requiresOrdination === true).map((s) => s.id);
    assert.deepEqual(kravande.sort(), ['beard', 'dhi', 'eyebrow', 'fue']);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('varje ej beslutad tjänst har ett skrivet skäl', () => {
  // En lucka utan förklaring är bara en lucka. Med förklaring är den en fråga
  // någon kan svara på.
  for (const id of EJ_BESLUTAT) {
    const skal = FACIT.ej_beslutat[id];
    assert.ok(
      (Array.isArray(skal) ? skal.join('') : String(skal || '')).length > 10,
      `${id} saknar skäl`
    );
  }
});

test('facitfilen pekar ut sina källor', () => {
  assert.match(FACIT._kallor.ordination, /Ordination/i);
  assert.match(FACIT._kallor.delegering, /DELEGERING/i);
  assert.match(FACIT._kallor.hamtad, /^\d{4}-\d{2}-\d{2}$/);
});
