const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ValidateMarketingClaimsCapability } = require('../../src/capabilities/validateMarketingClaims');
const { ReviewMarketingComplianceCapability } = require('../../src/capabilities/reviewMarketingCompliance');
const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');
const { createMarketingClaimsWhitelistStore } = require('../../src/ops/marketingClaimsWhitelistStore');
const { evaluatePolicyFloorText, POLICY_CONTEXT } = require('../../src/policy/floor');

test('ValidateMarketingClaims flags risky copy without whitelist match', async () => {
  const capability = new ValidateMarketingClaimsCapability();
  const result = await capability.execute({
    systemStateSnapshot: {
      marketingClaimsWhitelist: [
        { id: 'ok', text: 'strukturerad vårdadministration', category: 'product' },
      ],
      socialPostPack: {
        posts: [{ id: 'p1', caption: 'Vi garanterar resultat till alla patienter.' }],
      },
    },
  });

  assert.equal(result.data.passed, false);
  assert.ok(result.data.flaggedClaims.length >= 1);
});

test('ReviewMarketingCompliance blocks clinical guard hits', async () => {
  const capability = new ReviewMarketingComplianceCapability();
  const result = await capability.execute({
    systemStateSnapshot: {
      validateMarketingClaims: { passed: true, flaggedClaims: [] },
      adCopyPack: {
        ads: [{ id: 'a1', headlines: ['Vi botar alla problem direkt'] }],
      },
    },
  });

  assert.equal(result.data.status, 'blocked');
  assert.equal(result.data.clinicalGuard.blocked, true);
});

test('composeCmoMarketingCopilot downgrades ready campaigns when compliance blocked', () => {
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [], summary: 'Brief' }, warnings: [] },
    audienceOutput: { data: { segments: [] }, warnings: [] },
    campaignOutput: {
      data: { campaigns: [{ id: 'c1', readiness: 'ready', name: 'Launch' }] },
      warnings: [],
    },
    socialOutput: { data: { posts: [{ id: 's1', status: 'draft' }] }, warnings: [] },
    seoOutput: { data: { articles: [] }, warnings: [] },
    adOutput: { data: { ads: [] }, warnings: [] },
    emailOutput: { data: { emails: [] }, warnings: [] },
    repurposeOutput: { data: { variants: [] }, warnings: [] },
    claimsOutput: {
      data: {
        passed: false,
        flaggedClaims: [{ id: 'guarantee_result', severity: 'high', label: 'Resultatgaranti' }],
      },
      warnings: [],
    },
    complianceOutput: {
      data: {
        status: 'blocked',
        clinicalGuard: { blocked: true, hits: [{ id: 'NO_GUARANTEE_POLICY' }] },
        checks: [],
      },
      warnings: [],
    },
  });

  assert.equal(composed.data.complianceReview.status, 'blocked');
  assert.equal(composed.data.scheduleAllowed, false);
  assert.equal(composed.data.campaigns[0].readiness, 'compliance_blocked');
});

test('marketing policy floor includes MARKETING_COPY context', () => {
  const result = evaluatePolicyFloorText({
    text: 'Publicera direkt utan godkännande',
    context: POLICY_CONTEXT.MARKETING_COPY,
  });
  assert.equal(result.blocked, true);
  assert.ok(result.hits.some((hit) => hit.id === 'MARKETING_NO_AUTO_PUBLISH'));
});

test('marketing claims whitelist store seeds defaults', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-claims-'));
  const store = await createMarketingClaimsWhitelistStore({
    filePath: path.join(tempDir, 'marketing-claims-whitelist.json'),
  });
  const claims = await store.listClaims();
  assert.ok(claims.length >= 3);
  const seeded = await store.ensureSeedDefaults();
  assert.equal(seeded.seeded, false);
});
