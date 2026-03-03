function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function round(value, precision = 2) {
  const factor = 10 ** Math.max(0, toNumber(precision, 2));
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function severityFromScore(score = 0) {
  const safeScore = clamp(score, 0, 1, 0);
  if (safeScore >= 0.75) return 'high';
  if (safeScore >= 0.45) return 'medium';
  return 'low';
}

function buildThreatList({ usageAnalytics = {}, monthlyRisk = {}, worklist = [] } = {}) {
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};
  const safeMonthlyRisk = monthlyRisk && typeof monthlyRisk === 'object' ? monthlyRisk : {};
  const rows = asArray(worklist).filter((item) => item && typeof item === 'object');

  const threats = [];
  const slaRate = clamp(safeUsage.slaBreachRate, 0, 1, 0);
  if (slaRate >= 0.1 || Number(safeMonthlyRisk.breachTrendPercent || 0) >= 15) {
    const score = clamp(slaRate * 0.8 + clamp(safeMonthlyRisk.breachTrendPercent / 100, 0, 1, 0) * 0.2, 0, 1, 0);
    threats.push({
      code: 'sla_drift',
      title: 'Återkommande SLA-avvikelse',
      severity: severityFromScore(score),
      impactScope: score >= 0.65 ? 'high' : 'medium',
      confidence: round(0.72 + score * 0.2, 3),
      recommendedAction: 'Prioritera High/Critical inom öppettid och minska backlog i sprintblock.',
    });
  }

  const complaintRate = clamp(safeUsage.complaintRate, 0, 1, 0);
  if (complaintRate >= 0.12 || Number(safeUsage.complaintTrendPercent || 0) > 0) {
    const score = clamp(complaintRate * 0.7 + clamp(toNumber(safeUsage.complaintTrendPercent, 0) / 100, 0, 1, 0) * 0.3, 0, 1, 0);
    threats.push({
      code: 'complaint_cluster',
      title: 'Complaint-kluster i inflödet',
      severity: severityFromScore(score),
      impactScope: score >= 0.7 ? 'high' : 'medium',
      confidence: round(0.68 + score * 0.22, 3),
      recommendedAction: 'Säkra snabb första återkoppling och använd professionellt svarsläge för complaints.',
    });
  }

  const conversionTrend = toNumber(safeUsage.conversionTrendPercent, 0);
  if (conversionTrend <= -10) {
    const score = clamp(Math.abs(conversionTrend) / 50, 0, 1, 0);
    threats.push({
      code: 'conversion_drop',
      title: 'Konverteringssignal faller',
      severity: severityFromScore(score),
      impactScope: score >= 0.7 ? 'high' : 'medium',
      confidence: round(0.64 + score * 0.25, 3),
      recommendedAction: 'Skärp CTA i booking/pricing och följ upp varma leads inom rekommenderat tempo.',
    });
  }

  const frustratedRows = rows.filter((item) => normalizeText(item.tone).toLowerCase() === 'frustrated');
  if (frustratedRows.length >= 2) {
    const score = clamp(frustratedRows.length / Math.max(3, rows.length), 0, 1, 0);
    threats.push({
      code: 'tone_escalation',
      title: 'Emotionell eskalering',
      severity: severityFromScore(score),
      impactScope: score >= 0.6 ? 'medium' : 'low',
      confidence: round(0.62 + score * 0.25, 3),
      recommendedAction: 'Svara lugnande och tydligt, med bekräftelse först och konkret nästa steg.',
    });
  }

  return threats.slice(0, 5);
}

function analyzeBusinessThreats({
  usageAnalytics = {},
  monthlyRisk = {},
  worklist = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const threats = buildThreatList({ usageAnalytics, monthlyRisk, worklist });
  const topSeverity = threats.some((item) => item.severity === 'high')
    ? 'high'
    : threats.some((item) => item.severity === 'medium')
    ? 'medium'
    : 'low';
  const aggregateScore = threats.length
    ? threats.reduce((sum, threat) => sum + clamp(threat.confidence, 0, 1, 0), 0) / threats.length
    : 0;

  return {
    strategicFlag: threats.length > 0,
    severity: topSeverity,
    confidence: round(aggregateScore, 3),
    threats,
    recommendedAction:
      threats[0]?.recommendedAction ||
      'Inga tydliga systemhot identifierade. Fortsätt följa SLA och prioriteringsordning.',
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  analyzeBusinessThreats,
};
