'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

/**
 * ORD-218 — tilldelning av konversationer.
 *
 * TODO 6.3 i `ccoConversation.js` beskrev luckan i klartext: frontend hade
 * "Tilldela"-knappar, backend hade INGENTING som lagrade vem en konversation
 * tillhörde. Storen sparade bara vem som UTFÖRDE en åtgärd, aldrig vem som
 * ÄGER tråden.
 *
 * TODO:n väntade på ett affärsbeslut om giltiga tilldelningsmål. Beslutet:
 * **vem som helst får ta över** (Fazli 2026-09-04, i linje med ORD-198).
 * Övertagandet nekas aldrig men syns — i historiken och i auditloggen.
 */

const ROT = path.join(__dirname, '..', '..');
const ROUTE = fs.readFileSync(path.join(ROT, 'src', 'routes', 'ccoConversation.js'), 'utf8');
const LASMODELL = fs.readFileSync(
  path.join(ROT, 'src', 'ops', 'ccoMailboxTruthWorklistReadModel.js'),
  'utf8'
);

async function nyStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord218-'));
  return createCcoConversationStateStore({ filePath: path.join(dir, 'state.json') });
}

const BAS = { tenantId: 't', canonicalConversationKey: 'k1' };

test('en tråd UTAN tidigare åtgärd går att tilldela', async () => {
  /**
   * Det vanliga fallet: ett nytt mejl kommer in, någon tar det. Tråden har
   * ingen actionState och ska inte få en — att ge någon ansvar är inte att
   * bli klar.
   */
  const store = await nyStore();
  const r = await store.assignConversation({ ...BAS, assignedToEmail: 'anna@klinik.se' });
  assert.equal(r.assignedToEmail, 'anna@klinik.se');
  assert.ok(r.assignedAt, 'tidpunkt saknas');
  assert.equal(r.actionState, null, 'tilldelning satte ett åtgärdstillstånd');
  assert.equal(r.needsReplyStatusOverride, null, 'tråden markerades som besvarad');
});

test('TILLDELNING ÖVERLEVER en statusändring — annars tappas ägaren tyst', async () => {
  /**
   * Kärnan i att fälten är ortogonala. Utan arvet hade varje klick på
   * Klar/Senare kastat bort ägaren, och den som ansvarade för tråden hade
   * slutat göra det utan att någon sa något.
   */
  const store = await nyStore();
  await store.assignConversation({ ...BAS, assignedToEmail: 'anna@klinik.se' });

  const efter = await store.writeConversationState({
    ...BAS,
    actionState: 'reply_later',
    needsReplyStatusOverride: 'needs_reply',
    actionAt: new Date().toISOString(),
  });
  assert.equal(efter.assignedToEmail, 'anna@klinik.se', 'ägaren försvann vid statusändring');
  assert.equal(efter.actionState, 'reply_later', 'statusen skrevs inte');
});

test('AVTILLDELA kräver ett uttryckligt null — saknat fält ärver', async () => {
  /**
   * `undefined` och `null` måste betyda olika saker, annars går det inte att
   * ta bort en ägare: varje skrivning utan fältet hade nollställt honom, eller
   * ingen skrivning hade kunnat göra det.
   */
  const store = await nyStore();
  await store.assignConversation({ ...BAS, assignedToEmail: 'anna@klinik.se' });

  // Saknat fält → ärver
  const arvd = await store.writeConversationState({
    ...BAS,
    actionState: 'handled',
    needsReplyStatusOverride: 'handled',
    actionAt: new Date().toISOString(),
  });
  assert.equal(arvd.assignedToEmail, 'anna@klinik.se');

  // Uttryckligt null → avtilldelar
  const borttagen = await store.assignConversation({ ...BAS, assignedToEmail: null });
  assert.equal(borttagen.assignedToEmail, null);
  assert.equal(borttagen.assignedAt, null, 'tidpunkt ska nollas när ägaren tas bort');
});

test('ÖVERTAGANDE nekas aldrig — men det syns', async () => {
  const store = await nyStore();
  await store.assignConversation({
    ...BAS,
    assignedToEmail: 'anna@klinik.se',
    assignedByEmail: 'anna@klinik.se',
  });
  const r = await store.assignConversation({
    ...BAS,
    assignedToEmail: 'bo@klinik.se',
    assignedByEmail: 'bo@klinik.se',
    note: 'Anna är sjuk',
  });

  assert.equal(r.assignedToEmail, 'bo@klinik.se', 'övertagandet nekades');
  const senaste = r.assignmentHistory[0];
  assert.equal(senaste.fran, 'anna@klinik.se', 'föregående ägare saknas i historiken');
  assert.equal(senaste.till, 'bo@klinik.se');
  assert.equal(senaste.overtagande, true, 'övertagandet är inte markerat som ett sådant');
  assert.equal(senaste.note, 'Anna är sjuk');
});

test('en NYTILLDELNING är inte ett övertagande', async () => {
  // Skillnaden är det som gör historiken läsbar. Utan den ser varje
  // tilldelning ut som att någon tog något ifrån någon annan.
  const store = await nyStore();
  const r = await store.assignConversation({ ...BAS, assignedToEmail: 'anna@klinik.se' });
  assert.equal(r.assignmentHistory[0].overtagande, false);
  assert.equal(r.assignmentHistory[0].fran, null);
});

test('HISTORIKEN ÄR BEGRÄNSAD — posten skrivs till disk vid varje ändring', async () => {
  const store = await nyStore();
  for (let i = 0; i < 30; i++) {
    await store.assignConversation({ ...BAS, assignedToEmail: `p${i}@klinik.se` });
  }
  const r = store.getConversationState(BAS);
  assert.equal(r.assignmentHistory.length, 20, 'historiken växer obegränsat');
  assert.equal(r.assignmentHistory[0].till, 'p29@klinik.se', 'senaste ligger inte först');
});

test('tilldelning PERSISTERAS över omläsning', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord218p-'));
  const filePath = path.join(dir, 'state.json');
  const a = await createCcoConversationStateStore({ filePath });
  await a.assignConversation({ ...BAS, assignedToEmail: 'anna@klinik.se' });

  const b = await createCcoConversationStateStore({ filePath });
  assert.equal(b.getConversationState(BAS).assignedToEmail, 'anna@klinik.se');
});

// ── Route och läsmodell ────────────────────────────────────────────────────

test('ROUTEN finns, kräver mail.write och skiljer avtilldela från utelämnat', () => {
  assert.match(ROUTE, /'\/cco\/runtime\/conversation\/:key\/assign'/, 'routen saknas');
  assert.match(ROUTE, /requirePermission\('mail\.write'\)/);
  assert.match(
    ROUTE,
    /hasOwnProperty\.call\(body, 'assignedToEmail'\)/,
    'utelämnat fält skiljs inte från null'
  );
  assert.match(ROUTE, /error: 'missing_assignee'/);
});

test('AUDIT skiljer tilldelning, övertagande och avtilldelning', () => {
  /**
   * En gemensam auditnyckel hade gjort det omöjligt att i efterhand skilja
   * "fick ansvar" från "blev av med ansvar" utan att läsa metadata.
   */
  for (const nyckel of [
    'cco.conversation.assign.takeover',
    'cco.conversation.assign',
    'cco.conversation.unassign',
  ]) {
    assert.ok(ROUTE.includes(`'${nyckel}'`), `auditnyckeln ${nyckel} saknas`);
  }
  assert.match(ROUTE, /previousAssigneeEmail: foregaende/, 'föregående ägare loggas inte');
});

test('LÄSMODELLEN exponerar ägaren — annars är tilldelningen osynlig', () => {
  assert.match(LASMODELL, /assignedToEmail: normalizeText\(operatorState\.assignedToEmail/);
  assert.match(LASMODELL, /assignedAt: normalizeText\(operatorState\.assignedAt/);
});

test('GRÄNSSNITTET har en väg till tilldelning, med rätt kollegekälla', () => {
  const PANEL = fs.readFileSync(
    path.join(ROT, 'public', 'konversationer-bottom-actions.js'),
    'utf8'
  );
  assert.match(PANEL, /function openTilldela\(/, 'ingen dialog finns');
  assert.match(
    PANEL,
    /action === 'tilldela'\) openTilldela/,
    'ingen åtgärd når tilldelningsdialogen'
  );
  assert.match(PANEL, /\/api\/v1\/cco\/runtime\/conversation\/.*\/assign/, 'routen anropas inte');

  /**
   * Kollegorna hämtas från samma källa som personalportalens kollegevy. En
   * andra lista över vilka som jobbar på kliniken hade glidit isär från den
   * första — och den som stod i fel lista hade inte gått att tilldela.
   */
  assert.match(PANEL, /\/api\/v1\/staff\/colleagues/, 'kollegorna hämtas inte från staff-källan');

  // Och listan får inte tystna: utan kollegor går det inte att tilldela, och
  // då ska orsaken synas i stället för en tom rullgardin.
  assert.match(PANEL, /Kollegelistan kunde inte hämtas/);
});

test('TODO 6.3 är inte längre en ÖPPEN uppgift', () => {
  /**
   * En kvarlämnad TODO om något som är byggt skickar nästa läsare att bygga
   * det igen.
   *
   * Men strängen "TODO 6.3" får stå kvar i förklaringen till vad som byggdes
   * och varför — det är historik, inte en instruktion. Testet mäter därför
   * INSTRUKTIONSFORMEN: raden som bad någon göra jobbet.
   *
   * Första versionen matchade strängen rakt av och underkände sin egen
   * dokumentation. Fjärde gången i dag samma fälla, och den enda som skiljer
   * sig: här är det inte en kommentar som läses som kod, utan en beskrivning
   * som läses som ett kvarvarande krav.
   */
  assert.ok(
    !/\/\/ TODO 6\.3 —/.test(ROUTE),
    'TODO 6.3 står kvar som en öppen uppgift trots att tilldelningen är byggd'
  );
  assert.ok(
    !/det finns INGEN backend som lagrar vem en konversation är tilldelad till/.test(ROUTE),
    'påståendet att backend saknas står kvar — det är inte längre sant'
  );
});
