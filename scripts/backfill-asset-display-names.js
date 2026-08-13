#!/usr/bin/env node
'use strict';

/**
 * Backfill befintliga patient-assets med läsbara displayName.
 *
 *   node scripts/backfill-asset-display-names.js --dry-run \
 *     --patients-store /var/data/cco-patient-master.json --tenant hair-tp-clinic
 *   node scripts/backfill-asset-display-names.js --commit --limit 1000 \
 *     --patients-store /var/data/cco-patient-master.json --tenant hair-tp-clinic
 *   node scripts/backfill-asset-display-names.js --commit --patient-ids P1,P2 \
 *     --patients-store /var/data/cco-patient-master.json --tenant hair-tp-clinic
 *
 * --patients-store + --tenant krävs (fixar CCO-STATUS.md punkt 1, 519
 * verifierade kors-patient-alias-kollisioner, PR #1364-#1371) — utan dem
 * grupperas syskon-assets på rå, ofta icke-unik asset.patientId, och olika
 * patienters dokument kan blandas ihop till ETT sessionNumber. Sätt
 * --i-understand-the-collision-risk-skip-alias-resolution för att medvetet
 * köra utan skyddet (t.ex. mot en lokal fixture utan patient-master-data).
 *
 * Skriver ALDRIG lågkonfidenta gissningar (namingStatus: needs_review_for_naming,
 * härlett av namingConfidence === 'low' ELLER ett sessionNumber som byggts på
 * ett saknat documentDate — importedAt-fallback, samma bugg, se
 * encounterNameResolver.js). De hamnar i stats.skippedNeedsReview och
 * needsReviewSamples i rapporten, oskrivna, för manuell granskning.
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const { buildAssetNamingMetadata } = require('../src/ops/ccoAssetNaming');
const { resolveCanonicalPatientsForAssets } = require('../src/ops/ccoPatientAssetIdentity');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');

const ACTOR = {
  role: 'system',
  userId: 'backfill-asset-display-names',
  tenantId: 'hair_tp',
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: true,
    commit: false,
    limit: 0,
    offset: 0,
    batchSize: 100,
    patientIds: null,
    categories: null,
    force: false,
    patientsStorePath: '',
    tenant: '',
    skipAliasResolution: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--force') args.force = true;
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--offset') args.offset = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--batch-size') args.batchSize = Math.max(1, Number(argv[++i]) || 100);
    else if (flag === '--patient-ids')
      args.patientIds = new Set(
        String(argv[++i])
          .split(',')
          .filter(Boolean)
          .map((s) => s.trim())
      );
    else if (flag === '--categories')
      args.categories = new Set(
        String(argv[++i])
          .split(',')
          .filter(Boolean)
          .map((s) => s.trim())
      );
    else if (flag === '--patients-store') args.patientsStorePath = String(argv[++i] || '').trim();
    else if (flag === '--tenant') args.tenant = String(argv[++i] || '').trim();
    else if (flag === '--i-understand-the-collision-risk-skip-alias-resolution') {
      args.skipAliasResolution = true;
    }
  }
  if (args.commit) args.dryRun = false;
  if (!args.commit && !args.dryRun) args.dryRun = true;
  // CCO-STATUS.md punkt 1 (bekräftad 2026-08-13, PR #1364-#1371): utan
  // alias-upplösning grupperas syskon-assets på RÅ, ofta icke-unik
  // asset.patientId — 519 verifierade kollisionsgrupper i prod där
  // OLIKA patienters dokument blandas ihop och sessionNumber räknas
  // över flera personers behandlingar. Kräver därför --patients-store +
  // --tenant explicit (inget tyst default) om inte flaggan nedan
  // medvetet slår av skyddet.
  if (!args.skipAliasResolution && (!args.patientsStorePath || !args.tenant)) {
    throw new Error(
      '--patients-store <path> och --tenant <id> krävs (fixar 519 verifierade ' +
        'kors-patient-kollisioner, se CCO-STATUS.md punkt 1). Sätt ' +
        '--i-understand-the-collision-risk-skip-alias-resolution för att medvetet ' +
        'köra utan skyddet.'
    );
  }
  return args;
}

/**
 * Heuristic: does this displayName look like a raw filename rather than a
 * human-readable title? Keep the check conservative — we do not want to flag
 * already-nice Swedish titles like "Hälsodeklaration".
 */
function looksTechnical(displayName, originalFileName) {
  const d = normalizeText(displayName);
  const o = normalizeText(originalFileName);
  if (!d) return true;
  if (d === o) return true;
  // Already built by buildAssetNamingMetadata (uses " · " separator).
  if (/ · /.test(d)) return false;
  if (/\?\?/.test(d)) return true; // mojibake
  if (/^journal[-_]/i.test(d)) return true;
  if (/^IMG[_-]/i.test(d)) return true;
  if (/^DSC/i.test(d)) return true;
  if (/(\.pdf|\.jpe?g|\.png|\.heic|\.webp|\.gif)$/i.test(d)) return true;
  return false;
}

function needsBackfill(asset, { force = false }) {
  if (asset.deletedAt) return false;
  if (asset.namingStatus === 'manual' && !force) return false;
  if (force) return true;
  const displayName = normalizeText(asset.displayName);
  if (!displayName) return true;
  if (looksTechnical(displayName, asset.originalFileName)) return true;
  if (asset.namingStatus !== 'resolved' && asset.namingStatus !== 'manual') return true;
  return false;
}

/**
 * Fyra foton, samma patient, samma dag, kategori photo_during — fick
 * "FUE Operation 23/25/26/30" i en dry-run 2026-08-07. sessionNumber ska
 * räkna DISTINKTA operationstillfällen, inte foton.
 *
 * ROTORSAK BEKRÄFTAD 2026-08-13 (PR #1364-#1371, läs-endast mot prod):
 * TVÅ oberoende buggar, båda i groupByPatientId ovan.
 *   1. Kors-patient alias-kollision (519 grupper) — asset.patientId är
 *      ofta ett alias, inte en kanonisk patient-ID; olika patienters
 *      dokument blandas ihop i EN syskon-grupp. Fixad genom
 *      resolveAliasKeyFn (kräver --patients-store + --tenant).
 *   2. Intra-patient datumfallback (fallbackShare upp till 1.0,
 *      sessionNumber upp till 16) — countTreatmentSession
 *      (encounterNameResolver.js) sorterar på documentDate || importedAt;
 *      saknas documentDate blir sessionNumret en import-ordning, inte en
 *      behandlingsordning. Fixad genom usedFallbackDate ->
 *      namingStatus: needs_review_for_naming (nedan).
 *
 * namingStatus härleds av namingConfidence === 'low' ELLER
 * usedFallbackDate (ccoAssetNaming/index.js). En osäker gissning som
 * "Operation 30" ska aldrig skriva över ett existerande displayName utan
 * att en människa sett den först.
 */
function isAutoSafeNamingPatch(namingPatch) {
  return namingPatch?.namingStatus !== 'needs_review_for_naming';
}

/**
 * @param {object[]} assets
 * @param {(asset: object) => string} [keyFn] — patientId-nyckel att
 *   gruppera på. Default: rå asset.patientId (den historiskt buggiga
 *   grupperingen). Skickas en resolverad kanonisk-ID-uppslagning in
 *   (se resolveAliasKeyFn) fixas 519 verifierade kors-patient-
 *   kollisioner (CCO-STATUS.md punkt 1) — grupperingsnyckeln ändras,
 *   asset.patientId-fältet på den lagrade posten rörs aldrig.
 */
function groupByPatientId(assets, keyFn = (asset) => asset.patientId) {
  const map = new Map();
  for (const asset of assets) {
    const pid = normalizeText(keyFn(asset));
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(asset);
  }
  return map;
}

// ORD-85 (resolveCanonicalPatientsForAssets, ccoPatientAssetIdentity.js)
// ordagrant — samma funktion #1368 verifierade mot prod (91 222 av
// 126 642 assets bar ett alias-ID). Bygger en groupByPatientId-keyFn som
// grupperar på kanonisk patient när den kan härledas, annars faller
// tillbaka till rå asset.patientId (aldrig sämre än tidigare beteende).
function resolveAliasKeyFn(assets, patients) {
  const resolutions = resolveCanonicalPatientsForAssets({ patients, assets });
  const canonicalByAssetId = new Map();
  for (const resolution of resolutions) {
    if (resolution.canonicalPatientId) {
      canonicalByAssetId.set(resolution.assetId, resolution.canonicalPatientId);
    }
  }
  return (asset) => canonicalByAssetId.get(asset.id) || asset.patientId;
}

async function backfillAssetDisplayNames({ assetStore, patients = null, args }) {
  const all = assetStore.listItemsForEnrichment();
  const keyFn = patients ? resolveAliasKeyFn(all, patients) : undefined;
  const byPatient = groupByPatientId(all, keyFn);

  const stats = {
    scanned: all.length,
    patients: byPatient.size,
    candidates: 0,
    skippedDeleted: 0,
    skippedManual: 0,
    skippedAlreadyNamed: 0,
    skippedNoPatientId: 0,
    skippedPatientFilter: 0,
    skippedCategoryFilter: 0,
    patched: 0,
    skippedNeedsReview: 0,
    failed: 0,
    dryRun: args.dryRun,
    limit: args.limit,
    offset: args.offset,
    batchSize: args.batchSize,
  };
  const errors = [];
  const samples = [];
  const needsReviewSamples = [];

  const candidates = [];
  for (const [patientId, patientAssets] of byPatient) {
    if (args.patientIds && !args.patientIds.has(patientId)) {
      stats.skippedPatientFilter += patientAssets.length;
      continue;
    }
    for (const asset of patientAssets) {
      if (!normalizeText(asset.patientId)) {
        stats.skippedNoPatientId += 1;
        continue;
      }
      if (args.categories && !args.categories.has(asset.category)) {
        stats.skippedCategoryFilter += 1;
        continue;
      }
      if (!needsBackfill(asset, { force: args.force })) {
        if (asset.deletedAt) stats.skippedDeleted += 1;
        else if (asset.namingStatus === 'manual') stats.skippedManual += 1;
        else stats.skippedAlreadyNamed += 1;
        continue;
      }
      candidates.push({ asset, patientAssets });
    }
  }

  stats.candidates = candidates.length;
  const start = Math.max(0, args.offset);
  const end = args.limit > 0 ? start + args.limit : candidates.length;
  const batch = candidates.slice(start, end);

  if (args.dryRun) {
    for (const { asset, patientAssets } of batch) {
      try {
        const namingPatch = buildAssetNamingMetadata(asset, {
          siblingAssets: patientAssets,
        });
        const row = {
          assetId: asset.id,
          patientId: asset.patientId,
          category: asset.category,
          originalFileName: asset.originalFileName,
          oldDisplayName: asset.displayName,
          newDisplayName: namingPatch.displayName,
          namingStatus: namingPatch.namingStatus,
          namingConfidence: namingPatch.namingConfidence,
        };
        // Dry-run ska förhandsvisa vad --commit FAKTISKT gör, inklusive vad
        // den håller tillbaka — annars ser en granskning ren ut trots att
        // skarp körning senare skulle ha skrivit lika mycket lågkonfident
        // gissningsarbete som den gör här.
        if (isAutoSafeNamingPatch(namingPatch)) {
          stats.patched += 1;
          if (samples.length < 10) samples.push(row);
        } else {
          stats.skippedNeedsReview += 1;
          if (needsReviewSamples.length < 10) needsReviewSamples.push(row);
        }
      } catch (error) {
        stats.failed += 1;
        errors.push({ assetId: asset.id, reason: error.message });
      }
    }
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      stats,
      samples,
      needsReviewSamples,
      errors,
    };
  }

  assetStore.beginBatch();
  let inBatch = 0;
  try {
    for (let i = 0; i < batch.length; i += 1) {
      const { asset, patientAssets } = batch[i];
      try {
        const namingPatch = buildAssetNamingMetadata(asset, {
          siblingAssets: patientAssets,
        });
        const row = {
          assetId: asset.id,
          patientId: asset.patientId,
          category: asset.category,
          originalFileName: asset.originalFileName,
          oldDisplayName: asset.displayName,
          newDisplayName: namingPatch.displayName,
          namingStatus: namingPatch.namingStatus,
          namingConfidence: namingPatch.namingConfidence,
        };
        // Skriv ALDRIG en lågkonfident gissning över ett existerande
        // displayName utan mänsklig granskning — se isAutoSafeNamingPatch.
        if (isAutoSafeNamingPatch(namingPatch)) {
          await assetStore.patchAssetNamingMetadata(asset.id, namingPatch, {
            actor: ACTOR,
            reason: 'backfill_asset_display_name',
          });
          stats.patched += 1;
          if (samples.length < 10) samples.push(row);
        } else {
          stats.skippedNeedsReview += 1;
          if (needsReviewSamples.length < 10) needsReviewSamples.push(row);
        }
      } catch (error) {
        stats.failed += 1;
        errors.push({ assetId: asset.id, reason: error.message });
      }
      inBatch += 1;
      if (inBatch >= args.batchSize) {
        await assetStore.checkpointBatch();
        inBatch = 0;
      }
    }
    await assetStore.flushBatch();
  } catch (error) {
    try {
      await assetStore.flushBatch();
    } catch {
      // best effort
    }
    throw error;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stats,
    samples,
    needsReviewSamples,
    errors,
  };
}

async function main() {
  const args = parseArgs();
  const assetsPath =
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH ||
    process.env.CCO_PATIENT_ASSETS_PATH ||
    path.join(DATA, 'cco-patient-assets.json');
  const auditPath = process.env.ARCANA_CCO_AUDIT_PATH || path.join(DATA, 'cco-audit.jsonl');

  const auditLog = createCcoAuditLog({ filePath: auditPath });
  const assetStore = await createCcoPatientAssetStore({
    filePath: assetsPath,
    auditLog,
  });

  let patients = null;
  if (args.patientsStorePath && args.tenant) {
    const patientStore = await createCcoPatientMasterStore({
      filePath: path.resolve(args.patientsStorePath),
    });
    const patientsPage = await patientStore.listPatients({
      tenantId: args.tenant,
      limit: 20000,
      offset: 0,
    });
    patients = patientsPage.patients || [];
  } else {
    process.stderr.write(
      '[backfill-asset-display-names] VARNING: kör utan alias-upplösning ' +
        '(--i-understand-the-collision-risk-skip-alias-resolution) — kors-patient-' +
        'kollisioner (CCO-STATUS.md punkt 1, 519 verifierade grupper) kan fortfarande ' +
        'skriva ett sessionNumber som blandar ihop olika patienters behandlingar.\n'
    );
  }

  const report = await backfillAssetDisplayNames({ assetStore, patients, args });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[backfill-asset-display-names] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  backfillAssetDisplayNames,
  needsBackfill,
  looksTechnical,
  isAutoSafeNamingPatch,
  groupByPatientId,
  resolveAliasKeyFn,
};
