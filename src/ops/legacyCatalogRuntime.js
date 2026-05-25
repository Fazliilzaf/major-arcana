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

function collectMappedLegacyIds(entries = []) {
  const clientoSrvIds = new Set();
  const meridiqApiIds = new Set();

  for (const entry of entries) {
    const mapping = buildLegacyMapping(entry);
    for (const srvId of asArray(mapping.cliento?.srvIds)) {
      const normalized = normalizeText(String(srvId || ''));
      if (normalized) clientoSrvIds.add(normalized);
    }
    const primaryCliento = normalizeText(String(mapping.cliento?.primarySrvId || ''));
    if (primaryCliento) clientoSrvIds.add(primaryCliento);

    for (const apiId of asArray(mapping.meridiq?.apiIds)) {
      if (apiId == null) continue;
      meridiqApiIds.add(String(apiId));
    }
    const primaryMeridiq = mapping.meridiq?.primaryApiId;
    if (primaryMeridiq != null) meridiqApiIds.add(String(primaryMeridiq));
  }

  return { clientoSrvIds, meridiqApiIds };
}

function buildClientoDraftService(clientoService = {}) {
  const srvId = normalizeText(String(clientoService.srvId || ''));
  if (!srvId) return null;

  const label = normalizeText(clientoService.name) || `Cliento ${srvId}`;
  const brand =
    normalizeText(clientoService.brand) || normalizeText(clientoService.groupName) || undefined;
  const arcanaId = normalizeText(clientoService.arcanaId);
  const id = arcanaId || `legacy-cliento-${srvId}`;

  return {
    id,
    label,
    durationMinutes: Number(clientoService.durationMin) || defaultDurationForService(label),
    active: false,
    publicBookable: false,
    brand,
    catalogSource: 'cliento_catalog',
    legacyMapping: {
      arcanaServiceId: arcanaId || null,
      label,
      brand: brand || null,
      confidence: 'unmapped',
      journalTypes: [],
      cliento: {
        primarySrvId: srvId,
        srvIds: [srvId],
        primaryName: label,
        groupName: normalizeText(clientoService.groupName) || null,
        webShowInBooking: clientoService.webShowInBooking === true,
        webAllowBooking: clientoService.webAllowBooking === true,
      },
      meridiq: {},
      notes: 'Unmapped Cliento catalog entry (inactive draft)',
    },
  };
}

function buildMeridiqDraftService(meridiqService = {}) {
  const apiId = meridiqService.apiId;
  if (apiId == null) return null;

  const apiIdStr = String(apiId);
  const label = normalizeText(meridiqService.name) || `Meridiq ${apiIdStr}`;
  const brand = normalizeText(meridiqService.brand) || undefined;
  const category = normalizeText(meridiqService.category);

  return {
    id: `legacy-meridiq-${apiIdStr}`,
    label,
    durationMinutes: Number(meridiqService.durationMin) || defaultDurationForService(label),
    active: false,
    publicBookable: false,
    brand,
    catalogSource: 'meridiq_catalog',
    legacyMapping: {
      arcanaServiceId: null,
      label,
      brand: brand || null,
      confidence: 'unmapped',
      journalTypes: [],
      cliento: {},
      meridiq: {
        primaryApiId: Number(apiId),
        apiIds: [Number(apiId)],
        count: 1,
        categories: category ? [category] : [],
        primaryName: label,
      },
      notes: 'Unmapped Meridiq catalog entry (inactive draft)',
    },
  };
}

function mergeDraftService(existing, draft, planA) {
  const isPlanA = planA.has(draft.id);
  const merged = {
    ...existing,
    label: existing.label || draft.label,
    durationMinutes: Number(existing.durationMinutes) || draft.durationMinutes,
    brand: existing.brand || draft.brand || undefined,
    catalogSource: existing.catalogSource || draft.catalogSource,
    legacyMapping: {
      ...(asObject(existing.legacyMapping) || {}),
      ...draft.legacyMapping,
      cliento: {
        ...(asObject(existing.legacyMapping?.cliento) || {}),
        ...draft.legacyMapping.cliento,
      },
      meridiq: {
        ...(asObject(existing.legacyMapping?.meridiq) || {}),
        ...draft.legacyMapping.meridiq,
      },
    },
  };

  if (!isPlanA) {
    merged.active = existing.active === true ? existing.active : false;
    merged.publicBookable = existing.publicBookable === true && isPlanA ? true : false;
  }

  return merged;
}

function promoteUnmappedLegacyServices(servicesById, bundle, entries, planA) {
  const { clientoSrvIds, meridiqApiIds } = collectMappedLegacyIds(entries);
  let changed = false;
  let unmappedClientoPromoted = 0;
  let unmappedMeridiqPromoted = 0;

  for (const item of asArray(bundle?.catalogs?.clientoServices?.services)) {
    const srvId = normalizeText(String(item.srvId || ''));
    if (!srvId || clientoSrvIds.has(srvId)) continue;

    const draft = buildClientoDraftService(item);
    if (!draft) continue;

    const existing = servicesById.get(draft.id);
    if (existing) {
      const merged = mergeDraftService(existing, draft, planA);
      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        servicesById.set(draft.id, merged);
        changed = true;
      }
    } else {
      servicesById.set(draft.id, draft);
      unmappedClientoPromoted += 1;
      changed = true;
    }
  }

  for (const item of asArray(bundle?.catalogs?.meridiqServices?.services)) {
    const apiId = item.apiId;
    if (apiId == null || meridiqApiIds.has(String(apiId))) continue;

    const draft = buildMeridiqDraftService(item);
    if (!draft) continue;

    const existing = servicesById.get(draft.id);
    if (existing) {
      const merged = mergeDraftService(existing, draft, planA);
      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        servicesById.set(draft.id, merged);
        changed = true;
      }
    } else {
      servicesById.set(draft.id, draft);
      unmappedMeridiqPromoted += 1;
      changed = true;
    }
  }

  return { changed, unmappedClientoPromoted, unmappedMeridiqPromoted };
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

  const unmapped = promoteUnmappedLegacyServices(servicesById, bundle, entries, planA);
  if (unmapped.changed) {
    changed = true;
  }

  if (changed) {
    state.services = Array.from(servicesById.values());
  }

  return {
    changed,
    mappedCount: entries.length,
    serviceCount: servicesById.size,
    unmappedClientoPromoted: unmapped.unmappedClientoPromoted,
    unmappedMeridiqPromoted: unmapped.unmappedMeridiqPromoted,
    bundleCounts: bundle.counts,
  };
}

function buildStaffRuntimeCatalogReadout(state, { planAPublicServiceIds = [], planAPublicResourceIds = [] } = {}) {
  const planAServices = new Set(asArray(planAPublicServiceIds).map(normalizeText));
  const planAResources = new Set(asArray(planAPublicResourceIds).map(normalizeText));
  const bundle = loadLegacyCatalogBundle();
  const tripleEntries = readTripleMapEntries(bundle);

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

  const mapped = services.filter((item) => item.catalogSource === 'legacy_triple_map').length;
  const unmapped = services.filter(
    (item) => item.catalogSource === 'cliento_catalog' || item.catalogSource === 'meridiq_catalog'
  ).length;
  const planA = services.filter((item) => item.planA && item.publicBookable).length;

  const summary = {
    totalServices: services.length,
    clientoTotal: Number(bundle.counts?.clientoServices || 0),
    meridiqTotal: Number(bundle.counts?.meridiqServices || 0),
    mapped,
    unmapped,
    planA,
    planAPublicServices: planA,
    staffActiveServices: services.filter((item) => item.staffCatalogTier === 'staff_active').length,
    inactiveDraftServices: services.filter((item) => item.staffCatalogTier === 'inactive_draft').length,
    legacyMappedServices: services.filter((item) => item.legacyMapping).length,
    tripleMapEntries: tripleEntries.length,
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
  buildClientoDraftService,
  buildMeridiqDraftService,
  collectMappedLegacyIds,
  mergeLegacyCatalogIntoEngineState,
  buildStaffRuntimeCatalogReadout,
  readTripleMapEntries,
};
