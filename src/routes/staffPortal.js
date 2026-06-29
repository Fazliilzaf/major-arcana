'use strict';

/**
 * staffPortal.js — Personalportal för Hair TP Clinic
 *
 * Serverar prototypvyn och API för:
 *   - Rollbaserade dashboards (sjuksköterska, läkare, admin/owner)
 *   - Ordinationsgranskningskö (human-in-the-loop, aldrig AI-beslut)
 *   - Konversationer/kundärenden (read-only, filterade per personal)
 *   - Kundfiler/bilder (read-only, RBAC photo.read)
 *   - Delegeringsdokument och QMS-handbok (statisk dokumentkatalog)
 *   - Audit-trail (read-only för owner/revisor)
 *
 * Säkerhetsregler (inbyggda, oföränderliga):
 *   - Systemet skapar ALDRIG ordination.approved automatiskt
 *   - All klinisk granskning kräver explicit POST + RBAC-permission
 *   - Varje statusändring → audit-logg med actor + signatur + tidsstämpel
 *   - Bilder/konversationer visas bara för behörig personal (RBAC)
 *   - Inga medicinska beslut, inga dokumentändringar via detta API
 */

const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { requirePermission, requireAnyRole } = require('../security/ccoRbac');
const { CHECKLIST_TEMPLATES, PROCESS_TEMPLATES } = require('../qms/qmsTemplates');

/**
 * createStaffPortalRouter — Factory med store-injektion.
 *
 * @param {object} opts
 * @param {object}   opts.config               - Appkonfiguration (stateRoot, journalPhotosDir, m.m.)
 * @param {function} opts.requireAuth           - Auth-middleware (valfri)
 * @param {object}   opts.authStore             - Auth store för personalregister (valfri)
 * @param {object}   opts.ccoAuditLog           - ccoAuditLog-instans (valfri)
 * @param {object}   opts.bookingCaseStore      - ccoBookingCaseStore (valfri)
 * @param {object}   opts.notificationFeedStore - ccoNotificationFeedStore (valfri)
 * @param {object}   opts.qmsStore              - QMS-store för OLS/handbok/avvikelser (valfri)
 * @param {object}   opts.journalPhotoStore     - ccoJournalPhotoStore (valfri)
 * @param {object}   opts.mailIngestionStore    - ccoMailIngestionStore (valfri)
 * @param {function} opts.getNotificationFeedStore - Lazy-getter: () => notificationFeedStore | null
 * @param {function} opts.getCommDraftStore     - Lazy-getter: () => commDraftStore | null
 * @param {function} opts.getSendActionStore    - Lazy-getter: () => sendActionStore | null
 */
function createStaffPortalRouter({
  config = {},
  requireAuth = null,
  authStore = null,
  ccoAuditLog = null,
  bookingCaseStore = null,
  notificationFeedStore = null,
  qmsStore = null,
  journalPhotoStore: _journalPhotoStore = null,
  mailIngestionStore = null,
  getNotificationFeedStore = null,
  getCommDraftStore = null,
  getSendActionStore = null,
} = {}) {
  const router = express.Router();

  // Conversation thread store — lazy-initieras vid första anrop
  let _threadStorePromise = null;

  async function getThreadStore() {
    if (!_threadStorePromise) {
      const { createCcoConversationThreadStore } = require('../ops/ccoConversationThreadStore');
      const commDraftStore = getCommDraftStore?.() ?? null;
      const sendActionStore = getSendActionStore?.() ?? null;
      const filePath =
        config.ccoConversationThreadStateStorePath ||
        config.ccoConversationStateStorePath ||
        `${config.stateRoot || './data'}/cco-conversation-thread-state.json`;

      _threadStorePromise = createCcoConversationThreadStore({
        filePath,
        mailIngestionStore: mailIngestionStore || null,
        commDraftStore: commDraftStore || null,
        sendActionsList: sendActionStore?.listSends
          ? (customerId) => sendActionStore.listSends({ customerId, limit: 100 })
          : null,
        auditLog: ccoAuditLog,
      });
    }
    return _threadStorePromise;
  }

  function getActor(req) {
    return {
      role: req.cco?.role ?? req.auth?.role ?? null,
      userId: req.auth?.userId ?? req.session?.userId ?? null,
    };
  }

  function handleWriteError(res, err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Kunde inte spara.' });
  }

  async function listActiveStaffMembers(tenantId) {
    if (!authStore?.listTenantMembers || !tenantId) return [];
    const members = await authStore.listTenantMembers(tenantId);
    return (Array.isArray(members) ? members : [])
      .filter((item) => {
        const membership = item?.membership || {};
        const role = String(membership.role || '').toUpperCase();
        const status = String(membership.status || '').toLowerCase();
        return status === 'active' && ['STAFF', 'OWNER'].includes(role);
      })
      .map((item) => {
        const user = item.user || {};
        const membership = item.membership || {};
        return {
          userId: user.id || membership.userId || null,
          email: user.email || null,
          role: membership.role || null,
          status: membership.status || null,
          membershipId: membership.id || null,
          label: user.email || user.id || membership.userId || 'Personal',
        };
      })
      .filter((item) => item.userId);
  }

  async function listPhotoMetadata({ tenantId = 'hairtpclinic', patientId }) {
    const cleanPatientId = String(patientId || '').trim();
    if (!cleanPatientId) return [];

    const baseDir = config.journalPhotosDir || path.join(__dirname, '../../data/journal-photos');
    const patientDir = path.join(baseDir, tenantId, cleanPatientId);

    try {
      const files = await fs.readdir(patientDir);
      return files
        .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.endsWith('.annotated.png'))
        .map((f) => {
          const ext = path.extname(f).slice(1).toLowerCase();
          const photoId = path.basename(f, path.extname(f));
          return {
            photoId,
            ext,
            mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
            fileName: f,
          };
        });
    } catch (dirErr) {
      if (dirErr.code !== 'ENOENT') throw dirErr;
      return [];
    }
  }

  async function buildCustomerWorkItem(caseRecord, { tenantId }) {
    const customerId = String(
      caseRecord.customerId || caseRecord.patientId || caseRecord.customerEmail || ''
    ).trim();
    const patientId = String(caseRecord.patientId || caseRecord.customerId || '').trim();

    let threads = [];
    let threadSummary = null;
    if (customerId) {
      try {
        const store = await getThreadStore();
        const built = await store.buildThreadsForCustomer(customerId, { tenantId });
        threads = Array.isArray(built?.threads) ? built.threads : [];
        threadSummary = built?.summary || null;
      } catch (_err) {
        threads = [];
        threadSummary = null;
      }
    }

    const photos = patientId ? await listPhotoMetadata({ tenantId, patientId }) : [];
    const openThreads = threads.filter((thread) => {
      const state = String(
        thread.needsReplyStatus || thread.status || thread.state || thread.queueState || ''
      ).toLowerCase();
      return state.includes('need') || state.includes('open') || state.includes('pending');
    });

    return {
      case: caseRecord,
      customerId: customerId || null,
      patientId: patientId || null,
      title:
        caseRecord.customerName ||
        caseRecord.patientName ||
        caseRecord.customerEmail ||
        caseRecord.id ||
        'Kund',
      threads: {
        count: threads.length,
        needsReply: openThreads.length,
        summary: threadSummary,
      },
      photos: {
        count: photos.length,
        latest: photos.slice(0, 4),
      },
      links: buildStaffPortalLinks({
        caseId: caseRecord.id,
        customerId,
        patientId,
        tenantId,
      }),
      signals: {
        hasCustomerCard: Boolean(patientId || customerId),
        hasMessages: threads.length > 0,
        hasPhotos: photos.length > 0,
        needsReply: openThreads.length > 0,
      },
    };
  }

  function buildStaffPortalLinks({ caseId, customerId, patientId, tenantId } = {}) {
    const pid = String(patientId || customerId || '').trim();
    const cid = String(customerId || patientId || '').trim();
    const cleanCaseId = String(caseId || '').trim();
    const customerParams = new URLSearchParams({ view: 'customers' });
    if (pid) customerParams.set('patientId', pid);
    const workspaceParams = new URLSearchParams({ view: 'customers', workspace: '1' });
    if (pid) workspaceParams.set('patientId', pid);
    const nurseTaskUrl = buildStaffPortalUrl({
      role: 'nurse',
      panel: customerId || patientId ? 'customers' : 'tasks',
    });
    const doctorReviewUrl = cleanCaseId
      ? buildStaffPortalUrl({
          role: 'doctor',
          panel: 'ordination',
          hash: `ordination-${cleanCaseId}`,
        })
      : buildStaffPortalUrl({ role: 'doctor', panel: 'ordination' });
    const adminCaseUrl = buildStaffPortalUrl({ role: 'admin', panel: 'all-cases' });
    const qmsUrl = buildStaffPortalUrl({ panel: 'qms' });
    return {
      customerCard: pid ? `/major-arcana-preview/?${customerParams.toString()}` : null,
      workspace: pid ? `/major-arcana-preview/?${workspaceParams.toString()}` : null,
      threads: cid ? `/api/v1/staff/customer-threads/${encodeURIComponent(cid)}` : null,
      photos: pid ? `/api/v1/staff/customer-photos/${encodeURIComponent(pid)}` : null,
      staffTask: nurseTaskUrl,
      doctorReview: doctorReviewUrl,
      adminCase: adminCaseUrl,
      ordination: doctorReviewUrl,
      qms: qmsUrl,
      audit: cleanCaseId
        ? `/api/v1/staff/audit?action=${encodeURIComponent('staff_portal')}&caseId=${encodeURIComponent(cleanCaseId)}`
        : null,
      tenantId: tenantId || null,
    };
  }

  function buildStaffPortalUrl({ role = '', panel = '', hash = '' } = {}) {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (panel) params.set('panel', panel);
    const query = params.toString();
    const fragment = hash ? `#${encodeURIComponent(hash)}` : '';
    return `/staff-portal${query ? `?${query}` : ''}${fragment}`;
  }

  function isTodayIso(value) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }

  function isTreatmentRequiringOrdination(caseRecord = {}) {
    const haystack = [
      caseRecord.serviceLabel,
      caseRecord.serviceId,
      caseRecord.treatmentType,
      caseRecord.treatment,
      caseRecord.procedure,
      caseRecord.encounterType,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return /tp|transplant|hårtransplant|dhi|fue|lokalbedöv/.test(haystack);
  }

  function buildTreatmentPlanReadout(caseRecord = {}) {
    const plan =
      caseRecord.treatmentPlan && typeof caseRecord.treatmentPlan === 'object'
        ? caseRecord.treatmentPlan
        : {};
    const treatment =
      caseRecord.serviceLabel ||
      caseRecord.treatmentType ||
      caseRecord.treatment ||
      caseRecord.procedure ||
      'Behandling ej angiven';
    const method =
      plan.method ||
      caseRecord.method ||
      caseRecord.technique ||
      String(treatment).match(/\b(DHI|FUE|PRP|PRF)\b/i)?.[1] ||
      '';
    const graftsTotal =
      plan.graftsTotal ||
      caseRecord.graftsTotal ||
      caseRecord.totalGrafts ||
      caseRecord.grafts ||
      caseRecord.graftCount ||
      '';
    const zones = Array.isArray(plan.zones) ? plan.zones : [];
    return {
      treatment,
      method: method || null,
      graftsTotal: graftsTotal || null,
      price: plan.price || caseRecord.price || caseRecord.totalPrice || null,
      anesthesia:
        plan.anesthesia ||
        caseRecord.anesthesia ||
        (isTreatmentRequiringOrdination(caseRecord)
          ? 'Lokalbedövning enligt ordinationsmall'
          : null),
      planningNote: plan.planningNote || caseRecord.planningNote || caseRecord.notes || '',
      generalOrdinationRef: plan.generalOrdinationRef || 'ordination_tp',
      individualOrdinationNote: plan.individualOrdinationNote || '',
      zones,
      documents: Array.isArray(plan.documents) ? plan.documents : [],
    };
  }

  function buildReadinessChecklist(caseRecord = {}) {
    const checklist = caseRecord.handoffChecklist || {};
    const review = caseRecord.ordinationReview || {};
    return [
      {
        key: 'journalReady',
        label: 'Journal / behandlingsplan kontrollerad',
        done: checklist.journalReady === true,
      },
      {
        key: 'consentSigned',
        label: 'Samtycken och patientinformation signerade',
        done: checklist.consentSigned === true,
      },
      {
        key: 'paymentSettled',
        label: 'Betalning/administrativ status klar',
        done: checklist.paymentSettled === true,
      },
      {
        key: 'encounterLinked',
        label: 'Bokning och patientkort länkade',
        done: checklist.encounterLinked === true,
      },
      {
        key: 'ordinationDecision',
        label: 'Läkarbeslut finns',
        done: ['approved', 'rejected'].includes(String(review.status || '').toLowerCase()),
      },
    ];
  }

  function buildOrdinationDocuments(caseRecord = {}) {
    const plan = buildTreatmentPlanReadout(caseRecord);
    const docs = [
      { id: 'ordination_tp', name: 'Ordinationsmall · Hårtransplantation', status: 'referens' },
      { id: 'haelso_tp_sve', name: 'Hälsodeklaration · Hair TP Clinic', status: 'kontrollera' },
      { id: 'friskfoers_tp', name: 'Friskförsäkran · TP', status: 'operationsdag' },
      { id: 'behandlingsplan_staff', name: 'Behandlingsplan / offert', status: 'underlag' },
    ];
    const extraDocs = Array.isArray(plan.documents) ? plan.documents : [];
    const byId = new Map();
    for (const doc of [...docs, ...extraDocs]) {
      const id = String(doc.id || doc.registryId || doc.documentId || doc.name || '').trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name: doc.name || doc.title || doc.label || id,
        status: doc.status || doc.state || 'underlag',
      });
    }
    return [...byId.values()];
  }

  function buildOrdinationReviewReadout(caseRecord = {}) {
    const treatmentPlan = buildTreatmentPlanReadout(caseRecord);
    const readiness = buildReadinessChecklist(caseRecord);
    const missing = readiness.filter((item) => !item.done).map((item) => item.key);
    return {
      treatmentPlan,
      readiness,
      missing,
      documents: buildOrdinationDocuments(caseRecord),
      patient: {
        patientId: caseRecord.patientId || null,
        customerId: caseRecord.customerId || null,
        name: caseRecord.customerName || caseRecord.patientName || caseRecord.customerEmail || null,
      },
      safety: {
        hitl: true,
        message:
          'Läkare måste fatta beslut manuellt. Systemet kan aldrig auto-godkänna ordination.',
      },
    };
  }

  function loadDocumentCatalog() {
    try {
      const catalog = require('../ops/hairtp-document-types.catalog.json');
      return Array.isArray(catalog) ? catalog : catalog.types || [];
    } catch {
      return [];
    }
  }

  function buildStaffHandbookDocuments(catalog = []) {
    const staffDocs = catalog.filter((doc) => {
      const haystack = [
        doc.id,
        doc.registryId,
        doc.name,
        doc.category,
        doc.filler,
        ...(Array.isArray(doc.tags) ? doc.tags : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        doc.filler === 'staff' ||
        doc.category === 'internal' ||
        /deleg|ordination|journal|id-verifiering|anteckning|handbok|intern|staff|personal/.test(
          haystack
        )
      );
    });

    return staffDocs.slice(0, 24).map((doc) => ({
      id: doc.id || doc.registryId || doc.name,
      name: doc.name || doc.title || doc.id || 'Dokument',
      category: doc.category || 'staff',
      filler: doc.filler || null,
      source: doc.contentSource || doc.contentSrc || doc.source || null,
      flags: Array.isArray(doc.legalFlags) ? doc.legalFlags : [],
      canonicalSource: doc.canonicalSource || doc.canonicalUrl || null,
    }));
  }

  function buildQmsHandbookReadout({ tenantId = 'hairtpclinic' } = {}) {
    const catalog = loadDocumentCatalog();
    const dashboard = qmsStore?.getDashboard ? qmsStore.getDashboard(tenantId) : null;
    const checklists =
      qmsStore?.listChecklists?.({ tenantId, status: 'active' }) || CHECKLIST_TEMPLATES;
    const processes =
      qmsStore?.listProcesses?.({ tenantId, status: 'active' }) || PROCESS_TEMPLATES;
    const deviations = qmsStore?.listDeviations?.({ tenantId }) || [];
    const capas = qmsStore?.listCapas?.({ tenantId }) || [];
    const qmsDocs =
      qmsStore
        ?.listDocuments?.({ tenantId })
        ?.filter((doc) =>
          ['approved', 'review'].includes(String(doc.status || '').toLowerCase())
        ) || [];
    const openDeviations = deviations.filter((item) => item.status !== 'closed');
    const openCapas = capas.filter((item) => item.status !== 'closed');

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      mode: qmsStore ? 'live' : 'template',
      summary: {
        activeChecklists: checklists.length,
        activeProcesses: processes.length,
        handbookDocuments: qmsDocs.length + buildStaffHandbookDocuments(catalog).length,
        openDeviations: openDeviations.length,
        openCapas: openCapas.length,
        alerts: dashboard?.alerts?.length || 0,
      },
      dashboard: dashboard || {
        overview: {
          totalChecklists: checklists.length,
          totalProcesses: processes.length,
          totalDocuments: qmsDocs.length,
        },
        alerts: [],
      },
      handbook: {
        principles: [
          'Personal följer fastställda rutiner och dokumenterar avvikelser direkt.',
          'Medicinska beslut och ordinationer kräver behörig mänsklig granskning.',
          'Kundkommunikation, bilder och journalunderlag hanteras via CCO med audit-spår.',
          'OLS/QMS används för förbättring, inte för att dölja fel.',
        ],
        documents: [...qmsDocs, ...buildStaffHandbookDocuments(catalog)].slice(0, 30),
      },
      checklists: checklists.slice(0, 12).map((item) => ({
        checklistId: item.checklistId || item.templateId,
        title: item.title,
        category: item.category || 'general',
        frequency: item.frequency || 'vid behov',
        responsibleRole: item.responsibleRole || 'STAFF',
        status: item.status || 'template',
        steps: Array.isArray(item.steps) ? item.steps.slice(0, 8) : [],
      })),
      processes: processes.slice(0, 12).map((item) => ({
        processId: item.processId || item.templateId,
        referenceNumber: item.referenceNumber || item.templateId,
        title: item.title,
        category: item.category || 'clinical',
        owner: item.owner || item.responsibleRole || 'OWNER',
        status: item.status || 'template',
        steps: Array.isArray(item.steps) ? item.steps.slice(0, 8) : [],
      })),
      deviations: openDeviations.slice(0, 12),
      capas: openCapas.slice(0, 12),
      safety: {
        hitl: true,
        message:
          'OLS/handbok hjälper personalen följa rutiner. Systemet ersätter inte medicinskt ansvar, juridisk granskning eller journalföring.',
      },
    };
  }

  function countMissingHandoff(checklist = {}) {
    if (!checklist || typeof checklist !== 'object') return 0;
    return Object.values(checklist).filter((value) => value === false).length;
  }

  function buildDailyWorkQueueItem(customerItem) {
    const caseRecord = customerItem.case || {};
    const startsAt = caseRecord.startsAt || caseRecord.scheduledForIso || caseRecord.scheduledAt;
    const ordinationStatus = String(caseRecord.ordinationReview?.status || '').toLowerCase();
    const requiresOrdination = isTreatmentRequiringOrdination(caseRecord);
    const missingHandoff = countMissingHandoff(caseRecord.handoffChecklist);
    const actions = [];
    let priority = 'waiting';
    let priorityRank = 30;

    if (customerItem.threads.needsReply > 0) {
      actions.push({
        key: 'customer_reply',
        label: 'Svara på kundfråga',
        severity: 'urgent',
      });
      priority = 'urgent';
      priorityRank = Math.min(priorityRank, 10);
    }

    if (requiresOrdination && ordinationStatus !== 'approved') {
      actions.push({
        key: 'ordination',
        label: 'Ordination väntar',
        severity: ordinationStatus === 'rejected' ? 'danger' : 'warning',
      });
      priority = priority === 'urgent' ? priority : 'today';
      priorityRank = Math.min(priorityRank, 20);
    }

    if (isTodayIso(startsAt)) {
      actions.push({
        key: 'today_booking',
        label: 'Kund idag',
        severity: 'today',
      });
      priority = priority === 'urgent' ? priority : 'today';
      priorityRank = Math.min(priorityRank, 20);
    }

    if (customerItem.photos.count > 0) {
      actions.push({
        key: 'photos',
        label: `${customerItem.photos.count} bild${customerItem.photos.count === 1 ? '' : 'er'} finns`,
        severity: 'info',
      });
      priorityRank = Math.min(priorityRank, 25);
    }

    if (missingHandoff > 0) {
      actions.push({
        key: 'checklist',
        label: `${missingHandoff} checkpunkt${missingHandoff === 1 ? '' : 'er'} kvar`,
        severity: 'warning',
      });
      priority = priority === 'urgent' ? priority : 'today';
      priorityRank = Math.min(priorityRank, 22);
    }

    if (!actions.length) {
      priority = 'done';
      priorityRank = 50;
      actions.push({
        key: 'no_action',
        label: 'Ingen akut åtgärd',
        severity: 'done',
      });
    }

    return {
      id: caseRecord.id || customerItem.customerId || customerItem.patientId,
      priority,
      priorityRank,
      title: customerItem.title,
      patientId: customerItem.patientId,
      customerId: customerItem.customerId,
      startsAt: startsAt || null,
      state: caseRecord.state || caseRecord.status || 'pending',
      assignedTo: caseRecord.assignedTo || null,
      assignment: caseRecord.assignment || null,
      ordinationStatus: ordinationStatus || null,
      staffActions: caseRecord.staffActions || null,
      links: {
        ...(customerItem.links || {}),
        staffTask: buildStaffPortalUrl({ role: 'nurse', panel: 'tasks' }),
        qms: buildStaffPortalUrl({ panel: 'qms' }),
      },
      actions,
      customer: customerItem,
    };
  }

  function notificationKindLabel(type) {
    const labels = {
      booking: 'Bokning',
      compliance: 'Compliance',
      id_verification: 'ID-verifiering',
      agreement: 'Avtal',
      mail: 'Kundfråga',
      system: 'System',
    };
    return labels[type] || 'Notis';
  }

  function buildNextBestAction(item) {
    const source = String(item?.source || '');
    const actions = Array.isArray(item?.actions) ? item.actions : [];
    const actionKeys = new Set(actions.map((action) => String(action.key || '')));
    const links = item?.links || {};

    if (source === 'notification') {
      const type = String(item?.type || 'system');
      if (type === 'mail') {
        return {
          label: 'Öppna kundfrågan',
          reason: 'Kundmeddelanden ska hanteras från arbetsvyn så svaret hamnar i rätt tråd.',
          href:
            item.actionUrl || links.staffPortal || links.staffTask || links.customerCard || null,
          safety: 'Skickar inget svar automatiskt.',
        };
      }
      if (type === 'booking' || type === 'agreement') {
        return {
          label: 'Öppna granskningsunderlag',
          reason: 'Bokning eller avtal behöver mänsklig kontroll innan nästa steg.',
          href:
            item.actionUrl || links.doctorReview || links.staffPortal || links.customerCard || null,
          safety: 'Ändrar ingen boknings- eller signeringsstatus.',
        };
      }
      if (type === 'compliance' || type === 'system') {
        return {
          label: 'Öppna QMS-spår',
          reason: 'System- och compliance-notiser ska följas upp i kvalitetsspåret.',
          href: item.actionUrl || links.staffPortal || buildStaffPortalUrl({ panel: 'qms' }),
          safety: 'Skapar ingen avvikelse automatiskt.',
        };
      }
      return {
        label: 'Öppna notisen',
        reason: 'Notisen har signaler som bör granskas manuellt.',
        href: item.actionUrl || links.staffPortal || links.customerCard || null,
        safety: 'Read-only.',
      };
    }

    if (actionKeys.has('customer_reply')) {
      return {
        label: 'Svara kunden från arbetsvyn',
        reason: 'Kunden väntar på svar och ärendet behöver ligga kvar i rätt konversation.',
        href: links.staffTask || links.customerCard || null,
        safety: 'Öppnar bara underlaget; svaret skickas manuellt.',
      };
    }
    if (actionKeys.has('ordination')) {
      return {
        label: 'Skicka/öppna läkarkö',
        reason: 'Behandling med lokalbedövning kräver individuell ordination innan ingrepp.',
        href: links.doctorReview || links.ordination || links.staffTask || null,
        safety: 'Ingen ordination godkänns utan läkarsignatur.',
      };
    }
    if (actionKeys.has('checklist')) {
      return {
        label: 'Gå igenom checklistan',
        reason: 'Minst en handoff-checkpunkt saknas innan ärendet är redo.',
        href: links.staffTask || links.qms || null,
        safety: 'Checkpunkter kräver manuell bekräftelse.',
      };
    }
    if (actionKeys.has('photos')) {
      return {
        label: 'Granska kundbilder',
        reason: 'Bilder finns kopplade till ärendet och kan påverka uppföljning/offertunderlag.',
        href: links.customerCard || links.photos || null,
        safety: 'Bilder ändras inte från radarn.',
      };
    }
    if (actionKeys.has('today_booking')) {
      return {
        label: 'Öppna dagens kund',
        reason: 'Kunden har bokning idag och bör kontrolleras innan besök/ingrepp.',
        href: links.customerCard || links.staffTask || null,
        safety: 'Endast navigering.',
      };
    }

    return {
      label: 'Öppna underlaget',
      reason: 'Ingen akut automatisk åtgärd föreslås.',
      href: links.customerCard || links.staffTask || null,
      safety: 'Read-only.',
    };
  }

  function buildNotificationPriorityItem(item, index = 0) {
    const severity = String(item?.severity || 'info').toLowerCase();
    const hasAction = Boolean(
      item?.actionUrl ||
      item?.links?.staffPortal ||
      item?.links?.staffTask ||
      item?.links?.customerCard
    );
    const priority =
      severity === 'warning' || severity === 'danger' || hasAction ? 'urgent' : 'waiting';
    const priorityRank = priority === 'urgent' ? 5 + index : 35 + index;
    const type = String(item?.type || 'system');
    const actionUrl =
      item?.actionUrl ||
      item?.links?.staffPortal ||
      item?.links?.staffTask ||
      item?.links?.customerCard ||
      null;

    const priorityItem = {
      id: `notification:${item?.id || index}`,
      source: 'notification',
      priority,
      priorityRank,
      title: item?.title || notificationKindLabel(type),
      body: item?.body || '',
      type,
      severity,
      read: Boolean(item?.read),
      createdAt: item?.createdAt || null,
      actionUrl,
      links: item?.links || {},
      actions: [
        {
          key: `notification_${type}`,
          label: notificationKindLabel(type),
          severity: priority === 'urgent' ? 'urgent' : 'info',
        },
      ],
    };
    priorityItem.nextBestAction = buildNextBestAction(priorityItem);
    return priorityItem;
  }

  function buildQueuePriorityItem(item) {
    const labels = Array.isArray(item.actions)
      ? item.actions.map((action) => action.label || action.key).filter(Boolean)
      : [];
    const priorityItem = {
      id: `queue:${item.id}`,
      source: 'queue',
      priority: item.priority,
      priorityRank: Number(item.priorityRank || 30) + 10,
      title: item.title,
      body: labels.join(' · '),
      startsAt: item.startsAt || null,
      actionUrl: item.links?.staffTask || item.links?.customerCard || null,
      links: item.links || {},
      actions: item.actions || [],
      queueItem: item,
    };
    priorityItem.nextBestAction = buildNextBestAction(priorityItem);
    return priorityItem;
  }

  // Lägg till requireAuth som global pre-filter för /api/v1/staff/*
  // (HTML-routen /staff-portal är öppen)
  if (requireAuth) {
    router.use('/api/v1/staff', requireAuth);
  }

  /* ── Prototype view (HTML) ────────────────────────────────────── */
  router.get('/staff-portal', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../public/staff-portal.html'));
  });

  /* ── GET /api/v1/staff/me ─────────────────────────────────────
     Returnerar inloggad personals roll och profil.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/me',
    requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
    (req, res) => {
      const role = req.cco?.role ?? null;
      const auth = req.auth ?? {};
      res.json({
        ok: true,
        staffId: auth.userId ?? req.session?.userId ?? null,
        role,
        tenantId: auth.tenantId ?? null,
        name: auth.name ?? auth.displayName ?? auth.staffName ?? null,
      });
    }
  );

  /* ── GET /api/v1/staff/notifications ──────────────────────────
     Personalens read-only notisinkorg. Återanvänder CCO:s
     notification-feed och dess staff-portal deep links.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/notifications',
    requirePermission('notifications.read'),
    async (req, res) => {
      try {
        const role = req.cco?.role ?? req.auth?.role ?? req.query.role ?? null;
        const userId = req.auth?.userId ?? req.headers['x-cco-user'] ?? role ?? 'staff';
        const sinceHours = Math.min(Math.max(Number(req.query.sinceHours) || 72, 1), 24 * 30);
        const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);

        const feedStore = getNotificationFeedStore?.() ?? notificationFeedStore;
        if (!feedStore?.getFeed) {
          return res.json({
            ok: true,
            mode: 'unavailable',
            items: [],
            count: 0,
            summary: { total: 0, unread: 0, actionRequired: 0, byType: {} },
          });
        }

        const feed = await feedStore.getFeed({
          role,
          userId,
          sinceHours,
          limit,
        });
        const items = Array.isArray(feed?.items) ? feed.items : [];
        const summary = feed?.summary || {};
        res.json({
          ok: true,
          mode: 'live',
          count: items.length,
          items,
          summary: {
            total: Number(summary.total ?? items.length),
            unread: Number(summary.unread ?? items.filter((item) => !item.read).length),
            actionRequired: Number(
              summary.actionRequired ??
                items.filter((item) => item.actionUrl || item.links?.staffPortal).length
            ),
            byType: summary.byType || {},
          },
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/work-priorities ───────────────────────
     Samlad read-only prioriteringsradar:
       - notiser med åtgärdslänk först
       - därefter daglig arbetskö
     Inga mark-read, inga journaländringar och inga kundutskick.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/work-priorities',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const role = req.cco?.role ?? req.auth?.role ?? req.query.role ?? null;
        const userId = req.auth?.userId ?? req.headers['x-cco-user'] ?? role ?? 'staff';
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
        const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

        const feedStore = getNotificationFeedStore?.() ?? notificationFeedStore;
        const [feed, cases] = await Promise.all([
          feedStore?.getFeed
            ? feedStore.getFeed({ role, userId, sinceHours: 168, limit: 12 })
            : Promise.resolve({ items: [] }),
          bookingCaseStore?.listCases
            ? bookingCaseStore.listCases({
                tenantId: tenantId || undefined,
                assignedTo: all ? null : userId || undefined,
                limit: 30,
              })
            : Promise.resolve([]),
        ]);

        const customers = await Promise.all(
          (Array.isArray(cases) ? cases : [])
            .slice(0, 30)
            .map((item) => buildCustomerWorkItem(item, { tenantId }))
        );
        const queueItems = customers.map(buildDailyWorkQueueItem);
        const notificationItems = (Array.isArray(feed?.items) ? feed.items : [])
          .filter(
            (item) =>
              !item.read || item.actionUrl || item.links?.staffPortal || item.links?.staffTask
          )
          .map(buildNotificationPriorityItem);

        const items = [...notificationItems, ...queueItems.map(buildQueuePriorityItem)]
          .sort(
            (a, b) =>
              a.priorityRank - b.priorityRank ||
              String(a.createdAt || a.startsAt || '').localeCompare(
                String(b.createdAt || b.startsAt || '')
              )
          )
          .slice(0, limit);

        const summary = items.reduce(
          (acc, item) => {
            acc.total += 1;
            acc[item.source] = (acc[item.source] || 0) + 1;
            acc[item.priority] = (acc[item.priority] || 0) + 1;
            return acc;
          },
          { total: 0, notification: 0, queue: 0, urgent: 0, today: 0, waiting: 0, done: 0 }
        );

        res.json({ ok: true, items, count: items.length, summary });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/tasks ──────────────────────────────────
     Hämtar bokningsärenden tilldelade inloggad personal.
     Filtreras på assignedTo = userId (sjuksköterska/konsult ser egna).
     Admin/owner kan ange ?assignedTo=all för alla.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/tasks', requirePermission('customers.read'), async (req, res) => {
    try {
      const role = req.cco?.role ?? null;
      const userId = req.auth?.userId ?? null;
      const tenantId = req.auth?.tenantId ?? null;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

      let tasks = [];
      if (bookingCaseStore) {
        tasks = await bookingCaseStore.listCases({
          tenantId: tenantId || undefined,
          assignedTo: all ? null : userId || undefined,
          limit,
        });
      }
      res.json({ ok: true, tasks, count: tasks.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── GET /api/v1/staff/team ───────────────────────────────────
     Personalregister för owner/admin. Läser authStore, skriver inget.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/team', requirePermission('staff.manage'), async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
      const staff = await listActiveStaffMembers(tenantId);
      res.json({ ok: true, staff, count: staff.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── GET /api/v1/staff/my-customers ───────────────────────────
     Samlad read-only arbetsvy för personal:
       - mina tilldelade kunder från bookingCaseStore
       - konversationssignal från ccoConversationThreadStore
       - bildsignal från journal photo-metadata på disk
     Inga journal-/medicinbeslut, inga skrivningar.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/my-customers',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const role = req.cco?.role ?? null;
        const userId = req.auth?.userId ?? null;
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

        let cases = [];
        if (bookingCaseStore) {
          cases = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            assignedTo: all ? null : userId || undefined,
            limit,
          });
        }

        const customers = await Promise.all(
          cases.slice(0, limit).map((item) => buildCustomerWorkItem(item, { tenantId }))
        );

        const summary = customers.reduce(
          (acc, item) => {
            acc.total += 1;
            if (item.signals.needsReply) acc.needsReply += 1;
            if (item.signals.hasPhotos) acc.withPhotos += 1;
            if (item.signals.hasCustomerCard) acc.withCustomerCard += 1;
            return acc;
          },
          { total: 0, needsReply: 0, withPhotos: 0, withCustomerCard: 0 }
        );

        res.json({ ok: true, customers, count: customers.length, summary });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/daily-work-queue ───────────────────────
     Prioriterad read-only kö för vardagsarbetet:
       - akut: kundfråga/svar krävs
       - idag: kund idag, ordination/checklista väntar
       - väntar: bilder eller mindre uppföljningssignaler
       - klar: inga åtgärdssignaler
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/daily-work-queue',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const role = req.cco?.role ?? null;
        const userId = req.auth?.userId ?? null;
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const limit = Math.min(Number(req.query.limit) || 30, 80);
        const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

        let cases = [];
        if (bookingCaseStore) {
          cases = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            assignedTo: all ? null : userId || undefined,
            limit,
          });
        }

        const customers = await Promise.all(
          cases.slice(0, limit).map((item) => buildCustomerWorkItem(item, { tenantId }))
        );
        const items = customers
          .map(buildDailyWorkQueueItem)
          .sort(
            (a, b) =>
              a.priorityRank - b.priorityRank ||
              String(a.startsAt).localeCompare(String(b.startsAt))
          );
        const summary = items.reduce(
          (acc, item) => {
            acc.total += 1;
            acc[item.priority] = (acc[item.priority] || 0) + 1;
            return acc;
          },
          { total: 0, urgent: 0, today: 0, waiting: 0, done: 0 }
        );

        res.json({ ok: true, items, count: items.length, summary });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── POST /api/v1/staff/daily-work-queue/:id/action ───────────
     Säkra vardagsåtgärder för personalens arbetskö.
     Detta skickar inga kundmeddelanden och fattar inga medicinska beslut.
     Alla åtgärder sparas i booking-case history + audit.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/daily-work-queue/:id/action',
    requirePermission('customers.read'),
    async (req, res) => {
      const id = String(req.params.id || '').trim();
      const action = String(req.body?.action || '').trim();
      const itemKey = String(req.body?.itemKey || '').trim();

      if (!id) return res.status(400).json({ ok: false, error: 'Ärende-id krävs.' });
      if (!action) return res.status(400).json({ ok: false, error: 'action krävs.' });
      if (!bookingCaseStore?.recordStaffAction) {
        return res.status(503).json({ ok: false, error: 'Booking case store saknas.' });
      }

      try {
        const caseRecord = await bookingCaseStore.recordStaffAction(
          id,
          { action, itemKey },
          getActor(req)
        );

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: `staff_portal.${action}`,
            actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
            target: { kind: 'booking_case', id, tenantId: req.auth?.tenantId ?? null },
            result: 'ok',
            detail: itemKey ? { itemKey } : {},
          });
        }

        return res.json({
          ok: true,
          action,
          itemKey: itemKey || null,
          case: caseRecord,
        });
      } catch (err) {
        return handleWriteError(res, err);
      }
    }
  );

  /* ── POST /api/v1/staff/cases/:id/assign ──────────────────────
     Owner/admin tilldelar eller omfördelar kundansvar.
     Detta skickar inga kundmeddelanden och ändrar inga journaldata.
     Alla tilldelningar sparas i booking-case history + audit.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/cases/:id/assign',
    requirePermission('staff.manage'),
    async (req, res) => {
      const id = String(req.params.id || '').trim();
      const assignedTo = String(req.body?.assignedTo || '').trim();
      const note = String(req.body?.note || '').trim();

      if (!id) return res.status(400).json({ ok: false, error: 'Ärende-id krävs.' });
      if (!assignedTo) return res.status(400).json({ ok: false, error: 'assignedTo krävs.' });
      if (!bookingCaseStore?.assignStaff) {
        return res.status(503).json({ ok: false, error: 'Booking case store saknas.' });
      }

      try {
        const caseRecord = await bookingCaseStore.assignStaff(
          id,
          { assignedTo, note },
          getActor(req)
        );

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'staff_portal.case_assigned',
            actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
            target: { kind: 'booking_case', id, tenantId: req.auth?.tenantId ?? null },
            result: 'ok',
            detail: { assignedTo, note },
          });
        }

        return res.json({ ok: true, assignedTo, case: caseRecord });
      } catch (err) {
        return handleWriteError(res, err);
      }
    }
  );

  /* ── GET /api/v1/staff/review-queue ───────────────────────────
     Manuell granskningskö — ärenden i pågående handläggning.
     Returnerar qualifying + proposed + confirmed, sorterade per updatedAt.
     Read-only statusvy — inga åtgärder exponeras härifrån.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/review-queue',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const tenantId = req.auth?.tenantId ?? null;
        const limit = Math.min(Number(req.query.limit) || 30, 100);

        let queue = [];
        if (bookingCaseStore) {
          const [a, b, c] = await Promise.all([
            bookingCaseStore
              .listCases({ tenantId: tenantId || undefined, state: 'qualifying', limit })
              .catch(() => []),
            bookingCaseStore
              .listCases({ tenantId: tenantId || undefined, state: 'proposed', limit })
              .catch(() => []),
            bookingCaseStore
              .listCases({ tenantId: tenantId || undefined, state: 'confirmed', limit })
              .catch(() => []),
          ]);
          queue = [...a, ...b, ...c]
            .sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)))
            .slice(0, limit);
        }
        res.json({ ok: true, queue, count: queue.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/ordination-reviews ─────────────────────
     Granskningskö för ordinationsunderlag (doctor view).
     Returnerar alla öppna bokningsärenden (ej completed/cancelled)
     för manuell läkargranskning. Fas 3 lägger till
     handoffChecklist-filtrering när fältet finns i bookingCaseStore.
     Kräver ordination.view-permission (owner, operator, konsult).
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/ordination-reviews',
    requirePermission('ordination.view'),
    async (req, res) => {
      try {
        const tenantId = req.auth?.tenantId ?? null;
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        let reviews = [];
        if (bookingCaseStore) {
          const allOpen = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            limit: limit * 4,
          });
          reviews = allOpen
            .filter((c) => !['completed', 'cancelled'].includes(c.state))
            .filter((c) => isTreatmentRequiringOrdination(c) || c.ordinationReview)
            .map((c) => ({
              ...c,
              ordinationReadout: buildOrdinationReviewReadout(c),
            }))
            .slice(0, limit);
        }
        res.json({ ok: true, reviews, count: reviews.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/audit ──────────────────────────────────
     Audit-logg — senaste händelser. Owner/revisor-only.
     Skrivskyddad och oföränderlig. Kan filtreras per action.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/audit', requirePermission('audit.read'), (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const since = req.query.since || null;
      const action = req.query.action || null;

      const entries = ccoAuditLog ? ccoAuditLog.query({ limit, since, action }) : [];

      res.json({ ok: true, entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── GET /api/v1/staff/customer-threads/:customerId ──────────
     Konversationstrådar för en specifik kund.
     Kräver mail.read-permission. Tenantid från session.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/customer-threads/:customerId',
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        const customerId = String(req.params.customerId || '').trim();
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const filter = String(req.query.filter || 'all').trim();

        if (!customerId) {
          return res.status(400).json({ ok: false, error: 'customerId krävs.' });
        }

        const store = await getThreadStore();
        const built = await store.buildThreadsForCustomer(customerId, { tenantId });
        const threads = store.filterThreads(built.threads || [], filter);

        res.json({
          ok: true,
          customerId,
          threads,
          counts: built.counts,
          summary: built.summary,
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/customer-photos/:patientId ─────────────
     Lista journalfoton för en patient (metadata, ej råfiler).
     Kräver photo.read-permission. Audit-loggas.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/customer-photos/:patientId',
    requirePermission('photo.read'),
    async (req, res) => {
      try {
        const patientId = String(req.params.patientId || '').trim();
        const tenantId = req.auth?.tenantId || 'hairtpclinic';

        if (!patientId) {
          return res.status(400).json({ ok: false, error: 'patientId krävs.' });
        }

        const photos = await listPhotoMetadata({ tenantId, patientId });

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'photo.read',
            actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
            target: { kind: 'collection', id: patientId, tenantId },
            result: 'ok',
            detail: { count: photos.length },
          });
        }

        res.json({ ok: true, patientId, photos, count: photos.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/documents ─────────────────────────────
     Statisk dokumentkatalog (OLS/checklistor/handbok/delegering).
     Filtrerbar via ?category= och ?filler= (se hairtp-document-types.catalog.json).
     Kräver delegation.read-permission (all personal).
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/documents', requirePermission('delegation.read'), (req, res) => {
    try {
      const category = req.query.category || null;
      const filler = req.query.filler || null;

      let docs = loadDocumentCatalog();
      if (category) docs = docs.filter((d) => d.category === category);
      if (filler) docs = docs.filter((d) => d.filler === filler);

      res.json({ ok: true, documents: docs, count: docs.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── GET /api/v1/staff/qms/handbook ─────────────────────────
     Samlad OLS/QMS-readout för personalportalen:
       - kvalitetshandbok/principer
       - aktiva checklistor och SOP-rutiner
       - öppna avvikelser/CAPA
       - dokumentkatalogens personal-/internunderlag
     Read-only. Alla skrivningar sker via separata, audit-loggade endpoints.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/qms/handbook', requirePermission('qms.read'), (req, res) => {
    try {
      const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
      return res.json({ ok: true, qms: buildQmsHandbookReadout({ tenantId }) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── POST /api/v1/staff/ordination-reviews/:id/approve ────────
     Legitimerad läkare godkänner ordinationsunderlag manuellt.
     Kräver ordination.approve-permission. Audit-loggas med signatur.
     SÄKERHET: Systemet ändrar ALDRIG status utan explicit läkarhandling.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/ordination-reviews/:id/approve',
    requirePermission('ordination.approve'),
    async (req, res) => {
      const { id } = req.params;
      const { comment = '', signature = '' } = req.body ?? {};
      const trimmedSignature = String(signature || '').trim();
      const trimmedComment = String(comment || '').trim();

      if (!trimmedSignature || trimmedSignature.length < 2) {
        return res.status(400).json({ ok: false, error: 'Signatur krävs för godkännande.' });
      }

      let caseRecord = null;
      try {
        if (bookingCaseStore?.updateOrdinationReview) {
          caseRecord = await bookingCaseStore.updateOrdinationReview(
            id,
            { status: 'approved', signature: trimmedSignature, comment: trimmedComment },
            getActor(req)
          );
        }
      } catch (err) {
        return handleWriteError(res, err);
      }

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'ordination.approved',
          actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { signature: trimmedSignature, comment: trimmedComment },
        });
      }

      res.json({
        ok: true,
        reviewId: id,
        status: 'approved',
        approvedBy: req.auth?.userId ?? req.session?.userId ?? 'unknown',
        approvedAt: new Date().toISOString(),
        signature: trimmedSignature,
        case: caseRecord,
      });
    }
  );

  /* ── POST /api/v1/staff/ordination-reviews/:id/reject ─────────
     Legitimerad läkare avvisar ordinationsunderlag.
     Kräver alltid motivering. Audit-loggas.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/ordination-reviews/:id/reject',
    requirePermission('ordination.approve'),
    async (req, res) => {
      const { id } = req.params;
      const { comment = '', signature = '' } = req.body ?? {};
      const trimmedComment = String(comment || '').trim();
      const trimmedSignature = String(signature || '').trim();

      if (!trimmedComment || trimmedComment.length < 5) {
        return res.status(400).json({ ok: false, error: 'Motivering krävs vid avvisning.' });
      }

      if (!trimmedSignature || trimmedSignature.length < 2) {
        return res.status(400).json({ ok: false, error: 'Signatur krävs vid avvisning.' });
      }

      let caseRecord = null;
      try {
        if (bookingCaseStore?.updateOrdinationReview) {
          caseRecord = await bookingCaseStore.updateOrdinationReview(
            id,
            { status: 'rejected', signature: trimmedSignature, comment: trimmedComment },
            getActor(req)
          );
        }
      } catch (err) {
        return handleWriteError(res, err);
      }

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'ordination.rejected',
          actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { signature: trimmedSignature, comment: trimmedComment },
        });
      }

      res.json({
        ok: true,
        reviewId: id,
        status: 'rejected',
        rejectedBy: req.auth?.userId ?? req.session?.userId ?? 'unknown',
        rejectedAt: new Date().toISOString(),
        case: caseRecord,
      });
    }
  );

  /* ── POST /api/v1/staff/qms/checklists/:id/complete-item ──────
     Markerar ett checklisteobjekt som klart. Immutable — audit.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/qms/checklists/:id/complete-item',
    requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
    (req, res) => {
      const { id } = req.params;
      const { itemKey } = req.body ?? {};

      if (!itemKey) {
        return res.status(400).json({ ok: false, error: 'itemKey krävs.' });
      }

      const completedBy = req.auth?.userId ?? req.session?.userId ?? 'unknown';
      const completedAt = new Date().toISOString();

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'qms.checklist.item_completed',
          actor: { role: req.cco?.role ?? null, userId: completedBy, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { itemKey },
        });
      }

      res.json({ ok: true, checklistId: id, itemKey, completedBy, completedAt });
    }
  );

  /* ── POST /api/v1/staff/qms/deviations ───────────────────────
     Rapporterar en ny avvikelse (OLS-3). All personal.
  ─────────────────────────────────────────────────────────────── */
  router.post('/api/v1/staff/qms/deviations', requirePermission('qms.read'), async (req, res) => {
    const {
      kind,
      description,
      severity = 'medium',
      category,
      affectedArea,
      patientId,
    } = req.body ?? {};

    if (!kind || !description || description.trim().length < 10) {
      return res
        .status(400)
        .json({ ok: false, error: 'kind och description (min 10 tecken) krävs.' });
    }

    const reportedBy = req.auth?.userId ?? req.session?.userId ?? 'unknown';
    const reportedAt = new Date().toISOString();
    const tenantId = req.auth?.tenantId || 'hairtpclinic';
    let deviation = null;

    try {
      if (qmsStore?.reportDeviation) {
        deviation = qmsStore.reportDeviation({
          tenantId,
          title: kind,
          description,
          severity,
          category: category || kind,
          reportedBy,
          patientId,
          affectedArea,
        });
        await qmsStore.persist?.();
      }
    } catch (err) {
      return handleWriteError(res, err);
    }

    const deviationId = deviation?.deviationId || `AVV-${Date.now()}`;

    if (ccoAuditLog) {
      ccoAuditLog.append({
        action: 'qms.deviation.reported',
        actor: { role: req.cco?.role ?? null, userId: reportedBy, ip: null },
        target: { kind: 'entity', id: deviationId, tenantId },
        result: 'ok',
        detail: { kind, severity, category: category || kind, description },
      });
    }

    res.json({
      ok: true,
      deviationId,
      referenceNumber: deviation?.referenceNumber || null,
      kind,
      status: deviation?.status || 'open',
      reportedBy,
      reportedAt: deviation?.reportedAt || reportedAt,
      deviation,
    });
  });

  return router;
}

module.exports = { createStaffPortalRouter };
