'use strict';

/**
 * Ledningssystem (Quality Management System) — Store.
 *
 * ISO 9001 / ISO 13485-inspirerat kvalitetsledningssystem för klinik.
 *
 * Moduler:
 * 1. Checklistor — anpassningsbara inspektionschecklistor med steg
 * 2. Inspektioner — schemalagda eller ad-hoc granskningar
 * 3. Avvikelser — dokumentera händelser som avviker från rutin
 * 4. Korrigerande åtgärder (CAPA) — plan + uppföljning + stängning
 * 5. Dokumenthantering — processdokument med versionshantering
 * 6. Processer/Rutiner — standardrutiner (SOP) med ansvarig + giltighet
 *
 * Alla poster har audit trail (createdBy, updatedBy, timestamps).
 * RBAC: OWNER kan allt, STAFF kan utföra inspektioner + rapportera avvikelser.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

// --- Enums ---

const CHECKLIST_STATUSES = Object.freeze(['draft', 'active', 'archived']);
const INSPECTION_STATUSES = Object.freeze([
  'scheduled',
  'in_progress',
  'completed',
  'overdue',
  'cancelled',
]);
const DEVIATION_STATUSES = Object.freeze([
  'reported',
  'under_investigation',
  'action_planned',
  'action_taken',
  'closed',
  'reopened',
]);
const DEVIATION_SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
const CAPA_STATUSES = Object.freeze([
  'planned',
  'in_progress',
  'verification',
  'closed',
  'overdue',
]);
const CAPA_TYPES = Object.freeze(['corrective', 'preventive', 'improvement']);
const DOCUMENT_STATUSES = Object.freeze(['draft', 'review', 'approved', 'superseded', 'archived']);
const PROCESS_STATUSES = Object.freeze(['active', 'under_review', 'archived']);

// --- Store factory ---

function createQmsStore({ filePath }) {
  let state = {
    checklists: [],
    inspections: [],
    deviations: [],
    capas: [],
    documents: [],
    processes: [],
  };

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
    if (!state.checklists) state.checklists = [];
    if (!state.inspections) state.inspections = [];
    if (!state.deviations) state.deviations = [];
    if (!state.capas) state.capas = [];
    if (!state.documents) state.documents = [];
    if (!state.processes) state.processes = [];
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  // ─────────────────────────────────────────────
  // 1. CHECKLISTOR
  // ─────────────────────────────────────────────

  function createChecklist({
    tenantId,
    title,
    description,
    category,
    steps = [],
    frequency,
    responsibleRole,
    createdBy,
  }) {
    const checklist = {
      checklistId: crypto.randomUUID(),
      tenantId: normalizeText(tenantId),
      title: normalizeText(title) || 'Ny checklista',
      description: normalizeText(description),
      category: normalizeText(category) || 'general',
      status: 'active',
      frequency: normalizeText(frequency) || 'daily',
      responsibleRole: normalizeText(responsibleRole) || 'STAFF',
      steps: steps.map((step, idx) => ({
        stepId: `step-${idx + 1}`,
        order: idx + 1,
        title: normalizeText(step.title) || `Steg ${idx + 1}`,
        description: normalizeText(step.description),
        required: step.required !== false,
        type: step.type || 'checkbox',
      })),
      version: 1,
      createdBy: normalizeText(createdBy),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.checklists.push(checklist);
    return checklist;
  }

  function getChecklist(checklistId) {
    return state.checklists.find((c) => c.checklistId === checklistId) || null;
  }

  function listChecklists({ tenantId, status, category } = {}) {
    return state.checklists.filter((c) => {
      if (tenantId && c.tenantId !== normalizeText(tenantId)) return false;
      if (status && c.status !== status) return false;
      if (category && c.category !== category) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // 2. INSPEKTIONER
  // ─────────────────────────────────────────────

  function createInspection({
    tenantId,
    checklistId,
    scheduledDate,
    assignedTo,
    createdBy,
    notes,
  }) {
    const checklist = getChecklist(checklistId);
    const inspection = {
      inspectionId: crypto.randomUUID(),
      tenantId: normalizeText(tenantId),
      checklistId: normalizeText(checklistId),
      checklistTitle: checklist?.title || '',
      status: 'scheduled',
      scheduledDate: normalizeText(scheduledDate) || nowIso().slice(0, 10),
      completedDate: null,
      assignedTo: normalizeText(assignedTo),
      createdBy: normalizeText(createdBy),
      notes: normalizeText(notes),
      results: (checklist?.steps || []).map((step) => ({
        stepId: step.stepId,
        title: step.title,
        passed: null,
        comment: '',
        photoPath: null,
      })),
      overallResult: null,
      deviationIds: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.inspections.push(inspection);
    return inspection;
  }

  function completeInspection(inspectionId, { results = [], overallResult, completedBy, notes }) {
    const inspection = state.inspections.find((i) => i.inspectionId === inspectionId);
    if (!inspection) return null;

    for (const result of results) {
      const existing = inspection.results.find((r) => r.stepId === result.stepId);
      if (existing) {
        existing.passed = result.passed;
        existing.comment = normalizeText(result.comment) || existing.comment;
        existing.photoPath = normalizeText(result.photoPath) || existing.photoPath;
      }
    }

    inspection.status = 'completed';
    inspection.completedDate = nowIso();
    inspection.overallResult =
      normalizeText(overallResult) ||
      (inspection.results.every((r) => r.passed === true) ? 'pass' : 'fail');
    inspection.notes = normalizeText(notes) || inspection.notes;
    inspection.updatedAt = nowIso();
    return inspection;
  }

  function listInspections({ tenantId, status, checklistId, from, to } = {}) {
    return state.inspections.filter((i) => {
      if (tenantId && i.tenantId !== normalizeText(tenantId)) return false;
      if (status && i.status !== status) return false;
      if (checklistId && i.checklistId !== checklistId) return false;
      if (from && i.scheduledDate < from) return false;
      if (to && i.scheduledDate > to) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // 3. AVVIKELSER
  // ─────────────────────────────────────────────

  function reportDeviation({
    tenantId,
    title,
    description,
    severity,
    category,
    reportedBy,
    inspectionId,
    patientId,
    affectedArea,
  }) {
    const deviation = {
      deviationId: crypto.randomUUID(),
      tenantId: normalizeText(tenantId),
      referenceNumber: `AVV-${Date.now().toString(36).toUpperCase()}`,
      title: normalizeText(title) || 'Avvikelse',
      description: normalizeText(description),
      severity: DEVIATION_SEVERITIES.includes(severity) ? severity : 'medium',
      category: normalizeText(category) || 'process',
      status: 'reported',
      reportedBy: normalizeText(reportedBy),
      reportedAt: nowIso(),
      inspectionId: normalizeText(inspectionId) || null,
      patientId: normalizeText(patientId) || null,
      affectedArea: normalizeText(affectedArea),
      rootCause: null,
      immediateAction: null,
      capaIds: [],
      closedAt: null,
      closedBy: null,
      timeline: [{ action: 'reported', by: normalizeText(reportedBy), at: nowIso() }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.deviations.push(deviation);
    return deviation;
  }

  function updateDeviation(deviationId, { status, rootCause, immediateAction, updatedBy }) {
    const deviation = state.deviations.find((d) => d.deviationId === deviationId);
    if (!deviation) return null;
    if (status && DEVIATION_STATUSES.includes(status)) {
      deviation.status = status;
      deviation.timeline.push({
        action: `status_${status}`,
        by: normalizeText(updatedBy),
        at: nowIso(),
      });
    }
    if (rootCause) deviation.rootCause = normalizeText(rootCause);
    if (immediateAction) deviation.immediateAction = normalizeText(immediateAction);
    if (status === 'closed') {
      deviation.closedAt = nowIso();
      deviation.closedBy = normalizeText(updatedBy);
    }
    deviation.updatedAt = nowIso();
    return deviation;
  }

  function listDeviations({ tenantId, status, severity, from, to } = {}) {
    return state.deviations.filter((d) => {
      if (tenantId && d.tenantId !== normalizeText(tenantId)) return false;
      if (status && d.status !== status) return false;
      if (severity && d.severity !== severity) return false;
      if (from && d.reportedAt < from) return false;
      if (to && d.reportedAt > to) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // 4. KORRIGERANDE ÅTGÄRDER (CAPA)
  // ─────────────────────────────────────────────

  function createCapa({
    tenantId,
    deviationId,
    type,
    title,
    description,
    assignedTo,
    dueDate,
    createdBy,
  }) {
    const capa = {
      capaId: crypto.randomUUID(),
      tenantId: normalizeText(tenantId),
      referenceNumber: `CAPA-${Date.now().toString(36).toUpperCase()}`,
      deviationId: normalizeText(deviationId) || null,
      type: CAPA_TYPES.includes(type) ? type : 'corrective',
      title: normalizeText(title) || 'Korrigerande åtgärd',
      description: normalizeText(description),
      status: 'planned',
      assignedTo: normalizeText(assignedTo),
      dueDate: normalizeText(dueDate),
      completedDate: null,
      verifiedDate: null,
      verifiedBy: null,
      effectivenessCheck: null,
      createdBy: normalizeText(createdBy),
      timeline: [{ action: 'created', by: normalizeText(createdBy), at: nowIso() }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.capas.push(capa);

    if (deviationId) {
      const deviation = state.deviations.find((d) => d.deviationId === deviationId);
      if (deviation) {
        deviation.capaIds.push(capa.capaId);
        deviation.status = 'action_planned';
        deviation.updatedAt = nowIso();
      }
    }
    return capa;
  }

  function updateCapa(
    capaId,
    { status, completedDate, verifiedBy, effectivenessCheck, updatedBy }
  ) {
    const capa = state.capas.find((c) => c.capaId === capaId);
    if (!capa) return null;
    if (status && CAPA_STATUSES.includes(status)) {
      capa.status = status;
      capa.timeline.push({
        action: `status_${status}`,
        by: normalizeText(updatedBy),
        at: nowIso(),
      });
    }
    if (status === 'closed' || completedDate)
      capa.completedDate = normalizeText(completedDate) || nowIso();
    if (status === 'verification' || verifiedBy) {
      capa.verifiedBy = normalizeText(verifiedBy);
      capa.verifiedDate = nowIso();
    }
    if (effectivenessCheck) capa.effectivenessCheck = normalizeText(effectivenessCheck);
    capa.updatedAt = nowIso();
    return capa;
  }

  function listCapas({ tenantId, status, deviationId } = {}) {
    return state.capas.filter((c) => {
      if (tenantId && c.tenantId !== normalizeText(tenantId)) return false;
      if (status && c.status !== status) return false;
      if (deviationId && c.deviationId !== deviationId) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // 5. DOKUMENTHANTERING
  // ─────────────────────────────────────────────

  function createDocument({ tenantId, title, category, content, version, approvedBy, createdBy }) {
    const doc = {
      documentId: crypto.randomUUID(),
      tenantId: normalizeText(tenantId),
      referenceNumber: `DOC-${String(state.documents.length + 1).padStart(4, '0')}`,
      title: normalizeText(title) || 'Nytt dokument',
      category: normalizeText(category) || 'procedure',
      content: normalizeText(content),
      version: Number(version) || 1,
      status: approvedBy ? 'approved' : 'draft',
      approvedBy: normalizeText(approvedBy) || null,
      approvedAt: approvedBy ? nowIso() : null,
      reviewDate: null,
      nextReviewDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      createdBy: normalizeText(createdBy),
      history: [{ version: 1, action: 'created', by: normalizeText(createdBy), at: nowIso() }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.documents.push(doc);
    return doc;
  }

  function updateDocument(documentId, { title, content, status, approvedBy, updatedBy }) {
    const doc = state.documents.find((d) => d.documentId === documentId);
    if (!doc) return null;
    if (title) doc.title = normalizeText(title);
    if (content) {
      doc.content = normalizeText(content);
      doc.version += 1;
    }
    if (status && DOCUMENT_STATUSES.includes(status)) doc.status = status;
    if (approvedBy) {
      doc.approvedBy = normalizeText(approvedBy);
      doc.approvedAt = nowIso();
      doc.status = 'approved';
    }
    doc.history.push({
      version: doc.version,
      action: status || 'updated',
      by: normalizeText(updatedBy),
      at: nowIso(),
    });
    doc.updatedAt = nowIso();
    return doc;
  }

  function listDocuments({ tenantId, status, category } = {}) {
    return state.documents.filter((d) => {
      if (tenantId && d.tenantId !== normalizeText(tenantId)) return false;
      if (status && d.status !== status) return false;
      if (category && d.category !== category) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // 6. PROCESSER / RUTINER (SOP)
  // ─────────────────────────────────────────────

  function createProcess({ tenantId, title, description, category, owner, steps = [], createdBy }) {
    const process = {
      processId: crypto.randomUUID(),
      tenantId: normalizeText(tenantId),
      referenceNumber: `SOP-${String(state.processes.length + 1).padStart(3, '0')}`,
      title: normalizeText(title) || 'Ny rutin',
      description: normalizeText(description),
      category: normalizeText(category) || 'clinical',
      owner: normalizeText(owner),
      status: 'active',
      steps: steps.map((s, idx) => ({
        order: idx + 1,
        title: normalizeText(s.title) || `Steg ${idx + 1}`,
        description: normalizeText(s.description),
        responsibleRole: normalizeText(s.responsibleRole) || 'STAFF',
      })),
      version: 1,
      validFrom: nowIso().slice(0, 10),
      validTo: null,
      lastReviewedAt: null,
      nextReviewDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      linkedChecklistIds: [],
      linkedDocumentIds: [],
      createdBy: normalizeText(createdBy),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.processes.push(process);
    return process;
  }

  function listProcesses({ tenantId, status, category } = {}) {
    return state.processes.filter((p) => {
      if (tenantId && p.tenantId !== normalizeText(tenantId)) return false;
      if (status && p.status !== status) return false;
      if (category && p.category !== category) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────
  // DASHBOARD / STATS
  // ─────────────────────────────────────────────

  function getDashboard(tenantId) {
    const tid = normalizeText(tenantId);
    const filter = (arr) => (tid ? arr.filter((i) => i.tenantId === tid) : arr);

    const inspections = filter(state.inspections);
    const deviations = filter(state.deviations);
    const capas = filter(state.capas);
    const documents = filter(state.documents);

    const openDeviations = deviations.filter((d) => d.status !== 'closed');
    const overdueCapas = capas.filter(
      (c) => c.status !== 'closed' && c.dueDate && c.dueDate < nowIso().slice(0, 10)
    );
    const overdueInspections = inspections.filter(
      (i) => i.status === 'scheduled' && i.scheduledDate < nowIso().slice(0, 10)
    );
    const docsNeedingReview = documents.filter(
      (d) => d.status === 'approved' && d.nextReviewDate && d.nextReviewDate < nowIso().slice(0, 10)
    );

    return {
      overview: {
        totalChecklists: filter(state.checklists).filter((c) => c.status === 'active').length,
        totalProcesses: filter(state.processes).filter((p) => p.status === 'active').length,
        totalDocuments: documents.filter((d) => d.status === 'approved').length,
      },
      inspections: {
        completedThisMonth: inspections.filter(
          (i) => i.status === 'completed' && i.completedDate?.startsWith(nowIso().slice(0, 7))
        ).length,
        scheduled: inspections.filter((i) => i.status === 'scheduled').length,
        overdue: overdueInspections.length,
        passRate:
          (inspections.filter((i) => i.overallResult === 'pass').length /
            Math.max(1, inspections.filter((i) => i.status === 'completed').length)) *
          100,
      },
      deviations: {
        open: openDeviations.length,
        critical: openDeviations.filter((d) => d.severity === 'critical').length,
        high: openDeviations.filter((d) => d.severity === 'high').length,
        closedThisMonth: deviations.filter((d) => d.closedAt?.startsWith(nowIso().slice(0, 7)))
          .length,
        averageResolutionDays: calculateAvgResolution(deviations),
      },
      capas: {
        open: capas.filter((c) => c.status !== 'closed').length,
        overdue: overdueCapas.length,
        inVerification: capas.filter((c) => c.status === 'verification').length,
      },
      alerts: buildAlerts({ overdueInspections, openDeviations, overdueCapas, docsNeedingReview }),
      generatedAt: nowIso(),
    };
  }

  function calculateAvgResolution(deviations) {
    const closed = deviations.filter((d) => d.closedAt && d.reportedAt);
    if (closed.length === 0) return 0;
    const totalDays = closed.reduce((sum, d) => {
      return sum + (new Date(d.closedAt) - new Date(d.reportedAt)) / 86400000;
    }, 0);
    return Math.round(totalDays / closed.length);
  }

  function buildAlerts({ overdueInspections, openDeviations, overdueCapas, docsNeedingReview }) {
    const alerts = [];
    if (overdueInspections.length > 0) {
      alerts.push({
        level: 'warning',
        type: 'overdue_inspection',
        message: `${overdueInspections.length} inspektion(er) försenade — genomför omedelbart.`,
        count: overdueInspections.length,
      });
    }
    if (openDeviations.filter((d) => d.severity === 'critical').length > 0) {
      alerts.push({
        level: 'critical',
        type: 'critical_deviation',
        message: `${openDeviations.filter((d) => d.severity === 'critical').length} kritisk(a) avvikelse(r) öppna — kräver omedelbar åtgärd.`,
        count: openDeviations.filter((d) => d.severity === 'critical').length,
      });
    }
    if (overdueCapas.length > 0) {
      alerts.push({
        level: 'warning',
        type: 'overdue_capa',
        message: `${overdueCapas.length} korrigerande åtgärd(er) försenade.`,
        count: overdueCapas.length,
      });
    }
    if (docsNeedingReview.length > 0) {
      alerts.push({
        level: 'info',
        type: 'document_review_due',
        message: `${docsNeedingReview.length} dokument behöver granskas (utgånget granskningsdatum).`,
        count: docsNeedingReview.length,
      });
    }
    return alerts;
  }

  return {
    load,
    persist,
    createChecklist,
    getChecklist,
    listChecklists,
    createInspection,
    completeInspection,
    listInspections,
    reportDeviation,
    updateDeviation,
    listDeviations,
    createCapa,
    updateCapa,
    listCapas,
    createDocument,
    updateDocument,
    listDocuments,
    createProcess,
    listProcesses,
    getDashboard,
    CHECKLIST_STATUSES,
    INSPECTION_STATUSES,
    DEVIATION_STATUSES,
    DEVIATION_SEVERITIES,
    CAPA_STATUSES,
    CAPA_TYPES,
    DOCUMENT_STATUSES,
    PROCESS_STATUSES,
  };
}

module.exports = { createQmsStore };
