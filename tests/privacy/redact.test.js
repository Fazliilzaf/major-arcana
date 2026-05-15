const test = require('node:test');
const assert = require('node:assert/strict');

const { redactForStorage } = require('../../src/privacy/redact');

test('redactForStorage masks email personnummer and phone-like sequences', () => {
  const input =
    'Mail user@Example.COM och ring 070-123 45 67, pn 850101-1234 datum 2024-01-02';
  const out = redactForStorage(input);
  assert.match(out, /\[email\]/);
  assert.match(out, /\[personnummer\]/);
  assert.match(out, /\[telefon\]/);
  assert.match(out, /2024-01-02/);
});

test('redactForStorage handles nullish as empty string', () => {
  assert.equal(redactForStorage(null), '');
});

test('redactForStorage handles undefined as empty string', () => {
  assert.equal(redactForStorage(undefined), '');
});

test('redactForStorage tom sträng förblir tom', () => {
  assert.equal(redactForStorage(''), '');
});

test('redactForStorage maskerar flera mejladresser i samma text', () => {
  const out = redactForStorage('Skicka till a@b.co och cc@d.se tack.');
  assert.equal([...out.matchAll(/\[email\]/g)].length, 2);
  assert.equal(out.includes('@'), false);
});

test('redactForStorage maskerar personnummer med plus som separator', () => {
  const out = redactForStorage('ID 850101+1234 sparad.');
  assert.match(out, /\[personnummer\]/);
  assert.equal(out.includes('850101'), false);
});

test('redactForStorage masks compact twelve digit personnummer', () => {
  const out = redactForStorage('Kund 198501011234 registrerad.');
  assert.match(out, /\[personnummer\]/);
  assert.equal(out.includes('198501011234'), false);
});

test('redactForStorage maskerar personnummer med åttasiffrigt födelsedatum och bindestreck', () => {
  const out = redactForStorage('Kund 19850101-1234 finns i journalen.');
  assert.match(out, /\[personnummer\]/);
  assert.equal(out.includes('19850101-1234'), false);
});

test('redactForStorage masks E.164 style phone with country code', () => {
  const out = redactForStorage('Ring +46701234567 vid behov.');
  assert.match(out, /\[telefon\]/);
  assert.equal(out.includes('+46701234567'), false);
});

test('redactForStorage maskerar telefon med landskod och mellanslag', () => {
  const out = redactForStorage('Ring tillbaka på +46 70 123 45 67 vid behov.');
  assert.match(out, /\[telefon\]/);
  assert.equal(out.includes('+46 70'), false);
  assert.equal(out.includes('701234567'), false);
});

test('redactForStorage maskerar inte korta nummer under telefontröskel', () => {
  const input = 'Kontor 123-4567, intern 55555.';
  const out = redactForStorage(input);
  assert.equal(out.includes('[telefon]'), false);
  assert.equal(out.includes('123-4567'), true);
});

test('redactForStorage tolkar 12-siffrig sekvens som personnummer före telefonmaskning', () => {
  const input = 'Tracking 123456789012 men ring 0701234567.';
  const out = redactForStorage(input);
  assert.equal(out.includes('123456789012'), false); // personnummer-regeln maskerar detta
  assert.equal(out.includes('[personnummer]'), true);
  assert.equal(out.includes('[telefon]'), false);
});

test('redactForStorage bevarar datumformat när personnummer maskeras', () => {
  const out = redactForStorage('Möte 2026-05-13 och person 850101-1234.');
  assert.equal(out.includes('2026-05-13'), true);
  assert.equal(out.includes('[personnummer]'), true);
});

test('redactForStorage koercerar numeriskt input till sträng', () => {
  assert.equal(redactForStorage(42), '42');
});

test('redactForStorage maskerar svenskt fast nätnummer som börjar på 0', () => {
  const out = redactForStorage('Ring 031-12 34 56 för växel.');
  assert.match(out, /\[telefon\]/);
  assert.equal(out.includes('031-12'), false);
});

test('redactForStorage maskerar inte telefonliknande sekvens med fler än 15 siffror', () => {
  const raw = 'Spam +4612345678901234567890123 text';
  const out = redactForStorage(raw);
  assert.equal(out.includes('[telefon]'), false);
  assert.equal(out, raw);
});
