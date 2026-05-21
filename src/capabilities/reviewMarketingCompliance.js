'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  asArray,
  asObject,
  capabilityMeta,
} = require('./cmoCapabilityHelpers');
const {
  runClinicalGuardScan,
  resolveComplianceStatus,
  collectSnapshotForCompliance,
} = require('../ops/cmoComplianceGate');

const COMPLIANCE_CHECKS = Object.freeze([
  {
    id: 'gdpr_consent_hint',
    label: 'GDPR/samtycke för case/testimonial',
    pattern: /\b(testimonial|patientcase|före\/efter|kundcitat)\b/i,
    requiresPhrase: /\b(samtycke|godkänt|anonymiserat)\b/i,
    severity: 'medium',
  },
  {
    id: 'patient_near_copy',
    label: 'Patientnära budskap',
    pattern: /\b(patient|behandlingsresultat|medicinsk rådgivning)\b/i,
    severity: 'medium',
  },
  {
    id: 'legal_sensitive',
    label: 'Juridiskt känslig formulering',
    pattern: /\b(juridiskt bindande|godkänd av läkemedelsverket|certifierad behandling)\b/i,
    severity: 'high',
  },
]);

class ReviewMarketingComplianceCapability extends BaseCapability {
  static name = 'ReviewMarketingCompliance';
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
    properties: {},
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const warnings = [];
    const claimsValidation = asObject(snapshot.validateMarketingClaims);
    const flaggedFromClaims = asArray(claimsValidation.flaggedClaims);
    const { combinedText } = collectSnapshotForCompliance(snapshot);

    const clinicalGuard = runClinicalGuardScan(combinedText);
    const checks = [];

    for (const rule of COMPLIANCE_CHECKS) {
      if (!rule.pattern.test(combinedText)) {
        checks.push({ id: rule.id, label: rule.label, status: 'clear' });
        continue;
      }
      const hasRequiredPhrase =
        !rule.requiresPhrase || rule.requiresPhrase.test(combinedText);
      checks.push({
        id: rule.id,
        label: rule.label,
        status: hasRequiredPhrase ? 'needs_owner' : 'triggered',
        severity: rule.severity,
        evidence: 'Match i genererad marketing-copy.',
      });
    }

    for (const hit of asArray(clinicalGuard.hits)) {
      checks.push({
        id: `clinical_guard_${hit.id}`,
        label: hit.label,
        status: 'triggered',
        severity: hit.severity || 'high',
        evidence: 'CLINICAL_GUARD policy floor.',
      });
    }

    const triggeredHigh = checks.filter(
      (item) => item.status === 'triggered' && normalizeText(item.severity) === 'high'
    );
    const needsOwnerChecks = checks.filter((item) => item.status === 'needs_owner');
    const claimHigh = flaggedFromClaims.filter((item) => item.severity === 'high');

    const status = resolveComplianceStatus({
      blocked: clinicalGuard.blocked || triggeredHigh.length > 0 || claimHigh.length > 0,
      needsOwner:
        needsOwnerChecks.length > 0 ||
        flaggedFromClaims.some((item) => item.severity === 'medium') ||
        claimsValidation.passed === false,
    });

    return {
      data: {
        outputType: 'ComplianceReview',
        status,
        passed: status === 'passed',
        blocked: status === 'blocked',
        needsOwner: status === 'needs_owner',
        clinicalGuard: {
          ...clinicalGuard,
          agent: 'CLINICAL_GUARD',
        },
        checks,
        flaggedClaims: flaggedFromClaims.slice(0, 25),
        summary:
          status === 'passed'
            ? 'Compliance-gate passerad.'
            : status === 'blocked'
              ? 'Compliance-gate blockerad — åtgärda flaggor före schemaläggning.'
              : 'Compliance kräver OWNER-granskning före schemaläggning.',
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(ReviewMarketingComplianceCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  ReviewMarketingComplianceCapability,
};
