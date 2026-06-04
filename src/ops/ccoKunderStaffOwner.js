'use strict';

const {
  buildOwnerFieldInventory,
  computeOwnerCoverage,
  getPatientOwnerName,
  ownerMatchesAssigned,
} = require('./ccoKunderEnrichment');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Staff context from session user + route actor (no extra DB round-trip).
 */
function buildActorStaffContext(user = null, actor = {}) {
  const u = asObject(user);
  const email = normalizeText(actor.email || u.email);
  const displayName = normalizeText(
    u.displayName || u.name || u.fullName || actor.displayName || actor.staffName
  );
  const meta = asObject(u.metadata);
  const pipedriveOwnerId = normalizeText(
    meta.pipedriveOwnerId || meta.pipedrive_owner_id || u.pipedriveOwnerId
  );
  const staffName = displayName || (email.includes('@') ? email.split('@')[0] : email);

  return {
    email,
    role: actor.role || null,
    userId: normalizeText(actor.userId),
    staffName,
    displayName: displayName || null,
    pipedriveOwnerId: pipedriveOwnerId || null,
  };
}

function buildStaffOwnerCandidates(ctx) {
  const out = [];
  const seen = new Set();
  const push = (source, value) => {
    const v = normalizeText(value);
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ source, value: v });
  };
  push('email', ctx.email);
  push('staffName', ctx.staffName);
  push('displayName', ctx.displayName);
  push('pipedriveOwnerId', ctx.pipedriveOwnerId);
  push('userId', ctx.userId);
  return out;
}

function computeMineMatchReport(patients = [], assignedOwner = '') {
  const owner = normalizeText(assignedOwner);
  if (!owner) {
    return { mineCount: 0, matchRate: 0, sampleSize: patients.length };
  }
  let matches = 0;
  for (const patient of patients) {
    if (ownerMatchesAssigned(getPatientOwnerName(patient), owner)) matches += 1;
  }
  const sampleSize = patients.length;
  return {
    mineCount: matches,
    matchRate: sampleSize ? Math.round((matches / sampleSize) * 1000) / 1000 : 0,
    sampleSize,
  };
}

/**
 * Resolve assignedOwner for Mina kunder: query > best session candidate > none.
 */
function resolveStaffOwnership({
  queryAssigned = '',
  actor = {},
  user = null,
  patients = [],
} = {}) {
  const ctx = buildActorStaffContext(user, actor);
  const inventory = buildOwnerFieldInventory(patients);
  const coverage = computeOwnerCoverage(patients);
  const ownerFieldsFound = inventory.fieldsPresent;

  const query = normalizeText(queryAssigned);
  if (query) {
    const report = computeMineMatchReport(patients, query);
    return {
      assignedOwner: query,
      source: 'query',
      filterStatus: coverage.coverage === 'none' ? 'disabled' : 'real',
      ownerFieldsFound,
      ownerFieldInventory: inventory,
      candidates: buildStaffOwnerCandidates(ctx),
      ...report,
      staffContext: ctx,
    };
  }

  if (coverage.coverage === 'none') {
    return {
      assignedOwner: '',
      source: null,
      filterStatus: 'disabled',
      disabledReason: 'Kräver ägare per kund · P1',
      ownerFieldsFound,
      ownerFieldInventory: inventory,
      candidates: buildStaffOwnerCandidates(ctx),
      mineCount: null,
      matchRate: 0,
      sampleSize: patients.length,
      staffContext: ctx,
    };
  }

  const candidates = buildStaffOwnerCandidates(ctx);
  let best = { assignedOwner: '', source: null, mineCount: 0, matchRate: 0 };

  for (const candidate of candidates) {
    const report = computeMineMatchReport(patients, candidate.value);
    if (report.mineCount > best.mineCount) {
      best = {
        assignedOwner: candidate.value,
        source: candidate.source,
        ...report,
      };
    }
  }

  if (!best.assignedOwner && ctx.email) {
    const report = computeMineMatchReport(patients, ctx.email);
    best = { assignedOwner: ctx.email, source: 'email', ...report };
  }

  const filterStatus = best.assignedOwner ? (best.mineCount > 0 ? 'real' : 'partial') : 'partial';

  return {
    ...best,
    filterStatus,
    disabledReason: best.assignedOwner ? null : 'Kräver ägare per kund · P1',
    ownerFieldsFound,
    ownerFieldInventory: inventory,
    candidates,
    staffContext: ctx,
    sampleSize: patients.length,
  };
}

module.exports = {
  buildActorStaffContext,
  buildStaffOwnerCandidates,
  computeMineMatchReport,
  resolveStaffOwnership,
};
