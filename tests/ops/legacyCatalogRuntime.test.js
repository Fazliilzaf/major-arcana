'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const {
  mergeLegacyCatalogIntoEngineState,
  mergeLegacyResourcesIntoEngineState,
  buildStaffRuntimeCatalogReadout,
  readTripleMapEntries,
  collectMappedLegacyIds,
  buildClientoDraftService,
  buildMeridiqDraftService,
  buildServiceRegisterBookingPolicy,
} = require('../../src/ops/legacyCatalogRuntime');
const { loadLegacyCatalogBundle } = require('../../src/ops/legacyCatalogLoader');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { normalizeBookingPolicySettings } = require('../../src/ops/bookingPolicySettings');

const SERVICE_REGISTER_PUBLIC_SERVICE_IDS = buildServiceRegisterBookingPolicy().publicServiceIds;

test('legacy catalog runtime merges triple-map entries into engine state', () => {
  const entries = readTripleMapEntries(loadLegacyCatalogBundle());
  assert.ok(entries.length >= 10, 'expected migration triple-map entries');

  const state = {
    services: [
      {
        id: SERVICE_REGISTER_PUBLIC_SERVICE_IDS[0],
        label: 'Register-public service',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
      },
    ],
    resources: [],
  };

  const result = mergeLegacyCatalogIntoEngineState(state);

  assert.equal(result.changed, true);
  assert.ok(state.services.length > 1);
  assert.ok(
    state.services.some(
      (item) => item.id === 'consultation-online' && item.legacyMapping?.cliento?.primarySrvId
    )
  );

  const planAService = state.services.find(
    (item) => item.id === SERVICE_REGISTER_PUBLIC_SERVICE_IDS[0]
  );
  assert.equal(planAService.publicBookable, true);

  const draft = state.services.find((item) => item.id === 'fue');
  if (draft) {
    assert.equal(draft.publicBookable, SERVICE_REGISTER_PUBLIC_SERVICE_IDS.includes('fue'));
    assert.equal(draft.active, SERVICE_REGISTER_PUBLIC_SERVICE_IDS.includes('fue'));
  }
});

test('legacy catalog runtime promotes all Cliento and Meridiq catalog rows', () => {
  const bundle = loadLegacyCatalogBundle();
  const entries = readTripleMapEntries(bundle);
  const mapped = collectMappedLegacyIds(entries);
  const bindingRows = bundle.catalogs?.meridiqBindings?.services || [];

  const state = { services: [], resources: [] };
  const result = mergeLegacyCatalogIntoEngineState(state);

  assert.equal(result.changed, true);
  assert.ok(result.unmappedClientoPromoted >= 0);
  assert.ok(result.unmappedMeridiqPromoted >= 0);

  const clientoServices = bundle.catalogs?.clientoServices?.services || [];
  const meridiqServices = bundle.catalogs?.meridiqServices?.services || [];
  assert.equal(bundle.counts.clientoServices, clientoServices.length);
  assert.equal(bundle.counts.meridiqServices, meridiqServices.length);
  assert.equal(bundle.counts.meridiqBindings, bindingRows.length);
  assert.ok(clientoServices.length >= 50);
  assert.ok(meridiqServices.length >= 80);

  for (const item of clientoServices) {
    const srvId = String(item.srvId || '');
    if (mapped.clientoSrvIds.has(srvId)) continue;
    const draftId = item.arcanaId || `legacy-cliento-${srvId}`;
    const promoted = state.services.find((service) => service.id === draftId);
    assert.ok(promoted, `expected Cliento srvId ${srvId} as draft ${draftId}`);
    assert.equal(promoted.active, false);
    assert.equal(promoted.publicBookable, false);
    assert.equal(promoted.catalogSource, 'cliento_catalog');
  }

  for (const item of meridiqServices) {
    const apiId = String(item.apiId);
    if (mapped.meridiqApiIds.has(apiId)) continue;
    const draftId = `legacy-meridiq-${apiId}`;
    const promoted = state.services.find((service) => service.id === draftId);
    assert.ok(promoted, `expected Meridiq apiId ${apiId} as draft ${draftId}`);
    assert.equal(promoted.catalogSource, 'meridiq_catalog');
  }

  const mappedArcanaIds = new Set(entries.map((entry) => entry.arcanaServiceId));
  for (const planAId of SERVICE_REGISTER_PUBLIC_SERVICE_IDS) {
    if (!mappedArcanaIds.has(planAId)) continue;
    const planAService = state.services.find((service) => service.id === planAId);
    assert.ok(planAService, `Plan A service ${planAId} should exist`);
    assert.equal(planAService.publicBookable, true, `${planAId} stays publicBookable`);
    assert.equal(planAService.active, true, `${planAId} stays active`);
  }
});

test('canonical service register materializes DHI into state.services with exact Meridiq consent bindings', () => {
  const state = { services: [], resources: [] };
  const result = mergeLegacyCatalogIntoEngineState(state);

  assert.equal(result.changed, true);
  const dhi = state.services.find((service) => service.id === 'dhi');
  assert.ok(dhi, 'expected DHI service from triple-map');
  assert.equal(dhi.label, 'DHI hårtransplantation');
  assert.equal(dhi.encounterType, 'transplant_dhi');
  assert.equal(dhi.bookingMethodLabel, 'DHI hårtransplantation');
  assert.equal(dhi.offerTemplateKey, 'dhi-standard');
  assert.equal(dhi.documentRequirementKey, 'dhi');
  assert.equal(dhi.coolingOffDays, 2);
  assert.equal(dhi.coolingOffType, 'distance_purchase');
  assert.equal(dhi.serviceRegister.source, 'migration/service-triple-map.json');
  assert.equal(
    dhi.serviceRegister.documentRequirement.source,
    'config/cco-treatment-document-requirements.json'
  );
  assert.equal(
    dhi.serviceRegister.documentRequirement.requiredDocuments.fitnessCertificate.blocking,
    true
  );
  assert.deepEqual(dhi.serviceRegister.consentBindings.missingApiIds, []);
  assert.ok(dhi.serviceRegister.consentBindings.matchedApiIds.includes('7097'));
  assert.ok(
    dhi.serviceRegister.consentBindings.consents.some(
      (consent) => consent.consentApiId === 170917 && consent.title === 'Behandlingsavtal | TP'
    )
  );
});

test('facit priced service menu materializes exactly 82 distinct Meridiq variants', () => {
  const entries = readTripleMapEntries(loadLegacyCatalogBundle());
  const rawVariants = entries.flatMap((entry) =>
    (entry.serviceVariants || []).map((variant) => ({
      ...variant,
      parentArcanaServiceId: entry.arcanaServiceId,
    }))
  );

  assert.equal(rawVariants.length, 82);
  assert.equal(new Set(rawVariants.map((variant) => variant.variantId)).size, 82);
  assert.equal(new Set(rawVariants.map((variant) => String(variant.meridiqApiId))).size, 82);

  const priceTypeCounts = rawVariants.reduce((counts, variant) => {
    const type = variant.price?.priceType || 'missing';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(priceTypeCounts, {
    fast: 57,
    paket: 16,
    'från/variabel': 1,
    tillägg: 3,
    konsultation: 5,
  });
  assert.equal(rawVariants.filter((variant) => variant.price?.amountSek === 0).length, 21);

  const byApiId = new Map(rawVariants.map((variant) => [String(variant.meridiqApiId), variant]));
  assert.equal(byApiId.get('7097').label, 'DHI Hårtransplantation: 1000 grafts');
  assert.equal(byApiId.get('7097').price.amountSek, 52000);
  assert.equal(byApiId.get('7414').price.priceType, 'från/variabel');
  assert.equal(byApiId.get('7414').parentArcanaServiceId, 'dhi');
  assert.equal(byApiId.get('7105').parentArcanaServiceId, 'bleph-combined');
  assert.equal(byApiId.get('7079').secondaryLabel, 'Onlinekonsultation');

  for (const variant of rawVariants) {
    assert.equal(variant.internalBookable, true, `${variant.variantId} is internally bookable`);
    assert.equal(variant.publicBookable, false, `${variant.variantId} is fail-closed public`);
    assert.match(variant.publicBookableDecision, /^fail_closed_/);
    assert.ok(
      entries.some((entry) => entry.arcanaServiceId === variant.clinicalParentArcanaServiceId),
      `${variant.variantId} points at an existing clinical parent`
    );
  }

  const state = { services: [], resources: [] };
  mergeLegacyCatalogIntoEngineState(state);
  const serviceVariants = state.services.flatMap(
    (service) => service.serviceRegister?.serviceVariants || []
  );
  assert.equal(serviceVariants.length, 82);
  const dhi = state.services.find((service) => service.id === 'dhi');
  assert.ok(
    dhi.serviceRegister.serviceVariants.some(
      (variant) =>
        variant.meridiqApiId === 7097 &&
        variant.price.amountSek === 52000 &&
        variant.clinicalParentArcanaServiceId === 'dhi'
    )
  );

  const unmapped = state.services.filter(
    (service) =>
      service.catalogSource === 'cliento_catalog' || service.catalogSource === 'meridiq_catalog'
  );
  assert.ok(unmapped.length > 0, 'expected remaining unmapped legacy material');
  assert.equal(unmapped.filter((service) => service.active === true).length, 0);
  assert.equal(unmapped.filter((service) => service.publicBookable === true).length, 0);
  for (const nowMappedApiId of ['8952', '8953', '8954', '7410', '7107']) {
    assert.equal(
      unmapped.some((service) => service.id === `legacy-meridiq-${nowMappedApiId}`),
      false,
      `${nowMappedApiId} is now mapped by the facit service menu`
    );
  }
});

test('booking engine exposes DHI service register fields after state normalization', async () => {
  const store = await createCcoBookingEngineStore({
    filePath: path.join(os.tmpdir(), `arcana-service-register-${process.pid}.json`),
  });
  const services = await store.listServices();
  const dhi = services.find((service) => service.id === 'dhi');

  assert.ok(dhi);
  assert.equal(dhi.label, 'DHI hårtransplantation');
  assert.equal(dhi.encounterType, 'transplant_dhi');
  assert.equal(dhi.bookingMethodLabel, 'DHI hårtransplantation');
  assert.equal(dhi.offerTemplateKey, 'dhi-standard');
  assert.equal(dhi.serviceRegister.documentRequirementKey, 'dhi');
  assert.ok(dhi.serviceRegister.consentBindings.consents.length >= 1);
  assert.ok(
    dhi.serviceRegister.serviceVariants.some(
      (variant) =>
        variant.variantId === 'dhi-7097-dhi-hartransplantation-1000-grafts' &&
        variant.price.amountSek === 52000
    )
  );
});

test('core consultation/followup variants resolve booking labels from the service register spine', () => {
  const { serviceToPlanMethod } = require('../../src/ops/ccoJournalBookingBridge');

  assert.equal(serviceToPlanMethod('consultation-online'), 'Online');
  assert.equal(serviceToPlanMethod('consultation'), 'Fysisk konsultation');
  assert.equal(serviceToPlanMethod('followup'), 'Uppföljning HT');
  assert.equal(serviceToPlanMethod('dhi'), 'DHI hårtransplantation');
});

test('service register booking policy derives public services and aliases from triple-map', () => {
  const policy = buildServiceRegisterBookingPolicy();
  assert.ok(policy.publicServiceIds.includes('dhi'));
  assert.ok(policy.publicServiceIds.includes('consultation-physical'));
  assert.ok(policy.publicServiceIds.includes('followup-transplant'));
  assert.equal(policy.aliasToServiceId.consultation, 'consultation-physical');
  assert.equal(policy.aliasToServiceId.followup, 'followup-transplant');
  assert.equal(policy.publicServiceIds.includes('legacy-cliento-60340'), false);
});

test('pricing defaults no longer duplicate Cliento identity outside the service triple-map', () => {
  const defaults = require('../../migration/booking-pricing-defaults.json');

  for (const [serviceId, pricing] of Object.entries(defaults.servicePricing || {})) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(pricing, 'clientoSrvId'),
      false,
      `${serviceId} should use migration/service-triple-map.json for Cliento identity`
    );
  }
});

test('draft builders preserve legacy metadata shape', () => {
  const clientoDraft = buildClientoDraftService({
    srvId: '99999',
    name: 'Test Cliento',
    brand: 'Hair TP Clinic',
    durationMin: 45,
  });
  assert.equal(clientoDraft.id, 'legacy-cliento-99999');
  assert.equal(clientoDraft.legacyMapping.cliento.primarySrvId, '99999');

  const meridiqDraft = buildMeridiqDraftService({
    apiId: 1234,
    name: 'Test Meridiq',
    brand: 'Hair TP Clinic',
    category: 'PRP',
    durationMin: 60,
  });
  assert.equal(meridiqDraft.id, 'legacy-meridiq-1234');
  assert.equal(meridiqDraft.legacyMapping.meridiq.primaryApiId, 1234);
});

test('staff runtime catalog readout exposes plan A vs staff tiers without public go-live', () => {
  const state = {
    services: [
      {
        id: 'consultation-online',
        label: 'Online konsultation',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
        legacyMapping: { arcanaServiceId: 'consultation-online', brand: 'Hair TP Clinic' },
        catalogSource: 'legacy_triple_map',
      },
      {
        id: 'prp-session',
        label: 'PRP',
        durationMinutes: 60,
        active: true,
        publicBookable: false,
        legacyMapping: { arcanaServiceId: 'prp-session' },
        catalogSource: 'legacy_triple_map',
      },
      {
        id: 'legacy-cliento-60340',
        label: 'Curatiio telefon',
        durationMinutes: 15,
        active: false,
        publicBookable: false,
        catalogSource: 'cliento_catalog',
        legacyMapping: { confidence: 'unmapped' },
      },
    ],
    resources: [{ id: 'res-1', label: 'Resurs 1', active: true, publicBookable: false }],
  };

  const readout = buildStaffRuntimeCatalogReadout(state, {
    planAPublicResourceIds: ['res-online-consult'],
  });

  assert.equal(readout.policy.publicWebBookingEnabled, false);
  assert.ok(readout.summary.totalServices >= 3);
  assert.ok(readout.summary.clientoTotal >= 50);
  assert.ok(readout.summary.meridiqTotal >= 80);
  assert.equal(readout.summary.mapped, 2);
  assert.equal(readout.summary.unmapped, 1);
  assert.ok(readout.summary.planA >= 1);
  assert.ok(readout.summary.legacyMappedServices >= 3);
  assert.ok(readout.services.some((item) => item.planA && item.publicBookable));
  assert.ok(readout.services.some((item) => item.staffCatalogTier === 'staff_active'));
  assert.match(readout.policy.note, /go-live/i);
  assert.ok(readout.summary.addonCatalog);
});

test('mergeLegacyResourcesIntoEngineState promotes Cliento resource catalog rows', () => {
  const state = {
    resources: [{ id: 'louise', label: 'Louise', active: true, publicBookable: false }],
    services: [],
  };
  const result = mergeLegacyResourcesIntoEngineState(state, { planAPublicResourceIds: [] });
  assert.equal(result.changed, true);
  assert.ok(state.resources.length >= 10);
  assert.ok(state.resources.some((item) => item.id === 'legacy-cliento-6677'));
  const fazli = state.resources.find((item) => item.id === 'fazli');
  assert.equal(fazli?.legacyMapping?.cliento?.resId, '11458');
  const louise = state.resources.find((item) => item.id === 'louise');
  assert.ok(louise?.legacyMapping?.cliento);
  assert.ok(Array.isArray(louise?.resourceScheduleBindings));
  assert.ok(result.scheduleBindingsTotal >= 1);
});

test('mergeClientoSchedulesIntoEngineState merges evening and weekend rules', () => {
  const { mergeClientoSchedulesIntoEngineState } = require('../../src/ops/legacyCatalogRuntime');
  const state = { availabilityRules: [] };
  const result = mergeClientoSchedulesIntoEngineState(state);
  assert.equal(result.changed, true);
  assert.equal(result.clientoResourceCount, 16);
  assert.ok(
    state.availabilityRules.some(
      (rule) => rule.ruleId === 'rule-evening-cons-fazli' && rule.active === true
    )
  );
});

test('buildResourceCatalogReadout wires all 16 Cliento resources', () => {
  const { buildResourceCatalogReadout } = require('../../src/ops/legacyCatalogRuntime');
  const state = {
    resources: [
      {
        id: 'fazli',
        label: 'Fazli',
        legacyMapping: { cliento: { resId: '11458' } },
        resourceScheduleBindings: [{ srvId: '63017' }],
      },
    ],
  };
  const readout = buildResourceCatalogReadout(state);
  assert.equal(readout.total, 16);
  assert.ok(readout.wiredCount >= 1);
  assert.ok(readout.resources.some((row) => row.resId === '11458' && row.wired));
});

test('buildStaffRuntimeCatalogReadout exposes booking policy and pricing rules', () => {
  const state = {
    services: [
      {
        id: 'consultation-online',
        label: 'Online',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
        meetingMode: 'online',
        minNoticeMinutes: 120,
        maxBookingDaysAhead: 180,
        cancellationPolicyHours: 24,
      },
    ],
    resources: [
      { id: 'fazli', label: 'Fazli', active: true, legacyMapping: { cliento: { resId: '11458' } } },
    ],
    availabilityRules: [
      {
        ruleId: 'rule-evening-cons-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-physical',
      },
    ],
  };
  const readout = buildStaffRuntimeCatalogReadout(state, {
    planAPublicResourceIds: ['fazli'],
    bookingPolicySettings: normalizeBookingPolicySettings({}),
  });
  assert.equal(readout.summary.bookingPolicy.minNoticeOnlineMinutes, 120);
  assert.equal(readout.summary.pricingRules.eveningStartHour, 17);
  assert.ok(readout.summary.resourceCatalog);
  assert.equal(readout.summary.resourceCatalog.total, 16);
  assert.ok(readout.policy.smartSlots);
});
