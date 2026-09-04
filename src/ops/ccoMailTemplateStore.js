'use strict';

/**
 * ccoMailTemplateStore — persistent mall-bibliotek för operatörens
 * snabbsvar i composer. Mallar har en label, body, och variabel-stöd
 * via {{namn}}, {{operatör}}, etc.
 *
 * Designprinciper:
 *   • Persistent JSON-fil
 *   • CRUD: list / get / save (upsert) / delete
 *   • Default-mallar seedas vid första start (om filen inte finns)
 *   • Mallar kan höra till en KLINIK (`brand`) eller till båda (`brand: null`)
 *
 * ORD-216 — KLINIKTILLHÖRIGHET. Fram till 2026-09-04 var mallarna globala,
 * och kommunikationspanelen anropade `?brand=curatiio` mot en route som inte
 * fanns. Panelen trodde alltså att den filtrerade per klinik; servern hade
 * aldrig lovat det. Hade panelen kopplats till den befintliga routen rakt av
 * hade en Curatiio-konversation visat Hair TP:s mallar, och personalen kunde
 * skickat hårklinikens formuleringar till en ögonlockspatient.
 *
 * `brand: null` betyder GEMENSAM och är standard. Befintliga mallar saknar
 * fältet och blir därmed gemensamma — samma beteende som förut, ingen mall
 * försvinner ur någons lista vid uppgraderingen.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function cloneJson(v) {
  return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
}

/**
 * Lightweight template sanitiser. Removes obvious active content vectors while
 * preserving harmless formatting. This is defense-in-depth: the CCO composer
 * treats templates as plain text, so this mainly protects future consumers.
 */
function sanitizeTemplateBody(value = '') {
  return (
    String(value)
      // Drop <script> blocks entirely.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      // Drop inline event handlers: onerror, onclick, etc.
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // Neutralise javascript: URLs on link/src/action attributes.
      .replace(
        /\s+(href|src|action|formaction)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
        ' $1="#"'
      )
      // Neutralise CSS expression() and javascript: URLs in style attributes.
      .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, (match) =>
        match.replace(/expression\s*\(/gi, 'expression_block(').replace(/javascript:[^;"']*/gi, '')
      )
  );
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
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

const DEFAULT_TEMPLATES = [
  {
    label: 'Bekräfta tid',
    icon: '✓',
    body: 'Hej {{förnamn}}!\n\nVi bekräftar din tid {{datum}}. Vi ser fram emot ditt besök hos oss på Hair TP Clinic.\n\nMvh,\n{{operatör}}',
  },
  {
    label: 'Be om förtydligande',
    icon: '?',
    body: 'Hej {{förnamn}}!\n\nTack för ditt mejl. Skulle du kunna förtydliga vad du menar — så att jag kan hjälpa dig på bästa sätt?\n\nMvh,\n{{operatör}}',
  },
  {
    label: 'Boka konsultation',
    icon: '📅',
    body: 'Hej {{förnamn}}!\n\nTack för ditt intresse. För att kunna ge dig ett exakt pris och en behandlingsplan rekommenderar vi en gratis konsultation. Då går vi tillsammans igenom dina mål och möjligheter.\n\nVi har lediga tider hela veckan — säg till vilken tid som passar dig så bokar vi in.\n\nMvh,\n{{operatör}}\nHair TP Clinic',
  },
  {
    label: 'Påminnelse — bokad tid',
    icon: '⏰',
    body: 'Hej {{förnamn}}!\n\nBara en vänlig påminnelse om din kommande tid hos oss. Hör av dig om du behöver omboka.\n\nVi ses snart!\n\nMvh,\n{{operatör}}',
  },
  {
    label: 'Tack för intresse',
    icon: '🙏',
    body: 'Hej {{förnamn}}!\n\nTack för att du hör av dig till Hair TP Clinic. Jag återkommer inom kort med mer information.\n\nMvh,\n{{operatör}}',
  },
];

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, templates: [] };
}

/**
 * ORD-216 — klinikvärdet normaliseras mot en känd lista.
 *
 * Panelen skickar `hair_tp` respektive `curatiio`. Resten av kodbasen använder
 * tenant-id `hair-tp-clinic`. Båda accepteras och landar på samma värde, så en
 * mall inte blir osynlig för att två delar av systemet stavar kliniken olika.
 */
const KANDA_BRANDS = Object.freeze({
  hair_tp: 'hair_tp',
  'hair-tp': 'hair_tp',
  'hair-tp-clinic': 'hair_tp',
  hairtp: 'hair_tp',
  curatiio: 'curatiio',
});

function normalizeBrand(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  return KANDA_BRANDS[raw] || null;
}

function normalizeTemplate(input = {}) {
  const label = sanitizeTemplateBody(normalizeText(input.label)).trim().slice(0, 80);
  const body = sanitizeTemplateBody(normalizeText(input.body)).trim().slice(0, 4000);
  if (!label || !body) return null;
  return {
    templateId: normalizeText(input.templateId) || crypto.randomUUID(),
    label,
    icon: normalizeText(input.icon).slice(0, 8) || null,
    body,
    // ORD-216: null = gemensam för båda klinikerna. Ett okänt värde normaliseras
    // INTE till en klinik — då hade en felstavning tyst gömt mallen för alla
    // utom den kliniken. Okänt blir gemensam, vilket är det synliga felet.
    brand: normalizeBrand(input.brand),
    createdAt: normalizeText(input.createdAt) || nowIso(),
    updatedAt: nowIso(),
    isDefault: input.isDefault === true,
  };
}

async function createCcoMailTemplateStore({ filePath } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoMailTemplateStore.');
  }
  let state = await readJson(filePath, null);
  const isFirstRun = state == null;
  if (!state || typeof state !== 'object') state = emptyState();
  state.templates = asArray(state.templates).map(normalizeTemplate).filter(Boolean);
  if (isFirstRun || state.templates.length === 0) {
    state.templates = DEFAULT_TEMPLATES.map((t) => normalizeTemplate({ ...t, isDefault: true }));
    await writeJsonAtomic(filePath, state);
  }

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  /**
   * ORD-216 — lista mallar för en klinik.
   *
   * Utan `brand` returneras allt (bakåtkompatibelt; det är vad varje befintlig
   * anropare får). Med `brand` returneras klinikens EGNA mallar plus de
   * GEMENSAMMA — aldrig den andra klinikens.
   *
   * Att gemensamma följer med är avsiktligt: alternativet vore att varje
   * grundmall måste dubbleras, och två kopior av samma text glider isär.
   */
  function listTemplates(options = {}) {
    const brand = normalizeBrand(options && options.brand);
    const alla = state.templates.map((t) => cloneJson(t));
    if (!brand) return alla;
    return alla.filter((t) => t.brand === brand || t.brand == null);
  }

  function getTemplate(templateId) {
    const id = normalizeText(templateId);
    if (!id) return null;
    const t = state.templates.find((x) => x.templateId === id);
    return t ? cloneJson(t) : null;
  }

  async function saveTemplate(input) {
    const normalized = normalizeTemplate(input);
    if (!normalized) {
      throw new Error('label och body krävs (max 80 / 4000 tecken).');
    }
    const idx = state.templates.findIndex((t) => t.templateId === normalized.templateId);
    if (idx >= 0) {
      const existing = state.templates[idx];
      state.templates[idx] = {
        ...normalized,
        createdAt: existing.createdAt,
        isDefault: existing.isDefault,
      };
    } else {
      state.templates.push(normalized);
    }
    await save();
    return cloneJson(normalized);
  }

  async function deleteTemplate(templateId) {
    const id = normalizeText(templateId);
    if (!id) return false;
    const idx = state.templates.findIndex((t) => t.templateId === id);
    if (idx < 0) return false;
    state.templates.splice(idx, 1);
    await save();
    return true;
  }

  return {
    listTemplates,
    normalizeBrand,
    getTemplate,
    saveTemplate,
    deleteTemplate,
  };
}

module.exports = { createCcoMailTemplateStore, DEFAULT_TEMPLATES };
