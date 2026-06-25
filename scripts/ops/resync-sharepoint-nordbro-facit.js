#!/usr/bin/env node
'use strict';

/**
 * SharePoint Nordbro/Insatt facit re-sync + legal diff per mall.
 *
 * Owner: bekräftar att 97. Versioner från advokat + Insatt-mapp är facit-set.
 * Tekniskt: Graph re-sync (om creds) + E6 legal diff + metadata revisions[].
 *
 * Usage:
 *   npm run resync:sharepoint-nordbro-facit
 *   npm run resync:sharepoint-nordbro-facit -- --apply-metadata
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  extractDocxText,
  resolveAvtalWord,
  compareLegalTriad,
  AVTAL_ANCHORS,
  phraseCoverage,
} = require('./patient-document-word-lib');

const {
  getToken,
  getItemByPath,
  listChildren,
  downloadItemContent,
} = require('./lib/sharepointGraph');

const FACIT_SET_PATH = path.join(ROOT, 'config/nordbro-insatt-facit-set.json');
const OUTSIDE_PATH = path.join(ROOT, 'config/sharepoint-nordinsatt-outside-facit-registry.json');
const CONSENT_PATH = path.join(ROOT, 'migration/meridiq/consent-catalog.json');
const DHI_FACIT_PATH = path.join(ROOT, 'migration/meridiq/steg7-tp-dhi-agreement-facit.json');
const PRP_FACIT_PATH = path.join(ROOT, 'migration/meridiq/prp-behandling-agreement-facit.json');
const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');

const SP_ROOT = 'General/1. Kunddokument - KVALITETSSÄKRA';
const SP_NORDBRO = `${SP_ROOT}/97. Versioner från advokat`;
const SP_INSATT = `${SP_ROOT}/INSATT - HTPC`;

const SHAREPOINT_INVENTORY = {
  agreement_hair_tp_dhi_2day_nordbro: {
    sharepointFile: '251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar1.docx',
    sharepointFolder: SP_NORDBRO,
    localWord: '251203-behandlingsavtal-dhi-2dagar.docx',
    itemIdPrefix: '01OVMUU4VI732N',
    version: '251203',
    legalReviewStatus: 'nordbro_approved',
    source: 'sharepoint_nordbro',
    facitPath: DHI_FACIT_PATH,
    meridiqApiIds: [170917],
  },
  agreement_hair_tp_dhi_7day_nordbro: {
    sharepointFile: '251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 7 dagar1.docx',
    sharepointFolder: SP_NORDBRO,
    localWord: '251203-behandlingsavtal-dhi-7dagar.docx',
    itemIdPrefix: '01OVMUU4UAAI3I',
    version: '251203',
    legalReviewStatus: 'nordbro_approved',
    source: 'sharepoint_nordbro',
    status: 'DEPRECATED_ALTERNATIVE',
    meridiqApiIds: [],
  },
  agreement_hair_tp_prp_nordbro: {
    sharepointFile: '251203_Behandlingsavtal Hair TP Clinic gbg AB (PRP-behandling).docx',
    sharepointFolder: SP_NORDBRO,
    localWord: '251203-behandlingsavtal-prp.docx',
    itemIdPrefix: '01OVMUU4WSHDH4',
    version: '251203',
    legalReviewStatus: 'nordbro_approved',
    source: 'sharepoint_nordbro',
    facitPath: PRP_FACIT_PATH,
    meridiqApiIds: [170944, 170945],
  },
  agreement_hair_tp_fue_insatt: {
    sharepointFile: 'TP Avtal.docx',
    sharepointFolder: SP_INSATT,
    localWord: 'insatt-tp-avtal.docx',
    itemIdPrefix: '01OVMUU4Q2CDS7',
    version: '2025-04-30',
    legalReviewStatus: 'insatt_approved',
    source: 'sharepoint_insatt',
    status: 'SKIP_OLD',
    meridiqApiIds: [],
  },
};

function sha256(textOrBuf) {
  return crypto.createHash('sha256').update(textOrBuf).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function facitBlocksToPlain(facit) {
  return (facit.blocks || []).map((b) => stripHtml(b.html)).join('\n');
}

function buildRevisionEntry(meta, wordSha, syncedAt, mode) {
  return {
    version: meta.version,
    source: meta.source,
    legalReviewStatus: meta.legalReviewStatus,
    sharepointFile: meta.sharepointFile,
    sharepointFolder: meta.sharepointFolder,
    localWord: meta.localWord,
    textHash: wordSha.slice(0, 12),
    sha256: wordSha,
    syncedAt,
    replaceReason:
      mode === 'live_graph' ? 'sharepoint_resync_graph' : 'sharepoint_resync_inventory',
    archivedAt: syncedAt,
  };
}

function mergeRevisions(existing, entry) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  const dup = list.find((r) => r.sha256 === entry.sha256 && r.version === entry.version);
  if (!dup) list.push(entry);
  return list;
}

async function syncSharePointLive(token, meta, wordDir) {
  const item = await getItemByPath(token, meta.sharepointFolder, meta.sharepointFile);
  const destPath = path.join(wordDir, meta.localWord);
  await downloadItemContent(token, item.id, destPath);
  return {
    mode: 'live_graph',
    itemId: item.id,
    webUrl: item.webUrl,
    lastModifiedDateTime: item.lastModifiedDateTime,
    bytes: fs.statSync(destPath).size,
    destPath,
    sha256: sha256File(destPath),
  };
}

function syncFromLocal(meta, wordDir) {
  const destPath = path.join(wordDir, meta.localWord);
  if (!fs.existsSync(destPath)) {
    const alt = resolveAvtalWord(meta.facitPath?.includes('prp') ? 'offert_prp_skin' : 'offert_tp');
    if (alt) {
      return {
        mode: 'local_word_fallback',
        destPath: alt,
        sha256: sha256File(alt),
        note: `Använder ${path.basename(alt)} — kör download:patient-doc-word-e4 för ${meta.localWord}`,
      };
    }
    return { mode: 'missing', destPath, sha256: null };
  }
  return { mode: 'local_existing', destPath, sha256: sha256File(destPath) };
}

function legalDiffTemplate(templateId, meta, syncResult) {
  if (!meta.facitPath || !syncResult.sha256) {
    return {
      templateId,
      status: meta.status === 'DEPRECATED_ALTERNATIVE' ? 'DEPRECATED_OK' : 'SKIP_NO_FACIT',
      skipped: true,
    };
  }
  const facit = JSON.parse(fs.readFileSync(meta.facitPath, 'utf8'));
  const wordText = extractDocxText(syncResult.destPath);
  const facitText = facitBlocksToPlain(facit);
  const triad = compareLegalTriad({
    wordText,
    bundleText: facitText,
    demoText: facitText,
    phrases: AVTAL_ANCHORS,
  });
  const wordAnchors = phraseCoverage(wordText, AVTAL_ANCHORS);
  return {
    templateId,
    status: triad.status,
    wordHits: triad.wordHits,
    bundleHits: triad.bundleHits,
    wordAnchorHits: `${wordAnchors.hits}/${wordAnchors.total}`,
    wordPath: syncResult.destPath,
    wordSha256: syncResult.sha256.slice(0, 12),
    facitSha256: sha256(facitText).slice(0, 12),
    skipped: false,
  };
}

function verifyOwnerFacitSet(outsideRegistry, liveNordbroFiles) {
  const blockers = [];
  const warnings = [];

  for (const ext of outsideRegistry.supersededAvtalOutsideFacit || []) {
    if (ext.reason === 'INTERN_2026_ARBETSKOPIA') {
      warnings.push({
        file: ext.sharepointFile,
        reason: ext.reason,
        action: `Superseded by ${ext.supersededBy} — ej juridisk facit`,
      });
    }
  }

  const allowed97Patterns = (outsideRegistry.allowedIn97FolderNonAvtal || []).map(
    (x) => x.sharepointFilePattern
  );

  if (liveNordbroFiles?.length) {
    const nordbro251203 = liveNordbroFiles.filter((f) => f.name?.startsWith('251203_'));
    const unknown = liveNordbroFiles.filter((f) => {
      if (!f.name?.endsWith('.docx')) return false;
      if (f.name.startsWith('251203_') || f.name.startsWith('251030_')) return false;
      if (allowed97Patterns.some((p) => f.name.toUpperCase().includes(p.toUpperCase()))) {
        return false;
      }
      return true;
    });
    if (unknown.length) {
      blockers.push({
        code: 'UNKNOWN_NORDBRO_FILE',
        files: unknown.map((f) => f.name),
        action: 'Owner måste klassificera innan facit-set uppdateras',
      });
    }
    if (nordbro251203.length < 3) {
      warnings.push({
        code: 'NORDBRO_FILE_COUNT',
        expected: 3,
        found: nordbro251203.length,
        note: '97-mappen ska ha 3 produktiva 251203-avtal',
      });
    }
  }

  return {
    ownerConfirmed: blockers.length === 0,
    noNewerVersionsOutside: blockers.length === 0,
    blockers,
    warnings,
    facitFolders: [SP_NORDBRO, SP_INSATT],
    canonicalRule:
      '251203_* i 97. Versioner från advokat > Insatt TP Avtal (SKIP_OLD) > interna 2026/99. Kundresan avtal',
  };
}

function applyMetadataUpdates(syncResults, apply) {
  const syncedAt = new Date().toISOString();
  const updates = { consentCatalog: 0, facitJson: 0, facitSet: 0 };

  if (!apply) return { updates, dryRun: true };

  const consent = JSON.parse(fs.readFileSync(CONSENT_PATH, 'utf8'));
  const facitSet = JSON.parse(fs.readFileSync(FACIT_SET_PATH, 'utf8'));

  for (const row of syncResults) {
    const { templateId, meta, sync, revision } = row;
    if (!revision) continue;

    for (const apiId of meta.meridiqApiIds || []) {
      const c = consent.consents.find((x) => x.apiId === apiId);
      if (!c) continue;
      c.source = meta.source;
      c.legalReviewStatus = meta.legalReviewStatus;
      c.templateVersion = meta.version;
      c.templateRef = templateId;
      c.revisions = mergeRevisions(c.revisions, revision);
      updates.consentCatalog += 1;
    }

    if (meta.facitPath && fs.existsSync(meta.facitPath)) {
      const facit = JSON.parse(fs.readFileSync(meta.facitPath, 'utf8'));
      facit.source = `${meta.source}:${meta.sharepointFile}`;
      facit.legalSource = {
        ...(facit.legalSource || {}),
        primary: meta.source === 'sharepoint_insatt' ? 'insatt' : 'nordbro',
        source: meta.source,
        legalReviewStatus: meta.legalReviewStatus,
        templateVersion: meta.version,
        templateRef: templateId,
        localWord: meta.localWord,
        sharepointFile: meta.sharepointFile,
        sharepointFolder: meta.sharepointFolder,
        textHash: revision.textHash,
        sha256: revision.sha256,
        syncedAt,
      };
      facit.revisions = mergeRevisions(facit.revisions, revision);
      fs.writeFileSync(meta.facitPath, `${JSON.stringify(facit, null, 2)}\n`, 'utf8');
      updates.facitJson += 1;
    }

    for (const setKey of Object.keys(facitSet.facitSets || {})) {
      const docs = facitSet.facitSets[setKey].documents || [];
      for (const doc of docs) {
        if (doc.id !== templateId) continue;
        doc.source = meta.source;
        doc.sharepointFolder = meta.sharepointFolder;
        doc.sha256 = revision.sha256;
        doc.textHash = revision.textHash;
        doc.syncedAt = syncedAt;
        doc.revisions = mergeRevisions(doc.revisions, revision);
        updates.facitSet += 1;
      }
    }
  }

  facitSet.ownerConfirmed = true;
  facitSet.ownerConfirmation = {
    confirmedAt: syncedAt,
    confirmedBy: 'owner',
    rule: '97. Versioner från advokat + Insatt-mapp är facit-set; inga nyare juridiska versioner utanför',
    noNewerVersionsOutside: true,
    sharepointResyncRun: syncedAt,
  };
  facitSet.lastSharePointResync = syncedAt;

  fs.writeFileSync(CONSENT_PATH, `${JSON.stringify(consent, null, 2)}\n`, 'utf8');
  fs.writeFileSync(FACIT_SET_PATH, `${JSON.stringify(facitSet, null, 2)}\n`, 'utf8');

  const cooling = JSON.parse(fs.readFileSync(DHI_FACIT_PATH, 'utf8'));
  if (cooling.cooling?.legalSource) {
    const dhiRow = syncResults.find((r) => r.templateId === 'agreement_hair_tp_dhi_2day_nordbro');
    if (dhiRow?.revision) {
      cooling.cooling.legalSource.source = 'sharepoint_nordbro';
      cooling.cooling.revisions = mergeRevisions(cooling.cooling.revisions, {
        ...dhiRow.revision,
        meridiqApiId: 170955,
        note: 'Bundlat ångerfristsamtycke — samma Nordbro 251203-paket',
      });
      const c955 = consent.consents.find((x) => x.apiId === 170955);
      if (c955) {
        c955.source = 'sharepoint_nordbro';
        c955.templateVersion = '251203';
        c955.templateRef = 'agreement_hair_tp_dhi_2day_nordbro#cooling';
        c955.revisions = mergeRevisions(c955.revisions, {
          ...dhiRow.revision,
          note: 'cooling consent bundled in DHI agreement',
        });
        updates.consentCatalog += 1;
      }
      fs.writeFileSync(DHI_FACIT_PATH, `${JSON.stringify(cooling, null, 2)}\n`, 'utf8');
      fs.writeFileSync(CONSENT_PATH, `${JSON.stringify(consent, null, 2)}\n`, 'utf8');
    }
  }

  return { updates, dryRun: false };
}

async function main() {
  const apply = process.argv.includes('--apply-metadata');
  const stamp = new Date().toISOString().slice(0, 10);
  const syncedAt = new Date().toISOString();
  const outsideRegistry = JSON.parse(fs.readFileSync(OUTSIDE_PATH, 'utf8'));

  const wordDir =
    process.env.CCO_PATIENT_DOCS_WORD_DIR ||
    path.join(
      process.env.HOME,
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/CCO-patientdokument-live/01-word-original-lokalt'
    );

  let token = null;
  let liveNordbroFiles = null;
  let graphMode = 'inventory_fallback';

  try {
    token = await getToken();
    if (token) {
      liveNordbroFiles = await listChildren(token, SP_NORDBRO);
      graphMode = 'live_graph';
      console.log(`✓ Graph live — ${liveNordbroFiles.length} filer i 97-mappen`);
    }
  } catch (err) {
    console.warn(`⚠ Graph live misslyckades: ${err.message} — använder lokal Word + inventory`);
  }

  const ownerCheck = verifyOwnerFacitSet(outsideRegistry, liveNordbroFiles);

  const syncResults = [];
  for (const [templateId, meta] of Object.entries(SHAREPOINT_INVENTORY)) {
    let sync;
    if (token && meta.sharepointFolder) {
      try {
        sync = await syncSharePointLive(token, meta, wordDir);
      } catch (err) {
        console.warn(`⚠ Graph download ${templateId}: ${err.message}`);
        sync = syncFromLocal(meta, wordDir);
      }
    } else {
      sync = syncFromLocal(meta, wordDir);
    }

    const revision = sync.sha256
      ? buildRevisionEntry(meta, sync.sha256, syncedAt, sync.mode || graphMode)
      : null;

    const legal = legalDiffTemplate(templateId, meta, sync);
    syncResults.push({ templateId, meta, sync, revision, legal });
    console.log(
      `  ${templateId}: sync=${sync.mode} legal=${legal.status}${legal.skipped ? ' (skip)' : ''}`
    );
  }

  const legalRows = syncResults.filter((r) => !r.legal.skipped);
  const allLegalOk = legalRows.every((r) => r.legal.status === 'E6_OK');
  const metadataResult = applyMetadataUpdates(syncResults, apply);

  const payload = {
    generatedAt: syncedAt,
    batch: 'SHAREPOINT_NORDINSATT_RESYNC',
    graphMode,
    ownerConfirmation: ownerCheck,
    supersededOutsideFacit: outsideRegistry.supersededAvtalOutsideFacit,
    templates: syncResults.map(({ templateId, meta, sync, revision, legal }) => ({
      templateId,
      sharepointFile: meta.sharepointFile,
      version: meta.version,
      source: meta.source,
      legalReviewStatus: meta.legalReviewStatus,
      sync,
      revision,
      legal,
    })),
    metadataApply: metadataResult,
    overall:
      ownerCheck.ownerConfirmed && allLegalOk
        ? 'RESYNC_PASS'
        : ownerCheck.blockers.length
          ? 'RESYNC_BLOCKED'
          : 'RESYNC_PASS_WITH_WARNINGS',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `SHAREPOINT-NORDINSATT-RESYNC-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `SHAREPOINT-NORDINSATT-RESYNC-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const md = `# SharePoint Nordbro/Insatt re-sync · ${stamp}

## Owner-bekräftelse

| Kontroll | Resultat |
|----------|----------|
| Facit-set = 97. Versioner från advokat + Insatt | **${ownerCheck.ownerConfirmed ? 'JA' : 'NEJ'}** |
| Inga nyare juridiska versioner utanför | **${ownerCheck.noNewerVersionsOutside ? 'JA' : 'BLOCKER'}** |
| Graph-läge | \`${graphMode}\` |

**Regel:** ${ownerCheck.canonicalRule}

### Superseded utanför facit (ej blockerare)

${(outsideRegistry.supersededAvtalOutsideFacit || [])
  .map((x) => `- \`${x.sharepointFile}\` — ${x.reason} → ${x.supersededBy}`)
  .join('\n')}

${
  ownerCheck.blockers.length
    ? `### Blockers\n${ownerCheck.blockers.map((b) => `- **${b.code}**: ${JSON.stringify(b.files || b)}`).join('\n')}\n`
    : ''
}

## Legal diff per mall (E6-mönster)

| templateId | source | legalReviewStatus | sync | legal status |
|------------|--------|-------------------|------|--------------|
${syncResults
  .map(
    (r) =>
      `| \`${r.templateId}\` | ${r.meta.source} | ${r.meta.legalReviewStatus} | ${r.sync.mode} | **${r.legal.status}** |`
  )
  .join('\n')}

## Metadata

- \`--apply-metadata\`: ${apply ? '**KÖRD**' : 'ej körd (dry-run)'}
- consent-catalog uppdaterade: ${metadataResult.updates?.consentCatalog ?? 0}
- facit JSON uppdaterade: ${metadataResult.updates?.facitJson ?? 0}
- facit-set docs uppdaterade: ${metadataResult.updates?.facitSet ?? 0}

**Overall:** **${payload.overall}**

---

\`npm run resync:sharepoint-nordbro-facit\` · mönster: SHAREPOINT-IMPORT-REPORT-2026-05-30 + E6-LEGAL-DIFF-TEMPLATE.md
`;

  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`\nOverall: ${payload.overall}`);
  console.log(`Owner confirmed: ${ownerCheck.ownerConfirmed}`);
  console.log(`Legal E6_OK: ${allLegalOk}`);
  console.log(`Wrote: ${jsonPath}`);
  if (!apply) {
    console.log(
      'Tips: kör med --apply-metadata för att skriva revisions[] till consent-catalog + facit JSON'
    );
  }

  if (payload.overall === 'RESYNC_BLOCKED') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
