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

// ORD-141 rad 1 — för-/eftervårdsinstruktionerna. En sändpost i ccoSendActionStore
// kopplas till en av dessa via linkDocument({ documentId }) (rad 505 i
// ccoSendActionStore.js). Rad 1 frågar "är instruktionen skickad, och när" — den
// enda ärliga källan är sändloggen, inte en boolean på patienten.
const FORE_EFTERVARD_DOCUMENT_IDS = Object.freeze([
  'forberedelse_tp',
  'eftervard_tp',
  'forberedelse_curatiio',
  'eftervard_curatiio',
]);

// Tre lägen, inte två (ORD-141 §3):
//   sent      → sändpost finns, linkedDocumentId matchar → "skickad <datum>"
//   not_sent  → sändstoret svarade, ingen matchande post  → "inte skickad"
//   unknown   → sändstoret saknas/svarade inte            → "kan inte avgöras" + larm
// Tredje läget får INTE kollapsa till det andra — det är samma fälla som adapt().
async function resolveInstructionSend({ customerId, stores }) {
  const sendStore = stores?.sendActionStore;
  if (!sendStore) return { state: 'unknown', reason: 'send_store_missing' };
  if (typeof sendStore.listSends !== 'function') {
    return { state: 'unknown', reason: 'send_store_unresponsive' };
  }

  let sends;
  try {
    sends = await sendStore.listSends({ customerId, limit: 200 });
  } catch {
    return { state: 'unknown', reason: 'send_store_error' };
  }
  if (!Array.isArray(sends)) {
    return { state: 'unknown', reason: 'send_store_bad_response' };
  }

  const matches = sends
    .filter((s) => s && FORE_EFTERVARD_DOCUMENT_IDS.includes(normalizeText(s.linkedDocumentId)))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const latest = matches[0] || null;

  if (latest) {
    return {
      state: 'sent',
      sentAt: latest.createdAt || null,
      documentId: normalizeText(latest.linkedDocumentId) || null,
      sendId: latest.sendId || null,
      sendStatus: latest.status || null,
    };
  }
  return { state: 'not_sent' };
}

function buildAftercareSection({ followups = [], cases = [], instruction = null } = {}) {
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
      // Rad 1 — "instruktionen är skickad, och när". Tre lägen: sent/not_sent/unknown.
      instructions: instruction
        ? {
            present: true,
            state: instruction.state,
            sentAt: instruction.sentAt || null,
            documentId: instruction.documentId || null,
            sendId: instruction.sendId || null,
            sendStatus: instruction.sendStatus || null,
            reason: instruction.reason || null,
          }
        : { present: false, state: 'unknown', reason: 'not_resolved' },
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

  // Rad 1 — instruktionerna (för-/eftervård). Resolveras oberoende av rad 2/3:
  // sändloggen (ccoSendActionStore) är den enda ärliga källan.
  const instruction = await resolveInstructionSend({ customerId: normalizedCustomerId, stores });

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
  if (instruction.state === 'unknown') {
    const code =
      instruction.reason === 'send_store_missing'
        ? 'send_action_store_missing'
        : 'send_action_store_unresponsive';
    warnings.push(code);
    console.warn(
      '[cco-patient-card] eftervårdssektionen rad 1: ccoSendActionStore ' +
        `${instruction.reason} — "kan inte avgöras", inte "inte skickad" (ORD-141 §3).`
    );
  }

  // Rad 1 är alltid närvarande — den svarar på "instruktionen är skickad, och när"
  // med tre lägen (sent/not_sent/unknown). Sektionen renderas därför alltid, även
  // när rad 2/3 saknar data, så "inte skickad" och "kan inte avgöras" syns ärligt.
  sections.push(buildAftercareSection({ followups, cases: aftercareCases, instruction }));

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

module.exports = {
  buildPatientCardSections,
  resolveInstructionSend,
  FORE_EFTERVARD_DOCUMENT_IDS,
  SCHEMA_VERSION,
};
