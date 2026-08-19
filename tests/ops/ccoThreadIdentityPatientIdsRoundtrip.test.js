const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');

/**
 * threadIdentityIndex[*].patientIds — Set genom spara/ladda.
 *
 * Buggen: fältet är ett Set i minnet, och toBfjSafeValue skrev det som {} för
 * att matcha vad native JSON.stringify gör med en bar Set. Två följder:
 *
 *   1. Innehållet gick förlorat vid VARJE skrivning.
 *   2. Nästa uppdatering av samma tråd läste tillbaka {} och anropade .add på
 *      det → "previous.patientIds.add is not a function".
 *
 * I prod gav det sex misslyckade meddelanden per batch om femtio, alltså 12 %,
 * synligt först när telemetriraden per kökörning kom på plats 2026-08-19.
 */

async function skapaStore(seed = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-tradidentitet-'));
  const filePath = path.join(dir, 'cco-mail-ingestion.json');
  await fs.writeFile(filePath, JSON.stringify(seed), 'utf8');
  return { store: await createCcoMailIngestionStore({ filePath }), filePath };
}

function rawMessage(id, conversationId) {
  return {
    id,
    mailboxId: 'egzona@hairtpclinic.com',
    conversationId,
    graphMessageId: `graph-${id}`,
    folderType: 'inbox',
  };
}

// Nyckeln byggs av toCanonicalMailboxConversationKey. Vi harleder den ur
// storen i stallet for att anta formatet — annars testar vi var egen gissning.
function endaKey(store) {
  const alla = store.listThreadIdentities({});
  assert.equal(alla.length, 1, 'forvantade exakt en tradidentitet');
  return alla[0].conversationKey;
}

test('patientIds overlever spara och ladda', async () => {
  const seed = {
    processingQueue: [],
    mailRawMessages: { m1: rawMessage('m1', 'tradA') },
    threadIdentityIndex: {},
  };
  const { store, filePath } = await skapaStore(seed);

  await store.updateThreadIdentityForMessage({
    rawMessageId: 'm1',
    patientId: 'pat-1',
    linkedBy: 'test',
    persist: true,
  });

  const pa_disk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const post = Object.values(pa_disk.threadIdentityIndex)[0];
  assert.ok(post, 'ingen tradidentitet skrevs till disk');

  assert.ok(Array.isArray(post.patientIds), 'ska sparas som array, inte {}');
  assert.deepEqual(post.patientIds, ['pat-1'], 'innehallet far inte ga forlorat');

  // Ladda om från disk och kontrollera att läsvägen ger samma sak.
  const omladdad = await createCcoMailIngestionStore({ filePath });
  const identitet = omladdad.getThreadIdentity(post.conversationKey);
  assert.deepEqual(identitet.patientIds, ['pat-1']);
});

test('uppdatering av en post som lasts fran disk kastar inte', async () => {
  // Reproducerar prod-felet exakt: posten finns redan, patientIds ar {} efter
  // en skrivning i det gamla formatet.
  // Skapa forst en post via storen for att fa ratt nyckelformat, skriv sedan
  // om filen sa att patientIds ar {} — precis som gamla formatet pa disk.
  const { store: forsta, filePath } = await skapaStore({
    processingQueue: [],
    mailRawMessages: { m1: rawMessage('m1', 'tradA'), m2: rawMessage('m2', 'tradA') },
    threadIdentityIndex: {},
  });
  await forsta.updateThreadIdentityForMessage({ rawMessageId: 'm1', patientId: 'pat-1' });
  const key = endaKey(forsta);

  const pa_disk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  pa_disk.threadIdentityIndex[key].patientIds = {};
  await fs.writeFile(filePath, JSON.stringify(pa_disk), 'utf8');

  const store = await createCcoMailIngestionStore({ filePath });
  const resultat = await store.updateThreadIdentityForMessage({
    rawMessageId: 'm2',
    patientId: 'pat-2',
    linkedBy: 'test',
    persist: false,
  });

  assert.ok(resultat, 'ska inte kasta pa gamla formatet');
  assert.deepEqual(store.getThreadIdentity(key).patientIds, ['pat-2']);
});

test('flera patienter pa samma trad ger identityConflict', async () => {
  const { store } = await skapaStore({
    processingQueue: [],
    mailRawMessages: { m1: rawMessage('m1', 'tradA'), m2: rawMessage('m2', 'tradA') },
    threadIdentityIndex: {},
  });

  await store.updateThreadIdentityForMessage({ rawMessageId: 'm1', patientId: 'pat-1' });
  await store.updateThreadIdentityForMessage({ rawMessageId: 'm2', patientId: 'pat-2' });

  const identitet = store.getThreadIdentity(endaKey(store));
  assert.equal(identitet.identityConflict, true);
  assert.equal(identitet.canonicalPatientId, null, 'vid konflikt ska kanoniskt id vara null');
  assert.deepEqual([...identitet.patientIds].sort(), ['pat-1', 'pat-2']);
});

test('listThreadIdentities filtrerar pa patientId aven nar faltet ar en array', async () => {
  // .has() pa en array kastar inte, den finns bara inte — filtret hade tyst
  // returnerat nom traffar. Darfor testas bade array- och {}-formatet.
  const { store } = await skapaStore({
    processingQueue: [],
    mailRawMessages: {},
    threadIdentityIndex: {
      tradA: { conversationKey: 'tradA', patientIds: ['pat-1'], rawMessageIds: [] },
      tradB: { conversationKey: 'tradB', patientIds: ['pat-2'], rawMessageIds: [] },
      tradC: { conversationKey: 'tradC', patientIds: {}, rawMessageIds: [] },
    },
  });

  const traffar = store.listThreadIdentities({ patientId: 'pat-1' });
  assert.equal(traffar.length, 1);
  assert.equal(traffar[0].conversationKey, 'tradA');

  assert.equal(store.listThreadIdentities({}).length, 3, 'utan filter ska alla med');
});
