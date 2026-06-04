'use strict';

/**
 * QA Dashboard — formulärcompletion, signeringar, exportöversikt.
 *
 * Aggregates data from:
 * - Journal store (entries, signed/unsigned, types)
 * - Patient master (total patients, verified, forms submitted)
 * - Encounter store (encounters with/without journal)
 * - Identity verification (verified %)
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function computeQaDashboard({
  journalStore,
  patientMasterStore,
  encounterStore,
  identityStore,
  tenantId,
}) {
  const tid = normalizeText(tenantId);

  const journalStats = journalStore?.getStats?.(tid) || {};
  const patientStats = patientMasterStore?.getStats?.(tid) || {};
  const encounterStats = encounterStore?._state?.encounters?.length || 0;

  const totalEntries = Number(journalStats.totalEntries || 0);
  const signedEntries = Number(journalStats.signedEntries || 0);
  const unsignedEntries = totalEntries - signedEntries;
  const signingRate = totalEntries > 0 ? Math.round((signedEntries / totalEntries) * 100) : 0;

  const totalPatients = Number(patientStats.totalPatients || patientStats.total || 0);
  const patientsWithJournal = Number(journalStats.patientsWithEntries || 0);
  const journalCoverage =
    totalPatients > 0 ? Math.round((patientsWithJournal / totalPatients) * 100) : 0;

  const healthDeclCount = Number(journalStats.byType?.health_declaration || 0);
  const fitnessCertCount = Number(journalStats.byType?.fitness_certificate || 0);
  const consultationPlanCount = Number(journalStats.byType?.consultation_plan || 0);

  const pendingReviews = identityStore?.listPendingReviews?.(tid)?.length || 0;

  const formCompletionMetrics = {
    healthDeclarations: healthDeclCount,
    fitnessCertificates: fitnessCertCount,
    consultationPlans: consultationPlanCount,
    totalForms: healthDeclCount + fitnessCertCount + consultationPlanCount,
  };

  const alerts = [];
  if (signingRate < 80 && totalEntries > 10) {
    alerts.push({ level: 'warning', message: `Signeringsgrad ${signingRate}% — bör vara ≥80%.` });
  }
  if (unsignedEntries > 20) {
    alerts.push({
      level: 'warning',
      message: `${unsignedEntries} osignerade journalposter — granska och signera.`,
    });
  }
  if (journalCoverage < 50 && totalPatients > 20) {
    alerts.push({
      level: 'info',
      message: `Journaltäckning ${journalCoverage}% — många patienter saknar journalposter.`,
    });
  }
  if (pendingReviews > 0) {
    alerts.push({
      level: 'info',
      message: `${pendingReviews} ID-verifieringar väntar på granskning.`,
    });
  }

  return {
    overview: {
      totalPatients,
      totalJournalEntries: totalEntries,
      signedEntries,
      unsignedEntries,
      signingRate,
      journalCoverage,
      totalEncounters: encounterStats,
      pendingIdReviews: pendingReviews,
    },
    formCompletion: formCompletionMetrics,
    signingStatus: {
      rate: signingRate,
      signed: signedEntries,
      unsigned: unsignedEntries,
      target: 100,
    },
    alerts,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { computeQaDashboard };
