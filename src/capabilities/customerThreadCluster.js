const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isValidEmail(value = '') {
  const email = normalizeText(value).toLowerCase();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(value = '') {
  const email = normalizeText(value).toLowerCase();
  return isValidEmail(email) ? email : '';
}

const UNKNOWN_CUSTOMER_KEYS = new Set(['unknown-customer', 'unknown', '']);

/**
 * Bestäm en stabil kluster-seed per worklist-rad så samma kund får samma grupp
 * oavsett vilken enhet som renderar listan (source of truth i API payload).
 */
function resolveThreadClusterSeed(row = {}) {
  const customerKey = normalizeText(
    row.customerKey || row.customerSummary?.customerKey || ''
  ).toLowerCase();
  if (customerKey && !UNKNOWN_CUSTOMER_KEYS.has(customerKey) && !/^unknown/i.test(customerKey)) {
    return { seed: `ck:${customerKey}`, eligible: true, seedKind: 'customer_key' };
  }
  const email = normalizeEmail(
    row.customerEmail ||
      row.customerSummary?.customerEmail ||
      row.customerSummary?.primaryEmail ||
      ''
  );
  if (email) {
    return { seed: `em:${email}`, eligible: true, seedKind: 'customer_email' };
  }
  return { seed: '', eligible: false, seedKind: 'none' };
}

function digestGroupId(tenantId, seed) {
  const safeTenant = normalizeText(tenantId) || '_global';
  return crypto.createHash('sha256').update(`${safeTenant}|${seed}`).digest('hex').slice(0, 20);
}

/**
 * Annoterar redan sorterade worklist-rader med customerCluster-metadata.
 * Första förekomsten av en seed i listan blir primary (samma semantik som tidigare
 * DOM-ordning i customer-cluster.js).
 *
 * @param {object[]} rows
 * @param {{ tenantId?: string }} [options]
 */
function annotateCustomerThreadClusters(rows, { tenantId = '' } = {}) {
  const list = asArray(rows);
  const seedOrder = [];
  const seedBuckets = new Map();

  list.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const { seed, eligible } = resolveThreadClusterSeed(row);
    if (!eligible || !seed) return;
    if (!seedBuckets.has(seed)) {
      seedBuckets.set(seed, []);
      seedOrder.push(seed);
    }
    seedBuckets.get(seed).push(row);
  });

  for (const row of list) {
    if (row && typeof row === 'object' && row.customerCluster) {
      delete row.customerCluster;
    }
  }

  for (const seed of seedOrder) {
    const bucket = seedBuckets.get(seed) || [];
    if (bucket.length < 2) continue;
    const groupId = `ccgrp_${digestGroupId(tenantId, seed)}`;
    const seedKind = resolveThreadClusterSeed(bucket[0] || {}).seedKind;
    bucket.forEach((row, ordinal) => {
      row.customerCluster = {
        groupId,
        role: ordinal === 0 ? 'primary' : 'member',
        groupSize: bucket.length,
        ordinal,
        seedKind,
      };
    });
  }
}

module.exports = {
  annotateCustomerThreadClusters,
  resolveThreadClusterSeed,
};
