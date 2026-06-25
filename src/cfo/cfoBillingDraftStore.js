'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { VALID_VAT_RATES } = require('./cfoExpenseStore');

const SCHEMA_VERSION = '1.0.0';

const CFO_BILLING_TABLES = Object.freeze({
  drafts: 'cfo_billing_drafts',
  rows: 'cfo_billing_rows',
  fortnoxExportJobs: 'cfo_fortnox_export_jobs',
});

const VALID_SOURCE_TYPES = Object.freeze(['offer', 'booking', 'encounter', 'pos_order', 'manual']);

const VALID_DRAFT_STATUSES = Object.freeze(['DRAFT', 'FORTNOX_INVOICE_CREATED']);
const VALID_EXPORT_JOB_STATUSES = Object.freeze(['PENDING', 'SUCCEEDED', 'FAILED']);

const CFO_BILLING_DATABASE_SCHEMA = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  tables: {
    cfo_billing_drafts: Object.freeze([
      'id',
      'tenantId',
      'sourceType',
      'sourceId',
      'cfoInvoiceSourceKey',
      'status',
      'customerNumber',
      'customerName',
      'email',
      'currency',
      'dueInDays',
      'approvedForExport',
      'approvedAt',
      'approvedBy',
      'fortnoxInvoiceNumber',
      'fortnoxInvoiceCreatedAt',
      'createdAt',
      'createdBy',
      'updatedAt',
      'history',
      'metadata',
    ]),
    cfo_billing_rows: Object.freeze([
      'id',
      'draftId',
      'tenantId',
      'rowNo',
      'label',
      'quantity',
      'unitPrice',
      'vatRatePercent',
      'accountNumber',
      'sourceLineId',
      'createdAt',
    ]),
    cfo_fortnox_export_jobs: Object.freeze([
      'id',
      'tenantId',
      'draftId',
      'cfoInvoiceSourceKey',
      'status',
      'requestPayload',
      'responsePayload',
      'error',
      'createdAt',
      'updatedAt',
      'createdBy',
    ]),
  },
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeCurrency(value) {
  return (normalizeText(value) || 'SEK').toUpperCase();
}

function normalizeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveNumber(value, fallback = null) {
  const parsed = normalizeNumber(value, fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeVatRatePercent(value) {
  const raw = value === null || value === undefined || value === '' ? 25 : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unknown vatRatePercent: ${value}`);
  }
  const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  const rounded = Math.round(percent * 100) / 100;
  if (!VALID_VAT_RATES.includes(rounded)) {
    throw new Error(`Unknown vatRatePercent: ${value}`);
  }
  return rounded;
}

function normalizeAccountNumber(value) {
  const parsed = Number(value || 3001);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3001;
}

function emptyState() {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    [CFO_BILLING_TABLES.drafts]: [],
    [CFO_BILLING_TABLES.rows]: [],
    [CFO_BILLING_TABLES.fortnoxExportJobs]: [],
  };
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeState(input) {
  const fallback = emptyState();
  const state = input && typeof input === 'object' ? input : {};
  return {
    ...fallback,
    ...state,
    schemaVersion: state.schemaVersion || SCHEMA_VERSION,
    [CFO_BILLING_TABLES.drafts]: Array.isArray(state[CFO_BILLING_TABLES.drafts])
      ? state[CFO_BILLING_TABLES.drafts]
      : [],
    [CFO_BILLING_TABLES.rows]: Array.isArray(state[CFO_BILLING_TABLES.rows])
      ? state[CFO_BILLING_TABLES.rows]
      : [],
    [CFO_BILLING_TABLES.fortnoxExportJobs]: Array.isArray(
      state[CFO_BILLING_TABLES.fortnoxExportJobs]
    )
      ? state[CFO_BILLING_TABLES.fortnoxExportJobs]
      : [],
  };
}

function appendAudit(auditLog, action, detail = {}) {
  try {
    auditLog?.append?.({
      action,
      kind: action,
      surface: 'cco.cf.billing',
      ts: nowIso(),
      actor: detail.actor || { role: 'system' },
      target: detail.target || { kind: 'billing_draft', id: detail.draftId || null },
      detail,
    });
  } catch {}
}

function resolveSourceId({ sourceType, source, sourceId, cfoInvoiceSourceKey }) {
  const safe = asObject(source);
  const explicit = normalizeText(sourceId);
  if (explicit) return explicit;
  const candidates = [
    safe.id,
    safe.sourceId,
    safe.offerId,
    safe.bookingId,
    safe.encounterId,
    safe.posOrderId,
    safe.orderId,
    safe.manualId,
    safe.reference,
    safe.externalId,
  ];
  const found = candidates.map(normalizeText).find(Boolean);
  if (found) return found;
  if (normalizeText(cfoInvoiceSourceKey)) return normalizeText(cfoInvoiceSourceKey);
  throw new Error(`sourceId is required for ${sourceType} billing drafts.`);
}

function buildCfoInvoiceSourceKey({ tenantId, sourceType, sourceId, cfoInvoiceSourceKey } = {}) {
  const explicit = normalizeText(cfoInvoiceSourceKey);
  if (explicit) return explicit.slice(0, 260);
  const tenant = normalizeText(tenantId);
  const type = normalizeText(sourceType);
  const id = normalizeText(sourceId);
  if (!tenant || !type || !id) {
    throw new Error('tenantId, sourceType and sourceId are required for cfoInvoiceSourceKey.');
  }
  return `${tenant}:${type}:${id}`.slice(0, 260);
}

function normalizeCustomer(input = {}, source = {}) {
  const safe = asObject(input);
  const src = asObject(source);
  const nested =
    [src.customer, src.client, src.patient, src.customerSnapshot]
      .map(asObject)
      .find((candidate) => Object.keys(candidate).length > 0) || {};
  const firstName = normalizeText(nested.firstName || src.firstName);
  const lastName = normalizeText(nested.lastName || src.lastName);
  const displayName = normalizeText(
    safe.customerName ||
      nested.customerName ||
      nested.displayName ||
      nested.name ||
      src.customerName ||
      src.patientName ||
      [firstName, lastName].filter(Boolean).join(' ')
  );
  return {
    customerNumber: normalizeText(
      safe.customerNumber || nested.customerNumber || src.customerNumber
    ),
    customerName: displayName,
    email: normalizeText(
      safe.email ||
        nested.email ||
        nested.primaryEmail ||
        src.email ||
        src.customerEmail ||
        src.patientEmail
    ),
  };
}

function extractSourceRows(source = {}, explicitRows = null) {
  const safe = asObject(source);
  const candidate =
    explicitRows || safe.rows || safe.items || safe.lineItems || safe.orderRows || safe.services;
  if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  const singleLabel = normalizeText(
    safe.serviceName || safe.treatmentName || safe.title || safe.label || safe.description
  );
  const singlePrice = normalizeNumber(
    safe.unitPrice ?? safe.price ?? safe.priceSek ?? safe.amountSek ?? safe.totalSek,
    null
  );
  if (singleLabel || singlePrice !== null) {
    return [
      {
        label: singleLabel || 'Billing row',
        unitPrice: singlePrice || 0,
        quantity: safe.quantity || 1,
        vatRatePercent: safe.vatRatePercent ?? safe.vatRate ?? 25,
        accountNumber: safe.accountNumber || 3001,
        sourceLineId: safe.sourceLineId || safe.id || null,
      },
    ];
  }
  return [];
}

function normalizeRows({ tenantId, draftId, source, rows }) {
  const sourceRows = extractSourceRows(source, rows);
  if (sourceRows.length === 0) throw new Error('At least one billing row is required.');
  return sourceRows.map((row, index) => {
    const safe = asObject(row);
    const label = normalizeText(
      safe.label || safe.name || safe.description || safe.serviceName || safe.title
    );
    const quantity = normalizePositiveNumber(safe.quantity, 1);
    const total = normalizeNumber(safe.total ?? safe.totalSek ?? safe.amountSek, null);
    const unitPrice = normalizeNumber(
      safe.unitPrice ?? safe.unitPriceSek ?? safe.price ?? safe.priceSek,
      total !== null && quantity ? total / quantity : null
    );
    if (!label) throw new Error(`Billing row ${index + 1} is missing label.`);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Billing row ${index + 1} has invalid quantity.`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Billing row ${index + 1} has invalid unitPrice.`);
    }
    return {
      id: newId('billrow'),
      draftId,
      tenantId,
      rowNo: index + 1,
      label: label.slice(0, 240),
      quantity,
      unitPrice: Math.round(unitPrice * 100) / 100,
      vatRatePercent: normalizeVatRatePercent(safe.vatRatePercent ?? safe.vatRate ?? safe.vat),
      accountNumber: normalizeAccountNumber(safe.accountNumber),
      sourceLineId: normalizeText(safe.sourceLineId || safe.id || safe.lineId),
      createdAt: nowIso(),
    };
  });
}

function calculateTotals(rows) {
  const totalExVat = rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const vatAmount = rows.reduce(
    (sum, row) => sum + row.quantity * row.unitPrice * (row.vatRatePercent / 100),
    0
  );
  return {
    totalExVat: Math.round(totalExVat * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    totalIncVat: Math.round((totalExVat + vatAmount) * 100) / 100,
  };
}

function validateDraftForFortnoxExportRecord({ draft, rows }) {
  const errors = [];
  const safeDraft = asObject(draft);
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeDraft.id) errors.push('draft_id_required');
  if (safeDraft.status !== 'DRAFT') errors.push('draft_status_must_be_DRAFT');
  if (!safeDraft.approvedForExport) errors.push('draft_must_be_approved_for_export');
  if (!normalizeText(safeDraft.customerName)) errors.push('customerName_required');
  if (!normalizeText(safeDraft.currency)) errors.push('currency_required');
  if (safeRows.length === 0) errors.push('billing_rows_required');
  for (const [index, row] of safeRows.entries()) {
    if (!normalizeText(row.label)) errors.push(`row_${index + 1}_label_required`);
    if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0) {
      errors.push(`row_${index + 1}_quantity_invalid`);
    }
    if (!Number.isFinite(Number(row.unitPrice)) || Number(row.unitPrice) < 0) {
      errors.push(`row_${index + 1}_unitPrice_invalid`);
    }
    try {
      normalizeVatRatePercent(row.vatRatePercent);
    } catch {
      errors.push(`row_${index + 1}_vatRatePercent_invalid`);
    }
  }
  const totals = calculateTotals(safeRows);
  if (totals.totalExVat <= 0) errors.push('total_amount_must_be_positive');
  return { ok: errors.length === 0, errors, totals };
}

async function createCfoBillingDraftStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath is required for cfoBillingDraftStore.');
  }

  const state = normalizeState(await readJson(filePath, emptyState()));

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function getDraftById(id) {
    const draftId = normalizeText(id);
    const draft = state[CFO_BILLING_TABLES.drafts].find((row) => row.id === draftId);
    return draft ? clone(draft) : null;
  }

  function getDraftBySourceKey(cfoInvoiceSourceKey) {
    const sourceKey = normalizeText(cfoInvoiceSourceKey);
    const draft = state[CFO_BILLING_TABLES.drafts].find(
      (row) => row.cfoInvoiceSourceKey === sourceKey
    );
    return draft ? clone(draft) : null;
  }

  function listRows({ draftId, tenantId } = {}) {
    let rows = [...state[CFO_BILLING_TABLES.rows]];
    if (draftId) rows = rows.filter((row) => row.draftId === draftId);
    if (tenantId) rows = rows.filter((row) => row.tenantId === tenantId);
    return rows.sort((a, b) => a.rowNo - b.rowNo).map(clone);
  }

  function getDraftWithRows(id) {
    const draft = getDraftById(id);
    if (!draft) return null;
    return {
      draft,
      rows: listRows({ draftId: draft.id }),
    };
  }

  function listDrafts({ tenantId, status, sourceType, limit = 200 } = {}) {
    let drafts = [...state[CFO_BILLING_TABLES.drafts]];
    if (tenantId) drafts = drafts.filter((draft) => draft.tenantId === tenantId);
    if (status) drafts = drafts.filter((draft) => draft.status === status);
    if (sourceType) drafts = drafts.filter((draft) => draft.sourceType === sourceType);
    drafts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return drafts.slice(0, Math.max(1, Math.min(1000, limit))).map(clone);
  }

  function listFortnoxExportJobs({ tenantId, draftId, status, limit = 200 } = {}) {
    let jobs = [...state[CFO_BILLING_TABLES.fortnoxExportJobs]];
    if (tenantId) jobs = jobs.filter((job) => job.tenantId === tenantId);
    if (draftId) jobs = jobs.filter((job) => job.draftId === draftId);
    if (status) jobs = jobs.filter((job) => job.status === status);
    jobs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return jobs.slice(0, Math.max(1, Math.min(1000, limit))).map(clone);
  }

  function findSuccessfulExportBySourceKey(cfoInvoiceSourceKey) {
    const sourceKey = normalizeText(cfoInvoiceSourceKey);
    const job = state[CFO_BILLING_TABLES.fortnoxExportJobs].find(
      (row) => row.cfoInvoiceSourceKey === sourceKey && row.status === 'SUCCEEDED'
    );
    return job ? clone(job) : null;
  }

  async function createDraftFromSource({
    tenantId,
    sourceType,
    source = {},
    rows = null,
    customer = {},
    sourceId,
    cfoInvoiceSourceKey,
    actor,
    metadata = {},
  } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedSourceType = normalizeText(sourceType);
    if (!normalizedTenantId) throw new Error('tenantId is required.');
    if (!VALID_SOURCE_TYPES.includes(normalizedSourceType)) {
      throw new Error(`Unknown billing sourceType: ${sourceType}`);
    }
    const resolvedSourceId = resolveSourceId({
      sourceType: normalizedSourceType,
      source,
      sourceId,
      cfoInvoiceSourceKey,
    });
    const sourceKey = buildCfoInvoiceSourceKey({
      tenantId: normalizedTenantId,
      sourceType: normalizedSourceType,
      sourceId: resolvedSourceId,
      cfoInvoiceSourceKey,
    });
    const existing = getDraftBySourceKey(sourceKey);
    if (existing) {
      appendAudit(auditLog, 'cf.billing_draft.idempotent_reuse', {
        draftId: existing.id,
        actor,
        target: { kind: 'billing_draft', id: existing.id },
        cfoInvoiceSourceKey: sourceKey,
      });
      return {
        created: false,
        idempotent: true,
        draft: existing,
        rows: listRows({ draftId: existing.id }),
      };
    }

    const draftId = newId('billdraft');
    const now = nowIso();
    const normalizedCustomer = normalizeCustomer(customer, source);
    const normalizedRows = normalizeRows({
      tenantId: normalizedTenantId,
      draftId,
      source,
      rows,
    });
    const totals = calculateTotals(normalizedRows);
    const draft = {
      id: draftId,
      tenantId: normalizedTenantId,
      sourceType: normalizedSourceType,
      sourceId: resolvedSourceId,
      cfoInvoiceSourceKey: sourceKey,
      status: 'DRAFT',
      customerNumber: normalizedCustomer.customerNumber,
      customerName: normalizedCustomer.customerName,
      email: normalizedCustomer.email,
      currency: normalizeCurrency(source.currency || customer.currency),
      dueInDays: normalizePositiveNumber(source.dueInDays ?? customer.dueInDays, 30),
      approvedForExport: false,
      approvedAt: null,
      approvedBy: null,
      fortnoxInvoiceNumber: null,
      fortnoxInvoiceCreatedAt: null,
      createdAt: now,
      createdBy: actor || null,
      updatedAt: now,
      history: [{ status: 'DRAFT', at: now, by: actor || null }],
      metadata: {
        ...asObject(metadata),
        totals,
      },
    };
    state[CFO_BILLING_TABLES.drafts].push(draft);
    state[CFO_BILLING_TABLES.rows].push(...normalizedRows);
    await save();
    appendAudit(auditLog, 'cf.billing_draft.created', {
      draftId,
      actor,
      target: { kind: 'billing_draft', id: draftId },
      cfoInvoiceSourceKey: sourceKey,
      sourceType: normalizedSourceType,
      sourceId: resolvedSourceId,
      rowCount: normalizedRows.length,
      totals,
    });
    return {
      created: true,
      idempotent: false,
      draft: clone(draft),
      rows: normalizedRows.map(clone),
    };
  }

  async function approveDraftForExport({ draftId, actor } = {}) {
    const id = normalizeText(draftId);
    const draft = state[CFO_BILLING_TABLES.drafts].find((row) => row.id === id);
    if (!draft) throw new Error('Billing draft not found.');
    if (draft.status !== 'DRAFT') throw new Error('Only DRAFT billing drafts can be approved.');
    const rows = state[CFO_BILLING_TABLES.rows].filter((row) => row.draftId === id);
    const validation = validateDraftForFortnoxExportRecord({
      draft: { ...draft, approvedForExport: true },
      rows,
    });
    if (!validation.ok) {
      appendAudit(auditLog, 'cf.billing_draft.export_validation_failed', {
        draftId: id,
        actor,
        target: { kind: 'billing_draft', id },
        errors: validation.errors,
      });
      const error = new Error(`Billing draft cannot be approved: ${validation.errors.join(', ')}`);
      error.validation = validation;
      throw error;
    }
    const now = nowIso();
    draft.approvedForExport = true;
    draft.approvedAt = now;
    draft.approvedBy = actor || null;
    draft.updatedAt = now;
    draft.history.push({
      status: 'DRAFT',
      at: now,
      by: actor || null,
      event: 'approved_for_export',
    });
    await save();
    appendAudit(auditLog, 'cf.billing_draft.approved', {
      draftId: id,
      actor,
      target: { kind: 'billing_draft', id },
      cfoInvoiceSourceKey: draft.cfoInvoiceSourceKey,
    });
    return getDraftWithRows(id);
  }

  function validateDraftForFortnoxExport({ draftId } = {}) {
    const bundle = getDraftWithRows(draftId);
    if (!bundle) return { ok: false, errors: ['draft_not_found'], totals: calculateTotals([]) };
    return validateDraftForFortnoxExportRecord(bundle);
  }

  async function createFortnoxExportJob({ draftId, requestPayload, actor } = {}) {
    const bundle = getDraftWithRows(draftId);
    if (!bundle) throw new Error('Billing draft not found.');
    const now = nowIso();
    const job = {
      id: newId('fortnoxjob'),
      tenantId: bundle.draft.tenantId,
      draftId: bundle.draft.id,
      cfoInvoiceSourceKey: bundle.draft.cfoInvoiceSourceKey,
      status: 'PENDING',
      requestPayload: clone(requestPayload || {}),
      responsePayload: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor || null,
    };
    state[CFO_BILLING_TABLES.fortnoxExportJobs].push(job);
    await save();
    return clone(job);
  }

  async function completeFortnoxExportJob({ jobId, responsePayload } = {}) {
    const id = normalizeText(jobId);
    const job = state[CFO_BILLING_TABLES.fortnoxExportJobs].find((row) => row.id === id);
    if (!job) throw new Error('Fortnox export job not found.');
    job.status = 'SUCCEEDED';
    job.responsePayload = clone(responsePayload || {});
    job.error = null;
    job.updatedAt = nowIso();
    await save();
    return clone(job);
  }

  async function failFortnoxExportJob({ jobId, error } = {}) {
    const id = normalizeText(jobId);
    const job = state[CFO_BILLING_TABLES.fortnoxExportJobs].find((row) => row.id === id);
    if (!job) throw new Error('Fortnox export job not found.');
    job.status = 'FAILED';
    job.responsePayload = error?.responsePayload ? clone(error.responsePayload) : null;
    job.error = {
      message: normalizeText(error?.message || error?.error) || 'Fortnox export failed.',
      code: normalizeText(error?.code || error?.error),
      status: error?.status || null,
    };
    job.updatedAt = nowIso();
    await save();
    return clone(job);
  }

  async function markFortnoxInvoiceCreated({ draftId, exportJobId, responsePayload, actor } = {}) {
    const id = normalizeText(draftId);
    const draft = state[CFO_BILLING_TABLES.drafts].find((row) => row.id === id);
    if (!draft) throw new Error('Billing draft not found.');
    const response = asObject(responsePayload);
    const invoiceNumber = normalizeText(response.invoiceNumber || response.DocumentNumber);
    if (!invoiceNumber) throw new Error('Fortnox invoiceNumber is required.');
    const now = nowIso();
    draft.status = 'FORTNOX_INVOICE_CREATED';
    draft.fortnoxInvoiceNumber = invoiceNumber;
    draft.fortnoxInvoiceCreatedAt = now;
    draft.updatedAt = now;
    draft.history.push({
      status: 'FORTNOX_INVOICE_CREATED',
      at: now,
      by: actor || null,
      exportJobId: normalizeText(exportJobId),
      invoiceNumber,
    });
    await save();
    appendAudit(auditLog, 'cf.billing_draft.fortnox_invoice_created', {
      draftId: id,
      actor,
      target: { kind: 'billing_draft', id },
      exportJobId: normalizeText(exportJobId),
      cfoInvoiceSourceKey: draft.cfoInvoiceSourceKey,
      invoiceNumber,
    });
    return getDraftWithRows(id);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    CFO_BILLING_DATABASE_SCHEMA,
    CFO_BILLING_TABLES,
    VALID_SOURCE_TYPES,
    VALID_DRAFT_STATUSES,
    VALID_EXPORT_JOB_STATUSES,
    approveDraftForExport,
    buildCfoInvoiceSourceKey,
    createDraftFromSource,
    createFortnoxExportJob,
    completeFortnoxExportJob,
    failFortnoxExportJob,
    findSuccessfulExportBySourceKey,
    getDraftById,
    getDraftBySourceKey,
    getDraftWithRows,
    listDrafts,
    listFortnoxExportJobs,
    listRows,
    markFortnoxInvoiceCreated,
    validateDraftForFortnoxExport,
  };
}

module.exports = {
  CFO_BILLING_DATABASE_SCHEMA,
  CFO_BILLING_TABLES,
  SCHEMA_VERSION,
  VALID_DRAFT_STATUSES,
  VALID_EXPORT_JOB_STATUSES,
  VALID_SOURCE_TYPES,
  buildCfoInvoiceSourceKey,
  createCfoBillingDraftStore,
  normalizeVatRatePercent,
  validateDraftForFortnoxExportRecord,
};
