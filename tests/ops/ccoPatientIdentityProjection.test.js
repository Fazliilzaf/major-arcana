'use strict';

/**
 * ORD-85 steg 2 — identitetsprojektionen.
 *
 * listPatients djupkopierade varje post och sorterade med localeCompare:
 * +517 MB heap per laddning. Konsumenten — collectAssetStoreAliases — använder
 * populationen till exakt två unikhetsräkningar och inget annat.
 *
 * Uppmätt: 332,97 ms / +516,8 MB → 4,81 ms / +3,9 MB. 99,2 % mindre minne.
 *
 * FÄLLAN som testerna finns till för:
 *
 * Projektionen lagrar NORMALISERADE värden i fälten `personnummer` och
 * `displayName`. Det är därför konsumenten fungerar utan gren — de delade
 * hjälparna läser samma fältnamn, och normaliseringarna är idempotenta.
 *
 * Men fältnamnet ljuger. `displayName` innehåller 'anna andersson', inte
 * 'Anna Andersson'. Läser någon det för att VISA ett namn får användaren
 * gemener utan diakriter. Grenfriheten är värd det, men risken låses fast här
 * i stället för att kommenteras bort.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  collectAssetStoreAliases,
  patientIdentityPnr,
  patientIdentityName,
} = require('../../src/ops/ccoPatientAssetIdentity');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

const TENANT = 'hair-tp-clinic';

const PATIENTER = [
  { id: 'p1', tenantId: TENANT, displayName: 'Anna Andersson', personnummer: '19800101-1234' },
  { id: 'p2', tenantId: TENANT, displayName: 'Björn Öberg', personnummer: '19750202-5678' },
  { id: 'p3', tenantId: TENANT, displayName: 'Anna Andersson', personnummer: '19900303-9012' },
  // Sammanslagen sekundär — ska INTE räknas som en aktiv identitet.
  { id: 'p4', tenantId: TENANT, displayName: 'Cecilia Ek', personnummer: '19850404-3456', matchStatus: 'merged' },
  // Fallback-kedjorna, SAKNAT fält (undefined). Här beter sig ?? och || lika.
  { id: 'p5', tenantId: TENANT, cliento: { name: 'David Dahl' }, pnr: '19700505-7890' },
  // Fallback-kedjorna, TOM STRÄNG. Här skiljer de sig — och det är fallet som
  // förekommer i verkligheten, eftersom displayName byggs från Cliento- och
  // Drive-importer som lämnar tomma fält efter sig.
  {
    id: 'p6',
    tenantId: TENANT,
    displayName: '',
    personnummer: '',
    fullName: '',
    personalNumber: '',
    cliento: { name: 'Erik Ek' },
    pnr: '19600606-1122',
  },
];

async function skapaStore(patients = PATIENTER) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord85proj-'));
  const filePath = path.join(dir, 'pm.json');
  fs.writeFileSync(filePath, JSON.stringify({ tenants: { [TENANT]: { patients } } }));
  const store = await createCcoPatientMasterStore({ filePath });
  return { store, städa: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('projektionen ger identiskt unikhetssvar som fullständiga poster', async () => {
  const { store, städa } = await skapaStore();
  const full = (await store.listPatients({ tenantId: TENANT, limit: 20000, offset: 0 })).patients;
  const proj = (await store.listPatientIdentities({ tenantId: TENANT })).patients;

  // Unikhetsräkningen är det ENDA populationen används till. Den måste ge
  // samma svar oavsett form.
  const räknaPnr = (pop, pnr) => pop.filter((r) => patientIdentityPnr(r) === pnr).length;
  const räknaNamn = (pop, namn) => pop.filter((r) => patientIdentityName(r) === namn).length;

  for (const pnr of ['19800101' + '1234', '19750202' + '5678', '19700505' + '7890', '00000000']) {
    assert.equal(räknaPnr(proj, pnr), räknaPnr(full, pnr), `personnummer ${pnr}`);
  }
  for (const namn of ['anna andersson', 'bjorn oberg', 'david dahl', 'finns inte']) {
    assert.equal(räknaNamn(proj, namn), räknaNamn(full, namn), `namn ${namn}`);
  }

  // Dubbletten ska synas som dubblett i BÅDA formerna — annars blir
  // pnrIsUnique/nameIsUnique fel och fel assets kopplas till fel patient.
  assert.equal(räknaNamn(proj, 'anna andersson'), 2, 'Anna finns två gånger');
  assert.equal(räknaNamn(proj, 'bjorn oberg'), 1, 'Björn är unik — diakriter normaliserade');
  städa();
});

test('sammanslagna sekundärer utesluts lika i båda formerna', async () => {
  const { store, städa } = await skapaStore();
  const full = (await store.listPatients({ tenantId: TENANT, limit: 20000, offset: 0 })).patients;
  const proj = (await store.listPatientIdentities({ tenantId: TENANT })).patients;

  assert.equal(proj.length, full.length, 'lika många aktiva identiteter');
  assert.equal(
    proj.filter((r) => patientIdentityName(r) === 'cecilia ek').length,
    0,
    'merged får inte räknas — annars ser en unik patient ut som en dubblett'
  );
  städa();
});

test('fallback-kedjorna bärs vidare — cliento.name och pnr', async () => {
  const { store, städa } = await skapaStore();
  const proj = (await store.listPatientIdentities({ tenantId: TENANT })).patients;

  assert.equal(
    proj.filter((r) => patientIdentityName(r) === 'david dahl').length,
    1,
    'namn via cliento.name ska överleva projektionen'
  );
  assert.equal(
    proj.filter((r) => patientIdentityPnr(r) === '197005057890').length,
    1,
    'personnummer via pnr-fältet ska överleva projektionen'
  );
  städa();
});

test('TOM STRÄNG faller vidare i kedjan — || och inte ??', async () => {
  // Regressionen som fanns i första versionen av den här ändringen: ?? stannar
  // på '' medan || faller vidare. p6 har displayName: '' och personnummer: ''
  // men bär namn i cliento.name och personnummer i pnr.
  //
  // Med ?? blev båda '' — och tomt namn matchar alla andra tomma namn, så
  // patienten går från unik till en av många. nameIsUnique blir false, aliasen
  // försvinner, och bilderna slutar synas på kundkortet. Utan krasch, utan larm.
  //
  // p5 (saknade fält) hade INTE fångat det: där beter sig ?? och || lika.
  const { store, städa } = await skapaStore();
  const proj = (await store.listPatientIdentities({ tenantId: TENANT })).patients;
  const full = (await store.listPatients({ tenantId: TENANT, limit: 20000, offset: 0 })).patients;

  for (const [pop, vad] of [[proj, 'projektionen'], [full, 'fullständiga poster']]) {
    assert.equal(
      pop.filter((r) => patientIdentityName(r) === 'erik ek').length,
      1,
      `${vad}: tomt displayName ska falla vidare till cliento.name`
    );
    assert.equal(
      pop.filter((r) => patientIdentityPnr(r) === '196006061122').length,
      1,
      `${vad}: tomt personnummer ska falla vidare till pnr`
    );
  }

  // Och ingen identitet ska ha blivit tom — det är själva felläget.
  assert.equal(
    proj.filter((r) => !r.displayName && !r.personnummer).length,
    0,
    'ingen patient ska sakna både namn och personnummer efter projektion'
  );
  städa();
});

test('FÄLLAN: displayName i projektionen är normaliserat, inte visningsbart', async () => {
  const { store, städa } = await skapaStore();
  const proj = (await store.listPatientIdentities({ tenantId: TENANT })).patients;
  const björn = proj.find((r) => r.displayName.includes('bjorn'));

  assert.ok(björn, 'Björn ska finnas i projektionen');
  assert.equal(björn.displayName, 'bjorn oberg');
  assert.notEqual(björn.displayName, 'Björn Öberg');
  // Om det här testet någonsin "rättas" till att förvänta visningsnamnet har
  // någon börjat använda projektionen som om den vore fullständiga poster.
  // Då ska projektionen bära ett eget fält — inte återanvända displayName.
  städa();
});

test('VAKT: konsumenten läser bara de två fälten ur populationen', () => {
  // Faller den här har collectAssetStoreAliases börjat läsa något annat ur
  // population-raderna. Då är det normaliserade displayName plötsligt synligt
  // för en användare, eller så saknas fältet helt och unikhetssvaret blir fel.
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoPatientAssetIdentity.js'),
    'utf8'
  );
  const start = src.indexOf('function collectAssetStoreAliases');
  const slut = src.indexOf('\nfunction ', start + 10);
  const kropp = src.slice(start, slut > start ? slut : undefined);

  const populationRader = kropp
    .split('\n')
    .filter((rad) => /population\./.test(rad) && !rad.trim().startsWith('//'));

  assert.ok(populationRader.length > 0, 'population ska användas');
  for (const rad of populationRader) {
    assert.match(
      rad,
      /population\.(filter|length)\b/,
      `population får bara räknas, aldrig fältläsas direkt — hittade: ${rad.trim()}`
    );
  }
  // Fältåtkomsten ska ske via de delade hjälparna, inte inline.
  assert.ok(
    kropp.includes('patientIdentityPnr(row)') && kropp.includes('patientIdentityName(row)'),
    'unikhetsräkningen ska gå via de delade hjälparna'
  );
});

test('fallback-vägen ger samma unikhetssvar när projektionen saknas', async () => {
  // Otestad fallback är den sortens kod som fungerar i tre år och sedan inte
  // gör det. En äldre store utan listPatientIdentities ska ge SAMMA svar,
  // inte bara låta bli att krascha.
  const { store, städa } = await skapaStore();
  const äldreStore = { listPatients: store.listPatients };
  assert.equal(typeof äldreStore.listPatientIdentities, 'undefined');

  const laddaProjektion = () => store.listPatientIdentities({ tenantId: TENANT });
  const laddaFallback = () =>
    typeof äldreStore.listPatientIdentities === 'function'
      ? äldreStore.listPatientIdentities({ tenantId: TENANT })
      : äldreStore.listPatients({ tenantId: TENANT, limit: 20000, offset: 0 });

  const a = (await laddaProjektion()).patients;
  const b = (await laddaFallback()).patients;

  for (const namn of ['anna andersson', 'bjorn oberg', 'david dahl']) {
    assert.equal(
      a.filter((r) => patientIdentityName(r) === namn).length,
      b.filter((r) => patientIdentityName(r) === namn).length,
      `fallback ska ge samma räkning för ${namn}`
    );
  }
  städa();
});

test('INGET TAK: projektionen avkortar aldrig, inte ens på begäran', async () => {
  // Bugbot: "Identity cap uses wrong patient set" — de två vägarna tappade
  // olika patienter vid avkortning, eftersom fallbacken sorterar på namn och
  // projektionen inte gör det.
  //
  // Men att matcha sorteringen hade bara gjort dem lika fel. Populationen
  // besvarar frågan "finns det exakt en patient med det här personnumret".
  // En avkortad population kan inte svara sant på den — dubbletten som föll
  // bort gör att den kvarvarande ser unik ut. Svaret blir OSANT, inte
  // ofullständigt, och konsekvensen är att assets kopplas till fel patient.
  //
  // Därför finns inget tak. Det här testet finns för att ett tak inte ska
  // smyga tillbaka som "en rimlig gräns".
  const många = [];
  for (let i = 0; i < 60; i += 1) {
    många.push({
      id: `m${i}`,
      tenantId: TENANT,
      displayName: `Patient ${i}`,
      personnummer: `1980010${i % 10}-00${String(i).padStart(2, '0')}`,
    });
  }
  // Dubblettparet ligger med flit på var sin sida om en tänkbar gräns vid 10.
  många[3].displayName = 'Tvilling Test';
  många[47].displayName = 'Tvilling Test';

  const { store, städa } = await skapaStore(många);

  const utanArgument = (await store.listPatientIdentities({ tenantId: TENANT })).patients;
  assert.equal(utanArgument.length, 60, 'alla aktiva identiteter ska med');

  // Ett limit-argument ska inte kunna avkorta — signaturen tar det inte längre.
  const medLimit = (await store.listPatientIdentities({ tenantId: TENANT, limit: 10 })).patients;
  assert.equal(medLimit.length, 60, 'limit får inte avkorta identitetspopulationen');

  // Och det som avkortningen skulle ha förstört: dubbletten syns fortfarande.
  assert.equal(
    medLimit.filter((r) => patientIdentityName(r) === 'tvilling test').length,
    2,
    'dubbletten måste överleva — annars ser den kvarvarande ut som unik'
  );
  städa();
});

test('total räknas före avkortning och matchar listPatients', async () => {
  const { store, städa } = await skapaStore();
  const proj = await store.listPatientIdentities({ tenantId: TENANT });
  const full = await store.listPatients({ tenantId: TENANT, limit: 20000, offset: 0 });

  assert.equal(proj.total, full.total, 'total ska betyda samma sak i båda vägarna');
  assert.equal(proj.total, proj.patients.length, 'utan tak är total = antalet rader');
  städa();
});

test('collectAssetStoreAliases ger samma alias med projektion som med full post', async () => {
  const { store, städa } = await skapaStore();
  const full = (await store.listPatients({ tenantId: TENANT, limit: 20000, offset: 0 })).patients;
  const proj = (await store.listPatientIdentities({ tenantId: TENANT })).patients;

  const assetStore = {
    listItemsForEnrichment: () => [
      { patientId: 'a-1', status: 'VISIBLE_ON_PATIENT_CARD', originalDrivePath: '/Björn Öberg/bild.jpg' },
      { patientId: 'a-2', status: 'VISIBLE_ON_PATIENT_CARD', originalDrivePath: '/Anna Andersson/bild.jpg' },
      { patientId: 'a-3', status: 'ARCHIVED', originalDrivePath: '/Björn Öberg/gammal.jpg' },
    ],
  };
  const patient = { id: 'p2', displayName: 'Björn Öberg', personnummer: '19750202-5678' };

  const medFull = collectAssetStoreAliases({ patient, patientPopulation: full, tenantId: TENANT, assetStore });
  const medProj = collectAssetStoreAliases({ patient, patientPopulation: proj, tenantId: TENANT, assetStore });

  assert.deepEqual(medProj, medFull, 'projektionen ska ge identiska alias');
  assert.ok(medProj.includes('a-1'), 'Björns unika namn ska ge träff');
  assert.ok(!medProj.includes('a-3'), 'arkiverad asset ska inte ge alias');
  städa();
});
