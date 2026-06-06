'use strict';

/**
 * Phase 1 — m365_halso PDF-katalog (~1660) från prod asset snapshot.
 * Filtrerar enligt ORD-29 / ccoKunderEnrichment.isHealthDeclarationAsset.
 */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { isHealthDeclarationAsset } = require('../../src/ops/ccoKunderEnrichment');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
}

function resolveAssetsPath(explicitPath = '') {
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.ARCANA_CCO_PATIENT_ASSETS_PATH) {
    return path.resolve(process.env.ARCANA_CCO_PATIENT_ASSETS_PATH);
  }
  return path.join(prodDataRoot(), 'cco-patient-assets.json');
}

function isPdfAsset(asset = {}) {
  const mime = normalizeText(asset.mimeType).toLowerCase();
  if (mime.includes('pdf')) return true;
  const name = normalizeText(asset.originalFileName).toLowerCase();
  return name.endsWith('.pdf');
}

function isPhase1HalsoAsset(asset = {}) {
  const source = normalizeText(asset.sourceSystem).toLowerCase();
  if (source !== 'm365_halso') return false;
  if (!isPdfAsset(asset)) return false;
  return isHealthDeclarationAsset(asset);
}

async function loadProdAssetItems(assetsPath = '') {
  const filePath = resolveAssetsPath(assetsPath);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.assets)) return parsed.assets;
  return [];
}

function toCatalogEntry(asset = {}) {
  return {
    assetId: normalizeText(asset.id),
    patientId: normalizeText(asset.patientId),
    sourceSystem: normalizeText(asset.sourceSystem),
    category: normalizeText(asset.category),
    mimeType: normalizeText(asset.mimeType),
    checksum: normalizeText(asset.checksum),
    originalFileName: normalizeText(asset.originalFileName),
    documentDate: normalizeText(asset.documentDate),
    status: normalizeText(asset.status),
    storageKey: normalizeText(asset.storageKey),
  };
}

async function buildPhase1Catalog({ assetsPath = '', tenantId = 'hair-tp-clinic' } = {}) {
  const items = await loadProdAssetItems(assetsPath);
  const entries = [];
  for (const asset of items) {
    if (tenantId && asset.tenantId && asset.tenantId !== tenantId) continue;
    if (!isPhase1HalsoAsset(asset)) continue;
    if (!asset.storageKey) continue;
    entries.push(toCatalogEntry(asset));
  }
  entries.sort((a, b) => String(a.documentDate || '').localeCompare(String(b.documentDate || '')));
  return {
    assetsPath: resolveAssetsPath(assetsPath),
    tenantId,
    totalAssetsInStore: items.length,
    phase1Count: entries.length,
    entries,
  };
}

module.exports = {
  prodDataRoot,
  resolveAssetsPath,
  isPhase1HalsoAsset,
  isPdfAsset,
  loadProdAssetItems,
  buildPhase1Catalog,
  toCatalogEntry,
};
