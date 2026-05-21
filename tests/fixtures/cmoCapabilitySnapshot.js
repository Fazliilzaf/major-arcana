'use strict';

function freshMetric(value, source = 'google_ads', window = '7d') {
  return {
    value,
    source,
    window,
    fetchedAt: new Date().toISOString(),
    fresh: true,
  };
}

function buildCmoCapabilitySnapshot(overrides = {}) {
  const base = {
    tenantConfig: {
      tenantId: 'tenant-a',
      assistantName: 'Arcana',
      brand: { displayName: 'Arcana Clinic' },
      marketing: { websiteUrl: 'https://arcana.test' },
      toneStyle: 'professional-warm',
    },
    targetAudience: 'klinikledning',
    contentTopics: [
      { topic: 'Trygg vårdadministration', suggestedFormat: 'guide', rationale: 'Trust content' },
      { topic: 'Compliance i marknadsföring', suggestedFormat: 'artikel', rationale: 'Governance' },
    ],
    contentCalendar: [{ week: 1, topic: 'Trygg vårdadministration', channel: 'linkedin' }],
    audienceSegments: [
      {
        id: 'seg-clinic-leads',
        label: 'Klinikledning',
        persona: 'VD/COO',
        painPoints: ['Admin overhead', 'Compliance risk'],
      },
    ],
    campaigns: [
      {
        id: 'launch-q2',
        name: 'Q2 Launch',
        channel: 'email',
        readiness: 'ready',
        headline: 'Effektiv vårdadministration med Arcana',
        body: 'Utkast för klinikledning — kräver OWNER-godkännande.',
      },
    ],
    socialPostPack: {
      posts: [
        {
          id: 'social-1',
          platform: 'linkedin',
          text: 'Arcana hjälper kliniker med trygg admin-orkestrering.',
        },
      ],
    },
    seoBrief: {
      articles: [{ id: 'seo-1', title: 'Compliance i marknadsföring', keyword: 'vårdadministration' }],
    },
    adCopyPack: {
      ads: [{ id: 'ad-1', channel: 'google_ads', headline: 'Arcana för kliniker', body: 'Utkast only.' }],
    },
    emailDrafts: {
      emails: [{ id: 'mail-1', subject: 'Veckans admin-insikter', body: 'Utkast only.' }],
    },
    repurposedContent: {
      variants: [{ id: 'rep-1', format: 'carousel', sourceTopic: 'Trygg vårdadministration' }],
    },
    proposedContentCalendar: {
      weeklyPlan: [{ week: 1, topic: 'Trygg vårdadministration', channel: 'linkedin', targetDate: '2026-06-01' }],
    },
    utmPack: {
      links: [
        {
          id: 'utm-1',
          url: 'https://arcana.test/?utm_source=linkedin&utm_medium=social&utm_campaign=launch-q2',
          campaignId: 'launch-q2',
        },
      ],
    },
    validateMarketingClaims: {
      passed: true,
      flaggedClaims: [],
      reviewedCount: 1,
    },
    marketingClaimsWhitelist: [
      { id: 'claim-admin-efficiency', label: 'Minskar admin overhead', category: 'operational' },
    ],
    marketingPerformance: {
      channels: {
        google_ads: {
          source: 'google_ads',
          window: '7d',
          fetchedAt: new Date().toISOString(),
          fresh: true,
          metrics: {
            ctr: freshMetric(0.012, 'google_ads'),
            cpc: freshMetric(6.5, 'google_ads'),
            conversionRate: freshMetric(0.018, 'google_ads'),
          },
          spend: freshMetric(1200, 'google_ads'),
        },
        linkedin: {
          source: 'linkedin',
          window: '7d',
          fetchedAt: new Date().toISOString(),
          fresh: true,
          metrics: {
            ctr: freshMetric(0.03, 'linkedin'),
            cpc: freshMetric(2.1, 'linkedin'),
          },
          spend: freshMetric(400, 'linkedin'),
        },
      },
    },
    marketingPerformanceSummary: {
      status: 'ok',
      freshMetricCount: 6,
      kpis: { ctr: freshMetric(0.012, 'google_ads') },
      channelMix: [{ channel: 'google_ads', share: 0.75 }],
      underperformingAds: [],
    },
    operationalReadiness: { score: 88, band: 'controlled_go', goAllowed: true },
    incidentSummary: { p0Open: 0, p1Open: 0 },
    marketingBudget: { monthlyCap: 50000, currency: 'SEK' },
    spendProposal: { amount: 12000 },
    ccoCommercialHandoff: { battlecardRequested: true },
    competitorProfiles: [
      {
        id: 'comp-a',
        name: 'AdminSuite Pro',
        category: 'horizontal_software',
        positioning: 'Legacy praktiksystem',
        strengths: ['Marknadsledare'],
        weaknesses: ['Långsamma releaser'],
      },
    ],
    snapshotVersion: 'cmo.snapshot.contract.v1',
    timestamps: { capturedAt: new Date().toISOString() },
  };

  return { ...base, ...overrides };
}

module.exports = {
  buildCmoCapabilitySnapshot,
  freshMetric,
};
