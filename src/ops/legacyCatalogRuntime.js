'use strict';

const { loadLegacyCatalogBundle } = require('./legacyCatalogLoader');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readTripleMapEntries(bundle) {
  const raw = bundle?.catalogs?.serviceTripleMap;
  if (!raw) return [];
  return asArray(raw.entries || raw.mappings || raw);
}

function buildLegacyMapping(entry = {}) {
  const safe = asObject(entry);
  return {
    arcanaServiceId: normalizeText(safe.arcanaServiceId),
    label: normalizeText(safe.label),
    brand: normalizeText(safe.brand),
    confidence: normalizeText(safe.confidence),
    journalTypes: asArray(safe.journalTypes),
    cliento: asObject(safe.cliento),
    meridiq: asObject(safe.meridiq),
    notes: normalizeText(safe.notes) || null,
  };
}

function defaultDurationForService(serviceId = '') {
  const id = normalizeText(serviceId).toLowerCase();
  if (id.includes('consultation') || id.includes('followup') || id.includes('follow-up')) return 30;
  if (id.includes('prp') || id.includes('microneedling')) return 60;
  if (id.includes('eyebrow')) return 240;
  if (id.includes('beard')) return 360;
  if (id.includes('fue') || id.includes('dhi')) return 480;
  return 60;
}

function mergeLegacyCatalogIntoEngineState(state, { planAPublicServiceIds = [] } = {}) {
  const bundle = loadLegacyCatalogBundle();
  const entries = readTripleMapEntries(bundle);
  const planA = new Set(asArray(planAPublicServiceIds).map(normalizeText).filter(Boolean));
  const servicesById = new Map(asArray(state.services).map((item) => [normalizeText(item.id), item]));
  let changed = false;

  for (const entry of entries) {
    const mapping = buildLegacyMapping(entry);
    const id = mapping.arcanaServiceId;
    if (!id) continue;

    const existing = servicesById.get(id);
    const isPlanA = planA.has(id);
    const nextLegacy = mapping;

    if (!existing) {
      servicesById.set(id, {
        id,
        label: mapping.label || id,
        durationMinutes: defaultDurationForService(id),
        active: isPlanA,
        publicBookable: isPlanA,
        brand: mapping.brand || undefined,
        legacyMapping: nextLegacy,
        catalogSource: 'legacy_triple_map',
      });
      changed = true;
      continue;
    }

    const merged = {
      ...existing,
      brand: existing.brand || mapping.brand || undefined,
      legacyMapping: {
        ...(asObject(existing.legacyMapping) || {}),
        ...nextLegacy,
      },
      catalogSource: existing.catalogSource || 'legacy_triple_map',
    };

    if (!isPlanA && existing.publicBookable === true && !planA.has(id)) {
      merged.publicBookable = false;
    }

    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      servicesById.set(id, merged);
      changed = true;
    }
  }

  if (changed) {
    state.services = Array.from(servicesById.values());
  }

  return {
    changed,
    mappedCount: entries.length,
    serviceCount: servicesById.size,
    bundleCounts: bundle.counts,
  };
}

function buildStaffRuntimeCatalogReadout(state, { planAPublicServiceIds = [], planAPublicResourceIds = [] } = {}) {
  const planAServices = new Set(asArray(planAPublicServiceIds).map(normalizeText));
  const planAResources = new Set(asArray(planAPublicResourceIds).map(normalizeText));
  const bundle = loadLegacyCatalogBundle();

  const services = asArray(state.services).map((service) => {
    const id = normalizeText(service.id);
    const isPlanA = planAServices.has(id);
    return {
      id,
      label: normalizeText(service.label),
      active: service.active !== false,
      publicBookable: service.publicBookable === true,
      planA: isPlanA,
      staffCatalogTier: isPlanA ? 'plan_a_public' : service.active !== false ? 'staff_active' : 'inactive_draft',
      brand: normalizeText(service.brand || service.legacyMapping?.brand),
      durationMinutes: Number(service.durationMinutes) || null,
      legacyMapping: service.legacyMapping || null,
      catalogSource: normalizeText(service.catalogSource) || null,
    };
  });

  const resources = asArray(state.resources).map((resource) => ({
    id: normalizeText(resource.id),
    label: normalizeText(resource.label),
    active: resource.active !== false,
    publicBookable: resource.publicBookable === true,
    planA: planAResources.has(normalizeText(resource.id)),
    role: normalizeText(resource.role) || null,
  }));

  const summary = {
    totalServices: services.length,
    planAPublicServices: services.filter((item) => item.planA && item.publicBookable).length,
    staffActiveServices: services.filter((item) => item.staffCatalogTier === 'staff_active').length,
    inactiveDraftServices: services.filter((item) => item.staffCatalogTier === 'inactive_draft').length,
    legacyMappedServices: services.filter((item) => item.legacyMapping).length,
    tripleMapEntries: readTripleMapEntries(bundle).length,
  };

  return {
    exportedAt: new Date().toISOString(),
    policy: {
      publicWebBookingEnabled: false,
      note: 'Runtime-katalog för staff/operatör. Publik webb-API förblir av tills explicit go-live.',
    },
    planA: {
      serviceIds: Array.from(planAServices),
      resourceIds: Array.from(planAResources),
    },
    summary,
    bundleCounts: bundle.counts,
    services,
    resources,
  };
}

module.exports = {
  buildLegacyMapping,
  mergeLegacyCatalogIntoEngineState,
  buildStaffRuntimeCatalogReadout,
  readTripleMapEntries,
};
