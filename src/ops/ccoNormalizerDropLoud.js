'use strict';

/**
 * ccoNormalizerDropLoud — gör tysta fältbortfall i normaliserare hörbara.
 *
 * Normaliserarna bygger sina objekt fält för fält. Ett fält som inte står i
 * listan försvinner utan ett ljud. Den här hjälparen jämför indatanycklar mot
 * det byggda objektets nycklar och rapporterar dem som föll bort.
 *
 * ORD-145. EN enda plats — kopiera inte den här logiken.
 *
 * Gate: no-op i produktion (`NODE_ENV === 'production'`). Det här är ett
 * dev-/test-verktyg, inte en runtime-kontroll — den får inte kosta något i en
 * het kodväg och inte fylla produktionsloggen.
 */

const INTENTIONAL_DROPS = Object.freeze({
  // fält → skäl. Varje rad är ett medvetet beslut, inte ett olycksfall.
  name: 'legacy alias — konsumeras för att härleda displayName/firstName/lastName, sparas aldrig som egen nyckel',
  actor: 'transient — konsumeras för att härleda createdBy/updatedBy, sparas aldrig som egen nyckel',
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isEnabled(env = process.env) {
  return String(env && env.NODE_ENV).toLowerCase() !== 'production';
}

/**
 * Nycklar i `input` som inte finns i `output`, minus undantagslistan.
 * @returns {string[]}
 */
function droppedKeys(input = {}, output = {}, { exceptions = INTENTIONAL_DROPS } = {}) {
  const inKeys = Object.keys(asObject(input));
  const outKeys = new Set(Object.keys(asObject(output)));
  const dropped = [];
  for (const key of inKeys) {
    if (outKeys.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(exceptions, key)) continue;
    dropped.push(key);
  }
  return dropped;
}

/**
 * Rapportera bortfallna fält (dev/test). Returnerar de bortfallna nycklarna så
 * anroparen kan mäta; i produktion är den en no-op och returnerar [].
 *
 * @param {object} input   indata till normaliseraren
 * @param {object} output  det byggda (normaliserade) objektet
 * @param {object} [meta]  { store, normalizer, env, exceptions }
 */
function reportDroppedKeys(input, output, meta = {}) {
  if (!isEnabled(meta.env)) return [];
  const dropped = droppedKeys(input, output, { exceptions: meta.exceptions });
  if (!dropped.length) return [];
  const store = meta.store || 'store';
  const normalizer = meta.normalizer || 'normalize';
  for (const key of dropped) {
    // eslint-disable-next-line no-console
    console.warn(`[normalizer-drop] ${store}.${normalizer} kastar fält: "${key}"`);
  }
  return dropped;
}

module.exports = {
  INTENTIONAL_DROPS,
  droppedKeys,
  isEnabled,
  reportDroppedKeys,
};
