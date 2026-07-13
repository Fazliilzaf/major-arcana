function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function recordTenantAccessCheck({
  authStore,
  tenantId,
  actorUserId = null,
  trigger = 'unknown',
} = {}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    throw new Error('authStore saknas');
  }
  const resolvedTenantId = normalizeText(tenantId);
  if (!resolvedTenantId) {
    throw new Error('tenantId saknas');
  }

  await authStore.addAuditEvent({
    tenantId: resolvedTenantId,
    actorUserId: actorUserId || null,
    action: 'tenants.access_check',
    outcome: 'success',
    targetType: 'tenant',
    targetId: resolvedTenantId,
    metadata: {
      trigger: normalizeText(trigger) || 'unknown',
      actorType: actorUserId ? 'user' : 'system_auto',
    },
  });

  return {
    ok: true,
    tenantId: resolvedTenantId,
  };
}

module.exports = {
  recordTenantAccessCheck,
};
