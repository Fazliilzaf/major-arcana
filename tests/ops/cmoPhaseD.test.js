const test = require('node:test');
const assert = require('node:assert/strict');

const { ProposeContentCalendarCapability } = require('../../src/capabilities/proposeContentCalendar');
const { ProposePublishScheduleCapability } = require('../../src/capabilities/proposePublishSchedule');
const { GenerateUtmPackCapability } = require('../../src/capabilities/generateUtmPack');
const { ValidateMarketingTrackingCapability } = require('../../src/capabilities/validateMarketingTracking');
const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');
const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const { runCmoWeeklyContentPlan } = require('../../src/ops/cmoSchedulerJobs');
const { validateMarketingTracking } = require('../../src/ops/cmoTrackingValidator');

const snapshot = {
  contentTopics: [{ topic: 'Trygg admin', suggestedFormat: 'guide' }],
  contentCalendar: [{ week: 1, topic: 'Old topic', targetDate: '2020-01-01', status: 'planned' }],
  tenantConfig: { brand: { displayName: 'Arcana' }, marketing: { websiteUrl: 'https://arcana.test' } },
  socialPostPack: {
    posts: [{ id: 'p1', platform: 'linkedin', caption: 'Läs mer om Arcana https://arcana.test/?utm_source=linkedin&utm_medium=social&utm_campaign=test' }],
  },
  adCopyPack: {
    ads: [{ id: 'a1', channel: 'google', headlines: ['Boka demo'], cta: 'Boka demo' }],
  },
};

test('ProposeContentCalendar returns weekly plan proposals', async () => {
  const capability = new ProposeContentCalendarCapability();
  const result = await capability.execute({
    input: { horizonWeeks: 3 },
    systemStateSnapshot: snapshot,
  });
  assert.equal(result.data.mode, 'proposal_only');
  assert.equal(result.data.autoPublish, false);
  assert.ok(result.data.weeklyPlan.length >= 3);
  assert.equal(result.data.weeklyPlan[0].status, 'proposed');
});

test('ProposePublishSchedule builds heuristic slots and flags missed dates', async () => {
  const capability = new ProposePublishScheduleCapability();
  const result = await capability.execute({
    input: { maxItems: 5 },
    systemStateSnapshot: {
      ...snapshot,
      proposedContentCalendar: {
        weeklyPlan: [{ week: 1, topic: 'Launch', channel: 'linkedin', targetDate: '2026-06-01' }],
      },
    },
  });
  assert.ok(result.data.scheduleItems.length >= 1);
  assert.ok(result.data.missedPublications.length >= 1);
  assert.equal(result.data.autoPublish, false);
});

test('GenerateUtmPack returns tracked links with naming convention', async () => {
  const capability = new GenerateUtmPackCapability();
  const result = await capability.execute({
    input: { maxLinks: 4 },
    systemStateSnapshot: {
      ...snapshot,
      campaigns: [{ id: 'launch', name: 'Launch', channel: 'email' }],
    },
  });
  assert.ok(result.data.links.length >= 1);
  assert.match(result.data.links[0].url, /utm_source=/);
  assert.ok(result.data.namingConvention);
});

test('ValidateMarketingTracking flags missing UTM pack and validates links', async () => {
  const review = validateMarketingTracking({
    snapshot: {
      socialPostPack: {
        posts: [{ id: 'p1', platform: 'linkedin', caption: 'Läs mer på https://arcana.test/ utan tracking' }],
      },
      adCopyPack: { ads: [] },
    },
  });
  assert.equal(review.passed, true);
  assert.ok(review.issues.length >= 1);
  assert.ok(review.issues.some((issue) => issue.id === 'missing_utm_pack' || issue.id.startsWith('missing_utm_')));

  const capability = new ValidateMarketingTrackingCapability();
  const result = await capability.execute({
    systemStateSnapshot: {
      ...snapshot,
      utmPack: {
        links: [{ id: 'l1', channel: 'linkedin', url: 'https://arcana.test/?utm_source=linkedin&utm_medium=social&utm_campaign=test' }],
      },
    },
  });
  assert.equal(typeof result.data.passed, 'boolean');
  assert.ok(Array.isArray(result.data.issues));
});

test('composeCmoMarketingCopilot merges schedule and tracking outputs', () => {
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [], summary: 'Brief' }, warnings: [] },
    audienceOutput: { data: { segments: [] }, warnings: [] },
    campaignOutput: { data: { campaigns: [] }, warnings: [] },
    socialOutput: { data: { posts: [] }, warnings: [] },
    seoOutput: { data: { articles: [] }, warnings: [] },
    adOutput: { data: { ads: [] }, warnings: [] },
    emailOutput: { data: { emails: [] }, warnings: [] },
    repurposeOutput: { data: { variants: [] }, warnings: [] },
    claimsOutput: { data: { passed: true, flaggedClaims: [] }, warnings: [] },
    complianceOutput: {
      data: { status: 'passed', clinicalGuard: { blocked: false, hits: [] }, checks: [] },
      warnings: [],
    },
    calendarOutput: {
      data: { weeklyPlan: [{ week: 1, topic: 'Plan', channel: 'linkedin', targetDate: '2026-06-01' }] },
      warnings: [],
    },
    scheduleOutput: {
      data: {
        scheduleItems: [{ id: 's1', platform: 'linkedin', proposedAt: '2026-06-01T08:00:00.000Z' }],
        missedPublications: [{ topic: 'Old', targetDate: '2020-01-01' }],
      },
      warnings: [],
    },
    utmOutput: { data: { links: [{ id: 'u1', url: 'https://arcana.test/?utm_source=linkedin&utm_medium=social&utm_campaign=test' }] }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true, issues: [] }, warnings: [] },
  });

  assert.equal(composed.metadata.version, '1.5.0');
  assert.equal(composed.data.scheduleItems.length, 1);
  assert.equal(composed.data.utmPack.links.length, 1);
  assert.equal(composed.data.scheduleAllowed, true);
  assert.equal(composed.data.missedPublications.length, 1);
});

test('executive feed adds missed publication and schedule review entries', () => {
  const feed = createExecutiveDecisionFeed();
  feed.addFromAgentOutput({
    agent: 'CMO',
    tenantId: 'default',
    output: {
      data: {
        executiveSummary: 'Plan klar',
        disclaimer: 'Draft only',
        campaigns: [],
        scheduleAllowed: true,
        scheduleItems: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
        missedPublications: [{ topic: 'Late post', targetDate: '2020-01-01' }],
        productionCounts: { socialPosts: 2 },
      },
    },
  });
  const items = feed.list({ limit: 20 });
  assert.ok(items.some((item) => item.actionType === 'review_missed_publications'));
  assert.ok(items.some((item) => item.actionType === 'review_publish_schedule'));
});

test('runCmoWeeklyContentPlan executes schedule capabilities via executor', async () => {
  const calls = [];
  const capabilityExecutor = {
    async runCapability({ capabilityName, systemStateSnapshot, input }) {
      calls.push(capabilityName);
      if (capabilityName === 'ProposeContentCalendar') {
        return {
          output: {
            data: {
              weeklyPlan: [{ week: 1, topic: 'Weekly', channel: 'linkedin', targetDate: '2026-06-01' }],
              summary: '1 week plan',
            },
          },
        };
      }
      if (capabilityName === 'ProposePublishSchedule') {
        return {
          output: {
            data: {
              scheduleItems: [
                {
                  id: 's1',
                  platform: 'linkedin',
                  proposedAt: '2026-06-01T08:00:00.000Z',
                  topic: 'Weekly',
                  status: 'proposed',
                },
              ],
              missedPublications: [],
              summary: 'schedule ok',
            },
          },
        };
      }
      if (capabilityName === 'GenerateUtmPack') {
        return { output: { data: { links: [{ id: 'u1', url: 'https://arcana.test/?utm_source=linkedin&utm_medium=social&utm_campaign=test' }] } } };
      }
      if (capabilityName === 'ValidateMarketingTracking') {
        return { output: { data: { status: 'passed', passed: true, issues: [] } } };
      }
      return { output: { data: {} } };
    },
  };

  const feed = createExecutiveDecisionFeed();
  const result = await runCmoWeeklyContentPlan({
    tenantId: 'default',
    capabilityExecutor,
    templateStore: { async listTemplates() { return []; } },
    tenantConfigStore: { async getTenantConfig() { return { brand: { displayName: 'Arcana' } }; } },
    executiveDecisionFeed: feed,
    minNotifyRiskLevel: 'L3',
    config: { marketingClaimsWhitelistPath: '' },
  });

  assert.deepEqual(calls, [
    'ProposeContentCalendar',
    'ProposePublishSchedule',
    'GenerateUtmPack',
    'ValidateMarketingTracking',
  ]);
  assert.equal(result.weeklySlots, 1);
  assert.equal(result.scheduleItems, 1);
  assert.ok(feed.list().length >= 1);
});
