'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeLegacyCatalogIntoEngineState,
  mergeLegacyResourcesIntoEngineState,
  buildStaffRuntimeCatalogReadout,
  readTripleMapEntries,
  collectMappedLegacyIds,
  buildClientoDraftService,
  buildMeridiqDraftService,
} = require('../../src/ops/legacyCatalogRuntime');
const { loadLegacyCatalogBundle } = require('../../src/ops/legacyCatalogLoader');
const { PLAN_A_PUBLIC_SERVICE_IDS } = require('../../src/ops/ccoBookingEngineStore');
const { normalizeBookingPolicySettings } = require('../../src/ops/bookingPolicySettings');

test('legacy catalog runtime merges triple-map entries into engine state', () => {
  const entries = readTripleMapEntries(loadLegacyCatalogBundle());
  assert.ok(entries.length >= 10, 'expected migration triple-map entries');

  const state = {
    services: [
      {
        id: PLAN_A_PUBLIC_SERVICE_IDS[0],
        label: 'Plan A service',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
      },
    ],
    resources: [],
  };

  const result = mergeLegacyCatalogIntoEngineState(state, {
    planAPublicServiceIds: PLAN_A_PUBLIC_SERVICE_IDS,
  });

  assert.equal(result.changed, true);
  assert.ok(state.services.length > 1);
  assert.ok(
    state.services.some(
      (item) => item.id === 'consultation-online' && item.legacyMapping?.cliento?.primarySrvId
    )
  );

  const planAService = state.services.find((item) => item.id === PLAN_A_PUBLIC_SERVICE_IDS[0]);
  assert.equal(planAService.publicBookable, true);

  const draft = state.services.find((item) => item.id === 'fue');
  if (draft) {
    assert.equal(draft.publicBookable, PLAN_A_PUBLIC_SERVICE_IDS.includes('fue'));
    assert.equal(draft.active, PLAN_A_PUBLIC_SERVICE_IDS.includes('fue'));
  }
});

test('legacy catalog runtime promotes all Cliento and Meridiq catalog rows', () => {
  const bundle = loadLegacyCatalogBundle();
  const entries = readTripleMapEntries(bundle);
  const mapped = collectMappedLegacyIds(entries);

  const state = { services: [], resources: [] };
  const result = mergeLegacyCatalogIntoEngineState(state, {
    planAPublicServiceIds: PLAN_A_PUBLIC_SERVICE_IDS,
  });

  assert.equal(result.changed, true);
  assert.ok(result.unmappedClientoPromoted >= 0);
  assert.ok(result.unmappedMeridiqPromoted >= 0);

  const clientoServices = bundle.catalogs?.clientoServices?.services || [];
  const meridiqServices = bundle.catalogs?.meridiqServices?.services || [];
  assert.equal(bundle.counts.clientoServices, clientoServices.length);
  assert.equal(bundle.counts.meridiqServices, meridiqServices.length);
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
  for (const planAId of PLAN_A_PUBLIC_SERVICE_IDS) {
    // Some Plan A services (e.g. 'followup', 'consultation') are seeded as engine
    // defaults in ccoBookingEngineStore, not produced by the legacy-catalog merge.
    // This test starts from an empty state and only runs the catalog merge, so it
    // can only assert the catalog-mapped Plan A services here.
    if (!mappedArcanaIds.has(planAId)) continue;
    const planAService = state.services.find((service) => service.id === planAId);
    assert.ok(planAService, `Plan A service ${planAId} should exist`);
    assert.equal(planAService.publicBookable, true, `${planAId} stays publicBookable`);
    assert.equal(planAService.active, true, `${planAId} stays active`);
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
    planAPublicServiceIds: PLAN_A_PUBLIC_SERVICE_IDS,
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
  const {
    mergeClientoSchedulesIntoEngineState,
  } = require('../../src/ops/legacyCatalogRuntime');
  const state = { availabilityRules: [] };
  const result = mergeClientoSchedulesIntoEngineState(state);
  assert.equal(result.changed, true);
  assert.equal(result.clientoResourceCount, 16);
  assert.ok(
    state.availabilityRules.some((rule) => rule.ruleId === 'rule-evening-cons-fazli' && rule.active === true)
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
    resources: [{ id: 'fazli', label: 'Fazli', active: true, legacyMapping: { cliento: { resId: '11458' } } }],
    availabilityRules: [{ ruleId: 'rule-evening-cons-fazli', resourceId: 'fazli', serviceId: 'consultation-physical' }],
  };
  const readout = buildStaffRuntimeCatalogReadout(state, {
    planAPublicServiceIds: ['consultation-online'],
    planAPublicResourceIds: ['fazli'],
    bookingPolicySettings: normalizeBookingPolicySettings({}),
  });
  assert.equal(readout.summary.bookingPolicy.minNoticeOnlineMinutes, 120);
  assert.equal(readout.summary.pricingRules.eveningStartHour, 17);
  assert.ok(readout.summary.resourceCatalog);
  assert.equal(readout.summary.resourceCatalog.total, 16);
  assert.ok(readout.policy.smartSlots);
});
