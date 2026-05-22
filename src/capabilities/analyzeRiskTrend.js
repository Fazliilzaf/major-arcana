'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function computeTrendDirection(recentScore, previousScore) {
  const diff = recentScore - previousScore;
  if (Math.abs(diff) < 3) return 'stable';
  return diff > 0 ? 'improving' : 'degrading';
}

class AnalyzeRiskTrendCapability extends BaseCapability {
  static name = 'AnalyzeRiskTrend';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      windowDays: { type: 'integer', minimum: 1, maximum: 90 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['trend', 'summary', 'generatedAt'],
        additionalProperties: true,
      },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input =
      safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot =
      safeContext.systemStateSnapshot && typeof safeContext.systemStateSnapshot === 'object'
        ? safeContext.systemStateSnapshot
        : {};

    const windowDays = Math.max(1, Math.min(90, toNumber(input.windowDays, 14)));
    const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const halfWindowMs = Date.now() - (windowDays / 2) * 24 * 60 * 60 * 1000;
    const warnings = [];

    const evaluations = asArray(snapshot.riskEvaluations || snapshot.evaluations);
    const incidents = asArray(snapshot.incidents);

    const recentEvals = evaluations.filter((e) => {
      const ts = Date.parse(toIso(e?.evaluatedAt || e?.createdAt));
      return Number.isFinite(ts) && ts >= halfWindowMs;
    });
    const olderEvals = evaluations.filter((e) => {
      const ts = Date.parse(toIso(e?.evaluatedAt || e?.createdAt));
      return Number.isFinite(ts) && ts >= windowStartMs && ts < halfWindowMs;
    });

    const avgRisk = (evals) => {
      if (evals.length === 0) return 0;
      const total = evals.reduce((sum, e) => sum + toNumber(e?.riskLevel || e?.riskScore, 0), 0);
      return Math.round((total / evals.length) * 100) / 100;
    };

    const recentAvg = avgRisk(recentEvals);
    const olderAvg = avgRisk(olderEvals);

    const decisionCounts = { allow: 0, review_required: 0, blocked: 0, critical_escalate: 0 };
    for (const e of recentEvals) {
      const d = normalizeText(e?.decision).toLowerCase();
      if (d in decisionCounts) decisionCounts[d] += 1;
    }

    const recentIncidents = incidents.filter((i) => {
      const ts = Date.parse(toIso(i?.createdAt));
      return Number.isFinite(ts) && ts >= halfWindowMs;
    });
    const olderIncidents = incidents.filter((i) => {
      const ts = Date.parse(toIso(i?.createdAt));
      return Number.isFinite(ts) && ts >= windowStartMs && ts < halfWindowMs;
    });

    const direction = computeTrendDirection(recentAvg, olderAvg);
    const incidentDirection = computeTrendDirection(olderIncidents.length, recentIncidents.length);

    const trend = {
      direction,
      recentAverageRisk: recentAvg,
      previousAverageRisk: olderAvg,
      recentEvaluationCount: recentEvals.length,
      previousEvaluationCount: olderEvals.length,
      decisionDistribution: decisionCounts,
      incidentTrend: {
        direction: incidentDirection,
        recentCount: recentIncidents.length,
        previousCount: olderIncidents.length,
      },
      windowDays,
    };

    if (evaluations.length === 0) {
      warnings.push('Inga risk-evalueringar hittades i snapshot.');
    }
    if (recentEvals.length < 5) {
      warnings.push(
        `Bara ${recentEvals.length} evalueringar i senaste halvfonstret — trenden kan vara otillforlitlig.`
      );
    }

    const summaryParts = [
      `Risktrend: ${direction}.`,
      `Senaste risksnittet: ${recentAvg} (forra perioden: ${olderAvg}).`,
      `${recentEvals.length} evalueringar senaste ${Math.round(windowDays / 2)} dagarna.`,
      `Incidenttrend: ${incidentDirection} (${recentIncidents.length} nya vs ${olderIncidents.length} forra perioden).`,
    ];

    return {
      data: {
        trend,
        summary: summaryParts.join(' '),
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: AnalyzeRiskTrendCapability.name,
        version: AnalyzeRiskTrendCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  AnalyzeRiskTrendCapability,
};
