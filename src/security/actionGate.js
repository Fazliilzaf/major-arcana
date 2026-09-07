'use strict';

/**
 * actionGate.js — Action authorization (WP-007).
 *
 * Det tredje behörighetslagret, separat från:
 *   1. Staff RBAC (vad personen ÄR)        — roles.js / ccoRbac
 *   2. Agent entitlement (vilken AI-kollega) — staffAgentEntitlementStore
 *   3. Action permission (vad agenten FÅR göra) — DENNA fil
 *
 * Fail-closed: okänd action/agent, saknad entitlement, disabled, tenant-mismatch,
 * saknad policy → DENY. Frontend/modell är ALDRIG authority — servern bestämmer.
 *
 * Inga riktiga mutationsverktyg kopplas in här; kontraktet verifieras med mocks.
 */

const AGENT_IDS = Object.freeze(['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO']);

const ACTION_LEVELS = Object.freeze(['READ', 'DRAFT', 'PREVIEW', 'WRITE', 'DEPLOY', 'RESTRICTED']);

const APPROVAL_CLASSES = Object.freeze([
  'NONE', 'USER_CONFIRMATION', 'OWNER_APPROVAL', 'CLINICAL_APPROVAL', 'RELEASE_APPROVAL',
]);

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }

function classifyAction(action) {
  const a = normalizeText(action).toLowerCase();
  if (!a) return '';
  if (/\b(secret|rotate|password|token|payment|betalning|clinical|patient|journal|dicom)\b/.test(a)) return 'RESTRICTED';
  if (/\b(deploy|merge|release|publish-prod)\b/.test(a)) return 'DEPLOY';
  if (/\.write_candidate\b/.test(a)) return 'WRITE'; // WP-010 candidate-promote
  if (/\.write\b/.test(a)) return 'WRITE';
  if (/\.preview\b/.test(a)) return 'PREVIEW';
  if (/\.draft\b/.test(a)) return 'DRAFT';
  if (/\.(read|search|analyze|report|list)\b/.test(a) || a === 'chat') return 'READ';
  return ''; // okänd → fail-closed (klassas DENY)
}

/**
 * Agent-policy v1: tillåtna action-prefix + vilka actions som kräver approval.
 * RESTRICTED/DEPLOY hanteras globalt (approval), övrigt per agent.
 */
const AGENT_ALLOW_PREFIXES = Object.freeze({
  CCO: ['communication.', 'chat', 'bookings.read'],
  CFO: ['finance.', 'chat'],
  CMO: ['website.', 'content.', 'chat'],
  CAO: ['admin.', 'template.', 'chat'],
  COO: ['ops.', 'chat'],
  CEO: ['chat'], // CEO = advisory/briefing i v1
});

const APPROVAL_RULES = Object.freeze([
  { match: (a) => /\b(secret|rotate|password|token)\b/.test(a), approval: 'OWNER_APPROVAL' },
  { match: (a) => /\b(deploy|merge|release)\b/.test(a), approval: 'RELEASE_APPROVAL' },
  { match: (a) => /\b(clinical|patient|journal|dicom|payment|betalning)\b/.test(a), approval: 'CLINICAL_APPROVAL' },
]);

function _deny(reason) {
  return { decision: 'DENY', reason, level: null, approval: null };
}

function evaluateAction(input = {}) {
  const userId = normalizeText(input.userId);
  const tenantId = normalizeText(input.tenantId);
  const role = normalizeText(input.role);
  const agent = normalizeText(input.agent).toUpperCase();
  const action = normalizeText(input.action);
  const resource = normalizeText(input.resource);
  const hasEntitlement = input.hasEntitlement === true;
  const isDisabled = input.isDisabled === true;
  const expectedTenant = normalizeText(input.expectedTenant);

  if (!userId || !tenantId) return _deny('no_identity');
  if (isDisabled) return _deny('disabled_staff');
  if (!AGENT_IDS.includes(agent)) return _deny('unknown_agent');
  if (expectedTenant && expectedTenant !== tenantId) return _deny('tenant_mismatch');
  if (!hasEntitlement) return _deny('no_entitlement');

  const level = classifyAction(action);
  if (!level) return _deny('unknown_action');

  const policy = AGENT_ALLOW_PREFIXES[agent];
  if (!policy) return _deny('no_policy');

  // RESTRICTED/DEPLOY → approval (globalt).
  for (const rule of APPROVAL_RULES) {
    if (rule.match(action)) {
      return { decision: 'REQUIRE_APPROVAL', reason: `approval_required:${level.toLowerCase()}`, level, approval: rule.approval };
    }
  }

  // WP-010 (DEL D/E): första kontrollerade WRITE — promote isolerad draft till
  // candidate state (INTE canonical/main). Kräver OWNER-godkännande. Övriga
  // .write-actions (canonical) förblir DENY.
  if (action === 'cmo.content.write_candidate') {
    return {
      decision: 'REQUIRE_APPROVAL',
      reason: 'approval_required:write_candidate',
      level,
      approval: 'OWNER_APPROVAL',
    };
  }

  // WRITE: inga riktiga mutationsverktyg i v1 → DENY (fail-closed).
  if (level === 'WRITE') return _deny('write_not_allowed_in_v1');

  const allowed = policy.some((p) => action === p || action.startsWith(p));
  if (!allowed) return _deny('action_not_allowed_for_agent');

  return { decision: 'ALLOW', reason: `allowed:${level.toLowerCase()}`, level, approval: 'NONE' };
}

module.exports = {
  AGENT_IDS,
  ACTION_LEVELS,
  APPROVAL_CLASSES,
  classifyAction,
  evaluateAction,
  AGENT_ALLOW_PREFIXES,
};
