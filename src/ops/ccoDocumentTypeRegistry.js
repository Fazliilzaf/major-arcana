'use strict';

const path = require('node:path');
const fs = require('node:fs');

const CATALOG_PATH = path.join(__dirname, 'hairtp-document-types.catalog.json');

let cachedCatalog = null;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const types = Array.isArray(parsed?.types) ? parsed.types : [];
  cachedCatalog = Object.freeze(
    types.map((row) => ({
      ...row,
      id: normalizeText(row.id),
      filler: row.filler === 'system_auto' ? 'system_auto' : normalizeText(row.filler) || 'patient',
      flowApplies: Array.isArray(row.flowApplies) ? row.flowApplies : ['all'],
      surfaces: Array.isArray(row.surfaces) ? row.surfaces : ['document_group'],
      requiredFor: Array.isArray(row.requiredFor) ? row.requiredFor : [],
    }))
  );
  return cachedCatalog;
}

function getAllDocumentTypes() {
  return loadCatalog();
}

function getDocumentTypeById(id) {
  const key = normalizeText(id);
  return loadCatalog().find((row) => row.id === key) || null;
}

function matchesFlow(type, flow) {
  const needle = normalizeText(flow).toLowerCase();
  if (!needle || needle === 'all') return true;
  const flows = type.flowApplies || [];
  return flows.includes('all') || flows.includes(needle);
}

function matchesSurface(type, surface) {
  const needle = normalizeText(surface);
  if (!needle) return true;
  return (type.surfaces || []).includes(needle);
}

function filterDocumentTypes(filters = {}) {
  const clinic = normalizeText(filters.clinic).toLowerCase();
  const filler = normalizeText(filters.filler).toLowerCase();
  const category = normalizeText(filters.category).toLowerCase();
  const flow = normalizeText(filters.flow).toLowerCase();
  const language = normalizeText(filters.language).toLowerCase();
  const surface = normalizeText(filters.surface);
  const journeyStep = filters.journeyStep;

  return loadCatalog().filter((type) => {
    if (clinic && type.clinic !== clinic) return false;
    if (filler && type.filler !== filler) return false;
    if (category && type.category !== category) return false;
    if (flow && !matchesFlow(type, flow)) return false;
    if (language && type.language !== language) return false;
    if (surface && !matchesSurface(type, surface)) return false;
    if (
      journeyStep != null &&
      String(journeyStep) !== 'cross' &&
      String(type.journeyStep) !== String(journeyStep)
    ) {
      return false;
    }
    return true;
  });
}

function mapFillerForUi(filler) {
  if (filler === 'system_auto') return 'auto';
  return filler || 'patient';
}

function mapFlowLabel(flowApplies = []) {
  if (flowApplies.includes('tp')) return 'TP';
  if (flowApplies.includes('prp_hair')) return 'PRP hår';
  if (flowApplies.includes('prp_skin')) return 'PRP hud';
  if (flowApplies.includes('microneedling')) return 'Microneedling';
  if (flowApplies.includes('prf')) return 'PRF';
  if (flowApplies.includes('profhilo')) return 'Profhilo';
  return 'Alla';
}

module.exports = {
  CATALOG_PATH,
  getAllDocumentTypes,
  getDocumentTypeById,
  filterDocumentTypes,
  matchesFlow,
  matchesSurface,
  mapFillerForUi,
  mapFlowLabel,
};
