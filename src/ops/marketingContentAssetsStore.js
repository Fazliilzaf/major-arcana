'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  extractContentAssetsFromCmoOutput,
  groupAssetIdsByCampaign,
} = require('./cmoContentAssetExtract');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createEmptyState() {
  const ts = nowIso();
  return {
    version: 1,
    updatedAt: ts,
    assets: [],
  };
}

const TERMINAL_STATUSES = new Set(['approved', 'archived']);

function pushVersionHistory(asset, changeType, changedBy = '') {
  const versions = asArray(asset.versions);
  versions.unshift({
    version: asset.version,
    status: asset.status,
    title: asset.title,
    changeType: normalizeText(changeType) || 'update',
    changedBy: normalizeText(changedBy) || null,
    changedAt: nowIso(),
  });
  return versions.slice(0, 20);
}

function normalizeAsset(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    tenantId: normalizeText(source.tenantId) || 'default',
    campaignId: normalizeText(source.campaignId) || null,
    assetType: normalizeText(source.assetType) || 'content',
    channel: normalizeText(source.channel).toLowerCase() || 'unknown',
    title: normalizeText(source.title) || 'Untitled asset',
    body: normalizeText(source.body),
    status: normalizeText(source.status).toLowerCase() || 'draft',
    sourceAgentRunId: normalizeText(source.sourceAgentRunId) || null,
    metadata: asObject(source.metadata),
    autoPublish: false,
    requiresOwnerApproval: source.requiresOwnerApproval !== false,
    version: Math.max(1, Number(source.version) || 1),
    versions: asArray(source.versions),
    approvedBy: normalizeText(source.approvedBy) || null,
    approvedAt: normalizeText(source.approvedAt) || null,
    createdAt: normalizeText(source.createdAt) || nowIso(),
    updatedAt: normalizeText(source.updatedAt) || nowIso(),
  };
}

async function createMarketingContentAssetsStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('marketingContentAssetsStore filePath saknas.');

  let state = await readJson(resolvedPath, createEmptyState());
  if (!state || typeof state !== 'object') state = createEmptyState();
  if (!Array.isArray(state.assets)) state.assets = [];

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  function findIndex({ tenantId, id }) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedId = normalizeText(id);
    return state.assets.findIndex(
      (item) =>
        normalizeText(item.id) === normalizedId &&
        normalizeText(item.tenantId) === normalizedTenantId
    );
  }

  return {
    filePath: resolvedPath,

    async listAssets({
      tenantId = '',
      campaignId = '',
      assetType = '',
      status = '',
      limit = 200,
    } = {}) {
      const normalizedTenantId = normalizeText(tenantId);
      const normalizedCampaignId = normalizeText(campaignId);
      const normalizedAssetType = normalizeText(assetType).toLowerCase();
      const normalizedStatus = normalizeText(status).toLowerCase();
      const max = Math.max(1, Math.min(500, Number(limit) || 200));

      let items = state.assets.map((asset) => normalizeAsset(asset));
      if (normalizedTenantId) {
        items = items.filter((asset) => asset.tenantId === normalizedTenantId);
      }
      if (normalizedCampaignId) {
        items = items.filter((asset) => asset.campaignId === normalizedCampaignId);
      }
      if (normalizedAssetType) {
        items = items.filter((asset) => asset.assetType === normalizedAssetType);
      }
      if (normalizedStatus) {
        items = items.filter((asset) => asset.status === normalizedStatus);
      }

      return items
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, max);
    },

    async getAsset({ tenantId, id }) {
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;
      return normalizeAsset(state.assets[index]);
    },

    async upsertAsset(input = {}) {
      const next = normalizeAsset(input);
      const index = findIndex({ tenantId: next.tenantId, id: next.id });
      if (index >= 0) {
        const existing = normalizeAsset(state.assets[index]);
        const merged = {
          ...existing,
          ...next,
          status: TERMINAL_STATUSES.has(existing.status) ? existing.status : next.status,
          version: existing.version + 1,
          versions: pushVersionHistory(existing, 'upsert', 'CMO'),
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
        };
        state.assets[index] = merged;
        await save();
        return normalizeAsset(merged);
      }

      state.assets.push({
        ...next,
        version: 1,
        versions: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await save();
      return normalizeAsset(state.assets[state.assets.length - 1]);
    },

    async syncFromCmoOutput({
      tenantId = '',
      agentRunId = '',
      cmoData = {},
    } = {}) {
      const normalizedTenantId = normalizeText(tenantId) || 'default';
      const extracted = extractContentAssetsFromCmoOutput({
        cmoData,
        tenantId: normalizedTenantId,
        agentRunId,
      });
      const syncedAssets = [];

      for (const rawAsset of extracted) {
        const index = findIndex({ tenantId: normalizedTenantId, id: rawAsset.id });
        const existing = index >= 0 ? normalizeAsset(state.assets[index]) : null;
        const next = {
          ...rawAsset,
          tenantId: normalizedTenantId,
          status:
            existing && TERMINAL_STATUSES.has(existing.status) ? existing.status : 'pending_approval',
        };

        if (existing) {
          const merged = {
            ...existing,
            ...next,
            version: existing.version + 1,
            versions: pushVersionHistory(existing, 'cmo_sync', 'CMO'),
            updatedAt: nowIso(),
          };
          state.assets[index] = merged;
          syncedAssets.push(normalizeAsset(merged));
        } else {
          state.assets.push({
            ...normalizeAsset(next),
            version: 1,
            versions: [],
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
          syncedAssets.push(normalizeAsset(state.assets[state.assets.length - 1]));
        }
      }

      if (syncedAssets.length) await save();

      const assetIds = syncedAssets.map((asset) => asset.id);
      return {
        syncedCount: syncedAssets.length,
        assetIds,
        byCampaignId: groupAssetIdsByCampaign(syncedAssets),
        items: syncedAssets,
      };
    },

    async linkAssetsToCampaign({ tenantId = '', campaignId = '', assetIds = [] } = {}) {
      const normalizedTenantId = normalizeText(tenantId) || 'default';
      const normalizedCampaignId = normalizeText(campaignId);
      if (!normalizedCampaignId) return { updatedCount: 0 };

      let updatedCount = 0;
      for (const rawId of asArray(assetIds)) {
        const index = findIndex({ tenantId: normalizedTenantId, id: rawId });
        if (index < 0) continue;
        const existing = normalizeAsset(state.assets[index]);
        if (existing.campaignId === normalizedCampaignId) continue;
        state.assets[index] = {
          ...existing,
          campaignId: normalizedCampaignId,
          version: existing.version + 1,
          versions: pushVersionHistory(existing, 'link_campaign', 'CMO'),
          updatedAt: nowIso(),
        };
        updatedCount += 1;
      }

      if (updatedCount > 0) await save();
      return { updatedCount };
    },

    async approveAssetsForCampaign({ tenantId = '', campaignId = '', approvedBy = '' } = {}) {
      const normalizedTenantId = normalizeText(tenantId) || 'default';
      const normalizedCampaignId = normalizeText(campaignId);
      if (!normalizedCampaignId) return { approvedCount: 0, assetIds: [] };

      const approvedIds = [];
      for (let index = 0; index < state.assets.length; index += 1) {
        const existing = normalizeAsset(state.assets[index]);
        if (existing.tenantId !== normalizedTenantId) continue;
        if (existing.campaignId !== normalizedCampaignId) continue;
        if (existing.status === 'approved') {
          approvedIds.push(existing.id);
          continue;
        }

        state.assets[index] = {
          ...existing,
          status: 'approved',
          approvedBy: normalizeText(approvedBy) || 'OWNER',
          approvedAt: nowIso(),
          version: existing.version + 1,
          versions: pushVersionHistory(existing, 'approve', approvedBy),
          updatedAt: nowIso(),
        };
        approvedIds.push(existing.id);
      }

      if (approvedIds.length) await save();
      return { approvedCount: approvedIds.length, assetIds: approvedIds };
    },
  };
}

module.exports = {
  createMarketingContentAssetsStore,
};
