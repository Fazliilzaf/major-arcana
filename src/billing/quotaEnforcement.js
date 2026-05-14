'use strict';

/**
 * Quota Enforcement — graceful degradation when limits are reached.
 *
 * DXM-princip: systemet säger aldrig bara "blocked". Det säger varför,
 * vad användaren kan göra, och vad som händer i fallback-läge.
 */

const { getPlanTier, checkQuota } = require('../security/planQuotas');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeQuotaStatus({ planTier = 'free', usage = {} } = {}) {
  const plan = getPlanTier(planTier);
  const quotas = plan.quotas || {};

  const metrics = [
    {
      id: 'capabilityRuns',
      label: 'Capability-körningar',
      current: toNumber(usage.capabilityRuns, 0),
      limit: toNumber(quotas.capabilityRunsPerMonth, 1000),
    },
    {
      id: 'mailboxReads',
      label: 'Mailbox-läsningar',
      current: toNumber(usage.mailboxReads, 0),
      limit: toNumber(quotas.mailboxReadsPerMonth, 5000),
    },
    {
      id: 'storage',
      label: 'Lagring',
      current: toNumber(usage.storageBytes, 0),
      limit: toNumber(quotas.storageBytes, 100 * 1024 * 1024),
      unit: 'bytes',
    },
    {
      id: 'teamSeats',
      label: 'Teamplatser',
      current: toNumber(usage.teamSeats, 0),
      limit: toNumber(quotas.teamSeats, 2),
    },
  ];

  return metrics.map((metric) => {
    const unlimited = metric.limit === -1;
    const percentage = unlimited ? 0 : metric.limit > 0 ? Math.round((metric.current / metric.limit) * 100) : 0;
    const remaining = unlimited ? Infinity : Math.max(0, metric.limit - metric.current);
    const blocked = !unlimited && metric.current >= metric.limit;
    const warning = !unlimited && percentage >= 80 && !blocked;

    let forecast = null;
    if (!unlimited && metric.current > 0 && metric.limit > 0) {
      const daysUsed = toNumber(usage.daysSinceReset, 1);
      const dailyRate = metric.current / Math.max(1, daysUsed);
      const daysUntilLimit = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : Infinity;
      forecast = {
        dailyRate: Math.round(dailyRate * 100) / 100,
        daysUntilLimit: Number.isFinite(daysUntilLimit) ? daysUntilLimit : null,
        projectedMonthEnd: Math.round(dailyRate * 30),
      };
    }

    let message = null;
    let action = null;
    if (blocked) {
      message = `${metric.label} har nått gränsen (${metric.current}/${metric.limit}). Uppgradera din plan eller vänta till nästa period.`;
      action = 'upgrade_or_wait';
    } else if (warning) {
      message = `${metric.label} närmar sig gränsen: ${percentage}% använt (${metric.current}/${metric.limit}).`;
      action = forecast?.daysUntilLimit && forecast.daysUntilLimit <= 6
        ? `Du når gränsen om ${forecast.daysUntilLimit} dagar vid nuvarande takt.`
        : 'Överväg uppgradering om förbrukningen fortsätter.';
    }

    return {
      id: metric.id,
      label: metric.label,
      current: metric.current,
      limit: unlimited ? 'unlimited' : metric.limit,
      percentage: unlimited ? 0 : percentage,
      remaining: unlimited ? 'unlimited' : remaining,
      unlimited,
      blocked,
      warning,
      forecast,
      message,
      action,
    };
  });
}

function getGracefulDegradationResponse({ quotaId, planTier }) {
  const responses = {
    capabilityRuns: {
      blocked: true,
      reason: 'Månadskvoten för capability-körningar är nådd.',
      fallback: 'Deterministic-only mode — AI-generering pausad tills nästa period.',
      userAction: 'Uppgradera till en högre plan för fler körningar, eller vänta till nästa månad.',
      upgradeUrl: '/api/v1/billing/portal',
    },
    mailboxReads: {
      blocked: true,
      reason: 'Månadskvoten för mailbox-läsningar är nådd.',
      fallback: 'Mail-sync pausad. Befintlig data tillgänglig men inte uppdaterad.',
      userAction: 'Uppgradera plan eller vänta till nästa period.',
      upgradeUrl: '/api/v1/billing/portal',
    },
    storage: {
      blocked: true,
      reason: 'Lagringsgränsen är nådd.',
      fallback: 'Nya dokument kan inte sparas. Befintlig data opåverkad.',
      userAction: 'Radera gamla backups/rapporter eller uppgradera plan.',
      upgradeUrl: '/api/v1/billing/portal',
    },
    teamSeats: {
      blocked: true,
      reason: 'Alla teamplatser är upptagna.',
      fallback: 'Nya teammedlemmar kan inte bjudas in.',
      userAction: 'Inaktivera en befintlig medlem eller uppgradera plan.',
      upgradeUrl: '/api/v1/billing/portal',
    },
  };

  return responses[quotaId] || {
    blocked: true,
    reason: 'Kvotgräns nådd.',
    fallback: 'Funktionaliteten är tillfälligt begränsad.',
    userAction: 'Kontakta support eller uppgradera plan.',
    upgradeUrl: '/api/v1/billing/portal',
  };
}

module.exports = {
  computeQuotaStatus,
  getGracefulDegradationResponse,
};
