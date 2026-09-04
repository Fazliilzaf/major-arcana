const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// ORD-219: `asArray` saknades i filen. node --check såg inget — syntaxen var
// giltig, namnet bara odefinierat. Ett runtime-fel som en syntaxkontroll aldrig
// hittar, och som hade slagit till först när någon körde ett makro.
function asArray(value) {
  return Array.isArray(value) ? value : [];
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

/**
 * ORD-219 — åtgärdstyper som faktiskt går att utföra i dag.
 *
 * Listan är AVSIKTLIGT kortare än `allowedTypes`. Att en typ får sparas
 * betyder inte att den går att köra, och den skillnaden ska synas i svaret i
 * stället för att döljas.
 */
const UTFORBARA_TYPER = Object.freeze(['assign', 'archive', 'snooze']);

/**
 * Varför en typ inte går att utföra. Texten hamnar i svaret och i
 * gränssnittet — den som undrar varför ingenting hände ska slippa läsa kod.
 */
const EJ_UTFORBARA_SKAL = Object.freeze({
  tag: 'Det finns ingen taggning på konversationsnivå i CCO ännu.',
  sla: 'Konversationer har inget SLA-fält ännu.',
  template:
    'Att infoga en mall skapar ett utkast, alltså potentiellt post till kund. Kräver ägarbeslut innan det får ske automatiskt.',
});

async function korAtgard({ action, target, executor, tenantId }) {
  const typ = normalizeText(action?.type);
  const config = action && typeof action.config === 'object' && action.config ? action.config : {};

  if (!UTFORBARA_TYPER.includes(typ)) {
    return {
      typ,
      status: 'stods_ej',
      detalj: EJ_UTFORBARA_SKAL[typ] || `Okänd åtgärdstyp: ${typ || '(tom)'}`,
    };
  }
  if (!executor || !target || !normalizeText(target.conversationKey)) {
    // Utan måltråd finns inget att utföra åtgärden PÅ. Att tyst räkna upp
    // runCount i det läget vore att låtsas att något hände.
    return {
      typ,
      status: 'fel',
      detalj: 'Ingen måltråd angiven — makrot kan inte köras utan konversation.',
    };
  }

  try {
    if (typ === 'assign') {
      const till = normalizeText(config.assignTo);
      // 'current-user' är ett symboliskt värde i seed-makrona. Det löses av
      // anroparen, som vet vem som är inloggad; storen gissar inte.
      const epost = till === 'current-user' ? normalizeText(target.actorEmail) : till;
      if (!epost) {
        return { typ, status: 'fel', detalj: 'Ingen mottagare att tilldela till.' };
      }
      await executor.assign({ tenantId, target, assignedToEmail: epost });
      return { typ, status: 'utford', detalj: `Tilldelad ${epost}` };
    }
    if (typ === 'archive') {
      await executor.setActionState({ tenantId, target, action: 'archive' });
      return { typ, status: 'utford', detalj: 'Arkiverad' };
    }
    // snooze
    const dagar = Number(config.days);
    const timmar = Number(config.hours);
    const ms =
      Number.isFinite(dagar) && dagar > 0
        ? dagar * 24 * 60 * 60 * 1000
        : Number.isFinite(timmar) && timmar > 0
          ? timmar * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
    const followUpDueAt = new Date(Date.now() + ms).toISOString();
    await executor.setActionState({
      tenantId,
      target,
      action: 'reply_later',
      followUpDueAt,
    });
    return { typ, status: 'utford', detalj: `Snoozad till ${followUpDueAt}` };
  } catch (err) {
    return { typ, status: 'fel', detalj: String((err && err.message) || err) };
  }
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
    tenants: state && typeof state.tenants === 'object' && state.tenants ? state.tenants : {},
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

  /**
   * ORD-219 — makron UTFÖR nu sina åtgärder.
   *
   * Förut registrerade den här funktionen bara körningen (runCount/lastRunAt)
   * och gjorde ingenting. Kör-knappen var därför avstängd i gränssnittet —
   * vilket var det ärliga valet, men lämnade 2 218 rader panel för en knapp
   * ingen kunde trycka på.
   *
   * TRE AV SEX ÅTGÄRDSTYPER GÅR ATT UTFÖRA I DAG, mätt 2026-09-04:
   *
   *   assign   → ccoConversationStateStore.assignConversation   (ORD-218)
   *   archive  → conversation action 'archive'                  (ORD-217)
   *   snooze   → conversation action 'reply_later' + förfallodatum
   *
   * TRE GÅR INTE, och det beror inte på att de är svåra:
   *
   *   tag      → det finns INGEN taggning på konversationsnivå någonstans
   *   sla      → det finns INGET SLA-fält på en konversation
   *   template → skulle skapa ett utkast, alltså potentiellt post till kund.
   *              Det är ett ägarbeslut, inte en teknisk detalj, och det ska
   *              inte smygas in via en makrokörning.
   *
   * DÄRFÖR REDOVISAS VARJE ÅTGÄRD FÖR SIG. En körning som säger "5 åtgärder
   * klara" när den utfört 2 är sämre än dagens avstängda knapp: den ger ett
   * falskt kvitto på arbete som inte gjorts. `komplett: false` betyder att
   * något hoppades över, och `resultat` säger exakt vad.
   *
   * `executor` injiceras. Storen känner därför inte till konversationsstoren,
   * och kan testas utan den.
   */
  async function runMacro({ tenantId, macroId, target = null, executor = null } = {}) {
    const tenantState = ensureTenantState(tenantId);
    const macro = tenantState.macros.find((item) => item.id === normalizeText(macroId));
    if (!macro) return null;

    const resultat = [];
    for (const action of asArray(macro.actions)) {
      resultat.push(await korAtgard({ action, target, executor, tenantId }));
    }
    const komplett = resultat.length > 0 && resultat.every((r) => r.status === 'utford');

    macro.runCount = Number(macro.runCount || 0) + 1;
    macro.lastRunAt = nowIso();
    // Sista körningens utfall sparas på makrot så att listan kan visa om det
    // senaste försöket faktiskt gjorde något. Utan det ser ett makro som alltid
    // hoppar över allt likadant ut som ett som fungerar.
    macro.lastRunKomplett = komplett;
    macro.updatedAt = nowIso();
    tenantState.updatedAt = nowIso();
    await save();
    return { ...macro, komplett, resultat };
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
