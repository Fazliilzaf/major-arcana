const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tenants: {},
  };
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

function defaultMacros() {
  return [
    {
      id: 'booking-flow',
      name: 'Bokningsbekräftelseflöde',
      description: 'Komplett arbetsflöde för bokningsbekräftelser',
      trigger: 'manual',
      shortcut: '⌘⇧B',
      autoCondition: null,
      actions: [
        { id: '1', type: 'template', config: { templateId: 'booking-confirm' } },
        { id: '2', type: 'tag', config: { tag: 'pending-payment' } },
        { id: '3', type: 'sla', config: { hours: 24 } },
        { id: '4', type: 'assign', config: { assignTo: 'current-user' } },
        { id: '5', type: 'snooze', config: { days: 2 } },
      ],
      runCount: 0,
      lastRunAt: null,
    },
    {
      id: 'vip-greeting',
      name: 'VIP-hälsning',
      description: 'Särskild hantering för VIP-kunder',
      trigger: 'auto',
      shortcut: '',
      autoCondition: 'customer.isVIP === true',
      actions: [
        { id: '1', type: 'template', config: { templateId: 'vip-greeting' } },
        { id: '2', type: 'assign', config: { assignTo: 'senior-specialist' } },
        { id: '3', type: 'sla', config: { hours: 1 } },
      ],
      runCount: 0,
      lastRunAt: null,
    },
  ];
}

function normalizeMacroAction(input = {}, index = 0) {
  const type = normalizeKey(input.type);
  const allowedTypes = ['template', 'tag', 'assign', 'snooze', 'sla', 'archive'];
  return {
    id: normalizeText(input.id) || `${index + 1}`,
    type: allowedTypes.includes(type) ? type : 'template',
    config: input && typeof input.config === 'object' && input.config ? input.config : {},
  };
}

function normalizeMacroRecord(input = {}, index = 0) {
  const id = normalizeText(input.id) || crypto.randomUUID();
  return {
    id,
    name: normalizeText(input.name) || `Makro ${index + 1}`,
    description: normalizeText(input.description),
    trigger: normalizeKey(input.trigger) === 'auto' ? 'auto' : 'manual',
    shortcut: normalizeText(input.shortcut) || '',
    autoCondition: normalizeText(input.autoCondition) || null,
    actions: Array.isArray(input.actions)
      ? input.actions.map((action, actionIndex) => normalizeMacroAction(action, actionIndex))
      : [],
    runCount: Number.isFinite(Number(input.runCount)) ? Number(input.runCount) : 0,
    lastRunAt: normalizeText(input.lastRunAt) || null,
    createdAt: normalizeText(input.createdAt) || nowIso(),
    updatedAt: normalizeText(input.updatedAt) || nowIso(),
  };
}

async function createCcoMacroStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoMacroStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    tenants:
      state && typeof state.tenants === 'object' && state.tenants
        ? state.tenants
        : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function ensureTenantState(tenantId) {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId) {
      throw new Error('tenantId krävs.');
    }
    if (!state.tenants[normalizedTenantId]) {
      state.tenants[normalizedTenantId] = {
        macros: defaultMacros().map((macro, index) => normalizeMacroRecord(macro, index)),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    const tenantState = state.tenants[normalizedTenantId];
    tenantState.macros = Array.isArray(tenantState.macros)
      ? tenantState.macros.map((macro, index) => normalizeMacroRecord(macro, index))
      : defaultMacros().map((macro, index) => normalizeMacroRecord(macro, index));
    return tenantState;
  }

  async function listTenantMacros({ tenantId }) {
    const tenantState = ensureTenantState(tenantId);
    return tenantState.macros.map((macro) => ({ ...macro }));
  }

  async function saveMacro({ tenantId, macro }) {
    const tenantState = ensureTenantState(tenantId);
    const next = normalizeMacroRecord(macro, tenantState.macros.length);
    const existingIndex = tenantState.macros.findIndex((item) => item.id === next.id);
    if (existingIndex >= 0) {
      tenantState.macros[existingIndex] = {
        ...tenantState.macros[existingIndex],
        ...next,
        createdAt: tenantState.macros[existingIndex].createdAt,
        updatedAt: nowIso(),
      };
    } else {
      tenantState.macros.unshift({
        ...next,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    tenantState.updatedAt = nowIso();
    await save();
    return { ...tenantState.macros.find((item) => item.id === next.id) };
  }

  async function deleteMacro({ tenantId, macroId }) {
    const tenantState = ensureTenantState(tenantId);
    const normalizedMacroId = normalizeText(macroId);
    const before = tenantState.macros.length;
    tenantState.macros = tenantState.macros.filter((item) => item.id !== normalizedMacroId);
    const deleted = before !== tenantState.macros.length;
    if (deleted) {
      tenantState.updatedAt = nowIso();
      await save();
    }
    return deleted;
  }

  async function runMacro({ tenantId, macroId }) {
    const tenantState = ensureTenantState(tenantId);
    const macro = tenantState.macros.find((item) => item.id === normalizeText(macroId));
    if (!macro) return null;
    macro.runCount = Number(macro.runCount || 0) + 1;
    macro.lastRunAt = nowIso();
    macro.updatedAt = nowIso();
    tenantState.updatedAt = nowIso();
    await save();
    return { ...macro };
  }

  return {
    listTenantMacros,
    saveMacro,
    deleteMacro,
    runMacro,
  };
}

module.exports = {
  createCcoMacroStore,
};
