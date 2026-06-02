'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAILBOX_IDS = [
  'contact@hairtpclinic.com',
  'egzona@hairtpclinic.com',
  'fazli@hairtpclinic.com',
  'marknad@hairtpclinic.com',
];

function repoRoot(fromDir) {
  return path.join(fromDir || __dirname, '..', '..');
}

function loadReferenceSnapshot(root) {
  const refPath = path.join(root, 'config/cco-mail-ambiguous-mailbox-reference.json');
  try {
    if (!fs.existsSync(refPath)) return null;
    return JSON.parse(fs.readFileSync(refPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadPublicMailSnapshots(root) {
  const candidates = [
    path.join(root, 'public/mail-ambiguous-operational-status.json'),
    path.join(root, 'public/cco-presentation-ops-status.json'),
  ];
  for (const filePath of candidates) {
    const raw = loadJsonFile(filePath);
    if (!raw) continue;
    const mail = raw.mailAmbiguous || raw;
    const mailboxCounts = mail.mailboxCounts || mail.mailboxPending || null;
    const remaining = mail.remaining ?? mail.pending ?? mail.ambiguousTotal ?? null;
    if (mailboxCounts || remaining != null) {
      return {
        source: path.basename(filePath),
        ambiguousTotal: mail.ambiguousTotal ?? remaining,
        pending: mail.pending ?? remaining,
        approved: mail.approved ?? 0,
        excluded: mail.excluded ?? 0,
        unresolved: mail.unresolved ?? 0,
        remaining,
        mailboxCounts: mailboxCounts || {},
        operational: mail.operational,
        readyForWork: mail.readyForWork,
        adjustedCoveragePercent: mail.adjustedCoveragePercent,
      };
    }
  }
  return null;
}

function sumMailboxCounts(mailboxCounts) {
  if (!mailboxCounts || typeof mailboxCounts !== 'object') return 0;
  return Object.values(mailboxCounts).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

function isMailboxBreakdownMisleading(mailboxCounts, remaining) {
  const rem = Number(remaining) || 0;
  if (rem <= 0) return false;
  return sumMailboxCounts(mailboxCounts) === 0;
}

function resolveMailboxCounts(mailboxCounts, remaining, reference) {
  const ref = reference?.mailboxCounts || {};
  const resolved = { ...(mailboxCounts || {}) };
  for (const id of MAILBOX_IDS) {
    if (resolved[id] == null || resolved[id] === '') resolved[id] = ref[id] ?? 0;
  }
  return resolved;
}

/**
 * Merge progress with reference/public fallbacks when API returns 0/0/0/0 but remaining≈493.
 */
function normalizeMailProgress(progress, options = {}) {
  const root = options.root || repoRoot(options.fromDir);
  const reference = options.reference || loadReferenceSnapshot(root);
  const publicSnap = options.publicSnap ?? loadPublicMailSnapshots(root);

  let out = { ...(progress || {}) };
  if (publicSnap && (!out.remaining || out.remaining === 0)) {
    out = { ...publicSnap, ...out, source: out.source || `public:${publicSnap.source}` };
  }

  const remaining = Number(out.remaining ?? out.pending ?? out.ambiguousTotal ?? 0);
  let mailboxCounts = out.mailboxCounts || out.mailboxPending || {};

  if (isMailboxBreakdownMisleading(mailboxCounts, remaining)) {
    mailboxCounts = resolveMailboxCounts(mailboxCounts, remaining, reference);
    out.mailboxCounts = mailboxCounts;
    out.mailboxPending = mailboxCounts;
    out.mailboxCountsSource = reference ? 'reference_snapshot' : 'inferred';
    if (!out.source || out.source === 'doc_fallback') {
      out.source = reference ? 'reference_snapshot' : out.source;
    }
  } else {
    out.mailboxCounts = resolveMailboxCounts(mailboxCounts, remaining, reference);
    out.mailboxPending = out.mailboxCounts;
    out.mailboxCountsSource = out.mailboxCountsSource || out.source || 'live';
  }

  if (!out.ambiguousTotal && remaining > 0) out.ambiguousTotal = remaining;
  if (!out.pending && remaining > 0) out.pending = remaining;
  if (!out.remaining && remaining > 0) out.remaining = remaining;

  return out;
}

function publishMailboxReferencePublic(root) {
  const reference = loadReferenceSnapshot(root);
  if (!reference) return;
  const publicPath = path.join(root, 'public/mail-ambiguous-mailbox-reference.json');
  fs.writeFileSync(publicPath, JSON.stringify(reference, null, 2));
}

module.exports = {
  MAILBOX_IDS,
  loadReferenceSnapshot,
  loadPublicMailSnapshots,
  isMailboxBreakdownMisleading,
  resolveMailboxCounts,
  normalizeMailProgress,
  publishMailboxReferencePublic,
  sumMailboxCounts,
};
