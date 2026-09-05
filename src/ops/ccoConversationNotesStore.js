'use strict';

/**
 * ccoConversationNotesStore — enkel append-only notes-store per
 * mailboxConversationId. Används av /cco/ för interna anteckningar
 * som operatörer skriver om en kund/tråd.
 *
 * Designprinciper:
 *   • Persistent JSON-fil (ARCANA_STATE_ROOT)
 *   • Append-only (ingen edit/delete från UI ännu)
 *   • Notes sorteras nyast först vid läsning
 *   • Ingen schema-validering — frontend ansvarar för rimlig längd (max 2000 tecken)
 *
 * ─── ORD-222 · TENANT ────────────────────────────────────────────────────────
 *
 * Storen hade INGEN tenant. Noll förekomster av tenantId i hela filen; nycklarna
 * var bara `customer:CUST-DEMO-002`. Uppmätt 2026-09-05, när ägaren valde att
 * koppla personalportalen hit i stället för till /cco-workspace/notes (som har
 * femton).
 *
 * DET VAR INGEN LÄCKA I DAG, och den skillnaden ska stå rätt. Rutterna ligger
 * bakom `router.use('/cco/runtime/conversation', authMiddleware,
 * requireTenantScope)` och server.js sätter `tenantScopeId:
 * config.defaultTenantId` — alltså EN tenant. Curatiio får 403 på hela
 * konversationsvyn i dag och hinner därför aldrig skriva någon anteckning.
 *
 * Men det betyder att stängslet står i routern, inte i datan. Den dagen
 * Curatiio släpps in i konversationsvyn — vilket är hela riktningen sedan
 * ORD-203 — hamnar båda klinikernas interna anteckningar om patienter i samma
 * opartitionerade fil, och det finns inget i filen som säger vilken rad som hör
 * till vem. Att lägga nyckeln här nu är billigt; att reda ut den efteråt är
 * det inte.
 *
 * FAIL-CLOSED PÅ SAKNAD TENANT. `addNote` utan tenantId KASTAR i stället för
 * att falla tillbaka på en standardklinik. En tyst fallback hade lagt
 * Curatiios anteckningar under Hair TP och sett ut som att allt fungerade —
 * exakt den sortens fel som bara syns när någon läser fel patients journal.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { canonicalTenantId } = require('../tenant/tenantIdCanonical');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
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

function emptyState() {
  const ts = nowIso();
  return {
    version: 2,
    createdAt: ts,
    updatedAt: ts,
    // notesByConversation: { "<tenantId>::<conversationKey>": [{noteId, body, ...}] }
    notesByConversation: {},
    /**
     * Rader från version 1, som saknade tenant. De ligger kvar men visas inte.
     *
     * ATT GISSA TENANT HADE VARIT ETT PÅHITT. Det finns ingenting i en rad som
     * `customer:CUST-DEMO-002` som säger vilken klinik anteckningen gäller, och
     * en gissning som ser ut som ett faktum är sämre än en tom lista. De två
     * rader som fanns i repot 2026-09-05 var dessutom smoke-test-rader
     * ("Smoke-test anteckning (anon)").
     *
     * Ligger det riktiga anteckningar här efter en deploy går de att flytta för
     * hand — någon som VET vilken klinik de hör till.
     */
    omigreradeUtanTenant: {},
  };
}

/**
 * `<kanonisk tenant>::<konversation>`. Separatorn är två kolon för att en
 * enkel kolon redan förekommer i konversationsnycklarna
 * (`customer:CUST-DEMO-002`).
 *
 * KANONISERINGEN ÄR INTE KOSMETIK. Anroparna skickar olika stavningar av samma
 * klinik — ccoConversationThreadStore defaultar till `'hair_tp'`, server.js och
 * ccoCustomerComm till `hair-tp-clinic`. Utan canonicalTenantId hade samma
 * kliniks anteckningar hamnat i två hinkar, och den som skrev i en vy hade inte
 * sett dem i den andra. Exakt det felet finns redan i nyckelformen (se
 * kommentaren i ccoCustomerComm om `customer:`-prefixet).
 *
 * En Hair TP-TYPO ger null från canonicalTenantId och kastas här, i stället för
 * att tyst bli en egen hink. Det är hela poängen med modulen.
 */
function nyckelFor(tenantId, conversationKey) {
  const kanonisk = canonicalTenantId(tenantId);
  if (!kanonisk) {
    throw new Error(
      `Okänd tenant för anteckning: ${JSON.stringify(tenantId)}. ` +
        'Ser den ut som en Hair TP-stavfel? Lägg den i HAIR_TP_VARIANTS i stället.'
    );
  }
  return `${kanonisk.toLowerCase()}::${normalizeText(conversationKey)}`;
}

async function createCcoConversationNotesStore({ filePath } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoConversationNotesStore.');
  }
  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    notesByConversation:
      state?.notesByConversation && typeof state.notesByConversation === 'object'
        ? state.notesByConversation
        : {},
    omigreradeUtanTenant:
      state?.omigreradeUtanTenant && typeof state.omigreradeUtanTenant === 'object'
        ? state.omigreradeUtanTenant
        : {},
  };

  /**
   * ORD-222 — flytta version 1-rader till karantän.
   *
   * En rad utan `::` i nyckeln är skriven innan tenant fanns. Den får inte
   * ligga kvar bland de tenant-märkta: `listNotes` skulle aldrig hitta den
   * ändå, men en halvmigrerad fil där två format bor sida vid sida är precis
   * vad nästa läsare tolkar fel.
   */
  let migrerade = 0;
  for (const [nyckel, rader] of Object.entries(state.notesByConversation)) {
    if (nyckel.includes('::')) continue;
    state.omigreradeUtanTenant[nyckel] = rader;
    delete state.notesByConversation[nyckel];
    migrerade += 1;
  }
  if (migrerade > 0) {
    state.version = 2;
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
    console.log(
      `[cco-conversation-notes] ORD-222: ${migrerade} konversation(er) utan tenant flyttade ` +
        'till omigreradeUtanTenant. De visas inte för någon klinik förrän någon som vet ' +
        'vilken klinik de hör till flyttar dem för hand.'
    );
  }

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function listNotes({ tenantId, conversationKey } = {}) {
    const tenant = normalizeText(tenantId);
    const key = normalizeText(conversationKey);
    // Läsning utan tenant returnerar tomt i stället för att kasta: en trasig
    // lista i gränssnittet ska inte fälla hela konversationsvyn. Skrivning
    // kastar däremot — se addNote.
    if (!tenant || !key) return [];
    const arr = asArray(state.notesByConversation[nyckelFor(tenant, key)]);
    // Returnera nyast först, defensiv kopia. Vid samma createdAt (samma ms) behåll append-ordning.
    return arr
      .map((n, index) => ({ n, index }))
      .sort((a, b) => {
        const byTime = String(b.n?.createdAt || '').localeCompare(String(a.n?.createdAt || ''));
        if (byTime !== 0) return byTime;
        return b.index - a.index;
      })
      .map(({ n }) => cloneJson(n));
  }

  async function addNote({ tenantId, conversationKey, body, authorEmail, authorName } = {}) {
    const tenant = normalizeText(tenantId);
    // ORD-222 — fail-closed. Ingen fallback på defaultTenantId: en anteckning
    // om en Curatiio-patient under Hair TP:s nyckel hade sett ut som att allt
    // fungerade, och upptäckts först när fel klinik läser den.
    if (!tenant) throw new Error('tenantId krävs för att skriva en anteckning.');
    const key = normalizeText(conversationKey);
    if (!key) throw new Error('conversationKey krävs.');
    const text = normalizeText(body);
    if (!text) throw new Error('body krävs.');
    if (text.length > 2000) {
      throw new Error('Anteckning är för lång (max 2000 tecken).');
    }
    const authorNameClean = escapeHtml(normalizeText(authorName));
    const note = {
      noteId: crypto.randomUUID(),
      body: escapeHtml(text),
      authorEmail: normalizeText(authorEmail).toLowerCase() || null,
      authorName: authorNameClean || null,
      createdAt: nowIso(),
    };
    const lagringsnyckel = nyckelFor(tenant, key);
    if (!Array.isArray(state.notesByConversation[lagringsnyckel])) {
      state.notesByConversation[lagringsnyckel] = [];
    }
    state.notesByConversation[lagringsnyckel].push(note);
    await save();
    return cloneJson(note);
  }

  function countNotes({ tenantId, conversationKey } = {}) {
    const tenant = normalizeText(tenantId);
    const key = normalizeText(conversationKey);
    if (!tenant || !key) return 0;
    return asArray(state.notesByConversation[nyckelFor(tenant, key)]).length;
  }

  /** Antal konversationer i karantän. Finns för att göra migreringen mätbar. */
  function antalOmigrerade() {
    return Object.keys(state.omigreradeUtanTenant).length;
  }

  return {
    listNotes,
    addNote,
    countNotes,
    antalOmigrerade,
  };
}

module.exports = {
  createCcoConversationNotesStore,
};
