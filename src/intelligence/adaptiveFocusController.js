function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function resolveAdaptiveFocusState({
  redFlagState = null,
  recoveryState = null,
  manualOverride = '',
  nowMs = Date.now(),
  durationHours = 48,
} = {}) {
  const redFlag =
    redFlagState && typeof redFlagState === 'object' && !Array.isArray(redFlagState)
      ? redFlagState
      : {};
  const recovery =
    recoveryState && typeof recoveryState === 'object' && !Array.isArray(recoveryState)
      ? recoveryState
      : {};
  const safeNowMs = Number.isFinite(toNumber(nowMs, NaN)) ? toNumber(nowMs, Date.now()) : Date.now();
  const safeDurationHours = Math.max(1, Math.min(168, Math.round(toNumber(durationHours, 48))));
  const override = normalizeText(manualOverride).toLowerCase();

  const redFlagActive = redFlag.isActive === true;
  const recovered = recovery.recovered === true;

  let isActive = redFlagActive && !recovered;
  if (override === 'on') isActive = true;
  if (override === 'off') isActive = false;

  const startedAt = toIso(safeNowMs) || new Date().toISOString();
  const until = toIso(safeNowMs + safeDurationHours * 60 * 60 * 1000) || null;
  const primaryDrivers = Array.isArray(redFlag.primaryDrivers) ? redFlag.primaryDrivers.slice(0, 4) : [];

  return {
    isActive,
    focusScope: isActive ? ['critical', 'high'] : [],
    autoSprint: isActive,
    visualState: isActive ? 'focus_mode' : 'normal',
    durationHours: safeDurationHours,
    startedAt,
    until: isActive ? until : null,
    primaryDrivers: isActive ? primaryDrivers : [],
    recommendedAction: isActive ? String(redFlag.recommendedAction || '').trim() : '',
    reason: isActive
      ? 'red_flag_active'
      : recovered
      ? 'recovered'
      : override === 'off'
      ? 'manual_override_off'
      : 'no_trigger',
  };
}

module.exports = {
  resolveAdaptiveFocusState,
};

