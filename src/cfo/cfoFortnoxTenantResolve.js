'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHairTpTenantFamily(tenantId = '') {
  const normalized = normalizeText(tenantId).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('hairtp') ||
    normalized.includes('hair-tp') ||
    normalized.includes('hair_tp')
  );
}

function fortnoxTenantCandidates(tenantId = '') {
  const base = normalizeText(tenantId);
  const rows = [base];
  if (base.includes('-')) rows.push(base.replace(/-/g, '_'));
  if (base.includes('_')) rows.push(base.replace(/_/g, '-'));
  if (isHairTpTenantFamily(base)) {
    rows.push('hair-tp-clinic', 'hair_tp', 'hairtp-clinic', 'hairtpclinic');
  }
  return [...new Set(rows.filter(Boolean))];
}

async function resolveConnectedFortnoxTenantId(fortnoxStore, tenantId = '') {
  if (!fortnoxStore?.getPublicStatus) return normalizeText(tenantId);
  for (const candidate of fortnoxTenantCandidates(tenantId)) {
    const status = await fortnoxStore.getPublicStatus({ tenantId: candidate });
    if (status?.connected) return candidate;
  }
  return normalizeText(tenantId);
}

module.exports = {
  fortnoxTenantCandidates,
  resolveConnectedFortnoxTenantId,
};
