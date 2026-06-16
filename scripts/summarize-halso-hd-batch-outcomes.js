#!/usr/bin/env node
'use strict';

/**
 * Aggregate Hälsodeklaration batch report outcomes — no PII in stdout.
 * Usage: node scripts/summarize-halso-hd-batch-outcomes.js [reportPath] [--review-queue path]
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REPORT = path.join(process.cwd(), 'data/reports/halso-hd-batch-report.json');
const DEFAULT_REVIEW_QUEUE = path.join(process.cwd(), 'data/reports/halso-hd-review-queue.jsonl');

function parseArgs(argv) {
  const args = { reportPath: DEFAULT_REPORT, reviewQueuePath: null, runIdFilter: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--review-queue' && argv[i + 1]) {
      args.reviewQueuePath = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--run-id' && argv[i + 1]) {
      args.runIdFilter = argv[i + 1];
      i += 1;
    } else if (!argv[i].startsWith('-')) {
      args.reportPath = argv[i];
    }
  }
  return args;
}

function inc(map, key, n = 1) {
  map[key] = (map[key] || 0) + n;
}

function hasMaskedPnr(row) {
  return Boolean(row.personnummerMasked && String(row.personnummerMasked).startsWith('****'));
}

function inferUnmatchedReason(row) {
  if (row.matchMethod === 'ambiguous' || (row.matchConfidence > 0 && row.matchConfidence < 0.85)) {
    return 'weak_or_ambiguous_match';
  }
  if (hasMaskedPnr(row)) {
    return 'personnummer_not_in_cliento';
  }
  if (row.answerCount === 0) {
    return 'parse_incomplete';
  }
  return 'no_identity_or_patient_match';
}

function inferDuplicateDedupType(row, dedupKey) {
  if (dedupKey) {
    const prefix = String(dedupKey).split(':')[0];
    return prefix || 'unknown_key';
  }
  return 'inferred_prior_import';
}

function classifyFixability(row, reviewEntry) {
  const reasons = [];
  if (hasMaskedPnr(row)) {
    reasons.push('cliento_sync_or_pnr_link');
  }
  if (reviewEntry?.email || reviewEntry?.phone || reviewEntry?.displayName) {
    reasons.push('fuzzy_identity_fields');
  }
  if (row.matchMethod === 'ambiguous' || (reviewEntry?.candidatePatientIds || []).length > 1) {
    reasons.push('manual_disambiguation');
  }
  if (row.answerCount === 0 || row.parseReason) {
    reasons.push('parse_repair');
  }
  if (reasons.length === 0 && hasMaskedPnr(row)) {
    return ['cliento_sync_or_pnr_link'];
  }
  return reasons;
}

function readReviewQueue(filePath, runIdFilter) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, totalLines: 0, byStatus: {}, byRunId: {}, forRun: [] };
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return { exists: true, totalLines: 0, byStatus: {}, byRunId: {}, forRun: [] };
  }
  const lines = raw.split('\n');
  const byStatus = {};
  const byRunId = {};
  const forRun = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      inc(byStatus, '_parse_error');
      continue;
    }
    inc(byStatus, entry.status || 'unknown');
    inc(byRunId, entry.runId || 'unknown');
    if (!runIdFilter || entry.runId === runIdFilter) {
      forRun.push({
        status: entry.status,
        hasPersonnummer: Boolean(entry.personnummer),
        hasEmail: Boolean(entry.email),
        hasPhone: Boolean(entry.phone),
        hasDisplayName: Boolean(entry.displayName),
        candidateCount: (entry.candidatePatientIds || []).length,
        matchMethod: entry.matchMethod || null,
      });
    }
  }
  return {
    exists: true,
    totalLines: lines.filter((l) => l.trim()).length,
    byStatus,
    byRunId,
    forRun,
  };
}

function summarizeReport(report) {
  const rows = report.rows || [];
  const stats = report.stats || {};
  const byStatus = {};
  const duplicateByFormType = {};
  const duplicateWithPatientId = { yes: 0, no: 0 };
  const unmatchedByReason = {};
  const unmatchedByFormType = {};
  const duplicateByDedupKeyPrefix = {};
  const fixability = {
    likelyFixableViaReviewReprocess: 0,
    likelyClientoOrUuidIssue: 0,
    likelyParseIssue: 0,
    needsManualDisambiguation: 0,
  };

  for (const row of rows) {
    inc(byStatus, row.status || 'unknown');
    if (row.status === 'duplicate') {
      inc(duplicateByFormType, row.formType || 'unknown');
      if (row.patientId) duplicateWithPatientId.yes += 1;
      else duplicateWithPatientId.no += 1;
      const prefix = inferDuplicateDedupType(row, row.dedupKey);
      inc(duplicateByDedupKeyPrefix, prefix);
    }
    if (row.status === 'unmatched') {
      const reason = inferUnmatchedReason(row);
      inc(unmatchedByReason, reason);
      inc(unmatchedByFormType, row.formType || 'unknown');
      if (row.parseReason || row.answerCount === 0) {
        fixability.likelyParseIssue += 1;
      } else if (hasMaskedPnr(row)) {
        fixability.likelyClientoOrUuidIssue += 1;
        fixability.likelyFixableViaReviewReprocess += 1;
      } else {
        fixability.likelyFixableViaReviewReprocess += 1;
      }
    }
    if (row.status === 'needs_review') {
      fixability.needsManualDisambiguation += 1;
      fixability.likelyFixableViaReviewReprocess += 1;
    }
  }

  const suffixGroups = {};
  for (const row of rows) {
    if (!hasMaskedPnr(row)) continue;
    const suffix = String(row.personnummerMasked).slice(-4);
    if (!suffixGroups[suffix]) suffixGroups[suffix] = { total: 0, unmatched: 0, duplicate: 0 };
    suffixGroups[suffix].total += 1;
    if (row.status === 'unmatched') suffixGroups[suffix].unmatched += 1;
    if (row.status === 'duplicate') suffixGroups[suffix].duplicate += 1;
  }
  const mixedOutcomePnrSuffixes = Object.entries(suffixGroups)
    .filter(([, g]) => g.unmatched > 0 && g.duplicate > 0)
    .map(([suffix, g]) => ({ suffix, ...g }));

  return {
    meta: {
      runId: report.runId || null,
      batch: report.batch ?? null,
      batchSize: report.batchSize ?? null,
      batchCount: report.batchCount ?? rows.length,
      corpusTotal: report.corpusTotal ?? null,
      dryRun: report.dryRun ?? null,
      phase: report.phase || null,
      generatedAt: report.generatedAt || null,
      ingestFlagNote: report.ingestFlagNote || null,
      reviewQueuePath: report.reviewQueuePath || null,
    },
    ledgerStats: stats,
    rowCounts: byStatus,
    parsed: {
      parsedOk:
        stats.parsedOk ??
        byStatus.unmatched +
          byStatus.duplicate +
          byStatus.matched +
          byStatus.put_ok +
          byStatus.needs_review,
      parseFailed: stats.parseFailed ?? byStatus.parse_failed ?? 0,
      parseFailedByReason: stats.parseFailedByReason || {},
    },
    outcomes: {
      matched: stats.matched ?? byStatus.matched ?? 0,
      duplicate: stats.duplicate ?? byStatus.duplicate ?? 0,
      unmatched: stats.unmatched ?? byStatus.unmatched ?? 0,
      needsReview: stats.needsReview ?? byStatus.needs_review ?? 0,
      putOk: stats.putOk ?? byStatus.put_ok ?? 0,
      putFailed: stats.putFailed ?? byStatus.put_failed ?? 0,
      skippedCommit: stats.skippedCommit ?? 0,
      reviewQueued: stats.reviewQueued ?? 0,
      stubCreated: stats.stubCreated ?? 0,
    },
    duplicateBreakdown: {
      byFormType: duplicateByFormType,
      withPatientId: duplicateWithPatientId,
      byDedupKeyPrefix: duplicateByDedupKeyPrefix,
      note: 'Report rows omit dedupKey; duplicates are hits against batch dedup store from prior imports (internetMessageId / pnrSignedAt / rawMessageId keys).',
    },
    unmatchedBreakdown: {
      byInferredReason: unmatchedByReason,
      byFormType: unmatchedByFormType,
      withMaskedPersonnummer: rows.filter((r) => r.status === 'unmatched' && hasMaskedPnr(r))
        .length,
      withoutMaskedPersonnummer: rows.filter((r) => r.status === 'unmatched' && !hasMaskedPnr(r))
        .length,
      withZeroCandidates: rows.filter(
        (r) => r.status === 'unmatched' && !r.patientId && r.matchConfidence === 0
      ).length,
    },
    fixability,
    dataQualitySignals: {
      mixedOutcomePnrSuffixes,
      duplicateExpectedHealthy: duplicateWithPatientId.yes === (byStatus.duplicate || 0),
    },
    recommendation: buildRecommendation(report, stats, byStatus, fixability),
  };
}

function buildRecommendation(report, stats, byStatus, fixability) {
  const unmatched = stats.unmatched ?? byStatus.unmatched ?? 0;
  const duplicate = stats.duplicate ?? byStatus.duplicate ?? 0;
  const matched = stats.matched ?? byStatus.matched ?? 0;
  const putOk = stats.putOk ?? byStatus.put_ok ?? 0;
  const parseFailed = stats.parseFailed ?? 0;
  const ingestDisabled = String(report.ingestFlagNote || '').includes('INGEST_ENABLED=false');

  let action = 'proceed_batch_2';
  const rationale = [];

  if (parseFailed > 0) {
    action = 'review_reprocess_first';
    rationale.push(`${parseFailed} parse failures need parser fixes before scaling.`);
  } else {
    rationale.push('All messages parsed successfully (answerCount present).');
  }

  if (ingestDisabled && putOk === 0 && matched === 0) {
    rationale.push(
      'Batch commit ran with ingest PUT disabled; zero matched/putOk is expected when all new work is duplicate or unmatched.'
    );
  }

  if (duplicate > 0) {
    rationale.push(
      `${duplicate} duplicates are benign re-ingest skips (dedup store already has these forms linked to patient UUIDs).`
    );
  }

  if (unmatched > 0 && fixability.likelyClientoOrUuidIssue >= unmatched * 0.8) {
    rationale.push(
      `${unmatched} unmatched mostly have parsed personnummer but no Cliento patient — review-reprocess after Cliento sync likely recovers most.`
    );
    if (unmatched >= 20) {
      action = 'review_reprocess_cliento_sync_then_batch_2';
    }
  }

  if (fixability.likelyParseIssue > 0) {
    action = 'review_reprocess_first';
    rationale.push(`${fixability.likelyParseIssue} rows look like parse-quality issues.`);
  }

  return { action, rationale };
}

function summarizeReviewQueue(review, reportRunId) {
  const forRun = review.forRun || [];
  const agg = {
    exists: review.exists,
    totalLinesAllRuns: review.totalLines,
    byStatusAllRuns: review.byStatus,
    byRunIdAllRuns: review.byRunId,
    forReportRunId: reportRunId,
    forReportRun: {
      count: forRun.length,
      byStatus: {},
      withPersonnummer: 0,
      withEmail: 0,
      withPhone: 0,
      withDisplayName: 0,
      withMultipleCandidates: 0,
    },
  };
  for (const entry of forRun) {
    inc(agg.forReportRun.byStatus, entry.status || 'unknown');
    if (entry.hasPersonnummer) agg.forReportRun.withPersonnummer += 1;
    if (entry.hasEmail) agg.forReportRun.withEmail += 1;
    if (entry.hasPhone) agg.forReportRun.withPhone += 1;
    if (entry.hasDisplayName) agg.forReportRun.withDisplayName += 1;
    if (entry.candidateCount > 1) agg.forReportRun.withMultipleCandidates += 1;
  }
  return agg;
}

function main() {
  const args = parseArgs(process.argv);
  const reportPath = path.resolve(args.reportPath);
  if (!fs.existsSync(reportPath)) {
    console.error(JSON.stringify({ ok: false, error: `Report not found: ${reportPath}` }));
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const runId = args.runIdFilter || report.runId || null;
  const reviewPath = args.reviewQueuePath
    ? path.resolve(args.reviewQueuePath)
    : report.reviewQueuePath && fs.existsSync(report.reviewQueuePath)
      ? report.reviewQueuePath
      : fs.existsSync(DEFAULT_REVIEW_QUEUE)
        ? DEFAULT_REVIEW_QUEUE
        : null;

  const review = readReviewQueue(reviewPath, runId);
  const summary = {
    ok: true,
    reportPath,
    ...summarizeReport(report),
    reviewQueue: summarizeReviewQueue(review, runId),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { summarizeReport, readReviewQueue, inferUnmatchedReason };
