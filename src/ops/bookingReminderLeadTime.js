'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_DEFAULTS_PATH = 'migration/booking-reminder-lead-time-defaults.json';
const MIN_LEAD_HOURS = 1;
const MAX_LEAD_HOURS = 168;
const DEFAULT_TOLERANCE_HOURS = 1;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampLeadHours(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_LEAD_HOURS, Math.min(MAX_LEAD_HOURS, Math.round(parsed)));
}

function loadBookingReminderLeadTimeMigrationDefaultsRaw({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, MIGRATION_DEFAULTS_PATH);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function loadBookingReminderLeadTimeMigrationDefaults({ repoRoot = process.cwd() } = {}) {
  const raw = loadBookingReminderLeadTimeMigrationDefaultsRaw({ repoRoot }) || {};
  const channels = asObject(raw.channelDefaults);
  return {
    globalDefaultHours: clampLeadHours(raw.globalDefaultHours, 24),
    channelDefaults: {
      online: clampLeadHours(channels.online, 4),
      physical: clampLeadHours(channels.physical, 24),
      default: clampLeadHours(channels.default, 24),
    },
    serviceOverrides: normalizeOverrideMap(raw.serviceOverrides),
    resourceOverrides: normalizeOverrideMap(raw.resourceOverrides),
    migrationSource: MIGRATION_DEFAULTS_PATH,
  };
}

function normalizeBookingReminderLeadTimeConfig(input = {}, previous = {}) {
  const migration = loadBookingReminderLeadTimeMigrationDefaults();
  const prev = asObject(previous);
  const safe = asObject(input);
  const prevChannels = asObject(prev.channelDefaults);
  const nextChannels = asObject(safe.channelDefaults);

  return {
    globalDefaultHours: clampLeadHours(
      safe.globalDefaultHours ?? prev.globalDefaultHours,
      migration.globalDefaultHours
    ),
    channelDefaults: {
      online: clampLeadHours(
        nextChannels.online ?? prevChannels.online,
        migration.channelDefaults.online
      ),
      physical: clampLeadHours(
        nextChannels.physical ?? prevChannels.physical,
        migration.channelDefaults.physical
      ),
      default: clampLeadHours(
        nextChannels.default ?? prevChannels.default,
        migration.channelDefaults.default
      ),
    },
    serviceOverrides: normalizeOverrideMap(safe.serviceOverrides, prev.serviceOverrides),
    resourceOverrides: normalizeOverrideMap(safe.resourceOverrides, prev.resourceOverrides),
    migrationSource: MIGRATION_DEFAULTS_PATH,
  };
}

function normalizeOverrideMap(input = {}, previous = {}) {
  const source = { ...asObject(previous), ...asObject(input) };
  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    const id = normalizeText(key);
    if (!id) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    normalized[id] = clampLeadHours(parsed, 24);
  }
  return normalized;
}

function resolveMeetingChannel(service = {}) {
  const mode = normalizeKey(service.meetingMode);
  if (mode === 'online') return 'online';
  if (mode === 'physical' || mode === 'in_person' || mode === 'in-person') return 'physical';

  const serviceId = normalizeKey(service.id || service.serviceId);
  if (serviceId.includes('online')) return 'online';
  if (serviceId.includes('physical') || serviceId.includes('fysisk')) return 'physical';
  return 'default';
}

function resolveBookingReminderLeadTimeMinutes({
  config,
  service = {},
  resourceId = '',
  channel = '',
} = {}) {
  const normalized = normalizeBookingReminderLeadTimeConfig(config || {});
  const serviceId = normalizeText(service.id || service.serviceId);
  const resource = normalizeText(resourceId);

  if (serviceId && normalized.serviceOverrides[serviceId] != null) {
    return normalized.serviceOverrides[serviceId] * 60;
  }
  if (resource && normalized.resourceOverrides[resource] != null) {
    return normalized.resourceOverrides[resource] * 60;
  }

  const channelKey = normalizeKey(channel) || resolveMeetingChannel(service);
  const channelHours =
    normalized.channelDefaults[channelKey] ?? normalized.channelDefaults.default;
  return clampLeadHours(channelHours, normalized.globalDefaultHours) * 60;
}

function resolveBookingReminderLeadTimeHours(options = {}) {
  return resolveBookingReminderLeadTimeMinutes(options) / 60;
}

function computeMaxLeadTimeHours(config = {}) {
  const normalized = normalizeBookingReminderLeadTimeConfig(config);
  const values = [
    normalized.globalDefaultHours,
    normalized.channelDefaults.online,
    normalized.channelDefaults.physical,
    normalized.channelDefaults.default,
    ...Object.values(normalized.serviceOverrides),
    ...Object.values(normalized.resourceOverrides),
  ];
  return Math.max(...values.filter(Number.isFinite), normalized.globalDefaultHours);
}

function isWithinReminderLeadWindow({
  hoursUntilVisit,
  leadTimeHours,
  toleranceHours = DEFAULT_TOLERANCE_HOURS,
} = {}) {
  const hours = Number(hoursUntilVisit);
  const lead = Number(leadTimeHours);
  const tolerance = Math.max(0.25, Number(toleranceHours) || DEFAULT_TOLERANCE_HOURS);
  if (!Number.isFinite(hours) || !Number.isFinite(lead)) return false;
  if (hours < 0) return false;
  return Math.abs(hours - lead) <= tolerance;
}

module.exports = {
  DEFAULT_TOLERANCE_HOURS,
  MAX_LEAD_HOURS,
  MIN_LEAD_HOURS,
  MIGRATION_DEFAULTS_PATH,
  clampLeadHours,
  computeMaxLeadTimeHours,
  isWithinReminderLeadWindow,
  loadBookingReminderLeadTimeMigrationDefaults,
  normalizeBookingReminderLeadTimeConfig,
  resolveBookingReminderLeadTimeHours,
  resolveBookingReminderLeadTimeMinutes,
  resolveMeetingChannel,
};
