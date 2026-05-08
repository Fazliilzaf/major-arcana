'use strict';

/**
 * CcoOperationalKpis (OI1) — operativa nyckeltal för CCO-dashboarden.
 *
 * Aggregerar från ccoHistoryStore.listOutcomes + listActions per tenant.
 * Beräknar:
 *   - throughput (today / yesterday / last7d / last30d)
 *   - dailyTimeseries: array av {date, outcomeCount, actionCount} för senaste 7d (sparkline)
 *   - outcomeBreakdown: { booked, replied, rebooked, ... } counts för senaste 7d
 *   - intentBreakdown: { question, complaint, ... } counts för senaste 7d
 *   - actionTypeBreakdown: { reply_sent, ... } counts för senaste 7d
 *   - topDomains: array av {domain, count} (top 5) av customerEmail-domäner senaste 7d
 *   - alerts: array av {type, severity, message} baserat på tröskelvärden
 *
 * Tröskelvärden (kan override per tenant via tenant-config.alertThresholds):
 *   - outcomeDropPct: > 50 % minskning idag jämfört med 7d-snitt → warning
 *   - emptyDay: 0 outcomes idag och föregående dag inte 0 → warning
 *   - intentSpike: en intent ökar > 200 % idag jämfört med 7d-snitt → info
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function startOfDayMs(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function emailDomain(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at === -1) return null;
  const domain = s.slice(at + 1);
  return domain || null;
}

function bucketByDay(items, dayKeys) {
  const buckets = {};
  for (const key of dayKeys) buckets[key] = 0;
  for (const item of items) {
    const ts = Date.parse(item.recordedAt || item.timestamp || '');
    if (!Number.isFinite(ts)) continue;
    const dayKey = isoDate(startOfDayMs(ts));
    if (buckets[dayKey] !== undefined) buckets[dayKey] += 1;
  }
  return buckets;
}

function distribution(items, fieldName, max = 12) {
  const counts = new Map();
  for (const item of items) {
    const raw = normalizeText(item?.[fieldName]).toLowerCase() || 'unknown';
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function topDomains(items, max = 5) {
  const counts = new Map();
  for (const item of items) {
    const domain = emailDomain(item?.customerEmail);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

function pct(num, denom) {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

const DEFAULT_THRESHOLDS = Object.freeze({
  emptyDayWarning: true,
  throughputDropPct: 50, // varna om dagen är >X % under 7d-snitt
  intentConcentrationPct: 50, // info om en intent är >X % av dagens flöde
  intentMinSampleToday: 5, // minst N outcomes idag innan intent-koll triggar
  minOutcomesToday: 0, // varna om todayCount < N (0 = av)
  minOutcomesLast7d: 0, // varna om last7d < N (0 = av)
});

function resolveThresholds(custom) {
  const merged = { ...DEFAULT_THRESHOLDS };
  if (custom && typeof custom === 'object') {
    for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
      if (custom[key] !== undefined && custom[key] !== null) {
        merged[key] = custom[key];
      }
    }
  }
  return merged;
}

function computeAlerts({ todayCount, yesterdayCount, last7dCount, last7dAvg, intentBreakdown, thresholds }) {
  const alerts = [];
  const T = resolveThresholds(thresholds);

  if (T.emptyDayWarning && todayCount === 0 && yesterdayCount > 0) {
    alerts.push({
      type: 'empty_day',
      severity: 'warning',
      message: 'Inga avslut registrerade idag (igår: ' + yesterdayCount + ').',
    });
  }

  if (Number(T.minOutcomesToday) > 0 && todayCount < Number(T.minOutcomesToday) && yesterdayCount > 0) {
    alerts.push({
      type: 'min_outcomes_today',
      severity: 'warning',
      message:
        'Avslut idag (' +
        todayCount +
        ') är under tröskeln (' +
        T.minOutcomesToday +
        ').',
    });
  }

  if (Number(T.minOutcomesLast7d) > 0 && last7dCount < Number(T.minOutcomesLast7d)) {
    alerts.push({
      type: 'min_outcomes_7d',
      severity: 'warning',
      message:
        'Avslut senaste 7d (' +
        last7dCount +
        ') är under tröskeln (' +
        T.minOutcomesLast7d +
        ').',
    });
  }

  const dropPct = Number(T.throughputDropPct);
  if (
    dropPct > 0 &&
    last7dAvg > 0 &&
    todayCount < last7dAvg * (1 - dropPct / 100) &&
    todayCount < yesterdayCount * (1 - dropPct / 100)
  ) {
    alerts.push({
      type: 'throughput_drop',
      severity: 'warning',
      message:
        'Throughput idag (' +
        todayCount +
        ') är >' +
        dropPct +
        ' % under 7d-snitt (' +
        Math.round(last7dAvg) +
        ').',
    });
  }

  const intentPct = Number(T.intentConcentrationPct);
  if (intentPct > 0 && todayCount >= Number(T.intentMinSampleToday || 5)) {
    for (const item of intentBreakdown) {
      if ((item.count / todayCount) * 100 >= intentPct) {
        alerts.push({
          type: 'intent_concentration',
          severity: 'info',
          message:
            'Intent "' +
            item.key +
            '" är ' +
            pct(item.count, todayCount) +
            ' % av dagens flöde.',
        });
        break;
      }
    }
  }

  return alerts;
}

class CcoOperationalKpisCapability extends BaseCapability {
  static name = 'CcoOperationalKpis';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;
  static persistStrategy = 'none';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      windowDays: { type: 'integer', minimum: 1, maximum: 90 },
      mailboxIds: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', maxLength: 200 },
      },
    },
  };

  static outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'metadata', 'warnings'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: true,
      },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'version', 'channel', 'tenantId'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', maxLength: 120 },
          correlationId: { type: 'string', maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 12,
        items: { type: 'string', minLength: 1, maxLength: 280 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const tenantId = normalizeText(safeContext.tenantId) || 'okand';
    const windowDays = Math.max(1, Math.min(90, Number(input.windowDays) || 7));
    const mailboxIds = Array.isArray(input.mailboxIds) ? input.mailboxIds : [];
    const ccoHistoryStore = safeContext.ccoHistoryStore;
    const tenantConfigStore = safeContext.tenantConfigStore;
    const warnings = [];

    // Hämta per-tenant alert-tröskelvärden om de finns
    let tenantThresholds = null;
    if (tenantConfigStore && typeof tenantConfigStore.getTenantConfig === 'function') {
      try {
        const cfg = await tenantConfigStore.getTenantConfig(tenantId);
        if (cfg && cfg.alertThresholds && typeof cfg.alertThresholds === 'object') {
          tenantThresholds = cfg.alertThresholds;
        }
      } catch (_e) {
        // tyst — använd defaults
      }
    }

    const todayMs = startOfDayMs(Date.now());
    const yesterdayMs = todayMs - 24 * 3600 * 1000;
    const last7dMs = todayMs - 7 * 24 * 3600 * 1000;
    const last30dMs = todayMs - 30 * 24 * 3600 * 1000;
    const sinceIso = new Date(last30dMs).toISOString();

    let outcomes = [];
    let actions = [];

    if (ccoHistoryStore && typeof ccoHistoryStore.listOutcomes === 'function') {
      try {
        outcomes = await ccoHistoryStore.listOutcomes({
          tenantId,
          mailboxIds,
          sinceIso,
        });
      } catch (err) {
        warnings.push('listOutcomes misslyckades: ' + (err.message || 'okänt'));
      }
    } else {
      warnings.push('ccoHistoryStore.listOutcomes saknas — KPI är 0:or.');
    }

    if (ccoHistoryStore && typeof ccoHistoryStore.listActions === 'function') {
      try {
        actions = await ccoHistoryStore.listActions({
          tenantId,
          mailboxIds,
          sinceIso,
        });
      } catch (err) {
        warnings.push('listActions misslyckades: ' + (err.message || 'okänt'));
      }
    }

    // Bucketing
    const dayKeys = [];
    for (let i = windowDays - 1; i >= 0; i -= 1) {
      dayKeys.push(isoDate(todayMs - i * 24 * 3600 * 1000));
    }
    const outcomeBuckets = bucketByDay(outcomes, dayKeys);
    const actionBuckets = bucketByDay(actions, dayKeys);
    const dailyTimeseries = dayKeys.map((day) => ({
      date: day,
      outcomeCount: outcomeBuckets[day] || 0,
      actionCount: actionBuckets[day] || 0,
    }));

    // Counts per period
    const todayOutcomes = outcomes.filter((o) => Date.parse(o.recordedAt) >= todayMs);
    const yesterdayOutcomes = outcomes.filter((o) => {
      const ts = Date.parse(o.recordedAt);
      return ts >= yesterdayMs && ts < todayMs;
    });
    const last7dOutcomes = outcomes.filter((o) => Date.parse(o.recordedAt) >= last7dMs);
    const last30dOutcomes = outcomes.filter((o) => Date.parse(o.recordedAt) >= last30dMs);

    const last7dAvg = last7dOutcomes.length / 7;

    // Breakdowns för senaste 7d
    const outcomeBreakdown = distribution(last7dOutcomes, 'outcomeCode');
    const intentBreakdown = distribution(last7dOutcomes, 'intent');
    const todayIntentBreakdown = distribution(todayOutcomes, 'intent');
    const last7dActions = actions.filter((a) => Date.parse(a.recordedAt) >= last7dMs);
    const actionTypeBreakdown = distribution(last7dActions, 'actionType');
    const top7dDomains = topDomains(last7dOutcomes, 5);

    // Alerts
    const alerts = computeAlerts({
      todayCount: todayOutcomes.length,
      yesterdayCount: yesterdayOutcomes.length,
      last7dCount: last7dOutcomes.length,
      last7dAvg,
      intentBreakdown: todayIntentBreakdown,
      thresholds: tenantThresholds,
    });

    return {
      data: {
        tenantId,
        generatedAt: new Date().toISOString(),
        windowDays,
        throughput: {
          today: todayOutcomes.length,
          yesterday: yesterdayOutcomes.length,
          last7d: last7dOutcomes.length,
          last30d: last30dOutcomes.length,
          last7dAvgPerDay: Number(last7dAvg.toFixed(2)),
          weekOverWeekDeltaPct: pct(
            last7dOutcomes.length - (last30dOutcomes.length - last7dOutcomes.length) / 3,
            (last30dOutcomes.length - last7dOutcomes.length) / 3 || 1
          ),
        },
        actionsTotals: {
          today: actions.filter((a) => Date.parse(a.recordedAt) >= todayMs).length,
          last7d: last7dActions.length,
        },
        dailyTimeseries,
        outcomeBreakdown,
        intentBreakdown,
        actionTypeBreakdown,
        topDomains: top7dDomains,
        alerts,
        thresholds: resolveThresholds(tenantThresholds),
      },
      metadata: {
        capability: CcoOperationalKpisCapability.name,
        version: CcoOperationalKpisCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId,
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

module.exports = {
  CcoOperationalKpisCapability,
  ccoOperationalKpisCapability: CcoOperationalKpisCapability,
};
