const test = require('node:test');
const assert = require('node:assert/strict');

const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');
const { GenerateSocialPostPackCapability } = require('../../src/capabilities/generateSocialPostPack');
const { GenerateSeoBriefCapability } = require('../../src/capabilities/generateSeoBrief');
const { GenerateAdCopyPackCapability } = require('../../src/capabilities/generateAdCopyPack');
const { GenerateEmailDraftCapability } = require('../../src/capabilities/generateEmailDraft');
const { RepurposeContentCapability } = require('../../src/capabilities/repurposeContent');
const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');

const snapshot = {
  contentTopics: [{ topic: 'Säker admin i kliniken', suggestedFormat: 'guide' }],
  tenantConfig: { brand: { displayName: 'Arcana' } },
  targetAudience: 'klinikledning',
};

test('GenerateSocialPostPack returns platform drafts', async () => {
  const capability = new GenerateSocialPostPackCapability();
  const result = await capability.execute({
    input: { maxPosts: 5, tone: 'professional' },
    systemStateSnapshot: snapshot,
    tenantId: 'default',
  });
  assert.ok(result.data.posts.length >= 1);
  assert.equal(result.data.posts[0].status, 'draft');
  assert.equal(result.metadata.requiresOwnerApproval, true);
});

test('GenerateSeoBrief returns article briefs', async () => {
  const capability = new GenerateSeoBriefCapability();
  const result = await capability.execute({
    input: { maxArticles: 2 },
    systemStateSnapshot: snapshot,
  });
  assert.ok(result.data.articles.length >= 1);
  assert.ok(result.data.articles[0].title);
});

test('GenerateAdCopyPack returns ad drafts', async () => {
  const capability = new GenerateAdCopyPackCapability();
  const result = await capability.execute({
    input: { maxAds: 4 },
    systemStateSnapshot: { ...snapshot, audienceSegments: [{ id: 'it', label: 'IT-chef' }] },
  });
  assert.ok(result.data.ads.length >= 1);
  assert.equal(result.data.ads[0].requiresOwnerApproval, true);
});

test('GenerateEmailDraft returns mail outlines', async () => {
  const capability = new GenerateEmailDraftCapability();
  const result = await capability.execute({
    input: { emailType: 'nurture', maxEmails: 2 },
    systemStateSnapshot: snapshot,
  });
  assert.ok(result.data.emails.length >= 1);
});

test('RepurposeContent builds multi-channel variants', async () => {
  const capability = new RepurposeContentCapability();
  const result = await capability.execute({
    input: { sourceContent: 'Release notes v2.0', sourceType: 'release_notes' },
    systemStateSnapshot: snapshot,
  });
  assert.ok(result.data.variants.length >= 3);
});

test('composeCmoMarketingCopilot merges production packs', () => {
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: {
      data: {
        topics: snapshot.contentTopics,
        contentCalendar: [{ week: 1, topic: 'Test', format: 'guide' }],
        summary: 'Brief summary',
      },
      warnings: [],
    },
    audienceOutput: { data: { segments: [{ id: 'a', label: 'Segment A' }] }, warnings: [] },
    campaignOutput: {
      data: { campaigns: [{ id: 'c1', readiness: 'ready', name: 'Launch' }] },
      warnings: [],
    },
    socialOutput: { data: { posts: [{ id: 's1' }, { id: 's2' }] }, warnings: [] },
    seoOutput: { data: { articles: [{ id: 'seo1' }] }, warnings: [] },
    adOutput: { data: { ads: [{ id: 'ad1' }] }, warnings: [] },
    emailOutput: { data: { emails: [{ id: 'e1' }] }, warnings: [] },
    repurposeOutput: { data: { variants: [{ channel: 'linkedin' }] }, warnings: [] },
  });

  assert.equal(composed.data.outputType, 'MarketingCopilot');
  assert.equal(composed.data.productionCounts.socialPosts, 2);
  assert.equal(composed.data.campaignReadyCount, 1);
  assert.equal(composed.metadata.version, '1.5.0');
});

test('executive feed adds approve_social_batch for large social packs', () => {
  const feed = createExecutiveDecisionFeed();
  feed.addFromAgentOutput({
    agent: 'CMO',
    tenantId: 'default',
    output: {
      data: {
        executiveSummary: 'Test',
        disclaimer: 'Draft only',
        campaigns: [],
        productionCounts: { socialPosts: 6 },
      },
    },
  });
  const items = feed.list({ limit: 10 });
  assert.ok(items.some((item) => item.actionType === 'approve_social_batch'));
});
