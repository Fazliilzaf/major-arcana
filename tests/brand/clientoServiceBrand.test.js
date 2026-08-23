const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeServiceName,
  normalizeBrandKey,
  brandForClientoServiceLabel,
  buildExplicitCuratiioSet,
} = require('../../src/brand/clientoServiceBrand');

test('normalizeServiceName slår ihop | · • till mellanslag och normaliserar', () => {
  assert.equal(normalizeServiceName('Botox | Behandling'), 'botox behandling');
  assert.equal(normalizeServiceName('Botox · Behandling'), 'botox behandling');
  assert.equal(normalizeServiceName('  Stygnborttagning  '), 'stygnborttagning');
});

test('normalizeBrandKey normaliserar båda varumärkena', () => {
  assert.equal(normalizeBrandKey('Hair TP Clinic'), 'hair-tp-clinic');
  assert.equal(normalizeBrandKey('hairtp'), 'hair-tp-clinic');
  assert.equal(normalizeBrandKey('Curatiio'), 'curatiio');
});

test('Botox-varianter klassas som Curatiio (explicit lista vinner över katalogen)', () => {
  // Katalogen felmärker dessa som "Hair TP Clinic" (id 64399/64400/64401).
  assert.equal(brandForClientoServiceLabel('Botox · Behandling'), 'curatiio');
  assert.equal(brandForClientoServiceLabel('Botox · Återbesök'), 'curatiio');
  assert.equal(brandForClientoServiceLabel('Botox · Konsultation'), 'curatiio');
  // Cliento-storen använder "|" — båda formerna ska normaliseras likadant.
  assert.equal(brandForClientoServiceLabel('Botox | Behandling'), 'curatiio');
});

test('Biofillers klassas som Curatiio (katalogen säger Hair TP, id 50555)', () => {
  assert.equal(brandForClientoServiceLabel('Biofillers'), 'curatiio');
});

test('tidigare explicita Curatiio-tjänster fortsätter klassas rätt', () => {
  assert.equal(brandForClientoServiceLabel('Stygn borttagning'), 'curatiio');
  assert.equal(brandForClientoServiceLabel('Stygnborttagning'), 'curatiio');
  assert.equal(brandForClientoServiceLabel('Ögonplastik · Uppföljning'), 'curatiio');
});

test('"Ta bort styng" är Hair TP och får INTE klassas som Curatiio', () => {
  assert.notEqual(brandForClientoServiceLabel('Ta bort styng'), 'curatiio');
});

test('de "lämna" tjänsterna finns inte i den explicita listan', () => {
  // Uppföljning/Injektionsbehandling finns i båda märkena och ska lösas på
  // resurs, inte på tjänstenamn. Den explicita listan får inte tvinga dem.
  const explicit = buildExplicitCuratiioSet();
  assert.equal(explicit.has(normalizeServiceName('Uppföljning')), false);
  assert.equal(explicit.has(normalizeServiceName('Uppföljning via telefon')), false);
  assert.equal(explicit.has(normalizeServiceName('Injektionsbehandling · Konsultation')), false);
});
