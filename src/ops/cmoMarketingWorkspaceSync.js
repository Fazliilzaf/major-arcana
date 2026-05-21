'use strict';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function syncMarketingWorkspaceFromCmoOutput({
  tenantId = '',
  agentRunId = '',
  output = {},
  marketingCampaignDraftsStore = null,
  marketingContentAssetsStore = null,
} = {}) {
  const data = asObject(output?.data || output);
  let assetSync = { syncedCount: 0, assetIds: [], byCampaignId: {} };
  let campaignSync = { syncedCount: 0, pendingApprovalIds: [] };

  if (
    marketingContentAssetsStore &&
    typeof marketingContentAssetsStore.syncFromCmoOutput === 'function'
  ) {
    assetSync = await marketingContentAssetsStore.syncFromCmoOutput({
      tenantId,
      agentRunId,
      cmoData: data,
    });
  }

  if (
    marketingCampaignDraftsStore &&
    typeof marketingCampaignDraftsStore.syncFromCmoOutput === 'function'
  ) {
    campaignSync = await marketingCampaignDraftsStore.syncFromCmoOutput({
      tenantId,
      agentRunId,
      campaigns: data.campaigns,
      complianceReview: data.complianceReview,
      assetIdsByCampaign: assetSync.byCampaignId || {},
    });
  }

  return {
    assetSync,
    campaignSync,
    marketingDraftIds: campaignSync.pendingApprovalIds || [],
  };
}

module.exports = {
  syncMarketingWorkspaceFromCmoOutput,
};
