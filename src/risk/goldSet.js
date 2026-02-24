const fs = require('node:fs/promises');

const { evaluateTemplateRisk } = require('./templateRisk');
const { normalizeCategory, isValidCategory } = require('../templates/constants');

const GOLD_BANDS = Object.freeze(['safe', 'borderline', 'critical']);
const LEVELS = Object.freeze([1, 2, 3, 4, 5]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampRiskLevel(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(5, parsed));
}

function levelToBand(riskLevel) {
  const level = clampRiskLevel(riskLevel) || 1;
  if (level <= 2) return 'safe';
  if (level === 3) return 'borderline';
  return 'critical';
}

function normalizeBand(value) {
  const normalized = normalizeText(value).toLowerCase();
  return GOLD_BANDS.includes(normalized) ? normalized : '';
}

function normalizeVariableValidation(value) {
  if (!value || typeof value !== 'object') return null;
  const unknownVariables = Array.isArray(value.unknownVariables)
    ? value.unknownVariables.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const missingRequiredVariables = Array.isArray(value.missingRequiredVariables)
    ? value.missingRequiredVariables.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (!unknownVariables.length && !missingRequiredVariables.length) return null;
  return {
    unknownVariables,
    missingRequiredVariables,
  };
}

function formatPercent(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function computeF1(precision, recall) {
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

async function readGoldSetFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const sourceCases = Array.isArray(parsed?.cases) ? parsed.cases : [];
  const cases = [];

  for (let index = 0; index < sourceCases.length; index += 1) {
    const row = sourceCases[index];
    if (!row || typeof row !== 'object') continue;
    const id = normalizeText(row.id) || `case-${index + 1}`;
    const category = normalizeCategory(row.category);
    const content = normalizeText(row.content);
    const expectedRiskLevel = clampRiskLevel(row.expectedRiskLevel);
    let expectedBand = normalizeBand(row.expectedBand);
    if (!expectedBand && expectedRiskLevel !== null) {
      expectedBand = levelToBand(expectedRiskLevel);
    }

    if (!isValidCategory(category)) continue;
    if (!content || !expectedBand) continue;

    cases.push({
      id,
      category,
      content,
      expectedBand,
      expectedRiskLevel,
      variableValidation: normalizeVariableValidation(row.variableValidation),
      notes: normalizeText(row.notes),
    });
  }

  const byBand = {
    safe: 0,
    borderline: 0,
    critical: 0,
  };
  for (const item of cases) {
    byBand[item.expectedBand] += 1;
  }

  return {
    version: normalizeText(parsed?.version) || 'unknown',
    generatedAt: normalizeText(parsed?.generatedAt) || null,
    source: normalizeText(parsed?.source) || null,
    count: cases.length,
    byBand,
    cases,
  };
}

function buildBandMatrix() {
  const matrix = {};
  for (const expectedBand of GOLD_BANDS) {
    matrix[expectedBand] = {};
    for (const predictedBand of GOLD_BANDS) {
      matrix[expectedBand][predictedBand] = 0;
    }
  }
  return matrix;
}

function buildLevelMatrix() {
  const matrix = {};
  for (const expectedLevel of LEVELS) {
    matrix[String(expectedLevel)] = {};
    for (const predictedLevel of LEVELS) {
      matrix[String(expectedLevel)][String(predictedLevel)] = 0;
    }
  }
  return matrix;
}

function evaluateGoldSetCases({
  cases,
  tenantRiskModifier = 0,
}) {
  const sourceCases = Array.isArray(cases) ? cases : [];
  const modifier = Number.isFinite(Number(tenantRiskModifier))
    ? Number(tenantRiskModifier)
    : 0;

  const expectedBandTotals = {
    safe: 0,
    borderline: 0,
    critical: 0,
  };
  const predictedBandTotals = {
    safe: 0,
    borderline: 0,
    critical: 0,
  };
  const bandMatrix = buildBandMatrix();

  const expectedLevelTotals = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  const predictedLevelTotals = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  const levelMatrix = buildLevelMatrix();

  const mismatches = [];
  let evaluatedCount = 0;
  let correctBandCount = 0;
  let withExpectedLevelCount = 0;
  let correctLevelCount = 0;

  for (const item of sourceCases) {
    if (!item) continue;
    const expectedBand = normalizeBand(item.expectedBand);
    const category = normalizeCategory(item.category);
    const content = normalizeText(item.content);
    if (!expectedBand || !isValidCategory(category) || !content) continue;

    const evaluation = evaluateTemplateRisk({
      category,
      content,
      tenantRiskModifier: modifier,
      variableValidation: item.variableValidation || null,
    });
    const predictedRiskLevel = clampRiskLevel(evaluation.riskLevel) || 1;
    const predictedBand = levelToBand(predictedRiskLevel);

    evaluatedCount += 1;
    expectedBandTotals[expectedBand] += 1;
    predictedBandTotals[predictedBand] += 1;
    bandMatrix[expectedBand][predictedBand] += 1;

    if (expectedBand === predictedBand) {
      correctBandCount += 1;
    } else if (mismatches.length < 25) {
      mismatches.push({
        id: item.id,
        category,
        expectedBand,
        predictedBand,
        expectedRiskLevel: item.expectedRiskLevel ?? null,
        predictedRiskLevel,
        decision: evaluation.decision,
        reasonCodes: Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : [],
      });
    }

    predictedLevelTotals[String(predictedRiskLevel)] += 1;
    const expectedRiskLevel = clampRiskLevel(item.expectedRiskLevel);
    if (expectedRiskLevel !== null) {
      withExpectedLevelCount += 1;
      expectedLevelTotals[String(expectedRiskLevel)] += 1;
      levelMatrix[String(expectedRiskLevel)][String(predictedRiskLevel)] += 1;
      if (expectedRiskLevel === predictedRiskLevel) {
        correctLevelCount += 1;
      }
    }
  }

  const bandMetrics = {};
  for (const band of GOLD_BANDS) {
    const tp = bandMatrix[band][band];
    const precision = safeDivide(tp, predictedBandTotals[band]);
    const recall = safeDivide(tp, expectedBandTotals[band]);
    const f1 = computeF1(precision, recall);
    bandMetrics[band] = {
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support: expectedBandTotals[band],
    };
  }

  const levelMetrics = {};
  for (const level of LEVELS) {
    const levelKey = String(level);
    const tp = levelMatrix[levelKey][levelKey];
    const precision = safeDivide(tp, predictedLevelTotals[levelKey]);
    const recall = safeDivide(tp, expectedLevelTotals[levelKey]);
    const f1 = computeF1(precision, recall);
    levelMetrics[levelKey] = {
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support: expectedLevelTotals[levelKey],
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    tenantRiskModifier: Number(modifier.toFixed(2)),
    totals: {
      cases: evaluatedCount,
      withExpectedLevel: withExpectedLevelCount,
      correctBand: correctBandCount,
      correctLevel: correctLevelCount,
      bandAccuracy: Number(safeDivide(correctBandCount, evaluatedCount).toFixed(4)),
      bandAccuracyPercent: formatPercent(correctBandCount, evaluatedCount),
      levelAccuracy: Number(safeDivide(correctLevelCount, withExpectedLevelCount).toFixed(4)),
      levelAccuracyPercent: formatPercent(correctLevelCount, withExpectedLevelCount),
    },
    byBand: {
      expected: expectedBandTotals,
      predicted: predictedBandTotals,
    },
    bandConfusionMatrix: bandMatrix,
    bandMetrics,
    byLevel: {
      expected: expectedLevelTotals,
      predicted: predictedLevelTotals,
    },
    levelConfusionMatrix: levelMatrix,
    levelMetrics,
    mismatches,
  };
}

async function evaluateGoldSetFile({
  filePath,
  tenantRiskModifier = 0,
}) {
  const dataset = await readGoldSetFile(filePath);
  const report = evaluateGoldSetCases({
    cases: dataset.cases,
    tenantRiskModifier,
  });
  return {
    dataset: {
      version: dataset.version,
      generatedAt: dataset.generatedAt,
      source: dataset.source,
      count: dataset.count,
      byBand: dataset.byBand,
      filePath,
    },
    report,
  };
}

module.exports = {
  GOLD_BANDS,
  readGoldSetFile,
  evaluateGoldSetCases,
  evaluateGoldSetFile,
  levelToBand,
};
