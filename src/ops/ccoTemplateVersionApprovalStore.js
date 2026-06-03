'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const APPROVAL_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
const APPROVED_BY_VALUES = Object.freeze(['nordbro', 'fazli']);

const DEFAULT_TEMPLATE_ID = 'hair-tp-treatment-agreement';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = normalizeKey(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function buildTemplateVersionKey(templateId, version) {
  const tid = normalizeText(templateId);
  const ver = normalizeText(version);
  if (!tid || !ver) return '';
  return `${tid}@${ver}`;
}

function resolveAgreementTemplateBinding(agreement = {}) {
  const safe = agreement && typeof agreement === 'object' ? agreement : {};
  const templateId = normalizeText(safe.templateId);
  const templateVersion = normalizeText(safe.templateVersion);
  if (!templateId || !templateVersion) {
    return { templateId: '', templateVersion: '', key: '', requiresApproval: false };
  }
  return {
    templateId,
    templateVersion,
    key: buildTemplateVersionKey(templateId, templateVersion),
    requiresApproval: true,
  };
}

function defaultTemplateBindingForOffer(offerType = '', agreementVersion = '') {
  const offer = normalizeKey(offerType);
  const templateId = offer ? `hair-tp-${offer}` : DEFAULT_TEMPLATE_ID;
  const templateVersion = normalizeText(agreementVersion) || '251203';
  return { templateId, templateVersion };
}

function isTemplateVersionApproved(approval = null) {
  return normalizeKey(approval?.status) === 'approved';
}

function computeSignedAgreementBookable(agreement = {}, templateApproval = null) {
  const status = normalizeKey(agreement.agreementStatus);
  if (status !== 'signed' && status !== 'bookable') return false;
  const binding = resolveAgreementTemplateBinding(agreement);
  if (!binding.requiresApproval) return true;
  return isTemplateVersionApproved(templateApproval);
}

function emptyState() {
  return {
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    templateApprovals: {},
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

function normalizeApprovalRecord(input = {}, existing = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const prev = existing && typeof existing === 'object' ? existing : {};
  const templateId = normalizeText(safe.templateId || prev.templateId);
  const version = normalizeText(safe.version || prev.version);
  if (!templateId || !version) return null;

  const status = normalizeEnum(safe.status || prev.status, APPROVAL_STATUSES, 'pending');
  const approvedBy = normalizeEnum(safe.approvedBy || prev.approvedBy, APPROVED_BY_VALUES, '');

  return {
    templateId,
    version,
    key: buildTemplateVersionKey(templateId, version),
    status,
    approvedAt:
      normalizeText(safe.approvedAt || prev.approvedAt) || (status === 'approved' ? nowIso() : ''),
    approvedBy: approvedBy || null,
    note: normalizeText(safe.note || prev.note),
    updatedAt: nowIso(),
    createdAt: normalizeText(prev.createdAt || safe.createdAt) || nowIso(),
  };
}

async function createCcoTemplateVersionApprovalStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoTemplateVersionApprovalStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    templateApprovals:
      state?.templateApprovals && typeof state.templateApprovals === 'object'
        ? state.templateApprovals
        : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getApproval({ templateId, version } = {}) {
    const key = buildTemplateVersionKey(templateId, version);
    if (!key) return null;
    const record = state.templateApprovals[key];
    return record ? { ...record } : null;
  }

  async function recordApproval(input = {}) {
    const templateId = normalizeText(input.templateId);
    const version = normalizeText(input.version);
    if (!templateId || !version) {
      throw new Error('templateId och version krävs.');
    }
    const status = normalizeEnum(input.status, APPROVAL_STATUSES, '');
    if (!status) throw new Error('status måste vara pending, approved eller rejected.');
    const approvedBy = normalizeText(input.approvedBy);
    if (status === 'approved' && !APPROVED_BY_VALUES.includes(normalizeKey(approvedBy))) {
      throw new Error('approved kräver approvedBy: nordbro eller fazli.');
    }

    const key = buildTemplateVersionKey(templateId, version);
    const existing = state.templateApprovals[key] || {};
    const normalized = normalizeApprovalRecord(
      {
        templateId,
        version,
        status,
        approvedBy,
        note: input.note,
        approvedAt: status === 'approved' ? nowIso() : '',
      },
      existing
    );
    if (!normalized) throw new Error('Godkännande kunde inte normaliseras.');
    state.templateApprovals[key] = normalized;
    await save();
    return { ...normalized };
  }

  return {
    getApproval,
    recordApproval,
  };
}

module.exports = {
  APPROVAL_STATUSES,
  APPROVED_BY_VALUES,
  DEFAULT_TEMPLATE_ID,
  buildTemplateVersionKey,
  resolveAgreementTemplateBinding,
  defaultTemplateBindingForOffer,
  isTemplateVersionApproved,
  computeSignedAgreementBookable,
  createCcoTemplateVersionApprovalStore,
};
