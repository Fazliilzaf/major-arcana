'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_PRICING_PATH = 'migration/booking-pricing-defaults.json';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampPrice(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function loadBookingPricingMigrationDefaults({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, MIGRATION_PRICING_PATH);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function normalizePricingRules(input = {}, previous = {}) {
  const migration = loadBookingPricingMigrationDefaults();
  const migrationGlobal = asObject(migration.globalRules);
  const prev = asObject(previous);
  const safe = asObject(input);
  const prevGlobal = asObject(prev.globalRules);
  const nextGlobal = asObject(safe.globalRules);

  const globalRules = {
    eveningStartHour: Math.max(
      0,
      Math.min(
        23,
        Number(nextGlobal.eveningStartHour ?? prevGlobal.eveningStartHour ?? migrationGlobal.eveningStartHour) ||
          17
      )
    ),
    weekendDays: Array.isArray(nextGlobal.weekendDays)
      ? nextGlobal.weekendDays
      : Array.isArray(prevGlobal.weekendDays)
        ? prevGlobal.weekendDays
        : Array.isArray(migrationGlobal.weekendDays)
          ? migrationGlobal.weekendDays
          : [0, 6],
    currency: normalizeText(nextGlobal.currency || prevGlobal.currency || migrationGlobal.currency || 'SEK'),
  };

  return {
    globalRules,
    servicePricing: {
      ...asObject(migration.servicePricing),
      ...asObject(prev.servicePricing),
      ...asObject(safe.servicePricing),
    },
    migrationSource: MIGRATION_PRICING_PATH,
  };
}

function resolveSlotPriceTier(startsAt, pricingRules = {}) {
  const ms = Date.parse(normalizeText(startsAt));
  if (!Number.isFinite(ms)) return 'base';
  const date = new Date(ms);
  const weekday = date.getUTCDay();
  const hour = date.getUTCHours();
  const weekendDays = new Set(
    asObject(pricingRules.globalRules).weekendDays || [0, 6]
  );
  if (weekendDays.has(weekday)) return 'weekend';
  const eveningStart =
    Number(asObject(pricingRules.globalRules).eveningStartHour) || 17;
  if (hour >= eveningStart) return 'evening';
  return 'base';
}

function resolveServicePriceForTier(service = {}, tier = 'base', pricingRules = {}) {
  const serviceId = normalizeText(service.id);
  const migrationEntry = asObject(asObject(pricingRules.servicePricing)[serviceId]);
  const servicePricing = asObject(service.pricing);
  const base = clampPrice(
    servicePricing.basePriceSek ??
      migrationEntry.basePriceSek ??
      service.fromPriceSek ??
      service.basePriceSek,
    0
  );
  const evening = clampPrice(
    servicePricing.eveningPriceSek ?? migrationEntry.eveningPriceSek ?? base,
    base
  );
  const weekend = clampPrice(
    servicePricing.weekendPriceSek ?? migrationEntry.weekendPriceSek ?? base,
    base
  );
  if (tier === 'evening') return evening;
  if (tier === 'weekend') return weekend;
  return base;
}

function applyBookingPricingMigrationToService(service = {}, pricingRules = normalizePricingRules()) {
  const serviceId = normalizeText(service.id);
  const migrationEntry = asObject(asObject(pricingRules.servicePricing)[serviceId]);
  const pricing = {
    basePriceSek: clampPrice(
      service.pricing?.basePriceSek ?? migrationEntry.basePriceSek ?? service.fromPriceSek,
      0
    ),
    eveningPriceSek: clampPrice(
      service.pricing?.eveningPriceSek ?? migrationEntry.eveningPriceSek,
      clampPrice(migrationEntry.basePriceSek, 0)
    ),
    weekendPriceSek: clampPrice(
      service.pricing?.weekendPriceSek ?? migrationEntry.weekendPriceSek,
      clampPrice(migrationEntry.basePriceSek, 0)
    ),
    currency: normalizeText(pricingRules.globalRules?.currency) || 'SEK',
  };
  return {
    ...service,
    pricing,
    fromPriceSek: pricing.basePriceSek,
  };
}

function applyPricingToSlot(slot = {}, service = {}, pricingRules = normalizePricingRules()) {
  const tier = resolveSlotPriceTier(slot.startsAt, pricingRules);
  const priceSek = resolveServicePriceForTier(service, tier, pricingRules);
  return {
    ...slot,
    priceTier: tier,
    priceSek,
    currency: normalizeText(pricingRules.globalRules?.currency) || 'SEK',
  };
}

module.exports = {
  MIGRATION_PRICING_PATH,
  applyBookingPricingMigrationToService,
  applyPricingToSlot,
  loadBookingPricingMigrationDefaults,
  normalizePricingRules,
  resolveServicePriceForTier,
  resolveSlotPriceTier,
};
