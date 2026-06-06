'use strict';

/**
 * Förbered prod asset-store + rsync-manifest för halso@ Phase 1 steg 2.
 * Patchar patientId från Phase 1 dedup (prod UUID) — rör INTE patient-master.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function buildAssetIdPatientMap(dedupState = {}) {
  const map = new Map();
  for (const entry of Object.values(dedupState.entries || {})) {
    if (entry?.assetId && entry?.patientId) {
      map.set(entry.assetId, entry.patientId);
    }
  }
  return map;
}

async function buildProdAssetStorePayload({
  localAssetsPath,
  dedupPath,
  tenantId = 'hair-tp-clinic',
} = {}) {
  const local = await readJson(localAssetsPath, null);
  if (!local?.items) throw new Error(`Ogiltig lokal asset store: ${localAssetsPath}`);

  const dedup = await readJson(dedupPath, { entries: {} });
  const patientMap = buildAssetIdPatientMap(dedup);

  const items = { ...local.items };
  let patchedPatientIds = 0;
  let m365Count = 0;
  let m365WithStorage = 0;

  for (const [id, asset] of Object.entries(items)) {
    if (normalizeText(asset.sourceSystem).toLowerCase() !== 'm365_halso') continue;
    m365Count += 1;
    if (asset.storageKey && asset.storageKey !== 'pending-no-binary') m365WithStorage += 1;

    const prodPatientId = patientMap.get(id);
    if (prodPatientId) {
      items[id] = {
        ...asset,
        patientId: prodPatientId,
        tenantId: asset.tenantId || tenantId,
      };
      patchedPatientIds += 1;
    }
  }

  return {
    payload: {
      ...local,
      updatedAt: new Date().toISOString(),
      items,
    },
    stats: {
      totalItems: Object.keys(items).length,
      m365Count,
      m365WithStorage,
      patchedPatientIds,
      dedupMappedAssets: patientMap.size,
    },
  };
}

async function buildM365RsyncManifest({ localAssetsPath, outPath } = {}) {
  const local = await readJson(localAssetsPath, null);
  if (!local?.items) throw new Error(`Ogiltig lokal asset store: ${localAssetsPath}`);

  const lines = [];
  for (const asset of Object.values(local.items)) {
    if (normalizeText(asset.sourceSystem).toLowerCase() !== 'm365_halso') continue;
    const key = normalizeText(asset.storageKey);
    if (!key || key === 'pending-no-binary') continue;
    lines.push(key);
  }

  const unique = [...new Set(lines)].sort();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${unique.join('\n')}\n`, 'utf8');
  return { manifestPath: outPath, fileCount: unique.length };
}

const STICKPROV_DEFAULT = Object.freeze([
  {
    label: 'stickprov-1',
    patientId: 'd58e0ffa-adbd-46bb-b4f3-686b24c8a283',
    assetId: '4f42bd0c-0f94-44c2-9895-e674c5469531',
  },
  {
    label: 'stickprov-2',
    patientId: '03c8a190-44fc-456a-9e21-6127b226d72f',
    assetId: '683aef21-6b0d-48f2-a14f-e6f5996e9459',
  },
  {
    label: 'stickprov-3',
    patientId: '39bd4da4-ea8f-4374-810a-60eae20b5329',
    assetId: '9094167b-fd5e-4e38-828a-c2e53785ee38',
  },
]);

async function verifyStickprovFilesOnProd({ baseUrl, token, stickprov = STICKPROV_DEFAULT } = {}) {
  const results = [];
  for (const row of stickprov) {
    const listRes = await fetch(
      `${baseUrl}/api/v1/cco/patients/${encodeURIComponent(row.patientId)}/assets`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const listPayload = await listRes.json().catch(() => ({}));
    const items = Array.isArray(listPayload.items) ? listPayload.items : [];
    const assetOnPatient = items.some((item) => item.id === row.assetId);

    const dlRes = await fetch(
      `${baseUrl}/api/v1/cco/assets/${encodeURIComponent(row.assetId)}/download?inline=1`,
      {
        headers: {
          Accept: 'application/pdf,*/*',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const contentType = dlRes.headers.get('content-type') || '';
    const size = Number(dlRes.headers.get('content-length') || 0);
    const pdfOk =
      dlRes.ok &&
      (contentType.includes('pdf') || contentType.includes('octet-stream')) &&
      size > 1000;

    results.push({
      ...row,
      listStatus: listRes.status,
      assetsOnPatient: items.length,
      assetListedOnPatient: assetOnPatient,
      downloadStatus: dlRes.status,
      contentType,
      size,
      pass: assetOnPatient && pdfOk,
    });
  }
  return {
    ok: results.every((row) => row.pass),
    results,
  };
}

module.exports = {
  STICKPROV_DEFAULT,
  buildAssetIdPatientMap,
  buildProdAssetStorePayload,
  buildM365RsyncManifest,
  verifyStickprovFilesOnProd,
};
