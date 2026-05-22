const test = require('node:test');
const assert = require('node:assert/strict');

const { getAgentBundleByName, getCapabilityByName } = require('../../src/capabilities/registry');
const { validateCapabilityClass } = require('../../src/capabilities/capabilityContract');
const { buildCmoCapabilitySnapshot } = require('../fixtures/cmoCapabilitySnapshot');

const CMO_BUNDLE = getAgentBundleByName('CMO');
assert.ok(CMO_BUNDLE, 'CMO bundle must exist for contract tests');

const CAPABILITY_INPUTS = Object.freeze({
  GenerateContentBrief: { maxTopics: 3, targetAudience: 'klinikledning' },
  AnalyzeAudienceSegments: { maxSegments: 4 },
  GenerateOutreachCampaign: { maxCampaigns: 3 },
  GenerateSocialPostPack: { maxPosts: 4, tone: 'professional', platforms: ['linkedin'] },
  GenerateSeoBrief: { maxArticles: 2 },
  GenerateAdCopyPack: { maxAds: 3 },
  GenerateEmailDraft: { maxEmails: 2, emailType: 'newsletter' },
  RepurposeContent: { sourceType: 'blog' },
  ValidateMarketingClaims: {},
  ReviewMarketingCompliance: {},
  ProposeContentCalendar: { horizonWeeks: 2, includeMonthView: true },
  ProposePublishSchedule: { maxItems: 6 },
  GenerateUtmPack: { maxLinks: 4 },
  ValidateMarketingTracking: {},
  SummarizeMarketingPerformance: { windowDays: 7 },
  GenerateMarketingBrief: { period: 'weekly', windowDays: 7 },
  GenerateSalesEnablementPack: { maxBattlecards: 2 },
  ProposeCrisisCommsHold: { scenario: 'operational_incident' },
  AnalyzeCompetitorLandscape: { maxCompetitors: 3, focusArea: 'compliance' },
  GenerateNurtureSequence: { maxTouches: 4, segment: 'mql' },
  GenerateWinbackCampaign: { inactivityDays: 60, maxTouches: 3 },
});

const EXECUTE_CONTEXT = Object.freeze({
  tenantId: 'tenant-a',
  actor: { id: 'owner-a', role: 'OWNER' },
  channel: 'admin',
});

test('all CMO bundle capabilities pass capability contract validation', () => {
  for (const capabilityName of CMO_BUNDLE.capabilities) {
    const capabilityClass = getCapabilityByName(capabilityName);
    assert.ok(capabilityClass, `missing capability class: ${capabilityName}`);
    const validation = validateCapabilityClass(capabilityClass);
    assert.equal(
      validation.ok,
      true,
      `${capabilityName}: ${validation.errors.join('; ')}`
    );
  }
});

test('CMO capabilities execute with shared snapshot fixture', async () => {
  const snapshot = buildCmoCapabilitySnapshot();

  for (const capabilityName of CMO_BUNDLE.capabilities) {
    const capabilityClass = getCapabilityByName(capabilityName);
    assert.ok(capabilityClass, capabilityName);
    const instance = new capabilityClass();
    const result = await instance.execute({
      input: CAPABILITY_INPUTS[capabilityName] || {},
      systemStateSnapshot: snapshot,
      ...EXECUTE_CONTEXT,
    });
    assert.ok(result, `${capabilityName} returned no result`);
    assert.ok(result.data && typeof result.data === 'object', `${capabilityName} missing data`);
    assert.ok(Array.isArray(result.warnings), `${capabilityName} missing warnings array`);
    if (Object.prototype.hasOwnProperty.call(result.data, 'autoPublish')) {
      assert.equal(result.data.autoPublish, false, `${capabilityName} must not auto-publish`);
    }
    if (Object.prototype.hasOwnProperty.call(result.data, 'autoSend')) {
      assert.equal(result.data.autoSend, false, `${capabilityName} must not auto-send`);
    }
  }
});

test('GenerateSalesEnablementPack contract output fields', async () => {
  const capabilityClass = getCapabilityByName('GenerateSalesEnablementPack');
  const result = await new capabilityClass().execute({
    input: { maxBattlecards: 2 },
    systemStateSnapshot: buildCmoCapabilitySnapshot(),
    ...EXECUTE_CONTEXT,
  });
  assert.equal(result.data.outputType, 'SalesEnablementPack');
  assert.equal(typeof result.data.mqlDefinition, 'string');
  assert.equal(typeof result.data.sqlDefinition, 'string');
  assert.ok(Array.isArray(result.data.battlecards));
  assert.equal(result.data.autoPublish, false);
  assert.equal(result.data.readOnly, true);
});

test('ProposeCrisisCommsHold contract output fields', async () => {
  const capabilityClass = getCapabilityByName('ProposeCrisisCommsHold');
  const result = await new capabilityClass().execute({
    input: { scenario: 'operational_incident' },
    systemStateSnapshot: buildCmoCapabilitySnapshot({
      incidentSummary: { p0Open: 1, p1Open: 0 },
    }),
    ...EXECUTE_CONTEXT,
  });
  assert.equal(result.data.outputType, 'CrisisCommsHold');
  assert.equal(typeof result.data.holdingStatement, 'string');
  assert.equal(result.data.autoSend, false);
  assert.equal(result.data.pauseAllExternalCampaigns, true);
});

test('SummarizeMarketingPerformance contract enforces metric evidence fields', async () => {
  const capabilityClass = getCapabilityByName('SummarizeMarketingPerformance');
  const result = await new capabilityClass().execute({
    input: { windowDays: 7 },
    systemStateSnapshot: buildCmoCapabilitySnapshot(),
    ...EXECUTE_CONTEXT,
  });
  assert.equal(result.data.outputType, 'MarketingPerformanceSummary');
  assert.equal(result.data.status, 'ok');
  assert.ok(result.data.kpis.ctr);
  assert.equal(typeof result.data.kpis.ctr.source, 'string');
  assert.equal(result.data.kpis.ctr.fresh, true);
});
