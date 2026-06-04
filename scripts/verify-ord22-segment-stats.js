#!/usr/bin/env node
'use strict';

/**
 * verify-ord22-segment-stats.js — lokalt segment-aggregat (counts only, no PII).
 */

const path = require('node:path');
const { computeSegmentStats, loadAssetSignalsIndex } = require('../src/ops/ccoKunderEnrichment');
const { loadKunderBookingIndex } = require('../src/ops/ccoKunderBookingEnrichment');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(require('node:fs').readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const tenantId = process.argv.includes('--tenant')
    ? process.argv[process.argv.indexOf('--tenant') + 1]
    : 'hair_tp';
  const masterPath = path.join(process.cwd(), 'data', 'cco-patient-master.json');
  const state = readJsonSafe(masterPath);
  const patients = state?.tenants?.[tenantId]?.patients || [];
  if (!patients.length) {
    console.log('SKIP: inga patienter i', masterPath);
    process.exit(0);
  }

  const assetIndex = await loadAssetSignalsIndex({}, tenantId);
  const bookingBundle = await loadKunderBookingIndex({}, tenantId, patients);
  const stats = computeSegmentStats(
    patients,
    assetIndex,
    bookingBundle.index,
    bookingBundle.coverage,
    bookingBundle
  );

  const focus = ['active', 'new', 'dormant', 'risk', 'vip'];
  console.log('ORD-22 segment stats (tenant=' + tenantId + ', n=' + patients.length + ')');
  console.log('Booking sources:', JSON.stringify(bookingBundle.sources || {}));
  for (const id of focus) {
    const seg = stats.segments.find((s) => s.id === id);
    const count = seg?.count ?? stats.counts?.[id] ?? 0;
    const pct = patients.length ? ((count / patients.length) * 100).toFixed(1) : '0.0';
    console.log(`  ${id.padEnd(8)}: ${String(count).padStart(5)} (${pct}%)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
