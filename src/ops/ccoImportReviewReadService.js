'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isStrongCustomerMatch } = require('./ccoImportReviewMatch');

const OPERATOR_SOURCES = new Set(['m365_halso', 'getaccept_import']);
const SOURCE_META = {
  m365_halso: { id: 'halso', label: 'halso@' },
  getaccept_import: { id: 'getaccept', label: 'GetAccept' },
};

const REASON_LABELS = {
  no_patient_match: 'Ingen säker patientmatch',
  ambiguous_patient: 'Flera möjliga patienter — kräver manuell verifiering',
  low_confidence: 'Låg matchningskonfidens',
  missing_customer: 'Kund saknas i CCO',
};

function resolveQueuePath(dataRoot) {
  const candidates = [
    process.env.ARCANA_CCO_DATA_ROOT,
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
  if (reasonKey === 'ambiguous_patient') {
    approvalRequirements.unshift('Välj exakt en befintlig patientId');
  }
  if (!suggested) {
    approvalRequirements.unshift('Föreslagen kund saknas — manuell koppling eller reject');
  }

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
    strongMatchEligible: strongMatch,
    preparedActions: [
      {
        id: 'approve_match',
        enabled: writeEnabled && strongMatch,
        note: strongMatch ? 'Canary — ett beslut' : 'Kräver stark kundmatch',
      },
      {
        id: 'reject_match',
        enabled: writeEnabled,
        note: writeEnabled ? 'Canary' : 'Write AV',
      },
      {
        id: 'leave_unresolved',
        enabled: writeEnabled,
        note: writeEnabled ? 'Canary' : 'Write AV',
      },
      {
        id: 'needs_owner_source',
        enabled: writeEnabled,
        note: writeEnabled ? 'Eskalera till owner' : 'Write AV',
      },
    ],
  };
}

let indexCache = null;

function buildIndex(dataRoot) {
  if (indexCache?.dataRoot === dataRoot) return indexCache;

  const queuePath = resolveQueuePath(dataRoot);
  if (!queuePath) {
    indexCache = {
      dataRoot,
      queuePath: null,
      loadedAt: new Date().toISOString(),
      operatorScope: true,
      bySource: { halso: [], getaccept: [] },
      counts: { halso: 0, getaccept: 0, total: 0 },
      statusBySource: {},
      referenceFallback: true,
    };
    return indexCache;
  }

  const raw = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const rows = normalizeItems(raw);
  const halso = [];
  const getaccept = [];
  const statusBySource = {
    m365_halso: { pending: 0, resolved: 0 },
    getaccept_import: { pending: 0, resolved: 0 },
  };

  for (const row of rows) {
    const src = row.sourceSystem || row.source;
    if (!OPERATOR_SOURCES.has(src)) continue;
    const st = row.status || 'pending';
    if (!statusBySource[src]) statusBySource[src] = { pending: 0, resolved: 0 };
    if (st === 'pending') {
      statusBySource[src].pending += 1;
      if (src === 'm365_halso') halso.push(row.id);
      else if (src === 'getaccept_import') getaccept.push(row.id);
    } else {
      statusBySource[src].resolved += 1;
    }
  }

  indexCache = {
    dataRoot,
    queuePath,
    loadedAt: new Date().toISOString(),
    operatorScope: true,
    operatorNote:
      'Operator-scope: halso@ + GetAccept osäkra kundmatchningar — inte hela Drive-kön (~33k)',
    bySource: { halso, getaccept },
    counts: {
      halso: halso.length,
      getaccept: getaccept.length,
      total: halso.length + getaccept.length,
    },
    statusBySource,
    itemsById: Object.fromEntries(rows.map((r) => [r.id, r])),
    referenceFallback: false,
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

  const total = idx.referenceFallback
    ? (ref?.total ?? 1497)
    : idx.counts.total || ref?.total || 1497;

  return {
    generatedAt: new Date().toISOString(),
    total,
    status: 'WAITING_MANUAL_REVIEW',
    statusLabel: 'Manuell review krävs',
    rule: 'Ingen auto-import · ingen ny kund vid osäker match',
    policy: ref?.policy || 'Safe-match klar — ny riskimport kräver explicit GO',
    writeEnabled: false,
    operatorScope: true,
    dataSource: idx.queuePath ? 'live_queue_file' : 'reference_snapshot',
    liveQueuePath: idx.queuePath,
    sources: [
      {
        id: 'halso',
        label: 'halso@',
        queueCount:
          idx.counts.halso || ref?.sources?.find((s) => s.id === 'halso')?.queueCount || 1366,
        status: idx.statusBySource?.m365_halso || { pending: idx.counts.halso, resolved: 0 },
        note: 'osäkra kundmatchningar',
      },
      {
        id: 'getaccept',
        label: 'GetAccept',
        queueCount:
          idx.counts.getaccept ||
          ref?.sources?.find((s) => s.id === 'getaccept')?.queueCount ||
          131,
        status: idx.statusBySource?.getaccept_import || {
          pending: idx.counts.getaccept,
          resolved: 0,
        },
        note: 'osäkra kundmatchningar',
      },
    ],
    driveOrphanNote: 'Drive/orphan (~31k) ingår inte i denna operator-vy',
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
  else ids = [...(idx.bySource?.halso || []), ...(idx.bySource?.getaccept || [])];

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
  OPERATOR_SOURCES,
};
