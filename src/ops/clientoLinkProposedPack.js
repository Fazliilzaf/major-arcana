'use strict';

const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function buildClientoLinkProposedPack({ candidateManifest, limit = 3, generatedAt } = {}) {
  const safeLimit = Number(limit);
  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 10) {
    throw new Error('Proposed-pack måste innehålla 1–10 kandidater.');
  }
  if (
    candidateManifest?.readOnly !== true ||
    candidateManifest?.zeroWrites !== true ||
    candidateManifest?.gate?.status !== 'review_candidates_only' ||
    candidateManifest?.gate?.persistentLinkWriteAllowed !== false
  ) {
    throw new Error('Kandidatmanifestet är inte godkänt för read-only proposed-preview.');
  }
  const entries = Array.isArray(candidateManifest?.cohort?.entries)
    ? candidateManifest.cohort.entries
    : [];
  if (entries.length < safeLimit) throw new Error('Kandidatmanifestet innehåller för få poster.');

  const selected = [...entries]
    .sort((a, b) => normalizeText(a?.bookingRef).localeCompare(normalizeText(b?.bookingRef)))
    .slice(0, safeLimit)
    .map((entry) => {
      const bookingRef = normalizeText(entry?.bookingRef);
      const cas = entry?.compareAndSwap;
      if (
        !/^sha256:[a-f0-9]{16}$/.test(bookingRef) ||
        !cas?.left?.tenantId ||
        !cas?.right?.tenantId ||
        !/^[a-f0-9]{64}$/.test(cas?.expectedPairChecksum || '')
      ) {
        throw new Error('Kandidatposten saknar maskerad referens eller komplett CAS.');
      }
      const sourceRefs = [cas.left, cas.right]
        .map((side) => ({
          tenantId: side.tenantId,
          bookingRef,
          sourceSnapshotChecksum: side.sourceSnapshotChecksum,
          coreChecksum: side.coreChecksum,
          notesChecksum: side.notesChecksum,
        }))
        .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
      return {
        proposalRef: `sha256:${sha256({ bookingRef, pair: cas.expectedPairChecksum }).slice(0, 16)}`,
        state: 'proposed_preview',
        bookingRef,
        sourceRefs,
        canonicalPatientId: null,
        canonicalEncounterId: null,
        identityGuessingAllowed: false,
        compareAndSwap: {
          algorithm: cas.algorithm,
          expectedPairChecksum: cas.expectedPairChecksum,
        },
      };
    });

  const inputManifestChecksum = sha256({
    schemaVersion: candidateManifest.schemaVersion || null,
    selectionCriteria: candidateManifest.selectionCriteria || null,
    population: candidateManifest.population || null,
    unlinkedReview: candidateManifest.unlinkedReview || null,
    cohort: candidateManifest.cohort,
  });
  const selectedSetChecksum = sha256(selected);
  return {
    schemaVersion: '1.0.0',
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
    purpose: 'first_masked_cliento_link_proposed_pack_preview',
    readOnly: true,
    zeroWrites: true,
    packSize: selected.length,
    source: {
      manifestCandidateCount: Number(candidateManifest?.cohort?.candidateCount) || entries.length,
      inputManifestChecksum,
      inputManifestChecksumAlgorithm: 'sha256(canonical-candidate-content-v1)',
      reviewSetChecksum: normalizeText(
        candidateManifest?.unlinkedReview?.maskedBookingRefSetChecksum
      ),
    },
    proposals: selected,
    verification: {
      selectedSetChecksum,
      allBookingRefsMasked: selected.every((entry) =>
        /^sha256:[a-f0-9]{16}$/.test(entry.bookingRef)
      ),
      allCasChecksumsPresent: selected.every((entry) =>
        /^[a-f0-9]{64}$/.test(entry.compareAndSwap.expectedPairChecksum)
      ),
      reviewOverlapCount: 0,
      ledgerEventsBefore: 0,
      ledgerEventsAfter: 0,
      bookingWrites: 0,
      patientIdWrites: 0,
      encounterIdWrites: 0,
      activationWrites: 0,
      sourceMutations: 0,
    },
    gates: {
      proposedWriteAllowed: false,
      approvalAllowed: false,
      activationAllowed: false,
      productionWriteAllowed: false,
      journeyRestartAllowed: false,
    },
  };
}

module.exports = { buildClientoLinkProposedPack };
