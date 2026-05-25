'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { applyBookingPolicyToService } = require('./ccoBookingPolicy');

const MIGRATION_DEFAULTS_PATH = 'migration/booking-policy-defaults.json';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampMinutes(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(7 * 24 * 60, Math.round(parsed)));
}

function clampDays(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(365, Math.round(parsed)));
}

function clampHours(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(168, Math.round(parsed)));
}

function loadBookingPolicyMigrationDefaults({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, MIGRATION_DEFAULTS_PATH);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function normalizeBookingPolicySettings(input = {}, previous = {}) {
  const migration = loadBookingPolicyMigrationDefaults();
  const migrationGlobal = asObject(migration.globalDefaults);
  const prev = asObject(previous);
  const safe = asObject(input);
  const prevGlobal = asObject(prev.globalDefaults);
  const nextGlobal = asObject(safe.globalDefaults);

  const globalDefaults = {
    minNoticeOnlineMinutes: clampMinutes(
      nextGlobal.minNoticeOnlineMinutes ?? prevGlobal.minNoticeOnlineMinutes,
      migrationGlobal.minNoticeOnlineMinutes ?? 120
    ),
    minNoticePhysicalMinutes: clampMinutes(
      nextGlobal.minNoticePhysicalMinutes ?? prevGlobal.minNoticePhysicalMinutes,
      migrationGlobal.minNoticePhysicalMinutes ?? 60
    ),
    maxBookingDaysAhead: clampDays(
      nextGlobal.maxBookingDaysAhead ?? prevGlobal.maxBookingDaysAhead,
      migrationGlobal.maxBookingDaysAhead ?? 180
    ),
    cancellationPolicyHours: clampHours(
      nextGlobal.cancellationPolicyHours ?? prevGlobal.cancellationPolicyHours,
      migrationGlobal.cancellationPolicyHours ?? 24
    ),
  };

  const serviceOverrides = {
    ...asObject(migration.serviceOverrides),
    ...asObject(prev.serviceOverrides),
    ...asObject(safe.serviceOverrides),
  };

  return {
    globalDefaults,
    serviceOverrides,
    migrationSource: MIGRATION_DEFAULTS_PATH,
  };
}

function resolveServicePolicyFields(service = {}, settings = {}) {
  const normalized = normalizeBookingPolicySettings(settings);
  const serviceId = normalizeText(service.id);
  const override = asObject(normalized.serviceOverrides[serviceId]);
  const global = normalized.globalDefaults;
  const meetingMode = normalizeText(override.meetingMode || service.meetingMode).toLowerCase();
  const defaultNotice =
    meetingMode === 'online'
      ? global.minNoticeOnlineMinutes
      : global.minNoticePhysicalMinutes;

  return {
    meetingMode: meetingMode || undefined,
    minNoticeMinutes: clampMinutes(
      override.minNoticeMinutes ?? service.minNoticeMinutes,
      defaultNotice
    ),
    maxBookingDaysAhead: clampDays(
      override.maxBookingDaysAhead ?? service.maxBookingDaysAhead,
      global.maxBookingDaysAhead
    ),
    cancellationPolicyHours: clampHours(
      override.cancellationPolicyHours ?? service.cancellationPolicyHours,
      global.cancellationPolicyHours
    ),
    vipTokenRequired:
      override.vipTokenRequired === true || service.vipTokenRequired === true || false,
  };
}

function applyBookingPolicySettingsToService(service = {}, settings = {}) {
  const policyFields = resolveServicePolicyFields(service, settings);
  return applyBookingPolicyToService({
    ...service,
    ...policyFields,
  });
}

function applyBookingPolicyMigrationToServices(services = []) {
  const migration = loadBookingPolicyMigrationDefaults();
  const overrides = asObject(migration.serviceOverrides);
  return services.map((service) => {
    const id = normalizeText(service.id);
    const migrationOverride = asObject(overrides[id]);
    if (!Object.keys(migrationOverride).length) {
      return applyBookingPolicyToService(service);
    }
    return applyBookingPolicySettingsToService(
      { ...service, ...migrationOverride },
      { serviceOverrides: overrides, globalDefaults: migration.globalDefaults }
    );
  });
}

module.exports = {
  MIGRATION_DEFAULTS_PATH,
  applyBookingPolicyMigrationToServices,
  applyBookingPolicySettingsToService,
  loadBookingPolicyMigrationDefaults,
  normalizeBookingPolicySettings,
  resolveServicePolicyFields,
};
