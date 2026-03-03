const test = require('node:test');
const assert = require('node:assert/strict');

const { maskInboxText } = require('../../src/privacy/inboxMasking');

test('maskInboxText redacts url, email, phone and id-like values', () => {
  const output = maskInboxText(
    'Kontakta mig pa 070-123 45 67 eller patient@example.com. Personnummer 850101-1234. Se https://example.com/info'
  );

  assert.equal(output.includes('[telefon]'), true);
  assert.equal(output.includes('[email]'), true);
  assert.equal(output.includes('[id]'), true);
  assert.equal(output.includes('[lank]'), true);
  assert.equal(output.includes('070-123 45 67'), false);
  assert.equal(output.includes('patient@example.com'), false);
  assert.equal(output.includes('850101-1234'), false);
  assert.equal(output.includes('https://example.com/info'), false);
});

test('maskInboxText normalizes whitespace and caps long text', () => {
  const input = `  Hej   det   har   ar   ett   test  ${'x'.repeat(420)} `;
  const output = maskInboxText(input, 80);

  assert.equal(output.includes('  '), false);
  assert.equal(output.length <= 80, true);
  assert.equal(output.endsWith('...'), true);
});

test('maskInboxText strips css-like leakage from previews', () => {
  const output = maskInboxText('.cco-message.outbound { background: #EFEAE6; } Hej patient@example.com');
  assert.equal(output.includes('.cco-message.outbound'), false);
  assert.equal(output.includes('background:'), false);
  assert.equal(output.includes('[email]'), true);
});
