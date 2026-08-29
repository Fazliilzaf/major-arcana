const crypto = require('node:crypto');
const { reportDroppedKeys } = require('./ccoNormalizerDropLoud');
const {
  applyBookingPolicyToService,
  assertCancellationAllowed,
  capAvailabilityToDate,
  isSlotWithinBookingPolicy,
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
const KONSULTATION_OPPET = {
  vardag: { fran: '10:00', till: '18:00' },
  lordag: { fran: '10:00', till: '16:00' },
};
const KONSULTATION_MINUTER = 45;

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
        cancellationHours: 4,
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
        cancellationHours: 4,
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
        cancellationHours: 4,
        priceBase: 0,
      },
      {
        id: 'fue',
        label: 'FUE-hårtransplantation',
        durationMinutes: 480,
        active: false,
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 72,
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
        cancellationHours: 72,
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
        cancellationHours: 72,
        priceBase: 29900,
      },
      {
        id: 'eyebrow',
        label: 'Ögonbrynstransplantation',
        durationMinutes: 240,
        active: false,
        minNoticeHours: 168,
        maxAdvanceDays: 180,
        cancellationHours: 72,
        priceBase: 24900,
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
  const servicesById = new Map(state.services.map((item) => [item.id, item]));

  for (const svc of defaults.services) {
    const id = normalizeText(svc.id);
    const existing = servicesById.get(id);
    const canonicalId = resolveServiceRegisterAlias(id);
    if (canonicalId !== id) {
      const next = { ...svc, ...(existing || {}), ...svc, active: false, publicBookable: false };
      if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) {
        servicesById.set(id, next);
        changed = true;
      }
      continue;
    }
    if (isServiceRegisterPublicBookable(id)) {
      const next = { ...svc, ...(existing || {}), ...svc, active: true, publicBookable: true };
      if (JSON.stringify(existing) !== JSON.stringify(next)) {
        servicesById.set(id, next);
        changed = true;
      }
      continue;
    }
    if (existing && existing.active !== false) {
      servicesById.set(id, { ...existing, active: false, publicBookable: false });
      changed = true;
    } else if (!existing) {
      servicesById.set(id, { ...svc, active: false, publicBookable: false });
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
    slot,
    status: normalizeKey(safe.status) || 'confirmed',
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

async function createCcoBookingEngineStore({ filePath, rooms, onReservationsExpired = null }) {
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
          console.warn('[ccoBookingEngineStore] onReservationsExpired failed:', err?.message || err);
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
  function isRoomTaken(roomId, startsAt, endsAt, { excludeConversationId = '' } = {}) {
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
    return (
      state.reservations.some((item) => {
        if (normalizeKey(item.status) !== 'active') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
        return usesRoom(item) && overlaps(item.slot);
      }) ||
      state.bookings.some((item) => {
        if (normalizeKey(item.status) !== 'confirmed') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
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
  } = {}) {
    for (const room of roomCatalog) {
      if (excludeRoomIds.has(room.id)) continue;
      if (!isRoomTaken(room.id, startsAt, endsAt, { excludeConversationId })) return room;
    }
    return null;
  }

  // Prioritet: personalens defaultRoomId → första lediga.
  // Explicit slot.roomId hanteras av anroparna (reserve/confirm) som bara kallar
  // hit när roomId är tomt — en egen gren här vore dött kött.
  function resolveRoomForSlot(
    slot = {},
    resource = {},
    { excludeConversationId = '', excludeRoomIds = new Set() } = {}
  ) {
    const defaultRoomId = normalizeText(resource?.defaultRoomId);
    // Standardrummet prövas mot isRoomTaken — automatik får aldrig tyst
    // dubbelboka ett rum. Explicit slot.roomId är ett mänskligt val och
    // respekteras som det är (varning räcker där).
    if (
      defaultRoomId &&
      !excludeRoomIds.has(defaultRoomId) &&
      !isRoomTaken(defaultRoomId, slot.startsAt, slot.endsAt, { excludeConversationId })
    ) {
      const room = roomCatalog.find((item) => item.id === defaultRoomId);
      if (room) return room;
    }
    return suggestFreeRoom({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      excludeConversationId,
      excludeRoomIds,
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

  function isSlotTaken(slot = {}, { excludeConversationId = '' } = {}) {
    const slotId = normalizeText(slot.slotId);
    if (isSlotBlockedByCalendar(slot, state.calendarBlocks, state.resources)) return true;
    return (
      state.reservations.some((item) => {
        if (normalizeKey(item.status) !== 'active') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      }) ||
      state.bookings.some((item) => {
        if (normalizeKey(item.status) !== 'confirmed') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
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
              !isSlotTaken(slot, { excludeConversationId })
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
      if (isSlotTaken(slot, { excludeConversationId: conversationId })) {
        const error = new Error(`Tiden ${slot.startsAt} är inte längre ledig.`);
        error.statusCode = 409;
        throw error;
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
          // ORD-146: reservationen håller tiden i 14 dagar (signera + betala 20 %).
          expiresAt: addMinutes(nowIso(), 14 * 24 * 60),
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
      const room = resolveRoomForSlot(slot, resource, { excludeConversationId: conversationId });
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
      isSlotTaken(preferredSlot, { excludeConversationId: conversationId })
    ) {
      const error = new Error(
        `Tiden ${preferredSlot.startsAt} är inte längre ledig för bekräftelse.`
      );
      error.statusCode = 409;
      throw error;
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
        ownerUserId: input.ownerUserId,
        ownerName: input.ownerName,
        canonicalPatientId: input.canonicalPatientId || input.patientId,
        encounterId: input.encounterId,
        practitionerId: input.practitionerId,
        practitionerLabel: input.practitionerLabel,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        conversationKey: input.conversationKey,
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
      changed = true;
      return {
        ...item,
        status: 'cancelled',
        cancelledAt: nowIso(),
        cancellationReason: reason,
        cancelledBy,
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
    return {
      tenantId,
      conversationId,
      customerEmail,
      status: 'cancelled',
      cancellationReason: reason,
      cancelledBy,
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
