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
 *   • Mallar är globala i denna MVP (framtida: per-tenant)
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() { return new Date().toISOString(); }
function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function asArray(v) { return Array.isArray(v) ? v : []; }
function cloneJson(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }

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

function normalizeTemplate(input = {}) {
  const label = normalizeText(input.label).slice(0, 80);
  const body = normalizeText(input.body).slice(0, 4000);
  if (!label || !body) return null;
  return {
    templateId: normalizeText(input.templateId) || crypto.randomUUID(),
    label,
    icon: normalizeText(input.icon).slice(0, 8) || null,
    body,
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
  let isFirstRun = state == null;
  if (!state || typeof state !== 'object') state = emptyState();
  state.templates = asArray(state.templates).map(normalizeTemplate).filter(Boolean);
  if (isFirstRun || state.templates.length === 0) {
    state.templates = DEFAULT_TEMPLATES.map((t) =>
      normalizeTemplate({ ...t, isDefault: true })
    );
    await writeJsonAtomic(filePath, state);
  }

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function listTemplates() {
    return state.templates.map((t) => cloneJson(t));
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
    getTemplate,
    saveTemplate,
    deleteTemplate,
  };
}

module.exports = { createCcoMailTemplateStore, DEFAULT_TEMPLATES };
