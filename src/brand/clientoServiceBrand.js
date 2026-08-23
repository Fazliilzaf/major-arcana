'use strict';

/**
 * Cliento-tjänst → varumärke (läs-ENDAST uppslag).
 *
 * Bygger en normaliserad `serviceLabel` → brand-key-mappning från
 * `migration/cliento-service-catalog.json` (82 tjänster med `name` + `brand`).
 * Används av kalendervyn för att filtrera Cliento-bokningar per varumärke på
 * lässidan — utan att skriva något till storen.
 *
 * Fail-closed: ett `serviceLabel` som inte matchar katalogen ger `''`
 * (okänt varumärke) och ska därför INTE visas förrän det klassats.
 */

const { loadLegacyCatalogBundle } = require('../ops/legacyCatalogLoader');

function normalizeText(value) {
  return String(value ?? '').trim();
}

/**
 * Normalisera ett tjänstenamn för robust strängmatchning.
 * Cliento-storen använder `|` ("Ortopedisk PRP/PRF | Behandling") medan
 * katalogen använder `·` ("Ortopedisk PRP/PRF · Behandling"). Båda ska
 * normaliseras till samma kanoniska form.
 */
function normalizeServiceName(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[|·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisera ett varumärkesnamn till en stabil nyckel.
 * Katalogen använder "Hair TP Clinic"/"Curatiio"; `resolveBrandForHost`
 * returnerar 'hair-tp-clinic'/'curatiio'. Båda normaliseras hit.
 */
function normalizeBrandKey(value) {
  const key = normalizeText(value).toLowerCase();
  if (key === 'hairtp' || key === 'hair tp clinic' || key === 'hair-tp-clinic') {
    return 'hair-tp-clinic';
  }
  if (key === 'curatio' || key === 'curatiio') return 'curatiio';
  return key;
}

/**
 * Explicita Curatiio-tjänstenamn (otvetydiga ortopedi/ögon/stygn/botox-tjänster).
 *
 * Katalogen felmärker flera av dessa som "Hair TP Clinic" (t.ex. "Stygn
 * borttagning", "Botox · Behandling", "Biofillers"), och vissa stavningar
 * ("Stygnborttagning" utan mellanslag) saknas helt i katalogen. De läcker
 * därför igenom det asymmetriska filtret. Den här listan är en
 * högre-tröskel-klassificering: att *dölja* en tjänst kräver inte att den
 * är fullt migrerad.
 *
 * Bevis för Botox/Biofillers → Curatiio (katalogen säger Hair TP):
 *   - migration/service-triple-map.json: botox → Curatiio
 *   - migration/curatiio-services-seed.json: curatiio-botox/-fillers/-profhilo
 *   - config/meridiq-brand-overrides.json: "Botox säljs endast av Curatiio"
 *
 * OBS (fälla): "Stygnborttagning"/"Stygn borttagning" är Curatiio, medan
 * "Ta bort styng" är Hair TP. Normaliseringen får inte slå ihop dem.
 *
 * Ta INTE bort den här listan "för att katalogen nu är rätt": katalogen har
 * felmärkt tjänster förut och kan göra det igen. Listan är den explicita
 * sanningen och ska vinnas över katalogen.
 */
const CURATIIO_SERVICE_NAMES_RAW = [
  'Ortopedi · Telefonuppföljning',
  'Ortopedi · Uppföljning',
  'Ortopedisk PRP/PRF · Konsultation via telefon',
  'Stygnborttagning',
  'Stygn borttagning',
  'Ögonplastik · Digital konsultation',
  'Ögonplastik · Digital uppföljning',
  'Ögonplastik · Uppföljning',
  // Botox/Biofillers: katalogen felmärker dem som Hair TP; tre oberoende
  // källor (triple-map, curatiio-seed, meridiq-overrides) säger Curatiio.
  'Botox · Behandling',
  'Botox · Konsultation',
  'Botox · Återbesök',
  'Biofillers',
];

let cachedExplicitSet = null;

function buildExplicitCuratiioSet() {
  if (cachedExplicitSet) return cachedExplicitSet;
  cachedExplicitSet = new Set(CURATIIO_SERVICE_NAMES_RAW.map(normalizeServiceName));
  return cachedExplicitSet;
}

let cachedMap = null;

function loadNameToBrandMap({ repoRoot = process.cwd() } = {}) {
  if (cachedMap) return cachedMap;
  const bundle = loadLegacyCatalogBundle({ repoRoot });
  const services = Array.isArray(bundle?.catalogs?.clientoServices?.services)
    ? bundle.catalogs.clientoServices.services
    : [];
  const map = new Map();
  for (const service of services) {
    const name = normalizeServiceName(service?.name);
    if (!name) continue;
    const brand = normalizeBrandKey(service?.brand);
    // Första förekomsten vinner — katalogen är deduperad per srvId.
    if (!map.has(name)) map.set(name, brand);
  }
  cachedMap = map;
  return map;
}

/**
 * Returnerar brand-key ('hair-tp-clinic' | 'curatiio') för ett Cliento
 * `serviceLabel`, eller '' om namnet inte matchar katalogen (fail-closed).
 */
function brandForClientoServiceLabel(serviceLabel, { repoRoot = process.cwd() } = {}) {
  const name = normalizeServiceName(serviceLabel);
  if (!name) return '';
  // Explicit Curatiio-lista vinner över katalogen — den stänger läckan för
  // tjänster som katalogen felmärkt eller saknar.
  if (buildExplicitCuratiioSet().has(name)) return 'curatiio';
  return loadNameToBrandMap({ repoRoot }).get(name) || '';
}

module.exports = {
  normalizeServiceName,
  normalizeBrandKey,
  brandForClientoServiceLabel,
  loadNameToBrandMap,
  buildExplicitCuratiioSet,
  CURATIIO_SERVICE_NAMES_RAW,
};
