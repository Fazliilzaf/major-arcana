#!/usr/bin/env node
'use strict';

/**
 * merge-legacy-tenant.js
 *
 * Konsoliderar legacy-tenant `hairtp-clinic` → target-tenant `hair_tp`.
 *
 * Användning:
 *   node scripts/merge-legacy-tenant.js                    # dry-run (default)
 *   node scripts/merge-legacy-tenant.js --commit            # gör faktisk merge
 *   node scripts/merge-legacy-tenant.js --legacy=X --target=Y --commit
 *
 * Regler (per `.cursor/rules/cco-journal-cutover-first.mdc`):
 *   - INGEN auto-merge utan namn + (email ELLER phone) match
 *   - Identisk match (email/phone) i target → target wins, legacy skip:as
 *   - Legacy-only (ingen match i target) → kopieras till target,
 *     MEN om legacy är flaggad som demo-data → går till `data/legacy-demo-quarantine.json`
 *   - Conflict (delvis match) → flagga i `data/migration-review-queue.json`
 *   - Atomic write (tmp + rename)
 *   - Backup INNAN destruktiv skrivning (verifiera att operatören redan tagit
 *     pre-split-brain-fix-backup).
 *
 * Counts-only output (ingen PII i stdout).
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CUSTOMERS_FILE = path.join(REPO_ROOT, 'data', 'cco-customers.json');
const REVIEW_QUEUE = path.join(REPO_ROOT, 'data', 'migration-review-queue.json');
const DEMO_QUARANTINE = path.join(REPO_ROOT, 'data', 'legacy-demo-quarantine.json');

const DEMO_DOMAINS = new Set(['demo.hairtpclinic.com', 'example.com', 'test.com']);

function parseArgs(argv) {
  const args = { commit: false, legacy: 'hairtp-clinic', target: 'hair_tp' };
  for (const a of argv.slice(2)) {
    if (a === '--commit') args.commit = true;
    else if (a.startsWith('--legacy=')) args.legacy = a.slice('--legacy='.length);
    else if (a.startsWith('--target=')) args.target = a.slice('--target='.length);
  }
  return args;
}

function normalizeEmail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}
function normalizePhone(v) {
  return typeof v === 'string' ? v.replace(/[^\d+]/g, '') : '';
}
function normalizeName(v) {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function isDemoEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  return DEMO_DOMAINS.has(e.slice(at + 1));
}

function collectIds(directoryEntry, detailsEntry) {
  const emails = new Set();
  const phones = new Set();
  const names = new Set();
  const det = detailsEntry || {};
  const dir = directoryEntry || {};
  for (const e of det.emails || []) {
    const n = normalizeEmail(e);
    if (n) emails.add(n);
  }
  if (det.phone) {
    const n = normalizePhone(det.phone);
    if (n) phones.add(n);
  }
  if (dir.name) {
    const n = normalizeName(dir.name);
    if (n) names.add(n);
  }
  return { emails, phones, names };
}

function buildLookup(state) {
  const dir = state.directory || {};
  const det = state.details || {};
  const byEmail = new Map();
  const byPhone = new Map();
  const byName = new Map();
  for (const k of Object.keys(dir)) {
    const ids = collectIds(dir[k], det[k]);
    for (const e of ids.emails) {
      if (!byEmail.has(e)) byEmail.set(e, new Set());
      byEmail.get(e).add(k);
    }
    for (const p of ids.phones) {
      if (!byPhone.has(p)) byPhone.set(p, new Set());
      byPhone.get(p).add(k);
    }
    for (const n of ids.names) {
      if (!byName.has(n)) byName.set(n, new Set());
      byName.get(n).add(k);
    }
  }
  return { byEmail, byPhone, byName };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function decideDisposition(legacyIds, isDemo, targetLookup) {
  // Find target candidates
  const targetCandidates = new Set();
  let matchVia = [];
  for (const e of legacyIds.emails) {
    const tk = targetLookup.byEmail.get(e);
    if (tk) {
      for (const k of tk) targetCandidates.add(k);
      matchVia.push('email');
    }
  }
  for (const p of legacyIds.phones) {
    const tk = targetLookup.byPhone.get(p);
    if (tk) {
      for (const k of tk) targetCandidates.add(k);
      matchVia.push('phone');
    }
  }
  for (const n of legacyIds.names) {
    const tk = targetLookup.byName.get(n);
    if (tk) {
      for (const k of tk) targetCandidates.add(k);
      matchVia.push('name');
    }
  }

  if (targetCandidates.size === 0) {
    // No match in target
    if (isDemo) return { type: 'quarantine_demo', reason: 'no_target_match_synthetic_data' };
    return { type: 'copy_to_target', reason: 'legacy_only_real_identity' };
  }
  if (targetCandidates.size > 1) {
    return {
      type: 'review_queue',
      reason: 'multi_match',
      candidateCount: targetCandidates.size,
      via: [...new Set(matchVia)],
    };
  }
  // single match
  const strong = matchVia.includes('email') || matchVia.includes('phone');
  if (strong && matchVia.includes('name')) {
    return { type: 'skip_target_wins', reason: 'identical_match', via: [...new Set(matchVia)] };
  }
  if (strong) {
    return { type: 'skip_target_wins', reason: 'strong_match', via: [...new Set(matchVia)] };
  }
  // name-only single match → review
  return { type: 'review_queue', reason: 'name_only_single_match', via: [...new Set(matchVia)] };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`merge-legacy-tenant: legacy=${args.legacy} → target=${args.target}, commit=${args.commit}`);

  const data = await readJson(CUSTOMERS_FILE);
  if (!data) {
    console.error('Saknar data/cco-customers.json.');
    process.exit(1);
  }
  const target = data.tenants?.[args.target]?.customerState;
  const legacy = data.tenants?.[args.legacy]?.customerState;
  if (!target || !legacy) {
    console.error('Saknar target eller legacy tenant.');
    process.exit(1);
  }

  // Säkerhetsbälte: kräv backup-fil
  const dataFiles = await fs.readdir(path.join(REPO_ROOT, 'data'));
  const hasBackup = dataFiles.some((f) => f.startsWith('cco-customers.pre-split-brain-fix-'));
  if (!hasBackup && args.commit) {
    console.error(
      'Backup saknas. Skapa med: cp data/cco-customers.json data/cco-customers.pre-split-brain-fix-$(date +%Y%m%d-%H%M%S).json'
    );
    process.exit(1);
  }

  const targetLookup = buildLookup(target);

  const counts = {
    legacyTotal: Object.keys(legacy.directory || {}).length,
    copyToTarget: 0,
    skipTargetWins: 0,
    quarantineDemo: 0,
    reviewQueue: 0,
  };

  const reviewItems = [];
  const quarantineItems = [];
  const copyItems = []; // (legacyKey, dispositions)

  for (const lk of Object.keys(legacy.directory || {})) {
    const dir = legacy.directory[lk];
    const det = legacy.details?.[lk];
    const ids = collectIds(dir, det);

    const isDemo = [...ids.emails].some(isDemoEmail);
    const decision = decideDisposition(ids, isDemo, targetLookup);

    if (decision.type === 'copy_to_target') {
      counts.copyToTarget++;
      copyItems.push({ legacyKey: lk });
    } else if (decision.type === 'skip_target_wins') {
      counts.skipTargetWins++;
    } else if (decision.type === 'quarantine_demo') {
      counts.quarantineDemo++;
      quarantineItems.push({
        legacyKey: lk,
        reason: decision.reason,
        keyHash: crypto.createHash('sha256').update(lk).digest('hex').slice(0, 16),
        isDemoEmail: isDemo,
      });
    } else if (decision.type === 'review_queue') {
      counts.reviewQueue++;
      reviewItems.push({
        legacyKey: lk,
        legacyTenant: args.legacy,
        targetTenant: args.target,
        reason: decision.reason,
        matchVia: decision.via,
        candidateCount: decision.candidateCount || 1,
        keyHash: crypto.createHash('sha256').update(lk).digest('hex').slice(0, 16),
        addedAt: new Date().toISOString(),
      });
    }
  }

  console.log('\nDisposition counts:');
  console.log(JSON.stringify(counts, null, 2));

  if (!args.commit) {
    console.log('\n[DRY-RUN] Ingen skrivning. Kör med --commit för att applicera.');
    return;
  }

  // --commit path
  // 1. Update review queue
  if (reviewItems.length > 0) {
    const existing = (await readJson(REVIEW_QUEUE, { items: [] })) || { items: [] };
    existing.items = [...(existing.items || []), ...reviewItems];
    existing.updatedAt = new Date().toISOString();
    await writeJsonAtomic(REVIEW_QUEUE, existing);
    console.log(`Review queue: +${reviewItems.length} items → ${path.relative(REPO_ROOT, REVIEW_QUEUE)}`);
  }

  // 2. Write quarantine file
  if (quarantineItems.length > 0) {
    const existing = (await readJson(DEMO_QUARANTINE, { items: [] })) || { items: [] };
    existing.items = [...(existing.items || []), ...quarantineItems];
    existing.updatedAt = new Date().toISOString();
    existing.legacyTenant = args.legacy;
    await writeJsonAtomic(DEMO_QUARANTINE, existing);
    console.log(
      `Demo-quarantine: +${quarantineItems.length} items → ${path.relative(REPO_ROOT, DEMO_QUARANTINE)}`
    );
  }

  // 3. Copy legacy-only real-identity records into target tenant
  let actuallyCopied = 0;
  for (const it of copyItems) {
    const lk = it.legacyKey;
    // Generate a target-style key: cliento prefix + hash of legacy-key
    const newKey = `legacy_merge_${crypto.createHash('sha256').update(lk).digest('hex').slice(0, 24)}`;
    if (target.directory[newKey]) continue; // safety
    target.directory[newKey] = JSON.parse(JSON.stringify(legacy.directory[lk] || {}));
    target.details = target.details || {};
    target.details[newKey] = JSON.parse(JSON.stringify(legacy.details?.[lk] || {}));
    if (legacy.identityByKey?.[lk]) {
      target.identityByKey = target.identityByKey || {};
      target.identityByKey[newKey] = JSON.parse(JSON.stringify(legacy.identityByKey[lk]));
    }
    if (legacy.primaryEmailByKey?.[lk]) {
      target.primaryEmailByKey = target.primaryEmailByKey || {};
      target.primaryEmailByKey[newKey] = legacy.primaryEmailByKey[lk];
    }
    if (legacy.profileCounts?.[lk]) {
      target.profileCounts = target.profileCounts || {};
      target.profileCounts[newKey] = legacy.profileCounts[lk];
    }
    actuallyCopied++;
  }

  // 4. Drain legacy tenant: keep the object but clear directory (audit trail)
  // Do NOT delete tenant — keep for audit. Mark as drained.
  data.tenants[args.legacy].drainedAt = new Date().toISOString();
  data.tenants[args.legacy].drainedInto = args.target;
  data.tenants[args.legacy].drainCounts = counts;
  // We do NOT erase legacy data — it stays for audit.
  // Per "Inget ska raderas" rule.

  data.updatedAt = new Date().toISOString();

  await writeJsonAtomic(CUSTOMERS_FILE, data);
  console.log(`\nCommitted. ${actuallyCopied} legacy-only records copied into ${args.target}.`);
  console.log(`Legacy tenant '${args.legacy}' bevarad (drainedAt-flagga satt, ingen data raderad).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fel:', err.message);
    process.exit(1);
  });
}

module.exports = { collectIds, buildLookup, decideDisposition, isDemoEmail };
