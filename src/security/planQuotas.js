'use strict';

/**
 * Plan Tiers + Quotas (MT8 stub).
 *
 * Definierar plan-tiers och deras quotas. Används av rate-limit + billing.
 *
 * Future: full Stripe-integration med subscription-events,
 * upgrade/downgrade-flows, usage-based pricing.
 */

const PLAN_TIERS = Object.freeze({
  free: {
    name: 'Free',
    monthlyPrice: 0,
    quotas: {
      capabilityRunsPerMonth: 1000,
      mailboxReadsPerMonth: 5000,
      storageBytes: 100 * 1024 * 1024, // 100 MB
      teamSeats: 2,
      aiSummaryEnabled: true,
      aiAdvancedEnabled: false,
      customBrandingEnabled: false,
      auditRetentionDays: 30,
    },
  },
  starter: {
    name: 'Starter',
    monthlyPrice: 290,
    quotas: {
      capabilityRunsPerMonth: 10000,
      mailboxReadsPerMonth: 50000,
      storageBytes: 1 * 1024 * 1024 * 1024, // 1 GB
      teamSeats: 5,
      aiSummaryEnabled: true,
      aiAdvancedEnabled: true,
      customBrandingEnabled: true,
      auditRetentionDays: 90,
    },
  },
  pro: {
    name: 'Pro',
    monthlyPrice: 990,
    quotas: {
      capabilityRunsPerMonth: 50000,
      mailboxReadsPerMonth: 250000,
      storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      teamSeats: 20,
      aiSummaryEnabled: true,
      aiAdvancedEnabled: true,
      customBrandingEnabled: true,
      auditRetentionDays: 365,
    },
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: -1, // Custom
    quotas: {
      capabilityRunsPerMonth: -1, // Unlimited
      mailboxReadsPerMonth: -1,
      storageBytes: -1,
      teamSeats: -1,
      aiSummaryEnabled: true,
      aiAdvancedEnabled: true,
      customBrandingEnabled: true,
      auditRetentionDays: 2555, // 7 år
    },
  },
});

function getPlanTier(planTierName = 'free') {
  const safe = String(planTierName || 'free').toLowerCase();
  return PLAN_TIERS[safe] || PLAN_TIERS.free;
}

function getQuota(planTierName, quotaKey) {
  const tier = getPlanTier(planTierName);
  return tier.quotas[quotaKey];
}

/**
 * Kontrollera om en operation är tillåten enligt plan-quota.
 * @returns { allowed, remaining, limit, planTier }
 */
function checkQuota({ planTier = 'free', usageCount = 0, quotaKey = 'capabilityRunsPerMonth' } = {}) {
  const limit = getQuota(planTier, quotaKey);
  if (limit === -1) {
    return { allowed: true, remaining: Infinity, limit: -1, planTier };
  }
  const remaining = Math.max(0, limit - usageCount);
  return {
    allowed: usageCount < limit,
    remaining,
    limit,
    planTier,
  };
}

function isFeatureEnabled({ planTier = 'free', feature = '' } = {}) {
  const featureKey =
    feature === 'ai-summary' ? 'aiSummaryEnabled'
    : feature === 'ai-advanced' ? 'aiAdvancedEnabled'
    : feature === 'custom-branding' ? 'customBrandingEnabled'
    : null;
  if (!featureKey) return true; // Okänd feature → tillåt
  return getQuota(planTier, featureKey) === true;
}

module.exports = {
  PLAN_TIERS,
  getPlanTier,
  getQuota,
  checkQuota,
  isFeatureEnabled,
};
