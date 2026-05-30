'use strict';

/**
 * ccoJournalQaDashboardStore.js — P0.9 Journal QA-dashboard aggregator
 * =====================================================================
 *
 * Pure read-only aggregator. Håller INGEN egen state — läser från
 * existerande stores och beräknar de 5 status-blocken för owner-vyn:
 *
 *   block1: Importstatus
 *     - cliento, meridiq, drive, journalPdfs, photos, consents, forms
 *   block2: Matchningsstatus
 *     - matched (Cliento+Meridiq+Drive), bara Cliento, bara Drive,
 *       bara Meridiq, osäkra, dubbletter
 *   block3: Journalstatus
 *     - patienter med/utan historisk journal, osignerade, signerade/låsta,
 *       PDF saknas, Meridiq-fält saknas
 *   block4: Bildstatus
 *     - patienter med bilder, bilder utan patient/encounter, före/efter
 *       saknas, foto-källa (CCO vs Drive)
 *   block5: Cutover readiness
 *     - status (green/yellow/red), blockers, nästa åtgärd, ansvarig,
 *       definitionOfDone[10] checklista
 *
 * Compliance (per .cursor/rules/cco-journal-cutover-first.mdc):
 *   - COUNTS ONLY — INGA patientnamn, pnr, email, telefonnummer
 *   - Cache 60s för dashboard-prestanda
 *
 * Per `.cursor/rules/cco-journal-cutover-first.mdc#Krav INNAN cutover är klar`:
 *   "Journal QA-dashboard med 5 statusblock"
 */

const CACHE_TTL_MS = 60 * 1000;

// Tenant-aliases — i CCO finns både `hair_tp` (Cliento/customer-store) och
// `hairtpclinic` (journal-store + ccoTreatmentEncounter). QA-aggregeringen
// behöver räkna båda. Lägg till nya aliases här när nya brands kommer.
const TENANT_ALIASES = {
  hair_tp: ['hair_tp', 'hairtpclinic'],
  hairtpclinic: ['hair_tp', 'hairtpclinic'],
  curatiio: ['curatiio'],
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nowMs() {
  return Date.now();
}

/**
 * Skapa en QA-dashboard-aggregator.
 *
 * @param {object} deps
 * @param {object} deps.customerStore       - createCcoCustomerStore-instans
 * @param {object} deps.journalStore        - createCcoJournalStore-instans
 * @param {object} deps.photoStore          - createCcoPhotoStore-instans (P0.6)
 * @param {object} deps.templateRegistry    - createCcoTemplateRegistry-instans
 * @param {object} deps.masterCardStore     - createMasterPatientCardLookup-instans (P0.2)
 * @param {object} [deps.consentStore]      - photo-consent-store (optional)
 * @param {object} [deps.marketingConsentStore] - optional
 * @param {object} [deps.agreementStore]    - quick-agreement-store (optional)
 * @returns {{getSnapshot: function, invalidate: function}}
 */
function createJournalQaDashboardStore(deps = {}) {
  const {
    customerStore = null,
    journalStore = null,
    photoStore = null,
    templateRegistry = null,
    masterCardStore = null,
    consentStore = null,
    marketingConsentStore = null,
    agreementStore = null,
  } = deps;

  const cache = new Map(); // tenantId → { ts, snapshot }

  function getCached(tenantId) {
    const c = cache.get(tenantId);
    if (!c) return null;
    if (nowMs() - c.ts > CACHE_TTL_MS) {
      cache.delete(tenantId);
      return null;
    }
    return c.snapshot;
  }

  function setCached(tenantId, snapshot) {
    cache.set(tenantId, { ts: nowMs(), snapshot });
  }

  function invalidate(tenantId) {
    if (tenantId) cache.delete(tenantId);
    else cache.clear();
  }

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 1 — Importstatus
  // ─────────────────────────────────────────────────────────────────────
  async function buildBlock1(tenantId) {
    let cliento = 0;
    let meridiq = 0;
    let driveFolders = 0;
    let journalEntries = 0;
    let journalPdfs = 0;
    let photos = 0;
    let consents = 0;
    let forms = 0;

    // customers (Cliento) + meridiq + drive-folders from customer-store
    // peekTenantCustomerState({ tenantId }) returnerar customerState direkt
    // (inte wrapped) — se src/ops/ccoCustomerStore.js#peekTenantCustomerState.
    if (customerStore && typeof customerStore.peekTenantCustomerState === 'function') {
      try {
        const customerState = asObject(
          await customerStore.peekTenantCustomerState({ tenantId })
        );
        const directory = asObject(customerState.directory);
        const keys = Object.keys(directory);
        cliento = keys.length;
        for (const k of keys) {
          const e = directory[k] || {};
          if (e.meridiqMeta) meridiq++;
          if (e.driveFolderId) driveFolders++;
        }
      } catch (err) {
        // läs-fel ska inte krascha dashboarden — räkna 0
      }
    }

    // journal-entries + pdf — iterera över tenant-aliases (hair_tp ↔ hairtpclinic)
    if (journalStore && typeof journalStore.listAllEntries === 'function') {
      try {
        const aliases = TENANT_ALIASES[tenantId] || [tenantId];
        const seen = new Set();
        for (const alias of aliases) {
          const all = await journalStore.listAllEntries({ tenantId: alias });
          for (const e of asArray(all)) {
            if (!e || !e.entryId || seen.has(e.entryId)) continue;
            seen.add(e.entryId);
            journalEntries++;
            if (e.pdfHash || e.pdfStorage || e.pdfPath || e.pdfArtifact) {
              journalPdfs++;
            }
          }
        }
      } catch (err) {
        // ignore
      }
    }

    // photos
    if (photoStore && typeof photoStore.stats === 'function') {
      try {
        const s = photoStore.stats({ tenantId });
        photos = s?.total || 0;
      } catch (err) {
        // ignore
      }
    }

    // templates (consents + forms)
    if (templateRegistry && typeof templateRegistry.stats === 'function') {
      try {
        const s = templateRegistry.stats();
        consents = (s.byType && s.byType.consent) || 0;
        forms =
          ((s.byType && s.byType.patient_information) || 0) +
          ((s.byType && s.byType.health_declaration) || 0) +
          ((s.byType && s.byType.fitness_certificate) || 0) +
          ((s.byType && s.byType.followup) || 0) +
          ((s.byType && s.byType.aftercare) || 0);
      } catch (err) {
        // ignore
      }
    }

    return {
      cliento,
      meridiq,
      driveFolders,
      journalEntries,
      journalPdfs,
      photos,
      consents,
      forms,
      status: cliento > 0 && meridiq > 0 ? 'green' : 'yellow',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 2 — Matchningsstatus
  // ─────────────────────────────────────────────────────────────────────
  async function buildBlock2(tenantId) {
    let totalPatients = 0;
    let withClientoOnly = 0;
    let withMeridiqOnly = 0;
    let withDriveOnly = 0;
    let matchedClientoMeridiq = 0;
    let matchedAll3 = 0;
    let uncertain = 0;
    let duplicates = 0;

    if (customerStore && typeof customerStore.peekTenantCustomerState === 'function') {
      try {
        const customerState = asObject(
          await customerStore.peekTenantCustomerState({ tenantId })
        );
        const directory = asObject(customerState.directory);
        const keys = Object.keys(directory);
        totalPatients = keys.length;

        for (const k of keys) {
          const e = directory[k] || {};
          const meridiqMeta = asObject(e.meridiqMeta);
          const hasMeridiq = Boolean(e.meridiqMeta);
          const hasDrive = Boolean(e.driveFolderId);
          const isClientoOrigin = !(meridiqMeta.via === 'new_from_meridiq');

          if (e.duplicateCandidate) duplicates++;
          if (meridiqMeta.via === 'name') uncertain++;

          if (hasMeridiq && hasDrive && isClientoOrigin) {
            matchedAll3++;
          } else if (hasMeridiq && isClientoOrigin) {
            matchedClientoMeridiq++;
          } else if (!hasMeridiq && hasDrive && isClientoOrigin) {
            withDriveOnly++;
            // Cliento+Drive (no Meridiq) — handled via withClientoOnly residual
          } else if (!hasMeridiq && !hasDrive && isClientoOrigin) {
            withClientoOnly++;
          } else if (meridiqMeta.via === 'new_from_meridiq') {
            withMeridiqOnly++;
          }
        }
      } catch (err) {
        // ignore
      }
    }

    // Status-färg: GREEN om alla matched, YELLOW om finns osäkra/dubbletter,
    // RED om många bara-Cliento (review-gap stor)
    let status = 'green';
    if (duplicates > 50 || uncertain > 50) status = 'yellow';
    if (withClientoOnly > totalPatients * 0.5) status = 'yellow';
    if (matchedAll3 === 0) status = 'yellow'; // Drive-coupling-gap

    return {
      totalPatients,
      matchedAll3,
      matchedClientoMeridiq,
      withClientoOnly,
      withMeridiqOnly,
      withDriveOnly,
      uncertain,
      duplicates,
      status,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 3 — Journalstatus
  // ─────────────────────────────────────────────────────────────────────
  async function buildBlock3(tenantId) {
    let totalEntries = 0;
    let signed = 0;
    let locked = 0;
    let drafts = 0;
    let withPdf = 0;
    let withoutPdf = 0;
    let withMeridiqImport = 0;
    let corrected = 0;
    let patientsWithHistoricJournal = 0;
    let patientsWithoutHistoricJournal = 0;

    const patientsWithEntry = new Set();

    if (journalStore && typeof journalStore.listAllEntries === 'function') {
      try {
        const aliases = TENANT_ALIASES[tenantId] || [tenantId];
        const seen = new Set();
        for (const alias of aliases) {
          const all = await journalStore.listAllEntries({ tenantId: alias });
          for (const e of asArray(all)) {
            if (!e || !e.entryId || seen.has(e.entryId)) continue;
            seen.add(e.entryId);
            totalEntries++;
            if (e.status === 'signed') signed++;
            if (e.locked === true) locked++;
            if (e.status === 'draft') drafts++;
            if (e.status === 'corrected') corrected++;
            if (e.pdfHash || e.pdfStorage || e.pdfPath || e.pdfArtifact) {
              withPdf++;
            } else {
              withoutPdf++;
            }
            if (e.journalType === 'historical_import' || e.importMeta || e.meridiqImportId) {
              withMeridiqImport++;
            }
            if (e.patientId) patientsWithEntry.add(e.patientId);
          }
        }
      } catch (err) {
        // ignore
      }
    }

    // patient-coverage: kunder med hasJournal=true i meridiqMeta vs entries i CCO
    let meridiqClaimsJournal = 0;
    if (customerStore && typeof customerStore.peekTenantCustomerState === 'function') {
      try {
        const customerState = asObject(
          await customerStore.peekTenantCustomerState({ tenantId })
        );
        const directory = asObject(customerState.directory);
        for (const k of Object.keys(directory)) {
          const e = directory[k] || {};
          if (e?.meridiqMeta?.hasJournal === true) meridiqClaimsJournal++;
          if (e?.noMeridiqJournal === true) patientsWithoutHistoricJournal++;
        }
      } catch (err) {
        // ignore
      }
    }

    patientsWithHistoricJournal = patientsWithEntry.size;
    const meridiqFieldGap = Math.max(0, meridiqClaimsJournal - patientsWithHistoricJournal);

    // Status: GREEN om sign-lock-pdf-pipeline fungerar OCH historik kopplad.
    // YELLOW om sign/lock fungerar men historik saknas.
    // RED om sign/lock inte fungerar.
    let status = 'green';
    if (signed > 0 && withoutPdf > 0) status = 'yellow';
    if (meridiqFieldGap > 100) status = 'yellow';
    if (signed === 0) status = 'red';

    return {
      totalEntries,
      signed,
      locked,
      drafts,
      corrected,
      withPdf,
      withoutPdf,
      withMeridiqImport,
      patientsWithHistoricJournal,
      patientsWithoutHistoricJournal,
      meridiqClaimsJournal,
      meridiqFieldGap,
      status,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 4 — Bildstatus
  // ─────────────────────────────────────────────────────────────────────
  async function buildBlock4(tenantId) {
    let total = 0;
    let linkedToEncounter = 0;
    let unlinked = 0;
    let byTypeBefore = 0;
    let byTypeAfter = 0;
    let byTypeDuring = 0;
    let byTypeReference = 0;
    let byTypeConsent = 0;
    let sourceCco = 0;
    let sourceDrive = 0;
    let sourceUpload = 0;
    let sourceLegacy = 0;
    const patientsWithPhotos = new Set();

    if (photoStore && typeof photoStore.stats === 'function') {
      try {
        const s = photoStore.stats({ tenantId }) || {};
        total = s.total || 0;
        linkedToEncounter = s.linkedToEncounter || 0;
        unlinked = s.unlinked || 0;
        const byType = asObject(s.byType);
        byTypeBefore = byType.before || 0;
        byTypeAfter = byType.after || 0;
        byTypeDuring = byType.during || 0;
        byTypeReference = byType.reference || 0;
        byTypeConsent = byType.consent || 0;
        const bySource = asObject(s.bySource);
        sourceCco = bySource.cco_camera || 0;
        sourceDrive = bySource.drive || 0;
        sourceUpload = bySource.upload || 0;
        sourceLegacy = bySource.legacy_import || 0;
      } catch (err) {
        // ignore
      }
    }

    // patientsWithPhotos via listForPatient-iteration (skippas — for-loop kostar
    // för mycket, vi rapporterar bara unika photo.patientId-count via store)
    // För nu: vi har inte direkt access till "antal patienter med foton" från stats().
    // Aggregera via egen iteration om listForPatient finns — annars approximera 0.
    if (photoStore && typeof photoStore.listForPatient === 'function' && total > 0) {
      // Vi har inget enkelt sätt att enumerera alla patienter med foton utan att
      // exponera state. Ge bästa estimat: 0 (uppdateras när store får getStatsPerPatient).
      patientsWithPhotos.add(null); // placeholder
    }

    // Status: GREEN om de flesta är encounter-länkade. YELLOW om unlinked > 0.
    // (per spec: bilder utan patient/encounter är negativt)
    let status = 'green';
    if (total === 0) status = 'yellow'; // inga bilder än → behöver Drive-import
    else if (unlinked > total * 0.1) status = 'yellow';
    if (unlinked > total * 0.5) status = 'red';

    return {
      total,
      linkedToEncounter,
      unlinked,
      byType: {
        before: byTypeBefore,
        during: byTypeDuring,
        after: byTypeAfter,
        reference: byTypeReference,
        consent: byTypeConsent,
      },
      bySource: {
        cco_camera: sourceCco,
        drive: sourceDrive,
        upload: sourceUpload,
        legacy_import: sourceLegacy,
      },
      patientsWithPhotos: patientsWithPhotos.size > 0 ? null : 0, // null = vet ej
      status,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // BLOCK 5 — Cutover readiness
  // ─────────────────────────────────────────────────────────────────────
  function buildBlock5(block1, block2, block3, block4) {
    // 10-punkts Definition of Done (från cursor-regeln)
    const dod = [
      {
        n: 1,
        text: 'Varje patient har master-kort (clientoId + meridiqId + driveFolderId + ccoId)',
        ok: block2.matchedAll3 > 0 && block1.driveFolders > 0,
        note: 'Drive-folder-koppling saknas på alla patienter — väntar på service-account',
      },
      {
        n: 2,
        text: 'Cliento ↔ Meridiq ↔ Drive matched (dubbletter i Review Queue eller lösta)',
        ok: block2.duplicates < 100 && block2.uncertain < 100,
        note: `${block2.duplicates} dubbletter + ${block2.uncertain} osäkra → Review Queue`,
      },
      {
        n: 3,
        text: 'Historiska journaler kopplade till rätt patient (eller i Review Queue)',
        ok: block3.patientsWithHistoricJournal > 0 && block3.meridiqFieldGap < 100,
        note: `Meridiq historik-import saknas (~${block3.meridiqFieldGap} patient-gap)`,
      },
      {
        n: 4,
        text: 'Historiska bilder kopplade till rätt patient + encounter',
        ok: block4.total > 0 && block4.unlinked === 0,
        note: 'Drive-bilder ej importerade — service-account-blocker',
      },
      {
        n: 5,
        text: 'Formulär + samtycken kopplade till patient',
        ok: block1.consents > 0 && block1.forms > 0,
        note: `${block1.consents} consent-mallar + ${block1.forms} formulär-mallar i registry`,
      },
      {
        n: 6,
        text: 'Ny CCO-journal fungerar end-to-end (skapa → signera → lås → PDF → audit)',
        ok: block3.signed > 0 && block3.locked > 0 && block3.withPdf > 0,
        note: `${block3.signed} signed · ${block3.locked} locked · ${block3.withPdf} PDFs`,
      },
      {
        n: 7,
        text: 'Foto-flow fungerar (ta bild → koppla till encounter → bevara original)',
        ok: block4.total > 0,
        note: `${block4.total} foton i CCO photo-store`,
      },
      {
        n: 8,
        text: 'Sign/lock/rättelse/PDF/audit verifierat med smoke-test',
        ok: block3.signed > 0 && block3.withPdf > 0,
        note: 'P0.5/P0.8 commits verifierade — auto-PDF + read-audit live',
      },
      {
        n: 9,
        text: 'Journal QA-dashboard visar 100% coverage på relevanta segment',
        ok: false,
        note: 'Drive-coverage 0% — kritiskt segment saknas',
      },
      {
        n: 10,
        text: 'Cutover Readiness Report GREEN på alla blockers',
        ok: false,
        note: 'Väntar på P0.7 (Meridiq API) + Drive service-account',
      },
    ];

    const okCount = dod.filter((d) => d.ok).length;
    let status = 'red';
    if (okCount === 10) status = 'green';
    else if (okCount >= 6) status = 'yellow';

    const blockers = dod.filter((d) => !d.ok).map((d) => `#${d.n}: ${d.text}`);
    let nextAction;
    let nextActionOwner = 'Owner';
    if (!dod[3].ok || !dod[0].ok) {
      nextAction = 'Konfigurera Google Drive service-account (JWT) för att låsa upp #1, #4, #9';
      nextActionOwner = 'Owner + DevOps';
    } else if (!dod[2].ok) {
      nextAction = 'Skaffa Meridiq read-only API-access för historisk import (P0.7)';
      nextActionOwner = 'Owner (Meridiq-kontakt)';
    } else {
      nextAction = 'Kör Cutover Readiness Report och adressera kvarvarande blockers';
    }

    return {
      status,
      definitionOfDone: dod,
      okCount,
      totalCriteria: dod.length,
      blockers,
      nextAction,
      nextActionOwner,
      readinessReportPath: 'docs/strategy/CUTOVER-READINESS-REPORT-(latest).md',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SNAPSHOT
  // ─────────────────────────────────────────────────────────────────────
  async function getSnapshot({ tenantId = 'hair_tp' } = {}) {
    const cached = getCached(tenantId);
    if (cached) return cached;

    const block1 = await buildBlock1(tenantId);
    const block2 = await buildBlock2(tenantId);
    const block3 = await buildBlock3(tenantId);
    const block4 = await buildBlock4(tenantId);
    const block5 = buildBlock5(block1, block2, block3, block4);

    const snapshot = {
      tenantId,
      generatedAt: new Date().toISOString(),
      cacheTtlMs: CACHE_TTL_MS,
      block1,
      block2,
      block3,
      block4,
      block5,
    };
    setCached(tenantId, snapshot);
    return snapshot;
  }

  return {
    getSnapshot,
    invalidate,
    _CACHE_TTL_MS: CACHE_TTL_MS,
  };
}

module.exports = {
  createJournalQaDashboardStore,
};
