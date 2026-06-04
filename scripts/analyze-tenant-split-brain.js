#!/usr/bin/env node
'use strict';

/**
 * analyze-tenant-split-brain.js
 *
 * Read-only-analys av split-brain mellan tenant-buckets
 *   - target:  hair_tp        (canonical, ~7257 keys)
 *   - legacy:  hairtp-clinic  (legacy, ~1247 keys)
 *
 * Producerar:
 *   data/split-brain-analysis.json (gitignored — counts only, INGEN PII)
 *
 * Compliance:
 *   - Counts only output (inga namn / pnr / email / telefon i loggar)
 *   - Inga skrivande operationer mot cco-customers.json
 *   - PII-flaggor hash:as för internt jämförelseändamål
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(REPO_ROOT, 'data', 'cco-customers.json');
const OUTPUT = path.join(REPO_ROOT, 'data', 'split-brain-analysis.json');

const TARGET_TENANT = 'hair_tp';
const LEGACY_TENANT = 'hairtp-clinic';

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  // Strip all non-digits except leading +
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned;
}

function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashStr(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function collectIdentifiers(directoryEntry, detailsEntry) {
  const emails = new Set();
  const phones = new Set();
  const names = new Set();

  const det = detailsEntry || {};
  const dir = directoryEntry || {};

  if (Array.isArray(det.emails)) {
    for (const e of det.emails) {
      const n = normalizeEmail(e);
      if (n) emails.add(n);
    }
  }
  if (det.phone) {
    const n = normalizePhone(det.phone);
    if (n && n.length >= 6) phones.add(n);
  }
  if (dir.name) {
    const n = normalizeName(dir.name);
    if (n) names.add(n);
  }
  return { emails, phones, names };
}

function buildLookup(tenantState) {
  const directory = tenantState.directory || {};
  const details = tenantState.details || {};
  const byEmail = new Map(); // email -> Set of keys
  const byPhone = new Map();
  const byName = new Map();

  for (const key of Object.keys(directory)) {
    const ids = collectIdentifiers(directory[key], details[key]);
    for (const e of ids.emails) {
      if (!byEmail.has(e)) byEmail.set(e, new Set());
      byEmail.get(e).add(key);
    }
    for (const p of ids.phones) {
      if (!byPhone.has(p)) byPhone.set(p, new Set());
      byPhone.get(p).add(key);
    }
    for (const n of ids.names) {
      if (!byName.has(n)) byName.set(n, new Set());
      byName.get(n).add(key);
    }
  }
  return { byEmail, byPhone, byName };
}

async function main() {
  const raw = await fs.readFile(SOURCE, 'utf8');
  const data = JSON.parse(raw);

  const targetState = data?.tenants?.[TARGET_TENANT]?.customerState;
  const legacyState = data?.tenants?.[LEGACY_TENANT]?.customerState;

  if (!targetState || !legacyState) {
    console.error('Saknar target eller legacy tenant.');
    process.exit(1);
  }

  const targetDir = targetState.directory || {};
  const legacyDir = legacyState.directory || {};
  const legacyDet = legacyState.details || {};

  const targetKeys = new Set(Object.keys(targetDir));
  const legacyKeys = new Set(Object.keys(legacyDir));

  // 1. Direct key overlap (same key string in both)
  let directKeyOverlap = 0;
  for (const k of legacyKeys) if (targetKeys.has(k)) directKeyOverlap++;

  // 2. Build target lookups
  const targetLookup = buildLookup(targetState);

  // 3. For each legacy key — categorize
  let legacyOnly = 0;
  let matchByEmail = 0;
  let matchByPhone = 0;
  let matchByName = 0;
  let matchByNameAndPhone = 0;
  let matchByNameAndEmail = 0;
  let multiMatchConflict = 0; // legacy matches > 1 target

  let legacyWithEmail = 0;
  let legacyWithPhone = 0;
  let legacyWithName = 0;

  // For conflict tracking (counts only, hashed)
  const conflictTypes = {
    name_disagree_when_email_match: 0,
    phone_disagree_when_email_match: 0,
    email_disagree_when_phone_match: 0,
  };

  for (const lk of legacyKeys) {
    const ids = collectIdentifiers(legacyDir[lk], legacyDet[lk]);
    if (ids.emails.size > 0) legacyWithEmail++;
    if (ids.phones.size > 0) legacyWithPhone++;
    if (ids.names.size > 0) legacyWithName++;

    const matchedTargetKeys = new Set();
    let viaEmail = false;
    let viaPhone = false;
    let viaName = false;

    for (const e of ids.emails) {
      const tk = targetLookup.byEmail.get(e);
      if (tk) {
        for (const k of tk) matchedTargetKeys.add(k);
        viaEmail = true;
      }
    }
    for (const p of ids.phones) {
      const tk = targetLookup.byPhone.get(p);
      if (tk) {
        for (const k of tk) matchedTargetKeys.add(k);
        viaPhone = true;
      }
    }
    for (const n of ids.names) {
      const tk = targetLookup.byName.get(n);
      if (tk) {
        for (const k of tk) matchedTargetKeys.add(k);
        viaName = true;
      }
    }

    if (matchedTargetKeys.size === 0) {
      legacyOnly++;
      continue;
    }
    if (matchedTargetKeys.size > 1) {
      multiMatchConflict++;
    }
    if (viaEmail) matchByEmail++;
    else if (viaPhone) matchByPhone++;
    else if (viaName) matchByName++;
    if (viaName && viaPhone) matchByNameAndPhone++;
    if (viaName && viaEmail) matchByNameAndEmail++;

    // Conflict detection: compare names/phones/emails across matched targets
    for (const tk of matchedTargetKeys) {
      const targetIds = collectIdentifiers(targetDir[tk], targetState.details?.[tk]);
      // If emails match but names disagree (and both have names)
      const emailIntersect = [...ids.emails].some((e) => targetIds.emails.has(e));
      if (emailIntersect) {
        if (ids.names.size && targetIds.names.size) {
          const nameIntersect = [...ids.names].some((n) => targetIds.names.has(n));
          if (!nameIntersect) conflictTypes.name_disagree_when_email_match++;
        }
        if (ids.phones.size && targetIds.phones.size) {
          const phoneIntersect = [...ids.phones].some((p) => targetIds.phones.has(p));
          if (!phoneIntersect) conflictTypes.phone_disagree_when_email_match++;
        }
      }
      const phoneIntersect = [...ids.phones].some((p) => targetIds.phones.has(p));
      if (phoneIntersect) {
        if (ids.emails.size && targetIds.emails.size) {
          const emailIntersect2 = [...ids.emails].some((e) => targetIds.emails.has(e));
          if (!emailIntersect2) conflictTypes.email_disagree_when_phone_match++;
        }
      }
    }
  }

  // Domain-distribution-analys för legacy (för demo-data-detektion)
  const legacyDomainCounts = {};
  for (const lk of legacyKeys) {
    const det = legacyDet[lk] || {};
    for (const e of det.emails || []) {
      const at = String(e).lastIndexOf('@');
      const dom = at < 0 ? '' : String(e).slice(at + 1).toLowerCase().trim();
      legacyDomainCounts[dom] = (legacyDomainCounts[dom] || 0) + 1;
    }
  }
  const totalLegacyEmails = Object.values(legacyDomainCounts).reduce((a, b) => a + b, 0);
  const demoDomains = ['demo.hairtpclinic.com', 'example.com', 'test.com'];
  let demoEmailCount = 0;
  for (const d of demoDomains) demoEmailCount += legacyDomainCounts[d] || 0;
  const demoDataRatio = totalLegacyEmails > 0 ? demoEmailCount / totalLegacyEmails : 0;

  const analysis = {
    generatedAt: new Date().toISOString(),
    source: 'data/cco-customers.json',
    tenants: {
      target: TARGET_TENANT,
      legacy: LEGACY_TENANT,
    },
    counts: {
      targetDirectoryKeys: targetKeys.size,
      legacyDirectoryKeys: legacyKeys.size,
      directKeyOverlap,
      legacyWithEmail,
      legacyWithPhone,
      legacyWithName,
      legacyOnly,
      matchByEmail,
      matchByPhone,
      matchByName,
      matchByNameAndPhone,
      matchByNameAndEmail,
      multiMatchConflict,
    },
    conflictTypes,
    demoDataDetection: {
      totalLegacyEmails,
      demoEmailCount,
      demoDataRatio: Number(demoDataRatio.toFixed(4)),
      legacyDomainBuckets: Object.fromEntries(
        Object.entries(legacyDomainCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
      ),
      isLikelyDemoData: demoDataRatio >= 0.9,
    },
    notes: [
      'Räknat över directory + details i båda tenanterna.',
      'Direct key overlap = samma key-sträng i båda buckets (sannolikt 0 pga olika keying-schema).',
      'Identitets-match = email/phone/name normaliserade + intersection över tenanterna.',
      'Conflict types loggas counts-only utan PII.',
      'isLikelyDemoData = true → legacy-tenant innehåller >= 90% syntetisk demo-data och bör quarantine:as (inte merges in i target).',
    ],
  };

  await fs.writeFile(OUTPUT, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');

  // Counts-only console output
  console.log('Split-brain analys klar.');
  console.log(JSON.stringify(analysis.counts, null, 2));
  console.log('Conflict types:', JSON.stringify(conflictTypes, null, 2));
  console.log(`Resultat skrivet till: ${path.relative(REPO_ROOT, OUTPUT)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fel under analys:', err.message);
    process.exit(1);
  });
}

module.exports = { collectIdentifiers, buildLookup };
