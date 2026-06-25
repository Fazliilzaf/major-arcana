// src/ops/ccoBlockingStore.js
// CCO Blocking Evaluator — ren utvärderare (ingen persistens).
//
// Bedömer "blockers" som hindrar bokning/utskick för en kund: saknat
// behandlingssamtycke, fel brand-flöde (Curatiio-behandling med Hair TP-avtal),
// saknad foto-consent, overifierad ID m.m. Tar emot underliggande stores +
// treatment-requirements (GitHub-trackad config) via konstruktorn och läser
// data lazy vid utvärdering. Inget skrivs till disk.
//
// Severities: 'blocking' (hindrar) | 'warning' (varning) | 'info'.
// Returformer:
//   evaluateCustomer(customerId, opts) ->
//     { customerId, customerName, status, blocking, issues: [{ kind, severity, message, meta }] }
//   evaluateDashboard({ customerIds, opts }) ->
//     { customers: [...evaluateCustomer-resultat], summary: { total, blocked, byKind } }

'use strict';

const SEVERITY = Object.freeze({ BLOCKING: 'blocking', WARNING: 'warning', INFO: 'info' });

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Tolka brand på ett avtal/erbjudande till en jämförbar nyckel.
// Hanterar både CCO-nycklar (hair_tp/curatiio) och display-namn (Hair TP Clinic).
function normalizeBrand(value) {
  const raw = normalizeKey(value);
  if (!raw) return '';
  if (raw.includes('hair') || raw === 'hair_tp' || raw === 'hairtp') return 'hair_tp';
  if (raw.includes('curatiio')) return 'curatiio';
  if (raw === 'shared') return 'shared';
  return raw;
}

function noopStore() {
  return {};
}

function createCcoBlockingStore({
  journalStore = noopStore(),
  offerStore = noopStore(),
  agreementStore = noopStore(),
  photoConsentStore = noopStore(),
  idVerificationStore = noopStore(),
  treatmentRequirements = null,
} = {}) {
  const treatments =
    treatmentRequirements && typeof treatmentRequirements.treatments === 'object'
      ? treatmentRequirements.treatments
      : {};

  function mkIssue(kind, severity, message, meta = {}) {
    return { kind, severity, message, meta };
  }

  async function evaluateCustomer(customerId, opts = {}) {
    const cid = normalizeText(customerId);
    const safeOpts = opts && typeof opts === 'object' ? opts : {};
    const issues = [];

    const plannedTreatment = normalizeKey(safeOpts.plannedTreatment);
    const treatmentCfg = plannedTreatment ? treatments[plannedTreatment] : null;
    const expectedBrand = treatmentCfg ? normalizeBrand(treatmentCfg.brand) : '';

    // Hämta underliggande data lazy (allt tolerant mot saknade stores).
    let agreements = [];
    try {
      agreements = asArray(await agreementStore.listForCustomer?.(cid));
    } catch {
      agreements = [];
    }
    let offers = [];
    try {
      offers = asArray(await offerStore.listForCustomer?.(cid));
    } catch {
      offers = [];
    }
    let grantedPhotos = [];
    try {
      grantedPhotos = asArray(await photoConsentStore.listGranted?.({ customerId: cid }));
    } catch {
      grantedPhotos = [];
    }
    let idStatus = { status: 'none' };
    try {
      idStatus = (await idVerificationStore.getStatus?.(cid)) || { status: 'none' };
    } catch {
      idStatus = { status: 'none' };
    }

    // ── Steg 3.4: wrong_brand_flow ──
    // Ett signerat avtal vars brand inte matchar behandlingens förväntade brand.
    if (treatmentCfg) {
      for (const agr of agreements) {
        const agrBrand = normalizeBrand(agr?.brand);
        const agrState = normalizeKey(agr?.state || agr?.status);
        if (!agrBrand || agrBrand === 'shared') continue;
        const isActiveAgreement =
          agrState === 'signed' || agrState === 'sent' || agrState === 'active';
        if (isActiveAgreement && expectedBrand && agrBrand !== expectedBrand) {
          issues.push(
            mkIssue(
              'wrong_brand_flow',
              SEVERITY.BLOCKING,
              `Avtal med fel brand: kunden har ett ${agrBrand}-avtal men behandlingen ${plannedTreatment} kräver ${expectedBrand}.`,
              {
                treatmentKey: plannedTreatment,
                agreementBrand: agrBrand,
                expectedBrand,
                agreementId: agr?.id || agr?.agreementId || null,
              }
            )
          );
          break;
        }
      }
    }

    // ── Steg 3.3: missing_treatment_consent ──
    // Om behandlingen kräver treatmentConsent och kunden har en kommande bokning
    // men inget registrerat samtycke i journal-/consent-datat.
    if (treatmentCfg) {
      const consentReq = treatmentCfg.requiredDocuments?.treatmentConsent;
      if (consentReq?.required) {
        let journalEntries = [];
        try {
          journalEntries = asArray(
            await journalStore.listEntries?.({ patientId: cid, customerId: cid })
          );
        } catch {
          journalEntries = [];
        }
        const consentRef = normalizeKey(consentReq.templateRef);
        const hasConsent = journalEntries.some((entry) => {
          const kind = normalizeKey(entry?.kind || entry?.type || entry?.documentClass);
          const ref = normalizeKey(entry?.templateRef || entry?.documentRef);
          return (
            kind.includes('consent') ||
            (consentRef && ref === consentRef) ||
            entry?.treatmentConsent === true
          );
        });
        if (!hasConsent) {
          issues.push(
            mkIssue(
              'missing_treatment_consent',
              consentReq.blocking === false ? SEVERITY.WARNING : SEVERITY.BLOCKING,
              `Behandlingssamtycke saknas för ${plannedTreatment}.`,
              {
                treatmentKey: plannedTreatment,
                templateRef: consentReq.templateRef || null,
              }
            )
          );
        }
      }

      // ── ID-verifiering ──
      const idReq = treatmentCfg.requiredDocuments?.idVerification;
      if (idReq?.required && normalizeKey(idStatus?.status) !== 'verified') {
        issues.push(
          mkIssue(
            'missing_id_verification',
            idReq.blocking === false ? SEVERITY.WARNING : SEVERITY.BLOCKING,
            `ID-verifiering saknas för ${plannedTreatment}.`,
            { treatmentKey: plannedTreatment, idState: normalizeKey(idStatus?.status) || 'none' }
          )
        );
      }

      // ── Foto-publicering vid showcase ──
      const publishReq = treatmentCfg.requiredDocuments?.photoConsentPublishing;
      if (
        safeOpts.plannedForShowcase &&
        publishReq &&
        publishReq.onlyIfShowcaseRequested &&
        grantedPhotos.length === 0
      ) {
        issues.push(
          mkIssue(
            'missing_photo_publish_consent',
            SEVERITY.WARNING,
            'Showcase planerad men inget publiceringssamtycke för foton finns.',
            { treatmentKey: plannedTreatment }
          )
        );
      }
    }

    // ── Foton utan internt samtycke ──
    if (safeOpts.hasPhotos && grantedPhotos.length === 0) {
      issues.push(
        mkIssue(
          'photos_without_consent',
          SEVERITY.WARNING,
          'Kunden har foton men inget registrerat foto-samtycke.',
          { photoCount: Number(safeOpts.photoCount) || 0 }
        )
      );
    }

    const blockingCount = issues.filter((i) => i.severity === SEVERITY.BLOCKING).length;
    const status = blockingCount > 0 ? 'blocked' : issues.length > 0 ? 'warning' : 'clear';

    return {
      customerId: cid,
      customerName: normalizeText(safeOpts.customerName) || null,
      plannedTreatment: plannedTreatment || null,
      expectedBrand: expectedBrand || null,
      status,
      blocking: blockingCount > 0,
      issues,
      counts: { offers: offers.length, agreements: agreements.length },
    };
  }

  async function evaluateDashboard({ customerIds = [], opts = {} } = {}) {
    const ids = asArray(customerIds)
      .map((c) => normalizeText(c))
      .filter(Boolean);
    const perCustomerOpts = opts && typeof opts === 'object' ? opts : {};

    const customers = [];
    const byKind = {};
    let blocked = 0;

    for (const cid of ids) {
      const cidOpts =
        perCustomerOpts[cid] && typeof perCustomerOpts[cid] === 'object'
          ? perCustomerOpts[cid]
          : {};

      const result = await evaluateCustomer(cid, cidOpts);
      customers.push(result);
      if (result.blocking) blocked += 1;
      for (const issue of result.issues) {
        byKind[issue.kind] = (byKind[issue.kind] || 0) + 1;
      }
    }

    const topIssues = Object.entries(byKind)
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);

    return {
      customers,
      summary: { total: customers.length, blocked, byKind, topIssues },
    };
  }

  return { evaluateCustomer, evaluateDashboard };
}

module.exports = { createCcoBlockingStore, SEVERITY };
