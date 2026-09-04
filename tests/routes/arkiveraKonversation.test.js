'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

/**
 * ORD-217 — arkivera.
 *
 * `/cco/runtime/conversation/:key/action` accepterade bara
 * handled | reply_later | reopen. Gränssnittet hade en arkiveringstanke i
 * makrolistan men ingen väg dit.
 *
 * DEN FARLIGA VERSIONEN AV DEN HÄR FUNKTIONEN vore en som TYSTAR en tråd för
 * gott. Personalen lägger undan ett ärende, kunden svarar, och svaret syns
 * aldrig. Skyddet som gör arkivering ofarlig fanns redan och är
 * state-agnostiskt: `shouldSuppressOperatorState` ignorerar hela operatörs-
 * staten om det kommit ett INKOMMANDE meddelande efter `actionAt`.
 *
 * Testerna nedan mäter både att arkivering döljer tråden OCH att den släpper
 * taget så fort kunden hör av sig.
 */

const ROT = path.join(__dirname, '..', '..');
const ROUTE = fs.readFileSync(path.join(ROT, 'src', 'routes', 'ccoConversation.js'), 'utf8');
const LASMODELL = fs.readFileSync(
  path.join(ROT, 'src', 'ops', 'ccoMailboxTruthWorklistReadModel.js'),
  'utf8'
);
const PANEL = fs.readFileSync(path.join(ROT, 'public', 'konversationer-bottom-actions.js'), 'utf8');

async function nyStateStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord217-'));
  return createCcoConversationStateStore({ filePath: path.join(dir, 'state.json') });
}

test('STOREN accepterar archived — och bara de tre kända tillstånden', async () => {
  const store = await nyStateStore();
  const skriv = (actionState) =>
    store.writeConversationState({
      tenantId: 't',
      canonicalConversationKey: `k-${actionState}`,
      actionState,
      needsReplyStatusOverride: 'handled',
      actionAt: new Date().toISOString(),
    });

  for (const giltig of ['handled', 'reply_later', 'archived']) {
    const r = await skriv(giltig);
    assert.ok(r, `${giltig} avvisades`);
    assert.equal(r.actionState, giltig === 'reply_later' ? 'reply_later' : giltig);
  }

  // Motprovet: ett påhittat tillstånd får inte glida igenom. Utan det här
  // mäter testet bara att strängar kan sparas.
  await assert.rejects(
    () => skriv('makulerad'),
    'okänt tillstånd accepterades — normaliseringen är borta'
  );
});

test('ARCHIVED ÄR ETT EGET TILLSTÅND, inte en synonym för handled', async () => {
  /**
   * Att slå ihop dem hade gjort uppföljning omöjlig: "hur många ärenden
   * besvarade vi?" går inte att svara på om undanlagt räknas som besvarat.
   */
  const store = await nyStateStore();
  const r = await store.writeConversationState({
    tenantId: 't',
    canonicalConversationKey: 'k1',
    actionState: 'archived',
    needsReplyStatusOverride: 'handled',
    actionAt: new Date().toISOString(),
  });
  assert.equal(r.actionState, 'archived');
  assert.notEqual(r.actionState, 'handled');
});

test('LÄSMODELLEN döljer arkiverat på samma villkor som avklarat', () => {
  assert.match(
    LASMODELL,
    /normalizedActionState === 'handled' \|\| normalizedActionState === 'archived'/,
    'arkiverade trådar döljs inte'
  );
  assert.match(
    LASMODELL,
    /if \(normalized === 'archived'\) return 'archived';/,
    'läsmodellen känner inte igen archived — då faller den till tomt och tråden visas som obehandlad'
  );
});

test('NYTT KUNDMEJL VÄCKER EN ARKIVERAD TRÅD — hela säkerheten i punkten', () => {
  /**
   * Regeln är state-agnostisk och gäller därför arkivering gratis. Men den är
   * lätt att råka bryta: den som lägger till ett "permanent" tillstånd frestas
   * att kolla actionState FÖRE suppression-kontrollen.
   *
   * Testet låser ordningen: suppression först, tillståndet sedan.
   */
  assert.match(
    LASMODELL,
    /if \(Number\.isFinite\(lastInboundMs\) && lastInboundMs > actionAtMs\) return true;/,
    'regeln som väcker trådar är borta'
  );

  const iSuppress = LASMODELL.indexOf('shouldSuppressOperatorState(row, operatorState)');
  const iArchived = LASMODELL.indexOf("normalizedActionState === 'archived'");
  assert.ok(iSuppress !== -1 && iArchived !== -1, 'hittade inte båda ställena — mät om');
  assert.ok(
    iSuppress < iArchived,
    'tillståndskontrollen körs före suppression — en arkiverad tråd kan då tysta en kund'
  );
});

test('ROUTEN tar emot archive och skiljer etiketten från klar', () => {
  assert.match(ROUTE, /'handled', 'reply_later', 'reopen', 'archive'/, 'archive avvisas');
  assert.match(ROUTE, /action === 'archive' \? 'archived' : action/, 'archive mappas inte');
  assert.match(ROUTE, /'Arkiverad'/, 'egen etikett saknas');

  // Arkivering ska dölja tråden, alltså samma override som handled.
  assert.match(
    ROUTE,
    /const doljerTraden = action === 'handled' \|\| action === 'archive';/,
    'archive döljer inte tråden'
  );
});

test('AUDIT skiljer arkivering från avklarande', () => {
  /**
   * Auditraden byggs som `cco.conversation.${action}`. Med action='archive'
   * blir den cco.conversation.archive — skild från cco.conversation.handled.
   * Skulle någon mappa om action till 'handled' före auditraden försvinner
   * skillnaden ur loggen, och då går den inte att följa upp i efterhand.
   */
  assert.match(ROUTE, /action: `cco\.conversation\.\$\{action\}`/, 'auditnyckeln är omskriven');

  const iMappning = ROUTE.indexOf(
    "const actionState = action === 'archive' ? 'archived' : action;"
  );
  const iAudit = ROUTE.indexOf('action: `cco.conversation.${action}`', iMappning);
  assert.ok(iAudit > iMappning, 'hittade inte auditraden efter mappningen');
  // `action` får inte skrivas över mellan mappningen och auditraden.
  const mellan = ROUTE.slice(iMappning, iAudit);
  assert.ok(!/\baction\s*=\s*[^=]/.test(mellan), 'action skrivs över före audit');
});

test('GRÄNSSNITTET har en väg till arkivering', () => {
  assert.match(PANEL, /archive: 'Arkiverad'/, 'etiketten saknas i åtgärdstabellen');
  assert.match(
    PANEL,
    /action === 'arkivera'\) runConversationAction\('archive'\)/,
    'ingen knapp når arkiveringen'
  );
});
