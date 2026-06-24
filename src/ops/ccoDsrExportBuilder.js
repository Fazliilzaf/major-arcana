'use strict';

/**
 * ccoDsrExportBuilder.js — bygger en GDPR-export-bundle (art. 15/20) för ett
 * DSR-ärende. Samlar all data en registrerad har rätt till (kunddata, journal,
 * tillgångar/foton, avtal, offerter, samtycken, events) till ett manifest +
 * JSON-bundle och persisterar den i secure storage (utanför repo).
 *
 * Anropas av server.js-routen:
 *   POST /api/v1/cco-dsr/:id/build-export-zip
 *
 * Signatur:
 *   buildDsrExport({ customerId, dsrId, actor, includePhotoBytes, stores })
 *     → {
 *         bundlePath,        // secure-storage-nyckel (eller lokal path)
 *         bundleSha256,      // SHA-256 över bundle-buffern
 *         sizeBytes,         // bundle-storlek i bytes
 *         counts,            // { customers, journals, assets, agreements, offers, consents, events }
 *         manifest,          // sammanställt export-manifest (utan binärer)
 *         generatedAt,
 *         includePhotoBytes,
 *       }
 *
 * `stores` är duck-typed och alla fält är valfria — routen skickar in en
 * blandning av app.locals.* som kan vara undefined. Builder:n sonderar därför
 * efter vanliga metodnamn och tar med det som finns. Foto-/asset-binärer tas
 * endast med när includePhotoBytes === true (annars bara metadata/referens).
 */

const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/**
 * Försök hämta en kunds samlade poster från en store oavsett exakt API.
 * Provar i tur och ordning ett antal vanliga metodnamn med customerId.
 */
async function collectForCustomer(store, customerId, methodNames) {
  if (!store) return [];
  for (const name of methodNames) {
    const fn = store[name];
    if (typeof fn !== 'function') continue;
    try {
      const result = await fn.call(store, customerId);
      const arr = asArray(result).filter((x) => x != null);
      if (arr.length) return arr;
      // En tom array är ett giltigt svar — behåll den men fortsätt inte sondera.
      if (Array.isArray(result)) return arr;
    } catch {
      /* prova nästa metodnamn */
    }
  }
  return [];
}

async function fetchCustomerRecord(store, customerId) {
  if (!store) return null;
  for (const name of ['getById', 'getCustomer', 'get', 'findById', 'getByEmail']) {
    const fn = store[name];
    if (typeof fn !== 'function') continue;
    try {
      const rec = await fn.call(store, customerId);
      if (rec) return rec;
    } catch {
      /* prova nästa */
    }
  }
  return null;
}

async function buildDsrExport({
  customerId,
  dsrId,
  actor = {},
  includePhotoBytes = false,
  stores = {},
} = {}) {
  if (!customerId || typeof customerId !== 'string' || !customerId.trim()) {
    const err = new Error('customerId krävs för buildDsrExport.');
    err.statusCode = 400;
    throw err;
  }
  const cid = customerId.trim();
  const generatedAt = nowIso();

  const {
    customerStore = null,
    journalStore = null,
    assetStore = null,
    agreementStore = null,
    offerStore = null,
    consentStore = null,
    eventStore = null,
    secureStorage = null,
  } = stores || {};

  const customerRecord = await fetchCustomerRecord(customerStore, cid);
  const customers = customerRecord ? [customerRecord] : [];

  const journals = await collectForCustomer(journalStore, cid, [
    'listByCustomer',
    'listForCustomer',
    'getByCustomer',
    'listByPatient',
    'listAllForCustomer',
    'list',
  ]);
  const assets = await collectForCustomer(assetStore, cid, [
    'listByCustomer',
    'listForCustomer',
    'getByCustomer',
    'listByPatient',
    'list',
  ]);
  const agreements = await collectForCustomer(agreementStore, cid, [
    'listByCustomer',
    'listForCustomer',
    'getByCustomer',
    'list',
  ]);
  const offers = await collectForCustomer(offerStore, cid, [
    'listByCustomer',
    'listForCustomer',
    'getByCustomer',
    'list',
  ]);
  const consents = await collectForCustomer(consentStore, cid, [
    'listGranted',
    'listByCustomer',
    'listForCustomer',
    'getByCustomer',
    'list',
  ]);
  const events = await collectForCustomer(eventStore, cid, [
    'listByCustomer',
    'listForCustomer',
    'getByCustomer',
    'list',
  ]);

  // Foto-/asset-binärer: bara om uttryckligen begärt OCH secure storage finns.
  const assetPayloads = [];
  if (includePhotoBytes && secureStorage && typeof secureStorage.getObject === 'function') {
    for (const asset of assets) {
      const key =
        asset && (asset.storageKey || asset.secureStorageKey || asset.key || asset.objectKey);
      if (!key) continue;
      try {
        const obj = await secureStorage.getObject(key);
        const buf = obj && (obj.buffer || (Buffer.isBuffer(obj) ? obj : null));
        assetPayloads.push({
          storageKey: key,
          assetId: asset.assetId || asset.id || null,
          mimeType: obj?.mimeType || asset.mimeType || 'application/octet-stream',
          sizeBytes: obj?.size ?? (buf ? buf.length : null),
          checksum: obj?.checksum || null,
          base64: buf ? buf.toString('base64') : null,
        });
      } catch {
        assetPayloads.push({ storageKey: key, error: 'unreadable' });
      }
    }
  }

  const counts = {
    customers: customers.length,
    journals: journals.length,
    assets: assets.length,
    agreements: agreements.length,
    offers: offers.length,
    consents: consents.length,
    events: events.length,
    photoBytesIncluded: assetPayloads.length,
  };

  const manifest = {
    schema: 'cco.dsr.export/1',
    dsrId: dsrId || null,
    customerId: cid,
    generatedAt,
    generatedBy: {
      userId: (actor && actor.userId) || null,
      role: (actor && actor.role) || null,
    },
    includePhotoBytes: !!includePhotoBytes,
    counts,
  };

  const bundle = {
    manifest,
    data: {
      customers,
      journals,
      assets,
      agreements,
      offers,
      consents,
      events,
      assetPayloads: includePhotoBytes ? assetPayloads : undefined,
    },
  };

  const bundleBuffer = Buffer.from(JSON.stringify(bundle, null, 2), 'utf8');
  const bundleSha256 = crypto.createHash('sha256').update(bundleBuffer).digest('hex');
  const sizeBytes = bundleBuffer.length;

  // Persistera bundle i secure storage om tillgängligt; annars returnera en
  // logisk path (routen attachar ändå ett manifest separat).
  let bundlePath = `dsr-export/${cid}/${dsrId || 'unscoped'}/${generatedAt}.bundle.json`;
  if (secureStorage && typeof secureStorage.putObject === 'function') {
    try {
      let putResult;
      try {
        putResult = await secureStorage.putObject({
          key: bundlePath,
          body: bundleBuffer,
          contentType: 'application/json',
          metadata: { dsrId: dsrId || null, customerId: cid, kind: 'dsr_export_bundle' },
        });
      } catch {
        putResult = await secureStorage.putObject(bundlePath, bundleBuffer, {
          mimeType: 'application/json',
        });
      }
      if (putResult && (putResult.storageKey || putResult.key)) {
        bundlePath = putResult.storageKey || putResult.key;
      }
    } catch {
      /* persistens är best-effort — behåll logisk path */
    }
  }

  return {
    bundlePath,
    bundleSha256,
    sizeBytes,
    counts,
    manifest,
    generatedAt,
    includePhotoBytes: !!includePhotoBytes,
  };
}

module.exports = { buildDsrExport };
