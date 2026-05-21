const test = require('node:test');
const assert = require('node:assert/strict');

const { AnalyzeCompetitorLandscapeCapability } = require('../../src/capabilities/analyzeCompetitorLandscape');
const { GenerateNurtureSequenceCapability } = require('../../src/capabilities/generateNurtureSequence');
const { GenerateWinbackCampaignCapability } = require('../../src/capabilities/generateWinbackCampaign');
const { composeCmoStrategyIntelReport } = require('../../src/agents/cmoContentAgent');
const { listConnectorStatuses, CONNECTOR_STATUS } = require('../../src/ops/cmoMarketingConnectors');
const { getAgentBundleByName } = require('../../src/capabilities/registry');
const { buildCmoCapabilitySnapshot } = require('../fixtures/cmoCapabilitySnapshot');

test('AnalyzeCompetitorLandscape returns verified positioning with evidence flag', async () => {
  const capability = new AnalyzeCompetitorLandscapeCapability();
  const result = await capability.execute({
    input: { maxCompetitors: 2 },
    systemStateSnapshot: buildCmoCapabilitySnapshot(),
  });
  assert.equal(result.data.outputType, 'CompetitorLandscape');
  assert.ok(result.data.competitors.length >= 1);
  assert.equal(result.data.competitors[0].evidenceRequired, true);
  assert.equal(result.data.autoPublish, false);
});

test('GenerateNurtureSequence returns draft touches without auto-send', async () => {
  const capability = new GenerateNurtureSequenceCapability();
  const result = await capability.execute({
    input: { maxTouches: 4, segment: 'mql' },
    systemStateSnapshot: buildCmoCapabilitySnapshot(),
  });
  assert.equal(result.data.outputType, 'NurtureSequence');
  assert.ok(result.data.touches.length >= 2);
  assert.equal(result.data.autoSend, false);
});

test('GenerateWinbackCampaign returns winback draft', async () => {
  const capability = new GenerateWinbackCampaignCapability();
  const result = await capability.execute({
    input: { inactivityDays: 90, maxTouches: 3 },
    systemStateSnapshot: buildCmoCapabilitySnapshot(),
  });
  assert.equal(result.data.outputType, 'WinbackCampaign');
  assert.ok(result.data.touches.length >= 2);
  assert.equal(result.data.autoSend, false);
});

test('composeCmoStrategyIntelReport merges v2 strategy outputs', () => {
  const composed = composeCmoStrategyIntelReport({
    briefOutput: { data: { summary: 'Brief ok', topics: [] }, warnings: [] },
    audienceOutput: { data: { segments: [{ id: 's1', label: 'MQL' }] }, warnings: [] },
    competitorOutput: {
      data: { competitors: [{ id: 'c1', name: 'Rival' }], summary: 'Comp ok' },
      warnings: [],
    },
    nurtureOutput: { data: { touches: [{ id: 'n1' }], touchCount: 1 }, warnings: [] },
    winbackOutput: { data: { touches: [{ id: 'w1' }] }, warnings: [] },
    connectorStatuses: [{ channel: 'google_ads', status: CONNECTOR_STATUS.NOT_CONFIGURED }],
  });
  assert.equal(composed.data.mode, 'strategy_intel');
  assert.equal(composed.data.outputType, 'MarketingStrategyIntel');
  assert.equal(composed.metadata.version, '2.0.0');
  assert.equal(composed.data.autoPublish, false);
});

test('listConnectorStatuses returns not_configured for v2 stub', async () => {
  const statuses = await listConnectorStatuses({ config: {} });
  assert.ok(statuses.length >= 3);
  assert.ok(statuses.every((item) => item.status === CONNECTOR_STATUS.NOT_CONFIGURED));
});

test('CMO bundle v2 includes strategy intel capabilities', () => {
  const bundle = getAgentBundleByName('CMO');
  assert.equal(bundle.version, '2.0.0');
  assert.ok(bundle.capabilities.includes('AnalyzeCompetitorLandscape'));
});
