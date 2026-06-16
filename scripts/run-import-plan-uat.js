#!/usr/bin/env node
'use strict';

/**
 * UAT stickprov for HD/FC/journal import plan.
 * Usage: node scripts/run-import-plan-uat.js
 */

require('dotenv').config({ quiet: true });

const { getProdToken, fetchPatient, BASE } = require('./lib/halsoHdProdClient');
const { evaluateHdStickprov } = require('./lib/halsoHdStickprovCheck');

const STICKPROV = [
  { id: '3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12', label: 'Omar Khalid (HD PDF ref)' },
  { id: 'ab645651-d4a4-40ef-b8e3-c8112c7d6baa', label: 'Michael Ohgami (HD mail)' },
  { id: '8ae3f11e-9b41-4257-ab30-922d1d1aa216', label: 'Fahed Abbas' },
  { id: '134562c1-ce60-49a3-82dd-f5489defaf09', label: 'Johan Magnusson (HD PDF)' },
  { id: '2cd06d37-44f7-4ff8-ab1a-35eda42671a7', label: 'Henrik Martinsson' },
];

async function probeAssetDownload(token, assetId) {
  const url = `${BASE}/api/v1/cco/assets/${encodeURIComponent(assetId)}/download?inline=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf,*/*',
    },
    redirect: 'follow',
  });
  return {
    assetId,
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get('content-type') || '',
    bytes: res.ok ? Number(res.headers.get('content-length') || 0) : 0,
  };
}

async function main() {
  const token = getProdToken();
  const results = [];

  for (const row of STICKPROV) {
    try {
      const patient = await fetchPatient(token, row.id);
      results.push({ label: row.label, ...evaluateHdStickprov(patient) });
    } catch (error) {
      results.push({ label: row.label, patientId: row.id, error: error.message || String(error) });
    }
  }

  const omarAsset = '7df18d15-8c4a-4f2e-b6d1-9a3e5f2c1d0a';
  let assetProbe = null;
  try {
    assetProbe = await probeAssetDownload(token, omarAsset);
  } catch (error) {
    assetProbe = { assetId: omarAsset, error: error.message || String(error) };
  }

  const summary = {
    ok: true,
    prodUrl: BASE,
    generatedAt: new Date().toISOString(),
    patients: results,
    omarHdAssetProbe: assetProbe,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
