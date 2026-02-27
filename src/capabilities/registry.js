const { assertCapabilityClass } = require('./capabilityContract');
const { GenerateTaskPlanCapability } = require('./generateTaskPlan');
const { SummarizeIncidentsCapability } = require('./summarizeIncidents');
const { AnalyzeInboxCapability } = require('./analyzeInbox');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { COO_AGENT_NAME } = require('../agents/cooDailyBriefAgent');
const { CCO_AGENT_NAME } = require('../agents/ccoInboxAgent');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CAPABILITY_DEFINITIONS = Object.freeze([
  assertCapabilityClass(GenerateTaskPlanCapability),
  assertCapabilityClass(SummarizeIncidentsCapability),
  assertCapabilityClass(AnalyzeInboxCapability),
]);

const CAPABILITY_MAP = new Map(
  CAPABILITY_DEFINITIONS.map((capability) => [normalizeText(capability.name).toLowerCase(), capability])
);

const AGENT_BUNDLE_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: COO_AGENT_NAME,
    version: '1.0.0',
    role: 'COO',
    capabilities: Object.freeze(['SummarizeIncidents', 'GenerateTaskPlan']),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'DailyBrief',
    plannedCapabilities: Object.freeze(['AnalyzeRiskTrend']),
  }),
  Object.freeze({
    name: 'CAO',
    version: '1.0.0',
    role: 'CAO',
    capabilities: Object.freeze([]),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'none',
    outputType: 'none',
    plannedCapabilities: Object.freeze([
      'SuggestTemplateImprovement',
      'ValidateDisclaimers',
      'OptimizeVariables',
    ]),
  }),
  Object.freeze({
    name: CCO_AGENT_NAME,
    version: '1.0.0',
    role: 'CCO',
    capabilities: Object.freeze(['AnalyzeInbox']),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'InboxAnalysis',
    plannedCapabilities: Object.freeze(['PrepareResponseDrafts']),
  }),
]);

const AGENT_BUNDLE_MAP = new Map();
AGENT_BUNDLE_DEFINITIONS.forEach((bundle) => {
  const keys = [bundle.name, bundle.role];
  for (const key of keys) {
    const normalized = normalizeText(key).toLowerCase();
    if (!normalized) continue;
    AGENT_BUNDLE_MAP.set(normalized, bundle);
  }
});

function listCapabilities() {
  return CAPABILITY_DEFINITIONS.map((capability) => ({
    name: capability.name,
    version: capability.version,
    allowedRoles: Array.isArray(capability.allowedRoles) ? [...capability.allowedRoles] : [],
    allowedChannels: Array.isArray(capability.allowedChannels) ? [...capability.allowedChannels] : [],
    channels: Array.isArray(capability.allowedChannels) ? [...capability.allowedChannels] : [],
    persistStrategy: capability.persistStrategy,
    auditStrategy: capability.auditStrategy,
    requiresInputRisk: capability.requiresInputRisk === true,
    requiresOutputRisk: capability.requiresOutputRisk === true,
    requiresPolicyFloor: capability.requiresPolicyFloor === true,
  }));
}

function getCapabilityByName(name = '') {
  const normalized = normalizeText(name).toLowerCase();
  if (!normalized) return null;
  return CAPABILITY_MAP.get(normalized) || null;
}

function listAgentBundles() {
  return AGENT_BUNDLE_DEFINITIONS.map((bundle) => ({
    name: bundle.name,
    version: bundle.version,
    role: bundle.role,
    capabilities: Array.isArray(bundle.capabilities) ? [...bundle.capabilities] : [],
    allowedRoles: Array.isArray(bundle.allowedRoles) ? [...bundle.allowedRoles] : [],
    allowedChannels: Array.isArray(bundle.allowedChannels) ? [...bundle.allowedChannels] : [],
    persistStrategy: bundle.persistStrategy,
    outputType: bundle.outputType,
    plannedCapabilities: Array.isArray(bundle.plannedCapabilities)
      ? [...bundle.plannedCapabilities]
      : [],
  }));
}

function getAgentBundleByName(name = '') {
  const normalized = normalizeText(name).toLowerCase();
  if (!normalized) return null;
  return AGENT_BUNDLE_MAP.get(normalized) || null;
}

module.exports = {
  listCapabilities,
  getCapabilityByName,
  listAgentBundles,
  getAgentBundleByName,
};
