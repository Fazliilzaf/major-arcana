'use strict';

const SCHEMA_VERSION = '0.1.0';

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

async function buildPatientCardSections({ customerId, stores = {} } = {}) {
  const normalizedCustomerId = normalizeText(customerId);
  const sections = [];
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

  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: sections.length === 0,
    customerId: normalizedCustomerId || null,
    sections,
    note:
      sections.length === 0
        ? 'Patient card section builder har inga matchande live-sektioner ännu.'
        : null,
  };
}

module.exports = { buildPatientCardSections, SCHEMA_VERSION };
