const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, scans: [] };
}

// Severity levels recognised on compliance flags.
const SEVERITIES = ['info', 'warning', 'critical'];

function makeFlag({ code, severity = 'warning', message = '', detail = {} }) {
  return {
    code: normalizeText(code) || 'unknown',
    severity: SEVERITIES.includes(severity) ? severity : 'warning',
    message: normalizeText(message),
    detail: detail && typeof detail === 'object' ? detail : {},
  };
}

/**
 * Reads a JSON input file that the scan depends on. Returns
 * `{ ok, data, flag }`. When the file is missing/unreadable, `ok` is false and a
 * descriptive flag is attached so runFullScan can record drift instead of
 * throwing.
 */
async function readScanInput(label, code, filePath) {
  if (!normalizeText(filePath)) {
    return {
      ok: false,
      data: null,
      flag: makeFlag({
        code,
        severity: 'warning',
        message: `${label}: ingen sökväg konfigurerad`,
        detail: { reason: 'no_path' },
      }),
    };
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return { ok: true, data: JSON.parse(raw), flag: null };
  } catch (error) {
    const reason = error && error.code === 'ENOENT' ? 'missing_file' : 'unreadable';
    return {
      ok: false,
      data: null,
      flag: makeFlag({
        code,
        severity: 'warning',
        message: `${label}: ${reason === 'missing_file' ? 'filen saknas' : 'kunde inte läsas'}`,
        detail: { reason, path: filePath, error: error && error.message },
      }),
    };
  }
}

/**
 * Compares the registered templates against the external version catalog and
 * surfaces drift / governance flags. Tolerant of partial or missing data.
 */
function evaluateTemplateDrift({ templates, externalVersions }) {
  const flags = [];
  const list = Array.isArray(templates) ? templates : [];

  // External version catalog may be either a map keyed by id, or an array.
  const versionById = new Map();
  if (externalVersions && typeof externalVersions === 'object') {
    if (Array.isArray(externalVersions)) {
      for (const entry of externalVersions) {
        const id = normalizeText(entry?.id || entry?.templateId);
        if (id) versionById.set(id, entry);
      }
    } else if (Array.isArray(externalVersions.templates)) {
      for (const entry of externalVersions.templates) {
        const id = normalizeText(entry?.id || entry?.templateId);
        if (id) versionById.set(id, entry);
      }
    } else {
      for (const [id, entry] of Object.entries(externalVersions)) {
        if (id) versionById.set(normalizeText(id), entry);
      }
    }
  }

  for (const tpl of list) {
    if (!tpl || typeof tpl !== 'object') continue;
    const id = normalizeText(tpl.id || tpl.templateId);

    // Governance: templates pending/failed legal review are flagged.
    const review = normalizeText(tpl.legalReviewStatus);
    if (review && review !== 'approved') {
      flags.push(
        makeFlag({
          code: 'template_legal_review',
          severity: review === 'rejected' ? 'critical' : 'warning',
          message: `Mall ${id || '(okänd)'} har legalReviewStatus="${review}"`,
          detail: { templateId: id, legalReviewStatus: review },
        })
      );
    }

    // Drift: registered version differs from external catalog version.
    if (id && versionById.has(id)) {
      const ext = versionById.get(id);
      const extVersion = normalizeText(
        typeof ext === 'object' ? ext.version || ext.externalVersion : ext
      );
      const localVersion = normalizeText(tpl.version || tpl.externalVersion);
      if (extVersion && localVersion && extVersion !== localVersion) {
        flags.push(
          makeFlag({
            code: 'template_version_drift',
            severity: 'warning',
            message: `Mall ${id} version-drift: lokal=${localVersion} extern=${extVersion}`,
            detail: { templateId: id, localVersion, externalVersion: extVersion },
          })
        );
      }
    }
  }

  return flags;
}

async function createCcoComplianceScanStore({
  filePath = null,
  externalVersionsPath = null,
  meridiqSchemaPath = null,
  templateRegistry = null,
  auditLog = null,
} = {}) {
  // Persistence is optional: when a filePath is provided we hydrate from /
  // persist to it; otherwise state lives purely in memory.
  const persistent = !!normalizeText(filePath);

  let state = persistent ? await readJson(filePath, emptyState()) : emptyState();
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    scans: Array.isArray(state?.scans) ? state.scans : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    if (persistent) {
      await writeJsonAtomic(filePath, state);
    }
  }

  function getLatestScan() {
    if (state.scans.length === 0) return null;
    return { ...state.scans[state.scans.length - 1] };
  }

  function getActiveFlags() {
    const latest = getLatestScan();
    return latest ? latest.flags.map((f) => ({ ...f })) : [];
  }

  function listScans({ limit = 20 } = {}) {
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    // Most-recent first.
    return state.scans
      .slice()
      .reverse()
      .slice(0, max)
      .map((scan) => ({ ...scan }));
  }

  async function runFullScan({ triggeredBy = 'manual', sinceHours = 24 } = {}) {
    const startedAt = nowIso();
    const flags = [];

    // Input 1: external template version catalog.
    const externalInput = await readScanInput(
      'External template-versioner',
      'external_versions_unavailable',
      externalVersionsPath
    );
    if (externalInput.flag) flags.push(externalInput.flag);

    // Input 2: Meridiq journal schema catalog.
    const schemaInput = await readScanInput(
      'Meridiq schema-katalog',
      'meridiq_schema_unavailable',
      meridiqSchemaPath
    );
    if (schemaInput.flag) flags.push(schemaInput.flag);

    // Pull current templates from the registry (tolerate null/undefined).
    let templates = [];
    try {
      if (templateRegistry && typeof templateRegistry.list === 'function') {
        const listed = templateRegistry.list({});
        templates = Array.isArray(listed) ? listed : [];
      }
    } catch (error) {
      flags.push(
        makeFlag({
          code: 'template_registry_error',
          severity: 'warning',
          message: 'Kunde inte läsa template-registry',
          detail: { error: error && error.message },
        })
      );
      templates = [];
    }

    // Evaluate template governance / version drift.
    flags.push(
      ...evaluateTemplateDrift({
        templates,
        externalVersions: externalInput.data,
      })
    );

    const bySeverity = { info: 0, warning: 0, critical: 0 };
    for (const f of flags) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;

    const scan = {
      scanId: crypto.randomUUID(),
      triggeredBy: normalizeText(triggeredBy) || 'manual',
      sinceHours: Number.isFinite(sinceHours) && sinceHours > 0 ? Math.floor(sinceHours) : 24,
      startedAt,
      completedAt: nowIso(),
      templatesScanned: templates.length,
      totalFlags: flags.length,
      bySeverity,
      flags,
    };

    state.scans.push(scan);
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.compliance_scan.run',
        actor: { role: 'system', userId: null },
        target: { kind: 'compliance_scan', id: scan.scanId },
        detail: {
          triggeredBy: scan.triggeredBy,
          totalFlags: scan.totalFlags,
          bySeverity: scan.bySeverity,
        },
      });
    }

    return { ...scan };
  }

  return {
    getLatestScan,
    getActiveFlags,
    listScans,
    runFullScan,
  };
}

module.exports = {
  createCcoComplianceScanStore,
  SEVERITIES,
};
