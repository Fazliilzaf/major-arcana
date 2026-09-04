'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoMacroStore } = require('../../src/ops/ccoMacroStore');

/**
 * ORD-219 — makron utför nu sina åtgärder.
 *
 * `runMacro` räknade bara upp runCount och lastRunAt. Storen sa det själv:
 * "den utför INGA åtgärder — den registrerar bara körningen", och frontend
 * hade därför stängt av Kör-knappen. Det var det ärliga valet, men lämnade
 * 2 218 rader panel för en knapp ingen kunde trycka på.
 *
 * TRE AV SEX ÅTGÄRDSTYPER GÅR ATT UTFÖRA, mätt 2026-09-04. De tre andra går
 * inte, och skälen är olika:
 *
 *   tag      — det finns ingen taggning på konversationsnivå någonstans
 *   sla      — konversationer har inget SLA-fält
 *   template — skulle skapa ett utkast, alltså potentiellt post till kund.
 *              Ägarbeslut, inte teknisk detalj.
 *
 * DEN FARLIGA VERSIONEN vore en som kör de tre den kan och tiger om resten.
 * Ett makro med fem steg hade då rapporterat "kört" efter att ha gjort två,
 * och personalen hade trott att taggen sattes och SLA:n startade. Ett falskt
 * kvitto på arbete är sämre än en avstängd knapp.
 */

const ROT = path.join(__dirname, '..', '..');
const ROUTE = fs.readFileSync(path.join(ROT, 'src', 'routes', 'ccoMacros.js'), 'utf8');
const PANEL = fs.readFileSync(
  path.join(ROT, 'public', 'major-arcana-preview', 'cco-makron-v3.html'),
  'utf8'
);
const SERVER = fs.readFileSync(path.join(ROT, 'server.js'), 'utf8');

async function nyStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord219-'));
  return createCcoMacroStore({ filePath: path.join(dir, 'makron.json') });
}

/** Exekverare som bara antecknar vad den ombads göra. */
function spionExecutor() {
  const kallelser = [];
  return {
    kallelser,
    async assign(args) {
      kallelser.push({ fn: 'assign', ...args });
    },
    async setActionState(args) {
      kallelser.push({ fn: 'setActionState', ...args });
    },
  };
}

const MAL = { conversationKey: 'tr-1', actorEmail: 'anna@klinik.se', actorUserId: 'u1' };

async function makroMed(store, actions) {
  return store.saveMacro({
    tenantId: 't',
    macro: { name: 'Test', trigger: 'manual', actions },
  });
}

test('ASSIGN, ARCHIVE och SNOOZE utförs på riktigt', async () => {
  const store = await nyStore();
  const m = await makroMed(store, [
    { type: 'assign', config: { assignTo: 'bo@klinik.se' } },
    { type: 'archive', config: {} },
    { type: 'snooze', config: { days: 2 } },
  ]);
  const ex = spionExecutor();
  const r = await store.runMacro({ tenantId: 't', macroId: m.id, target: MAL, executor: ex });

  assert.equal(r.komplett, true, 'körningen rapporterades som ofullständig');
  assert.deepEqual(
    r.resultat.map((x) => x.status),
    ['utford', 'utford', 'utford']
  );
  assert.equal(ex.kallelser.length, 3, 'alla åtgärder nådde inte exekveraren');
  assert.equal(ex.kallelser[0].assignedToEmail, 'bo@klinik.se');
  assert.equal(ex.kallelser[1].action, 'archive');
  assert.equal(ex.kallelser[2].action, 'reply_later');
  assert.ok(ex.kallelser[2].followUpDueAt, 'snooze saknar förfallodatum');
});

test('TAG, SLA och TEMPLATE rapporteras som stöds_ej — inte tyst överhoppade', async () => {
  const store = await nyStore();
  const m = await makroMed(store, [
    { type: 'tag', config: { tag: 'vip' } },
    { type: 'sla', config: { hours: 4 } },
    { type: 'template', config: { templateId: 'x' } },
  ]);
  const ex = spionExecutor();
  const r = await store.runMacro({ tenantId: 't', macroId: m.id, target: MAL, executor: ex });

  assert.equal(r.komplett, false, 'ett makro utan utförda åtgärder rapporterades som komplett');
  for (const rad of r.resultat) {
    assert.equal(rad.status, 'stods_ej', `${rad.typ} rapporterades som utförd`);
    assert.ok(rad.detalj && rad.detalj.length > 20, `${rad.typ} saknar begripligt skäl`);
  }
  assert.equal(ex.kallelser.length, 0, 'något nådde exekveraren trots att det inte stöds');
});

test('ETT DELVIS UTFÖRT MAKRO ÄR INTE KOMPLETT — kärnan i punkten', async () => {
  /**
   * Seed-makrot "Bokningsbekräftelse" har exakt den här formen: fem steg,
   * varav tre inte går att utföra. Det är det realistiska fallet, och det som
   * hade gett ett falskt kvitto.
   */
  const store = await nyStore();
  const m = await makroMed(store, [
    { type: 'template', config: {} },
    { type: 'tag', config: {} },
    { type: 'sla', config: {} },
    { type: 'assign', config: { assignTo: 'bo@klinik.se' } },
    { type: 'snooze', config: { days: 2 } },
  ]);
  const r = await store.runMacro({
    tenantId: 't',
    macroId: m.id,
    target: MAL,
    executor: spionExecutor(),
  });

  assert.equal(r.komplett, false);
  assert.equal(r.resultat.filter((x) => x.status === 'utford').length, 2);
  assert.equal(r.resultat.filter((x) => x.status === 'stods_ej').length, 3);
  assert.equal(r.lastRunKomplett, false, 'utfallet sparas inte på makrot');
});

test('UTAN MÅLTRÅD utförs ingenting, och det syns som fel', async () => {
  /**
   * Förut räknade runMacro upp runCount även utan mål. Ett kvitto på arbete
   * som aldrig kunde ha utförts.
   */
  const store = await nyStore();
  const m = await makroMed(store, [{ type: 'archive', config: {} }]);
  const r = await store.runMacro({ tenantId: 't', macroId: m.id, executor: spionExecutor() });
  assert.equal(r.komplett, false);
  assert.equal(r.resultat[0].status, 'fel');
  assert.match(r.resultat[0].detalj, /måltråd/i);
});

test("'current-user' löses av anroparen, inte av storen", async () => {
  /**
   * Seed-makrona använder det symboliska värdet. Storen vet inte vem som är
   * inloggad och ska inte gissa — den använder målets actorEmail.
   */
  const store = await nyStore();
  const m = await makroMed(store, [{ type: 'assign', config: { assignTo: 'current-user' } }]);
  const ex = spionExecutor();
  const r = await store.runMacro({ tenantId: 't', macroId: m.id, target: MAL, executor: ex });
  assert.equal(r.resultat[0].status, 'utford');
  assert.equal(ex.kallelser[0].assignedToEmail, 'anna@klinik.se');

  // Utan actorEmail finns ingen att tilldela till — då är det ett fel, inte
  // en tilldelning till tom sträng.
  const ex2 = spionExecutor();
  const r2 = await store.runMacro({
    tenantId: 't',
    macroId: m.id,
    target: { conversationKey: 'tr-1' },
    executor: ex2,
  });
  assert.equal(r2.resultat[0].status, 'fel');
  assert.equal(ex2.kallelser.length, 0);
});

test('ETT FEL I EN ÅTGÄRD STOPPAR INTE RESTEN — men syns', async () => {
  const store = await nyStore();
  const m = await makroMed(store, [
    { type: 'assign', config: { assignTo: 'bo@klinik.se' } },
    { type: 'archive', config: {} },
  ]);
  const trasig = {
    async assign() {
      throw new Error('storen nere');
    },
    async setActionState() {},
  };
  const r = await store.runMacro({ tenantId: 't', macroId: m.id, target: MAL, executor: trasig });
  assert.equal(r.resultat[0].status, 'fel');
  assert.match(r.resultat[0].detalj, /storen nere/);
  assert.equal(r.resultat[1].status, 'utford', 'ett fel stoppade resten av makrot');
  assert.equal(r.komplett, false);
});

// ── Inkoppling ─────────────────────────────────────────────────────────────

test('ROUTEN kräver måltråd och redovisar utfallet', () => {
  /**
   * BUNDET TILL VAKTEN, inte till texten. Första versionen matchade
   * felmeddelandet "conversationKey krävs" — som står kvar i koden även när
   * `if`-satsen stängs av. Mutationen som bytte villkoret mot `false`
   * överlevde därför: meddelandet fanns, vakten gjorde det inte.
   */
  assert.match(
    ROUTE,
    /if \(!conversationKey\) \{[\s\S]{0,200}?res\.status\(400\)/,
    'körning utan måltråd avvisas inte'
  );
  assert.match(ROUTE, /conversationKey krävs/, 'felet förklaras inte');
  assert.match(ROUTE, /executor: macroExecutor/, 'exekveraren skickas inte in');
  assert.match(
    ROUTE,
    /outcome: macro\.komplett \? 'success' : 'partial'/,
    'audit loggar delvis körning som lyckad'
  );
  assert.match(ROUTE, /resultat: macro\.resultat/, 'utfallet per åtgärd loggas inte');
  assert.match(ROUTE, /express\.json/, 'ingen json-parser — req.body blir undefined');
});

test('SERVERN skickar in konversationsstoren', () => {
  // Utan den raden svarar routen 503 i stället för att utföra något — och det
  // är lätt att missa, eftersom allt annat i makropanelen fortsätter fungera.
  const block = SERVER.slice(SERVER.indexOf('createCcoMacrosRouter({'));
  assert.match(
    block.slice(0, 600),
    /conversationStateStore: ccoConversationStateStore/,
    'makroroutern får ingen konversationsstore'
  );
});

test('PANELENS Kör-knapp är påslagen och visar vad som faktiskt hände', () => {
  assert.ok(!/data-act="run" disabled/.test(PANEL), 'Kör-knappen är fortfarande avstängd');
  assert.match(PANEL, /åtgärder utfördes/, 'utfallet visas inte för användaren');
  assert.match(PANEL, /Ej utfört:/, 'det som hoppades över redovisas inte');
  assert.match(PANEL, /Ingen tråd vald/, 'körning utan tråd förklaras inte');

  // Den gamla brandväggen ska vara borta — annars når inget anrop servern.
  assert.ok(
    !/Makro-exekvering är inte tillgänglig ännu/.test(PANEL),
    'spärren mot exekvering står kvar'
  );
});
