// ORD-111: mutationsprovade tester för mallrenderaren + hård stopp i send.
// Krav: tre tester som BLIR RÖDA om man återställer fixen (inte bara grå).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  renderMessage,
  extractVariables,
  firstMissingVariable,
} = require('../../src/ops/ccoMessageRenderer');
const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');

const snapshot = {
  subject: '4 månader efter din FUE',
  body: 'Hej {{firstName}},\n\n4 månader sedan din {{treatment}} — vi ser fram emot din uppföljning.\n\nHair TP Clinic',
  lang: 'sv',
};

test('ORD-111 #2: malltexten når meddelandet (subject och kropp från revisionen)', () => {
  const msg = renderMessage(snapshot, {
    firstName: 'Anna',
    treatment: 'hårtransplantation',
  });
  assert.equal(msg.subject, '4 månader efter din FUE');
  assert.match(msg.text, /4 månader sedan din hårtransplantation/);
  assert.ok(msg.html.includes('hårtransplantation'));
  // Mutationsprov: ta bort ersättningen i substitute → rå {{treatment}} kvar → misslyckas.
  assert.ok(!msg.text.includes('{{'));
});

test('ORD-111 #3: {{namn}} går aldrig ut ofyllt (saknad variabel stoppar)', () => {
  // Vi valde "stopp" före tom utfyllnad: saknas {{treatment}} → TEMPLATE_MISSING_VARIABLE.
  assert.throws(
    () => renderMessage(snapshot, { firstName: 'Anna' }),
    (err) => err.code === 'TEMPLATE_MISSING_VARIABLE' && /treatment/.test(err.message)
  );
  // Mutationsprov: gör missing='fill' → ingen throw → misslyckas.
  assert.equal(firstMissingVariable(snapshot.body, { firstName: 'Anna' }), 'treatment');
});

test('ORD-111 #1: utskick utan brödtext går inte iväg skarpt', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-send-empty-'));
  const filePath = path.join(tempDir, 'cco-send-actions.json');
  try {
    const store = await createCcoSendActionStore({ filePath });
    // dryRunOverride=false → skarpt läge. Tom kropp ska STANNA, inte skickas som tomt.
    await assert.rejects(
      store.performSend({
        kind: 'aftercare',
        payload: { to: 'anna@example.com', customerId: 'cust_anna' },
        dryRunOverride: false,
      }),
      (err) => err.code === 'TEMPLATE_EMPTY_MESSAGE'
    );
    // Mutationsprov: ta bort det hårda stoppet i performSend → inget fel → misslyckas.
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-111: extractVariables plockar camelCase-variabler', () => {
  const vars = extractVariables('Hej {{firstName}}, {{treatment}} ({{treatmentKey}})');
  assert.deepEqual(vars, ['firstName', 'treatment', 'treatmentKey']);
});
