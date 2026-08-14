#!/usr/bin/env node
'use strict';

/**
 * Läs-endast förslagsskript för att hitta bättre documentDate åt
 * patient-assets som idag har fallback-daterat sessionsnummer.
 *
 * Skriver ALDRIG till någon store.
 *
 * node scripts/propose-document-dates.js \
 *   --patient-assets-store /var/data/cco-patient-assets.json \
 *   --patients-store /var/data/cco-patient-master.json \
 *   --journal-store /var/data/cco-journal.json \
 *   --tenant hair-tp-clinic \
 *   --output /tmp/proposed-document-dates.json
 */

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
const { buildAssetNamingMetadata } = require('../src/ops/ccoAssetNaming');
const { resolveAliasKeyFn, groupByPatientId } = require('./backfill-asset-display-names');

function parseArgs(argv = process.argv) {
  const args = {
    patientAssetsStorePath: '',
    patientsStorePath: '',
    journalStorePath: '',
    tenant: '',
    output: '/tmp/proposed-document-dates.json',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--patient-assets-store') args.patientAssetsStorePath = argv[++i] || '';
    else if (value === '--patients-store') args.patientsStorePath = argv[++i] || '';
    else if (value === '--journal-store') args.journalStorePath = argv[++i] || '';
    else if (value === '--tenant') args.tenant = argv[++i] || '';
    else if (value === '--output') args.output = argv[++i] || '';
    else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.patientAssetsStorePath) throw new Error('--patient-assets-store krävs.');
  if (!args.patientsStorePath) throw new Error('--patients-store krävs.');
  if (!args.journalStorePath) throw new Error('--journal-store krävs.');
  if (!args.tenant) throw new Error('--tenant krävs.');
  return args;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskId(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function parseIsoDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const ms = Date.parse(text);
  if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  return null;
}

function extractDatesFromText(text) {
  const dates = new Set();
  if (!text) return dates;

  // YYYY-MM-DD
  const isoMatches = text.match(/\b(20\d{2})[-_.](0[1-9]|1[0-2])[-_.](0[1-9]|[12]\d|3[01])\b/g);
  if (isoMatches) {
    for (const m of isoMatches) {
      const cleaned = m.replace(/[-_.]/g, '-');
      const ms = Date.parse(cleaned);
      if (Number.isFinite(ms)) dates.add(new Date(ms).toISOString().slice(0, 10));
    }
  }

  // YYYYMMDD
  const compactMatches = text.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g);
  if (compactMatches) {
    for (const m of compactMatches) {
      const y = m.slice(0, 4);
      const mo = m.slice(4, 6);
      const d = m.slice(6, 8);
      const ms = Date.parse(`${y}-${mo}-${d}`);
      if (Number.isFinite(ms)) dates.add(new Date(ms).toISOString().slice(0, 10));
    }
  }

  return dates;
}

function extractUnixTimestamps(text) {
  const dates = new Set();
  if (!text) return dates;
  // timestamps like 1775754989 (10 siffreor)
  const matches = text.match(/\b(1\d{9})\b/g);
  if (matches) {
    for (const m of matches) {
      const sec = parseInt(m, 10);
      if (sec > 1_600_000_000 && sec < 2_000_000_000) {
        dates.add(new Date(sec * 1000).toISOString().slice(0, 10));
      }
    }
  }
  return dates;
}

function extractSessionMarker(text) {
  const t = normalizeText(text).toLowerCase();
  // prp 3, prp-3, prp_3, session 2, etc.
  const prp = t.match(/(?:prp|session|behandling)\s*[-_]?\s*(\d+)/);
  if (prp) return parseInt(prp[1], 10);
  return null;
}

function extractFolderYear(text) {
  const t = normalizeText(text);
  const m = t.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

async function main() {
  const args = parseArgs();

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.resolve(args.patientAssetsStorePath),
  });
  const patientStore = await createCcoPatientMasterStore({
    filePath: path.resolve(args.patientsStorePath),
  });
  const journalStore = await createCcoJournalStore({
    filePath: path.resolve(args.journalStorePath),
  });

  const patientsPage = await patientStore.listPatients({
    tenantId: args.tenant,
    limit: 50000,
    offset: 0,
  });
  const patients = patientsPage.patients || [];

  const allAssets = assetStore.listItemsForEnrichment();
  const keyFn = resolveAliasKeyFn(allAssets, patients);
  const byPatient = groupByPatientId(allAssets, keyFn);

  const proposals = [];
  let totalAssets = 0;
  let proposedCount = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;

  for (const [patientId, assets] of byPatient.entries()) {
    const fallbackAssets = [];
    for (const asset of assets) {
      const meta = buildAssetNamingMetadata(asset, { tenantId: args.tenant });
      if (meta.sessionNumberIsUnreliable && meta.namingConfidence !== 'low') {
        fallbackAssets.push(asset);
      }
    }
    if (fallbackAssets.length === 0) continue;

    totalAssets += fallbackAssets.length;

    // Hämta journalposter och extrahera datum
    const journalEntries = await journalStore.listEntries({
      tenantId: args.tenant,
      patientId,
    });
    const journalDates = new Set();
    for (const e of journalEntries || []) {
      const text = [e.title, e.fileName, e.originalFileName, e.driveFileName].join(' ');
      for (const d of extractDatesFromText(text)) journalDates.add(d);
      for (const d of extractUnixTimestamps(text)) journalDates.add(d);
      // Använd INTE e.createdAt/e.documentDate — de är ofta importdatum (2026-05-24).
    }

    // Extrahera även år/månads-hints från asset-sökvägar.
    const assetPathDates = new Set();
    for (const asset of fallbackAssets) {
      const text = [asset.originalDrivePath, asset.originalFileName].join(' ');
      for (const d of extractDatesFromText(text)) assetPathDates.add(d);
      for (const d of extractUnixTimestamps(text)) assetPathDates.add(d);
    }
    for (const d of assetPathDates) journalDates.add(d);
    const sortedJournalDates = Array.from(journalDates).sort();

    // Gruppera assets efter sessionsmarkör i sökväg
    const bySession = new Map();
    const withoutSession = [];
    for (const asset of fallbackAssets) {
      const marker =
        extractSessionMarker(asset.originalDrivePath) ||
        extractSessionMarker(asset.originalFileName);
      if (marker != null) {
        if (!bySession.has(marker)) bySession.set(marker, []);
        bySession.get(marker).push(asset);
      } else {
        withoutSession.push(asset);
      }
    }

    const assetProposals = [];

    // Tilldela datum till assets med sessionsmarkör
    const sortedMarkers = Array.from(bySession.keys()).sort((a, b) => a - b);
    for (const marker of sortedMarkers) {
      const group = bySession.get(marker);
      // Försök hitta datum för den här sessionen
      let assignedDate = null;
      let confidence = 'low';

      // Om vi har lika många journaldatum som sessioner, använd index
      if (sortedJournalDates.length >= sortedMarkers.length) {
        const idx = sortedMarkers.indexOf(marker);
        assignedDate = sortedJournalDates[idx] || null;
        confidence = 'high';
      } else if (sortedJournalDates.length > 0) {
        // Inte tillräckligt med datum — använd närmaste/bästa gissning
        assignedDate = sortedJournalDates[Math.min(marker - 1, sortedJournalDates.length - 1)];
        confidence = 'medium';
      }

      for (const asset of group) {
        assetProposals.push({
          assetId: asset.id,
          category: asset.category,
          currentDocumentDate: asset.documentDate || null,
          proposedDocumentDate: assignedDate,
          confidence,
          reason: `session-marker-${marker}`,
          originalFileName: asset.originalFileName,
          originalDrivePath: asset.originalDrivePath,
        });
        proposedCount += assignedDate ? 1 : 0;
        if (assignedDate) {
          if (confidence === 'high') highConfidence += 1;
          else if (confidence === 'medium') mediumConfidence += 1;
        }
      }
    }

    // Assets utan sessionsmarkör
    if (withoutSession.length > 0) {
      let assignedDate = null;
      let confidence = 'low';
      if (sortedJournalDates.length === 1) {
        assignedDate = sortedJournalDates[0];
        confidence = 'medium';
      } else if (sortedJournalDates.length > 1) {
        // Flera datum men okänt vilken asset hör till vilken — använd tidigaste
        assignedDate = sortedJournalDates[0];
        confidence = 'low';
      }

      for (const asset of withoutSession) {
        assetProposals.push({
          assetId: asset.id,
          category: asset.category,
          currentDocumentDate: asset.documentDate || null,
          proposedDocumentDate: assignedDate,
          confidence,
          reason: 'no-session-marker',
          originalFileName: asset.originalFileName,
          originalDrivePath: asset.originalDrivePath,
        });
        proposedCount += assignedDate ? 1 : 0;
        if (assignedDate && confidence === 'medium') mediumConfidence += 1;
      }
    }

    // Räkna lågkonfidenta förslag
    for (const p of assetProposals) {
      if (p.proposedDocumentDate && p.confidence === 'low') lowConfidence += 1;
    }

    proposals.push({
      patientId: maskId(patientId),
      fallbackAssetCount: fallbackAssets.length,
      journalDatesFound: sortedJournalDates,
      sessionMarkersFound: sortedMarkers,
      assetsWithoutSessionMarker: withoutSession.length,
      proposals: assetProposals,
    });
  }

  const report = {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    tenant: args.tenant,
    summary: {
      patientsAffected: proposals.length,
      totalFallbackAssets: totalAssets,
      proposedCount,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      stillNoDate: totalAssets - proposedCount,
    },
    patients: proposals.sort((a, b) => b.fallbackAssetCount - a.fallbackAssetCount),
  };

  fs.writeFileSync(args.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\nFull rapport sparad till: ${args.output}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
