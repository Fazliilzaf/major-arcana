'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INTENTIONAL_DROPS,
  droppedKeys,
  isEnabled,
  reportDroppedKeys,
} = require('../../src/ops/ccoNormalizerDropLoud');

test('isEnabled: no-op i produktion, på i dev/test', () => {
  assert.equal(isEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(isEnabled({ NODE_ENV: 'test' }), true);
  assert.equal(isEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isEnabled({}), true); // default dev
});

test('reportDroppedKeys är en no-op i produktion (returnerar [])', () => {
  const dropped = reportDroppedKeys(
    { behålls: 1, kastas: 2 },
    { behålls: 1 },
    { env: { NODE_ENV: 'production' }, store: 's', normalizer: 'n' }
  );
  assert.deepEqual(dropped, []);
});

test('ett känt fält som kastas ger utslag (Godkänt 3 + mutation 7)', () => {
  // "signatureProof" fanns i indata men inte i det byggda objektet → ska fångas.
  const dropped = droppedKeys(
    { signatureProof: [{ source: 'bankid' }], patientId: 'p1' },
    { patientId: 'p1' }
  );
  assert.deepEqual(dropped, ['signatureProof']);

  // Mutationstest: tar man bort ett fält ur "whitelisten" (output) fångas det.
  const preserved = droppedKeys(
    { signatureProof: [], patientId: 'p1' },
    { signatureProof: [], patientId: 'p1' }
  );
  assert.deepEqual(preserved, []);
});

test('undantagslistan tystar bara namngivna fält med skäl', () => {
  // Varje rad i INTENTIONAL_DROPS ska ha ett icke-tomt skäl.
  for (const [key, reason] of Object.entries(INTENTIONAL_DROPS)) {
    assert.ok(typeof reason === 'string' && reason.trim().length > 0, `"${key}" saknar skäl`);
  }

  const exceptions = { interntFalt: 'medvetet kastas — intern temporär data' };
  const dropped = droppedKeys(
    { interntFalt: 1, riktigtFalt: 2 },
    { riktigtFalt: 2 },
    { exceptions }
  );
  assert.deepEqual(dropped, []);
});
