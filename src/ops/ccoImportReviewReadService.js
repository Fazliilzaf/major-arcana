'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isStrongCustomerMatch } = require('./ccoImportReviewMatch');

const OPERATOR_SOURCES = new Set(['m365_halso', 'getaccept_import', 'cco_journal_sign']);
const SOURCE_META = {
  m365_halso: { id: 'halso', label: 'halso@' },
  getaccept_import: { id: 'getaccept', label: 'GetAccept' },
  cco_journal_sign: { id: 'journal_sign', label: 'Journal/sign' },
};

const REASON_LABELS = {
  no_patient_match: 'Ingen säker patientmatch',
  ambiguous_patient: 'Flera möjliga patienter — kräver manuell verifiering',
  low_confidence: 'Låg matchningskonfidens',
  missing_customer: 'Kund saknas i CCO',
  owner_metadata_stub: 'GetAccept metadata-stubb utan PDF — produktbeslut',
  journal_sign_needs_product_decision:
    'Signerad journal/form utan Drive-källa — compliance-/produktbeslut',
};

function resolveQueuePath(dataRoot) {
  const candidates = [
    process.env.ARCANA_CCO_DATA_ROOT,
    process.env.ARCANA_STATE_ROOT,
    dataRoot,
    path.join(
      process.env.HOME || '',
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    ),
  ].filter(Boolean);

  for (const base of candidates) {
    const p = path.join(base, 'cco-import-review-queue.json');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolvePatientAssetsPath(dataRoot) {
  const candidates = [
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH,
    process.env.ARCANA_STATE_ROOT
      ? path.join(process.env.ARCANA_STATE_ROOT, 'cco-patient-assets.json')
      : null,
    path.join(dataRoot, 'cco-patient-assets.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Read-only synthetic queue rows from patient assets (owner queue 117).
 * Used when live import-review queue file is missing or empty for GetAccept,
 * and always for cco_journal_sign (never lived in the import queue file).
 */
function loadOwnerAssetQueueRows(
  dataRoot,
  { sources = ['getaccept_import', 'cco_journal_sign'] } = {}
) {
  const assetsPath = resolvePatientAssetsPath(dataRoot);
  if (!assetsPath) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  } catch {
    return [];
  }
  const want = new Set(sources);
  const rows = [];
  for (const asset of Object.values(raw.items || {})) {
    if (!asset || asset.status !== 'NEEDS_REVIEW') continue;
    const src = asset.sourceSystem || asset.source;
    if (!want.has(src)) continue;
    const reason =
      src === 'getaccept_import' ? 'owner_metadata_stub' : 'journal_sign_needs_product_decision';
    rows.push({
      id: asset.id,
      assetId: asset.id,
      kind: asset.category || (src === 'getaccept_import' ? 'agreement' : 'journal'),
      sourceSystem: src,
      source: src,
      status: 'pending',
      reason,
      matchConfidence: asset.patientId ? 'high' : 'low',
      suggestedPatientIds: asset.patientId ? [asset.patientId] : [],
      documentName: asset.originalFileName || asset.displayName || null,
      signedAt: asset.documentDate || asset.importedAt || null,
      brand: asset.brand || asset.tenantId || null,
      dataSource: 'patient_assets_needs_review',
      readOnlyOwnerQueue: true,
    });
  }
  return rows;
}

function normalizeItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.queue)) return raw.queue;
  if (raw.items && typeof raw.items === 'object') {
    return Object.values(raw.items);
  }
  return [];
}

function mapItemForUi(row, { writeEnabled = false } = {}) {
  const src = row.sourceSystem || row.source || 'unknown';
  const meta = SOURCE_META[src] || { id: src, label: src };
  const suggested = Array.isArray(row.suggestedPatientIds) ? row.suggestedPatientIds[0] : null;
  const strongMatch = isStrongCustomerMatch(row);
  const reasonKey = row.reason || 'no_patient_match';
  const approvalRequirements = [
    'Verifierad patientmatch (ingen ny kund)',
    'Owner-beslut med reviewer + reason',
    'Ingen auto-import',
  ];
  if (row.readOnlyOwnerQueue) {
    approvalRequirements.unshift('Ägarkö — endast manuell produkt-/compliancebedömning');
  }
  if (reasonKey === 'ambiguous_patient') {
    approvalRequirements.unshift('Välj exakt en befintlig patientId');
  }
  if (!suggested) {
    approvalRequirements.unshift('Föreslagen kund saknas — manuell koppling eller reject');
  }

  const ownerReadOnly = row.readOnlyOwnerQueue === true;
  return {
    id: row.id,
    kind: row.kind,
    sourceSystem: src,
    sourceLabel: meta.label,
    status: row.status || 'pending',
    reason: reasonKey,
    reasonLabel: REASON_LABELS[reasonKey] || reasonKey,
    matchConfidence: row.matchConfidence || 'low',
    suggestedPatientId: suggested,
    suggestedPatientIds: row.suggestedPatientIds || [],
    documentName: row.documentName || null,
    signedAt: row.signedAt || null,
    brand: row.brand || null,
    approvalRequirements,
    writeEnabled,
    strongMatchEligible: strongMatch && !ownerReadOnly,
    dataSource: row.dataSource || null,
    readOnlyOwnerQueue: ownerReadOnly,
    preparedActions: [
      {
        id: 'approve_match',
        enabled: writeEnabled && strongMatch && !ownerReadOnly,
        note: ownerReadOnly
          ? 'Ägarkö — ingen godkänn/avvisa'
          : strongMatch
            ? 'Canary — ett beslut'
            : 'Kräver stark kundmatch',
      },
      {
        id: 'reject_match',
        enabled: writeEnabled && !ownerReadOnly,
        note: ownerReadOnly
          ? 'Ägarkö — ingen godkänn/avvisa'
          : writeEnabled
            ? 'Canary'
            : 'Write AV',
      },
      {
        id: 'leave_unresolved',
        enabled: writeEnabled && !ownerReadOnly,
        note: ownerReadOnly ? 'Ägarkö — endast browse' : writeEnabled ? 'Canary' : 'Write AV',
      },
      {
        id: 'needs_owner_source',
        enabled: writeEnabled && !ownerReadOnly,
        note: ownerReadOnly
          ? 'Ägarkö — endast browse'
          : writeEnabled
            ? 'Eskalera till owner'
            : 'Write AV',
      },
    ],
  };
}

let indexCache = null;

function buildIndex(dataRoot) {
  if (indexCache?.dataRoot === dataRoot) return indexCache;

  const queuePath = resolveQueuePath(dataRoot);
  const halso = [];
  const getaccept = [];
  const journalSign = [];
  const statusBySource = {
    m365_halso: { pending: 0, resolved: 0 },
    getaccept_import: { pending: 0, resolved: 0 },
    cco_journal_sign: { pending: 0, resolved: 0 },
  };
  const itemsById = {};

  if (queuePath) {
    const raw = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const rows = normalizeItems(raw);
    for (const row of rows) {
      const src = row.sourceSystem || row.source;
      if (!OPERATOR_SOURCES.has(src)) continue;
      const st = row.status || 'pending';
      if (!statusBySource[src]) statusBySource[src] = { pending: 0, resolved: 0 };
      itemsById[row.id] = row;
      if (st === 'pending') {
        statusBySource[src].pending += 1;
        if (src === 'm365_halso') halso.push(row.id);
        else if (src === 'getaccept_import') getaccept.push(row.id);
        else if (src === 'cco_journal_sign') journalSign.push(row.id);
      } else {
        statusBySource[src].resolved += 1;
      }
    }
  }

  // Always attach journal/sign from patient assets (owner queue).
  // GetAccept: use assets when queue file missing or has zero getaccept pending.
  const needGetacceptAssets = getaccept.length === 0;
  const assetRows = loadOwnerAssetQueueRows(dataRoot, {
    sources: needGetacceptAssets ? ['getaccept_import', 'cco_journal_sign'] : ['cco_journal_sign'],
  });
  for (const row of assetRows) {
    const src = row.sourceSystem;
    if (itemsById[row.id]) continue;
    itemsById[row.id] = row;
    if (!statusBySource[src]) statusBySource[src] = { pending: 0, resolved: 0 };
    statusBySource[src].pending += 1;
    if (src === 'getaccept_import') getaccept.push(row.id);
    else if (src === 'cco_journal_sign') journalSign.push(row.id);
  }

  const hasLive =
    Boolean(queuePath) || getaccept.length > 0 || journalSign.length > 0 || halso.length > 0;

  indexCache = {
    dataRoot,
    queuePath,
    loadedAt: new Date().toISOString(),
    operatorScope: true,
    operatorNote: 'Operator-scope: halso@ + GetAccept + journal/sign ägarkö — inte hela Drive-kön',
    bySource: { halso, getaccept, journal_sign: journalSign },
    counts: {
      halso: halso.length,
      getaccept: getaccept.length,
      journal_sign: journalSign.length,
      total: halso.length + getaccept.length + journalSign.length,
    },
    statusBySource,
    itemsById,
    referenceFallback: !hasLive,
    assetsFallback: {
      getaccept: needGetacceptAssets,
      journal_sign: true,
    },
  };
  return indexCache;
}

function loadSummary(dataDir, projectRoot = dataDir) {
  const idx = buildIndex(dataDir);
  const refPath = path.join(projectRoot, 'config/cco-import-review-queue-reference.json');
  let ref = null;
  if (fs.existsSync(refPath)) {
    try {
      ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    } catch {
      ref = null;
    }
  }

  const hasAssetLive = (idx.counts?.getaccept || 0) + (idx.counts?.journal_sign || 0) > 0;
  const total =
    idx.referenceFallback && !hasAssetLive
      ? (ref?.total ?? 1497)
      : idx.counts.total || ref?.total || 1497;

  let dataSource = 'reference_snapshot';
  if (idx.queuePath) dataSource = 'live_queue_file';
  else if (idx.assetsFallback?.getaccept || idx.assetsFallback?.journal_sign) {
    dataSource = 'patient_assets_needs_review';
  }

  return {
    generatedAt: new Date().toISOString(),
    total,
    status: 'WAITING_MANUAL_REVIEW',
    statusLabel: 'Manuell review krävs',
    rule: 'Ingen auto-import · ingen ny kund vid osäker match',
    policy: ref?.policy || 'Safe-match klar — ny riskimport kräver explicit GO',
    writeEnabled: false,
    operatorScope: true,
    dataSource,
    liveQueuePath: idx.queuePath,
    assetsFallback: idx.assetsFallback || null,
    sources: [
      {
        id: 'halso',
        label: 'halso@',
        queueCount: idx.counts.halso || 0,
        status: idx.statusBySource?.m365_halso || { pending: idx.counts.halso || 0, resolved: 0 },
        note: 'osäkra kundmatchningar',
      },
      {
        id: 'getaccept',
        label: 'GetAccept',
        queueCount: idx.counts.getaccept || 0,
        status: idx.statusBySource?.getaccept_import || {
          pending: idx.counts.getaccept || 0,
          resolved: 0,
        },
        note: idx.assetsFallback?.getaccept
          ? 'ägarkö metadata-stubbar från patient-assets'
          : 'osäkra kundmatchningar',
      },
      {
        id: 'journal_sign',
        label: 'Journal/sign',
        queueCount: idx.counts.journal_sign || 0,
        status: idx.statusBySource?.cco_journal_sign || {
          pending: idx.counts.journal_sign || 0,
          resolved: 0,
        },
        note: 'ägarkö cco_journal_sign från patient-assets',
      },
    ],
    driveOrphanNote: 'Drive/orphan ingår inte i denna operator-vy',
  };
}

function listQueue(
  dataRoot,
  {
    source = 'all',
    status = 'pending',
    limit = 50,
    offset = 0,
    eligibleOnly = false,
    writeEnabled = false,
  } = {}
) {
  const idx = buildIndex(dataRoot);
  let ids = [];
  if (source === 'halso' || source === 'm365_halso') ids = idx.bySource?.halso || [];
  else if (source === 'getaccept' || source === 'getaccept_import')
    ids = idx.bySource?.getaccept || [];
  else if (source === 'journal_sign' || source === 'cco_journal_sign')
    ids = idx.bySource?.journal_sign || [];
  else if (source === 'owner117' || source === 'owner_queue')
    ids = [...(idx.bySource?.getaccept || []), ...(idx.bySource?.journal_sign || [])];
  else
    ids = [
      ...(idx.bySource?.halso || []),
      ...(idx.bySource?.getaccept || []),
      ...(idx.bySource?.journal_sign || []),
    ];

  let filteredIds = ids;
  if (eligibleOnly) {
    filteredIds = ids.filter((id) => {
      const row = idx.itemsById?.[id];
      return row && isStrongCustomerMatch(row);
    });
  }

  const slice = filteredIds.slice(offset, offset + limit);
  const items = slice
    .map((id) => idx.itemsById?.[id])
    .filter(Boolean)
    .filter((row) => (status ? row.status === status : true))
    .map((row) => mapItemForUi(row, { writeEnabled }));

  return {
    total: filteredIds.length,
    offset,
    limit,
    source,
    status,
    eligibleOnly,
    items,
    writeEnabled,
  };
}

function invalidateImportReviewCache() {
  indexCache = null;
}

module.exports = {
  loadSummary,
  listQueue,
  invalidateImportReviewCache,
  resolveQueuePath,
  resolvePatientAssetsPath,
  loadOwnerAssetQueueRows,
  OPERATOR_SOURCES,
};
