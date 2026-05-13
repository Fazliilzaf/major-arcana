'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const REQUIRED_DISCLAIMER_PATTERNS = [
  { id: 'no_guarantee', pattern: /garanter|guarantee|garantera/i, label: 'Inga resultatgarantier' },
  {
    id: 'medical_advice',
    pattern: /medicins[kt]\s+r[aå]d|medical\s+advice|l[aä]kare/i,
    label: 'Medicinsk raadgivning-disclaimer',
  },
  {
    id: 'individual_results',
    pattern: /individuell[at]?\s+resultat|individual\s+results|personlig/i,
    label: 'Individuella resultat-disclaimer',
  },
  {
    id: 'consultation_required',
    pattern: /konsultation|consultation|bed[oö]mning/i,
    label: 'Konsultationskrav',
  },
];

const BANNED_CLAIM_PATTERNS = [
  {
    id: 'absolute_guarantee',
    pattern: /100\s*%\s*(garanti|s[aä]ker|resultat)|garanterat\s+resultat/i,
    label: 'Absolut garanti',
  },
  {
    id: 'best_in_class',
    pattern: /b[aä]st\s+i\s+(Sverige|v[aä]rlden|klassen)|world[- ]?class|market-?leading/i,
    label: 'Obervisade superlativ',
  },
  {
    id: 'cure_claim',
    pattern: /botar|cures?|eliminera\s+(h[aå]ravfall|baldness)/i,
    label: 'Botansprak',
  },
  {
    id: 'no_side_effects',
    pattern: /inga\s+biverkningar|no\s+side\s+effects|riskfri/i,
    label: 'Biverkningsfornekelse',
  },
];

function checkDisclaimers(content) {
  const text = normalizeText(content);
  if (!text)
    return { present: [], missing: REQUIRED_DISCLAIMER_PATTERNS.map((p) => p.id), violations: [] };

  const present = [];
  const missing = [];
  for (const pattern of REQUIRED_DISCLAIMER_PATTERNS) {
    if (pattern.pattern.test(text)) {
      present.push(pattern.id);
    } else {
      missing.push(pattern.id);
    }
  }

  const violations = [];
  for (const pattern of BANNED_CLAIM_PATTERNS) {
    if (pattern.pattern.test(text)) {
      violations.push({ id: pattern.id, label: pattern.label });
    }
  }

  return { present, missing, violations };
}

class ValidateDisclaimersCapability extends BaseCapability {
  static name = 'ValidateDisclaimers';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      strictMode: { type: 'boolean' },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['results', 'summary', 'generatedAt'],
        additionalProperties: true,
      },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input =
      safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot =
      safeContext.systemStateSnapshot && typeof safeContext.systemStateSnapshot === 'object'
        ? safeContext.systemStateSnapshot
        : {};

    const templates = asArray(snapshot.templates || snapshot.latestTemplateChanges);
    const strictMode = input.strictMode === true;
    const warnings = [];

    if (templates.length === 0) {
      warnings.push('Inga mallar hittades i snapshot.');
    }

    const results = templates.map((template) => {
      const content = normalizeText(
        template?.content || template?.bodyText || template?.primaryBodyHtml
      );
      const check = checkDisclaimers(content);
      const compliant = check.missing.length === 0 && check.violations.length === 0;
      const score = Math.max(0, 100 - check.missing.length * 20 - check.violations.length * 30);

      return {
        templateId: normalizeText(template?.templateId || template?.id),
        templateName: normalizeText(template?.name),
        category: normalizeText(template?.category),
        compliant,
        score: Math.max(0, Math.min(100, score)),
        disclaimersPresent: check.present,
        disclaimersMissing: check.missing,
        violations: check.violations,
      };
    });

    const compliantCount = results.filter((r) => r.compliant).length;
    const violationCount = results.reduce((sum, r) => sum + r.violations.length, 0);
    const nonCompliant = results.filter((r) => !r.compliant);

    if (strictMode && nonCompliant.length > 0) {
      warnings.push(`${nonCompliant.length} mallar ar inte compliance-godkaenda i strict mode.`);
    }

    const summary = `${compliantCount}/${results.length} mallar godkaenda. ${violationCount} regelbrott identifierade.`;

    return {
      data: {
        results,
        compliantCount,
        totalCount: results.length,
        violationCount,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: ValidateDisclaimersCapability.name,
        version: ValidateDisclaimersCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  ValidateDisclaimersCapability,
};
