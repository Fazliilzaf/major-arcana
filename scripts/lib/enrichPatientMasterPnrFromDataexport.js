'use strict';

const {
  normalizeEmail,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  parseCsv,
  phoneMatchKey,
} = require('../migration/lib/migrationUtils');
const { buildClientoPatientLookup } = require('../../src/ops/clientoCustomerDeltaSync');

const MATCH_CONFIDENCE = Object.freeze({
  clientoId: 1.0,
  email: 0.92,
  phone: 0.88,
});

const DATAEXPORT_COLUMNS = Object.freeze({
  kundId: 'Kund-id',
  email: 'Kund e-post',
  phone: 'Kund (mobilnummer)',
  personnummer: 'Personnummer',
});

function mapDataexportRow(rawRow = {}) {
  return {
    kundId: normalizeText(rawRow[DATAEXPORT_COLUMNS.kundId]),
    email: normalizeEmail(rawRow[DATAEXPORT_COLUMNS.email]),
    phone: normalizePhone(rawRow[DATAEXPORT_COLUMNS.phone]),
    personnummer: normalizeText(rawRow[DATAEXPORT_COLUMNS.personnummer]),
    rowNumber: Number(rawRow.rowNumber) || 0,
  };
}

function parseDataexportCsvText(csvText = '') {
  let text = String(csvText || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseCsv(text)
    .map(mapDataexportRow)
    .filter((row) => row.kundId);
}

function dedupeDataexportByKundId(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    if (!row.kundId) continue;
    if (!grouped.has(row.kundId)) grouped.set(row.kundId, []);
    grouped.get(row.kundId).push(row);
  }

  const deduped = [];
  const stats = {
    uniqueKundIds: grouped.size,
    dedupedWithPnr: 0,
    noValidPnr: 0,
    kundIdPnrConflict: 0,
  };

  for (const [kundId, groupRows] of grouped.entries()) {
    const pnrs = new Set();
    let representative = null;
    for (const row of groupRows) {
      const pnr = normalizePersonnummer(row.personnummer);
      if (!pnr) continue;
      pnrs.add(pnr);
      if (!representative) {
        representative = {
          kundId,
          email: row.email,
          phone: row.phone,
          personnummer: pnr,
        };
      }
    }

    if (pnrs.size > 1) {
      stats.kundIdPnrConflict += 1;
      deduped.push({
        kundId,
        email: representative?.email || groupRows[0]?.email || '',
        phone: representative?.phone || groupRows[0]?.phone || '',
        personnummer: '',
        dedupeStatus: 'kund_id_pnr_conflict',
      });
      continue;
    }

    if (!pnrs.size) {
      stats.noValidPnr += 1;
      deduped.push({
        kundId,
        email: groupRows[0]?.email || '',
        phone: groupRows[0]?.phone || '',
        personnummer: '',
        dedupeStatus: 'no_valid_pnr',
      });
      continue;
    }

    stats.dedupedWithPnr += 1;
    deduped.push({
      ...representative,
      dedupeStatus: 'ok',
    });
  }

  return { deduped, stats };
}

function findPnrEnrichmentCandidates(lookup, record = {}) {
  const matches = new Map();
  const add = (patient, method, confidence) => {
    const patientId = patient?.id || patient?.patientId;
    if (!patientId) return;
    const existing = matches.get(patientId);
    if (!existing || confidence > existing.confidence) {
      matches.set(patientId, { patient, method, confidence, patientId });
    }
  };

  const kundId = normalizeText(record.kundId);
  if (kundId) {
    const linked = lookup.byClientoId.get(kundId);
    if (linked) add(linked, 'clientoId', MATCH_CONFIDENCE.clientoId);
  }

  const email = normalizeEmail(record.email);
  if (email) {
    (lookup.byEmail.get(email) || []).forEach((patient) => {
      add(patient, 'email', MATCH_CONFIDENCE.email);
    });
  }

  const phoneKey = phoneMatchKey(record.phone);
  if (phoneKey) {
    (lookup.byPhone.get(phoneKey) || []).forEach((patient) => {
      add(patient, 'phone', MATCH_CONFIDENCE.phone);
    });
  }

  return [...matches.values()].sort((a, b) => b.confidence - a.confidence);
}

function evaluatePnrEnrichmentRow(lookup, record = {}) {
  if (record.dedupeStatus === 'no_valid_pnr') {
    return { outcome: 'skip_no_valid_pnr', kundId: record.kundId };
  }
  if (record.dedupeStatus === 'kund_id_pnr_conflict') {
    return { outcome: 'skip_kund_id_pnr_conflict', kundId: record.kundId };
  }

  const pnr = normalizePersonnummer(record.personnummer);
  if (!pnr) {
    return { outcome: 'skip_no_valid_pnr', kundId: record.kundId };
  }

  const pnrOwner = lookup.byPersonnummer.get(pnr);
  const candidates = findPnrEnrichmentCandidates(lookup, record);

  if (!candidates.length) {
    return { outcome: 'unmatched', kundId: record.kundId, personnummer: pnr };
  }
  if (candidates.length > 1) {
    return {
      outcome: 'ambiguous',
      kundId: record.kundId,
      personnummer: pnr,
      candidateCount: candidates.length,
    };
  }

  const hit = candidates[0];
  const target = hit.patient;
  const targetId = hit.patientId;
  const existingPnr = normalizePersonnummer(target.personnummer);
  if (existingPnr) {
    return {
      outcome: 'skip_already_has_pnr',
      kundId: record.kundId,
      patientId: targetId,
      personnummer: pnr,
    };
  }

  if (pnrOwner && (pnrOwner.id || pnrOwner.patientId) !== targetId) {
    return {
      outcome: 'skip_pnr_conflict',
      kundId: record.kundId,
      patientId: targetId,
      personnummer: pnr,
    };
  }

  return {
    outcome: 'would_enrich',
    kundId: record.kundId,
    patientId: targetId,
    personnummer: pnr,
    matchMethod: hit.method,
    matchConfidence: hit.confidence,
  };
}

function evaluatePnrEnrichment({ dedupedRows = [], patients = [] } = {}) {
  const lookup = buildClientoPatientLookup(patients);
  const summary = {
    totalDedupedRows: dedupedRows.length,
    skipNoValidPnr: 0,
    skipKundIdPnrConflict: 0,
    skipAlreadyHasPnr: 0,
    skipPnrConflict: 0,
    unmatched: 0,
    ambiguous: 0,
    wouldEnrich: 0,
    byMatchMethod: {
      clientoId: 0,
      email: 0,
      phone: 0,
    },
  };
  const enrichments = [];

  for (const row of dedupedRows) {
    const result = evaluatePnrEnrichmentRow(lookup, row);
    switch (result.outcome) {
      case 'skip_no_valid_pnr':
        summary.skipNoValidPnr += 1;
        break;
      case 'skip_kund_id_pnr_conflict':
        summary.skipKundIdPnrConflict += 1;
        break;
      case 'skip_already_has_pnr':
        summary.skipAlreadyHasPnr += 1;
        break;
      case 'skip_pnr_conflict':
        summary.skipPnrConflict += 1;
        break;
      case 'unmatched':
        summary.unmatched += 1;
        break;
      case 'ambiguous':
        summary.ambiguous += 1;
        break;
      case 'would_enrich':
        summary.wouldEnrich += 1;
        if (result.matchMethod && summary.byMatchMethod[result.matchMethod] !== undefined) {
          summary.byMatchMethod[result.matchMethod] += 1;
        }
        enrichments.push(result);
        break;
      default:
        break;
    }
  }

  return { summary, enrichments, lookup };
}

function buildPatientPnrEnrichmentPatch(existing = {}, enrichment = {}) {
  const now = new Date().toISOString();
  const cliento = {
    ...(existing.cliento && typeof existing.cliento === 'object' ? existing.cliento : {}),
    clientoId: normalizeText(enrichment.kundId),
  };
  const metadata = {
    ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
    pnrSource: 'cliento_dataexport',
    pnrEnrichedAt: now,
  };
  return {
    ...existing,
    personnummer: enrichment.personnummer,
    cliento,
    metadata,
    updatedAt: now,
  };
}

module.exports = {
  DATAEXPORT_COLUMNS,
  MATCH_CONFIDENCE,
  mapDataexportRow,
  parseDataexportCsvText,
  dedupeDataexportByKundId,
  findPnrEnrichmentCandidates,
  evaluatePnrEnrichmentRow,
  evaluatePnrEnrichment,
  buildPatientPnrEnrichmentPatch,
};
