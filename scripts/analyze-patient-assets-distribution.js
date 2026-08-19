#!/usr/bin/env node
/**
 * Read-only analys av cco-patient-assets.json.
 *
 * Mäter:
 * - fördelning per fält (bytes i JSON-serialiserad form)
 * - postålder (createdAt / updatedAt / statusHistory-dateringar)
 * - histogram över poststorlek
 * - statusHistory-detaljer: andel poster med historik, entries per post, ålder
 *
 * Kör i Render-shellet:
 *   node scripts/analyze-patient-assets-distribution.js /var/data/cco-patient-assets.json
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function formatBytes(bytes) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function formatNumber(n) {
  return n.toLocaleString('sv-SE');
}

function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}

function parseIsoToMs(value) {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function bucketAgeDays(ageDays) {
  if (ageDays < 7) return '<7d';
  if (ageDays < 30) return '7-30d';
  if (ageDays < 90) return '30-90d';
  if (ageDays < 180) return '90-180d';
  if (ageDays < 365) return '180-365d';
  return '>365d';
}

function bucketSizeKb(sizeBytes) {
  const kb = sizeBytes / 1024;
  if (kb < 1) return '<1KB';
  if (kb < 2) return '1-2KB';
  if (kb < 4) return '2-4KB';
  if (kb < 8) return '4-8KB';
  if (kb < 16) return '8-16KB';
  if (kb < 32) return '16-32KB';
  if (kb < 64) return '32-64KB';
  return '>64KB';
}

async function main() {
  const filePath = process.argv[2] || '/var/data/cco-patient-assets.json';
  const resolved = path.resolve(filePath);

  console.log(`Analyserar: ${resolved}`);
  const stat = fs.statSync(resolved);
  console.log(`Filstorlek: ${formatBytes(stat.size)}`);

  const raw = fs.readFileSync(resolved, 'utf8');
  const data = JSON.parse(raw);
  const items = data && typeof data === 'object' ? Object.values(data.items || data) : [];
  const assets = items.filter((item) => item && typeof item === 'object' && item.id);

  console.log(`\nPoster totalt: ${formatNumber(assets.length)}`);

  const nowMs = Date.now();

  // ── Fältfördelning ─────────────────────────────────────────────────────────
  const fieldBytes = {};
  for (const asset of assets) {
    for (const [key, value] of Object.entries(asset)) {
      const bytes = estimateJsonBytes(value);
      fieldBytes[key] = (fieldBytes[key] || 0) + bytes;
    }
  }

  const sortedFields = Object.entries(fieldBytes)
    .sort((a, b) => b[1] - a[1])
    .map(([key, bytes]) => ({
      field: key,
      bytes,
      percent: ((bytes / stat.size) * 100).toFixed(1),
    }));

  console.log('\n=== Fältfördelning (JSON-bytes) ===');
  for (const { field, bytes, percent } of sortedFields.slice(0, 20)) {
    console.log(`${field.padEnd(24)} ${formatBytes(bytes).padStart(12)}  ${percent.padStart(5)}%`);
  }

  // ── Poststorlekshistogram ──────────────────────────────────────────────────
  const sizeHistogram = {};
  for (const asset of assets) {
    const bytes = estimateJsonBytes(asset);
    const bucket = bucketSizeKb(bytes);
    sizeHistogram[bucket] = (sizeHistogram[bucket] || 0) + 1;
  }

  console.log('\n=== Poststorleksfördelning ===');
  const sizeOrder = ['<1KB', '1-2KB', '2-4KB', '4-8KB', '8-16KB', '16-32KB', '32-64KB', '>64KB'];
  for (const bucket of sizeOrder) {
    const count = sizeHistogram[bucket] || 0;
    if (count === 0) continue;
    const bar = '█'.repeat(Math.min(50, Math.ceil(count / assets.length * 200)));
    console.log(`${bucket.padEnd(8)} ${formatNumber(count).padStart(8)}  ${bar}`);
  }

  // ── Åldersfördelning per createdAt/updatedAt ───────────────────────────────
  const createdAtBuckets = {};
  const updatedAtBuckets = {};
  let withCreatedAt = 0;
  let withUpdatedAt = 0;

  for (const asset of assets) {
    const createdMs = parseIsoToMs(asset.createdAt);
    if (createdMs !== null) {
      withCreatedAt += 1;
      const bucket = bucketAgeDays((nowMs - createdMs) / (24 * 60 * 60 * 1000));
      createdAtBuckets[bucket] = (createdAtBuckets[bucket] || 0) + 1;
    }
    const updatedMs = parseIsoToMs(asset.updatedAt);
    if (updatedMs !== null) {
      withUpdatedAt += 1;
      const bucket = bucketAgeDays((nowMs - updatedMs) / (24 * 60 * 60 * 1000));
      updatedAtBuckets[bucket] = (updatedAtBuckets[bucket] || 0) + 1;
    }
  }

  console.log('\n=== Ålder per createdAt ===');
  const ageOrder = ['<7d', '7-30d', '30-90d', '90-180d', '180-365d', '>365d'];
  for (const bucket of ageOrder) {
    const count = createdAtBuckets[bucket] || 0;
    console.log(`${bucket.padEnd(8)} ${formatNumber(count).padStart(8)}`);
  }
  console.log(`Har createdAt: ${formatNumber(withCreatedAt)} / ${formatNumber(assets.length)}`);

  console.log('\n=== Ålder per updatedAt ===');
  for (const bucket of ageOrder) {
    const count = updatedAtBuckets[bucket] || 0;
    console.log(`${bucket.padEnd(8)} ${formatNumber(count).padStart(8)}`);
  }
  console.log(`Har updatedAt: ${formatNumber(withUpdatedAt)} / ${formatNumber(assets.length)}`);

  // ── statusHistory-detaljer ─────────────────────────────────────────────────
  let withStatusHistory = 0;
  let totalHistoryEntries = 0;
  let historyBytes = 0;
  const entriesPerPost = {};
  const historyAgeDays = [];

  for (const asset of assets) {
    const history = Array.isArray(asset.statusHistory) ? asset.statusHistory : [];
    if (history.length === 0) continue;
    withStatusHistory += 1;
    totalHistoryEntries += history.length;
    historyBytes += estimateJsonBytes(history);

    const bucket = history.length < 5 ? String(history.length) : history.length < 10 ? '5-9' : history.length < 20 ? '10-19' : '20+';
    entriesPerPost[bucket] = (entriesPerPost[bucket] || 0) + 1;

    for (const entry of history) {
      const ts = parseIsoToMs(entry && entry.timestamp);
      if (ts !== null) {
        historyAgeDays.push((nowMs - ts) / (24 * 60 * 60 * 1000));
      }
    }
  }

  console.log('\n=== statusHistory ===');
  console.log(`Poster med statusHistory: ${formatNumber(withStatusHistory)} / ${formatNumber(assets.length)} (${((withStatusHistory / assets.length) * 100).toFixed(1)}%)`);
  console.log(`Entries totalt: ${formatNumber(totalHistoryEntries)}`);
  console.log(`Bytes för statusHistory: ${formatBytes(historyBytes)}`);
  console.log('Entries per post:');
  const entryOrder = ['1', '2', '3', '4', '5-9', '10-19', '20+'];
  for (const bucket of entryOrder) {
    const count = entriesPerPost[bucket] || 0;
    if (count === 0) continue;
    console.log(`  ${bucket.padEnd(5)} ${formatNumber(count).padStart(8)}`);
  }

  if (historyAgeDays.length > 0) {
    historyAgeDays.sort((a, b) => a - b);
    const oldest = historyAgeDays[0];
    const newest = historyAgeDays[historyAgeDays.length - 1];
    const median = historyAgeDays[Math.floor(historyAgeDays.length / 2)];
    console.log(`Äldsta status-entry: ${oldest.toFixed(1)} dagar`);
    console.log(`Nyaste status-entry: ${newest.toFixed(1)} dagar`);
    console.log(`Median ålder: ${median.toFixed(1)} dagar`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
