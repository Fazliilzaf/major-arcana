'use strict';

/**
 * ccoScalpAnalysisStore.js — Hair TP Imaging & Scalp Analysis (Aisia DS-3 MVP).
 *
 * Sessions, images, metrics, comparisons for manual Aisia import workflow.
 * Binaries live in ccoPatientAssetStore + ccoSecureStorageProvider.
 *
 * Schema: docs/schema/cco-scalp-analysis.schema.md
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { translateMetric } = require('./aisiaTerminology');

const SCHEMA_VERSION = '1.0.0';

const VALID_SOURCES = Object.freeze(['aisia_ds3', 'manual_upload', 'cco_camera']);
const VALID_SESSION_TYPES = Object.freeze(['consultation', 'pre_op', 'post_op', 'follow_up']);
const VALID_SESSION_STATUSES = Object.freeze([
  'draft',
  'imported',
  'verified',
  'needs_review',
  'rejected',
]);
const VALID_MAGNIFICATIONS = Object.freeze(['10x', '50x', '100x', '200x']);
const VALID_SPECTRUMS = Object.freeze(['white', 'cross_polarized', 'uv']);
const VALID_METRIC_SOURCES = Object.freeze(['aisia_ds3', 'manual', 'cco_ai']);

const BASELINE_ZONES = Object.freeze([
  'global_front',
  'global_left',
  'global_right',
  'global_back',
  'donor_occipital',
  'donor_left',
  'donor_right',
  'hairline_frontal',
  'mid_scalp',
  'crown',
  'problem_area',
]);

const DONOR_ZONES = Object.freeze(['donor_occipital', 'donor_left', 'donor_right']);

const TIMELINE_EVENT_TYPES = Object.freeze([
  'scalp_analysis_imported',
  'scalp_image_added',
  'scalp_metrics_added',
  'scalp_analysis_verified',
  'scalp_comparison_created',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyState() {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    sessions: {},
    images: {},
    metrics: {},
    comparisons: {},
    timeline: [],
    audit: [],
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function validateEnum(name, value, allowed) {
  if (!allowed.includes(value)) {
    const e = new Error(`invalid ${name} "${value}" — must be one of ${allowed.join('|')}`);
    e.statusCode = 400;
    throw e;
  }
}

function logAudit(auditLog, action, target, actor, result, detail = {}) {
  const entry = {
    id: crypto.randomUUID(),
    action,
    target,
    actor: {
      role: actor?.role || 'unknown',
      userId: actor?.userId || null,
    },
    result,
    detail,
    ts: nowIso(),
  };
  if (auditLog && typeof auditLog.append === 'function') {
    auditLog.append(entry);
  }
  return entry;
}

function normalizeSession(input = {}, existing = {}) {
  const safe = input || {};
  const ex = existing || {};
  const source = normalizeKey(safe.source || ex.source) || 'manual_upload';
  validateEnum('source', source, VALID_SOURCES);
  const sessionType = normalizeKey(safe.sessionType || ex.sessionType) || 'consultation';
  validateEnum('sessionType', sessionType, VALID_SESSION_TYPES);
  const status = normalizeKey(safe.status || ex.status) || 'draft';
  validateEnum('status', status, VALID_SESSION_STATUSES);

  return {
    id: normalizeText(safe.id || ex.id) || crypto.randomUUID(),
    tenantId: normalizeText(safe.tenantId || ex.tenantId),
    patientId: normalizeText(safe.patientId || ex.patientId),
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    source,
    sessionType,
    date: normalizeText(safe.date || ex.date) || nowIso().slice(0, 10),
    operatorId: normalizeText(safe.operatorId || ex.operatorId) || null,
    deviceId: normalizeText(safe.deviceId || ex.deviceId) || null,
    softwareVersion: normalizeText(safe.softwareVersion || ex.softwareVersion) || null,
    reportAssetId: normalizeText(safe.reportAssetId || ex.reportAssetId) || null,
    verifiedBy: normalizeText(safe.verifiedBy || ex.verifiedBy) || null,
    verifiedAt: normalizeText(safe.verifiedAt || ex.verifiedAt) || null,
    clinicianNotes: normalizeText(safe.clinicianNotes || ex.clinicianNotes) || null,
    status,
    createdAt: normalizeText(ex.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeImage(input = {}, existing = {}) {
  const safe = input || {};
  const ex = existing || {};
  const zone = normalizeKey(safe.zone || ex.zone);
  if (!zone) {
    const e = new Error('zone krävs för scalp_analysis_images');
    e.statusCode = 400;
    throw e;
  }
  const magnification = normalizeKey(safe.magnification || ex.magnification) || null;
  if (magnification) validateEnum('magnification', magnification, VALID_MAGNIFICATIONS);
  const spectrum = normalizeKey(safe.spectrum || ex.spectrum) || null;
  if (spectrum) validateEnum('spectrum', spectrum, VALID_SPECTRUMS);

  return {
    id: normalizeText(safe.id || ex.id) || crypto.randomUUID(),
    sessionId: normalizeText(safe.sessionId || ex.sessionId),
    patientId: normalizeText(safe.patientId || ex.patientId),
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    zone,
    angle: normalizeText(safe.angle || ex.angle) || null,
    magnification,
    spectrum,
    assetId: normalizeText(safe.assetId || ex.assetId),
    thumbnailAssetId: normalizeText(safe.thumbnailAssetId || ex.thumbnailAssetId) || null,
    captureTime: normalizeText(safe.captureTime || ex.captureTime) || null,
    qualityScore: Number.isFinite(Number(safe.qualityScore))
      ? Number(safe.qualityScore)
      : (ex.qualityScore ?? null),
    notes: normalizeText(safe.notes || ex.notes) || null,
    verified: typeof safe.verified === 'boolean' ? safe.verified : !!ex.verified,
    createdAt: normalizeText(ex.createdAt) || nowIso(),
  };
}

function normalizeMetric(input = {}, existing = {}) {
  const safe = input || {};
  const ex = existing || {};
  const metricType = normalizeKey(safe.metricType || ex.metricType);
  if (!metricType) {
    const e = new Error('metricType krävs');
    e.statusCode = 400;
    throw e;
  }
  const source = normalizeKey(safe.source || ex.source) || 'manual';
  validateEnum('metric source', source, VALID_METRIC_SOURCES);

  return {
    id: normalizeText(safe.id || ex.id) || crypto.randomUUID(),
    sessionId: normalizeText(safe.sessionId || ex.sessionId),
    imageId: normalizeText(safe.imageId || ex.imageId) || null,
    metricType,
    value: safe.value !== undefined ? safe.value : ex.value,
    unit: normalizeText(safe.unit || ex.unit) || null,
    confidence: Number.isFinite(Number(safe.confidence))
      ? Number(safe.confidence)
      : (ex.confidence ?? null),
    source,
    verified: typeof safe.verified === 'boolean' ? safe.verified : !!ex.verified,
    verifiedBy: normalizeText(safe.verifiedBy || ex.verifiedBy) || null,
    verifiedAt: normalizeText(safe.verifiedAt || ex.verifiedAt) || null,
    displaySv: normalizeText(safe.displaySv || ex.displaySv) || translateMetric(metricType),
    createdAt: normalizeText(ex.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeComparison(input = {}, existing = {}) {
  const safe = input || {};
  const ex = existing || {};
  return {
    id: normalizeText(safe.id || ex.id) || crypto.randomUUID(),
    patientId: normalizeText(safe.patientId || ex.patientId),
    baselineSessionId: normalizeText(safe.baselineSessionId || ex.baselineSessionId),
    comparisonSessionId: normalizeText(safe.comparisonSessionId || ex.comparisonSessionId),
    zone: normalizeText(safe.zone || ex.zone) || null,
    metricChanges: safe.metricChanges !== undefined ? safe.metricChanges : ex.metricChanges || null,
    imageComparison:
      safe.imageComparison !== undefined ? safe.imageComparison : ex.imageComparison || null,
    clinicianConclusion: normalizeText(safe.clinicianConclusion || ex.clinicianConclusion) || null,
    aiSummary: null,
    verifiedBy: normalizeText(safe.verifiedBy || ex.verifiedBy) || null,
    verifiedAt: normalizeText(safe.verifiedAt || ex.verifiedAt) || null,
    createdAt: normalizeText(ex.createdAt) || nowIso(),
  };
}

function appendTimeline(state, event) {
  state.timeline.push({
    id: crypto.randomUUID(),
    ...event,
    ts: event.ts || nowIso(),
  });
  if (state.timeline.length > 50000) {
    state.timeline = state.timeline.slice(-50000);
  }
}

async function createCcoScalpAnalysisStore({ filePath = '', auditLog = null } = {}) {
  const resolvedPath = filePath || path.join(process.cwd(), 'data', 'cco-scalp-analysis.json');
  let state = await readJson(resolvedPath, emptyState());
  if (!state.sessions) state = emptyState();

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  function getSession(id) {
    const s = state.sessions[normalizeText(id)];
    return s ? { ...s } : null;
  }

  function listSessionsForPatient(patientId, { tenantId = null } = {}) {
    const pId = normalizeText(patientId);
    return Object.values(state.sessions)
      .filter((s) => s.patientId === pId && (!tenantId || s.tenantId === tenantId))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map((s) => ({ ...s }));
  }

  function listImagesForSession(sessionId) {
    const sId = normalizeText(sessionId);
    return Object.values(state.images)
      .filter((i) => i.sessionId === sId)
      .map((i) => ({ ...i }));
  }

  function listMetricsForSession(sessionId) {
    const sId = normalizeText(sessionId);
    return Object.values(state.metrics)
      .filter((m) => m.sessionId === sId)
      .map((m) => ({ ...m }));
  }

  function listComparisonsForPatient(patientId) {
    const pId = normalizeText(patientId);
    return Object.values(state.comparisons)
      .filter((c) => c.patientId === pId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((c) => ({ ...c }));
  }

  function listTimelineForPatient(patientId, { limit = 200 } = {}) {
    const pId = normalizeText(patientId);
    return state.timeline
      .filter((e) => e.patientId === pId)
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  function checkCaptureProtocolCompleteness(sessionId) {
    const session = getSession(sessionId);
    if (!session)
      return { complete: false, missing: ['session'], missingZones: [...BASELINE_ZONES] };
    const images = listImagesForSession(sessionId);
    const zonesPresent = new Set(images.map((i) => i.zone));
    const missingZones = BASELINE_ZONES.filter((z) => !zonesPresent.has(z));
    const missingDonorLeft = !zonesPresent.has('donor_left');
    const missingDonorRight = !zonesPresent.has('donor_right');
    const hasReport = !!session.reportAssetId;
    const verified = session.status === 'verified';

    const baselineSession = listSessionsForPatient(session.patientId, {
      tenantId: session.tenantId,
    }).find((s) => s.sessionType === 'consultation' && s.status === 'verified');

    return {
      sessionId,
      complete: missingZones.length === 0 && hasReport,
      missingZones,
      missingDonorLeft,
      missingDonorRight,
      hasReport,
      verified,
      baselineExists: !!baselineSession,
      baselineSessionId: baselineSession?.id || null,
      baselineImagingRequired: session.sessionType === 'pre_op' && !baselineSession,
      donorRecipientImagesRequired:
        session.sessionType === 'pre_op' &&
        (missingDonorLeft ||
          missingDonorRight ||
          missingZones.some((z) => z.startsWith('hairline'))),
      analysisVerifiedRequired: session.status !== 'verified',
      messages: [
        !baselineSession && session.sessionType !== 'consultation'
          ? 'Baseline hår-/scalpanalys saknas'
          : null,
        missingDonorLeft ? 'Saknas donor vänster' : null,
        missingDonorRight ? 'Saknas donor höger' : null,
        !verified ? 'Analys väntar på behandlarverifiering' : null,
        !hasReport ? 'Aisia-rapport (PDF) saknas' : null,
      ].filter(Boolean),
    };
  }

  function computeMetricChanges(baselineSessionId, comparisonSessionId) {
    const baselineMetrics = listMetricsForSession(baselineSessionId);
    const currentMetrics = listMetricsForSession(comparisonSessionId);
    const baselineMap = new Map(baselineMetrics.map((m) => [m.metricType, m]));
    const changes = {};
    for (const current of currentMetrics) {
      const base = baselineMap.get(current.metricType);
      const baseNum = Number(base?.value);
      const curNum = Number(current.value);
      if (Number.isFinite(baseNum) && Number.isFinite(curNum)) {
        changes[current.metricType] = {
          baseline: base.value,
          current: current.value,
          delta: curNum - baseNum,
          labelSv: translateMetric(current.metricType),
        };
      } else {
        changes[current.metricType] = {
          baseline: base?.value ?? null,
          current: current.value,
          delta: null,
          labelSv: translateMetric(current.metricType),
        };
      }
    }
    return changes;
  }

  async function createSession(input, { actor = {} } = {}) {
    const session = normalizeSession(input);
    if (!session.patientId) {
      const e = new Error('patientId krävs');
      e.statusCode = 400;
      throw e;
    }
    if (!session.tenantId) {
      const e = new Error('tenantId krävs');
      e.statusCode = 400;
      throw e;
    }
    state.sessions[session.id] = session;
    appendTimeline(state, {
      type: 'scalp_analysis_imported',
      patientId: session.patientId,
      sessionId: session.id,
      tenantId: session.tenantId,
      sessionType: session.sessionType,
    });
    state.audit.push(
      logAudit(auditLog, 'scalp.session.create', { sessionId: session.id }, actor, 'ok')
    );
    await save();
    return { ...session };
  }

  async function updateSession(id, patch, { actor = {} } = {}) {
    const existing = state.sessions[normalizeText(id)];
    if (!existing) {
      const e = new Error(`session ${id} hittades inte`);
      e.statusCode = 404;
      throw e;
    }
    const merged = normalizeSession({ ...existing, ...patch, id: existing.id }, existing);
    state.sessions[merged.id] = merged;
    state.audit.push(
      logAudit(auditLog, 'scalp.session.update', { sessionId: merged.id }, actor, 'ok')
    );
    await save();
    return { ...merged };
  }

  async function attachReport(sessionId, reportAssetId, { actor = {} } = {}) {
    const updated = await updateSession(
      sessionId,
      { reportAssetId, status: 'imported' },
      { actor }
    );
    appendTimeline(state, {
      type: 'scalp_analysis_imported',
      patientId: updated.patientId,
      sessionId: updated.id,
      reportAssetId,
    });
    await save();
    return updated;
  }

  async function addImage(input, { actor = {} } = {}) {
    const image = normalizeImage(input);
    if (!state.sessions[image.sessionId]) {
      const e = new Error(`session ${image.sessionId} hittades inte`);
      e.statusCode = 404;
      throw e;
    }
    state.images[image.id] = image;
    appendTimeline(state, {
      type: 'scalp_image_added',
      patientId: image.patientId,
      sessionId: image.sessionId,
      imageId: image.id,
      zone: image.zone,
    });
    const session = state.sessions[image.sessionId];
    if (session.status === 'draft') {
      session.status = 'imported';
      session.updatedAt = nowIso();
    }
    state.audit.push(
      logAudit(
        auditLog,
        'scalp.image.add',
        { imageId: image.id, sessionId: image.sessionId },
        actor,
        'ok'
      )
    );
    await save();
    return { ...image };
  }

  async function addMetrics(sessionId, metricsInput, { actor = {} } = {}) {
    const sId = normalizeText(sessionId);
    if (!state.sessions[sId]) {
      const e = new Error(`session ${sId} hittades inte`);
      e.statusCode = 404;
      throw e;
    }
    const created = [];
    for (const raw of asArray(metricsInput)) {
      const metric = normalizeMetric({ ...raw, sessionId: sId });
      state.metrics[metric.id] = metric;
      created.push({ ...metric });
    }
    if (created.length) {
      appendTimeline(state, {
        type: 'scalp_metrics_added',
        patientId: state.sessions[sId].patientId,
        sessionId: sId,
        count: created.length,
      });
      state.audit.push(
        logAudit(
          auditLog,
          'scalp.metrics.add',
          { sessionId: sId, count: created.length },
          actor,
          'ok'
        )
      );
    }
    await save();
    return created;
  }

  async function verifySession(
    sessionId,
    { verifiedBy = null, clinicianNotes = null, actor = {} } = {}
  ) {
    const sId = normalizeText(sessionId);
    const existing = state.sessions[sId];
    if (!existing) {
      const e = new Error(`session ${sId} hittades inte`);
      e.statusCode = 404;
      throw e;
    }
    const ts = nowIso();
    const merged = normalizeSession(
      {
        ...existing,
        status: 'verified',
        verifiedBy: verifiedBy || actor.userId || null,
        verifiedAt: ts,
        clinicianNotes: clinicianNotes ?? existing.clinicianNotes,
      },
      existing
    );
    state.sessions[sId] = merged;
    appendTimeline(state, {
      type: 'scalp_analysis_verified',
      patientId: merged.patientId,
      sessionId: sId,
      verifiedBy: merged.verifiedBy,
    });
    state.audit.push(logAudit(auditLog, 'scalp.session.verify', { sessionId: sId }, actor, 'ok'));
    await save();
    return { ...merged };
  }

  async function createComparison(input, { actor = {} } = {}) {
    const comparison = normalizeComparison(input);
    if (!comparison.patientId || !comparison.baselineSessionId || !comparison.comparisonSessionId) {
      const e = new Error('patientId, baselineSessionId och comparisonSessionId krävs');
      e.statusCode = 400;
      throw e;
    }
    if (!comparison.metricChanges) {
      comparison.metricChanges = computeMetricChanges(
        comparison.baselineSessionId,
        comparison.comparisonSessionId
      );
    }
    state.comparisons[comparison.id] = comparison;
    appendTimeline(state, {
      type: 'scalp_comparison_created',
      patientId: comparison.patientId,
      comparisonId: comparison.id,
      baselineSessionId: comparison.baselineSessionId,
      comparisonSessionId: comparison.comparisonSessionId,
    });
    state.audit.push(
      logAudit(auditLog, 'scalp.comparison.create', { comparisonId: comparison.id }, actor, 'ok')
    );
    await save();
    return { ...comparison };
  }

  function getSessionBundle(sessionId) {
    const session = getSession(sessionId);
    if (!session) return null;
    return {
      session,
      images: listImagesForSession(sessionId),
      metrics: listMetricsForSession(sessionId),
      protocol: checkCaptureProtocolCompleteness(sessionId),
    };
  }

  function getPatientBundle(patientId, { tenantId = null } = {}) {
    const sessions = listSessionsForPatient(patientId, { tenantId });
    return {
      patientId,
      sessions,
      comparisons: listComparisonsForPatient(patientId),
      timeline: listTimelineForPatient(patientId),
      baselineSession:
        sessions.find((s) => s.sessionType === 'consultation' && s.status === 'verified') ||
        sessions.find((s) => s.sessionType === 'consultation') ||
        null,
    };
  }

  return {
    VALID_SOURCES,
    VALID_SESSION_TYPES,
    VALID_SESSION_STATUSES,
    VALID_MAGNIFICATIONS,
    VALID_SPECTRUMS,
    VALID_METRIC_SOURCES,
    BASELINE_ZONES,
    DONOR_ZONES,
    TIMELINE_EVENT_TYPES,
    getSession,
    listSessionsForPatient,
    listImagesForSession,
    listMetricsForSession,
    listComparisonsForPatient,
    listTimelineForPatient,
    checkCaptureProtocolCompleteness,
    computeMetricChanges,
    createSession,
    updateSession,
    attachReport,
    addImage,
    addMetrics,
    verifySession,
    createComparison,
    getSessionBundle,
    getPatientBundle,
  };
}

module.exports = {
  createCcoScalpAnalysisStore,
  VALID_SOURCES,
  VALID_SESSION_TYPES,
  VALID_SESSION_STATUSES,
  VALID_MAGNIFICATIONS,
  VALID_SPECTRUMS,
  BASELINE_ZONES,
  TIMELINE_EVENT_TYPES,
};
