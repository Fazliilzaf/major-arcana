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
  return {
    version: 1,
    updatedAt: nowIso(),
    entries: [],
  };
}

function normalizeStoredEntry(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: normalizeText(source.id) || `df_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agent: normalizeText(source.agent),
    severity: normalizeText(source.severity).toLowerCase() || 'info',
    recommendation: normalizeText(source.recommendation),
    rationale: normalizeText(source.rationale),
    requiredOwnerAction: source.requiredOwnerAction === true,
    actionType: normalizeText(source.actionType) || 'review',
    actionEndpoint: normalizeText(source.actionEndpoint) || null,
    context: source.context && typeof source.context === 'object' ? source.context : {},
    auditRef: normalizeText(source.auditRef) || null,
    createdAt: normalizeText(source.createdAt) || nowIso(),
    expiresAt: normalizeText(source.expiresAt) || null,
    status: normalizeText(source.status).toLowerCase() || 'pending',
    resolvedAt: normalizeText(source.resolvedAt) || null,
    resolvedBy: normalizeText(source.resolvedBy) || null,
  };
}

async function loadExecutiveFeedEntries(filePath = '') {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) return [];
  const state = await readJson(resolvedPath, createEmptyState());
  if (!state || typeof state !== 'object') return [];
  return (Array.isArray(state.entries) ? state.entries : []).map(normalizeStoredEntry);
}

async function saveExecutiveFeedEntries(filePath = '', entries = []) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) return false;
  const normalized = (Array.isArray(entries) ? entries : []).map(normalizeStoredEntry);
  await writeJsonAtomic(resolvedPath, {
    version: 1,
    updatedAt: nowIso(),
    entries: normalized,
  });
  return true;
}

module.exports = {
  loadExecutiveFeedEntries,
  saveExecutiveFeedEntries,
  normalizeStoredEntry,
};
