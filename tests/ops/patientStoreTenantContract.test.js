'use strict';

/**
 * `tenantId` är inte optional i patient-mastern — den KASTAR utan den.
 *
 * ccoPatientMasterStore.js:114
 *   function tenantBucket(state, tenantId) {
 *     const tenant = normalizeText(tenantId);
 *     if (!tenant) throw new Error('tenantId saknas.');
 *
 * ORD-96 anropade `getPatient({ patientId })` utan tenantId. Anropet kastade,
 * ett `catch` returnerade null, adressmängden blev tom, och trådvyn svarade
 * `threads: []` på 0,17 sekunder. Inget kraschade, inget larmade.
 *
 * Testet finns för att felet inte ska kunna uppstå på NÄSTA getPatient-anrop
 * i stället för på det jag just rättade. Kontraktet vaktas, inte platsen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('tenantBucket kastar fortfarande utan tenantId — kontraktet är oförändrat', () => {
  // Om detta någon gång blir tillåtande är resten av testet meningslöst, och
  // då ska någon få veta det här och inte via en tom tråd.
  const store = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoPatientMasterStore.js'), 'utf8')
  );
  assert.match(store, /function tenantBucket\(state, tenantId\)/);
  assert.match(store, /if \(!tenant\) throw new Error\('tenantId saknas\.'\)/);
});

test('varje getPatient-anrop i CCO-kodvägarna skickar tenantId', () => {
  // Platsvakt räcker inte: felet uppstår igen på nästa anropsställe. Därför
  // granskas ALLA anrop, inte bara det som just rättades.
  const files = fs
    .readdirSync(path.join(ROOT, 'src', 'ops'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join('src', 'ops', name));

  const offenders = [];
  for (const relative of files) {
    const source = stripComments(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    const pattern = /\.getPatient\(\{([^}]*)\}/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (!/tenantId/.test(match[1])) {
        offenders.push(`${relative}: .getPatient({${match[1].trim().slice(0, 60)}})`);
      }
    }
  }
  assert.deepEqual(offenders, [], `getPatient utan tenantId:\n${offenders.join('\n')}`);
});

test('trådstorens catch loggar innan den fail-openar', () => {
  // Fail-open är rätt riktning — ingen matchning hellre än en krasch, samma
  // princip som send-gaten. Men TYST fail-open är precis det som gömde felet.
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'ops', 'ccoConversationThreadStore.js'),
    'utf8'
  );
  const start = source.indexOf('async function resolveCustomerEmailSet(');
  assert.ok(start > -1);
  const fn = source.slice(start, source.indexOf('\n    if (!patient) return null;', start));
  assert.match(fn, /catch \(error\)/, 'felet måste bindas, inte kastas bort');
  assert.match(fn, /console\.warn/, 'catch måste logga');
  assert.match(fn, /patientId/, 'loggen ska säga VILKEN patient som föll');
  assert.match(fn, /tenantId/, 'och vilken tenant');
});

test('resolvern får tenantId från anroparen, inte från en standardvärde', () => {
  const source = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoConversationThreadStore.js'), 'utf8')
  );
  assert.match(source, /resolveCustomerEmailSet\(customerId, tenantId\)/);
  assert.match(source, /async function resolveCustomerEmailSet\(customerId, tenantId\)/);
});

test('trådrutten hårdkodar inte en tenant-sträng', () => {
  // `hairtpclinic` pekade på en TOM bucket — tenantBucket skapar den på
  // begäran, så inget kastade och getPatient svarade null. Rätt tenant är
  // hair-tp-clinic, och den ska komma från auth eller konfigurationen.
  // P1-003/004 — tenanten hämtas nu canonical via resolveTenantScope (auth),
  // med config.defaultTenantId som enda fallback. Ingen hårdkodad tenant-sträng.
  const route = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'routes', 'ccoCustomerComm.js'), 'utf8')
  );
  assert.match(route, /resolveTenantScope\(req,/);
  assert.match(route, /fallbackTenantId: config\?\.defaultTenantId/);
  assert.ok(
    !/\|\|\s*'hairtpclinic'/.test(route),
    'ingen hårdkodad tenant-sträng som skapar en tom bucket'
  );
});

test('trådstoren får en brevlådelista, inte bara LRU:ns innehåll', () => {
  // Utan historyMailboxIds blir searchMailboxes = listLoadedMailboxes(),
  // alltså de två som råkar ligga i cachen. Åtta av tio söktes aldrig.
  const route = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'routes', 'ccoCustomerComm.js'), 'utf8')
  );
  assert.match(route, /historyMailboxIds = \[\]/, 'routern ska ta emot listan');
  assert.match(route, /^\s+historyMailboxIds,$/m, 'och skicka den vidare till trådstoren');
});

test('varje brevlåda laddas precis innan den läses — LRU-taket är 2', () => {
  // preloadTruthMailboxes laddade alla åtta i följd, men maxLoadedShards = 2,
  // så sex var utvräkta igen innan loopen läste dem. listMessages returnerar
  // tom lista för en oladdad shard, tyst.
  //
  // Fjärde gången samma tak i dag: korsbrevlåderapporten såg två brevlådor,
  // listMessages({}) betydde "de laddade", och nu detta.
  const source = fs.readFileSync(
    path.join(ROOT, 'src', 'ops', 'ccoConversationThreadStore.js'),
    'utf8'
  );
  const start = source.indexOf('async function listTruthMessagesForCustomer(');
  assert.ok(start > -1, 'funktionen måste vara async för att kunna ladda');
  const fn = source.slice(start, source.indexOf('\nfunction asArray', start));
  const loadPos = fn.indexOf('ensureMailboxLoaded(mailboxId)');
  const listPos = fn.indexOf('listMessages({');
  assert.ok(loadPos > -1, 'brevlådan måste laddas i loopen');
  assert.ok(listPos > loadPos, 'laddningen måste ske FÖRE läsningen');
});

test('LRU-taket är fortfarande 2 — annars är vakten ovan meningslös', () => {
  const sharded = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthShardedStore.js'), 'utf8')
  );
  assert.match(sharded, /maxLoadedShards = 2/);
});
