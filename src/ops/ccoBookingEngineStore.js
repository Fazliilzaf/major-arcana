const crypto = require('node:crypto');
const { reportDroppedKeys } = require('./ccoNormalizerDropLoud');
const {
  applyBookingPolicyToService,
  assertCancellationAllowed,
  capAvailabilityToDate,
  isSlotWithinBookingPolicy,
  resolveDepositRetention,
  resolveServiceBookingPolicy,
} = require('./ccoBookingPolicy');
const fs = require('node:fs/promises');
const path = require('node:path');

const { ensureDirectoryWithRetry } = require('./persistentDir');
const {
  mergeLegacyCatalogIntoEngineState,
  mergeLegacyResourcesIntoEngineState,
  mergeClientoPricingIntoServices,
  mergeClientoSchedulesIntoEngineState,
  wireAddonServicesIntoEngineState,
  buildStaffRuntimeCatalogReadout,
  buildServiceRegisterBookingPolicy,
} = require('./legacyCatalogRuntime');
const { klinikTidTillUtc, utcTillKlinikTid } = require('./klinikTid');
const {
  applyBookingPolicyMigrationToServices,
  applyBookingPolicySettingsToService,
  loadBookingPolicyMigrationDefaults,
  normalizeBookingPolicySettings,
} = require('./bookingPolicySettings');
const {
  applyBookingPricingMigrationToService,
  applyPricingToSlot,
  normalizePricingRules,
} = require('./bookingPricingRules');
const {
  mergeCuratiioCatalogIntoEngineState,
  serviceMatchesBrand,
  resourceMatchesBrand,
} = require('./curatiioCatalogRuntime');
const { isTestDataEmail } = require('../infra/isTestDataEmail');
const { serviceRequiresOrdination, ordinationReason } = require('./ordinationRequirement');
const { nyBookingActionToken } = require('./bookingActionLink');

const SERVICE_REGISTER_BOOKING_POLICY = buildServiceRegisterBookingPolicy();
const SERVICE_REGISTER_PUBLIC_SERVICE_IDS = new Set(
  asArray(SERVICE_REGISTER_BOOKING_POLICY.publicServiceIds).map(normalizeText)
);
const SERVICE_REGISTER_ALIAS_TO_SERVICE_ID = new Map(
  Object.entries(asObject(SERVICE_REGISTER_BOOKING_POLICY.aliasToServiceId)).map(([alias, id]) => [
    normalizeText(alias),
    normalizeText(id),
  ])
);

/** Plan A web — läkare/konsulter som får synas i publik katalog (ej sjuksköterskor). */
const PLAN_A_PUBLIC_RESOURCE_IDS = ['fazli', 'egzona', 'arya'];

// Klinikens fem behandlingsrum. Standardnamn = id ("1"–"5") tills personalen
// döper om dem i ccoSettingsStore.rooms. `createCcoBookingEngineStore` tar emot
// en aktuell `rooms`-lista och faller tillbaka på dessa.
const DEFAULT_ROOMS = Object.freeze([
  { id: '1', name: '1' },
  { id: '2', name: '2' },
  { id: '3', name: '3' },
  { id: '4', name: '4' },
  { id: '5', name: '5' },
]);

function normalizeRoomsForBookingEngine(rooms) {
  const list = Array.isArray(rooms) ? rooms : DEFAULT_ROOMS;
  return list
    .map((room) => ({
      id: normalizeText(room?.id),
      name: normalizeText(room?.name) || normalizeText(room?.id),
    }))
    .filter((room) => room.id);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function resolveServiceRegisterAlias(serviceId = '') {
  const id = normalizeText(serviceId);
  if (!id) return '';
  return SERVICE_REGISTER_ALIAS_TO_SERVICE_ID.get(id) || id;
}

function isServiceRegisterPublicBookable(serviceId = '') {
  const id = resolveServiceRegisterAlias(serviceId);
  return Boolean(id && SERVICE_REGISTER_PUBLIC_SERVICE_IDS.has(id));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildNurseCyclicConsultationRules() {
  const CYCLE_START = '2026-08-24T00:00:00.000Z';
  const SHIFTS = {
    A: [{ weekdays: [1, 2, 3, 4, 5], startTimes: SKIFT_A_VARDAG }],
    B: [
      { weekdays: [2, 3, 4, 5], startTimes: SKIFT_B_VARDAG },
      { weekdays: [6], startTimes: SKIFT_B_LORDAG },
    ],
    C: [{ weekdays: [2, 3, 4, 5], startTimes: SKIFT_C_VARDAG }],
    D: [
      { weekdays: [3, 4, 5], startTimes: SKIFT_D_VARDAG },
      { weekdays: [6], startTimes: SKIFT_D_LORDAG },
    ],
  };
  const ROTATION = {
    veronica: ['B', 'C', 'D', 'A'],
    clara: ['A', 'D', 'C', 'B'],
    louise: ['C', 'B', 'A', 'D'],
    wendela: ['D', 'A', 'B', 'C'],
  };

  const rules = [];
  for (const [resourceId, shifts] of Object.entries(ROTATION)) {
    for (let i = 0; i < 4; i += 1) {
      const cycleWeek = i + 1;
      const shiftDefs = asArray(SHIFTS[shifts[i]]);
      for (let idx = 0; idx < shiftDefs.length; idx += 1) {
        const def = shiftDefs[idx];
        const suffix = shiftDefs.length > 1 ? `-${idx + 1}` : '';
        rules.push({
          ruleId: `rule-cons-${resourceId}-cw${cycleWeek}${suffix}`,
          resourceId,
          serviceId: 'consultation-physical',
          weekdays: def.weekdays,
          startTimes: def.startTimes,
          locationLabel: 'Hair TP Clinic',
          active: true,
          managedBy: 'staff',
          cycleWeeks: 4,
          cycleWeek,
          cycleStart: CYCLE_START,
        });
      }
    }
  }
  return rules;
}

function normalizeWeekdays(value) {
  const weekdays = asArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return weekdays.length ? Array.from(new Set(weekdays)) : [1, 2, 3, 4, 5];
}

/**
 * En regel utan giltiga klockslag ska erbjuda noll tider.
 *
 * Här stod tidigare `: ['09:30', '13:30', '15:00']` — en regel med tom lista
 * fick alltså tre påhittade tider, varav 09:30 ligger före öppning. Det såg ut
 * som en ofarlig skyddsnätsrad men gjorde motsatsen: den tillverkade
 * tillgänglighet ur ingenting, och en patient kunde boka en tid som ingen
 * hade lagt in.
 *
 * Det upptäcktes när tre gamla kvällsregler skulle tystas genom att sätta
 * `startTimes: []`. De blev inte tysta — de blev 09:30, 13:30 och 15:00.
 */
function normalizeStartTimes(value) {
  const times = asArray(value)
    .map((item) => normalizeText(item))
    .filter((item) => /^\d{2}:\d{2}$/.test(item));
  return Array.from(new Set(times));
}

function normalizeDateOnly(value) {
  const raw = normalizeText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeIso(value) {
  const raw = normalizeText(value);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function addMinutes(isoString, minutesToAdd) {
  const ms = Date.parse(normalizeText(isoString));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + Math.max(0, Number(minutesToAdd) || 0) * 60 * 1000).toISOString();
}

function toSlotId({ resourceId = '', serviceId = '', startsAt = '' } = {}) {
  return [normalizeText(resourceId), normalizeText(serviceId), normalizeIso(startsAt)]
    .filter(Boolean)
    .join('::');
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await ensureDirectoryWithRetry(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Klinikens öppettider för konsultation, i klinikens egen tid.
 *
 * Fram till 2026-08-21 tolkade motorn regeltiderna som UTC, så siffrorna här
 * betydde inte det de sa. Med `klinikTidTillUtc` på plats gör de det, och då
 * går det att skriva schemat mot verkligheten: mån–fre 10–18, lör 10–16.
 */
/**
 * ORD-189 — öppettiderna läses ur config, inte ur konstanter här.
 *
 * Talen nedan är reserv om filen inte går att läsa. De speglar det som stod
 * hårdkodat före ORD-189, så att en trasig fil ger samma beteende som förut i
 * stället för en stängd klinik.
 */
function lasOppettider() {
  try {
    const fil = require('../../config/klinikens-oppettider.json');
    const per = asObject(fil.oppettider);
    const dag = (n) => {
      const rad = asObject(per[String(n)]);
      return rad.fran && rad.till ? { fran: rad.fran, till: rad.till } : null;
    };
    return {
      vardag: dag(2) || { fran: '10:00', till: '18:00' },
      lordag: dag(6) || { fran: '10:00', till: '16:00' },
      minuter: Number(fil.konsultationsminuter) > 0 ? Number(fil.konsultationsminuter) : 45,
      stangdaDagar: asArray(fil.stangda_dagar)
        .map((r) => ({
          datum: normalizeText(asObject(r).datum),
          namn: normalizeText(asObject(r).namn) || 'Stängt',
        }))
        .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.datum)),
    };
  } catch {
    return {
      vardag: { fran: '10:00', till: '18:00' },
      lordag: { fran: '10:00', till: '16:00' },
      minuter: 45,
      stangdaDagar: [],
    };
  }
}

const OPPETTIDER = lasOppettider();
const KONSULTATION_OPPET = { vardag: OPPETTIDER.vardag, lordag: OPPETTIDER.lordag };
const KONSULTATION_MINUTER = OPPETTIDER.minuter;

/**
 * Varje starttid som hinner sluta innan stängning.
 *
 * Kliniken vill erbjuda alla lediga tider, inte fyra fasta pass. Dagen fylls
 * därför med besök efter besök, utan luckor.
 *
 * Steget är lika långt som besöket. Ett kvartsrutnät prövades först — det gav
 * fler valmöjligheter men gjorde intilliggande tider överlappande: 10:00 och
 * 10:15 kan inte båda bokas. Motorn hanterar det rätt (`isSlotTaken` jämför
 * riktiga intervall), men patienten hade fått se tider som försvinner när
 * någon annan bokar bredvid, och två samtidiga besökare hade kunnat välja var
 * sin överlappande tid och en av dem fått nej vid bekräftelsen.
 *
 * Lunchblocket 12:00–13:00 filtreras bort av samma intervalljämförelse, så
 * passen som skär in i lunchen faller av sig själva.
 *
 * Sista starttid blir 16:45 på vardagar och 15:15 på lördagar.
 *
 * Reglerna är fortfarande fasta veckoscheman. Personalen har rullande scheman
 * i Cliento, och Cliento-API:t har ingen schema-endpoint — bara `getSlots`,
 * som ger lediga tider utan schemat bakom. Tills den luckan är löst kan
 * rutnätet erbjuda en tid hos någon som är ledig just den veckan.
 */
function konsultationstider({ fran, till }, steg = KONSULTATION_MINUTER) {
  const minuter = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const ut = [];
  for (let t = minuter(fran); t + KONSULTATION_MINUTER <= minuter(till); t += steg) {
    ut.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return ut;
}

const KONSULTATION_VARDAG = konsultationstider(KONSULTATION_OPPET.vardag);
const KONSULTATION_LORDAG = konsultationstider(KONSULTATION_OPPET.lordag);

// Skifttider för sjuksköterskornas rullande fyra-veckorsschema, klippta mot
// konsultationsöppettiderna (vardag 10–18, lördag 10–16). Skift B och D behöver
// separata vardags-/lördagsregler eftersom lördagen stänger tidigare.
const SKIFT_A_VARDAG = konsultationstider({ fran: '10:00', till: '17:00' });
const SKIFT_B_VARDAG = SKIFT_A_VARDAG;
const SKIFT_B_LORDAG = konsultationstider({ fran: '10:00', till: '16:00' });
const SKIFT_C_VARDAG = KONSULTATION_VARDAG.filter((t) => t >= '11:00');
const SKIFT_D_VARDAG = KONSULTATION_VARDAG;
const SKIFT_D_LORDAG = SKIFT_B_LORDAG;

function defaultState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    // Riktigt Hair TP-team verifierat 2026-05-18.
    // Sjuksköterskor (Veronica, Clara, Wendela, Louise) lagdes till 2026-05-19
    // som bokningsbara resurser för konsultation, PRP, microneedling + efterkontroll.
    // De syns INTE på publik Team-sida (interna) — bara i operator-CCO-vyn.
    // Back-office (Måns, Felix, Britt-louise) är aldrig patient-bokningsbara.
    resources: [
      { id: 'fazli', label: 'Fazli Krasniqi', active: true, publicBookable: true },
      { id: 'egzona', label: 'Egzona Krasniqi', active: true, publicBookable: true },
      { id: 'arya', label: 'Dr. Arya Emami', active: true, publicBookable: true },
      /**
       * ORD-186 — operationskalendern som egen kolumn.
       *
       * Ägaren 2026-09-03: "transplantationer kan få en egen kolumn så som typ
       * jag eller Egzona."
       *
       * SÅ GÖR CLIENTO REDAN. Där ligger 8 778 bokningar på kalendern
       * "Transplantation" — inte på en person. Det speglar hur kliniken
       * faktiskt fungerar: ett ingrepp tar operationssalen och teamet i sex
       * timmar, och vem som står där bestäms senare.
       *
       * VAD DEN ERSÄTTER. ORD-185 importerade de 48 framtida
       * transplantationerna som klinikBREDA block, alltså på alla resurser.
       * Det var det försiktiga valet när det inte fanns någon kolumn att lägga
       * dem på — men det stängde också Aryas ögonlocksoperationer och Sabinas
       * ortopedi under varje transplantationsdag, vilket är fel. Med en egen
       * kolumn blockeras operationen, inte kliniken.
       *
       * INGEN PERSON. Därför ingen `role: 'Sjuksköterska'` — den rollen utlöser
       * städningen av gamla sköterskescheman längre ned i filen.
       *
       * publicBookable: false. Kunden bokar aldrig operationssalen direkt; den
       * vägen går via konsultation, offert, samtycke, avtal och förskott.
       */
      {
        id: 'transplantation',
        label: 'Transplantation',
        active: true,
        publicBookable: false,
        brand: 'hair-tp-clinic',
        role: 'Operation',
      },
      /**
       * ORD-195 — konsultationskalendrarna som egna kolumner.
       *
       * Ägaren 2026-09-04: "när det kommer till bokningar så har du all info du
       * behöver i Cliento, du behöver inte mig."
       *
       * DET STÄMDE — men svaret var inte det jag letade efter. Cliento har 16
       * framtida poster på kalendrarna "Fysisk konsultation" och "Online
       * konsultation". ORD-192 lämnade dem åt kliniken att lägga på rätt person.
       * Innan jag gjorde det själv mätte jag om historiken bär svaret.
       *
       * MÄTNINGEN, 39 686 bokningar. I de 1 423 fall där kunden hade sett flera
       * behandlare och "senast" pekade på en annan än "flest":
       *
       *   landade hos den de sett SENAST      464   32,6 %
       *   landade hos den de sett FLEST       411   28,9 %
       *   landade hos EN TREDJE person        548   38,5 %
       *
       * Den vanligaste utgången är alltså ingen av reglerna. Och i kontrollfallet
       * — kunden har bara sett EN person förut — blir det samma person igen bara
       * 67,4 % av gångerna (3 079 av 4 569). Kliniken bokar inte uppföljningar
       * efter relation. Den bokar efter vem som kan.
       *
       * DÄRFÖR INGEN GISSNING. Att härleda en behandlare ur historiken hade gett
       * ungefär två rätt på tre i bästa fall, och blockerat fel persons kalender
       * i resten. Kartfilen varnar för precis det: "Hellre en rapporterad lucka
       * än en blockering på fel person."
       *
       * SAMMA LÖSNING SOM FÖR OPERATIONEN. "Fysisk konsultation" och "Online
       * konsultation" ÄR kolumner i Cliento i dag, precis som "Transplantation".
       * Vem som bemannar dem avgörs senare. Med egna kolumner importeras alla 16
       * utan att någon person blockeras felaktigt — och kliniken fortsätter
       * bemanna dem som den redan gör.
       *
       * publicBookable: false. Kunden bokar en tjänst, inte en kolumn.
       */
      {
        id: 'konsultation-fysisk',
        label: 'Fysisk konsultation',
        active: true,
        publicBookable: false,
        brand: 'hair-tp-clinic',
        role: 'Konsultation',
      },
      {
        id: 'konsultation-online',
        label: 'Online konsultation',
        active: true,
        publicBookable: false,
        brand: 'hair-tp-clinic',
        role: 'Konsultation',
      },
      /**
       * ORD-182 — Curatiios två andra specialister.
       *
       * HANDOVERDOKUMENTET SA NIO SAKNADE BEHANDLARE. Det stämde inte, och
       * felet var att listan byggdes på TOTALER ur Cliento-historiken i stället
       * för på när personen senast arbetade. Mätt 2026-09-03, senaste bokning
       * per namn:
       *
       *   Sabina Nordvall      2026-10-09 (framtida)   256 senaste året
       *   Jessicka Bakhtiari   2025-11-28                7 senaste året
       *   Natsuko Martinsson   2025-02-12                0
       *   Mikaela Richter-Hill 2024-07-08                0
       *   Hind Alsharifi       2024-06-08                0
       *   Matilda Sellergren   2024-06-07                0
       *   Danyal Golgo         2024-03-25                0
       *   Emir Kapetanovic     2024-02-25                0
       *   Anna Klang           2021-11-02                0
       *
       * Sju av de nio slutade för ett till fem år sedan. Att lägga in dem hade
       * fyllt kalendern med personal som inte finns — precis det ägaren varnade
       * för samma dag: "michael är inte ens kvar och jobbar".
       *
       * FACIT ÄR HEMSIDAN, inte historiken. curatiio.com/priser listar i dag
       * tre specialister: "ORTOPEDI · DR. SABINA", "ÖGONLOCKSPLASTIK · DR.
       * ARYA", "ESTETIK · DR. JESSICA". Arya finns redan. De andra två saknades.
       *
       * Sabinas 256 bokningar det senaste året är i praktiken enbart ortopedisk
       * PRP/PRF — hon ÄR ortopedin. Att `ortho-treatment` och
       * `consultation-ortho` stod utan resurs betydde att Curatiios ortopedi
       * inte gick att boka alls.
       *
       * INTE TILLAGDA, med skäl:
       *   Bittan (Britt-louise)  324 bokningar/år men noll med tjänstenamn.
       *                          Står redan i kommentaren ovan som back-office,
       *                          "aldrig patient-bokningsbar".
       *   Andrea                 374 bokningar/år, noll med tjänstenamn. Motsvarar
       *                          legacy-cliento-60199 "Content · Andrea".
       *                          Innehåll/marknad, inte behandling.
       *
       * publicBookable: false. De ska kunna bokas av kliniken direkt; om de ska
       * synas i den publika katalogen är ett eget beslut (PLAN_A-listan).
       */
      {
        id: 'sabina',
        label: 'Dr. Sabina Nordvall',
        active: true,
        publicBookable: false,
        brand: 'curatiio',
        role: 'Läkare',
      },
      {
        id: 'jessica',
        label: 'Dr. Jessicka Bakhtiari',
        active: true,
        publicBookable: false,
        brand: 'curatiio',
        role: 'Läkare',
      },
      {
        id: 'veronica',
        label: 'Veronica',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
      {
        id: 'clara',
        label: 'Clara',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
      {
        id: 'wendela',
        label: 'Wendela',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
      {
        id: 'louise',
        label: 'Louise',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
    ],
    // Plan A (go-live): tre publika mötestyper. Övriga tjänster inaktiva tills vidare.
    //
    // OBS — `cancellationHours` nedan är INTE facit.
    //
    // ORD-173, 2026-09-03: jag läste de här siffrorna, rapporterade dem till
    // ägaren som gällande policy, ändrade dem, körde om — och ingenting hände.
    // Raderna är i praktiken döda för varje tjänst som har en override i
    // migration/booking-policy-defaults.json, eftersom det filens
    // `cancellationPolicyHours` som resolveServiceBookingPolicy läser först
    // (ccoBookingPolicy.js).
    //
    // Vill du veta vad som FAKTISKT gäller: bygg en store och fråga
    // resolveServiceBookingPolicy. Se tests/ops/avbokningsreglerEffektiva.test.js.
    services: [
      {
        id: 'consultation-online',
        label: 'Online möte',
        durationMinutes: KONSULTATION_MINUTER,
        active: true,
        publicBookable: true,
        meetingMode: 'online',
        brand: 'hairtp',
        minNoticeHours: 4,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 0,
      },
      {
        id: 'consultation-physical',
        label: 'Fysisk konsultation',
        durationMinutes: KONSULTATION_MINUTER,
        active: true,
        publicBookable: true,
        meetingMode: 'physical',
        brand: 'hairtp',
        minNoticeHours: 4,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 0,
      },
      {
        id: 'followup-transplant',
        label: 'Uppföljning hårtransplantation',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
        brand: 'hairtp',
        minNoticeHours: 4,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 0,
      },
      {
        id: 'consultation',
        label: 'Kostnadsfri konsultation',
        durationMinutes: 30,
        active: false,
        minNoticeHours: 4,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 0,
      },
      {
        id: 'fue',
        label: 'FUE-hårtransplantation',
        durationMinutes: 480,
        active: false,
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 39900,
        eveningMultiplier: 1.0,
        weekendMultiplier: 1.0,
      },
      {
        id: 'dhi',
        label: 'DHI-hårtransplantation',
        durationMinutes: 480,
        active: false,
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 49900,
        eveningMultiplier: 1.0,
        weekendMultiplier: 1.0,
      },
      {
        id: 'beard',
        label: 'Skäggtransplantation',
        durationMinutes: 360,
        active: false,
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 29900,
      },
      {
        id: 'eyebrow',
        label: 'Ögonbrynstransplantation',
        durationMinutes: 240,
        active: false,
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 24900,
      },
      /**
       * ORD-177 — Ärrtransplantation som egna tjänster.
       *
       * Ägaren 2026-09-03: "från 15 000kr DHI Ärr bör bli en egen tjänst för
       * både FUE och DHI."
       *
       * VARFÖR DE MÅSTE VARA EGNA. "DHI Ärr" fanns bara som variant
       * (dhi-7414) inmappad under `dhi` i triple-mappen. Lägsta-pris-regeln
       * plockade dess 15 000 kr och visade det som DHI:s pris — hela ORD-174.
       * Facit rättade priset men lämnade ärrbehandlingen omöjlig att boka.
       *
       * PRISET KOMMER FRÅN ÄGAREN, INTE FRÅN HEMSIDAN. Sidan
       * hairtpclinic.com/arrtransplantation publicerar inget pris alls, och
       * ärr står inte i prislistan. Därför ligger beloppet här och inte i
       * config/publicerade-priser.json — den filen är för publicerade priser,
       * och det här är ett internt.
       *
       * NOTERA MOTSÄGELSEN: hemsidan säger "FUE-metoden" om ärr, medan den
       * enda varianten i systemet heter DHI Ärr. Ägaren vill ha båda, så båda
       * finns här — men kliniken bör bestämma vilken som faktiskt erbjuds.
       *
       * LÄNGDEN ÄR INTE FASTSTÄLLD. 480 minuter är ärvt från
       * moderteknikerna, inte mätt. Att boka för mycket tid går att ta igen;
       * att boka för lite tvingar fram stress i ett ingrepp. Kliniken behöver
       * sätta den riktiga längden innan tjänsten öppnas för bokning.
       */
      /**
       * ORD-178 — DHI Skäggtransplantation.
       *
       * LUCKAN. Prislistan på hairtpclinic.com/priser säljer den med egen
       * rubrik, egen beskrivning ("Precisionsmetod med Choi-penna för exakt
       * vinkel och riktning i skägget") och egen graftstege från 52 000 till
       * 68 000 kr. Katalogen hade bara `beard` — FUE-skägget på 42 000.
       *
       * Behandlingen marknadsfördes alltså men gick inte att boka, och en kund
       * som valde "skägg" i systemet fick FUE-priset oavsett vad hen ville ha.
       *
       * Längden 360 min är HÄRLEDD, inte mätt: för huvudhår tar FUE och DHI
       * lika lång tid (480 min båda), alltså bör tekniken inte ändra längden
       * för skägg heller. Se config/tjanstelangder.json — bekräfta gärna.
       *
       * publicBookable: false. Ingreppet kräver ordination, och regeln längre
       * ned stänger det ändå — men det ska stå rätt redan här.
       */
      {
        id: 'dhi-beard',
        label: 'DHI Skäggtransplantation',
        durationMinutes: 360,
        active: true,
        publicBookable: false,
        brand: 'Hair TP Clinic',
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 52000,
        fromPriceSek: 52000,
        pricing: { basePriceSek: 52000, currency: 'SEK' },
      },
      {
        id: 'fue-scar',
        label: 'FUE Ärrtransplantation',
        durationMinutes: 480,
        active: true,
        publicBookable: false,
        brand: 'Hair TP Clinic',
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 15000,
        fromPriceSek: 15000,
        pricing: { basePriceSek: 15000, currency: 'SEK' },
        priceSource: 'internt_agaren_2026-09-03',
        durationSource: 'ARVD_EJ_FASTSTALLD',
      },
      {
        id: 'dhi-scar',
        label: 'DHI Ärrtransplantation',
        durationMinutes: 480,
        active: true,
        publicBookable: false,
        brand: 'Hair TP Clinic',
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 24,
        priceBase: 15000,
        fromPriceSek: 15000,
        pricing: { basePriceSek: 15000, currency: 'SEK' },
        priceSource: 'internt_agaren_2026-09-03',
        durationSource: 'ARVD_EJ_FASTSTALLD',
      },
      {
        id: 'prp-hair',
        label: 'PRP för hår',
        durationMinutes: 45,
        active: false,
        minNoticeHours: 24,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 3500,
        eveningMultiplier: 1.15,
        weekendMultiplier: 1.25,
      },
      {
        id: 'prp-skin',
        label: 'PRP för hud',
        durationMinutes: 60,
        active: false,
        minNoticeHours: 24,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 3500,
        eveningMultiplier: 1.15,
        weekendMultiplier: 1.25,
      },
      {
        id: 'microneedling',
        label: 'Microneedling + PRP',
        durationMinutes: 60,
        active: false,
        minNoticeHours: 24,
        maxAdvanceDays: 90,
        cancellationHours: 24,
        priceBase: 4500,
        eveningMultiplier: 1.15,
        weekendMultiplier: 1.25,
      },
      {
        id: 'followup',
        label: 'Efterkontroll',
        durationMinutes: 30,
        active: false,
        minNoticeHours: 4,
        maxAdvanceDays: 90,
        cancellationHours: 4,
        priceBase: 0,
      },
    ],
    // Schema: Fazli + Egzona delar hårtransplantations-veckan (max 2 patienter/dag enligt
    // kvalitetslöfte). Arya tar konsultation + ögonbrynstransplantation.
    // Tider följer kliniköppettiderna Mån-Fre 08-20, Lör 10-18.
    availabilityRules: [
      // ── Konsultation (alla tre, korta möten) ──
      {
        ruleId: 'rule-consultation-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: KONSULTATION_VARDAG,
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-consultation-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: KONSULTATION_VARDAG,
        locationLabel: 'Hair TP Clinic',
      },
      // ── De tre kvällsreglerna neutraliseras, inte raderas ──────────────
      //
      // rule-evening-cons-* och rule-evening-online-fazli togs bort ur källan
      // 2026-08-21. De försvann inte ur prod. Sammanslagningen längre ned
      // lägger till och uppdaterar regler som finns i defaults — den raderar
      // inte regler som slutat finnas här. Prod fortsatte alltså erbjuda
      // 17:30 och 18:00, som med 45-minutersbesök slutar 18:15 och 18:45,
      // efter stängning.
      //
      // Tom startTimes ger noll tider utan att röra raden. `active: false`
      // fungerar inte: sammanslagningen tvingar `active: true` för publikt
      // bokningsbara tjänster.
      //
      // Vardagsrutnätets sista pass är 16:45–17:30, så kvällen är täckt.
      {
        ruleId: 'rule-evening-cons-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: [],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-evening-cons-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: [],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-evening-online-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-online',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: [],
        locationLabel: 'Online (videomöte)',
      },
      // Lördagsreglerna låg tidigare i migration/booking-schedule-defaults.json
      // och inte här. Halva schemat i kod och halva i data gjorde att ingen
      // kunde se hela bilden utan att läsa båda — och kvällsreglerna som låg
      // där erbjöd 18:00, som slutar efter stängning. Ett schema, ett ställe.
      // Kvällarna behövs inte längre: vardagsrutnätet går till 17:15.
      {
        ruleId: 'rule-weekend-cons-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-physical',
        weekdays: [6],
        startTimes: KONSULTATION_LORDAG,
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-weekend-cons-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation-physical',
        weekdays: [6],
        startTimes: KONSULTATION_LORDAG,
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-consultation-arya',
        resourceId: 'arya',
        serviceId: 'consultation-physical',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '13:00', '15:00'],
        locationLabel: 'Hair TP Clinic',
      },
      // ── Online möte (Plan A1) ──
      {
        ruleId: 'rule-consultation-online-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-online',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: KONSULTATION_VARDAG,
        locationLabel: 'Online (videomöte)',
      },
      {
        ruleId: 'rule-consultation-online-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation-online',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: KONSULTATION_VARDAG,
        locationLabel: 'Online (videomöte)',
      },
      {
        ruleId: 'rule-consultation-online-arya',
        resourceId: 'arya',
        serviceId: 'consultation-online',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '13:00', '15:00'],
        locationLabel: 'Online (videomöte)',
      },
      // ── Hårtransplantation (inaktiv i Plan A — regler kvar för intern migration) ──
      {
        ruleId: 'rule-fue-fazli',
        resourceId: 'fazli',
        serviceId: 'fue',
        weekdays: [2, 4],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-fue-egzona',
        resourceId: 'egzona',
        serviceId: 'fue',
        weekdays: [1, 3],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-dhi-fazli',
        resourceId: 'fazli',
        serviceId: 'dhi',
        weekdays: [5],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-dhi-egzona',
        resourceId: 'egzona',
        serviceId: 'dhi',
        weekdays: [5],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-beard-fazli',
        resourceId: 'fazli',
        serviceId: 'beard',
        weekdays: [3],
        startTimes: ['10:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── Ögonbrynstransplantation (Arya, ögonplastikkirurg) ──
      {
        ruleId: 'rule-eyebrow-arya',
        resourceId: 'arya',
        serviceId: 'eyebrow',
        weekdays: [3, 5],
        startTimes: ['09:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── PRP-behandlingar (alla tre kan göra) ──
      {
        ruleId: 'rule-prp-hair-fazli',
        resourceId: 'fazli',
        serviceId: 'prp-hair',
        weekdays: [2, 4],
        startTimes: ['15:00', '16:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-hair-egzona',
        resourceId: 'egzona',
        serviceId: 'prp-hair',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '15:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-skin-arya',
        resourceId: 'arya',
        serviceId: 'prp-skin',
        weekdays: [1, 3, 5],
        startTimes: ['11:00', '13:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── Microneedling + PRP (Arya) ──
      {
        ruleId: 'rule-microneedling-arya',
        resourceId: 'arya',
        serviceId: 'microneedling',
        weekdays: [1, 5],
        startTimes: ['12:00', '16:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── Efterkontroller (alla tre) ──
      {
        ruleId: 'rule-followup-fazli',
        resourceId: 'fazli',
        serviceId: 'followup-transplant',
        weekdays: [1, 3, 5],
        startTimes: ['17:00', '17:30'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-followup-egzona',
        resourceId: 'egzona',
        serviceId: 'followup-transplant',
        weekdays: [2, 4],
        startTimes: ['17:00', '17:30'],
        locationLabel: 'Hair TP Clinic',
      },

      // ── Sjuksköterskor (Veronica, Clara, Wendela, Louise) ──
      // Cykliska fyra-veckorsscheman för konsultation. Övriga tjänster avstängda.
      ...buildNurseCyclicConsultationRules(),

      // — Veronica: prp-hair Mån/Ons, prp-skin Fre, microneedling Tor, followup Tis —
      {
        ruleId: 'rule-prp-hair-veronica',
        resourceId: 'veronica',
        serviceId: 'prp-hair',
        weekdays: [1, 3],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-prp-skin-veronica',
        resourceId: 'veronica',
        serviceId: 'prp-skin',
        weekdays: [5],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-micro-veronica',
        resourceId: 'veronica',
        serviceId: 'microneedling',
        weekdays: [4],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-followup-veronica',
        resourceId: 'veronica',
        serviceId: 'followup-transplant',
        weekdays: [2],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },

      // — Clara: prp-hair Tis/Tor, prp-skin Mån, microneedling Ons, followup Fre —
      {
        ruleId: 'rule-prp-hair-clara',
        resourceId: 'clara',
        serviceId: 'prp-hair',
        weekdays: [2, 4],
        startTimes: ['10:30', '13:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-prp-skin-clara',
        resourceId: 'clara',
        serviceId: 'prp-skin',
        weekdays: [1],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-micro-clara',
        resourceId: 'clara',
        serviceId: 'microneedling',
        weekdays: [3],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-followup-clara',
        resourceId: 'clara',
        serviceId: 'followup-transplant',
        weekdays: [5],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },

      // — Wendela: prp-hair Mån/Fre, prp-skin Ons, microneedling Tis, followup Tor —
      {
        ruleId: 'rule-prp-hair-wendela',
        resourceId: 'wendela',
        serviceId: 'prp-hair',
        weekdays: [1, 5],
        startTimes: ['11:30', '14:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-prp-skin-wendela',
        resourceId: 'wendela',
        serviceId: 'prp-skin',
        weekdays: [3],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-micro-wendela',
        resourceId: 'wendela',
        serviceId: 'microneedling',
        weekdays: [2],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-followup-wendela',
        resourceId: 'wendela',
        serviceId: 'followup-transplant',
        weekdays: [4],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },

      // — Louise: prp-hair Ons, prp-skin Tor, microneedling Fre, followup Mån —
      {
        ruleId: 'rule-prp-hair-louise',
        resourceId: 'louise',
        serviceId: 'prp-hair',
        weekdays: [3],
        startTimes: ['10:30', '13:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-prp-skin-louise',
        resourceId: 'louise',
        serviceId: 'prp-skin',
        weekdays: [4],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-micro-louise',
        resourceId: 'louise',
        serviceId: 'microneedling',
        weekdays: [5],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
      {
        ruleId: 'rule-followup-louise',
        resourceId: 'louise',
        serviceId: 'followup-transplant',
        weekdays: [1],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
        managedBy: 'staff',
      },
    ],
    reservations: [],
    bookings: [],
    calendarBlocks: [
      {
        blockId: 'block-lunch-all',
        label: 'Lunch',
        blockType: 'lunch',
        resourceIds: [],
        weekdays: [1, 2, 3, 4, 5],
        startTime: '12:00',
        endTime: '13:00',
        dateFrom: '2024-01-01',
        dateTo: '2030-12-31',
        active: true,
      },
    ],
  };
}

function migratePlanASchema(state) {
  const defaults = defaultState();
  let changed = false;
  /**
   * ORD-193 — nya standardresurser måste faktiskt komma in i befintligt state.
   *
   * MITT FEL, UPPTÄCKT I PROD. ORD-182 la till Sabina och Jessica, ORD-186 la
   * till transplantationskolumnen. Alla tre testade grönt — och ingen av dem
   * fanns i produktion efter deploy.
   *
   * Skälet: migreringen nedan itererar `defaults.services` men aldrig
   * `defaults.resources`. En ny standardTJÄNST kommer in i ett befintligt state;
   * en ny standardRESURS gör det inte. Testerna byggde en tom store, där
   * defaults blir hela sanningen, så skillnaden syntes aldrig.
   *
   * Det är exakt samma feltyp som jag redan skrivit om två gånger i dag: mät det
   * upplösta värdet i den miljö det gäller, inte i en nybyggd. Jag gjorde det
   * för tjänsterna och glömde resurserna.
   *
   * ADDITIVT, ALDRIG ÖVERSKRIVANDE. Bara resurser vars id saknas läggs till.
   * Personalen kan ha ändrat etikett eller defaultRoomId på en befintlig rad,
   * och en deploy ska inte slå tillbaka det.
   */
  const resourcesById = new Map(state.resources.map((item) => [item.id, item]));
  const tillagdaResurser = [];
  for (const res of asArray(defaults.resources)) {
    const id = normalizeText(res?.id);
    if (!id || resourcesById.has(id)) continue;
    resourcesById.set(id, res);
    tillagdaResurser.push(id);
    changed = true;
  }
  if (tillagdaResurser.length) {
    state.resources = Array.from(resourcesById.values()).map(normalizeResource).filter(Boolean);
    console.log(`[booking-engine] la till nya standardresurser: ${tillagdaResurser.join(', ')}`);
  }

  const servicesById = new Map(state.services.map((item) => [item.id, item]));

  /**
   * ORD-194 — en längd personalen satt får inte skrivas tillbaka av en deploy.
   *
   * Raderna nedan slår ihop standardtjänsten med den befintliga som
   * `{ ...svc, ...existing, ...svc }` — standardvärdet spritt SIST, alltså
   * vinner det. Det var precis därför ägarens handredigering inte överlevde:
   * uppmätt i ORD-178 blev 222 minuter till 480 igen efter omstart, tyst.
   *
   * Den här hjälparen plockar tillbaka de fält som en människa har bestämt.
   * Bara längden, och bara när `durationSource === 'staff'` — allt annat i
   * standardposten ska fortsätta vinna, för det är så katalogen hålls i takt
   * med koden.
   */
  const bevaraPersonalensLangd = (next, existing) => {
    if (existing?.durationSource !== 'staff') return next;
    return {
      ...next,
      durationMinutes: existing.durationMinutes,
      durationSource: 'staff',
      durationSetAt: existing.durationSetAt,
      durationSetBy: existing.durationSetBy,
    };
  };

  for (const svc of defaults.services) {
    const id = normalizeText(svc.id);
    const existing = servicesById.get(id);
    const canonicalId = resolveServiceRegisterAlias(id);
    if (canonicalId !== id) {
      const next = bevaraPersonalensLangd(
        { ...svc, ...(existing || {}), ...svc, active: false, publicBookable: false },
        existing
      );
      if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) {
        servicesById.set(id, next);
        changed = true;
      }
      continue;
    }
    if (isServiceRegisterPublicBookable(id)) {
      const next = bevaraPersonalensLangd(
        { ...svc, ...(existing || {}), ...svc, active: true, publicBookable: true },
        existing
      );
      if (JSON.stringify(existing) !== JSON.stringify(next)) {
        servicesById.set(id, next);
        changed = true;
      }
      continue;
    }
    /**
     * ORD-177 — aktiv är inte samma sak som publik. Igen.
     *
     * Raderna här nedanför tvingade `active: false` på varje tjänst som inte
     * står som publikt bokningsbar i tjänsteregistret. Det är exakt samma
     * sammanblandning som ORD-174 rättade i legacyCatalogRuntime: en tjänst
     * kliniken utför men som kunden inte får boka själv blev osynlig för ALLA.
     *
     * Registret bestämmer PUBLIK bokning. Det ska det fortsätta göra —
     * `publicBookable: false` står kvar nedan. Men om standardkatalogen
     * uttryckligen säger `active: true` betyder det "kliniken utför den här",
     * och det är inte registrets fråga.
     *
     * Träffar i dag: fue-scar och dhi-scar. Övriga standardtjänster som inte
     * är publika står redan på active: false och rörs inte.
     */
    const klinikenUtforDen = svc.active === true;
    if (existing && existing.active !== false && !klinikenUtforDen) {
      servicesById.set(id, { ...existing, active: false, publicBookable: false });
      changed = true;
    } else if (!existing) {
      servicesById.set(id, { ...svc, active: klinikenUtforDen, publicBookable: false });
      changed = true;
    } else if (klinikenUtforDen && existing.active !== true) {
      servicesById.set(id, { ...existing, active: true, publicBookable: false });
      changed = true;
    }
  }

  state.services = Array.from(servicesById.values()).map(normalizeService).filter(Boolean);

  const rulesById = new Map(state.availabilityRules.map((item) => [item.ruleId, item]));

  for (const rule of state.availabilityRules) {
    const mapped = resolveServiceRegisterAlias(rule.serviceId);
    if (!mapped || rule.serviceId === mapped) continue;
    if (rule.managedBy === 'staff') continue;
    rulesById.set(rule.ruleId, { ...rule, serviceId: mapped });
    changed = true;
  }

  for (const rule of defaults.availabilityRules) {
    const serviceId = resolveServiceRegisterAlias(rule.serviceId);
    const canonicalRule = { ...rule, serviceId };
    const existing = rulesById.get(canonicalRule.ruleId);
    if (existing?.managedBy === 'staff') continue;
    if (isServiceRegisterPublicBookable(serviceId)) {
      const next = {
        ...(existing || {}),
        ...canonicalRule,
        active: canonicalRule.active !== false,
      };
      if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) {
        rulesById.set(rule.ruleId, next);
        changed = true;
      }
      continue;
    }
    if (existing && existing.active !== false) {
      rulesById.set(rule.ruleId, { ...existing, active: false });
      changed = true;
    }
  }

  // Äldre sjuksköterskeregler (fasta veckoschema, inga cykliska fält) ska inte
  // tända sig igen vid deploy. Nya cykliska regler har cycleWeeks/cycleStart och
  // managedBy: 'staff' och får vara aktiva.
  const staffResourceIds = new Set(
    state.resources
      .filter((r) => !r.publicBookable && normalizeKey(r.role) === 'sjuksköterska')
      .map((r) => r.id)
  );
  for (const [ruleId, rule] of rulesById) {
    if (!staffResourceIds.has(rule.resourceId)) continue;
    if (rule.cycleWeeks && rule.cycleStart && rule.managedBy === 'staff') continue;
    /**
     * ORD-181 — en regel någon LAGT IN släcks inte av städningen.
     *
     * Blocket ovanför finns för att gamla fasta sköterskescheman inte ska
     * tända sig igen vid deploy. Villkoret var "har cykelfält och managedBy
     * staff". Men `managedBy: 'staff'` sätts även av koden själv, och en
     * enkel veckoregel som personalen lägger in via API:t har inga cykelfält.
     *
     * Utan undantaget hade varje tid kliniken lade in på en sköterska släckts
     * tyst vid nästa omstart — exakt samma fälla som längderna (ORD-178), och
     * lika svår att upptäcka: den ser sparad ut tills servern startar om.
     *
     * `createdVia: 'staff_api'` sätts bara av upsertAvailabilityRule, alltså
     * bara när en människa faktiskt lagt in tiden.
     */
    if (rule.createdVia === 'staff_api') continue;
    const next = { ...rule, active: false, managedBy: 'staff' };
    if (JSON.stringify(rule) !== JSON.stringify(next)) {
      rulesById.set(ruleId, next);
      changed = true;
    }
  }

  state.availabilityRules = Array.from(rulesById.values())
    .map(normalizeAvailabilityRule)
    .filter(Boolean);
  return changed;
}

function normalizeResource(input = {}) {
  const safe = asObject(input);
  const id = normalizeText(safe.id);
  if (!id) return null;
  const publicBookable = safe.publicBookable === true || PLAN_A_PUBLIC_RESOURCE_IDS.includes(id);
  return {
    id,
    label: normalizeText(safe.label || safe.name || id),
    active: safe.active !== false,
    publicBookable,
    role: normalizeText(safe.role) || undefined,
    /**
     * ORD-182 — resurser kan tillhöra ett varumärke.
     *
     * Fältet fanns inte. `resourceMatchesBrand` läser `resource.brand` och
     * behandlar saknad brand som Hair TP — men normaliseringen tappade fältet,
     * så INGEN resurs kunde någonsin tillhöra Curatiio. Testet
     * "listPublicResources med brand=curatiio returnerar inga Hair TP-resurser"
     * var grönt av fel skäl: det fanns inget att filtrera.
     *
     * Utan fältet hamnar Curatiios två specialister i Hair TP:s resurslista.
     */
    brand: normalizeText(safe.brand) || undefined,
    // Valfritt hem-rum: personalens bokningar defaultar hit om inget rum anges.
    defaultRoomId: normalizeText(safe.defaultRoomId) || undefined,
    catalogSource: normalizeText(safe.catalogSource) || undefined,
    legacyMapping: asObject(safe.legacyMapping).cliento ? asObject(safe.legacyMapping) : undefined,
  };
}

function normalizeService(input = {}) {
  const safe = asObject(input);
  const id = normalizeText(safe.id);
  if (!id) return null;
  return applyBookingPolicyToService({
    id,
    label: normalizeText(safe.label || safe.title || safe.name || id),
    durationMinutes: Math.max(15, Number(safe.durationMinutes) || 60),
    active: safe.active !== false,
    publicBookable: safe.publicBookable === true,
    meetingMode: normalizeText(safe.meetingMode) || undefined,
    minNoticeMinutes: safe.minNoticeMinutes,
    maxBookingDaysAhead: safe.maxBookingDaysAhead,
    cancellationPolicyHours: safe.cancellationPolicyHours,
    brand: normalizeText(safe.brand) || undefined,
    legacyMapping: asObject(safe.legacyMapping).arcanaServiceId
      ? asObject(safe.legacyMapping)
      : undefined,
    encounterType: normalizeText(safe.encounterType) || undefined,
    bookingMethodLabel: normalizeText(safe.bookingMethodLabel) || undefined,
    offerTemplateKey: normalizeText(safe.offerTemplateKey) || undefined,
    documentRequirementKey: normalizeText(safe.documentRequirementKey) || undefined,
    coolingOffRef: Object.keys(asObject(safe.coolingOffRef)).length
      ? asObject(safe.coolingOffRef)
      : undefined,
    coolingOffDays: Number.isFinite(Number(safe.coolingOffDays))
      ? Number(safe.coolingOffDays)
      : undefined,
    coolingOffType: normalizeText(safe.coolingOffType) || undefined,
    consentBindings: Object.keys(asObject(safe.consentBindings)).length
      ? asObject(safe.consentBindings)
      : undefined,
    serviceRegister: Object.keys(asObject(safe.serviceRegister)).length
      ? asObject(safe.serviceRegister)
      : undefined,
    catalogSource: normalizeText(safe.catalogSource) || undefined,
    vipTokenRequired: safe.vipTokenRequired === true,
    isAddon: safe.isAddon === true,
    pricing: asObject(safe.pricing).basePriceSek != null ? asObject(safe.pricing) : undefined,
    fromPriceSek: safe.fromPriceSek,
    /**
     * ORD-194 — vem som satt längden, och när.
     *
     * `durationSource: 'staff'` betyder att en människa har bestämt talet. Det
     * fältet är hela mekanismen: utan det kan koden inte skilja en längd
     * personalen satt från en längd som råkar ligga kvar i state, och då finns
     * inget sätt att låta den ena vinna över den andra.
     *
     * Måste bevaras här. Normaliseringen körs om vid varje läsning från disk,
     * och ett fält som tappas där gör att nästa omstart skriver tillbaka
     * standardvärdet — precis det som hände när ägaren försökte sätta längden
     * för hand (mätt i ORD-178: 222 min blev 480 igen efter omstart).
     */
    durationSource: normalizeText(safe.durationSource) || undefined,
    durationSetAt: normalizeIso(safe.durationSetAt) || undefined,
    durationSetBy: normalizeText(safe.durationSetBy) || undefined,
  });
}

function normalizeAvailabilityRule(input = {}) {
  const safe = asObject(input);
  const resourceId = normalizeText(safe.resourceId);
  const serviceId = normalizeText(safe.serviceId);
  if (!resourceId || !serviceId) return null;

  const cycleWeeks =
    Number.isInteger(safe.cycleWeeks) && safe.cycleWeeks > 0 ? safe.cycleWeeks : undefined;
  let cycleWeek;
  if (
    cycleWeeks &&
    Number.isInteger(safe.cycleWeek) &&
    safe.cycleWeek >= 1 &&
    safe.cycleWeek <= cycleWeeks
  ) {
    cycleWeek = safe.cycleWeek;
  }

  return {
    ruleId: normalizeText(safe.ruleId) || crypto.randomUUID(),
    resourceId,
    serviceId,
    weekdays: normalizeWeekdays(safe.weekdays),
    startTimes: normalizeStartTimes(safe.startTimes),
    locationLabel: normalizeText(safe.locationLabel || 'Hair TP Clinic'),
    active: safe.active !== false,
    managedBy: normalizeText(safe.managedBy) || undefined,
    // ORD-181: vem som skapade regeln, inte bara vem som förvaltar den.
    // `managedBy: 'staff'` sätts även på regler som koden själv skrivit — det
    // säger alltså inte om en människa lagt in tiden. `createdVia` gör det, och
    // det är den skillnaden som avgör om sköterskeblocket längre ned får
    // släcka regeln. Utan fältet här hade normaliseringen tappat det vid varje
    // omstart och regeln släckts tyst.
    createdVia: normalizeText(safe.createdVia) || undefined,
    cycleWeeks,
    cycleWeek,
    cycleStart: normalizeIso(safe.cycleStart) || undefined,
  };
}

function normalizeEngineSlot(slot = {}, services = [], resources = []) {
  const safe = asObject(slot);
  const startsAt = normalizeIso(safe.startsAt || safe.start);
  const resourceId = normalizeText(safe.resourceId);
  const serviceId = normalizeText(safe.serviceId);
  if (!startsAt || !resourceId || !serviceId) return null;
  const service =
    asArray(services).find((item) => normalizeText(item.id) === serviceId) ||
    asObject(safe.service);
  const resource =
    asArray(resources).find((item) => normalizeText(item.id) === resourceId) ||
    asObject(safe.resource);
  return {
    slotId: normalizeText(safe.slotId || safe.id) || toSlotId({ resourceId, serviceId, startsAt }),
    startsAt,
    endsAt:
      normalizeIso(safe.endsAt || safe.end) ||
      addMinutes(startsAt, Number(service.durationMinutes) || 60),
    resourceId,
    resourceLabel: normalizeText(safe.resourceLabel || resource.label || resource.name),
    serviceId,
    serviceLabel: normalizeText(safe.serviceLabel || service.label || service.title),
    // Behandlingsrum — valfritt. Rummen definieras i ccoSettingsStore.rooms;
    // här bevaras bara vilket rum bokningen är knuten till (id + namn).
    roomId: normalizeText(safe.roomId) || undefined,
    roomLabel: normalizeText(safe.roomLabel || safe.roomName) || undefined,
    locationLabel: normalizeText(safe.locationLabel || safe.locationName || 'Hair TP Clinic'),
    meetingMode: normalizeText(safe.meetingMode || service.meetingMode) || undefined,
    durationMinutes: Number(service.durationMinutes) || 60,
    source: 'cco_engine',
  };
}

function normalizeReservation(input = {}, { services = [], resources = [] } = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
  if (!tenantId || !conversationId || !customerEmail || !slot) return null;
  const result = {
    reservationId: normalizeText(safe.reservationId) || crypto.randomUUID(),
    tenantId,
    workspaceId: normalizeText(safe.workspaceId) || 'major-arcana-preview',
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    slot,
    status: normalizeKey(safe.status) || 'active',
    source: normalizeText(safe.source) || 'cco_engine',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    // Permanent markering för RFC-2606 / klinikinterna testadresser.
    // Sätts automatiskt vid skapande och kan aldrig tvättas bort av en uppdatering.
    isTestData: safe.isTestData === true || isTestDataEmail(customerEmail),
    createdAt: normalizeIso(safe.createdAt) || nowIso(),
    updatedAt: normalizeIso(safe.updatedAt) || nowIso(),
    expiresAt: normalizeIso(safe.expiresAt),
  };
  reportDroppedKeys(safe, result, {
    store: 'ccoBookingEngineStore',
    normalizer: 'normalizeReservation',
  });
  return result;
}

/**
 * ORD-183 — telefonnummer till E.164, eller tomt.
 *
 * Cliento levererar redan E.164 på i praktiken alla poster. Men bokningar kan
 * också komma från formulär och personal, och där skrivs svenska nummer på ett
 * dussin sätt: 070-123 45 67, 0701234567, 46701234567.
 *
 * Reglerna är avsiktligt snäva:
 *   +NNN…       behålls om längden är rimlig
 *   0NNNNNNNN   svenskt nationellt → +46, nollan bort
 *   allt annat  tom sträng
 *
 * INGEN GISSNING. Ett nummer utan landskod som inte börjar på 0 kan vara
 * svenskt, utländskt eller ett internnummer — och att anta +46 skulle skicka
 * påminnelsen till någon annan. Tomt är ett ärligt "vi vet inte".
 */
function normalizeTelefonE164(value) {
  const rawt = normalizeText(value);
  if (!rawt) return '';
  // Behåll ett inledande plus, kasta allt annat som inte är siffra.
  const plus = rawt.startsWith('+');
  const siffror = rawt.replace(/\D/g, '');
  if (!siffror) return '';

  if (plus) {
    // E.164 tillåter högst 15 siffror. Kortare än 8 är inget mobilnummer.
    if (siffror.length < 8 || siffror.length > 15) return '';
    return `+${siffror}`;
  }
  if (siffror.startsWith('46') && siffror.length >= 10 && siffror.length <= 13) {
    return `+${siffror}`;
  }
  if (siffror.startsWith('0') && siffror.length >= 9 && siffror.length <= 11) {
    return `+46${siffror.slice(1)}`;
  }
  return '';
}

/**
 * ORD-183 — bokningens status, med uteblivet besök som eget begrepp.
 *
 * MÄTT 2026-09-03 i Cliento: completed 34 588, cancelled 3 188, no_show 1 413,
 * upcoming 496. Motorn kände bara `confirmed` och `cancelled`.
 *
 * VARFÖR no_show INTE ÄR EN SORTS AVBOKNING. En avbokning är kundens besked i
 * tid; ett uteblivet besök är en tom stol som ingen fick veta om. De har olika
 * ekonomi (förskottet behålls), olika uppföljning och olika betydelse i
 * statistiken. Slås de ihop går 1 413 händelser att aldrig skilja ut igen.
 *
 * `completed` skiljs från `confirmed` av samma skäl: en bekräftad tid i
 * framtiden och ett genomfört besök är inte samma sak, och bara det ena går
 * att avboka.
 *
 * Okänd status faller till `confirmed`, som förut — men den listan är nu
 * uttalad i stället för underförstådd.
 */
const BOKNINGSSTATUS = Object.freeze(['confirmed', 'completed', 'cancelled', 'no_show']);

function normalizeBookingStatus(value) {
  const status = normalizeKey(value);
  return BOKNINGSSTATUS.includes(status) ? status : 'confirmed';
}

function normalizeBookingRecord(input = {}, { services = [], resources = [] } = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
  if (!tenantId || !conversationId || !customerEmail || !slot) return null;
  const result = {
    bookingId: normalizeText(safe.bookingId) || crypto.randomUUID(),
    tenantId,
    workspaceId: normalizeText(safe.workspaceId) || 'major-arcana-preview',
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    /**
     * ORD-183 — telefonnumret, utan vilket ingen påminnelse kan skickas.
     *
     * MÄTT 2026-09-03: Cliento har telefonnummer på 28 450 av 39 685 bokningar
     * (72 %), praktiskt taget alla i E.164 — 28 118 börjar på +46, 332 på annan
     * landskod, noll i nationellt format. Motorns bokningspost hade inget
     * telefonfält alls.
     *
     * En klinik med 26 besök om dagen och 1 413 historiska uteblivna kan inte
     * gå live utan påminnelser, och en påminnelse behöver ett nummer.
     *
     * NORMALISERAS TILL E.164, ELLER INTE ALLS. `normalizeTelefonE164`
     * returnerar tom sträng för allt den inte säkert kan tolka. Ett halvt
     * tolkat nummer är värre än inget: det ser ut som en kontaktväg och är det
     * inte. Bättre att påminnelsen uteblir synligt än att den går till fel
     * mottagare.
     */
    customerPhone: normalizeTelefonE164(safe.customerPhone || safe.phone),
    slot,
    status: normalizeBookingStatus(safe.status),
    source: normalizeText(safe.source) || 'cco_engine',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    // Permanent markering för RFC-2606 / klinikinterna testadresser.
    // Sätts automatiskt vid skapande och kan aldrig tvättas bort av en uppdatering.
    isTestData: safe.isTestData === true || isTestDataEmail(customerEmail),
    canonicalPatientId: normalizeText(safe.canonicalPatientId || safe.patientId),
    encounterId: normalizeText(safe.encounterId),
    practitionerId: normalizeText(safe.practitionerId),
    practitionerLabel: normalizeText(safe.practitionerLabel),
    idempotencyKey: normalizeText(safe.idempotencyKey),
    requestFingerprint: normalizeText(safe.requestFingerprint),
    conversationKey: normalizeText(safe.conversationKey) || null,
    confirmedAt: normalizeIso(safe.confirmedAt) || nowIso(),
    cancelledAt: normalizeIso(safe.cancelledAt),
    cancellationReason: normalizeText(safe.cancellationReason),
    // F2-3 audit-fält (2026-05-28): vem avbokade och om bokningen kommer från
    // en omboknings-sekvens (rescheduledFromBookingId pekar på den
    // föregående cancellerade bokningen i samma kedja). cancelledBy är
    // 'patient_token' | 'operator' | 'rebook' | 'auto' | '' — fritext för
    // framtida kanaler. Tomma strängar = okänt / tidigt-utan-audit.
    cancelledBy: normalizeText(safe.cancelledBy),
    // ORD-183: när besöket märktes som genomfört eller uteblivet, och av vem.
    // reportDroppedKeys larmar annars om att fälten faller bort — och de ska
    // finnas: "vem satte den här på utebliven" är en fråga som kommer.
    outcomeAt: normalizeIso(safe.outcomeAt),
    outcomeBy: normalizeText(safe.outcomeBy),
    /**
     * ORD-190 — token för kundens avboka/omboka-länk.
     *
     * LAGRAD SLUMP, inte härledd. Den gamla tokenen räknades fram som
     * sha256(bookingId + ARCANA_TOKEN_SALT || 'arcana-booking-salt'), och
     * saltet är INTE satt i produktion — alltså var det literalen i källkoden.
     * Vem som helst med kodbasen och ett boknings-id kunde räkna fram
     * avbokningslänken.
     *
     * Sätts en gång vid bekräftelse och bevaras vid varje senare normalisering.
     * Bevarandet är hela poängen: normaliseringen körs om vid varje läsning från
     * disk, och ett fält som tappas där hade ogiltigförklarat länken i ett mejl
     * som redan skickats.
     */
    bookingActionToken: normalizeText(safe.bookingActionToken),
    rescheduledAt: normalizeIso(safe.rescheduledAt),
    rescheduledFromBookingId: normalizeText(safe.rescheduledFromBookingId),
    createdAt: normalizeIso(safe.createdAt) || nowIso(),
    updatedAt: normalizeIso(safe.updatedAt) || nowIso(),
  };
  reportDroppedKeys(safe, result, {
    store: 'ccoBookingEngineStore',
    normalizer: 'normalizeBookingRecord',
  });
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isReservationExpired(reservation = {}, referenceMs = Date.now()) {
  const expiresAtMs = Date.parse(normalizeText(reservation.expiresAt));
  return Number.isFinite(expiresAtMs) && expiresAtMs <= referenceMs;
}

function getReservationExpiryMeta(reservations = [], referenceMs = Date.now()) {
  const activeReservations = asArray(reservations).filter(
    (item) => normalizeKey(item?.status) === 'active'
  );
  const nextExpiringReservation = activeReservations
    .map((item) => ({
      reservation: item,
      expiresAt: normalizeIso(item.expiresAt),
      expiresAtMs: Date.parse(normalizeText(item.expiresAt)),
    }))
    .filter((item) => Number.isFinite(item.expiresAtMs))
    .sort((left, right) => left.expiresAtMs - right.expiresAtMs)[0];
  if (!nextExpiringReservation) {
    return {
      nextExpiryAt: '',
      expiresInMinutes: null,
      expiresSoon: false,
    };
  }
  const expiresInMinutes = Math.max(
    0,
    Math.ceil((nextExpiringReservation.expiresAtMs - referenceMs) / (60 * 1000))
  );
  return {
    nextExpiryAt: nextExpiringReservation.expiresAt,
    expiresInMinutes,
    expiresSoon: expiresInMinutes <= 120,
  };
}

function buildDateRange(fromDate, toDate) {
  const start = normalizeDateOnly(fromDate);
  const end = normalizeDateOnly(toDate);
  if (!start || !end) return [];
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  const days = [];
  for (let current = startMs; current <= endMs; current += 24 * 60 * 60 * 1000) {
    days.push(new Date(current));
  }
  return days;
}

function normalizeCalendarBlock(input = {}) {
  const safe = asObject(input);
  const blockId = normalizeText(safe.blockId) || crypto.randomUUID();
  const dateFrom = normalizeDateOnly(safe.dateFrom) || '2024-01-01';
  const dateTo = normalizeDateOnly(safe.dateTo) || dateFrom;
  const startTime = normalizeStartTimes([safe.startTime || safe.start || '09:00'])[0];
  const endTime = normalizeStartTimes([safe.endTime || safe.end || '10:00'])[0];
  if (!blockId || !startTime || !endTime) return null;
  return {
    blockId,
    label: normalizeText(safe.label) || 'Blockerad tid',
    blockType: normalizeText(safe.blockType) || 'closed',
    resourceIds: asArray(safe.resourceIds || safe.resourceId)
      .map((item) => normalizeText(item))
      .filter(Boolean),
    weekdays: normalizeWeekdays(safe.weekdays),
    startTime,
    endTime,
    dateFrom,
    dateTo: dateTo >= dateFrom ? dateTo : dateFrom,
    active: safe.active !== false,
  };
}

function buildBlockInterval({ day, block, resourceId, resourceLabel }) {
  const dateOnly = day.toISOString().slice(0, 10);
  // Blockets tider är klinikens väggklocka. Tidigare klistrades ett 'Z' på,
  // vilket gjorde lunchen 12:00–13:00 till 14:00–15:00 svensk sommartid —
  // den täckte alltså inte lunchen. Se src/ops/klinikTid.js.
  const startsAt = klinikTidTillUtc(dateOnly, block.startTime);
  const endsAt = klinikTidTillUtc(dateOnly, block.endTime);
  if (!startsAt || !endsAt) return null;
  if (Date.parse(startsAt) >= Date.parse(endsAt)) return null;
  return {
    blockId: block.blockId,
    label: block.label,
    blockType: block.blockType,
    resourceId: normalizeText(resourceId),
    resourceLabel: normalizeText(resourceLabel),
    startsAt,
    endsAt,
    kind: 'block',
  };
}

function expandCalendarBlocksForRange(blocks = [], fromDate, toDate, resources = [], resIds = []) {
  const wantedResourceIds = normalizeText(resIds)
    ? normalizeText(resIds)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const activeResources = asArray(resources).filter((item) => item.active !== false);
  const targetResources = wantedResourceIds.length
    ? activeResources.filter((item) => wantedResourceIds.includes(item.id))
    : activeResources;
  const expanded = [];
  buildDateRange(fromDate, toDate).forEach((day) => {
    const iso = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    asArray(blocks)
      .filter((block) => block.active !== false)
      .filter((block) => iso >= block.dateFrom && iso <= block.dateTo)
      .filter((block) => asArray(block.weekdays).includes(weekday))
      .forEach((block) => {
        const scopedResources = block.resourceIds.length
          ? targetResources.filter((item) => block.resourceIds.includes(item.id))
          : targetResources;
        scopedResources.forEach((resource) => {
          const interval = buildBlockInterval({
            day,
            block,
            resourceId: resource.id,
            resourceLabel: resource.label,
          });
          if (interval) expanded.push(interval);
        });
      });
  });
  expanded.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  return expanded;
}

function intervalsOverlap(left = {}, right = {}) {
  const leftResourceId = normalizeText(left.resourceId);
  const rightResourceId = normalizeText(right.resourceId);
  if (!leftResourceId || !rightResourceId || leftResourceId !== rightResourceId) return false;
  const leftStart = Date.parse(normalizeText(left.startsAt));
  const leftEnd = Date.parse(normalizeText(left.endsAt));
  const rightStart = Date.parse(normalizeText(right.startsAt));
  const rightEnd = Date.parse(normalizeText(right.endsAt));
  if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd)) return false;
  if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) return false;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function isSlotBlockedByCalendar(slot = {}, blocks = [], resources = []) {
  const resourceId = normalizeText(slot.resourceId);
  if (!resourceId) return false;
  const iso = normalizeDateOnly(slot.startsAt);
  if (!iso) return false;
  const expanded = expandCalendarBlocksForRange(blocks, iso, iso, resources);
  return expanded.some((block) => intervalsOverlap(slot, block));
}

async function createCcoBookingEngineStore({
  filePath,
  rooms,
  onReservationsExpired = null,
  // ORD-171: avbokad tid ska släcka läkarens ordinationsgodkännande. Hooken
  // sitter HÄR och inte i rutterna, eftersom det finns flera avbokningsvägar
  // (operatörens API, patienttoken, ombokning). En regel per rutt är en regel
  // man glömmer på en av dem.
  onBookingCancelled = null,
  onBookingConfirmed = null,
}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoBookingEngineStore.');
  }

  const roomCatalog = normalizeRoomsForBookingEngine(rooms).length
    ? normalizeRoomsForBookingEngine(rooms)
    : DEFAULT_ROOMS.map((room) => ({ ...room }));

  const initial = await readJson(filePath, defaultState());
  const state = {
    ...defaultState(),
    ...(asObject(initial) || {}),
  };
  state.resources = asArray(state.resources).map(normalizeResource).filter(Boolean);
  state.services = applyBookingPolicyMigrationToServices(
    asArray(state.services).map(normalizeService).filter(Boolean)
  );
  state.availabilityRules = asArray(state.availabilityRules)
    .map(normalizeAvailabilityRule)
    .filter(Boolean);
  state.reservations = asArray(state.reservations)
    .map((item) => normalizeReservation(item, state))
    .filter(Boolean);
  state.bookings = asArray(state.bookings)
    .map((item) => normalizeBookingRecord(item, state))
    .filter(Boolean);
  if (!asArray(state.calendarBlocks).length) {
    state.calendarBlocks = defaultState().calendarBlocks;
  }
  state.calendarBlocks = asArray(state.calendarBlocks).map(normalizeCalendarBlock).filter(Boolean);

  const migrated = migratePlanASchema(state);
  // Curatiio Fas 1 — slå ihop Curatiio seed-tjänster (additivt; egen brand).
  const curatiioMerged = mergeCuratiioCatalogIntoEngineState(state);
  const legacyMerged = mergeLegacyCatalogIntoEngineState(state);
  const resourceMerged = mergeLegacyResourcesIntoEngineState(state, {
    planAPublicResourceIds: PLAN_A_PUBLIC_RESOURCE_IDS,
  });
  const scheduleMerged = mergeClientoSchedulesIntoEngineState(state);
  const pricingMerged = mergeClientoPricingIntoServices(state);

  /**
   * ORD-175 — publicerade priser som facit.
   *
   * Priset härleddes i ORD-174 ur triple-mappens serviceVariants: lägsta beloppet.
   * Regeln är enkel att förklara men datat är rörigt — tillägg och billigare
   * systerbehandlingar ligger inmappade under huvudtjänsten. "DHI Ärr" 15 000 kr
   * under `dhi`. "Lägg till område +1 500" under `prp-hair`, `prp-skin` och
   * `microneedling`. "Läpplyft (Lip Flip)" 1 400 kr under `botox`.
   *
   * Sju av tio tjänster fick fel pris. Och till skillnad från 0 kr, som syns,
   * ser 1 500 kr för microneedling fullt rimligt ut.
   *
   * Ägaren 2026-09-03: "priser står på hemsidan, det är facit på alla tjänster
   * respektive företag." Alltså: sluta härleda, läs facit.
   *
   * Härledningen är kvar som fallback för tjänster som inte står i prislistan —
   * bättre ett variantpris än noll — men publicerat pris vinner alltid.
   */
  function applyPublishedPricesToServices(state) {
    let published;
    try {
      published = require('../../config/publicerade-priser.json');
    } catch {
      return { changed: false, applied: 0 };
    }
    const table = (published && published.priser) || {};
    let applied = 0;

    state.services = asArray(state.services).map((service) => {
      const entry = table[service?.id];
      if (!entry) return service;

      // ORD-178: hemsidan är facit för NAMNET också, inte bara beloppet.
      // `beard` hette bara "Skäggtransplantation". Det dög så länge det fanns
      // en enda skäggtjänst; sedan dhi-beard lades till är namnet tvetydigt i
      // varje lista personalen väljer ur. Samma källa, samma fil, en mekanism.
      const label = normalizeText(entry.label);
      const behovsNyttNamn = label && label !== service.label;

      const price = Number(entry.fromPriceSek);
      const priceOk = Number.isFinite(price) && price > 0;
      const current = Number(service?.pricing?.basePriceSek ?? service?.fromPriceSek);
      const behovsNyttPris = priceOk && current !== price;

      if (!behovsNyttNamn && !behovsNyttPris) return service;
      applied += 1;
      return {
        ...service,
        ...(behovsNyttNamn ? { label } : {}),
        ...(priceOk
          ? {
              fromPriceSek: price,
              pricing: {
                ...(asObject(service.pricing) || {}),
                basePriceSek: price,
                currency: service?.pricing?.currency || 'SEK',
              },
            }
          : {}),
      };
    });

    return { changed: applied > 0, applied };
  }

  /**
   * ORD-178 — längderna som facit i stället för handpåläggning på servern.
   *
   * Ägaren 2026-09-03 om ärrtransplantationens längd: "det sätter vi manuellt."
   * Jag mätte om det gick. Det gjorde det inte.
   *
   * Det finns ingen upsertService, ingen admin-route för tjänster och ingen vy
   * i personalportalen. "Manuellt" betyder SSH in och redigera JSON. Och den
   * redigeringen håller inte: migratePlanASchema bygger om varje standardtjänst
   * som { ...svc, ...(existing), ...svc } — defaults sist, alltså vinner de.
   *
   * Uppmätt: längd 222 min satt på fyra tjänster, sedan omstart →
   *   fue-scar 222 (överlevde), dhi 480, beard 360, consultation-physical 45.
   * De tre sista tyst återställda. Tyst är det farliga ordet: ändringen ser ut
   * att ha sparats tills nästa omstart, sedan är den borta utan spår.
   *
   * Facit ligger i config/tjanstelangder.json och läggs på sist, som priserna.
   */
  function applyServiceDurations(state) {
    let facit;
    try {
      facit = require('../../config/tjanstelangder.json');
    } catch {
      return { changed: false, applied: 0 };
    }
    const table = asObject(facit.langder);
    let applied = 0;

    state.services = asArray(state.services).map((service) => {
      /**
       * ORD-194 — personalens längd vinner över facit.
       *
       * Facitfilen finns för att en handredigering på servern inte överlevde en
       * omstart. Nu finns en väg där personalen sätter längden i portalen och
       * värdet sparas — och då är facit inte längre den mest aktuella
       * uppgiften, utan utgångsläget.
       *
       * Ordningen blir: personalen > facit > standardvärdet i koden. Ägaren
       * 2026-09-03: "du kan alltid ha de som grund men att vi ska kunna ändra
       * det så klart."
       */
      if (service?.durationSource === 'staff') return service;
      const minuter = Number(table[service?.id]?.minuter);
      if (!Number.isFinite(minuter) || minuter < 15) return service;
      /**
       * MÄRKNINGEN SÄTTS ÄVEN NÄR TALET REDAN STÄMMER.
       *
       * Den tidiga returen `if (durationMinutes === minuter) return service`
       * hoppade över hela posten när facitvärdet råkade vara detsamma som
       * standardvärdet — och då blev `durationSource` odefinierad. Vyn visade
       * alltså "ärvd" om en längd som faktiskt står i facit.
       *
       * Skillnaden spelar roll för den som sitter och bestämmer: "ärvd" betyder
       * att ingen tagit ställning, "från prislistan" att någon gjort det.
       */
      if (service.durationMinutes === minuter && service.durationSource === 'facit') {
        return service;
      }
      if (service.durationMinutes !== minuter) applied += 1;
      return { ...service, durationMinutes: minuter, durationSource: 'facit' };
    });

    return { changed: applied > 0, applied };
  }

  const addonMerged = wireAddonServicesIntoEngineState(state);
  if (
    legacyMerged.changed ||
    resourceMerged.changed ||
    scheduleMerged.changed ||
    pricingMerged.changed ||
    addonMerged.changed ||
    curatiioMerged.changed
  ) {
    state.resources = asArray(state.resources).map(normalizeResource).filter(Boolean);
    state.services = applyBookingPolicyMigrationToServices(
      asArray(state.services).map(normalizeService).filter(Boolean)
    );
    mergeClientoPricingIntoServices(state);
    state.availabilityRules = asArray(state.availabilityRules)
      .map(normalizeAvailabilityRule)
      .filter(Boolean);
  }

  // Sist av allt: publicerat pris vinner över allt härlett. Måste ligga efter
  // både katalogmergen och Cliento-prismergen, annars skriver de över facit.
  applyPublishedPricesToServices(state);
  applyServiceDurations(state);

  /**
   * ORD-177 — ordinationskravet stämplas på tjänsten.
   *
   * Kravet hör till tjänsten, inte till hur någon råkade formulera etiketten
   * på ett enskilt ärende. Genom att lägga det här blir det synligt i
   * katalogen och i API:t, och alla som frågar får samma svar.
   *
   * Tre lägen: true, false, null. null betyder att kliniken inte tagit
   * ställning och får aldrig läsas som false. Se
   * config/ordinationskravande-tjanster.json.
   *
   * Ligger efter prissättningen av samma skäl som prissättningen ligger sist:
   * inget senare steg ska kunna skriva över det.
   */
  function applyOrdinationFlagToServices(state) {
    let stamped = 0;
    state.services = asArray(state.services).map((service) => {
      if (!service || typeof service !== 'object') return service;
      const krav = serviceRequiresOrdination(service.id);
      const skal = ordinationReason(service.id);
      if (service.requiresOrdination === krav && (service.ordinationReason || '') === skal) {
        return service;
      }
      stamped += 1;
      return {
        ...service,
        requiresOrdination: krav,
        ...(skal ? { ordinationReason: skal } : {}),
      };
    });
    return { changed: stamped > 0, stamped };
  }

  applyOrdinationFlagToServices(state);

  /**
   * ORD-177 — ett ingrepp bokas aldrig av kunden själv.
   *
   * Ägaren 2026-09-03: "man ska kunna boka fysisk eller online konsultation på
   * nätet, inte operation."
   *
   * VAD SOM FAKTISKT GÄLLDE. listPublicServices() returnerade 14 tjänster, och
   * fyra av dem var ingrepp: fue (480 min), dhi (480 min), beard (360 min),
   * eyebrow (240 min). Det enda som hindrade en kund från att boka en åtta
   * timmar lång operation på hemsidan var den globala nödbromsen
   * ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false.
   *
   * Den bromsen ska släppas — det är hela poängen med att ersätta Cliento. I
   * samma sekund hade fyra ingrepp blivit bokningsbara utan konsultation, utan
   * samtycke, utan avtal och utan förskott.
   *
   * En nödbroms är inte en regel. Det här är regeln.
   *
   * Kravet läses ur config/ordinationskravande-tjanster.json, samma facit som
   * läkarkön använder. Bara ett BESLUTAT ja stänger — `null` rör ingenting,
   * eftersom PRP, microneedling och Curatiios injektionsbehandlingar säljs
   * publikt i dag och inte är ingrepp i den här meningen.
   *
   * Regeln körs sist och kan inte överskrivas av något senare steg. Vill
   * kliniken någon gång göra ett ingrepp publikt bokningsbart måste den
   * ändra facit — alltså fatta beslutet på riktigt, inte råka ut för det.
   */
  function ingreppFarAldrigBokasAvKund(state) {
    let stangda = 0;
    state.services = asArray(state.services).map((service) => {
      if (!service || typeof service !== 'object') return service;
      if (service.requiresOrdination !== true) return service;
      if (service.publicBookable !== true) return service;
      stangda += 1;
      return { ...service, publicBookable: false, publicBookableBlockedBy: 'kraver_ordination' };
    });
    return { changed: stangda > 0, stangda };
  }

  /**
   * ORD-178 — konsultationen är vägen in, och den måste vara öppen.
   *
   * Curatiios tre konsultationer stod publicBookable: false. Operationerna är
   * — korrekt — också stängda. Nettoresultatet: Curatiio saknade helt publik
   * väg in. En kund som klickade "Boka kostnadsfri konsultation" på
   * curatiio.com/ogonlocksplastik hade mötts av en tom katalog.
   *
   * curatiio.com/priser: "20 minuter direkt med specialisten ingår alltid
   * innan vi rekommenderar något." Varje behandlingssida — ortopedi,
   * ögonlocksplastik, estetik — har samma knapp. Konsultationen ÄR vägen in
   * för alla tre områdena, och därför öppnas alla tre.
   *
   * Listan står i config/publik-bokning.json. Den ÖPPNAR bara; regeln nedan
   * som stänger ingrepp körs efter och vinner alltid. Skulle någon råka lägga
   * ett ingrepp i listan händer ingenting.
   */
  function applyPublicConsultationSetting(state) {
    let facit;
    try {
      facit = require('../../config/publik-bokning.json');
    } catch {
      return { changed: false, opened: 0 };
    }
    const tillatna = asObject(facit.konsultationer_publika);
    let opened = 0;

    state.services = asArray(state.services).map((service) => {
      if (tillatna[service?.id] !== true) return service;
      if (service.publicBookable === true) return service;
      opened += 1;
      return { ...service, publicBookable: true, publicBookableSource: 'publik-bokning.json' };
    });

    return { changed: opened > 0, opened };
  }

  /**
   * ORD-187 — en tjänst som inte finns i någon källa får inte gå att boka.
   *
   * HITTAT I PRODUKTION 2026-09-03. `curatiio-eyelid-surgery` låg kvar som
   * aktiv och PUBLIKT BOKNINGSBAR, med 28 000 kr på en post märkt
   * "Ögonlocksplastik (övre)" — övre kostar 24 000, 28 000 är nedre. Posten var
   * en kringgång som togs bort ur Curatiio-seeden i ORD-174.
   *
   * ATT TA BORT EN RAD UR SEEDEN RADERAR INGENTING. Katalogen är persistent
   * state; mergen lägger till och uppdaterar men städar aldrig. Raden levde
   * alltså vidare i fem månader efter att den togs bort ur källan — med fel
   * pris, bokningsbar av kund.
   *
   * Och ORD-177:s regel missade den: id:t står inte i ordinationsfacit, så
   * kravet blev `null`, och regeln stänger bara ett BESLUTAT ja. En okänd
   * tjänst föll mellan.
   *
   * SKYDDET GÄLLER DEN FARLIGA EGENSKAPEN, inte hela posten. Publik
   * bokningsbarhet kräver att id:t finns i en nuvarande källa. Inaktiva
   * föräldralösa rader lämnas orörda — de är historik, och bokningar kan peka
   * på dem. Uppmätt: sex föräldralösa i prod, fem redan avstängda, en publik.
   *
   * Körs FÖRE ingreppsregeln, så att ordningen är: vad finns → vad är publikt →
   * vad är ett ingrepp.
   */
  function avvecklaTjansterUtanKalla(state) {
    const kallor = new Set();
    for (const s of asArray(defaultState().services)) {
      if (s?.id) kallor.add(normalizeText(s.id));
    }
    try {
      const seed = require('./curatiioCatalogRuntime').loadCuratiioCatalogSeed();
      for (const s of asArray(seed?.services)) if (s?.id) kallor.add(normalizeText(s.id));
    } catch {
      // Kan inte läsa seeden → avveckla ingenting. En trasig fil får inte
      // stänga ned katalogen; hellre orörd än fel.
      return { changed: false, avvecklade: [] };
    }

    const avvecklade = [];
    state.services = asArray(state.services).map((service) => {
      if (!service || service.publicBookable !== true) return service;
      const id = normalizeText(service.id);
      if (kallor.has(id)) return service;
      /**
       * HÄR STOD ETT UNDANTAG FÖR legacy-*, och det var dött kod.
       *
       * Tanken var att legacy-tjänster skapas ur importbuntar som filtreras vid
       * körning och därför inte ska avvecklas av att de saknas i en enskild
       * körning. Rimligt resonemang — men mutationstestet visade att grenen
       * aldrig nås: mergeDraftService tvingar `publicBookable: false` på varje
       * legacy-post som inte står i Plan A-registret, och registrets id:n är
       * arcanaServiceIds som `fue`, aldrig `legacy-*`.
       *
       * En legacy-tjänst kan alltså aldrig vara publik, och skyddet rör bara
       * publika tjänster. Undantaget skyddade ingenting.
       *
       * Jag tog bort det i stället för att låta det ligga kvar och se ut som
       * policy. Invarianten det byggde på mäts nu i stället — se testet
       * "legacy-tjänster är aldrig publika".
       */
      avvecklade.push(id);
      return {
        ...service,
        active: false,
        publicBookable: false,
        retiredReason: 'saknas_i_alla_kallor',
        retiredAt: nowIso(),
      };
    });

    if (avvecklade.length) {
      console.warn(
        '[booking-engine] avvecklade tjänster utan källa (fanns kvar i state efter att ha ' +
          `tagits bort ur katalogen): ${avvecklade.join(', ')}`
      );
    }
    return { changed: avvecklade.length > 0, avvecklade };
  }

  /**
   * ORD-187 — raderar poster som aldrig borde ha funnits.
   *
   * Skyddet ovanför STÄNGER en föräldralös tjänst. Det räcker mot faran, men
   * lämnar kvar en rad i personalens katalog: "Ögonlocksplastik (övre)" för
   * 28 000 kr, vilket är nedres pris. En avstängd rad med fel uppgifter är
   * fortfarande något någon måste tolka varje gång listan öppnas.
   *
   * Listan är UTTRYCKLIG, inte härledd. En regel som raderar automatiskt vore
   * farlig: det som ser föräldralöst ut vid en körning kan vara en importbunt
   * som inte lästes in. Att radera är oåterkalleligt; att stänga är inte det.
   * Därför står varje id här med skäl, en gång.
   *
   * OCH DEN VÄGRAR OM NÅGOT PEKAR PÅ TJÄNSTEN. Verifierat i prod före
   * ändringen: noll bokningar, noll reservationer, noll tillgänglighetsregler
   * för curatiio-eyelid-surgery. Skulle det ändå finnas en referens lämnas
   * raden — en bokning som pekar på en tjänst som inte finns är värre än en
   * ful rad i en lista.
   */
  const TJANSTER_ATT_RADERA = Object.freeze({
    'curatiio-eyelid-surgery': [
      'Kringgång skapad när legacy-vägen tvingade ögonlocksplastikerna till',
      'active:false och 0 kr. Båda felen rättades i ORD-174 och posten togs bort',
      'ur Curatiio-seeden — men state städas aldrig, så raden levde vidare som',
      'aktiv och publikt bokningsbar med 28 000 kr på en post märkt "övre".',
      'Rätt pris för övre är 24 000; 28 000 är nedre. De riktiga posterna',
      'bleph-upper/lower/combined täcker behandlingen.',
    ].join(' '),
  });

  function raderaAvvecklandeTjanster(state) {
    const raderade = [];
    const behallna = [];
    state.services = asArray(state.services).filter((service) => {
      const id = normalizeText(service?.id);
      if (!TJANSTER_ATT_RADERA[id]) return true;

      const refBokning = asArray(state.bookings).some(
        (b) => normalizeText(b?.slot?.serviceId) === id
      );
      const refReservation = asArray(state.reservations).some(
        (r) => normalizeText(r?.slot?.serviceId) === id
      );
      const refRegel = asArray(state.availabilityRules).some(
        (r) => normalizeText(r?.serviceId) === id
      );
      if (refBokning || refReservation || refRegel) {
        behallna.push(id);
        return true;
      }
      raderade.push(id);
      return false;
    });

    if (behallna.length) {
      console.warn(
        `[booking-engine] kunde INTE radera ${behallna.join(', ')} — något pekar fortfarande ` +
          'på tjänsten. Den är avstängd men kvar.'
      );
    }
    if (raderade.length) {
      console.log(`[booking-engine] raderade avvecklade tjänster: ${raderade.join(', ')}`);
    }
    return { changed: raderade.length > 0, raderade, behallna };
  }

  /**
   * ORD-189 — röda dagar stänger kliniken.
   *
   * MÄTT 2026-09-03, och det var värre än att öppettiderna var konstanter:
   *
   *   47 lediga tider   Juldagen 2026-12-25
   *   47 lediga tider   Nyårsdagen 2027-01-01
   *   36 lediga tider   en vanlig tisdag
   *
   * Det fanns inget begrepp för röd dag alls. Kliniken var inte bara
   * bokningsbar på juldagen — den hade FLER tider än en vanlig tisdag,
   * eftersom sköterskeschemats fyraveckorscykel råkade lägga fler skift där.
   *
   * En kund bokar 10:00 på juldagen, får en bekräftelse, kommer till
   * Vasaplatsen och möter en låst dörr. Ingenting i systemet hade sagt emot.
   *
   * SOM KALENDERBLOCK, inte som ett nytt begrepp. Block finns redan, stänger
   * tid för valda resurser, och respekteras av isSlotBlockedByCalendar. En
   * stängd dag är ett block på alla resurser hela dagen. Att bygga en parallell
   * mekanism hade gett två svar på frågan "är det öppet".
   *
   * Idempotent på datumet. Tas en dag bort ur konfigen ligger blocket kvar —
   * medvetet: ett block som en gång stängt en dag kan ha påverkat bokningar, och
   * personalen kan ta bort det i schemavyn. Konfigen ÖPPNAR aldrig något.
   */
  function stangRodaDagar(state) {
    let lagda = 0;
    for (const dag of OPPETTIDER.stangdaDagar) {
      const blockId = `stangt-${dag.datum}`;
      if (asArray(state.calendarBlocks).some((b) => normalizeText(b?.blockId) === blockId))
        continue;
      const veckodag = new Date(`${dag.datum}T12:00:00.000Z`).getUTCDay();
      const block = normalizeCalendarBlock({
        blockId,
        label: dag.namn,
        blockType: 'closed',
        resourceIds: [], // tom = hela kliniken
        weekdays: [veckodag],
        startTime: '00:00',
        endTime: '23:59',
        dateFrom: dag.datum,
        dateTo: dag.datum,
        active: true,
      });
      if (block) {
        state.calendarBlocks.push(block);
        lagda += 1;
      }
    }
    if (lagda) console.log(`[booking-engine] stängde ${lagda} röda dagar enligt öppettidskonfigen`);
    return { changed: lagda > 0, lagda };
  }

  avvecklaTjansterUtanKalla(state);
  raderaAvvecklandeTjanster(state);
  stangRodaDagar(state);
  applyPublicConsultationSetting(state);
  ingreppFarAldrigBokasAvKund(state);

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  const createBookingInflight = new Map();
  let createBookingMutationTail = Promise.resolve();

  if (
    migrated ||
    legacyMerged.changed ||
    resourceMerged.changed ||
    scheduleMerged.changed ||
    pricingMerged.changed ||
    addonMerged.changed ||
    curatiioMerged.changed
  ) {
    await save();
  }

  let bookingPolicySettings = normalizeBookingPolicySettings(loadBookingPolicyMigrationDefaults());
  const pricingRules = normalizePricingRules();

  function setBookingPolicySettings(settings = {}) {
    bookingPolicySettings = normalizeBookingPolicySettings(settings, bookingPolicySettings);
    return clone(bookingPolicySettings);
  }

  async function expireStaleReservations() {
    const referenceMs = Date.now();
    const newlyExpired = [];
    state.reservations = state.reservations.map((item) => {
      if (normalizeKey(item.status) !== 'active') return item;
      if (!isReservationExpired(item, referenceMs)) return item;
      const expired = {
        ...item,
        status: 'expired',
        // ORD-146: stäng med orsak, radera aldrig.
        expiredReason: 'Avtalet signerades inte inom reservationstiden.',
        updatedAt: nowIso(),
      };
      newlyExpired.push(expired);
      return expired;
    });
    if (newlyExpired.length) {
      await save();
      // ORD-146: kunden får veta varför tiden släpptes (signeringsuppmaning).
      // Best-effort — ett misslyckat utskick får aldrig blockera utgången.
      if (typeof onReservationsExpired === 'function') {
        try {
          await onReservationsExpired(clone(newlyExpired));
        } catch (err) {
          console.warn(
            '[ccoBookingEngineStore] onReservationsExpired failed:',
            err?.message || err
          );
        }
      }
    }
    return newlyExpired;
  }

  function getResourceById(resourceId) {
    return state.resources.find((item) => item.id === normalizeText(resourceId)) || null;
  }

  function getServiceById(serviceId) {
    const raw =
      state.services.find((item) => item.id === resolveServiceRegisterAlias(serviceId)) || null;
    if (!raw) return null;
    const withPolicy = applyBookingPolicySettingsToService(raw, bookingPolicySettings);
    return applyBookingPricingMigrationToService(withPolicy, pricingRules);
  }

  // Ett rum är upptaget om en annan aktiv reservation/bekräftad bokning
  // överlappar i tid OCH använder samma rum. Samma princip som slotsOverlap,
  // men på rum i stället för resurs.
  function isRoomTaken(
    roomId,
    startsAt,
    endsAt,
    { excludeConversationId = '', tenantId = '' } = {}
  ) {
    const rid = normalizeText(roomId);
    if (!rid) return false;
    const start = Date.parse(normalizeText(startsAt));
    const end = Date.parse(normalizeText(endsAt));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    const overlaps = (slot = {}) => {
      const s = Date.parse(normalizeText(slot.startsAt));
      const e = Date.parse(normalizeText(slot.endsAt));
      if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
      return s < end && start < e;
    };
    const usesRoom = (item) => normalizeText(item?.slot?.roomId) === rid;
    // NB-1: self-exclusion kräver SAMMA tenant OCH SAMMA conversation — en
    // främmande tenants conversationId får aldrig exkludera deras state.
    const isSelfReference = (item) =>
      Boolean(
        excludeConversationId &&
        normalizeText(tenantId) &&
        normalizeText(item.tenantId) === normalizeText(tenantId) &&
        normalizeText(item.conversationId) === normalizeText(excludeConversationId)
      );
    return (
      state.reservations.some((item) => {
        if (normalizeKey(item.status) !== 'active') return false;
        if (isSelfReference(item)) return false;
        return usesRoom(item) && overlaps(item.slot);
      }) ||
      state.bookings.some((item) => {
        if (normalizeKey(item.status) !== 'confirmed') return false;
        if (isSelfReference(item)) return false;
        return usesRoom(item) && overlaps(item.slot);
      })
    );
  }

  // Första lediga rummet i ordning (1→5). Returnerar null om alla är upptagna.
  function suggestFreeRoom({
    startsAt,
    endsAt,
    excludeConversationId = '',
    excludeRoomIds = new Set(),
    tenantId = '',
  } = {}) {
    for (const room of roomCatalog) {
      if (excludeRoomIds.has(room.id)) continue;
      if (!isRoomTaken(room.id, startsAt, endsAt, { excludeConversationId, tenantId })) return room;
    }
    return null;
  }

  // Prioritet: personalens defaultRoomId → första lediga.
  // Explicit slot.roomId hanteras av anroparna (reserve/confirm) som bara kallar
  // hit när roomId är tomt — en egen gren här vore dött kött.
  function resolveRoomForSlot(
    slot = {},
    resource = {},
    { excludeConversationId = '', excludeRoomIds = new Set(), tenantId = '' } = {}
  ) {
    const defaultRoomId = normalizeText(resource?.defaultRoomId);
    // Standardrummet prövas mot isRoomTaken — automatik får aldrig tyst
    // dubbelboka ett rum. Explicit slot.roomId är ett mänskligt val och
    // respekteras som det är (varning räcker där).
    if (
      defaultRoomId &&
      !excludeRoomIds.has(defaultRoomId) &&
      !isRoomTaken(defaultRoomId, slot.startsAt, slot.endsAt, {
        excludeConversationId,
        tenantId,
      })
    ) {
      const room = roomCatalog.find((item) => item.id === defaultRoomId);
      if (room) return room;
    }
    return suggestFreeRoom({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      excludeConversationId,
      excludeRoomIds,
      tenantId,
    });
  }

  function isRuntimePublicService(serviceId) {
    const service = getServiceById(serviceId);
    return Boolean(service && service.active !== false && service.publicBookable === true);
  }

  function slotsOverlap(left = {}, right = {}) {
    const leftResourceId = normalizeText(left.resourceId);
    const rightResourceId = normalizeText(right.resourceId);
    if (!leftResourceId || !rightResourceId || leftResourceId !== rightResourceId) return false;
    const leftStart = Date.parse(normalizeText(left.startsAt));
    const leftEnd = Date.parse(normalizeText(left.endsAt));
    const rightStart = Date.parse(normalizeText(right.startsAt));
    const rightEnd = Date.parse(normalizeText(right.endsAt));
    if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd)) return false;
    if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) return false;
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  function isSlotTaken(slot = {}, { excludeConversationId = '', tenantId = '' } = {}) {
    const slotId = normalizeText(slot.slotId);
    // NB-1: self-exclusion kräver SAMMA tenant OCH SAMMA conversation.
    const isSelfReference = (item) =>
      Boolean(
        excludeConversationId &&
        normalizeText(tenantId) &&
        normalizeText(item.tenantId) === normalizeText(tenantId) &&
        normalizeText(item.conversationId) === normalizeText(excludeConversationId)
      );
    if (isSlotBlockedByCalendar(slot, state.calendarBlocks, state.resources)) return true;
    return (
      state.reservations.some((item) => {
        if (normalizeKey(item.status) !== 'active') return false;
        if (isSelfReference(item)) return false;
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      }) ||
      state.bookings.some((item) => {
        /**
         * ORD-183 — tiden är upptagen om den inte avbokats.
         *
         * Här stod `!== 'confirmed'`. Så länge statusarna bara var confirmed
         * och cancelled betydde det samma sak. Med `completed` och `no_show`
         * betyder det inte längre det: ett genomfört besök eller ett uteblivet
         * hade frigjort sin egen tid för dubbelbokning.
         *
         * Rätt regel är den omvända. En avbokning är det ENDA som ger tillbaka
         * tiden — kunden meddelade och stolen blev ledig. Ett uteblivet besök
         * gör den inte ledig i efterhand: klockan gick, personalen väntade.
         *
         * Formulerad som "allt utom avbokat" i stället för en lista över vad
         * som räknas, så att en framtida femte status blir upptagen som
         * standard i stället för osynlig.
         */
        if (normalizeKey(item.status) === 'cancelled') return false;
        if (isSelfReference(item)) return false;
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      })
    );
  }

  function getCycleWeekForDate(rule, date) {
    if (!rule.cycleWeeks || !rule.cycleStart) return 1;
    const startMs = Date.parse(rule.cycleStart);
    if (!Number.isFinite(startMs)) return 1;
    const daysDiff = Math.floor((date.getTime() - startMs) / (24 * 60 * 60 * 1000));
    const weeksDiff = Math.floor(daysDiff / 7);
    return (((weeksDiff % rule.cycleWeeks) + rule.cycleWeeks) % rule.cycleWeeks) + 1;
  }

  function ruleAppliesOnDate(rule, date) {
    if (!rule.cycleWeeks || !rule.cycleWeek || !rule.cycleStart) return true;
    return getCycleWeekForDate(rule, date) === rule.cycleWeek;
  }

  function buildAvailabilitySlot(rule, day, timeLabel) {
    const dateOnly = day.toISOString().slice(0, 10);
    // Regelns starttid är klinikens väggklocka, inte UTC. Tidigare stod här
    // `${dateOnly}T${timeLabel}:00.000Z`, så 10:00 i schemat blev 12:00 i
    // kalendern på sommaren och 11:00 på vintern. Se src/ops/klinikTid.js.
    const startsAt = klinikTidTillUtc(dateOnly, timeLabel);
    if (!startsAt) return null;
    const service = getServiceById(rule.serviceId) || {};
    const resource = getResourceById(rule.resourceId) || {};
    return normalizeEngineSlot(
      {
        slotId: toSlotId({ resourceId: rule.resourceId, serviceId: rule.serviceId, startsAt }),
        startsAt,
        resourceId: rule.resourceId,
        resourceLabel: resource.label,
        serviceId: rule.serviceId,
        serviceLabel: service.label,
        locationLabel: rule.locationLabel,
      },
      state.services,
      state.resources
    );
  }

  async function listAvailability({
    tenantId,
    fromDate,
    toDate,
    resIds = '',
    srvIds = '',
    excludeConversationId = '',
    publicOnly = false,
    brand = '',
  } = {}) {
    await expireStaleReservations();
    const tenant = normalizeText(tenantId);
    if (!tenant) throw new Error('tenantId krävs för booking engine availability.');
    let resourceIds = normalizeText(resIds)
      ? normalizeText(resIds)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    if (!resourceIds.length && publicOnly === true) {
      resourceIds = state.resources
        .filter(
          (item) =>
            item.active !== false &&
            (item.publicBookable === true ||
              PLAN_A_PUBLIC_RESOURCE_IDS.includes(normalizeText(item.id)))
        )
        .map((item) => normalizeText(item.id))
        .filter(Boolean);
    }
    const serviceIds = normalizeText(srvIds)
      ? normalizeText(srvIds)
          .split(',')
          .map((item) => resolveServiceRegisterAlias(item.trim()))
          .filter(Boolean)
      : [];
    if (publicOnly === true && serviceIds.some((serviceId) => !isRuntimePublicService(serviceId))) {
      return [];
    }
    const globalMaxDays = Number(bookingPolicySettings?.globalDefaults?.maxBookingDaysAhead) || 180;
    const days = buildDateRange(fromDate, capAvailabilityToDate(toDate, globalMaxDays));
    const nowMs = Date.now();
    const slots = [];
    days.forEach((day) => {
      const weekday = day.getUTCDay();
      state.availabilityRules
        .filter((rule) => rule.active !== false)
        .filter((rule) => !resourceIds.length || resourceIds.includes(rule.resourceId))
        .filter((rule) => publicOnly !== true || isRuntimePublicService(rule.serviceId))
        .filter((rule) => !serviceIds.length || serviceIds.includes(rule.serviceId))
        .filter((rule) => asArray(rule.weekdays).includes(weekday))
        .filter((rule) => ruleAppliesOnDate(rule, day))
        .filter((rule) => {
          if (!normalizeText(brand)) return true;
          // Curatiio Fas 1 — brand-isolation enforcad på service-nivå.
          const service = getServiceById(rule.serviceId);
          const resource = getResourceById(rule.resourceId);
          return (
            serviceMatchesBrand(service || {}, brand) && resourceMatchesBrand(resource || {}, brand)
          );
        })
        .forEach((rule) => {
          asArray(rule.startTimes).forEach((timeLabel) => {
            const slot = buildAvailabilitySlot(rule, day, timeLabel);
            const service = getServiceById(rule.serviceId) || {};
            if (
              slot &&
              isSlotWithinBookingPolicy(slot, service, nowMs) &&
              !isSlotTaken(slot, { excludeConversationId, tenantId: tenant })
            ) {
              slots.push(applyPricingToSlot(slot, service, pricingRules));
            }
          });
        });
    });
    slots.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    return clone(slots);
  }

  async function listCalendarBlocks({ fromDate, toDate, resIds = '' } = {}) {
    return expandCalendarBlocksForRange(
      state.calendarBlocks,
      fromDate,
      toDate,
      state.resources,
      resIds
    );
  }

  /**
   * ORD-181 — kliniken måste kunna öppna tider utan en deploy.
   *
   * MÄTT I PRODUKTION 2026-09-03: 11 av 14 publikt bokningsbara tjänster hade
   * NOLL tillgänglighetsregler. Bara consultation-online, consultation-physical
   * och followup-transplant hade tider. Slås publik bokning på ser kunden en
   * katalog där nästan ingenting går att boka.
   *
   * Och personalen kunde inte rätta det. `managedBy: 'staff'` stod redan på
   * reglerna i koden — men det fanns varken store-metod, API eller vy för att
   * skapa en. Etiketten sa "personalen förvaltar det här"; ingen kunde det.
   *
   * Det är hindret som gör CCO oanvändbart som Cliento-ersättare, och det är
   * inte ett schemaläggningsproblem utan ett saknat verktyg.
   *
   * VALIDERINGEN NEKAR I STÄLLET FÖR ATT GISSA. En regel mot en tjänst eller
   * resurs som inte finns skapar tider ingen kan boka — de syns i kalendern och
   * försvinner vid nästa merge. Hellre ett fel som går att läsa.
   */
  function listAvailabilityRules({
    serviceId = '',
    resourceId = '',
    includeInactive = false,
  } = {}) {
    const srv = normalizeText(serviceId);
    const res = normalizeText(resourceId);
    return clone(
      asArray(state.availabilityRules).filter((rule) => {
        if (!includeInactive && rule.active === false) return false;
        if (srv && rule.serviceId !== srv) return false;
        if (res && rule.resourceId !== res) return false;
        return true;
      })
    );
  }

  function felaktigIndata(message, metadata) {
    const error = new Error(message);
    error.statusCode = 400;
    if (metadata) error.metadata = metadata;
    return error;
  }

  async function upsertAvailabilityRule(input = {}, actor = {}) {
    /**
     * RÅ INDATA FÖRST, innan normaliseringen hinner gissa.
     *
     * `normalizeWeekdays` fyller i måndag–fredag när listan är tom. För en
     * regel som läses ur en fil är det en rimlig reserv; för en regel någon
     * skickar in är det ett påhitt — kliniken bad om inga dagar och fick fem.
     *
     * Exakt samma sorts tysta ifyllnad har redan rensats ur `startTimes` en
     * gång: den defaultade till tre klockslag, varav ett låg före öppning.
     * Kommentaren står kvar vid funktionen. Jag tänker inte återinföra felet i
     * grannfältet.
     */
    if (Array.isArray(input.weekdays) && input.weekdays.length === 0) {
      throw felaktigIndata('Minst en veckodag krävs.');
    }
    const kandidat = normalizeAvailabilityRule({
      ...input,
      // Sätts av oss, aldrig av anroparen. Annars kunde en klient utge sig för
      // att vara personalen och därmed slippa sköterskestädningen.
      managedBy: 'staff',
      createdVia: 'staff_api',
    });
    if (!kandidat) throw felaktigIndata('resourceId och serviceId krävs.');

    const tjanst = state.services.find((s) => s.id === kandidat.serviceId);
    if (!tjanst) {
      throw felaktigIndata(`Tjänsten ${kandidat.serviceId} finns inte i katalogen.`, {
        serviceId: kandidat.serviceId,
      });
    }
    if (tjanst.active === false) {
      throw felaktigIndata(`Tjänsten ${kandidat.serviceId} är inte aktiv.`, {
        serviceId: kandidat.serviceId,
      });
    }
    const resurs = state.resources.find((r) => r.id === kandidat.resourceId);
    if (!resurs) {
      throw felaktigIndata(`Resursen ${kandidat.resourceId} finns inte.`, {
        resourceId: kandidat.resourceId,
      });
    }
    if (resurs.active === false) {
      throw felaktigIndata(`Resursen ${kandidat.resourceId} är inte aktiv.`, {
        resourceId: kandidat.resourceId,
      });
    }
    if (!kandidat.weekdays.length) throw felaktigIndata('Minst en veckodag krävs.');
    // En regel utan starttider ger noll tider men ser ut som en rad i
    // kalendern. Tomt är inte samma sak som avstängt — vill man stänga en
    // regel finns deactivateAvailabilityRule.
    if (!kandidat.startTimes.length) {
      throw felaktigIndata(
        'Minst en starttid krävs. Vill du stänga av regeln, använd avaktivering i stället.'
      );
    }

    const index = state.availabilityRules.findIndex((r) => r.ruleId === kandidat.ruleId);
    const nytt = index === -1;
    if (nytt) state.availabilityRules.push(kandidat);
    else state.availabilityRules[index] = { ...state.availabilityRules[index], ...kandidat };

    await save();
    return { rule: clone(kandidat), created: nytt };
  }

  /**
   * ORD-194 — personalen sätter tjänstens längd.
   *
   * Ägaren 2026-09-03: "du kan alltid ha de som grund men att vi ska kunna
   * ändra det så klart."
   *
   * FÖRSÖKET ATT GÖRA DET FÖR HAND MISSLYCKADES TYST. Uppmätt i ORD-178: 222
   * minuter satt direkt i cco-booking-engine.json blev 480 igen efter omstart,
   * eftersom migreringen sprider standardvärdet sist. Det såg sparat ut ända
   * fram till nästa deploy.
   *
   * Nu märks längden med `durationSource: 'staff'`, och två ställen respekterar
   * märkningen: migreringen plockar tillbaka värdet, och längdfacit hoppar över
   * tjänsten. Ordningen är personalen > facit > kodens standardvärde.
   *
   * GRÄNSERNA ÄR AVSIKTLIGT VIDA men inte obegränsade. 15 minuter är kortast
   * bokningsbara tid i motorn; 12 timmar är längre än klinikens öppettider och
   * fångar därmed skrivfel som 4800 i stället för 480. Att neka ett rimligt tal
   * hade tvingat kliniken tillbaka till att be mig ändra kod.
   */
  async function setServiceDuration(input = {}, actor = {}) {
    const serviceId = normalizeText(input.serviceId);
    const minuter = Number(input.durationMinutes);

    const index = state.services.findIndex((s) => normalizeText(s.id) === serviceId);
    if (index === -1) {
      throw felaktigIndata(`Tjänsten ${serviceId || '(tom)'} finns inte i katalogen.`, {
        serviceId,
      });
    }
    if (!Number.isFinite(minuter) || !Number.isInteger(minuter)) {
      throw felaktigIndata('Längden måste anges i hela minuter.');
    }
    if (minuter < 15) throw felaktigIndata('Kortast bokningsbara tid är 15 minuter.');
    if (minuter > 720) {
      throw felaktigIndata(
        'Längre än 12 timmar går inte att boka — kontrollera att talet är rätt (480 minuter är åtta timmar).'
      );
    }

    const fore = state.services[index].durationMinutes;
    state.services[index] = normalizeService({
      ...state.services[index],
      durationMinutes: minuter,
      durationSource: 'staff',
      durationSetAt: nowIso(),
      durationSetBy: normalizeText(actor.userId) || 'unknown',
    });
    if (fore === minuter) {
      // Ingen ändring av talet, men märkningen kan vara ny — spara ändå, annars
      // "fastnar" facit på en tjänst där personalen bekräftat värdet.
      await save();
      return { service: clone(state.services[index]), changed: false };
    }
    await save();
    return { service: clone(state.services[index]), changed: true, tidigare: fore };
  }

  async function deactivateAvailabilityRule(ruleId, actor = {}) {
    const id = normalizeText(ruleId);
    const index = state.availabilityRules.findIndex((r) => r.ruleId === id);
    if (index === -1) {
      const error = new Error(`Regeln ${id} finns inte.`);
      error.statusCode = 404;
      throw error;
    }
    // AVAKTIVERAS, raderas inte. En raderad regel går inte att förklara i
    // efterhand: "varför fanns det inga tider den veckan" ska gå att svara på.
    if (state.availabilityRules[index].active === false) {
      return { rule: clone(state.availabilityRules[index]), changed: false };
    }
    state.availabilityRules[index] = {
      ...state.availabilityRules[index],
      active: false,
      managedBy: 'staff',
      createdVia: 'staff_api',
    };
    await save();
    return { rule: clone(state.availabilityRules[index]), changed: true };
  }

  /**
   * ORD-183 — märk vad som faktiskt hände med besöket.
   *
   * Cliento har 1 413 uteblivna besök. Motorn kunde inte uttrycka ett enda.
   *
   * BARA BAKÅT I TIDEN. Ett besök som inte har ägt rum kan varken vara
   * genomfört eller uteblivet — det är fortfarande bara bokat. Att tillåta
   * märkning framåt öppnar för att en tid råkar markeras som klar och därmed
   * försvinner ur påminnelserna.
   *
   * EN AVBOKNING ÄR INTE ETT UTEBLIVET BESÖK och får inte skrivas om till ett.
   * Kunden meddelade i tid; att i efterhand kalla det uteblivet ändrar både
   * ekonomin och statistiken. Avbokade bokningar avvisas.
   */
  async function markBookingOutcome(input = {}) {
    const bookingId = normalizeText(input.bookingId);
    const status = normalizeKey(input.status);
    if (!['completed', 'no_show'].includes(status)) {
      throw felaktigIndata("Status måste vara 'completed' eller 'no_show'.");
    }
    const index = state.bookings.findIndex((b) => normalizeText(b.bookingId) === bookingId);
    if (index === -1) {
      const error = new Error(`Bokningen ${bookingId} finns inte.`);
      error.statusCode = 404;
      throw error;
    }
    const bokning = state.bookings[index];
    if (normalizeKey(bokning.status) === 'cancelled') {
      throw felaktigIndata(
        'En avbokad tid kan inte märkas som genomförd eller utebliven. Kunden meddelade i tid.'
      );
    }
    const start = Date.parse(bokning.slot?.startsAt || '');
    const nu = input.now ? Date.parse(input.now) : Date.now();
    if (Number.isFinite(start) && start > nu) {
      throw felaktigIndata('Besöket har inte ägt rum ännu.');
    }

    if (normalizeKey(bokning.status) === status) {
      return { booking: clone(bokning), changed: false };
    }
    state.bookings[index] = normalizeBookingRecord(
      {
        ...bokning,
        status,
        outcomeAt: nowIso(),
        outcomeBy: normalizeText(input.actor?.userId) || 'system',
        updatedAt: nowIso(),
      },
      state
    );
    await save();
    return { booking: clone(state.bookings[index]), changed: true };
  }

  async function upsertCalendarBlock(input = {}) {
    const nextBlock = normalizeCalendarBlock(input);
    if (!nextBlock) {
      throw new Error('Kalenderblock kunde inte normaliseras.');
    }
    const index = state.calendarBlocks.findIndex(
      (item) => normalizeText(item.blockId) === normalizeText(nextBlock.blockId)
    );
    if (index >= 0) state.calendarBlocks[index] = nextBlock;
    else state.calendarBlocks.push(nextBlock);
    await save();
    return clone(nextBlock);
  }

  function getCalendarBlock(blockId) {
    const block = state.calendarBlocks.find(
      (item) => normalizeText(item.blockId) === normalizeText(blockId)
    );
    return block ? clone(block) : null;
  }

  async function reserveSlots(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail) {
      throw new Error('Booking-reservation saknar tenant, conversation eller customer.');
    }
    const selectedSlots = asArray(input.selectedSlots || input.slots)
      .map((slot) => normalizeEngineSlot(slot, state.services, state.resources))
      .filter(Boolean)
      .slice(0, 3);
    selectedSlots.forEach((slot) => {
      if (isSlotTaken(slot, { excludeConversationId: conversationId, tenantId })) {
        if (input.override === true) {
          if (typeof input.onOverride === 'function') {
            input.onOverride({
              resourceId: normalizeText(slot.resourceId),
              slotId: normalizeText(slot.slotId),
              startsAt: normalizeText(slot.startsAt),
            });
          }
        } else {
          const error = new Error('Tiden är upptagen av en annan bokning.');
          error.statusCode = 409;
          error.metadata = { code: 'resource_conflict', overrideRequired: true };
          throw error;
        }
      }
      const service = getServiceById(slot.serviceId) || {};
      if (!isSlotWithinBookingPolicy(slot, service)) {
        const error = new Error(
          'Tiden ligger utanför bokningspolicy (min-notice eller max-fönster).'
        );
        error.statusCode = 409;
        throw error;
      }
    });
    // Behandlingsrum: explicit val > personalens default > första lediga.
    // excludeRoomIds håller reda på rum som redan delats ut i denna batch så
    // två tider i samma reservation inte får samma rum.
    const assignedRoomIds = new Set();
    selectedSlots.forEach((slot) => {
      if (slot.roomId) return;
      const resource = getResourceById(slot.resourceId) || {};
      const room = resolveRoomForSlot(slot, resource, {
        excludeConversationId: conversationId,
        excludeRoomIds: assignedRoomIds,
        tenantId,
      });
      if (room) {
        slot.roomId = room.id;
        slot.roomLabel = room.name;
        assignedRoomIds.add(room.id);
      }
    });
    state.reservations = state.reservations.filter((item) => {
      if (normalizeText(item.tenantId) !== tenantId) return true;
      if (normalizeText(item.conversationId) !== conversationId) return true;
      return normalizeKey(item.status) !== 'active';
    });
    const reservations = selectedSlots.map((slot) =>
      normalizeReservation(
        {
          tenantId,
          workspaceId: input.workspaceId,
          conversationId,
          customerEmail,
          customerName: input.customerName,
          ownerUserId: input.ownerUserId,
          ownerName: input.ownerName,
          slot,
          status: 'active',
          // ORD-146 (Fazli 2026-08-30): reservationen håller tiden i 7 dagar —
          // 2 dagars betänketid + 5 att signera. Inte lagens 14 (ångerrätt) och
          // inte seriens 366 (se upsertSeriesReservations — en helt annan sak).
          expiresAt: addMinutes(nowIso(), 7 * 24 * 60),
        },
        state
      )
    );
    state.reservations.push(...reservations);
    await save();
    return clone(reservations);
  }

  // Skapa (eller återskapa) "riktiga reservationer" för en återkommande serie —
  // Block 4.1. Varje tillfälle i serien blir en reservation i bokningsmotorn,
  // märkt med serie-metadata så den kan följas och avbokas som en enhet.
  //
  // Till skillnad från reserveSlots behövs ingen exakt ledig slot: en
  // serie-reservation är en personalplanerad tid på datum-nivå (klockslaget är
  // en default som personalen justerar vid bekräftelse). Därför kör vi inte
  // public-slot-validering här — det är ett planeringsunderlag, inte en publikt
  // bokad tid.
  //
  // Idempotent: en serie med samma seriesId ersätter sina tidigare
  // serie-reservationer (inget dupliceras vid återupprepning).
  async function upsertSeriesReservations(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const seriesId = normalizeText(input.seriesId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail || !seriesId) {
      const error = new Error('Serie-reservation saknar tenant, conversation, kund eller serie.');
      error.statusCode = 400;
      throw error;
    }
    const occurrences = asArray(input.occurrences);
    const defaultStartTime = normalizeText(input.defaultStartTime) || '09:00';
    const defaultDuration = Number(input.durationMinutes) || 60;
    const templateId = normalizeText(input.templateId);
    const customerName = normalizeText(input.customerName);
    const ownerUserId = normalizeText(input.ownerUserId);
    const ownerName = normalizeText(input.ownerName);
    const locationLabel = normalizeText(input.locationLabel) || 'Hair TP Clinic';

    // Ta bort tidigare serie-reservationer så återskapande inte duplicerar.
    state.reservations = state.reservations.filter(
      (item) => normalizeText(item?.metadata?.seriesId) !== seriesId
    );

    const created = [];
    for (const occ of occurrences) {
      const dateStr = normalizeText(occ.scheduledDate);
      if (!dateStr) continue;
      const startsAt = `${dateStr}T${defaultStartTime}:00.000Z`;
      const slot = normalizeEngineSlot(
        {
          slotId: `${seriesId}:${normalizeText(occ.occurrenceId)}`,
          startsAt,
          endsAt: addMinutes(startsAt, defaultDuration),
          resourceId: normalizeText(occ.resourceId) || normalizeText(input.resourceId),
          serviceId: normalizeText(occ.serviceId) || normalizeText(input.serviceId),
          resourceLabel: normalizeText(occ.resourceLabel) || normalizeText(input.resourceLabel),
          serviceLabel: normalizeText(occ.serviceLabel) || normalizeText(input.serviceLabel),
          locationLabel,
        },
        state.services,
        state.resources
      );
      if (!slot) continue;
      const reservation = normalizeReservation(
        {
          tenantId,
          workspaceId: normalizeText(input.workspaceId) || 'major-arcana-preview',
          conversationId,
          customerEmail,
          customerName,
          ownerUserId,
          ownerName,
          slot,
          status: 'active',
          source: 'cco_series',
          // Lång livslängd: en serie löper över veckor/månader, inte 72h.
          expiresAt: addMinutes(nowIso(), 366 * 24 * 60),
        },
        state
      );
      if (!reservation) continue;
      reservation.metadata = {
        ...asObject(reservation.metadata),
        seriesId,
        seriesOccurrenceId: normalizeText(occ.occurrenceId),
        seriesTemplateId: templateId,
        seriesSequenceNumber: occ.sequenceNumber || null,
        seriesTotal: occ.totalInSeries || null,
        ...asObject(input.metadata),
      };
      state.reservations.push(reservation);
      created.push(reservation);
    }
    await save();
    return clone(created);
  }

  async function renewReservations(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail) {
      const error = new Error('Saknar aktiv reservation att förnya i CCO.');
      error.statusCode = 400;
      throw error;
    }
    const extensionMinutes = Math.max(60, Number(input.extensionMinutes) || 72 * 60);
    const renewedAt = nowIso();
    const nextExpiryAt = addMinutes(renewedAt, extensionMinutes);
    let renewedCount = 0;
    state.reservations = state.reservations.map((item) => {
      if (item.tenantId !== tenantId) return item;
      if (item.conversationId !== conversationId) return item;
      if (item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'active') return item;
      renewedCount += 1;
      return {
        ...item,
        updatedAt: renewedAt,
        expiresAt: nextExpiryAt,
      };
    });
    if (!renewedCount) {
      const error = new Error('Ingen aktiv reservation hittades att förnya.');
      error.statusCode = 404;
      throw error;
    }
    await save();
    return clone(
      state.reservations.filter((item) => {
        return (
          item.tenantId === tenantId &&
          item.conversationId === conversationId &&
          item.customerEmail === customerEmail &&
          normalizeKey(item.status) === 'active'
        );
      })
    );
  }

  async function getActiveReservations({
    tenantId,
    conversationId,
    customerEmail,
    excludeTestData = false,
  } = {}) {
    await expireStaleReservations();
    const tenant = normalizeText(tenantId);
    const conversation = normalizeText(conversationId);
    const customer = normalizeKey(customerEmail);
    return clone(
      state.reservations.filter((item) => {
        if (tenant && item.tenantId !== tenant) return false;
        if (conversation && item.conversationId !== conversation) return false;
        if (customer && item.customerEmail !== customer) return false;
        if (excludeTestData && item.isTestData) return false;
        return normalizeKey(item.status) === 'active';
      })
    );
  }

  function buildCaseWorkflowSummary({ reservations = [], booking = null } = {}) {
    const activeReservations = asArray(reservations).filter(
      (item) => normalizeKey(item?.status) === 'active'
    );
    const confirmedBooking =
      booking && normalizeKey(booking.status) === 'confirmed' ? booking : null;
    const primaryReservation = activeReservations[0] || null;
    const primarySlot = confirmedBooking?.slot || primaryReservation?.slot || null;
    const expiryMeta = getReservationExpiryMeta(activeReservations);
    const workflowState = confirmedBooking
      ? 'confirmed'
      : activeReservations.length
        ? 'reserved'
        : 'idle';
    return {
      state: workflowState,
      stateLabel:
        workflowState === 'confirmed'
          ? 'Bekräftad'
          : workflowState === 'reserved'
            ? activeReservations.length === 1
              ? 'Reserverad'
              : `${activeReservations.length} reserverade`
            : 'Ingen reservation',
      recommendedAction:
        workflowState === 'confirmed'
          ? 'none'
          : workflowState === 'reserved'
            ? expiryMeta.expiresSoon
              ? 'renew_reservation'
              : 'confirm_external'
            : 'candidate_slots',
      reservationCount: activeReservations.length,
      hasReservations: activeReservations.length > 0,
      hasConfirmedBooking: Boolean(confirmedBooking),
      activeReservation: primaryReservation ? clone(primaryReservation) : null,
      primarySlot: primarySlot ? clone(primarySlot) : null,
      nextExpiryAt: expiryMeta.nextExpiryAt,
      expiresInMinutes: Number.isFinite(expiryMeta.expiresInMinutes)
        ? expiryMeta.expiresInMinutes
        : null,
      expiresSoon: expiryMeta.expiresSoon === true,
      stateReason:
        workflowState === 'confirmed'
          ? 'Bokningen är bekräftad i CCO:s egen bokningsmotor.'
          : workflowState === 'reserved'
            ? expiryMeta.nextExpiryAt
              ? expiryMeta.expiresSoon
                ? `Reservationen håller tiden till ${expiryMeta.nextExpiryAt} och bör bekräftas snart.`
                : `Reservationen håller tiden till ${expiryMeta.nextExpiryAt}.`
              : 'Valda tider hålls i CCO i väntan på bekräftelse.'
            : 'Välj tider först och reservera dem sedan i CCO innan slutlig bekräftelse.',
      updatedAt:
        confirmedBooking?.updatedAt ||
        confirmedBooking?.confirmedAt ||
        primaryReservation?.updatedAt ||
        primaryReservation?.createdAt ||
        nowIso(),
    };
  }

  async function confirmBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const preferredSlot =
      normalizeEngineSlot(input.slot || input.selectedSlot, state.services, state.resources) ||
      null;
    const activeReservations = await getActiveReservations({
      tenantId,
      conversationId,
      customerEmail,
    });
    const selectedReservation =
      activeReservations.find((item) => {
        if (!preferredSlot) return true;
        return normalizeText(item.slot.slotId) === normalizeText(preferredSlot.slotId);
      }) || null;
    const slot = selectedReservation?.slot || preferredSlot;
    if (!tenantId || !conversationId || !customerEmail || !slot) {
      const error = new Error('Saknar reserverad eller vald tid för att bekräfta bokningen.');
      error.statusCode = 400;
      throw error;
    }
    // Behandlingsrum — fyll i om tiden inte redan bär ett (t.ex. direkt confirm
    // utan föregående reservation). Explicit slot.roomId vinner alltid.
    if (!normalizeText(slot.roomId)) {
      const resource = getResourceById(slot.resourceId) || {};
      const room = resolveRoomForSlot(slot, resource, {
        excludeConversationId: conversationId,
        tenantId,
      });
      if (room) {
        slot.roomId = room.id;
        slot.roomLabel = room.name;
      }
    }
    const existingConfirmedBooking =
      state.bookings.find((item) => {
        if (item.tenantId !== tenantId || item.conversationId !== conversationId) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    if (
      !selectedReservation &&
      preferredSlot &&
      isSlotTaken(preferredSlot, { excludeConversationId: conversationId, tenantId })
    ) {
      if (input.override === true) {
        if (typeof input.onOverride === 'function') {
          input.onOverride({
            resourceId: normalizeText(preferredSlot.resourceId),
            slotId: normalizeText(preferredSlot.slotId),
            startsAt: normalizeText(preferredSlot.startsAt),
          });
        }
      } else {
        const error = new Error('Tiden är upptagen av en annan bokning.');
        error.statusCode = 409;
        error.metadata = { code: 'resource_conflict', overrideRequired: true };
        throw error;
      }
    }
    if (
      existingConfirmedBooking &&
      normalizeText(existingConfirmedBooking.slot?.slotId) &&
      normalizeText(existingConfirmedBooking.slot?.slotId) !== normalizeText(slot.slotId)
    ) {
      const error = new Error(
        'Det finns redan en bekräftad tid i CCO. Använd ombokning för att ersätta den.'
      );
      error.statusCode = 409;
      error.metadata = {
        code: 'booking_rebook_required',
        confirmedSlotId: normalizeText(existingConfirmedBooking.slot?.slotId),
        selectedSlotId: normalizeText(slot.slotId),
      };
      throw error;
    }
    state.reservations = state.reservations.map((item) => {
      if (item.tenantId !== tenantId || item.conversationId !== conversationId) return item;
      return {
        ...item,
        status:
          normalizeText(selectedReservation?.reservationId) === item.reservationId
            ? 'confirmed'
            : 'released',
        updatedAt: nowIso(),
      };
    });
    const existingBookingIndex = state.bookings.findIndex(
      (item) =>
        item.tenantId === tenantId &&
        item.conversationId === conversationId &&
        normalizeKey(item.status) === 'confirmed'
    );
    // F2-3 (2026-05-28): rescheduledFromBookingId propageras från
    // rebookBooking-flow så nya bokningen pekar tillbaka till den
    // cancellerade föregående bokningen. Tom string för "normal" confirm
    // utan föregående reschedule.
    const rescheduledFromBookingId = normalizeText(input.rescheduledFromBookingId);
    const rescheduledAt = rescheduledFromBookingId ? nowIso() : '';
    const bookingRecord = normalizeBookingRecord(
      {
        ...(existingBookingIndex >= 0 ? state.bookings[existingBookingIndex] : {}),
        tenantId,
        workspaceId: input.workspaceId,
        conversationId,
        customerEmail,
        customerName: input.customerName,
        // ORD-183: utan nummer går ingen påminnelse ut. Normaliseras i
        // normalizeBookingRecord, eller blir tomt om det inte går att tolka.
        customerPhone: input.customerPhone || input.phone,
        ownerUserId: input.ownerUserId,
        ownerName: input.ownerName,
        canonicalPatientId: input.canonicalPatientId || input.patientId,
        encounterId: input.encounterId,
        practitionerId: input.practitionerId,
        practitionerLabel: input.practitionerLabel,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        conversationKey: input.conversationKey,
        // ORD-190: token för avboka/omboka-länken. Genereras EN gång — en
        // befintlig token får aldrig bytas ut vid en ombekräftelse, för då
        // slutar länken i ett redan skickat mejl att fungera.
        bookingActionToken:
          normalizeText(
            existingBookingIndex >= 0
              ? state.bookings[existingBookingIndex]?.bookingActionToken
              : ''
          ) || nyBookingActionToken(),
        slot,
        status: 'confirmed',
        confirmedAt: nowIso(),
        rescheduledFromBookingId,
        rescheduledAt,
      },
      state
    );
    if (existingBookingIndex >= 0) {
      state.bookings[existingBookingIndex] = bookingRecord;
    } else {
      state.bookings.push(bookingRecord);
    }
    await save();

    /**
     * ORD-179 — bekräftad tid ger ett bokningsärende.
     *
     * Utan det här steget har läkarens ordinationsflöde ingenting att arbeta
     * på: cco-booking-cases.json fanns inte ens på disk i produktion. Kedjan
     * var byggd men aldrig ansluten.
     *
     * Efter save() och fail-soft, av exakt samma skäl som avbokningshooken:
     * går ärendeskapandet fel ska bokningen ändå stå kvar som bekräftad. Att
     * kasta här hade lämnat en bekräftad tid på disk men rapporterat fel till
     * kunden.
     *
     * Konsekvensen av ett tyst fel är dock att en bekräftad operation saknar
     * ärende, och därmed aldrig når läkaren. Det loggas högt.
     */
    if (typeof onBookingConfirmed === 'function' && bookingRecord.bookingId) {
      try {
        await onBookingConfirmed({
          bookingId: bookingRecord.bookingId,
          tenantId: bookingRecord.tenantId || tenantId || null,
          conversationId: bookingRecord.conversationId || conversationId || null,
          customerEmail: bookingRecord.customerEmail || customerEmail || null,
          customerName: bookingRecord.customerName || null,
          patientId: bookingRecord.canonicalPatientId || null,
          ownerUserId: bookingRecord.ownerUserId || null,
          serviceId: bookingRecord.slot?.serviceId || null,
          serviceLabel: bookingRecord.slot?.serviceLabel || null,
          resourceId: bookingRecord.slot?.resourceId || null,
          resourceLabel: bookingRecord.slot?.resourceLabel || null,
          startsAt: bookingRecord.slot?.startsAt || null,
          endsAt: bookingRecord.slot?.endsAt || null,
          rescheduledFromBookingId: bookingRecord.rescheduledFromBookingId || '',
        });
      } catch (err) {
        console.error(
          '[booking-confirm] bokningsärendet kunde INTE skapas för bokning ' +
            `${bookingRecord.bookingId}: ${err?.message || err}. ` +
            'Tiden är bekräftad men når aldrig läkarens ordinationskö.'
        );
      }
    }

    return clone(bookingRecord);
  }

  // ORD-146: bekräfta kundens aktiva reservation — oavsett vilken konversation
  // den skapades i. Används av signeringsflödet så att "signerat avtal" blir det
  // enda stället en reservation går till confirmed.
  async function confirmReservationForCustomer({ tenantId, customerEmail } = {}) {
    const active = await getActiveReservations({ tenantId, customerEmail });
    if (!active.length) return null;
    const reservation = active[0];
    return confirmBooking({
      tenantId: normalizeText(tenantId) || reservation.tenantId,
      conversationId: reservation.conversationId,
      customerEmail: reservation.customerEmail || customerEmail,
    });
  }

  function findBookingByIdempotency({ tenantId, idempotencyKey } = {}) {
    const tenant = normalizeText(tenantId);
    const key = normalizeText(idempotencyKey);
    if (!tenant || !key) return null;
    const booking = state.bookings.find(
      (item) =>
        item.tenantId === tenant &&
        item.idempotencyKey === key &&
        normalizeKey(item.status) === 'confirmed'
    );
    return booking ? clone(booking) : null;
  }

  async function reserveAndConfirmIdempotent(input = {}, { onCommitted } = {}) {
    const tenantId = normalizeText(input.tenantId);
    const idempotencyKey = normalizeText(input.idempotencyKey);
    const requestFingerprint = normalizeText(input.requestFingerprint);
    if (!tenantId || !idempotencyKey || !requestFingerprint) {
      const error = new Error('Idempotency-key och request fingerprint krävs.');
      error.statusCode = 400;
      throw error;
    }

    const existing = findBookingByIdempotency({ tenantId, idempotencyKey });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        const error = new Error('Idempotency-key har redan använts med annat bokningsunderlag.');
        error.statusCode = 409;
        error.metadata = { code: 'idempotency_payload_mismatch' };
        throw error;
      }
      return { booking: existing, replayed: true, compensated: false };
    }

    const inflightKey = `${tenantId}:${idempotencyKey}`;
    if (createBookingInflight.has(inflightKey)) return createBookingInflight.get(inflightKey);

    const mutate = async () => {
      const snapshot = clone(state);
      try {
        await reserveSlots(input);
        const booking = await confirmBooking(input);
        if (typeof onCommitted === 'function') await onCommitted(clone(booking));
        return { booking, replayed: false, compensated: false };
      } catch (error) {
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, snapshot);
        await save();
        error.metadata = { ...(error.metadata || {}), compensated: true };
        throw error;
      }
    };
    // The compensation snapshot covers the complete booking-engine state.
    // Serialize distinct create operations so one rollback can never undo a
    // successful concurrent booking with another idempotency key.
    const operation = createBookingMutationTail.then(mutate, mutate);
    createBookingMutationTail = operation.catch(() => {});
    createBookingInflight.set(inflightKey, operation);
    try {
      return await operation;
    } finally {
      createBookingInflight.delete(inflightKey);
    }
  }

  async function cancelBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const reason = normalizeText(input.reason) || 'Avbokad i CCO';
    // F2-3 (2026-05-28): cancelledBy är audit-info för "vem avbokade".
    // Default 'operator' eftersom historiska CCO-flow är operatör-drivna.
    // Patient-token-flow skickar 'patient_token', rebook-flow skickar
    // 'rebook'. Tomt input.cancelledBy → 'operator'.
    const cancelledBy = normalizeText(input.cancelledBy) || 'operator';
    const force = input.force === true;
    let changed = false;
    let blockedPolicy = null;
    const avbokadeBokningar = [];
    state.bookings = state.bookings.map((item) => {
      if (tenantId && item.tenantId !== tenantId) return item;
      if (conversationId && item.conversationId !== conversationId) return item;
      if (customerEmail && item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'confirmed') return item;
      const service = getServiceById(item?.slot?.serviceId) || {};
      const policy = assertCancellationAllowed(item, service);
      if (!policy.allowed && !force) {
        blockedPolicy = policy;
        return item;
      }
      const retention = resolveDepositRetention(item, service);
      changed = true;
      avbokadeBokningar.push({
        bookingId: item.bookingId || item.id || null,
        tenantId: item.tenantId || null,
      });
      return {
        ...item,
        status: 'cancelled',
        cancelledAt: nowIso(),
        cancellationReason: reason,
        cancelledBy,
        // ORD-147: inom 2 veckor före besöket behålls depositionen (20 %).
        depositRetained: retention.retainDeposit,
        updatedAt: nowIso(),
      };
    });
    if (blockedPolicy) {
      const error = new Error(blockedPolicy.reason || 'Avbokning tillåts inte enligt policy.');
      error.statusCode = 409;
      error.policy = blockedPolicy;
      throw error;
    }
    state.reservations = state.reservations.map((item) => {
      if (tenantId && item.tenantId !== tenantId) return item;
      if (conversationId && item.conversationId !== conversationId) return item;
      if (customerEmail && item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'active') return item;
      changed = true;
      return {
        ...item,
        status: 'released',
        updatedAt: nowIso(),
      };
    });
    if (!changed) {
      const error = new Error('Ingen aktiv bokning hittades att avboka.');
      error.statusCode = 404;
      throw error;
    }
    await save();

    // ORD-171: släck läkarens ordinationsgodkännande för de avbokade tiderna.
    //
    // Efter save() och medvetet fail-soft: går släckningen fel ska avbokningen
    // ändå stå kvar som gjord. Att kasta här skulle lämna en bokning avbokad
    // på disk men rapportera fel till anroparen, vilket är värre.
    //
    // Konsekvensen av ett tyst fel är dock att ett godkännande ligger kvar som
    // giltigt — så det loggas högt, inte tyst.
    if (typeof onBookingCancelled === 'function' && avbokadeBokningar.length) {
      for (const bokning of avbokadeBokningar) {
        if (!bokning.bookingId) continue;
        try {
          await onBookingCancelled({
            bookingId: bokning.bookingId,
            tenantId: bokning.tenantId || tenantId || null,
            reason,
            cancelledBy,
          });
        } catch (err) {
          console.error(
            '[booking-cancel] ordinationsgodkännandet kunde INTE släckas för bokning ' +
              `${bokning.bookingId}: ${err?.message || err}. ` +
              'Ett godkännande kan ligga kvar som giltigt för en avbokad tid.'
          );
        }
      }
    }

    return {
      tenantId,
      conversationId,
      customerEmail,
      status: 'cancelled',
      cancellationReason: reason,
      cancelledBy,
      cancelledBookings: avbokadeBokningar.map((b) => b.bookingId).filter(Boolean),
    };
  }

  /**
   * Ombokning i ett steg: avboka gammal tid, reservera ny, bekräfta.
   *
   * ── Varför rollbacken är kirurgisk och inte en helstate-återställning ──────
   *
   * Ombokningen måste vara atomisk. Failar något efter avbokningen — måltiden
   * hann bli upptagen, bokningspolicyn säger nej — ska patienten inte stå utan
   * bokning. Det inträffade under prod-spotchecken 2026-08-21: `rebookBooking`
   * avbokade originalet och föll sedan på 180-dagarsgränsen i `confirmBooking`.
   *
   * Den enkla lösningen är att kopiera hela `state` före och skriva tillbaka
   * den vid fel. `reserveAndConfirmIdempotent` gör precis så. Men den kan
   * bara göra det för att den samtidigt serialiserar sig genom
   * `createBookingMutationTail` — utan kön hade dess rollback kunnat radera
   * en annan bokning som blev klar i fönstret.
   *
   * Kön räcker ändå inte här. `cancelBooking`, `renewReservation` och
   * kalenderblocken skriver till `state` helt utanför kön. En helstate-
   * återställning kunde alltså tysta en avbokning som personalen gjorde för
   * en ANNAN patient mitt i vårt fönster — vi hade bytt ett sätt att förlora
   * en bokning mot ett annat.
   *
   * Därför två spärrar:
   *
   *   1. Rollbacken rör bara rader vi själva äger — bokningar och
   *      reservationer för den här patienten — och tar bort rader som vårt
   *      egna misslyckade försök hann skapa. Allt annat lämnas orört.
   *   2. Hela ombokningen körs i samma kö som skapa-bokning, så vår rollback
   *      och deras aldrig kan överlappa åt något håll.
   */
  async function rebookBookingSerialiserad(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const previousBooking =
      state.bookings.find((item) => {
        if (tenantId && item.tenantId !== tenantId) return false;
        if (conversationId && item.conversationId !== conversationId) return false;
        if (customerEmail && item.customerEmail !== customerEmail) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;

    // Samma filter som cancelBooking och confirmBooking använder. Tomma fält
    // matchar allt, exakt som där — annars hade snapshoten kunnat missa en
    // rad som cancelBooking sedan ändrar.
    const tillhorOss = (item) => {
      if (tenantId && item.tenantId !== tenantId) return false;
      if (conversationId && item.conversationId !== conversationId) return false;
      if (customerEmail && normalizeKey(item.customerEmail) !== customerEmail) return false;
      return true;
    };
    const bokningarFore = new Map(
      state.bookings.filter(tillhorOss).map((item) => [item.bookingId, clone(item)])
    );
    const reservationerFore = new Map(
      state.reservations.filter(tillhorOss).map((item) => [item.reservationId, clone(item)])
    );
    // Rader som fanns innan vi började. Allt som dyker upp därutöver är vårt
    // eget misslyckade försök och ska bort.
    const kandaBokningsId = new Set(state.bookings.map((item) => item.bookingId));
    const kandaReservationsId = new Set(state.reservations.map((item) => item.reservationId));

    const rullaTillbaka = () => {
      state.bookings = state.bookings
        .filter((item) => kandaBokningsId.has(item.bookingId))
        .map((item) => bokningarFore.get(item.bookingId) || item);
      state.reservations = state.reservations
        .filter((item) => kandaReservationsId.has(item.reservationId))
        .map((item) => reservationerFore.get(item.reservationId) || item);
    };

    try {
      await cancelBooking({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerEmail: input.customerEmail || input.customerId,
        reason: normalizeText(input.reason) || 'Ombokad i CCO',
        // F2-3: markera tydligt att avbokningen är del av rebook-flow
        // (skiljer sig från manuell avboka eller patient-cancel)
        cancelledBy: normalizeText(input.cancelledBy) || 'rebook',
      });
      await reserveSlots(input);
      // F2-3: propagera audit-pekare till nya bokningen så vi kan tracerar
      // hela ombokningskedjan via rescheduledFromBookingId
      const booking = await confirmBooking({
        ...input,
        rescheduledFromBookingId: normalizeText(previousBooking?.bookingId) || '',
      });
      return {
        ...booking,
        previousBooking: previousBooking ? clone(previousBooking) : null,
        previousSlot: previousBooking?.slot ? clone(previousBooking.slot) : null,
      };
    } catch (error) {
      rullaTillbaka();
      await save();
      error.metadata = { ...(error.metadata || {}), rebookRolledBack: true };
      throw error;
    }
  }

  async function rebookBooking(input = {}) {
    // Spärr 2: samma kö som reserveAndConfirmIdempotent. Ombokning och
    // skapa-bokning kan därmed aldrig ligga i varandras fönster.
    const mutate = () => rebookBookingSerialiserad(input);
    const operation = createBookingMutationTail.then(mutate, mutate);
    createBookingMutationTail = operation.catch(() => {});
    return operation;
  }

  async function getCaseSummary({
    tenantId,
    conversationId,
    customerEmail,
    excludeTestData = false,
  } = {}) {
    const reservations = await getActiveReservations({
      tenantId,
      conversationId,
      customerEmail,
      excludeTestData,
    });
    const booking =
      state.bookings.find((item) => {
        if (tenantId && item.tenantId !== normalizeText(tenantId)) return false;
        if (conversationId && item.conversationId !== normalizeText(conversationId)) return false;
        if (customerEmail && item.customerEmail !== normalizeKey(customerEmail)) return false;
        if (excludeTestData && item.isTestData) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    const workflow = buildCaseWorkflowSummary({ reservations, booking });
    return {
      reservations,
      booking: clone(booking),
      ...workflow,
      resources: clone(state.resources.filter((item) => item.active !== false)),
      services: clone(state.services.filter((item) => item.active !== false)),
    };
  }

  /** Server-side Kunder enrichment — minimal booking rows (no PII beyond email keying). */
  function listBookingsForEnrichment(tenantId = null, { excludeTestData = false } = {}) {
    const tid = normalizeText(tenantId);
    return clone(
      state.bookings.filter((item) => {
        if (tid && item.tenantId !== tid) return false;
        if (excludeTestData && item.isTestData) return false;
        return true;
      })
    );
  }

  /** Dossié / kundkort: hamta bokningar kopplade till samma patient eller e-post. */
  function getBookingsForCustomer({
    tenantId,
    customerEmail,
    customerId,
    patientId,
    excludeTestData = false,
  } = {}) {
    const tid = normalizeText(tenantId);
    const wantedPatientId = normalizeText(patientId) || normalizeText(customerId);
    const wantedEmail = normalizeKey(customerEmail);
    return clone(
      state.bookings.filter((item) => {
        if (tid && item.tenantId !== tid) return false;
        if (excludeTestData && item.isTestData) return false;
        if (wantedPatientId && normalizeText(item.canonicalPatientId) === wantedPatientId) {
          return true;
        }
        if (wantedEmail && item.customerEmail === wantedEmail) {
          return true;
        }
        return false;
      })
    );
  }

  return {
    listBookingsForEnrichment,
    getBookingsForCustomer,
    setBookingPolicySettings,
    listAvailability,
    isRoomTaken,
    reserveSlots,
    upsertSeriesReservations,
    renewReservations,
    getActiveReservations,
    confirmBooking,
    confirmReservationForCustomer,
    findBookingByIdempotency,
    reserveAndConfirmIdempotent,
    cancelBooking,
    rebookBooking,
    getCaseSummary,
    listCalendarBlocks,
    getCalendarBlock,
    upsertCalendarBlock,
    listAvailabilityRules,
    upsertAvailabilityRule,
    deactivateAvailabilityRule,
    setServiceDuration,
    markBookingOutcome,
    BOKNINGSSTATUS,
    listResources: async ({ brand = '' } = {}) =>
      clone(
        state.resources.filter((item) => item.active !== false && resourceMatchesBrand(item, brand))
      ),
    listServices: async ({ brand = '' } = {}) =>
      clone(
        state.services.filter((item) => item.active !== false && serviceMatchesBrand(item, brand))
      ),
    listPublicServices: async ({ brand = '' } = {}) =>
      clone(
        state.services.filter(
          (item) =>
            item.active !== false &&
            item.publicBookable === true &&
            serviceMatchesBrand(item, brand)
        )
      ),
    listPublicResources: async ({ brand = '' } = {}) =>
      clone(
        state.resources.filter(
          (item) =>
            item.active !== false &&
            (item.publicBookable === true ||
              PLAN_A_PUBLIC_RESOURCE_IDS.includes(normalizeText(item.id))) &&
            resourceMatchesBrand(item, brand)
        )
      ),
    listPublicAvailability: async (input = {}) =>
      listAvailability({
        ...input,
        publicOnly: true,
      }),
    resolveServiceId: (serviceId = '') => resolveServiceRegisterAlias(serviceId),
    getRuntimeCatalog: async () =>
      buildStaffRuntimeCatalogReadout(state, {
        planAPublicResourceIds: PLAN_A_PUBLIC_RESOURCE_IDS,
        bookingPolicySettings,
      }),
    getBookingPolicySummary: async () => clone(bookingPolicySettings.globalDefaults),
    _state: state,
  };
}

module.exports = {
  createCcoBookingEngineStore,
  PLAN_A_PUBLIC_RESOURCE_IDS,
  resolveServiceRegisterAlias,
  isServiceRegisterPublicBookable,
  resolveServiceBookingPolicy,
  expandCalendarBlocksForRange,
  isSlotBlockedByCalendar,
};
