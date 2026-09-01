'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const {
  betanketidForTjanst,
  DAGAR_KIRURGI,
  DAGAR_OVRIGT,
} = require('../../src/ops/ccoCoolingOffPolicy');
const reg = require('../../src/ops/patientDocumentLiveRegistry');

/**
 * ORD-159 — kontrollen som saknades.
 *
 * Ögonlocksplastik hade tre olika betänketider samtidigt:
 *
 *   avtalet patienten signerar   sju dagar    ORD-157 §2, mot Nordbros källa
 *   backend, coolingOffEndsAt    två dagar    HAIR_TP_COOLING_OFF_DAYS
 *   kundkortets flöde            ingen alls   minorSurgery: { 6: skip }
 *
 * Varje lager var internt konsekvent. Det fanns tester för avtalet, tester för
 * flödesvarianten, och policyn gjorde precis vad den sa. Ingen kontroll frågade
 * om de sa SAMMA sak.
 *
 * Det här testet gör det, och läser varje lager där det faktiskt bor — inte ur
 * en kopia. En kopia hade bara flyttat problemet.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const NORDBRO = path.join(REPO_ROOT, 'docs', 'legal', 'nordbro');

const OGONLOCK = { name: 'Övre ögonlocksplastik', category: 'Ögonlocksplastik · Curatiio' };
const BOTOX = { name: 'Botox: 1 område', category: 'Estetiska injektioner · Curatiio' };

/** Betänketidsmeningen ur Nordbros .docx — samma väg som betanketidMotNordbro. */
function nordbroDagar(fil) {
  const xml = execFileSync('unzip', ['-p', path.join(NORDBRO, fil), 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ');
  const m = text.match(/minst\s+(två|sju)\s+\((\d)\)\s+dagar/);
  assert.ok(m, `hittade ingen betänketidsmening i ${fil}`);
  return Number(m[2]);
}

/** Vad avtalet patienten signerar faktiskt säger. */
function dagarIAvtal(registryId) {
  const html = fs
    .readFileSync(reg.resolveLiveDocumentAbsolutePath(registryId), 'utf8')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ');
  const m = html.match(/minst\s+(?:två|sju)\s+\((\d)\)\s+dagar/);
  assert.ok(m, `${registryId} saknar betänketidsmening`);
  return Number(m[1]);
}

/** Flödesvarianterna, lästa ur kundkortsfilen i stället för ur en kopia. */
function laddaVarianter() {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'public', 'major-arcana-preview', 'app', 'cco-kundkort-kkx.js'),
    'utf8'
  );
  const sandbox = { window: { CcoV9CustomersParity: {} }, console };
  vm.runInNewContext(`${src}\n;this.exports = window.CcoKundkortKkx;`, sandbox);
  return { modul: sandbox.exports, kalla: src };
}

test('avtal, policy och Nordbros källa säger samma sak om ögonlocksplastik', () => {
  const kalla = nordbroDagar('2025-12-03-behandlingsavtal-dhi-7-dagar.docx');
  const avtal = dagarIAvtal('offert_op');
  const policy = betanketidForTjanst(OGONLOCK).dagar;

  assert.deepEqual(
    { kalla, avtal, policy },
    { kalla: 7, avtal: 7, policy: 7 },
    'Kirurgi kräver sju dagar enligt lag 2021:363. Skiljer sig något av lagren ' +
      'signerar patienten ett avtal systemet inte verkställer.'
  );
});

test('avtal och policy säger samma sak om injektionsbehandlingar', () => {
  const kalla = nordbroDagar('2025-12-03-behandlingsavtal-dhi-2-dagar.docx');
  const avtal = dagarIAvtal('offert_botox');
  const policy = betanketidForTjanst(BOTOX).dagar;

  assert.deepEqual(
    { kalla, avtal, policy },
    { kalla: 2, avtal: 2, policy: 2 },
    'Injektioner har två dagar. Sätts policyn till sju för alla försenas varje ' +
      'botoxbokning fem dagar — fel åt andra hållet, men fortfarande fel.'
  );
});

const KORT = { treatmentTypes: ['ögonlocksplastik'], missingJournal: false, hasJournal: true };
const bygg = (modul) => modul.buildCanonicalJourneyLive(KORT, [], null, { historyBookingCount: 1 });

test('flödet hoppar inte över betänketiden för kirurgi', () => {
  const { modul } = laddaVarianter();
  const journey = bygg(modul);
  assert.equal(journey.pathVariant, 'minorSurgery', 'ORD-129: ögonlocksplastik är kirurgi');

  const steg6 = journey.steps.find((s) => s.step === 6);
  assert.ok(steg6, 'steg 6 saknas helt i resan');
  assert.notEqual(
    steg6.status,
    'skipped',
    'Steg 6 är betänketiden. Hoppas den över signerar patienten ett avtal med ' +
      'sju dagars frist utan att fristen någonsin visas.'
  );
  assert.notEqual(steg6.truth, 'skipped', 'samma sak, men i sanningsfältet');
});

test('friskförsäkran på steg 8 finns kvar — ORD-129 rörs inte', () => {
  const { modul } = laddaVarianter();
  const steg8 = bygg(modul).steps.find((s) => s.step === 8);
  assert.ok(steg8, 'steg 8 saknas');
  assert.notEqual(steg8.status, 'skipped');
  assert.equal(
    steg8.label,
    'Friskförsäkran',
    'ORD-129 byggde varianten för friskförsäkran — den får inte falla bort när ' + 'steg 6 rättas'
  );
});

test('minorSurgery-varianten bär ingen skip på steg 6 i källan', () => {
  // Läses ur filen och inte ur den byggda resan: en framtida ändring kan sätta
  // skip i en annan variant som ögonlocksplastik senare klassas till.
  const { kalla } = laddaVarianter();
  const block = kalla.match(/minorSurgery:\s*\{[\s\S]*?\n\s*\},/);
  assert.ok(block, 'hittar inte minorSurgery-varianten');
  assert.doesNotMatch(
    block[0],
    /6:\s*\{[^}]*skip:\s*true/,
    'minorSurgery hoppar över steg 6 igen — samma fel som ORD-159 rättade'
  );
});

test('okänd tjänst får den korta tiden — ägarbeslut, inte förbiseende', () => {
  // Jag byggde först tvärtom (okänt = kirurgi, fail-safe). Det ändrade
  // betänketiden för varje ärende äldre än ORD-150 och försenade
  // hårtransplantationer fem dagar. Ägaren valde två.
  //
  // Kvarvarande känd risk: ett gammalt ögonlocksärende utan serviceId får två
  // dagar i systemet men signerar ett avtal som säger sju. Avtalet är det
  // bindande. Risken krymper till noll när alla ärenden bär serviceId.
  const okand = betanketidForTjanst({ name: 'Något som inte finns', category: '' });
  assert.equal(okand.dagar, DAGAR_OVRIGT);
  assert.equal(okand.kirurgi, false);
  assert.equal(okand.grupp, null, 'och det ska synas att ingen regel kände igen den');
  assert.notEqual(DAGAR_KIRURGI, DAGAR_OVRIGT, 'testet vore meningslöst om de var lika');
});

/**
 * Kvarvarande skuld, avgränsad.
 *
 * ORD-159 rättade den väg som sätter `coolingOffEndsAt` när kunden öppnar
 * offerten (ccoCommercialStore) — den bär `serviceId` sedan ORD-150 och kan
 * därför härleda ingreppstypen.
 *
 * Tre moduler använder fortfarande den gamla tvådagarsmodulen. Den viktigaste,
 * ccoTreatmentAgreementStore, har INGET serviceId att härleda ur: den tar
 * `coolingOffDays` från anroparen och faller tillbaka på två. Att ge den rätt
 * siffra kräver att den som skapar avtalet skickar med den, och det är en
 * ändring i flera anropskedjor — inte en rad.
 *
 * Listan får krympa, aldrig växa. En ny modul som importerar tvådagarsdefaulten
 * ska stoppas här och tvingas ta ställning.
 */
const KVAR_PA_GAMLA_POLICYN = [
  'src/ops/ccoOfferEsign.js',
  'src/ops/ccoOfferTemplateStore.js',
  'src/ops/ccoTreatmentAgreementStore.js',
];

test('ingen ny modul börjar använda tvådagarsdefaulten i tysthet', () => {
  const ut = execFileSync('git', ['grep', '-l', 'ccoHairTpCoolingOffPolicy', '--', 'src/'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const anvandare = ut
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    // ccoCommercialStore nämner modulen bara i en kommentar om varför den bytte.
    .filter((f) => f !== 'src/ops/ccoCommercialStore.js');

  const nya = anvandare.filter((f) => !KVAR_PA_GAMLA_POLICYN.includes(f));
  assert.deepEqual(
    nya,
    [],
    'En ny modul har börjat använda betänketiden som bara kan två dagar. ' +
      'Använd ccoCoolingOffPolicy och härled ur ingreppstypen:\n' +
      nya.map((f) => `  - ${f}`).join('\n')
  );

  const lagade = KVAR_PA_GAMLA_POLICYN.filter((f) => !anvandare.includes(f));
  assert.deepEqual(
    lagade,
    [],
    `Följande är flyttade till den nya policyn: ${lagade.join(', ')}. ` +
      'Ta bort dem ur KVAR_PA_GAMLA_POLICYN.'
  );
});
