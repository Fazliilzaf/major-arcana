'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadLegacyCatalogBundle } = require('./legacyCatalogLoader');
const {
  applyBookingPricingMigrationToService,
  normalizePricingRules,
} = require('./bookingPricingRules');
const { normalizeBookingPolicySettings } = require('./bookingPolicySettings');

const BOOKING_SCHEDULE_DEFAULTS_PATH = 'migration/booking-schedule-defaults.json';
const TREATMENT_DOCUMENT_REQUIREMENTS_PATH = 'config/cco-treatment-document-requirements.json';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniqueNormalizedList(value) {
  return Array.from(
    new Set(
      asArray(value)
        .map((item) => normalizeText(String(item)))
        .filter(Boolean)
    )
  );
}

function normalizeServiceVariant(variant = {}, parentArcanaServiceId = '') {
  const safe = asObject(variant);
  const apiId =
    safe.meridiqApiId == null || Number.isNaN(Number(safe.meridiqApiId))
      ? null
      : Number(safe.meridiqApiId);
  const price = asObject(safe.price);
  const amountSek =
    price.amountSek == null || Number.isNaN(Number(price.amountSek))
      ? null
      : Number(price.amountSek);
  return {
    variantId: normalizeText(safe.variantId),
    parentArcanaServiceId: normalizeText(parentArcanaServiceId) || null,
    clinicalParentArcanaServiceId:
      normalizeText(safe.clinicalParentArcanaServiceId) ||
      normalizeText(parentArcanaServiceId) ||
      null,
    label: normalizeText(safe.label),
    secondaryLabel: normalizeText(safe.secondaryLabel) || null,
    meridiqApiId: apiId,
    facitCategory: normalizeText(safe.facitCategory) || null,
    price: {
      currency: normalizeText(price.currency) || 'SEK',
      amountSek,
      display: normalizeText(price.display) || null,
      priceType: normalizeText(price.priceType) || null,
    },
    internalBookable: safe.internalBookable === true,
    publicBookable: safe.publicBookable === true,
    publicBookableDecision: normalizeText(safe.publicBookableDecision) || null,
  };
}

function normalizeServiceVariants(value, parentArcanaServiceId = '') {
  return asArray(value)
    .map((variant) => normalizeServiceVariant(variant, parentArcanaServiceId))
    .filter((variant) => variant.variantId && variant.label && variant.meridiqApiId != null);
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
    encounterType: normalizeText(safe.encounterType) || null,
    bookingMethodLabel: normalizeText(safe.bookingMethodLabel) || null,
    offerTemplateKey: normalizeText(safe.offerTemplateKey) || null,
    publicBookable: safe.publicBookable === true,
    documentRequirementKey: normalizeText(safe.documentRequirementKey) || null,
    coolingOffRef: safe.coolingOffRef === null ? null : asObject(safe.coolingOffRef),
    legacyAliases: uniqueNormalizedList(safe.legacyAliases),
    serviceVariants: normalizeServiceVariants(safe.serviceVariants, safe.arcanaServiceId),
    cliento: asObject(safe.cliento),
    meridiq: asObject(safe.meridiq),
    notes: normalizeText(safe.notes) || null,
  };
}

function loadTreatmentDocumentRequirements({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, TREATMENT_DOCUMENT_REQUIREMENTS_PATH);
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return asObject(raw.treatments || raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function collectMappingMeridiqApiIds(mapping = {}) {
  const ids = [];
  const add = (value) => {
    if (value == null) return;
    const normalized = normalizeText(String(value));
    if (normalized && !ids.includes(normalized)) ids.push(normalized);
  };
  for (const apiId of asArray(mapping.meridiq?.apiIds)) add(apiId);
  add(mapping.meridiq?.primaryApiId);
  return ids;
}

function buildMeridiqBindingIndex(bundle = {}) {
  const index = new Map();
  const rows = Array.isArray(bundle?.catalogs?.meridiqBindings?.services)
    ? bundle.catalogs.meridiqBindings.services
    : asArray(bundle?.catalogs?.meridiqBindings?.bindings);
  for (const row of rows) {
    const apiId = normalizeText(String(row?.apiId ?? ''));
    if (apiId) index.set(apiId, row);
  }
  return index;
}

function addUniqueByKey(rows, row, keyFn) {
  const key = keyFn(row);
  if (!key || rows.some((item) => keyFn(item) === key)) return;
  rows.push(row);
}

function collectMeridiqConsentBindings(mapping = {}, bindingIndex = new Map()) {
  const apiIds = collectMappingMeridiqApiIds(mapping);
  const matchedApiIds = [];
  const missingApiIds = [];
  const services = [];
  const consents = [];
  const questionnaires = [];

  for (const apiId of apiIds) {
    const binding = bindingIndex.get(apiId);
    if (!binding) {
      missingApiIds.push(apiId);
      continue;
    }
    matchedApiIds.push(apiId);
    services.push({
      apiId: Number(binding.apiId),
      name: normalizeText(binding.name),
      category: normalizeText(binding.category) || null,
    });
    for (const consent of asArray(binding.consents)) {
      addUniqueByKey(
        consents,
        {
          consentApiId: consent?.consentApiId == null ? null : Number(consent.consentApiId),
          title: normalizeText(consent?.title),
        },
        (item) => `${item.consentApiId || ''}:${item.title}`
      );
    }
    for (const questionnaire of asArray(binding.questionnaires)) {
      addUniqueByKey(
        questionnaires,
        {
          bindingId: questionnaire?.bindingId == null ? null : Number(questionnaire.bindingId),
          questionaryApiId:
            questionnaire?.questionaryApiId == null ? null : Number(questionnaire.questionaryApiId),
          type: normalizeText(questionnaire?.type) || null,
          title: normalizeText(questionnaire?.title),
        },
        (item) => `${item.bindingId || ''}:${item.questionaryApiId || ''}:${item.title}`
      );
    }
  }

  return {
    source: 'migration/meridiq/service-bindings-catalog.json',
    apiIds,
    matchedApiIds,
    missingApiIds,
    services,
    consents,
    questionnaires,
  };
}

function buildDocumentRequirementSummary(mapping = {}, requirements = {}) {
  const key = normalizeText(mapping.documentRequirementKey);
  if (!key) return null;
  const requirement = asObject(requirements[key]);
  if (!Object.keys(requirement).length) {
    return {
      source: TREATMENT_DOCUMENT_REQUIREMENTS_PATH,
      key,
      missing: true,
    };
  }
  return {
    source: TREATMENT_DOCUMENT_REQUIREMENTS_PATH,
    key,
    label: normalizeText(requirement.label) || null,
    category: normalizeText(requirement.category) || null,
    coolingOffDays: Number.isFinite(Number(requirement.coolingOffDays))
      ? Number(requirement.coolingOffDays)
      : null,
    coolingOffType: normalizeText(requirement.coolingOffType) || null,
    journalTemplate: normalizeText(requirement.journalTemplate) || null,
    aftercareTemplate: normalizeText(requirement.aftercareTemplate) || null,
    canonicalAgreementVariant: normalizeText(requirement.canonicalAgreementVariant) || null,
    requiredDocuments: asObject(requirement.requiredDocuments),
  };
}

function buildCanonicalServiceRegister(
  mapping = {},
  { bindingIndex = new Map(), requirements = {} } = {}
) {
  const documentRequirement = buildDocumentRequirementSummary(mapping, requirements);
  const consentBindings = collectMeridiqConsentBindings(mapping, bindingIndex);
  return {
    source: 'migration/service-triple-map.json',
    arcanaServiceId: mapping.arcanaServiceId || null,
    label: mapping.label || null,
    encounterType: mapping.encounterType || null,
    bookingMethodLabel: mapping.bookingMethodLabel || null,
    offerTemplateKey: mapping.offerTemplateKey || null,
    publicBookable: mapping.publicBookable === true,
    documentRequirementKey: mapping.documentRequirementKey || null,
    coolingOffRef: mapping.coolingOffRef || null,
    coolingOffDays: documentRequirement?.coolingOffDays ?? null,
    coolingOffType: documentRequirement?.coolingOffType || null,
    journalTemplate: documentRequirement?.journalTemplate || null,
    aftercareTemplate: documentRequirement?.aftercareTemplate || null,
    canonicalAgreementVariant: documentRequirement?.canonicalAgreementVariant || null,
    requiredDocuments: documentRequirement?.requiredDocuments || {},
    documentRequirement,
    consentBindings,
    legacyAliases: asArray(mapping.legacyAliases),
    serviceVariants: asArray(mapping.serviceVariants),
  };
}

function applyCanonicalServiceRegisterToService(service = {}, register = {}) {
  return {
    ...service,
    label: register.label || service.label,
    encounterType: register.encounterType || service.encounterType || null,
    bookingMethodLabel: register.bookingMethodLabel || service.bookingMethodLabel || null,
    offerTemplateKey: register.offerTemplateKey || service.offerTemplateKey || null,
    publicBookable: register.publicBookable === true,
    documentRequirementKey:
      register.documentRequirementKey || service.documentRequirementKey || null,
    coolingOffRef: register.coolingOffRef || service.coolingOffRef || null,
    coolingOffDays: register.coolingOffDays ?? service.coolingOffDays ?? null,
    coolingOffType: register.coolingOffType || service.coolingOffType || null,
    consentBindings: register.consentBindings || service.consentBindings || null,
    serviceVariants: register.serviceVariants || service.serviceVariants || [],
    serviceRegister: register,
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

function buildServiceRegisterBookingPolicy(
  entries = readTripleMapEntries(loadLegacyCatalogBundle())
) {
  const publicServiceIds = new Set();
  const aliasToServiceId = new Map();

  for (const entry of asArray(entries)) {
    const mapping = buildLegacyMapping(entry);
    const id = normalizeText(mapping.arcanaServiceId);
    if (!id) continue;
    if (mapping.publicBookable === true) publicServiceIds.add(id);
    for (const alias of asArray(mapping.legacyAliases)) {
      const normalizedAlias = normalizeText(alias);
      if (normalizedAlias && normalizedAlias !== id) aliasToServiceId.set(normalizedAlias, id);
    }
  }

  return {
    publicServiceIds: Array.from(publicServiceIds).sort(),
    aliasToServiceId: Object.fromEntries(Array.from(aliasToServiceId.entries()).sort()),
  };
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

function mergeLegacyCatalogIntoEngineState(state) {
  const bundle = loadLegacyCatalogBundle();
  const entries = readTripleMapEntries(bundle);
  const planA = new Set();
  const servicesById = new Map(
    asArray(state.services).map((item) => [normalizeText(item.id), item])
  );
  const bindingIndex = buildMeridiqBindingIndex(bundle);
  const requirements = loadTreatmentDocumentRequirements();
  let changed = false;

  for (const entry of entries) {
    const mapping = buildLegacyMapping(entry);
    const id = mapping.arcanaServiceId;
    if (!id) continue;

    const existing = servicesById.get(id);
    const isPublicBookable = mapping.publicBookable === true;
    const nextLegacy = mapping;
    const serviceRegister = buildCanonicalServiceRegister(mapping, { bindingIndex, requirements });

    if (!existing) {
      servicesById.set(
        id,
        applyCanonicalServiceRegisterToService(
          {
            id,
            label: mapping.label || id,
            durationMinutes: defaultDurationForService(id),
            active: isPublicBookable,
            publicBookable: isPublicBookable,
            brand: mapping.brand || undefined,
            legacyMapping: nextLegacy,
            catalogSource: 'legacy_triple_map',
          },
          serviceRegister
        )
      );
      changed = true;
      continue;
    }

    const merged = applyCanonicalServiceRegisterToService(
      {
        ...existing,
        label: mapping.label || existing.label,
        brand: existing.brand || mapping.brand || undefined,
        legacyMapping: {
          ...(asObject(existing.legacyMapping) || {}),
          ...nextLegacy,
        },
        catalogSource: existing.catalogSource || 'legacy_triple_map',
      },
      serviceRegister
    );

    merged.active = isPublicBookable ? true : false;
    if (!isPublicBookable) {
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

const CLIENTO_RESOURCE_NAME_TO_ARCANA_ID = Object.freeze({
  fazli: 'fazli',
  egzona: 'egzona',
  'arya emami': 'arya',
  arya: 'arya',
  louise: 'louise',
  veronica: 'veronica',
  clara: 'clara',
  wendela: 'wendela',
  andrea: 'andrea',
  bittan: 'bittan',
});

const CLIENTO_RES_ID_TO_ARCANA_ID = Object.freeze({
  11458: 'fazli',
  10326: 'egzona',
  7339: 'arya',
  9893: 'louise',
  11727: 'veronica',
  7534: 'clara',
  11501: 'wendela',
  11329: 'andrea',
  11702: 'bittan',
});

function loadBookingScheduleMigrationDefaults({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, BOOKING_SCHEDULE_DEFAULTS_PATH);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function buildSrvIdToArcanaServiceIdMap(bundle = loadLegacyCatalogBundle()) {
  const map = new Map();
  for (const entry of readTripleMapEntries(bundle)) {
    const mapping = buildLegacyMapping(entry);
    const arcanaId = normalizeText(mapping.arcanaServiceId);
    if (!arcanaId) continue;
    for (const srvId of asArray(mapping.cliento?.srvIds)) {
      map.set(normalizeText(String(srvId)), arcanaId);
    }
    const primary = normalizeText(String(mapping.cliento?.primarySrvId || ''));
    if (primary) map.set(primary, arcanaId);
  }
  for (const item of asArray(bundle?.catalogs?.clientoServices?.services)) {
    const arcanaId = normalizeText(item.arcanaId);
    const srvId = normalizeText(String(item.srvId || ''));
    if (arcanaId && srvId) map.set(srvId, arcanaId);
  }
  return map;
}

function buildClientoResourceScheduleBindings(clientoResource = {}, srvMap = new Map()) {
  return asArray(clientoResource.services)
    .map((service) => {
      const srvId = normalizeText(String(service.srvId || ''));
      if (!srvId) return null;
      return {
        srvId,
        name: normalizeText(service.name),
        arcanaServiceId: srvMap.get(srvId) || null,
        webShowInBooking: service.webShowInBooking === true,
        webAllowBooking: service.webAllowBooking === true,
        scheduleSource: 'cliento_resource_catalog',
      };
    })
    .filter(Boolean);
}

function resolveArcanaResourceIdFromCliento(clientoResource = {}) {
  const resId = normalizeText(String(clientoResource.resId || ''));
  const mapped = CLIENTO_RES_ID_TO_ARCANA_ID[resId];
  if (mapped) return mapped;
  const nameKey = normalizeText(clientoResource.name).toLowerCase();
  for (const [needle, arcanaId] of Object.entries(CLIENTO_RESOURCE_NAME_TO_ARCANA_ID)) {
    if (nameKey === needle || nameKey.startsWith(`${needle} `)) return arcanaId;
  }
  if (!resId) return '';
  return `legacy-cliento-${resId}`;
}

function buildClientoDraftResource(clientoResource = {}, srvMap = new Map()) {
  const resId = normalizeText(String(clientoResource.resId || ''));
  const id = resolveArcanaResourceIdFromCliento(clientoResource);
  if (!id) return null;
  const label = normalizeText(clientoResource.name) || id;
  const scheduleBindings = buildClientoResourceScheduleBindings(clientoResource, srvMap);
  return {
    id,
    label,
    active: false,
    publicBookable: false,
    catalogSource: 'cliento_resource_catalog',
    resourceScheduleBindings: scheduleBindings,
    legacyMapping: {
      cliento: {
        resId,
        name: label,
        serviceCount: Number(clientoResource.serviceCount) || scheduleBindings.length,
        linkedSrvIds: scheduleBindings.map((item) => item.srvId),
      },
    },
  };
}

function mergeLegacyResourcesIntoEngineState(state, { planAPublicResourceIds = [] } = {}) {
  const bundle = loadLegacyCatalogBundle();
  const srvMap = buildSrvIdToArcanaServiceIdMap(bundle);
  const planA = new Set(asArray(planAPublicResourceIds).map(normalizeText).filter(Boolean));
  const resourcesById = new Map(
    asArray(state.resources).map((item) => [normalizeText(item.id), item])
  );
  let changed = false;
  let promoted = 0;

  for (const item of asArray(bundle?.catalogs?.clientoResources?.resources)) {
    const draft = buildClientoDraftResource(item, srvMap);
    if (!draft) continue;
    const existing = resourcesById.get(draft.id);
    const isPlanA = planA.has(draft.id);

    if (!existing) {
      resourcesById.set(draft.id, draft);
      promoted += 1;
      changed = true;
      continue;
    }

    const merged = {
      ...existing,
      label: existing.label || draft.label,
      catalogSource: existing.catalogSource || draft.catalogSource,
      resourceScheduleBindings: draft.resourceScheduleBindings,
      legacyMapping: {
        ...(asObject(existing.legacyMapping) || {}),
        ...draft.legacyMapping,
      },
    };
    if (!isPlanA && existing.publicBookable === true && !planA.has(draft.id)) {
      merged.publicBookable = false;
    }
    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      resourcesById.set(draft.id, merged);
      changed = true;
    }
  }

  if (changed) {
    state.resources = Array.from(resourcesById.values());
  }

  return {
    changed,
    promoted,
    resourceCount: resourcesById.size,
    clientoResourceTotal: Number(bundle?.counts?.clientoResources || 0),
    scheduleBindingsTotal: Array.from(resourcesById.values()).reduce(
      (sum, item) => sum + asArray(item.resourceScheduleBindings).length,
      0
    ),
  };
}

function readAddonCatalogSummary(bundle = loadLegacyCatalogBundle()) {
  const addonCatalog = bundle?.catalogs?.clientoAddons || {};
  const groups = asArray(
    addonCatalog.serviceGroups || bundle?.catalogs?.clientoResources?.serviceGroups
  );
  const addonGroups = groups.filter((group) => group?.addon === true);
  const addonServiceIds = addonGroups.flatMap((group) => asArray(group.serviceIds));
  const addonServices = asArray(addonCatalog.services);
  return {
    addonGroupCount: addonGroups.length,
    addonServiceIdCount: addonServiceIds.length,
    addonServiceExportCount: addonServices.length,
    groups: addonGroups.map((group) => ({
      id: group.id,
      name: normalizeText(group.name),
      serviceIds: asArray(group.serviceIds),
    })),
    services: addonServices.map((service) => ({
      srvId: normalizeText(String(service.srvId || '')),
      name: normalizeText(service.name),
    })),
    note:
      addonServiceIds.length === 0 && addonServices.length === 0
        ? 'Tilläggstjänster-grupp finns i Cliento men inga tjänster exporterade ännu.'
        : null,
  };
}

function wireAddonServicesIntoEngineState(state) {
  const bundle = loadLegacyCatalogBundle();
  const addonSummary = readAddonCatalogSummary(bundle);
  const addonSrvIds = new Set([
    ...addonSummary.groups.flatMap((group) => group.serviceIds.map((id) => String(id))),
    ...addonSummary.services.map((item) => item.srvId).filter(Boolean),
  ]);
  let changed = false;
  state.services = asArray(state.services).map((service) => {
    const legacySrvIds = asArray(service.legacyMapping?.cliento?.srvIds).map((id) => String(id));
    const primarySrvId = normalizeText(String(service.legacyMapping?.cliento?.primarySrvId || ''));
    const isAddon =
      service.isAddon === true ||
      legacySrvIds.some((id) => addonSrvIds.has(id)) ||
      (primarySrvId && addonSrvIds.has(primarySrvId));
    if (!isAddon && service.isAddon !== true) return service;
    const next = {
      ...service,
      isAddon: true,
      catalogSource: service.catalogSource || 'cliento_addon_catalog',
    };
    if (JSON.stringify(service) !== JSON.stringify(next)) changed = true;
    return next;
  });
  return { changed, addonSummary };
}

function mergeClientoPricingIntoServices(state, pricingRules = normalizePricingRules()) {
  let changed = false;
  state.services = asArray(state.services).map((service) => {
    const next = applyBookingPricingMigrationToService(service, pricingRules);
    if (JSON.stringify(service) !== JSON.stringify(next)) changed = true;
    return next;
  });
  return { changed, pricingRules };
}

function mergeClientoSchedulesIntoEngineState(state) {
  const scheduleDefaults = loadBookingScheduleMigrationDefaults();
  const rulesById = new Map(
    asArray(state.availabilityRules).map((item) => [normalizeText(item.ruleId), item])
  );
  let changed = false;
  let mergedRules = 0;

  for (const rule of asArray(scheduleDefaults.eveningWeekendRules)) {
    const ruleId = normalizeText(rule.ruleId);
    if (!ruleId) continue;
    const nextRule = {
      ruleId,
      resourceId: normalizeText(rule.resourceId),
      serviceId: normalizeText(rule.serviceId),
      weekdays: asArray(rule.weekdays),
      startTimes: asArray(rule.startTimes),
      locationLabel: normalizeText(rule.locationLabel || 'Hair TP Clinic'),
      scheduleTier: normalizeText(rule.scheduleTier) || undefined,
      active: rule.active !== false,
    };
    const existing = rulesById.get(ruleId);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(nextRule)) {
      rulesById.set(ruleId, nextRule);
      mergedRules += 1;
      changed = true;
    }
  }

  if (changed) {
    state.availabilityRules = Array.from(rulesById.values());
  }

  return {
    changed,
    mergedRules,
    clientoResourceCount:
      Number(scheduleDefaults.clientoResourceCount) ||
      asArray(scheduleDefaults.clientoResources).length ||
      16,
  };
}

function buildResourceCatalogReadout(state, bundle = loadLegacyCatalogBundle()) {
  const scheduleDefaults = loadBookingScheduleMigrationDefaults();
  const clientoResources = asArray(bundle?.catalogs?.clientoResources?.resources);
  const engineById = new Map(
    asArray(state.resources).map((item) => [normalizeText(item.id), item])
  );
  const engineByResId = new Map();
  for (const resource of asArray(state.resources)) {
    const resId = normalizeText(String(resource.legacyMapping?.cliento?.resId || ''));
    if (resId) engineByResId.set(resId, resource);
  }

  const rows = clientoResources.map((item) => {
    const resId = normalizeText(String(item.resId || ''));
    const arcanaId = resolveArcanaResourceIdFromCliento(item);
    const engineResource = engineById.get(arcanaId) || engineByResId.get(resId) || null;
    const bindings = asArray(engineResource?.resourceScheduleBindings);
    return {
      resId,
      name: normalizeText(item.name),
      arcanaResourceId: engineResource?.id || arcanaId,
      wired: Boolean(engineResource?.legacyMapping?.cliento?.resId),
      serviceCount: Number(item.serviceCount) || bindings.length,
      scheduleBindingCount: bindings.length,
      virtualLane: asArray(scheduleDefaults.clientoResources).some(
        (row) => normalizeText(String(row.resId)) === resId && row.virtualLane === true
      ),
    };
  });

  return {
    source: 'migration/cliento/resource-catalog.json',
    total: rows.length,
    wiredCount: rows.filter((row) => row.wired).length,
    scheduleBindingCount: rows.reduce((sum, row) => sum + row.scheduleBindingCount, 0),
    resources: rows,
  };
}

function buildStaffRuntimeCatalogReadout(
  state,
  { planAPublicResourceIds = [], bookingPolicySettings = null } = {}
) {
  const planAResources = new Set(asArray(planAPublicResourceIds).map(normalizeText));
  const bundle = loadLegacyCatalogBundle();
  const tripleEntries = readTripleMapEntries(bundle);
  const policy = normalizeBookingPolicySettings(bookingPolicySettings || {});
  const pricingRules = normalizePricingRules();
  const resourceCatalog = buildResourceCatalogReadout(state, bundle);
  const addonCatalog = readAddonCatalogSummary(bundle);

  const services = asArray(state.services).map((service) => {
    const id = normalizeText(service.id);
    const isPlanA = service.publicBookable === true;
    const priced = applyBookingPricingMigrationToService(service, pricingRules);
    return {
      id,
      label: normalizeText(service.label),
      active: service.active !== false,
      publicBookable: service.publicBookable === true,
      planA: isPlanA,
      staffCatalogTier: isPlanA
        ? 'plan_a_public'
        : service.active !== false
          ? 'staff_active'
          : 'inactive_draft',
      brand: normalizeText(service.brand || service.legacyMapping?.brand),
      durationMinutes: Number(service.durationMinutes) || null,
      minNoticeMinutes: Number(service.minNoticeMinutes) || null,
      maxBookingDaysAhead: Number(service.maxBookingDaysAhead) || null,
      cancellationPolicyHours: Number(service.cancellationPolicyHours) || null,
      isAddon: service.isAddon === true,
      pricing: priced.pricing || null,
      encounterType:
        normalizeText(service.encounterType) || service.serviceRegister?.encounterType || null,
      bookingMethodLabel:
        normalizeText(service.bookingMethodLabel) ||
        service.serviceRegister?.bookingMethodLabel ||
        null,
      offerTemplateKey:
        normalizeText(service.offerTemplateKey) ||
        service.serviceRegister?.offerTemplateKey ||
        null,
      documentRequirementKey:
        normalizeText(service.documentRequirementKey) ||
        service.serviceRegister?.documentRequirementKey ||
        null,
      coolingOffDays: Number.isFinite(Number(service.coolingOffDays))
        ? Number(service.coolingOffDays)
        : (service.serviceRegister?.coolingOffDays ?? null),
      consentBindings: service.consentBindings || service.serviceRegister?.consentBindings || null,
      serviceVariants: asArray(service.serviceVariants || service.serviceRegister?.serviceVariants),
      serviceRegister: service.serviceRegister || null,
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
    clientoResId: normalizeText(String(resource.legacyMapping?.cliento?.resId || '')) || null,
    scheduleBindingCount: asArray(resource.resourceScheduleBindings).length,
    catalogSource: normalizeText(resource.catalogSource) || null,
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
    clientoResourceTotal: Number(bundle.counts?.clientoResources || 0),
    mapped,
    unmapped,
    planA,
    planAPublicServices: planA,
    staffActiveServices: services.filter((item) => item.staffCatalogTier === 'staff_active').length,
    inactiveDraftServices: services.filter((item) => item.staffCatalogTier === 'inactive_draft')
      .length,
    legacyMappedServices: services.filter((item) => item.legacyMapping).length,
    tripleMapEntries: tripleEntries.length,
    addonCatalog,
    resourceCatalog,
    bookingPolicy: policy.globalDefaults,
    pricingRules: pricingRules.globalRules,
    addonServiceCount: services.filter((item) => item.isAddon).length,
    scheduleRuleCount: asArray(state.availabilityRules).length,
  };

  return {
    exportedAt: new Date().toISOString(),
    policy: {
      publicWebBookingEnabled: false,
      note: 'Runtime-katalog för staff/operatör. Publik webb-API förblir av tills explicit go-live.',
      smartSlots: {
        minNoticeOnlineMinutes: policy.globalDefaults.minNoticeOnlineMinutes,
        minNoticePhysicalMinutes: policy.globalDefaults.minNoticePhysicalMinutes,
        maxBookingDaysAhead: policy.globalDefaults.maxBookingDaysAhead,
        cancellationPolicyHours: policy.globalDefaults.cancellationPolicyHours,
      },
    },
    planA: {
      serviceIds: services
        .filter((item) => item.planA && item.publicBookable)
        .map((item) => item.id),
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
  buildCanonicalServiceRegister,
  buildServiceRegisterBookingPolicy,
  collectMeridiqConsentBindings,
  collectMappedLegacyIds,
  mergeLegacyCatalogIntoEngineState,
  mergeLegacyResourcesIntoEngineState,
  mergeClientoPricingIntoServices,
  mergeClientoSchedulesIntoEngineState,
  wireAddonServicesIntoEngineState,
  buildResourceCatalogReadout,
  readAddonCatalogSummary,
  buildStaffRuntimeCatalogReadout,
  readTripleMapEntries,
  loadBookingScheduleMigrationDefaults,
};
