'use strict';

const SCHEMA_VERSION = '0.2.0';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getOrdinationStatus(record) {
  const status = normalizeText(record?.ordinationReview?.status).toLowerCase();
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function summarizeOrdination(cases) {
  const summary = {
    total: cases.length,
    approved: 0,
    rejected: 0,
    pending: 0,
    latestStatus: 'none',
  };
  for (const record of cases) {
    summary[getOrdinationStatus(record)] += 1;
  }
  if (summary.rejected > 0) summary.latestStatus = 'rejected';
  else if (summary.pending > 0) summary.latestStatus = 'pending';
  else if (summary.approved > 0) summary.latestStatus = 'approved';
  return summary;
}

async function listOrdinationCases({ customerId, stores }) {
  const store = stores?.bookingCaseStore;
  if (!store) return [];
  const tenantId = stores?.tenantId || undefined;

  if (typeof store.listCasesForCustomer === 'function') {
    return asArray(
      await store.listCasesForCustomer({
        tenantId,
        customerId,
        patientId: customerId,
        limit: 20,
      })
    );
  }

  if (typeof store.listCases === 'function') {
    const all = asArray(await store.listCases({ tenantId, limit: 500 }));
    return all
      .filter((record) => record.customerId === customerId || record.patientId === customerId)
      .slice(0, 20);
  }

  return [];
}

// ── ORD-141 · Eftervård på kundkortet (rad 2 + rad 3) ─────────────────────
// Rad 1 (instruktionerna) byggs separat — den blockerar på kanonfil-valet i
// ORD-142, så den markeras som `pending` tills vidare.

// Rad 2 "När är nästa uppföljning?" — ccoAftercareScheduler. Bara followup-jobb
// (4m/6m/8m/12m-kadenserna), inte de omedelbara 1h/1d-touchpointsen. Sorterat
// på dueAt ger nästa uppföljning direkt.
async function listAftercareFollowups({ customerId, stores }) {
  const store = stores?.aftercareScheduler;
  if (!store || typeof store.listJobs !== 'function') return [];
  try {
    const jobs = asArray(await store.listJobs({ customerId, limit: 100 }));
    return jobs
      .filter((job) => job && job.kind === 'followup')
      .sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0));
  } catch {
    return [];
  }
}

// Rad 3 "Har någon hört av sig, och hur gick det?" — ccoAftercareStore. Varje
// ärende bär redan `buildAftercareCaseReadout` (kontakt/utfall/status).
async function listAftercareCases({ customerId, stores }) {
  const store = stores?.aftercareStore;
  if (!store || typeof store.listCasesForCustomer !== 'function') return [];
  try {
    return asArray(await store.listCasesForCustomer({ customerId, limit: 10 }));
  } catch {
    return [];
  }
}

function buildAftercareSection({ followups = [], cases = [] } = {}) {
  const next = followups[0] || null;
  const latestCase = cases[0] || null;
  const readout = latestCase?.readout || null;

  let status = 'none';
  if (readout && (readout.queueBucket === 'critical' || readout.queueBucket === 'due')) {
    status = 'needs_attention';
  } else if (readout || next) {
    status = 'on_track';
  }

  return {
    id: 'eftervard',
    displayName: 'Eftervård',
    kind: 'aftercare',
    status,
    summary: {
      nextFollowupDueAt: next?.dueAt || null,
      followupCount: followups.length,
      aftercareCaseCount: cases.length,
      activeCaseCount: cases.filter(
        (c) => c?.readout && !['closed', 'paused'].includes(c.readout.queueBucket)
      ).length,
    },
    rows: {
      // Rad 1 — blockerad på ORD-142 kanonfil-val. Fylls i nästa steg.
      instructions: { present: false, pending: true },
      // Rad 2 — nästa uppföljning.
      nextFollowup: next
        ? {
            present: true,
            dueAt: next.dueAt || null,
            offsetToken: next.offsetToken || null,
            treatmentKey: next.treatmentKey || null,
            channel: next.channel || null,
            journalDraftEntryId: next.journalDraftEntryId || null,
            status: next.status || null,
          }
        : { present: false },
      // Rad 3 — kontakt & utfall.
      contactOutcome: readout
        ? {
            present: true,
            status: readout.status,
            phase: readout.phase,
            contactStatus: readout.contactStatus,
            outcomeStatus: readout.outcomeStatus,
            nextStep: readout.nextStep,
            scheduledForIso: readout.scheduledForIso,
            isOverdue: readout.isOverdue,
            queueBucket: readout.queueBucket,
          }
        : { present: false },
    },
  };
}

async function buildPatientCardSections({ customerId, stores = {} } = {}) {
  const normalizedCustomerId = normalizeText(customerId);
  const sections = [];
  const warnings = [];
  const ordinationCases = await listOrdinationCases({ customerId: normalizedCustomerId, stores });

  if (ordinationCases.length > 0) {
    const summary = summarizeOrdination(ordinationCases);
    sections.push({
      id: 'ordination',
      displayName: 'Ordination',
      kind: 'clinical_review',
      status: summary.latestStatus,
      summary,
      items: ordinationCases.map((record) => ({
        id: record.id,
        customerId: record.customerId || null,
        patientId: record.patientId || null,
        serviceLabel: record.serviceLabel || record.serviceId || null,
        startsAt: record.startsAt || record.scheduledAt || null,
        caseState: record.state || null,
        ordinationStatus: getOrdinationStatus(record),
        ordinationReview: record.ordinationReview || null,
      })),
    });
  }

  // ── Eftervård (ORD-141) — högljudd, inte tyst tom ─────────────────────
  // Om en källa saknas ska det larma, inte se ut som "inga data". Detta är
  // exakt buggen ORD-141 lagar: saknad koppling såg ut som lyckad körning.
  const aftercareStoreMissing = !stores?.aftercareStore;
  const aftercareSchedulerMissing = !stores?.aftercareScheduler;

  const followups = aftercareSchedulerMissing
    ? []
    : await listAftercareFollowups({ customerId: normalizedCustomerId, stores });
  const aftercareCases = aftercareStoreMissing
    ? []
    : await listAftercareCases({ customerId: normalizedCustomerId, stores });

  if (aftercareStoreMissing) {
    warnings.push('aftercare_store_missing');
    console.warn(
      '[cco-patient-card] eftervårdssektionen: ccoAftercareStore saknas/ej inkopplad — ' +
        'rad 3 "kontakt & utfall" blir tyst tom (ORD-141).'
    );
  }
  if (aftercareSchedulerMissing) {
    warnings.push('aftercare_scheduler_missing');
    console.warn(
      '[cco-patient-card] eftervårdssektionen: ccoAftercareScheduler saknas/ej inkopplad — ' +
        'rad 2 "nästa uppföljning" blir tyst tom (ORD-141).'
    );
  }

  if (followups.length > 0 || aftercareCases.length > 0) {
    sections.push(
      buildAftercareSection({ followups, cases: aftercareCases })
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: sections.length === 0,
    customerId: normalizedCustomerId || null,
    sections,
    warnings,
    note:
      sections.length === 0
        ? 'Patient card section builder har inga matchande live-sektioner ännu.'
        : null,
  };
}

module.exports = { buildPatientCardSections, SCHEMA_VERSION };
