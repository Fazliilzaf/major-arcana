'use strict';

const { evaluatePolicyFloorText, POLICY_CONTEXT } = require('../policy/floor');
const { collectCmoMarketingTexts, joinCollectedTexts } = require('./cmoMarketingTextCollector');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveComplianceStatus({ blocked = false, needsOwner = false, highFlags = 0 } = {}) {
  if (blocked || highFlags > 0) return 'blocked';
  if (needsOwner) return 'needs_owner';
  return 'passed';
}

function applyComplianceGateToCampaigns(campaigns = [], complianceReview = {}) {
  const status = normalizeText(complianceReview.status).toLowerCase() || 'needs_owner';
  return asArray(campaigns).map((campaign) => {
    const next = { ...campaign };
    if (status === 'blocked') {
      next.readiness = 'compliance_blocked';
      next.complianceBlocked = true;
    } else if (status === 'needs_owner') {
      if (next.readiness === 'ready') next.readiness = 'needs_compliance_owner';
      next.complianceOwnerRequired = true;
    } else if (next.readiness === 'ready') {
      next.complianceCleared = true;
    }
    return next;
  });
}

function applyComplianceGateToProductionPacks({
  socialPostPack = {},
  adCopyPack = {},
  emailDrafts = {},
  complianceReview = {},
} = {}) {
  const status = normalizeText(complianceReview.status).toLowerCase() || 'needs_owner';
  const blocked = status === 'blocked';
  const needsOwner = status === 'needs_owner';

  const socialPosts = asArray(socialPostPack.posts).map((post) => ({
    ...post,
    status: blocked ? 'compliance_blocked' : needsOwner ? 'needs_compliance_owner' : post.status || 'draft',
    complianceGate: status,
  }));

  const ads = asArray(adCopyPack.ads).map((ad) => ({
    ...ad,
    status: blocked ? 'compliance_blocked' : needsOwner ? 'needs_compliance_owner' : ad.status || 'draft',
    complianceGate: status,
  }));

  const emails = asArray(emailDrafts.emails).map((email) => ({
    ...email,
    status: blocked ? 'compliance_blocked' : needsOwner ? 'needs_compliance_owner' : email.status || 'draft',
    complianceGate: status,
  }));

  return {
    socialPostPack: { ...socialPostPack, posts: socialPosts },
    adCopyPack: { ...adCopyPack, ads },
    emailDrafts: { ...emailDrafts, emails },
  };
}

function buildComplianceReviewFromRuns({
  validateClaimsOutput = null,
  reviewComplianceOutput = null,
} = {}) {
  const validateData =
    validateClaimsOutput && typeof validateClaimsOutput === 'object'
      ? validateClaimsOutput.data || validateClaimsOutput
      : {};
  const reviewData =
    reviewComplianceOutput && typeof reviewComplianceOutput === 'object'
      ? reviewComplianceOutput.data || reviewComplianceOutput
      : {};

  const flaggedClaims = asArray(validateData.flaggedClaims);
  const highSeverityFlags = flaggedClaims.filter((item) => normalizeText(item.severity) === 'high');
  const reviewStatus = normalizeText(reviewData.status).toLowerCase();
  const clinicalBlocked = reviewData.clinicalGuard?.blocked === true;

  const status =
    reviewStatus ||
    resolveComplianceStatus({
      blocked: clinicalBlocked || validateData.passed === false,
      needsOwner: flaggedClaims.length > 0 || reviewData.needsOwner === true,
      highFlags: highSeverityFlags.length,
    });

  return {
    outputType: 'ComplianceReview',
    status,
    passed: status === 'passed',
    blocked: status === 'blocked',
    needsOwner: status === 'needs_owner',
    flaggedClaims,
    approvedMatches: asArray(validateData.approvedMatches),
    clinicalGuard: reviewData.clinicalGuard || null,
    checks: asArray(reviewData.checks),
    summary: normalizeText(reviewData.summary) || normalizeText(validateData.summary) || '',
    reviewedAt: new Date().toISOString(),
    reviewerAgents: ['ValidateMarketingClaims', 'ReviewMarketingCompliance', 'CLINICAL_GUARD'],
  };
}

function runClinicalGuardScan(text = '') {
  return evaluatePolicyFloorText({
    text,
    context: POLICY_CONTEXT.MARKETING_COPY,
  });
}

function collectSnapshotForCompliance(snapshot = {}) {
  const texts = collectCmoMarketingTexts(snapshot);
  return {
    texts,
    combinedText: joinCollectedTexts(texts),
  };
}

module.exports = {
  resolveComplianceStatus,
  applyComplianceGateToCampaigns,
  applyComplianceGateToProductionPacks,
  buildComplianceReviewFromRuns,
  runClinicalGuardScan,
  collectSnapshotForCompliance,
};
