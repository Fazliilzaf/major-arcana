'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  asArray,
  asObject,
  capabilityMeta,
} = require('./cmoCapabilityHelpers');
const { collectCmoMarketingTexts } = require('../ops/cmoMarketingTextCollector');

const RISKY_CLAIM_PATTERNS = Object.freeze([
  {
    id: 'guarantee_result',
    label: 'Resultatgaranti',
    severity: 'high',
    pattern: /\b(garanterar resultat|100\s*%\s*framgång|garanterad effekt)\b/i,
  },
  {
    id: 'medical_cure',
    label: 'Medicinsk bot',
    severity: 'high',
    pattern: /\b(botar|läker alltid|riskfri behandling)\b/i,
  },
  {
    id: 'patient_story_without_consent',
    label: 'Patientcase utan samtycke',
    severity: 'high',
    pattern: /\b(patient berättar|före\/efter-bild|riktiga patientresultat)\b/i,
  },
  {
    id: 'unapproved_superlative',
    label: 'Överdriven superlativ',
    severity: 'medium',
    pattern: /\b(bäst i världen|marknadens enda|revolutionerande bot)\b/i,
  },
]);

function claimMatchesText(claimText, haystack) {
  const needle = normalizeText(claimText).toLowerCase();
  if (!needle) return false;
  return normalizeText(haystack).toLowerCase().includes(needle);
}

class ValidateMarketingClaimsCapability extends BaseCapability {
  static name = 'ValidateMarketingClaims';
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
    const whitelist = asArray(snapshot.marketingClaimsWhitelist);
    const texts = collectCmoMarketingTexts(snapshot);

    if (!texts.length) {
      warnings.push('Ingen marketing-text att validera.');
    }

    const approvedMatches = [];
    const flaggedClaims = [];

    for (const item of texts) {
      const text = normalizeText(item.text);
      if (!text) continue;

      for (const claim of whitelist) {
        if (claimMatchesText(claim.text, text)) {
          approvedMatches.push({
            claimId: claim.id,
            matchedText: claim.text,
            source: item.source,
          });
        }
      }

      for (const risky of RISKY_CLAIM_PATTERNS) {
        if (!risky.pattern.test(text)) continue;
        const coveredByWhitelist = whitelist.some((claim) => claimMatchesText(claim.text, text));
        if (coveredByWhitelist) continue;
        flaggedClaims.push({
          id: risky.id,
          label: risky.label,
          severity: risky.severity,
          source: item.source,
          snippet: text.slice(0, 180),
          reason: 'Risky claim saknar godkänd whitelist-match.',
        });
      }
    }

    const highFlags = flaggedClaims.filter((item) => item.severity === 'high');
    const passed = highFlags.length === 0;

    return {
      data: {
        outputType: 'MarketingClaimsValidation',
        passed,
        flaggedClaims: flaggedClaims.slice(0, 25),
        approvedMatches: approvedMatches.slice(0, 25),
        scannedTextCount: texts.length,
        whitelistCount: whitelist.length,
        summary: passed
          ? `Claims-validering OK (${texts.length} textsegment).`
          : `${flaggedClaims.length} claims flaggade (${highFlags.length} high).`,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(ValidateMarketingClaimsCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  ValidateMarketingClaimsCapability,
};
