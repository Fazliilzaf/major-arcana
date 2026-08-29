'use strict';

/**
 * ccoStoreAdapter — högljudd store-normalisering (ORD-141 §1).
 *
 * Normaliserar en store till `listByCustomer` / `getByCustomer`. Till skillnad
 * från den gamla tysta `adapt()` i server.js loggar den när:
 *
 *   1. storet saknas helt (null/undefined) — "store_missing".
 *   2. ingen av de efterfrågade metoderna finns — "method_mismatch".
 *
 * En tom lista (storet finns och matchar, men har inga data) och ett saknat
 * store ska därmed gå att skilja åt i loggen — exakt det hål ORD-141 lagar.
 *
 * Loggning får aldrig fälla själva flödet: ett kastande logger är ett no-op.
 */

/**
 * @param {object|null} store Storen som ska normaliseras.
 * @param {string[]} methodCandidates Kandidat-metodnamn, prövas i ordning.
 * @param {{label?:string, logger?:object}} [opts]
 * @returns {object|null}
 *   - `null` när storet saknas helt.
 *   - `{...store, listByCustomer, getByCustomer}` när en metod matchar
 *     (båda alias binds till samma metod, som tidigare adapt).
 *   - `{listByCustomer: () => [], getByCustomer: () => []}` när storet finns
 *     men ingen metod matchar (tomma listor, men nu med larm).
 */
function adaptStore(store, methodCandidates = [], { label = 'store', logger = console } = {}) {
  const candidates = Array.isArray(methodCandidates) ? methodCandidates : [];

  const warn = (message) => {
    try {
      logger?.warn?.(message);
    } catch {
      /* loggning får aldrig fälla flödet */
    }
  };

  if (!store) {
    warn(
      `[cco-store-adapter] ${label}: store saknas (null/undefined) — ` +
        `efterfrågade metoder: [${candidates.join(', ') || 'inga'}]`
    );
    return null;
  }

  for (const method of candidates) {
    if (typeof store[method] === 'function') {
      return {
        ...store,
        listByCustomer: store[method].bind(store),
        getByCustomer: store[method].bind(store),
      };
    }
  }

  warn(
    `[cco-store-adapter] ${label}: ingen metod matchade [${candidates.join(', ') || 'inga'}] — ` +
      `tillgängliga metoder: [${Object.keys(store).join(', ') || 'inga'}]`
  );
  return { listByCustomer: () => [], getByCustomer: () => [] };
}

module.exports = { adaptStore };
