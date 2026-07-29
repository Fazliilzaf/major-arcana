'use strict';

/**
 * ORD-95 — vakt för korsbrevlåderapporten.
 *
 * Rapporten svarade "0 kunder" på 19 978 meddelanden utan att något gick fel.
 * Två oberoende orsaker, och båda vaktas här: fältformen och riktningen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateByCustomer,
  findCrossMailboxCustomers,
  computeIdentityCoverage,
  pickCustomerEmail,
} = require('../../src/ops/crossMailboxAggregator');

const TENANT = new Set(['contact@hairtpclinic.com', 'egzona@hairtpclinic.com', 'fazli@hairtpclinic.com']);

/** Formen truth-storen FAKTISKT lagrar — platt `from.address`, inte Graphs. */
const inbound = (mailboxId, address, name, extra = {}) => ({
  mailboxId,
  folderType: 'inbox',
  from: { address, name },
  toRecipients: [{ address: mailboxId, name: 'Hair TP' }],
  receivedAt: '2026-07-20T10:00:00.000Z',
  ...extra,
});

const outbound = (mailboxId, address, extra = {}) => ({
  mailboxId,
  folderType: 'sent',
  from: { address: mailboxId, name: 'Hair TP' },
  toRecipients: [{ address, name: 'Kund' }],
  sentAt: '2026-07-20T11:00:00.000Z',
  ...extra,
});

test('den LAGRADE formen läses, inte bara Graphs', () => {
  // Fram till 2026-07-29 lästes bara from.emailAddress.address. Storen lagrar
  // from.address. Ingen av vägarna träffade, och rapporten var tom.
  assert.equal(
    pickCustomerEmail(inbound('contact@hairtpclinic.com', 'kund@example.com', 'Kund'), TENANT),
    'kund@example.com'
  );
  // Graphs form måste fortsätta fungera — den finns i äldre poster.
  assert.equal(
    pickCustomerEmail(
      { mailboxId: 'contact@hairtpclinic.com', from: { emailAddress: { address: 'g@example.com' } } },
      TENANT
    ),
    'g@example.com'
  );
});

test('utgående mejl knyts till MOTTAGAREN, inte till oss själva', () => {
  // from är vår egen brevlåda på allt vi skickat, och den raden slogs bort.
  // Halva korrespondensen försvann — och svaren är just det Fazli vill se.
  assert.equal(
    pickCustomerEmail(outbound('contact@hairtpclinic.com', 'kund@example.com'), TENANT),
    'kund@example.com'
  );
});

test('våra egna brevlådor blir aldrig kunder', () => {
  // Utan tenant-mängden blir intern post mellan contact@ och fazli@ en
  // "korsbrevlådekund" — ett svar som är värre än inget svar.
  const internt = inbound('contact@hairtpclinic.com', 'fazli@hairtpclinic.com', 'Fazli');
  assert.equal(pickCustomerEmail(internt, TENANT), null);
});

test('en kund som skrivit till tre brevlådor hittas', () => {
  const messages = [
    inbound('contact@hairtpclinic.com', 'kund@example.com', 'Kund'),
    inbound('egzona@hairtpclinic.com', 'kund@example.com', 'Kund'),
    outbound('fazli@hairtpclinic.com', 'kund@example.com'),
  ];
  const found = findCrossMailboxCustomers(messages, { tenantMailboxIds: TENANT });
  assert.equal(found.length, 1);
  assert.equal(found[0].mailboxIds.length, 3, 'alla tre brevlådorna ska räknas');
});

test('täckningen räknas per riktning', () => {
  const messages = [
    inbound('contact@hairtpclinic.com', 'a@example.com', 'A'),
    outbound('contact@hairtpclinic.com', 'a@example.com'),
    { mailboxId: 'contact@hairtpclinic.com', folderType: 'inbox' }, // utan avsändare
  ];
  const c = computeIdentityCoverage(messages, { tenantMailboxIds: TENANT });
  assert.equal(c.totalMessages, 3);
  assert.equal(c.resolved, 2);
  assert.equal(c.outbound.total, 1);
  assert.equal(c.outbound.resolved, 1, 'utgående måste kunna lösas — annars mäter vi bara halva');
  assert.equal(c.uniqueCustomers, 1);
});

test('aggregeringen tappar inte kunden när bara namnet saknas', () => {
  const map = aggregateByCustomer(
    [inbound('contact@hairtpclinic.com', 'utan.namn@example.com', '')],
    { tenantMailboxIds: TENANT }
  );
  assert.equal(map.size, 1);
});

// ── Källvakt för rutten ──────────────────────────────────────────────────────
const fs = require('node:fs');
const path = require('node:path');
const OPS_ROUTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'routes', 'ops.js'),
  'utf8'
);

function crossMailboxHandler() {
  const start = OPS_ROUTE.indexOf("'/ops/customers/cross-mailbox-report'");
  assert.ok(start > -1, 'rutten ska finnas');
  const end = OPS_ROUTE.indexOf('\n  router.', start);
  return OPS_ROUTE.slice(start, end > -1 ? end : start + 6000);
}

test('brevlådelistan byggs genom att KODA, och luckor rapporteras', () => {
  // decodeMailboxIdFromShardFileName matchar bara _hairtpclinic_com, så
  // info_fazli_se.json blev '' och försvann i .filter(Boolean). Rapporten som
  // finns för att svara "alla brevlådor" hade täckt åtta av nio och sett
  // komplett ut — och resolvedShare hade räknats över fel nämnare.
  const handler = crossMailboxHandler();
  assert.match(handler, /encodeMailboxId\(mailboxId\)/, 'filnamnet ska kodas fram');
  assert.match(handler, /skippedShardFiles/, 'en lucka ska synas i svaret');
  assert.ok(
    !/\.map\(\(name\) => decodeMailboxIdFromShardFileName\(name\)\)\s*\n?\s*\.filter\(Boolean\)/.test(
      handler
    ),
    'ingen tyst bortfiltrering av oavkodbara filnamn'
  );
});

test('en shard vars namn inte går att tolka återställs ur datan', () => {
  // Konfigurationslistan bär åtta brevlådor och saknar info@fazli.se, så
  // varken avkodning eller konfiguration räcker ensam. Sharden vet vad den
  // heter: accounts är nyckelad på mailboxId.
  const handler = crossMailboxHandler();
  assert.match(handler, /Object\.keys\(state\?\.accounts \|\| \{\}\)\[0\]/);
});

test('fördelningen skiljer få storsändare från många enstaka', () => {
  // Meddelanden är fel nämnare: ett nyhetsbrev med 300 utskick väger 300, en
  // patient med tre mejl väger 3. Är restposten 200 avsändare med mycket post
  // är den korrekt; är den 15 000 med lite post saknas verkliga människor.
  const messages = [];
  for (let i = 0; i < 300; i += 1) messages.push(inbound('contact@hairtpclinic.com', 'utskick@leverantor.se', 'X'));
  for (let i = 0; i < 50; i += 1) messages.push(inbound('contact@hairtpclinic.com', `p${i}@example.com`, 'P'));
  const { addressDistribution: d } = computeIdentityCoverage(messages, { tenantMailboxIds: TENANT });
  assert.equal(d.uniqueAddresses, 51);
  assert.equal(d.singletons, 50);
  assert.equal(d.max, 300);
  assert.ok(d.top10Share > 0.8, 'en storsändare ska synas som koncentration, inte som täckning');
});
