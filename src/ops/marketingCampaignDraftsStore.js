'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

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
    campaigns: [],
  };
}

const TERMINAL_STATUSES = new Set(['approved', 'rejected']);

function mapReadinessToStatus(readiness = '') {
  const normalized = normalizeText(readiness).toLowerCase();
  if (normalized === 'compliance_blocked') return 'compliance_blocked';
  if (normalized === 'ready' || normalized === 'needs_compliance_owner') return 'pending_approval';
  return 'draft';
}

function pushVersionHistory(campaign, changeType, changedBy = '') {
  const versions = asArray(campaign.versions);
  versions.unshift({
    version: campaign.version,
    status: campaign.status,
    owner: campaign.owner || null,
    scheduleProposal: campaign.scheduleProposal || null,
    changeType: normalizeText(changeType) || 'update',
    changedBy: normalizeText(changedBy) || null,
    changedAt: nowIso(),
  });
  return versions.slice(0, 20);
}

function normalizeCampaign(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const payload = asObject(source.payload);
  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    tenantId: normalizeText(source.tenantId) || 'default',
    name: normalizeText(source.name) || 'Namnlös kampanj',
    channel: normalizeText(source.channel) || 'email',
    status: normalizeText(source.status).toLowerCase() || 'draft',
    owner: normalizeText(source.owner),
    readiness: normalizeText(source.readiness).toLowerCase() || 'draft',
    scheduleProposal: normalizeText(source.scheduleProposal) || null,
    version: Math.max(1, Number(source.version) || 1),
    versions: asArray(source.versions),
    approvedBy: normalizeText(source.approvedBy) || null,
    approvedAt: normalizeText(source.approvedAt) || null,
    rejectedBy: normalizeText(source.rejectedBy) || null,
    rejectedAt: normalizeText(source.rejectedAt) || null,
    rejectionReason: normalizeText(source.rejectionReason) || null,
    sourceAgentRunId: normalizeText(source.sourceAgentRunId) || null,
    complianceStatus: normalizeText(source.complianceStatus).toLowerCase() || null,
    payload,
    updatedAt: normalizeText(source.updatedAt) || nowIso(),
    createdAt: normalizeText(source.createdAt) || nowIso(),
  };
}

async function createMarketingCampaignDraftsStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('marketingCampaignDraftsStore filePath saknas.');

  let state = await readJson(resolvedPath, createEmptyState());
  if (!state || typeof state !== 'object') state = createEmptyState();
  if (!Array.isArray(state.campaigns)) state.campaigns = [];

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  function findIndex({ tenantId, id }) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedId = normalizeText(id);
    return state.campaigns.findIndex(
      (item) =>
        normalizeText(item.id) === normalizedId &&
        normalizeText(item.tenantId) === normalizedTenantId
    );
  }

  return {
    filePath: resolvedPath,

    async listCampaigns({
      tenantId = '',
      status = '',
      owner = '',
      limit = 200,
    } = {}) {
      const normalizedTenantId = normalizeText(tenantId);
      const normalizedStatus = normalizeText(status).toLowerCase();
      const normalizedOwner = normalizeText(owner).toUpperCase();
      const max = Math.max(1, Math.min(500, Number(limit) || 200));

      let items = state.campaigns.map((campaign) => normalizeCampaign(campaign));
      if (normalizedTenantId) {
        items = items.filter((campaign) => campaign.tenantId === normalizedTenantId);
      }
      if (normalizedStatus) {
        items = items.filter((campaign) => campaign.status === normalizedStatus);
      }
      if (normalizedOwner) {
        items = items.filter(
          (campaign) => normalizeText(campaign.owner).toUpperCase() === normalizedOwner
        );
      }

      return items
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, max);
    },

    async getCampaign({ tenantId, id }) {
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;
      return normalizeCampaign(state.campaigns[index]);
    },

    async upsertCampaign(input = {}) {
      const next = normalizeCampaign(input);
      const index = findIndex({ tenantId: next.tenantId, id: next.id });
      if (index >= 0) {
        const existing = normalizeCampaign(state.campaigns[index]);
        const merged = {
          ...existing,
          ...next,
          createdAt: existing.createdAt,
          version: existing.version + 1,
          versions: pushVersionHistory(existing, 'upsert', next.owner || existing.owner),
          updatedAt: nowIso(),
        };
        state.campaigns[index] = merged;
        await save();
        return normalizeCampaign(merged);
      }

      state.campaigns.push({
        ...next,
        version: 1,
        versions: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await save();
      return normalizeCampaign(state.campaigns[state.campaigns.length - 1]);
    },

    async syncFromCmoOutput({
      tenantId = '',
      agentRunId = '',
      campaigns = [],
      complianceReview = null,
      assetIdsByCampaign = {},
    } = {}) {
      const normalizedTenantId = normalizeText(tenantId) || 'default';
      const normalizedRunId = normalizeText(agentRunId);
      const complianceStatus = normalizeText(asObject(complianceReview).status).toLowerCase() || null;
      const pendingApprovalIds = [];

      for (const rawCampaign of asArray(campaigns)) {
        const campaign = asObject(rawCampaign);
        const campaignId = normalizeText(campaign.id);
        if (!campaignId) continue;

        const incomingStatus = mapReadinessToStatus(campaign.readiness);
        const index = findIndex({ tenantId: normalizedTenantId, id: campaignId });
        const existing = index >= 0 ? normalizeCampaign(state.campaigns[index]) : null;

        let status = incomingStatus;
        if (existing && TERMINAL_STATUSES.has(existing.status)) {
          status = existing.status;
        }

        const linkedAssetIds = asArray(asObject(assetIdsByCampaign)[campaignId]);

        const next = {
          id: campaignId,
          tenantId: normalizedTenantId,
          name: normalizeText(campaign.name) || campaignId,
          channel: normalizeText(campaign.channel) || 'email',
          status,
          owner: existing?.owner || '',
          readiness: normalizeText(campaign.readiness).toLowerCase() || 'draft',
          scheduleProposal: existing?.scheduleProposal || null,
          sourceAgentRunId: normalizedRunId || existing?.sourceAgentRunId || null,
          complianceStatus,
          payload: {
            trigger: normalizeText(campaign.trigger) || null,
            targetSegment: normalizeText(campaign.targetSegment) || null,
            subject: normalizeText(campaign.subject) || null,
            bodyOutline: normalizeText(campaign.bodyOutline) || null,
            estimatedImpact: normalizeText(campaign.estimatedImpact) || null,
            suggestedActions: asArray(campaign.suggestedActions),
            complianceBlocked: campaign.complianceBlocked === true,
            complianceOwnerRequired: campaign.complianceOwnerRequired === true,
            complianceCleared: campaign.complianceCleared === true,
            assetIds: linkedAssetIds.length
              ? linkedAssetIds
              : asArray(asObject(existing?.payload).assetIds),
          },
        };

        if (existing) {
          const merged = {
            ...existing,
            ...next,
            version: existing.version + 1,
            versions: pushVersionHistory(existing, 'cmo_sync', 'CMO'),
            updatedAt: nowIso(),
          };
          state.campaigns[index] = merged;
          if (merged.status === 'pending_approval') pendingApprovalIds.push(merged.id);
        } else {
          state.campaigns.push({
            ...normalizeCampaign(next),
            version: 1,
            versions: [],
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
          if (status === 'pending_approval') pendingApprovalIds.push(campaignId);
        }
      }

      await save();
      return {
        syncedCount: asArray(campaigns).length,
        pendingApprovalIds,
      };
    },

    async patchCampaign({ tenantId, id, fields = {}, changedBy = '' } = {}) {
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;

      const existing = normalizeCampaign(state.campaigns[index]);
      const body = asObject(fields);
      const next = { ...existing };
      const updatedFields = [];

      if (Object.prototype.hasOwnProperty.call(body, 'owner')) {
        next.owner = normalizeText(body.owner);
        updatedFields.push('owner');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'status')) {
        next.status = normalizeText(body.status).toLowerCase() || existing.status;
        updatedFields.push('status');
      }
      if (Object.prototype.hasOwnProperty.call(body, 'scheduleProposal')) {
        next.scheduleProposal = normalizeText(body.scheduleProposal) || null;
        updatedFields.push('scheduleProposal');
      }
      if (!updatedFields.length) {
        return { item: existing, updatedFields: [] };
      }

      next.version = existing.version + 1;
      next.versions = pushVersionHistory(existing, 'patch', changedBy || next.owner);
      next.updatedAt = nowIso();
      state.campaigns[index] = next;
      await save();
      return { item: normalizeCampaign(next), updatedFields };
    },

    async approveCampaign({ tenantId, id, approvedBy = '' } = {}) {
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;

      const existing = normalizeCampaign(state.campaigns[index]);
      if (existing.status === 'compliance_blocked' || existing.readiness === 'compliance_blocked') {
        const error = new Error('Kampanjen är blockerad av compliance-gate.');
        error.code = 'COMPLIANCE_BLOCKED';
        throw error;
      }
      if (existing.status === 'approved') {
        return existing;
      }
      if (existing.status !== 'pending_approval' && existing.status !== 'draft') {
        const error = new Error('Kampanjen kan inte godkännas i nuvarande status.');
        error.code = 'INVALID_STATUS';
        throw error;
      }

      const next = {
        ...existing,
        status: 'approved',
        approvedBy: normalizeText(approvedBy) || 'OWNER',
        approvedAt: nowIso(),
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        version: existing.version + 1,
        versions: pushVersionHistory(existing, 'approve', approvedBy),
        updatedAt: nowIso(),
      };
      state.campaigns[index] = next;
      await save();
      return normalizeCampaign(next);
    },

    async rejectCampaign({ tenantId, id, rejectedBy = '', reason = '' } = {}) {
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;

      const existing = normalizeCampaign(state.campaigns[index]);
      const next = {
        ...existing,
        status: 'rejected',
        rejectedBy: normalizeText(rejectedBy) || 'OWNER',
        rejectedAt: nowIso(),
        rejectionReason: normalizeText(reason) || 'Avvisad av OWNER.',
        version: existing.version + 1,
        versions: pushVersionHistory(existing, 'reject', rejectedBy),
        updatedAt: nowIso(),
      };
      state.campaigns[index] = next;
      await save();
      return normalizeCampaign(next);
    },

    async applyScheduleProposals({
      tenantId = '',
      scheduleItems = [],
      sourceAgentRunId = '',
    } = {}) {
      const normalizedTenantId = normalizeText(tenantId) || 'default';
      const normalizedRunId = normalizeText(sourceAgentRunId);
      let updatedCount = 0;

      for (const rawItem of asArray(scheduleItems)) {
        const item = asObject(rawItem);
        const campaignId = normalizeText(item.campaignId || item.id);
        if (!campaignId) continue;

        const index = findIndex({ tenantId: normalizedTenantId, id: campaignId });
        if (index < 0) continue;

        const existing = normalizeCampaign(state.campaigns[index]);
        const scheduleProposal =
          normalizeText(item.proposedAt) +
          ' (' +
          (normalizeText(item.platform) || 'channel') +
          ') — ' +
          (normalizeText(item.topic) || existing.name);

        const next = {
          ...existing,
          scheduleProposal,
          sourceAgentRunId: normalizedRunId || existing.sourceAgentRunId,
          payload: {
            ...existing.payload,
            publishSchedule: {
              proposedAt: normalizeText(item.proposedAt) || null,
              platform: normalizeText(item.platform) || null,
              timezone: normalizeText(item.timezone) || null,
              windowLabel: normalizeText(item.windowLabel) || null,
              status: normalizeText(item.status) || 'proposed',
              publishMode: normalizeText(item.publishMode) || normalizeText(asObject(item.publishPolicy).publishMode) || 'proposal_only',
              pilotAutoPublishEligible: item.pilotAutoPublishEligible === true,
              publishPolicy: asObject(item.publishPolicy),
            },
          },
          version: existing.version + 1,
          versions: pushVersionHistory(existing, 'schedule_proposal', 'CMO'),
          updatedAt: nowIso(),
        };
        state.campaigns[index] = next;
        updatedCount += 1;
      }

      if (updatedCount > 0) await save();
      return { updatedCount };
    },

    async markPublishQueued({
      tenantId = '',
      id = '',
      publishResult = {},
      changedBy = 'scheduler',
    } = {}) {
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;

      const existing = normalizeCampaign(state.campaigns[index]);
      const schedule = asObject(asObject(existing.payload).publishSchedule);
      const next = {
        ...existing,
        payload: {
          ...existing.payload,
          publishSchedule: {
            ...schedule,
            publishStatus: 'publish_queued',
            publishQueuedAt: normalizeText(publishResult.queuedAt) || nowIso(),
            publishQueueMode: normalizeText(publishResult.mode) || 'pilot_queue_stub',
            externalPublishInvoked: publishResult.externalPublishInvoked === true,
          },
        },
        version: existing.version + 1,
        versions: pushVersionHistory(existing, 'publish_queue', changedBy),
        updatedAt: nowIso(),
      };
      state.campaigns[index] = next;
      await save();
      return normalizeCampaign(next);
    },
  };
}

module.exports = {
  createMarketingCampaignDraftsStore,
  mapReadinessToStatus,
};
