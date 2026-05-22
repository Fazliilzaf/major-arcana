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

test('maskInboxText normaliserar radbrytningar till mellanslag', () => {
  const output = maskInboxText('Rad ett\n\nRad två   rad tre');
  assert.equal(output.includes('\n'), false);
  assert.ok(output.includes('Rad ett Rad två rad tre'));
});

test('maskInboxText strips css-like leakage from previews', () => {
  const output = maskInboxText('.cco-message.outbound { background: #EFEAE6; } Hej patient@example.com');
  assert.equal(output.includes('.cco-message.outbound'), false);
  assert.equal(output.includes('background:'), false);
  assert.equal(output.includes('[email]'), true);
});

test('maskInboxText returns empty for blank input', () => {
  assert.equal(maskInboxText(''), '');
  assert.equal(maskInboxText('   \n\t'), '');
});

test('maskInboxText returns empty for nullish input', () => {
  assert.equal(maskInboxText(null), '');
  assert.equal(maskInboxText(undefined), '');
});

test('maskInboxText removes style blocks before redacting', () => {
  const output = maskInboxText(
    '<style type="text/css">.a{color:#f00;} p{margin:0;}</style>Skriv till info@klinik.se'
  );
  assert.equal(output.includes('<style'), false);
  assert.equal(output.toLowerCase().includes('color:#f00'), false);
  assert.ok(output.includes('[email]'));
});

test('maskInboxText masks 12 digit identifiers starting with 19 or 20', () => {
  const output = maskInboxText('Referensnummer 198501011234 bifogat.');
  assert.ok(output.includes('[id]'));
  assert.equal(output.includes('198501011234'), false);
});

test('maskInboxText maskerar flera http-lankar', () => {
  const output = maskInboxText('Se https://a.test/x och http://b.test/y');
  assert.equal([...output.matchAll(/\[lank\]/g)].length, 2);
  assert.equal(output.includes('http'), false);
});

test('maskInboxText maskerar HTTP-lankar med versaler', () => {
  const output = maskInboxText('Följ HTTP://EXAMPLE.COM/steg för mer info.');
  assert.ok(output.includes('[lank]'));
  assert.equal(output.includes('EXAMPLE.COM'), false);
});

test('maskInboxText anvander default maxLength 360 utan avkortning for kort text', () => {
  const body = `Meddelande ${'word '.repeat(40)}`;
  const output = maskInboxText(body);
  assert.equal(output.endsWith('...'), false);
  assert.ok(output.length > 80);
});

test('maskInboxText maskerar telefonnummer med landskod och parenteser', () => {
  const output = maskInboxText('Ring mig pa +46 (70) 123-45-67 sa fort du kan.');
  assert.ok(output.includes('[telefon]'));
  assert.equal(output.includes('+46 (70) 123-45-67'), false);
});

test('maskInboxText maskerar versala e-postadresser', () => {
  const output = maskInboxText('Maila till CARE@EXAMPLE.COM for uppfoljning.');
  assert.ok(output.includes('[email]'));
  assert.equal(output.includes('CARE@EXAMPLE.COM'), false);
});

test('maskInboxText behaller icke-css semikolontext', () => {
  const output = maskInboxText('Anteckning: kod A12; status ok; ansvarig team.');
  assert.ok(output.includes('kod A12;'));
  assert.ok(output.includes('status ok;'));
});

test('maskInboxText maskerar personnummer med blanksteg mellan datum och de fyra sista', () => {
  const output = maskInboxText('Kolla 850101 1234 i journalen.');
  assert.ok(output.includes('[id]'));
  assert.equal(output.includes('850101 1234'), false);
});

test('maskInboxText maskerar personnummer med plustecken', () => {
  const output = maskInboxText('ID 850101+1234 sparat.');
  assert.ok(output.includes('[id]'));
  assert.equal(output.includes('850101+1234'), false);
});

test('maskInboxText klipper enligt mycket litet maxLength', () => {
  const out = maskInboxText(`Hej ${'x'.repeat(40)}`, 14);
  assert.ok(out.endsWith('...'));
  assert.ok(out.length <= 14);
});

test('maskInboxText behandlar numerisk input som teckenstrang utan crash', () => {
  assert.equal(maskInboxText(0), '');
  assert.equal(maskInboxText(42), '42');
});
