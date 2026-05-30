'use strict';

/* ─── ccoReadyForTreatmentBuilder — Sprint 14B ───────────────────────────
 *
 * Aggregator (read-only): per kund visar vad som SAKNAS innan behandling
 * kan genomföras. Mergar från befintliga stores — INGEN egen state-fil.
 *
 * Owner-mandat:
 *  - INGEN extern AI på journal
 *  - INGEN auto-blockning (bara FLAGGA — staff bestämmer)
 *  - Inga Drive-länkar
 *  - PII-mask i audit
 *
 * Checklist per kund:
 *  1. health_declaration (hälsodeklaration) — via formStore eller journal
 *  2. fitness_certificate (friskförsäkran) — via formStore
 *  3. consent_signed (samtycke) — via consentStore
 *  4. agreement_signed (avtal) — via agreementStore (Sprint B)
 *  5. id_verified — via identityStore eller customer.idVerified-flagga
 *  6. payment_received — via payment/deposit-store om finns
 *  7. journal_entry — via journalStore (minst en signed entry)
 *  8. aftercare_scheduled — via aftercareStore (Sprint 5.x)
 *
 * Output:
 *  {
 *    customerId, tenantId, ready: bool, missing: [...check-id],
 *    items: [{id, label, status: 'ok' | 'missing' | 'unknown', ts?}]
 *  }
 * ────────────────────────────────────────────────────────────────────── */

const CHECKS = [
  { id: 'health_declaration', label: 'Hälsodeklaration', weight: 1 },
  { id: 'fitness_certificate', label: 'Friskförsäkran', weight: 1 },
  { id: 'consent_signed', label: 'Samtycke', weight: 1 },
  { id: 'agreement_signed', label: 'Avtal', weight: 1 },
  { id: 'id_verified', label: 'ID verifierat', weight: 1 },
  { id: 'payment_received', label: 'Depå/betalning', weight: 0.5 },
  { id: 'journal_entry', label: 'Journalanteckning', weight: 0.5 },
  { id: 'aftercare_scheduled', label: 'Eftervård planerad', weight: 0.5 },
];

function nowIso() {
  return new Date().toISOString();
}

function buildReadyForTreatment({
  customerId,
  tenantId = 'hair_tp',
  customer = null, // ccoCustomerStore.getById(customerId)
  journalStore = null,
  consentStore = null,
  agreementStore = null,
  formStore = null,
  identityStore = null,
  paymentStore = null,
  aftercareStore = null,
} = {}) {
  if (!customerId) {
    return { ok: false, error: 'customerId krävs' };
  }

  const items = [];

  // 1. health_declaration
  let hdStatus = 'unknown';
  let hdTs = null;
  try {
    if (formStore?.listSubmissions) {
      const subs = formStore.listSubmissions({ patientId: customerId, tenantId }) || [];
      const hd = subs.find((s) => /health.*decl|hälsodekl/i.test(s.formKind || s.type || ''));
      if (hd) {
        hdStatus = 'ok';
        hdTs = hd.submittedAt || hd.createdAt;
      } else hdStatus = 'missing';
    } else if (journalStore?.listForPatient || journalStore?.listEntries) {
      const lister = journalStore.listForPatient || journalStore.listEntries;
      const entries = lister({ patientId: customerId, tenantId, limit: 50 }) || [];
      const hd = entries.find((e) => /health.*decl|hälsodekl/i.test(e.journalType || e.type || ''));
      if (hd) {
        hdStatus = 'ok';
        hdTs = hd.signedAt || hd.createdAt;
      } else hdStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({ id: 'health_declaration', label: 'Hälsodeklaration', status: hdStatus, ts: hdTs });

  // 2. fitness_certificate
  let ffStatus = 'unknown';
  let ffTs = null;
  try {
    if (formStore?.listSubmissions) {
      const subs = formStore.listSubmissions({ patientId: customerId, tenantId }) || [];
      const ff = subs.find((s) =>
        /fitness|friskförsäkran|friskforsakran/i.test(s.formKind || s.type || '')
      );
      if (ff) {
        ffStatus = 'ok';
        ffTs = ff.submittedAt || ff.createdAt;
      } else ffStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({ id: 'fitness_certificate', label: 'Friskförsäkran', status: ffStatus, ts: ffTs });

  // 3. consent_signed
  let consentStatus = 'unknown';
  let consentTs = null;
  try {
    if (consentStore?.listForCustomer) {
      const list = consentStore.listForCustomer(customerId, { tenantId, limit: 20 }) || [];
      const signed = list.find(
        (c) => c.signedAt && (c.status === 'signed' || c.status === 'active')
      );
      if (signed) {
        consentStatus = 'ok';
        consentTs = signed.signedAt;
      } else consentStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({ id: 'consent_signed', label: 'Samtycke', status: consentStatus, ts: consentTs });

  // 4. agreement_signed (Sprint B)
  let agreementStatus = 'unknown';
  let agreementTs = null;
  try {
    if (agreementStore?.listForCustomer) {
      const list = agreementStore.listForCustomer(customerId, { tenantId, limit: 20 }) || [];
      const signed = list.find((a) => a.signedAt);
      if (signed) {
        agreementStatus = 'ok';
        agreementTs = signed.signedAt;
      } else agreementStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({ id: 'agreement_signed', label: 'Avtal', status: agreementStatus, ts: agreementTs });

  // 5. id_verified
  let idStatus = 'unknown';
  let idTs = null;
  try {
    if (identityStore?.getStatus) {
      const status = identityStore.getStatus({ customerId, tenantId });
      if (status?.verified) {
        idStatus = 'ok';
        idTs = status.verifiedAt || null;
      } else idStatus = 'missing';
    } else if (customer?.idVerified || customer?.identity?.verified) {
      idStatus = 'ok';
      idTs = customer.identityVerifiedAt || null;
    } else if (customer) {
      idStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({ id: 'id_verified', label: 'ID verifierat', status: idStatus, ts: idTs });

  // 6. payment_received (optional — kan saknas helt)
  let paymentStatus = 'unknown';
  let paymentTs = null;
  try {
    if (paymentStore?.listForCustomer) {
      const list = paymentStore.listForCustomer(customerId, { tenantId, limit: 20 }) || [];
      const paid = list.find((p) => p.status === 'paid' || p.status === 'deposit_received');
      if (paid) {
        paymentStatus = 'ok';
        paymentTs = paid.paidAt || paid.receivedAt;
      } else paymentStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({
    id: 'payment_received',
    label: 'Depå/betalning',
    status: paymentStatus,
    ts: paymentTs,
  });

  // 7. journal_entry — minst en signerad entry
  let journalStatus = 'unknown';
  let journalTs = null;
  try {
    if (journalStore?.listForPatient || journalStore?.listEntries) {
      const lister = journalStore.listForPatient || journalStore.listEntries;
      const entries = lister({ patientId: customerId, tenantId, limit: 50 }) || [];
      const signed = entries.find((e) => e.signedAt);
      if (signed) {
        journalStatus = 'ok';
        journalTs = signed.signedAt;
      } else if (entries.length > 0) journalStatus = 'partial';
      else journalStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({
    id: 'journal_entry',
    label: 'Journalanteckning',
    status: journalStatus,
    ts: journalTs,
  });

  // 8. aftercare_scheduled
  let aftercareStatus = 'unknown';
  let aftercareTs = null;
  try {
    if (aftercareStore?.listForCustomer) {
      const list = aftercareStore.listForCustomer(customerId, { tenantId, limit: 20 }) || [];
      if (list.length > 0) {
        aftercareStatus = 'ok';
        aftercareTs = list[0].scheduledAt;
      } else aftercareStatus = 'missing';
    }
  } catch {
    /* ignore */
  }
  items.push({
    id: 'aftercare_scheduled',
    label: 'Eftervård planerad',
    status: aftercareStatus,
    ts: aftercareTs,
  });

  // Aggregate
  const missing = items.filter((i) => i.status === 'missing').map((i) => i.id);
  const unknownCount = items.filter((i) => i.status === 'unknown').length;
  const okCount = items.filter((i) => i.status === 'ok').length;

  // Vikt-baserad readiness-score (0-100)
  let weightSum = 0;
  let weightOk = 0;
  for (const c of CHECKS) {
    const it = items.find((i) => i.id === c.id);
    weightSum += c.weight;
    if (it?.status === 'ok') weightOk += c.weight;
  }
  const readinessScore = weightSum > 0 ? Math.round((weightOk / weightSum) * 100) : 0;
  const ready = missing.length === 0 && unknownCount === 0;

  return {
    customerId,
    tenantId,
    ready,
    readinessScore,
    okCount,
    missingCount: missing.length,
    unknownCount,
    missing,
    items,
    evaluatedAt: nowIso(),
  };
}

/**
 * Build a queue across all customers — för operator-dashboard.
 * Tar customerList från caller (eller customerStore.listAll).
 */
function buildReadyForTreatmentQueue({ customers = [], tenantId = 'hair_tp', ...storeDeps } = {}) {
  const results = [];
  for (const c of customers.slice(0, 500)) {
    try {
      const r = buildReadyForTreatment({
        customerId: c.customerId || c.id,
        tenantId,
        customer: c,
        ...storeDeps,
      });
      if (r.ok === false) continue;
      results.push({
        customerId: r.customerId,
        customerName: c.displayName || c.name || null,
        ready: r.ready,
        readinessScore: r.readinessScore,
        missingCount: r.missingCount,
        missing: r.missing,
      });
    } catch {
      /* skip individual failure */
    }
  }
  // Sort: lägsta readinessScore först (mest blockerade högst)
  results.sort((a, b) => a.readinessScore - b.readinessScore);
  // Stats
  const stats = {
    total: results.length,
    ready: results.filter((r) => r.ready).length,
    blocked: results.filter((r) => !r.ready).length,
    avgScore:
      results.length > 0
        ? Math.round(results.reduce((s, r) => s + r.readinessScore, 0) / results.length)
        : 0,
  };
  return { stats, items: results, evaluatedAt: nowIso() };
}

module.exports = { buildReadyForTreatment, buildReadyForTreatmentQueue, CHECKS };
