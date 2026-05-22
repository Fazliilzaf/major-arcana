function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function normalizeSlaStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'breach') return 'breach';
  if (normalized === 'warning') return 'warning';
  return 'safe';
}

function normalizeToneList(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function mapTemperature(score = 0) {
  const normalizedScore = clamp(score, 0, 1, 0);
  if (normalizedScore >= 0.8) return 'at_risk';
  if (normalizedScore >= 0.62) return 'elevated';
  if (normalizedScore >= 0.45) return 'warm';
  if (normalizedScore >= 0.25) return 'stable';
  return 'cool';
}

function evaluateCustomerTemperature(input = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const drivers = [];
  let score = 0;

  const lifecycleStatus = normalizeText(safeInput.lifecycleStatus).toLowerCase();
  if (lifecycleStatus === 'returning' || lifecycleStatus === 'active_dialogue') {
    score += 0.08;
    drivers.push('returning_customer');
  }

  const engagementScore = clamp(safeInput.engagementScore, 0, 1, 0.4);
  score += engagementScore * 0.35;
  if (engagementScore >= 0.6) drivers.push('high_engagement');

  const slaStatus = normalizeSlaStatus(safeInput.slaStatus);
  if (slaStatus === 'breach') {
    score += 0.38;
    drivers.push('sla_breach');
  } else if (slaStatus === 'warning') {
    score += 0.2;
    drivers.push('sla_warning');
  }

  const complaintCount = Math.max(0, Math.round(toNumber(safeInput.complaintCount, 0)));
  if (complaintCount > 0) {
    score += Math.min(0.35, complaintCount * 0.15);
    drivers.push('complaint_pattern');
  }

  const toneHistory = normalizeToneList(safeInput.toneHistory);
  if (toneHistory.includes('frustrated')) {
    score += 0.24;
    drivers.push('frustrated_tone');
  } else if (toneHistory.includes('anxious')) {
    score += 0.18;
    drivers.push('anxious_tone');
  } else if (toneHistory.includes('urgent')) {
    score += 0.16;
    drivers.push('urgent_tone');
  }

  const recencyDays = toNumber(safeInput.recencyDays, 999);
  if (Number.isFinite(recencyDays) && recencyDays <= 7) {
    score += 0.07;
    drivers.push('recent_interaction');
  }

  const normalizedScore = Math.round(clamp(score, 0, 1, 0) * 100) / 100;
  return {
    temperature: mapTemperature(normalizedScore),
    drivers: Array.from(new Set(drivers)).slice(0, 8),
    score: normalizedScore,
  };
}

module.exports = {
  evaluateCustomerTemperature,
};
