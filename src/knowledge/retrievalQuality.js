'use strict';

/**
 * Retrieval Quality — trust layer for knowledge base results.
 *
 * Lägger till: source citation, staleness warning, confidence scoring,
 * "used in answer" tracking. DXM Wave 3.
 */

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

function computeStaleness(updatedAt) {
  if (!updatedAt) return { stale: true, ageDays: Infinity, warning: 'Dokumentet saknar uppdateringsdatum.' };
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return { stale: false, ageDays: 0, warning: null };
  const ageDays = Math.round(ageMs / (24 * 60 * 60 * 1000));
  if (ageDays > 90) return { stale: true, ageDays, warning: `Dokumentet har inte uppdaterats på ${ageDays} dagar — verifiera aktualitet.` };
  if (ageDays > 30) return { stale: false, ageDays, warning: `Dokumentet är ${ageDays} dagar gammalt.` };
  return { stale: false, ageDays, warning: null };
}

function scoreRetrievalConfidence(result) {
  let score = 0;
  const matchScore = toNumber(result?.score, 0);
  score += Math.min(50, matchScore * 5);
  const tokenCount = toNumber(result?.tokenCount, 0);
  if (tokenCount > 50) score += 15;
  if (tokenCount > 150) score += 10;
  const staleness = computeStaleness(result?.updatedAt);
  if (!staleness.stale) score += 20;
  if (staleness.ageDays < 14) score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function enrichRetrievalResults(results = [], { query = '', tenantId = '' } = {}) {
  return asArray(results).map((result, index) => {
    const staleness = computeStaleness(result?.updatedAt);
    const confidence = scoreRetrievalConfidence(result);

    return {
      ...result,
      citation: {
        source: normalizeText(result?.title || result?.documentId),
        chunkId: normalizeText(result?.chunkId),
        category: normalizeText(result?.category),
        position: index + 1,
        label: `${normalizeText(result?.title)}, chunk ${toNumber(result?.position, index) + 1}`,
      },
      quality: {
        confidence,
        confidenceLabel: confidence >= 70 ? 'Hög' : confidence >= 40 ? 'Medel' : 'Låg',
        staleness,
        tokenCount: toNumber(result?.tokenCount, 0),
      },
      usedInAnswer: false,
    };
  });
}

function buildRetrievalSummary(enrichedResults = []) {
  const results = asArray(enrichedResults);
  if (results.length === 0) {
    return {
      resultCount: 0,
      averageConfidence: 0,
      staleCount: 0,
      citations: [],
      riskLevel: 'high',
      riskReason: 'Inga kunskapskällor hittades.',
    };
  }

  const avgConfidence = Math.round(
    results.reduce((sum, r) => sum + toNumber(r?.quality?.confidence, 0), 0) / results.length
  );
  const staleCount = results.filter((r) => r?.quality?.staleness?.stale).length;
  const citations = results.map((r) => r?.citation?.label).filter(Boolean);

  let riskLevel = 'low';
  let riskReason = 'Tillförlitliga källor.';
  if (avgConfidence < 40) {
    riskLevel = 'high';
    riskReason = 'Låg genomsnittlig konfidens — verifiera manuellt.';
  } else if (staleCount > results.length / 2) {
    riskLevel = 'medium';
    riskReason = `${staleCount}/${results.length} källor är föråldrade.`;
  } else if (avgConfidence < 60) {
    riskLevel = 'medium';
    riskReason = 'Medelhög konfidens — granska källa vid behov.';
  }

  return {
    resultCount: results.length,
    averageConfidence: avgConfidence,
    staleCount,
    citations,
    riskLevel,
    riskReason,
  };
}

module.exports = {
  enrichRetrievalResults,
  buildRetrievalSummary,
  computeStaleness,
  scoreRetrievalConfidence,
};
