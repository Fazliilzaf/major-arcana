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

function round(value, precision = 2) {
  const factor = 10 ** Math.max(0, toNumber(precision, 2));
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateRecovery({
  redFlagState = null,
  healthHistory = [],
  slaBreachHistory = [],
  volatilityHistory = [],
  driverDeltas = {},
  breachThreshold = 0.05,
  nowMs = Date.now(),
} = {}) {
  const redFlag =
    redFlagState && typeof redFlagState === 'object' && !Array.isArray(redFlagState)
      ? redFlagState
      : {};
  const safeNowMs = Number.isFinite(toNumber(nowMs, NaN)) ? toNumber(nowMs, Date.now()) : Date.now();
  const safeBreachThreshold = Math.max(0, Math.min(1, toNumber(breachThreshold, 0.05)));

  const sortedHealth = asArray(healthHistory)
    .map((point) => ({
      tsMs: toTimestampMs(point?.ts),
      score: toNumber(point?.score, NaN),
    }))
    .filter((point) => Number.isFinite(point.tsMs) && Number.isFinite(point.score))
    .sort((left, right) => left.tsMs - right.tsMs);
  const lastThreeHealthScores = sortedHealth.slice(-3).map((point) => point.score);
  const healthRange =
    lastThreeHealthScores.length >= 3
      ? Math.max(...lastThreeHealthScores) - Math.min(...lastThreeHealthScores)
      : Number.POSITIVE_INFINITY;
  const healthStabilized = Number.isFinite(healthRange) && healthRange <= 3;

  const recent48hThreshold = safeNowMs - 48 * 60 * 60 * 1000;
  const recentSlaBreaches = asArray(slaBreachHistory)
    .map((point) => ({
      tsMs: toTimestampMs(point?.ts),
      rate: toNumber(point?.rate, NaN),
    }))
    .filter((point) => Number.isFinite(point.tsMs) && Number.isFinite(point.rate))
    .filter((point) => point.tsMs >= recent48hThreshold)
    .sort((left, right) => left.tsMs - right.tsMs);
  const slaNormalized =
    recentSlaBreaches.length >= 2 &&
    recentSlaBreaches.every((point) => point.rate < safeBreachThreshold);

  const latestVolatilityPoint = asArray(volatilityHistory)
    .map((point) => ({
      tsMs: toTimestampMs(point?.ts),
      index: toNumber(point?.index, NaN),
    }))
    .filter((point) => Number.isFinite(point.tsMs) && Number.isFinite(point.index))
    .sort((left, right) => right.tsMs - left.tsMs)[0] || null;
  const volatilityDropped = latestVolatilityPoint ? latestVolatilityPoint.index < 0.4 : false;

  const drivers = asArray(redFlag.primaryDrivers).map((item) => normalizeText(item).toLowerCase());
  const safeDriverDeltas =
    driverDeltas && typeof driverDeltas === 'object' && !Array.isArray(driverDeltas)
      ? driverDeltas
      : {};
  const driversResolved = drivers.filter((driver) => {
    const delta = toNumber(safeDriverDeltas[driver], NaN);
    return Number.isFinite(delta) && delta < 0;
  });
  const driverResolution =
    drivers.length === 0
      ? false
      : driversResolved.length >= Math.min(2, drivers.length);

  let daysStable = 0;
  for (let index = sortedHealth.length - 1; index > 0; index -= 1) {
    const current = sortedHealth[index];
    const previous = sortedHealth[index - 1];
    if (!current || !previous) break;
    const delta = Math.abs(current.score - previous.score);
    if (delta > 3) break;
    daysStable += 1;
  }
  if (healthStabilized && daysStable < 2 && sortedHealth.length >= 3) {
    daysStable = 3;
  } else if (daysStable > 0) {
    daysStable += 1;
  }

  const rules = {
    healthStabilized,
    driverResolution,
    slaNormalized,
    volatilityDropped,
  };
  const rulesMet = Object.values(rules).filter(Boolean).length;
  const recovered = rulesMet >= 3;
  const confidence = round(rulesMet / 4, 2);

  return {
    recovered,
    confidence,
    driversResolved,
    daysStable,
    rules,
    rulesMet,
    totalRules: 4,
    reason:
      recovered
        ? 'stabilized'
        : redFlag.isActive === true
        ? 'insufficient_signals'
        : 'no_active_red_flag',
  };
}

module.exports = {
  evaluateRecovery,
};

