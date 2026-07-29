'use strict';

/**
 * ORD-96 — kunden är tråden.
 *
 * `truthMessageMatchesCustomer` returnerade `false` så snart meddelandet
 * saknade `customerIdentity`. Men identiteten sätts aldrig på meddelandet:
 * resolvern lägger den på FLYKTIGA worklist-rader och skriver aldrig tillbaka.
 *
 * Fältet krävdes av läsaren och sattes aldrig av skrivaren. Kundnycklade trådar
 * var tomma av konstruktion.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'ops', 'ccoConversationThreadStore.js'),
  'utf8'
);

/** Kör den RIKTIGA funktionen ur källan — inte en kopia som kan glida isär. */
function loadMatcher() {
  const start = SOURCE.indexOf('function truthMessageMatchesCustomer(');
  assert.ok(start > -1);
  const end = SOURCE.indexOf('\n}\n', start) + 3;
  const helpers = `
    function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
    function resolveCustomerIdFromIdentity(identity = {}) {
      const s = identity && typeof identity === 'object' ? identity : {};
      return normalizeText(s.canonicalCustomerId) || normalizeText(s.customerId) || normalizeText(s.customerKey);
    }
    const { pickCustomerEmail } = require('${path
      .join(__dirname, '..', '..', 'src', 'ops', 'crossMailboxAggregator')
      .replace(/\\/g, '/')}');
  `;
  // eslint-disable-next-line no-new-func
  return new Function(
    'require',
    `${helpers}${SOURCE.slice(start, end)} return truthMessageMatchesCustomer;`
  )(require);
}

const matches = loadMatcher();

const inbound = (mailboxId, address) => ({
  mailboxId,
  folderType: 'inbox',
  from: { address, name: 'Kund' },
  toRecipients: [{ address: mailboxId, name: 'Hair TP' }],
});

const outbound = (mailboxId, address) => ({
  mailboxId,
  folderType: 'sent',
  from: { address: mailboxId, name: 'Hair TP' },
  toRecipients: [{ address, name: 'Kund' }],
});

test('ett meddelande UTAN lagrad identitet syns nu i kundens tråd', () => {
  // Detta är hela defekten: fältet sattes aldrig, så villkoret var alltid falskt.
  const msg = inbound('contact@hairtpclinic.com', 'kund@example.com');
  assert.equal(matches(msg, 'patient-1'), false, 'utan adressmängd finns inget att härleda ur');
  assert.equal(
    matches(msg, 'patient-1', new Set(['kund@example.com'])),
    true,
    'med kundens egna adresser ska meddelandet höra till tråden'
  );
});

test('kundens SVAR hör till samma tråd', () => {
  // Utgående mejl har kunden i mottagaren. Utan det saknas halva
  // korrespondensen — och "vem svarade" är halva Fazlis krav.
  assert.equal(
    matches(outbound('egzona@hairtpclinic.com', 'kund@example.com'), 'patient-1', new Set(['kund@example.com'])),
    true
  );
});

test('samma kund i två brevlådor hamnar under samma kund-id', () => {
  const emails = new Set(['kund@example.com']);
  assert.equal(matches(inbound('contact@hairtpclinic.com', 'kund@example.com'), 'p1', emails), true);
  assert.equal(matches(inbound('egzona@hairtpclinic.com', 'kund@example.com'), 'p1', emails), true);
});

test('en adress som inte är kundens länkar aldrig', () => {
  assert.equal(
    matches(inbound('contact@hairtpclinic.com', 'annan@example.com'), 'p1', new Set(['kund@example.com'])),
    false
  );
});

test('lagrad identitet fortsätter gälla och kräver ingen adressmängd', () => {
  const msg = {
    ...inbound('contact@hairtpclinic.com', 'okänd@example.com'),
    customerIdentity: { canonicalCustomerId: 'p1' },
  };
  assert.equal(matches(msg, 'p1'), true, 'den gamla vägen får inte regressera');
});

test('tom adressmängd länkar ingenting — ambiguous släpps uppströms', () => {
  // resolveCustomerEmailSet släpper adresser vars match är `ambiguous`. Blir
  // mängden tom ska matchningen falla tillbaka på ingenting, inte på gissning.
  assert.equal(
    matches(inbound('contact@hairtpclinic.com', 'kund@example.com'), 'p1', new Set()),
    false
  );
});

test('adressmängden byggs med SAMMA resolver som worklisten', () => {
  // "En funktion, alla ytor" — inte en egen variant som råkar ge samma svar.
  assert.match(SOURCE, /require\('\.\/ccoConversationPatientResolver'\)/);
  assert.match(SOURCE, /resolveConversationPatient\(/);
  assert.match(SOURCE, /status\)\s*===\s*'matched'/, 'bara entydiga matchningar får länka');
});
