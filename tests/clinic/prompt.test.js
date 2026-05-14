const test = require('node:test');
const assert = require('node:assert/strict');

const { getClinicSystemPrompt } = require('../../src/clinic/prompt');

test('getClinicSystemPrompt returns Swedish Hair TP content from prompts dir', async () => {
  const text = await getClinicSystemPrompt('hair-tp-clinic');
  assert.ok(text.length > 50);
  assert.match(text, /Hair TP Clinic/i);
});

test('getClinicSystemPrompt caches result per brand', async () => {
  const a = await getClinicSystemPrompt('curatiio');
  const b = await getClinicSystemPrompt('curatiio');
  assert.strictEqual(a, b);
});

test('getClinicSystemPrompt loads curatiio bundle when requested', async () => {
  const text = await getClinicSystemPrompt('curatiio');
  assert.ok(text.length > 20);
  assert.match(text, /Curatiio/i);
});

test('getClinicSystemPrompt trimmar brand-sträng till samma cache som utan padding', async () => {
  const direct = await getClinicSystemPrompt('hair-tp-clinic');
  const padded = await getClinicSystemPrompt('  hair-tp-clinic  ');
  assert.strictEqual(padded, direct);
});

test('getClinicSystemPrompt tom icke-sträng eller blank sträng använder config.brand', async () => {
  const { config } = require('../../src/config');
  const canonical = await getClinicSystemPrompt(config.brand);
  assert.strictEqual(await getClinicSystemPrompt(''), canonical);
  assert.strictEqual(await getClinicSystemPrompt('   '), canonical);
  assert.strictEqual(await getClinicSystemPrompt(null), canonical);
  assert.strictEqual(await getClinicSystemPrompt(undefined), canonical);
  assert.strictEqual(await getClinicSystemPrompt(99), canonical);
});

test('getClinicSystemPrompt saknad brand-mapp ger tom sträng', async () => {
  const text = await getClinicSystemPrompt('zzz-no-prompts-brand-999');
  assert.equal(text, '');
});
