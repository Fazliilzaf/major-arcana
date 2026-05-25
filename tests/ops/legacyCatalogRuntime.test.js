'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeLegacyCatalogIntoEngineState,
  buildStaffRuntimeCatalogReadout,
  readTripleMapEntries,
} = require('../../src/ops/legacyCatalogRuntime');
const { loadLegacyCatalogBundle } = require('../../src/ops/legacyCatalogLoader');
const { PLAN_A_PUBLIC_SERVICE_IDS } = require('../../src/ops/ccoBookingEngineStore');

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
    assert.equal(draft.publicBookable, false);
    assert.equal(draft.active, false);
  }
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
    ],
    resources: [{ id: 'res-1', label: 'Resurs 1', active: true, publicBookable: false }],
  };

  const readout = buildStaffRuntimeCatalogReadout(state, {
    planAPublicServiceIds: PLAN_A_PUBLIC_SERVICE_IDS,
    planAPublicResourceIds: ['res-online-consult'],
  });

  assert.equal(readout.policy.publicWebBookingEnabled, false);
  assert.ok(readout.summary.totalServices >= 2);
  assert.ok(readout.summary.legacyMappedServices >= 2);
  assert.ok(readout.services.some((item) => item.planA && item.publicBookable));
  assert.ok(readout.services.some((item) => item.staffCatalogTier === 'staff_active'));
  assert.match(readout.policy.note, /go-live/i);
});
