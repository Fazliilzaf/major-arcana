'use strict';

const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createMarketingWorkspaceRouter({
  authStore,
  marketingCampaignDraftsStore,
  marketingContentAssetsStore = null,
  marketingClaimsWhitelistStore = null,
  config = null,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/marketing/content-assets',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (
          !marketingContentAssetsStore ||
          typeof marketingContentAssetsStore.listAssets !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing content asset store saknas.' });
        }
        const items = await marketingContentAssetsStore.listAssets({
          tenantId: req.auth.tenantId,
          campaignId: normalizeText(req.query?.campaignId),
          assetType: normalizeText(req.query?.assetType),
          status: normalizeText(req.query?.status),
          limit: Number(req.query?.limit) || 200,
        });
        return res.json({
          items,
          summary: {
            total: items.length,
            pendingApproval: items.filter((item) => item.status === 'pending_approval').length,
            approved: items.filter((item) => item.status === 'approved').length,
          },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa content assets.' });
      }
    }
  );

  router.get(
    '/marketing/content-assets/:assetId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (
          !marketingContentAssetsStore ||
          typeof marketingContentAssetsStore.getAsset !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing content asset store saknas.' });
        }
        const item = await marketingContentAssetsStore.getAsset({
          tenantId: req.auth.tenantId,
          id: normalizeText(req.params?.assetId),
        });
        if (!item) {
          return res.status(404).json({ error: 'Content asset hittades inte.' });
        }
        return res.json({ item });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa content asset.' });
      }
    }
  );

  router.get(
    '/marketing/campaigns',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (
          !marketingCampaignDraftsStore ||
          typeof marketingCampaignDraftsStore.listCampaigns !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing campaign store saknas.' });
        }
        const items = await marketingCampaignDraftsStore.listCampaigns({
          tenantId: req.auth.tenantId,
          status: normalizeText(req.query?.status),
          owner: normalizeText(req.query?.owner),
          limit: Number(req.query?.limit) || 200,
        });
        return res.json({
          items,
          summary: {
            total: items.length,
            pendingApproval: items.filter((item) => item.status === 'pending_approval').length,
            approved: items.filter((item) => item.status === 'approved').length,
            blocked: items.filter((item) => item.status === 'compliance_blocked').length,
          },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa kampanjutkast.' });
      }
    }
  );

  router.get(
    '/marketing/campaigns/:campaignId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (
          !marketingCampaignDraftsStore ||
          typeof marketingCampaignDraftsStore.getCampaign !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing campaign store saknas.' });
        }
        const campaignId = normalizeText(req.params?.campaignId);
        const item = await marketingCampaignDraftsStore.getCampaign({
          tenantId: req.auth.tenantId,
          id: campaignId,
        });
        if (!item) {
          return res.status(404).json({ error: 'Kampanjutkast hittades inte.' });
        }
        return res.json({ item });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa kampanjutkast.' });
      }
    }
  );

  router.patch(
    '/marketing/campaigns/:campaignId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (
          !marketingCampaignDraftsStore ||
          typeof marketingCampaignDraftsStore.patchCampaign !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing campaign store saknas.' });
        }
        const campaignId = normalizeText(req.params?.campaignId);
        const existing = await marketingCampaignDraftsStore.getCampaign({
          tenantId: req.auth.tenantId,
          id: campaignId,
        });
        if (!existing) {
          return res.status(404).json({ error: 'Kampanjutkast hittades inte.' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const result = await marketingCampaignDraftsStore.patchCampaign({
          tenantId: req.auth.tenantId,
          id: campaignId,
          fields: body,
          changedBy: req.auth.userId,
        });
        if (!result || !result.updatedFields?.length) {
          return res.status(400).json({
            error: 'Inga fält att uppdatera (owner, status, scheduleProposal).',
          });
        }

        if (authStore && typeof authStore.addAuditEvent === 'function') {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'cmo.campaign.update',
            outcome: 'success',
            targetType: 'marketing_campaign_draft',
            targetId: campaignId,
            metadata: {
              fields: result.updatedFields,
              owner: result.item.owner || null,
              status: result.item.status || null,
            },
          });
        }
        return res.json(result);
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte uppdatera kampanjutkast.' });
      }
    }
  );

  router.post(
    '/marketing/campaigns/:campaignId/approve',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (
          !marketingCampaignDraftsStore ||
          typeof marketingCampaignDraftsStore.approveCampaign !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing campaign store saknas.' });
        }
        const campaignId = normalizeText(req.params?.campaignId);
        let item;
        try {
          item = await marketingCampaignDraftsStore.approveCampaign({
            tenantId: req.auth.tenantId,
            id: campaignId,
            approvedBy: req.auth.userId,
          });
        } catch (error) {
          if (error?.code === 'COMPLIANCE_BLOCKED') {
            return res.status(409).json({ error: error.message });
          }
          if (error?.code === 'INVALID_STATUS') {
            return res.status(409).json({ error: error.message });
          }
          throw error;
        }
        if (!item) {
          return res.status(404).json({ error: 'Kampanjutkast hittades inte.' });
        }

        let assetApproval = { approvedCount: 0, assetIds: [] };
        if (
          marketingContentAssetsStore &&
          typeof marketingContentAssetsStore.approveAssetsForCampaign === 'function'
        ) {
          assetApproval = await marketingContentAssetsStore.approveAssetsForCampaign({
            tenantId: req.auth.tenantId,
            campaignId,
            approvedBy: req.auth.userId,
          });
        }

        if (authStore && typeof authStore.addAuditEvent === 'function') {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'cmo.campaign.approve',
            outcome: 'success',
            targetType: 'marketing_campaign_draft',
            targetId: campaignId,
            metadata: {
              version: item.version,
              approvedAt: item.approvedAt,
              approvedAssetCount: assetApproval.approvedCount,
            },
          });
        }
        return res.json({ item, assetApproval });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte godkänna kampanj.' });
      }
    }
  );

  router.post(
    '/marketing/campaigns/:campaignId/reject',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (
          !marketingCampaignDraftsStore ||
          typeof marketingCampaignDraftsStore.rejectCampaign !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing campaign store saknas.' });
        }
        const campaignId = normalizeText(req.params?.campaignId);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const item = await marketingCampaignDraftsStore.rejectCampaign({
          tenantId: req.auth.tenantId,
          id: campaignId,
          rejectedBy: req.auth.userId,
          reason: normalizeText(body.reason),
        });
        if (!item) {
          return res.status(404).json({ error: 'Kampanjutkast hittades inte.' });
        }

        if (authStore && typeof authStore.addAuditEvent === 'function') {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'cmo.campaign.reject',
            outcome: 'success',
            targetType: 'marketing_campaign_draft',
            targetId: campaignId,
            metadata: {
              version: item.version,
              reason: item.rejectionReason || null,
            },
          });
        }
        return res.json({ item });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte avvisa kampanj.' });
      }
    }
  );

  router.get(
    '/marketing/publish-policy',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const {
          resolvePublishPolicyConfig,
          CHANNEL_RISK_LEVEL,
          PUBLISH_MODES,
        } = require('../ops/cmoPublishPolicy');
        const loadedConfig = config && typeof config === 'object' ? config : require('../config');
        const appConfig = loadedConfig.config && typeof loadedConfig.config === 'object'
          ? loadedConfig.config
          : loadedConfig;
        const policy = resolvePublishPolicyConfig(appConfig, {});
        return res.json({
          policy,
          modes: PUBLISH_MODES,
          channelRiskLevels: CHANNEL_RISK_LEVEL,
          summary: {
            pilotEnabled: policy.pilotEnabled,
            pilotChannels: policy.pilotChannels,
            maxRiskLevel: policy.maxRiskLevel,
            autoPublishGlobal: false,
          },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa publish policy.' });
      }
    }
  );

  router.get(
    '/marketing/connectors/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const { listConnectorStatuses, resolveAppConfig } = require('../ops/cmoMarketingConnectors');
        const loadedConfig = config && typeof config === 'object' ? config : require('../config');
        const appConfig = resolveAppConfig(loadedConfig);
        const window = normalizeText(req.query?.window) || '7d';
        const items = await listConnectorStatuses({
          config: appConfig,
          tenantId: req.auth.tenantId,
          window,
        });
        return res.json({
          items,
          summary: {
            total: items.length,
            configured: items.filter((item) => item.status !== 'not_configured').length,
            ok: items.filter((item) => item.status === 'ok').length,
            error: items.filter((item) => item.status === 'error').length,
          },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa connector-status.' });
      }
    }
  );

  router.get(
    '/marketing/claims/whitelist',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (_req, res) => {
      try {
        if (
          !marketingClaimsWhitelistStore ||
          typeof marketingClaimsWhitelistStore.listClaims !== 'function'
        ) {
          return res.status(503).json({ error: 'Marketing claims whitelist saknas.' });
        }
        const items = await marketingClaimsWhitelistStore.listClaims();
        return res.json({ items, summary: { total: items.length } });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa claims whitelist.' });
      }
    }
  );

  return router;
}

module.exports = {
  createMarketingWorkspaceRouter,
};
