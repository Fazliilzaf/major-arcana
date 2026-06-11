'use strict';

const defaultFortnoxConnector = require('./cfoFortnoxConnector');
const { FORTNOX_API_BASE } = require('./cfoFortnoxClient');
const { normalizeConnection } = require('./cfoFortnoxStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildFortnoxInvoicePayload({ draft, rows }) {
  const safeDraft = asObject(draft);
  const safeRows = Array.isArray(rows) ? rows : [];
  return {
    customerNumber: normalizeText(safeDraft.customerNumber),
    customerName: normalizeText(safeDraft.customerName),
    email: normalizeText(safeDraft.email),
    dueInDays: Number(safeDraft.dueInDays) || 30,
    currency: normalizeText(safeDraft.currency) || 'SEK',
    items: safeRows.map((row) => ({
      label: normalizeText(row.label),
      quantity: Number(row.quantity) || 1,
      unitPrice: Number(row.unitPrice) || 0,
      vatRate: (Number(row.vatRatePercent) || 0) / 100,
      accountNumber: Number(row.accountNumber) || 3001,
    })),
  };
}

function appendAudit(auditLog, action, detail = {}) {
  try {
    auditLog?.append?.({
      action,
      kind: action,
      surface: 'cco.cf.billing',
      ts: new Date().toISOString(),
      actor: detail.actor || { role: 'system' },
      target: detail.target || { kind: 'billing_draft', id: detail.draftId || null },
      detail,
    });
  } catch {}
}

function createCfoBillingDraftService({
  billingDraftStore,
  fortnoxConnector = defaultFortnoxConnector,
  fortnoxStore = null,
  auditLog = null,
} = {}) {
  if (!billingDraftStore) throw new Error('billingDraftStore is required.');
  if (typeof fortnoxConnector?.createInvoice !== 'function') {
    throw new Error('fortnoxConnector.createInvoice is required.');
  }

  async function resolveFortnoxConnection({ tenantId } = {}) {
    if (!fortnoxStore || typeof fortnoxStore.getConnection !== 'function') {
      return normalizeConnection({});
    }
    const connection = await fortnoxStore.getConnection({ tenantId });
    return normalizeConnection(connection);
  }

  async function createDraftFromSource(input = {}) {
    return billingDraftStore.createDraftFromSource(input);
  }

  async function approveDraftForExport(input = {}) {
    return billingDraftStore.approveDraftForExport(input);
  }

  async function exportDraftToFortnox({ draftId, actor } = {}) {
    const bundle = billingDraftStore.getDraftWithRows(draftId);
    if (!bundle) {
      return { ok: false, reason: 'draft_not_found', errors: ['draft_not_found'] };
    }

    const existingJob = billingDraftStore.findSuccessfulExportBySourceKey(
      bundle.draft.cfoInvoiceSourceKey
    );
    if (existingJob && bundle.draft.status === 'FORTNOX_INVOICE_CREATED') {
      appendAudit(auditLog, 'cf.billing_draft.fortnox_export_idempotent_reuse', {
        draftId: bundle.draft.id,
        actor,
        target: { kind: 'billing_draft', id: bundle.draft.id },
        exportJobId: existingJob.id,
        cfoInvoiceSourceKey: bundle.draft.cfoInvoiceSourceKey,
      });
      return {
        ok: true,
        idempotent: true,
        draft: bundle.draft,
        rows: bundle.rows,
        exportJob: existingJob,
        response: existingJob.responsePayload,
      };
    }

    const validation = billingDraftStore.validateDraftForFortnoxExport({ draftId });
    if (!validation.ok) {
      appendAudit(auditLog, 'cf.billing_draft.export_validation_failed', {
        draftId: bundle.draft.id,
        actor,
        target: { kind: 'billing_draft', id: bundle.draft.id },
        errors: validation.errors,
      });
      return {
        ok: false,
        reason: 'validation_failed',
        errors: validation.errors,
        totals: validation.totals,
      };
    }

    const fortnoxConnection = await resolveFortnoxConnection({ tenantId: bundle.draft.tenantId });
    const requestPayload = buildFortnoxInvoicePayload(bundle);
    const exportJob = await billingDraftStore.createFortnoxExportJob({
      draftId: bundle.draft.id,
      actor,
      requestPayload: {
        ...requestPayload,
        connector: {
          name: 'cfoFortnoxConnector.createInvoice',
          apiBase: FORTNOX_API_BASE,
          hasStoredConnection: Boolean(
            fortnoxConnection.connected || fortnoxConnection.accessToken
          ),
        },
      },
    });

    const response = await fortnoxConnector.createInvoice(requestPayload);
    if (!response?.ok) {
      const failedJob = await billingDraftStore.failFortnoxExportJob({
        jobId: exportJob.id,
        error: response || { message: 'Fortnox createInvoice failed.' },
      });
      appendAudit(auditLog, 'cf.billing_draft.fortnox_export_failed', {
        draftId: bundle.draft.id,
        actor,
        target: { kind: 'billing_draft', id: bundle.draft.id },
        exportJobId: exportJob.id,
        cfoInvoiceSourceKey: bundle.draft.cfoInvoiceSourceKey,
        error: failedJob.error,
      });
      return {
        ok: false,
        reason: 'fortnox_export_failed',
        draft: bundle.draft,
        exportJob: failedJob,
        response,
      };
    }

    const completedJob = await billingDraftStore.completeFortnoxExportJob({
      jobId: exportJob.id,
      responsePayload: response,
    });
    const updated = await billingDraftStore.markFortnoxInvoiceCreated({
      draftId: bundle.draft.id,
      exportJobId: exportJob.id,
      responsePayload: response,
      actor,
    });

    return {
      ok: true,
      idempotent: false,
      draft: updated.draft,
      rows: updated.rows,
      exportJob: completedJob,
      response,
    };
  }

  return {
    approveDraftForExport,
    buildFortnoxInvoicePayload,
    createDraftFromSource,
    exportDraftToFortnox,
  };
}

module.exports = {
  buildFortnoxInvoicePayload,
  createCfoBillingDraftService,
};
