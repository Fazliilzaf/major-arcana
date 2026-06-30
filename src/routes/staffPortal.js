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
      const rows = await Promise.all(
        files
          .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.endsWith('.annotated.png'))
          .map(async (f) => {
            const ext = path.extname(f).slice(1).toLowerCase();
            const photoId = path.basename(f, path.extname(f));
            let updatedAt = null;
            try {
              const stat = await fs.stat(path.join(patientDir, f));
              updatedAt = stat.mtime.toISOString();
            } catch {
              updatedAt = null;
            }
            return {
              photoId,
              ext,
              mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
              fileName: f,
              updatedAt,
            };
          })
      );
      return rows.sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
      );
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

  async function buildDelegatedInboxItems(caseRecord, { tenantId, limitPerCustomer = 5 } = {}) {
    const customerId = String(
      caseRecord.customerId || caseRecord.patientId || caseRecord.customerEmail || ''
    ).trim();
    const patientId = String(caseRecord.patientId || caseRecord.customerId || '').trim();
    if (!customerId) return [];

    let threads = [];
    try {
      const store = await getThreadStore();
      const built = await store.buildThreadsForCustomer(customerId, { tenantId });
      threads = store.filterThreads(built.threads || [], 'unanswered');
    } catch (_err) {
      threads = [];
    }

    return threads
      .slice()
      .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
      .slice(0, limitPerCustomer)
      .map((thread) => ({
        threadId: thread.threadId || thread.id || null,
        caseId: caseRecord.id || null,
        customerId,
        patientId: patientId || null,
        customerName:
          caseRecord.customerName ||
          caseRecord.patientName ||
          caseRecord.customerEmail ||
          customerId,
        assignedTo: caseRecord.assignedTo || null,
        subject: thread.subject || 'Kundfråga',
        preview: thread.preview || thread.bodyPreview || '',
        from: thread.from || thread.sender || null,
        channel: thread.channel || 'email',
        mailboxId: thread.mailboxId || null,
        receivedAt: thread.ts || thread.createdAt || null,
        status: thread.threadStatus || 'unanswered',
        priority: 'urgent',
        action: {
          label: 'Öppna kundtråd',
          href: buildStaffPortalUrl({ role: 'nurse', panel: 'customers', hash: thread.threadId }),
          safety:
            'Svar skickas inte härifrån. Öppna CCO-konversationen och följ ordinarie svarsstudio.',
        },
        links: buildStaffPortalLinks({
          caseId: caseRecord.id,
          customerId,
          patientId,
          tenantId,
        }),
      }));
  }

  async function buildDelegatedPhotoInboxItem(caseRecord, { tenantId } = {}) {
    const patientId = String(caseRecord.patientId || caseRecord.customerId || '').trim();
    const customerId = String(
      caseRecord.customerId || caseRecord.patientId || caseRecord.customerEmail || ''
    ).trim();
    if (!patientId) return null;

    const photos = await listPhotoMetadata({ tenantId, patientId });
    if (!photos.length) return null;

    return {
      caseId: caseRecord.id || null,
      customerId: customerId || null,
      patientId,
      customerName:
        caseRecord.customerName || caseRecord.patientName || caseRecord.customerEmail || patientId,
      assignedTo: caseRecord.assignedTo || null,
      treatment: caseRecord.serviceLabel || caseRecord.treatment || caseRecord.service || null,
      priority: 'waiting',
      count: photos.length,
      latestAt: photos[0]?.updatedAt || null,
      latest: photos.slice(0, 6),
      action: {
        label: 'Granska bilder',
        safety:
          'Bildinkorgen är read-only. Granskning och journalåtgärder görs i ordinarie kundkort/workspace.',
      },
      links: buildStaffPortalLinks({
        caseId: caseRecord.id,
        customerId,
        patientId,
        tenantId,
      }),
    };
  }

  const FOLLOWUP_MILESTONES = [
    { key: 'postop_day_1', day: 1, label: 'Postop dag 1', kind: 'trygghetscheck' },
    { key: 'postop_day_7', day: 7, label: 'Postop dag 7', kind: 'läkning' },
    { key: 'postop_day_30', day: 30, label: 'Postop dag 30', kind: 'foto/återkoppling' },
    { key: 'followup_month_4', day: 120, label: 'Uppföljning 4 månader', kind: 'resultat' },
    { key: 'followup_month_6', day: 180, label: 'Uppföljning 6 månader', kind: 'resultat' },
    {
      key: 'followup_month_12',
      day: 365,
      label: 'Resultatuppföljning 12 månader',
      kind: 'slutstatus',
    },
  ];

  function daysBetween(startIso, now = new Date()) {
    const startMs = Date.parse(startIso || '');
    if (!Number.isFinite(startMs)) return null;
    return Math.floor((now.getTime() - startMs) / (24 * 60 * 60 * 1000));
  }

  function buildFollowupHistory(caseRecord = {}) {
    const labels = {
      staff_followup_contacted: 'Kontaktad',
      staff_followup_needs_doctor: 'Behöver läkare',
      staff_followup_journal_draft: 'Journalutkast begärt',
      staff_followup_completed: 'Uppföljning klar',
    };
    const history = Array.isArray(caseRecord.history) ? caseRecord.history : [];
    return history
      .filter((entry) => entry && typeof entry === 'object' && labels[entry.action])
      .slice(-6)
      .map((entry) => ({
        at: entry.at || null,
        action: entry.action,
        label: labels[entry.action],
        userId: entry.userId || null,
        role: entry.role || null,
      }));
  }

  function hasFollowupDoctorEscalation(caseRecord = {}) {
    return buildFollowupHistory(caseRecord).some(
      (entry) => entry.action === 'staff_followup_needs_doctor'
    );
  }

  function latestFollowupActionAt(caseRecord = {}, action) {
    const history = Array.isArray(caseRecord.history) ? caseRecord.history : [];
    return history
      .filter((entry) => entry?.action === action && entry.at)
      .map((entry) => Date.parse(entry.at))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
  }

  function isFollowupCompleted(caseRecord = {}) {
    const completedAt = latestFollowupActionAt(caseRecord, 'staff_followup_completed');
    if (!completedAt) return false;
    const needsDoctorAt = latestFollowupActionAt(caseRecord, 'staff_followup_needs_doctor');
    return !needsDoctorAt || completedAt >= needsDoctorAt;
  }

  function isFollowupWaitingDoctor(caseRecord = {}) {
    const needsDoctorAt = latestFollowupActionAt(caseRecord, 'staff_followup_needs_doctor');
    if (!needsDoctorAt) return false;
    const completedAt = latestFollowupActionAt(caseRecord, 'staff_followup_completed');
    return !completedAt || completedAt < needsDoctorAt;
  }

  async function buildStaffFollowupItem(caseRecord, { tenantId, now = new Date() } = {}) {
    const startsAt = caseRecord.startsAt || caseRecord.scheduledForIso || caseRecord.scheduledAt;
    const patientId = String(caseRecord.patientId || caseRecord.customerId || '').trim();
    const customerId = String(
      caseRecord.customerId || caseRecord.patientId || caseRecord.customerEmail || ''
    ).trim();
    const daysSince = daysBetween(startsAt, now);
    if (daysSince === null) return null;

    const photos = patientId ? await listPhotoMetadata({ tenantId, patientId }) : [];
    const dueMilestones = FOLLOWUP_MILESTONES.filter((item) => daysSince >= item.day);
    const nextMilestone =
      FOLLOWUP_MILESTONES.find((item) => daysSince < item.day) ||
      FOLLOWUP_MILESTONES[FOLLOWUP_MILESTONES.length - 1];
    const activeMilestone = dueMilestones[dueMilestones.length - 1] || nextMilestone;
    const daysUntil = activeMilestone.day - daysSince;
    const followupCompleted = isFollowupCompleted(caseRecord);
    const waitingDoctor = isFollowupWaitingDoctor(caseRecord);
    const status = followupCompleted
      ? 'completed'
      : daysSince < 0
        ? 'upcoming_operation'
        : daysUntil > 0
          ? 'upcoming'
          : Math.abs(daysUntil) <= 2
            ? 'due'
            : 'overdue';
    const priorityRank =
      status === 'overdue'
        ? 10
        : status === 'due'
          ? 20
          : waitingDoctor
            ? 25
            : status === 'upcoming'
              ? 40
              : status === 'completed'
                ? 80
                : 60;
    const followupHistory = buildFollowupHistory(caseRecord);
    const links = buildStaffPortalLinks({
      caseId: caseRecord.id,
      customerId,
      patientId,
      tenantId,
    });

    return {
      caseId: caseRecord.id || null,
      customerId: customerId || null,
      patientId: patientId || null,
      customerName:
        caseRecord.customerName ||
        caseRecord.patientName ||
        caseRecord.customerEmail ||
        caseRecord.id ||
        'Kund',
      assignedTo: caseRecord.assignedTo || null,
      treatment: caseRecord.serviceLabel || caseRecord.treatment || caseRecord.service || null,
      startsAt: startsAt || null,
      daysSince,
      status,
      completed: followupCompleted,
      waitingDoctor,
      priority:
        status === 'completed'
          ? 'done'
          : status === 'overdue'
            ? 'urgent'
            : status === 'due'
              ? 'today'
              : 'waiting',
      priorityRank,
      milestone: activeMilestone,
      daysUntil,
      photos: {
        count: photos.length,
        latestAt: photos[0]?.updatedAt || null,
        href: links.photos || null,
      },
      followupHistory,
      followupHistorySummary: {
        count: followupHistory.length,
        latestAt: followupHistory.at(-1)?.at || null,
        latestLabel: followupHistory.at(-1)?.label || null,
        latestBy: followupHistory.at(-1)?.userId || null,
      },
      action: {
        label:
          status === 'overdue'
            ? 'Följ upp nu'
            : status === 'due'
              ? 'Öppna uppföljning'
              : status === 'completed'
                ? 'Visa historik'
                : 'Planera uppföljning',
        safety:
          'Uppföljningslistan är read-only. Kontakt, bildgranskning och journalanteckning görs i ordinarie CCO-flöde.',
      },
      links,
    };
  }

  async function buildCustomerFollowupStatus({
    patientId,
    customerId,
    tenantId,
    now = new Date(),
  } = {}) {
    const cleanPatientId = String(patientId || '').trim();
    const cleanCustomerId = String(customerId || cleanPatientId || '').trim();
    if (!cleanPatientId && !cleanCustomerId) return null;
    if (!bookingCaseStore?.listCases && !bookingCaseStore?.listCasesForCustomer) return null;

    const cases = bookingCaseStore?.listCasesForCustomer
      ? await bookingCaseStore.listCasesForCustomer({
          tenantId: tenantId || undefined,
          patientId: cleanPatientId || undefined,
          customerId: cleanCustomerId || undefined,
          limit: 200,
        })
      : await bookingCaseStore.listCases({
          tenantId: tenantId || undefined,
          limit: 5000,
        });
    const relatedCases = (Array.isArray(cases) ? cases : []).filter((item) => {
      const itemPatientId = String(item.patientId || '').trim();
      const itemCustomerId = String(item.customerId || '').trim();
      return (
        (cleanPatientId && itemPatientId === cleanPatientId) ||
        (cleanCustomerId && itemCustomerId === cleanCustomerId) ||
        (cleanCustomerId && itemPatientId === cleanCustomerId)
      );
    });
    const followups = (
      await Promise.all(relatedCases.map((item) => buildStaffFollowupItem(item, { tenantId, now })))
    )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.priorityRank - b.priorityRank ||
          Math.abs(a.daysUntil || 0) - Math.abs(b.daysUntil || 0) ||
          String(b.startsAt || '').localeCompare(String(a.startsAt || ''))
      );
    const latest = followups[0] || null;
    const timelineEvents = followups.flatMap((item) =>
      (Array.isArray(item.followupHistory) ? item.followupHistory : []).map((entry) => ({
        id: `${item.caseId || 'case'}:${entry.action}:${entry.at || 'unknown'}`,
        type: 'staff_followup',
        caseId: item.caseId,
        patientId: item.patientId,
        customerId: item.customerId,
        at: entry.at || null,
        title: entry.label || 'Uppföljning',
        status: item.status,
        actor: entry.userId || entry.role || null,
        readOnly: true,
      }))
    );
    const summary = followups.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] = (acc[item.status] || 0) + 1;
        if (item.waitingDoctor) acc.waitingDoctor += 1;
        if (item.photos?.count) acc.withPhotos += 1;
        return acc;
      },
      {
        total: 0,
        overdue: 0,
        due: 0,
        upcoming: 0,
        upcoming_operation: 0,
        completed: 0,
        waitingDoctor: 0,
        withPhotos: 0,
      }
    );
    return {
      patientId: cleanPatientId || latest?.patientId || null,
      customerId: cleanCustomerId || latest?.customerId || null,
      current: latest,
      followups,
      timelineEvents: timelineEvents.sort((a, b) =>
        String(b.at || '').localeCompare(String(a.at || ''))
      ),
      summary,
      safety: {
        readOnly: true,
        noAutoJournal: true,
        message:
          'Kundkortets uppföljningsstatus är ett read-only arbetsstöd. Journal och kundkontakt skapas manuellt i ordinarie CCO-flöde.',
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
      followupStatus: pid
        ? `/api/v1/staff/customer-followup-status/${encodeURIComponent(pid)}`
        : null,
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
    const preDecisionMissing = readiness.filter(
      (item) => item.key !== 'ordinationDecision' && !item.done
    );
    const reviewStatus = String(caseRecord.ordinationReview?.status || '').toLowerCase();
    const history = Array.isArray(caseRecord.history) ? caseRecord.history : [];
    const lastCompletionRequest = [...history]
      .reverse()
      .find((entry) => entry?.action === 'ordination_needs_completion');
    const lastCompletionResolved = [...history]
      .reverse()
      .find((entry) => entry?.action === 'staff_resolve_completion');
    const followupHistory = buildFollowupHistory(caseRecord);
    const latestFollowupEscalation = [...followupHistory]
      .reverse()
      .find((entry) => entry.action === 'staff_followup_needs_doctor');
    const timelineLabels = {
      case_created: 'Ärende skapat',
      staff_mark_seen: 'Personal markerade sedd',
      staff_send_to_doctor: 'Skickad till läkare',
      staff_complete_checklist: 'Checkpunkt klar',
      staff_followup_needs_doctor: 'Uppföljning eskalerad till läkare',
      ordination_needs_completion: 'Läkare begärde komplettering',
      staff_resolve_completion: 'Personal markerade komplettering klar',
      ordination_approved: 'Ordination godkänd',
      ordination_rejected: 'Ordination avvisad',
    };
    const timeline = history
      .filter((entry) => entry && typeof entry === 'object' && timelineLabels[entry.action])
      .slice(-8)
      .map((entry) => ({
        at: entry.at || null,
        action: entry.action,
        label: timelineLabels[entry.action],
        userId: entry.userId || null,
        role: entry.role || null,
        itemKey: entry.itemKey || null,
      }));
    const latestTimelineEntry = timeline.at(-1) || null;
    const completionReturn =
      lastCompletionRequest && lastCompletionResolved
        ? {
            returned: true,
            requestedAt: lastCompletionRequest.at || caseRecord.ordinationReview?.decidedAt || null,
            requestedBy:
              lastCompletionRequest.userId || caseRecord.ordinationReview?.decidedBy || null,
            comment: caseRecord.ordinationReview?.comment || '',
            resolvedAt:
              caseRecord.staffActions?.completionResolvedAt || lastCompletionResolved.at || null,
            resolvedBy:
              caseRecord.staffActions?.completionResolvedBy ||
              lastCompletionResolved.userId ||
              null,
          }
        : null;
    const timelineSummary = {
      eventCount: timeline.length,
      latestLabel: latestTimelineEntry?.label || 'Ingen historik ännu',
      latestAction: latestTimelineEntry?.action || null,
      latestAt: latestTimelineEntry?.at || null,
      latestActor: latestTimelineEntry?.userId || latestTimelineEntry?.role || null,
      returnedFromCompletion: Boolean(completionReturn?.returned),
      requiresDoctorAttention:
        !['approved', 'rejected'].includes(reviewStatus) &&
        !['ordination_needs_completion'].includes(latestTimelineEntry?.action || ''),
    };
    const decisionAuditAction =
      reviewStatus === 'approved'
        ? 'ordination.approved'
        : reviewStatus === 'rejected'
          ? 'ordination.rejected'
          : null;
    const decisionHistoryAction =
      reviewStatus === 'approved'
        ? 'ordination_approved'
        : reviewStatus === 'rejected'
          ? 'ordination_rejected'
          : null;
    const decisionHistoryEntry = decisionHistoryAction
      ? [...history].reverse().find((entry) => entry?.action === decisionHistoryAction) || null
      : null;
    const decisionSummary = ['approved', 'rejected'].includes(reviewStatus)
      ? {
          status: reviewStatus,
          label: reviewStatus === 'approved' ? 'Godkänd ordination' : 'Avvisad ordination',
          tone: reviewStatus === 'approved' ? 'sage' : 'danger',
          decidedAt: caseRecord.ordinationReview?.decidedAt || null,
          decidedBy: caseRecord.ordinationReview?.decidedBy || null,
          signature: caseRecord.ordinationReview?.signature || null,
          comment: caseRecord.ordinationReview?.comment || '',
          auditAction: decisionAuditAction,
          auditReceipt: {
            action: decisionAuditAction,
            storeAction: decisionHistoryEntry?.action || decisionHistoryAction,
            caseId: caseRecord.id || null,
            patientId: caseRecord.patientId || null,
            tenantId: caseRecord.tenantId || null,
            actor: caseRecord.ordinationReview?.decidedBy || decisionHistoryEntry?.userId || null,
            actorRole:
              caseRecord.ordinationReview?.decidedByRole || decisionHistoryEntry?.role || null,
            at: caseRecord.ordinationReview?.decidedAt || decisionHistoryEntry?.at || null,
            signature: caseRecord.ordinationReview?.signature || null,
            immutable: true,
          },
          readOnly: true,
        }
      : null;
    return {
      treatmentPlan,
      readiness,
      missing,
      signoff: {
        status: reviewStatus || 'pending',
        decisionRequired: !['approved', 'rejected'].includes(reviewStatus),
        requiredActor: 'legitimerad läkare/ägare',
        signatureRequired: true,
        commentRequiredForReject: true,
        canApproveAfterManualReview: preDecisionMissing.length === 0,
        blockers: preDecisionMissing.map((item) => ({ key: item.key, label: item.label })),
        safety:
          'Läkaren måste granska underlaget manuellt. Systemet kan aldrig skapa ordination.approved automatiskt.',
      },
      completionReturn,
      followupEscalation:
        latestFollowupEscalation && isFollowupWaitingDoctor(caseRecord)
          ? {
              active: true,
              label: latestFollowupEscalation.label,
              at: latestFollowupEscalation.at,
              by: latestFollowupEscalation.userId || latestFollowupEscalation.role || null,
              safety:
                'Uppföljningen behöver läkarblick, men skapar ingen ordination och inget kundutskick automatiskt.',
            }
          : null,
      timeline,
      timelineSummary,
      decisionSummary,
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

  function classifyOrdinationWorkMode(caseRecord = {}, readout = {}) {
    const status = String(caseRecord.ordinationReview?.status || '').toLowerCase();
    if (readout.followupEscalation?.active) return 'followup';
    if (status === 'approved') return 'approved';
    if (status === 'rejected') return 'rejected';
    if (status === 'needs_completion') return 'completion';
    if (readout.timelineSummary?.returnedFromCompletion) return 'returned';
    return 'pending';
  }

  function buildOrdinationNextAction(caseRecord = {}, readout = {}) {
    const mode = classifyOrdinationWorkMode(caseRecord, readout);
    const signoffReady = Boolean(readout.signoff?.canApproveAfterManualReview);
    const presets = {
      returned: {
        mode,
        label: 'Granska igen',
        tone: 'sage',
        primary: 'Öppna underlag och fatta nytt beslut',
        description:
          'Personal har markerat kompletteringen klar. Läkaren behöver granska underlaget på nytt före godkännande eller avvisning.',
        owner: 'doctor',
        suggestedAction: 'review_again',
        canUseDecisionButtons: signoffReady,
      },
      completion: {
        mode,
        label: 'Väntar personal',
        tone: 'amber',
        primary: 'Invänta komplettering',
        description:
          'Läkaren har begärt komplettering. Nästa steg ägs av personal tills underlaget markeras klart.',
        owner: 'staff',
        suggestedAction: 'wait_for_completion',
        canUseDecisionButtons: false,
      },
      approved: {
        mode,
        label: 'Beslut klart',
        tone: 'sage',
        primary: 'Visa beslut',
        description:
          'Ordinationen är godkänd. Kortet är read-only för historik, audit och beslutssammanfattning.',
        owner: 'doctor',
        suggestedAction: 'read_decision',
        canUseDecisionButtons: false,
      },
      rejected: {
        mode,
        label: 'Beslut klart',
        tone: 'danger',
        primary: 'Visa motivering',
        description:
          'Ordinationen är avvisad. Kortet är read-only för historik, audit och motivering.',
        owner: 'doctor',
        suggestedAction: 'read_rejection',
        canUseDecisionButtons: false,
      },
      followup: {
        mode,
        label: 'Uppföljning',
        tone: 'info',
        primary: 'Granska uppföljningsunderlag',
        description:
          'Personal har markerat uppföljningen som behöver läkare. Öppna kundens workspace, titta på historik/bilder och återkoppla manuellt i rätt CCO-flöde.',
        owner: 'doctor',
        suggestedAction: 'review_followup',
        canUseDecisionButtons: false,
      },
      pending: {
        mode,
        label: signoffReady ? 'Redo för läkare' : 'Kontroll behövs',
        tone: signoffReady ? 'sage' : 'amber',
        primary: signoffReady ? 'Granska och signera manuellt' : 'Kontrollera blockerare',
        description: signoffReady
          ? 'Förhandskontrollerna är klara. Läkaren gör egen manuell bedömning före signatur.'
          : 'En eller flera readiness-punkter behöver kontrolleras innan trygg signering.',
        owner: signoffReady ? 'doctor' : 'staff',
        suggestedAction: signoffReady ? 'manual_review' : 'resolve_blockers',
        canUseDecisionButtons: signoffReady,
      },
    };
    return presets[mode] || presets.pending;
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
        label:
          ordinationStatus === 'needs_completion' ? 'Komplettering begärd' : 'Ordination väntar',
        severity:
          ordinationStatus === 'rejected'
            ? 'danger'
            : ordinationStatus === 'needs_completion'
              ? 'warning'
              : 'warning',
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
      completionRequest:
        ordinationStatus === 'needs_completion'
          ? {
              comment: caseRecord.ordinationReview?.comment || '',
              requestedBy: caseRecord.ordinationReview?.decidedBy || null,
              requestedAt: caseRecord.ordinationReview?.decidedAt || null,
            }
          : null,
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

    if (source === 'followup') {
      if (actionKeys.has('followup_needs_doctor')) {
        return {
          label: 'Öppna läkarspåret',
          reason: 'Uppföljningen är markerad som behöver läkare och ska följas upp manuellt.',
          href: links.doctorReview || links.workspace || links.customerCard || null,
          safety: 'Skapar ingen ordination och skickar inget till kund.',
        };
      }
      if (actionKeys.has('followup_overdue')) {
        return {
          label: 'Kontakta kunden',
          reason: 'Uppföljningen är försenad och bör hanteras från kundens workspace.',
          href: links.workspace || links.customerCard || null,
          safety: 'Öppnar bara underlaget; kontakt och journal sker manuellt.',
        };
      }
      if (actionKeys.has('photos')) {
        return {
          label: 'Granska uppföljningsbilder',
          reason: 'Kunden har bildunderlag kopplat till uppföljningen.',
          href: links.workspace || links.photos || links.customerCard || null,
          safety: 'Bilder ändras inte från radarn.',
        };
      }
      return {
        label: 'Öppna uppföljningen',
        reason: 'Uppföljningen behöver manuell kontroll.',
        href: links.workspace || links.customerCard || null,
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

  function buildRoleCards(item) {
    const actions = Array.isArray(item?.actions) ? item.actions : [];
    const actionKeys = new Set(actions.map((action) => String(action.key || '')));
    const next = item?.nextBestAction || buildNextBestAction(item);
    const baseTitle = item?.title || 'Prioritet';
    const baseBody = item?.body || next.reason || '';

    const nurse = {
      role: 'nurse',
      title: baseTitle,
      subtitle: baseBody || 'Hantera kundens fråga, bild eller handoff manuellt.',
      badge: 'Personal',
      focus: 'kundkontakt',
      ctaLabel: next.label || 'Öppna arbetsvy',
      href: next.href || item?.links?.staffTask || item?.links?.customerCard || null,
      safety: next.safety || 'Inga kundsvar skickas automatiskt.',
    };
    const doctor = {
      role: 'doctor',
      title: actionKeys.has('ordination') ? `Ordination: ${baseTitle}` : baseTitle,
      subtitle: actionKeys.has('ordination')
        ? 'Granska underlag för lokalbedövning och signera endast efter egen bedömning.'
        : baseBody || 'Granska bara de delar som kräver medicinskt ansvar.',
      badge: 'Läkare',
      focus: actionKeys.has('ordination') ? 'ordination' : 'klinisk granskning',
      ctaLabel: actionKeys.has('ordination') ? 'Öppna läkarkö' : next.label || 'Öppna underlag',
      href: item?.links?.doctorReview || item?.links?.ordination || next.href || null,
      safety: 'Ingen ordination godkänns utan läkarsignatur.',
    };
    const admin = {
      role: 'admin',
      title: baseTitle,
      subtitle: actionKeys.has('ordination')
        ? 'Följ flaskhalsen och säkerställ att rätt roll hanterar ärendet.'
        : baseBody || 'Koordinera ansvar, QMS och arbetsfördelning.',
      badge: 'Admin',
      focus: 'koordination',
      ctaLabel: item?.links?.adminCase ? 'Öppna adminärende' : next.label || 'Öppna',
      href: item?.links?.adminCase || next.href || item?.links?.customerCard || null,
      safety: 'Ändrar inget ansvar, audit eller status från radarn.',
    };

    if (item?.source === 'notification') {
      nurse.badge = notificationKindLabel(item.type);
      doctor.badge = notificationKindLabel(item.type);
      admin.badge = notificationKindLabel(item.type);
      admin.focus = 'notisuppföljning';
    }
    if (item?.source === 'followup') {
      nurse.badge = 'Uppföljning';
      nurse.focus = 'uppföljning';
      nurse.ctaLabel = 'Öppna uppföljningen';
      doctor.badge = 'Uppföljning';
      doctor.focus = actionKeys.has('followup_needs_doctor') ? 'klinisk granskning' : 'status';
      doctor.ctaLabel = actionKeys.has('followup_needs_doctor')
        ? 'Öppna läkarspår'
        : 'Visa underlag';
      admin.badge = 'Uppföljning';
      admin.focus = 'uppföljningsläge';
    }
    if (actionKeys.has('customer_reply')) {
      nurse.focus = 'kundsvar';
      nurse.ctaLabel = 'Öppna kundfrågan';
    }
    if (actionKeys.has('photos')) {
      nurse.focus = 'kundbilder';
      nurse.ctaLabel = 'Granska bilder';
    }
    if (actionKeys.has('checklist')) {
      nurse.focus = 'checklista';
      admin.focus = 'handoff';
    }

    return { nurse, doctor, admin };
  }

  function buildPriorityDetail(item) {
    if (item?.source === 'notification') {
      return {
        kind: 'notification',
        title: item.title || notificationKindLabel(item.type),
        status: item.read ? 'läst' : 'ny',
        customer: null,
        treatment: null,
        timing: item.createdAt || null,
        signals: [
          item.type ? `Typ: ${notificationKindLabel(item.type)}` : null,
          item.severity ? `Nivå: ${item.severity}` : null,
        ].filter(Boolean),
        remainingSteps: ['Öppna notisen och hantera manuellt i rätt vy.'],
        links: item.links || {},
      };
    }

    if (item?.source === 'followup') {
      const followup = item.followupItem || {};
      const latest = followup.followupHistorySummary || {};
      return {
        kind: 'followup',
        caseId: followup.caseId || null,
        customer: followup.customerName || item.title || 'Kund',
        patientId: followup.patientId || null,
        customerId: followup.customerId || null,
        status: followup.status || 'uppföljning',
        treatment: followup.treatment || 'Behandling ej angiven',
        timing: followup.startsAt || null,
        signals: [
          followup.milestone?.label ? `Milestone: ${followup.milestone.label}` : null,
          Number(followup.photos?.count || 0)
            ? `${followup.photos.count} bild${followup.photos.count === 1 ? '' : 'er'} finns`
            : null,
          latest.latestLabel ? `Senast: ${latest.latestLabel}` : null,
        ].filter(Boolean),
        remainingSteps: item.actions.map((action) => action.label || action.key).filter(Boolean),
        links: followup.links || item.links || {},
      };
    }

    const customerItem = item?.queueItem?.customer || {};
    const caseRecord = customerItem.case || {};
    const checklist = caseRecord.handoffChecklist || {};
    const checklistItems = Object.entries(checklist).map(([key, value]) => ({
      key,
      label: key,
      complete: value !== false,
    }));
    const missingChecklist = Object.entries(checklist)
      .filter(([, value]) => value === false)
      .map(([key]) => key);
    const actions = Array.isArray(item?.actions) ? item.actions : [];
    const treatment =
      caseRecord.serviceLabel ||
      caseRecord.treatmentType ||
      caseRecord.treatment ||
      caseRecord.service ||
      'Behandling ej angiven';

    return {
      kind: 'case',
      caseId: caseRecord.id || item.id || null,
      customer: customerItem.title || item.title || 'Kund',
      patientId: customerItem.patientId || item.patientId || null,
      customerId: customerItem.customerId || item.customerId || null,
      status: caseRecord.state || caseRecord.status || item.state || 'pending',
      treatment,
      timing: item.startsAt || caseRecord.startsAt || caseRecord.scheduledForIso || null,
      ordinationStatus: item.ordinationStatus || caseRecord.ordinationReview?.status || null,
      assignedTo: item.assignedTo || caseRecord.assignedTo || null,
      signals: [
        customerItem.threads?.needsReply
          ? `${customerItem.threads.needsReply} tråd kräver svar`
          : null,
        customerItem.photos?.count
          ? `${customerItem.photos.count} bild${customerItem.photos.count === 1 ? '' : 'er'} finns`
          : null,
        missingChecklist.length
          ? `${missingChecklist.length} checkpunkt${missingChecklist.length === 1 ? '' : 'er'} saknas`
          : null,
      ].filter(Boolean),
      remainingSteps: actions
        .filter((action) => action.key !== 'no_action')
        .map((action) => action.label || action.key)
        .filter(Boolean),
      checklistItems,
      missingChecklist,
      links: item.links || {},
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
    priorityItem.roleCards = buildRoleCards(priorityItem);
    priorityItem.detail = buildPriorityDetail(priorityItem);
    return priorityItem;
  }

  function buildFollowupPriorityItem(item, index = 0) {
    const needsDoctor = item.followupHistory?.some(
      (entry) => entry.action === 'staff_followup_needs_doctor'
    );
    const hasPhotos = Number(item.photos?.count || 0) > 0;
    const isOverdue = item.status === 'overdue';
    const priority =
      needsDoctor || isOverdue ? 'urgent' : item.status === 'due' ? 'today' : 'waiting';
    const priorityRank = needsDoctor
      ? 8 + index
      : isOverdue
        ? 12 + index
        : hasPhotos
          ? 24 + index
          : 32 + index;
    const actions = [
      isOverdue
        ? { key: 'followup_overdue', label: 'Försenad uppföljning', severity: 'urgent' }
        : null,
      item.status === 'due'
        ? { key: 'followup_due', label: 'Uppföljning idag', severity: 'today' }
        : null,
      needsDoctor
        ? { key: 'followup_needs_doctor', label: 'Behöver läkare', severity: 'urgent' }
        : null,
      hasPhotos
        ? {
            key: 'photos',
            label: `${item.photos.count} bild${item.photos.count === 1 ? '' : 'er'} finns`,
            severity: 'info',
          }
        : null,
    ].filter(Boolean);

    const priorityItem = {
      id: `followup:${item.caseId || item.patientId || index}`,
      source: 'followup',
      priority,
      priorityRank,
      title: `${item.customerName || item.patientId || 'Kund'} · ${item.milestone?.label || 'Uppföljning'}`,
      body: actions.map((action) => action.label).join(' · '),
      startsAt: item.startsAt || null,
      actionUrl: item.links?.workspace || item.links?.customerCard || null,
      links: item.links || {},
      actions,
      followupItem: item,
    };
    priorityItem.nextBestAction = buildNextBestAction(priorityItem);
    priorityItem.roleCards = buildRoleCards(priorityItem);
    priorityItem.detail = buildPriorityDetail(priorityItem);
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
    priorityItem.roleCards = buildRoleCards(priorityItem);
    priorityItem.detail = buildPriorityDetail(priorityItem);
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
        const followups = await Promise.all(
          (Array.isArray(cases) ? cases : [])
            .slice(0, 30)
            .map((item) => buildStaffFollowupItem(item, { tenantId }))
        );
        const queueItems = customers
          .map(buildDailyWorkQueueItem)
          .filter((item) => item.priority !== 'done');
        const notificationItems = (Array.isArray(feed?.items) ? feed.items : [])
          .filter(
            (item) =>
              !item.read || item.actionUrl || item.links?.staffPortal || item.links?.staffTask
          )
          .map(buildNotificationPriorityItem);
        const followupItems = followups
          .filter(Boolean)
          .filter((item) => {
            if (item.status === 'completed') return false;
            return (
              item.status === 'overdue' || item.waitingDoctor || Number(item.photos?.count || 0) > 0
            );
          })
          .map(buildFollowupPriorityItem);
        const followupCaseIds = new Set(
          followupItems.map((item) => item.followupItem?.caseId).filter(Boolean)
        );

        const items = [
          ...notificationItems,
          ...followupItems,
          ...queueItems.filter((item) => !followupCaseIds.has(item.id)).map(buildQueuePriorityItem),
        ]
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
          {
            total: 0,
            notification: 0,
            followup: 0,
            queue: 0,
            urgent: 0,
            today: 0,
            waiting: 0,
            done: 0,
          }
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

  /* ── GET /api/v1/staff/delegated-inbox ────────────────────────
     Read-only inbox för kundfrågor kopplade till personalens tilldelade kunder.
     Sjuksköterskor ser egna assignedTo-kunder; owner/operator kan läsa alla.
     Inga svar skickas och inga trådar markeras här.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/delegated-inbox',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const role = req.cco?.role ?? null;
        const userId = req.auth?.userId ?? null;
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const limit = Math.min(Number(req.query.limit) || 20, 60);
        const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

        let cases = [];
        if (bookingCaseStore) {
          cases = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            assignedTo: all ? null : userId || undefined,
            limit,
          });
        }

        const groupedItems = await Promise.all(
          cases
            .slice(0, limit)
            .map((item) => buildDelegatedInboxItems(item, { tenantId, limitPerCustomer: 4 }))
        );
        const items = groupedItems
          .flat()
          .sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')))
          .slice(0, limit);
        const summary = items.reduce(
          (acc, item) => {
            acc.total += 1;
            if (item.status === 'unanswered') acc.unanswered += 1;
            if (item.channel) acc.channels[item.channel] = (acc.channels[item.channel] || 0) + 1;
            return acc;
          },
          { total: 0, unanswered: 0, channels: {} }
        );

        res.json({
          ok: true,
          delegatedTo: all ? 'all' : userId || null,
          items,
          count: items.length,
          summary,
          safety: {
            readOnly: true,
            message:
              'Delegerad inbox visar kundfrågor för tilldelade kunder. Svar skrivs i CCO-konversationen med ordinarie audit.',
          },
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/delegated-photo-inbox ──────────────────
     Read-only bildinkorg för personalens tilldelade kunder.
     Visar metadata/senaste bilder, aldrig råfil eller journalbeslut.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/delegated-photo-inbox',
    requirePermission('photo.read'),
    async (req, res) => {
      try {
        const role = req.cco?.role ?? null;
        const userId = req.auth?.userId ?? null;
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const limit = Math.min(Number(req.query.limit) || 20, 60);
        const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

        let cases = [];
        if (bookingCaseStore) {
          cases = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            assignedTo: all ? null : userId || undefined,
            limit,
          });
        }

        const built = await Promise.all(
          cases.slice(0, limit).map((item) => buildDelegatedPhotoInboxItem(item, { tenantId }))
        );
        const items = built
          .filter(Boolean)
          .sort((a, b) => String(b.latestAt || '').localeCompare(String(a.latestAt || '')))
          .slice(0, limit);
        const summary = items.reduce(
          (acc, item) => {
            acc.total += 1;
            acc.photos += Number(item.count || 0);
            if (item.latestAt) acc.withRecent += 1;
            return acc;
          },
          { total: 0, photos: 0, withRecent: 0 }
        );

        res.json({
          ok: true,
          delegatedTo: all ? 'all' : userId || null,
          items,
          count: items.length,
          summary,
          safety: {
            readOnly: true,
            message:
              'Delegerad bildinkorg visar bildmetadata för tilldelade kunder. Råfiler och journalåtgärder hanteras i kundkort/workspace.',
          },
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/followups ──────────────────────────────
     Read-only uppföljningslista för ansvarig personal.
     Härleds från operations-/bokningsdatum och befintlig bildmetadata.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/followups', requirePermission('customers.read'), async (req, res) => {
    try {
      const role = req.cco?.role ?? null;
      const userId = req.auth?.userId ?? null;
      const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
      const limit = Math.min(Number(req.query.limit) || 20, 60);
      const mode = String(req.query.mode || 'all').trim();
      const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

      let cases = [];
      if (bookingCaseStore) {
        cases = await bookingCaseStore.listCases({
          tenantId: tenantId || undefined,
          assignedTo: all ? null : userId || undefined,
          limit,
        });
      }

      const built = await Promise.all(
        cases.slice(0, limit).map((item) => buildStaffFollowupItem(item, { tenantId }))
      );
      const filtered = built.filter(Boolean).filter((item) => {
        if (mode === 'all') return true;
        if (mode === 'overdue') return item.status === 'overdue';
        if (mode === 'due') return item.status === 'due';
        if (mode === 'upcoming')
          return item.status === 'upcoming' || item.status === 'upcoming_operation';
        if (mode === 'with_photos') return Number(item.photos?.count || 0) > 0;
        if (mode === 'waiting_doctor') return Boolean(item.waitingDoctor);
        if (mode === 'completed') return item.status === 'completed';
        if (mode === 'needs_doctor') {
          return item.followupHistory?.some(
            (entry) => entry.action === 'staff_followup_needs_doctor'
          );
        }
        return true;
      });
      const items = filtered
        .sort(
          (a, b) =>
            a.priorityRank - b.priorityRank ||
            Math.abs(a.daysUntil || 0) - Math.abs(b.daysUntil || 0) ||
            String(a.startsAt || '').localeCompare(String(b.startsAt || ''))
        )
        .slice(0, limit);
      const summarySource = built.filter(Boolean);
      const summary = summarySource.reduce(
        (acc, item) => {
          acc.total += 1;
          acc[item.status] = (acc[item.status] || 0) + 1;
          if (item.photos?.count) acc.withPhotos += 1;
          if (item.waitingDoctor) acc.waitingDoctor += 1;
          if (
            item.followupHistory?.some((entry) => entry.action === 'staff_followup_needs_doctor')
          ) {
            acc.needsDoctor += 1;
          }
          return acc;
        },
        {
          total: 0,
          overdue: 0,
          due: 0,
          upcoming: 0,
          upcoming_operation: 0,
          withPhotos: 0,
          needsDoctor: 0,
          waitingDoctor: 0,
          completed: 0,
        }
      );

      res.json({
        ok: true,
        delegatedTo: all ? 'all' : userId || null,
        mode,
        items,
        count: items.length,
        summary,
        milestones: FOLLOWUP_MILESTONES,
        safety: {
          readOnly: true,
          message:
            'Uppföljningar är prioriteringsstöd. Kontakt, bildgranskning och journal förs i ordinarie CCO-flöde.',
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── POST /api/v1/staff/followups/:id/action ─────────────────
     Säkra uppföljningsåtgärder med audit.
     Skickar inga meddelanden, skriver ingen journal och fattar inga kliniska beslut.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/followups/:id/action',
    requirePermission('customers.read'),
    async (req, res) => {
      const id = String(req.params.id || '').trim();
      const action = String(req.body?.action || '').trim();
      const allowed = new Set([
        'followup_contacted',
        'followup_needs_doctor',
        'followup_journal_draft',
        'followup_completed',
      ]);

      if (!id) return res.status(400).json({ ok: false, error: 'Ärende-id krävs.' });
      if (!allowed.has(action)) {
        return res.status(400).json({
          ok: false,
          error: 'Ogiltig uppföljningsåtgärd.',
          allowed: [...allowed],
        });
      }
      if (!bookingCaseStore?.recordStaffAction) {
        return res.status(503).json({ ok: false, error: 'Booking case store saknas.' });
      }

      try {
        const caseRecord = await bookingCaseStore.recordStaffAction(id, { action }, getActor(req));

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: `staff_portal.${action}`,
            actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
            target: { kind: 'booking_case', id, tenantId: req.auth?.tenantId ?? null },
            result: 'ok',
            detail: {
              safety:
                'Uppföljningsåtgärden är intern. Ingen kundkontakt, journal eller ordination skapas automatiskt.',
            },
          });
        }

        return res.json({
          ok: true,
          action,
          case: caseRecord,
          safety: {
            noAutoSend: true,
            noAutoJournal: true,
            message:
              'Åtgärden är audit-loggad. Fortsatt kundkontakt, journal och läkarbedömning görs i ordinarie CCO-flöde.',
          },
        });
      } catch (err) {
        return handleWriteError(res, err);
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
        const requestedMode = String(req.query.mode || 'pending')
          .trim()
          .toLowerCase();
        const mode = [
          'all',
          'pending',
          'returned',
          'completion',
          'followup',
          'approved',
          'rejected',
        ].includes(requestedMode)
          ? requestedMode
          : 'pending';

        let reviews = [];
        let modes = {
          all: 0,
          pending: 0,
          returned: 0,
          completion: 0,
          followup: 0,
          approved: 0,
          rejected: 0,
        };
        if (bookingCaseStore) {
          const allOpen = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            limit: limit * 8,
          });
          const followupReadouts = await Promise.all(
            allOpen.map((c) => buildStaffFollowupItem(c, { tenantId: tenantId || undefined }))
          );
          const followupByCaseId = new Map(
            followupReadouts.filter(Boolean).map((item) => [item.caseId, item])
          );
          const builtReviews = allOpen
            .filter((c) => !['completed', 'cancelled'].includes(c.state))
            .filter(
              (c) =>
                isTreatmentRequiringOrdination(c) ||
                c.ordinationReview ||
                hasFollowupDoctorEscalation(c)
            )
            .map((c) => {
              const ordinationReadout = buildOrdinationReviewReadout(c);
              const followupItem = followupByCaseId.get(c.id);
              if (ordinationReadout.followupEscalation?.active && followupItem) {
                ordinationReadout.followupEscalation.photos = followupItem.photos;
                ordinationReadout.followupEscalation.links = followupItem.links;
              }
              const workMode = classifyOrdinationWorkMode(c, ordinationReadout);
              const nextAction = buildOrdinationNextAction(c, ordinationReadout);
              return {
                ...c,
                workMode,
                nextAction,
                ordinationReadout,
              };
            });
          modes = builtReviews.reduce(
            (acc, item) => {
              acc.all += 1;
              if (acc[item.workMode] !== undefined) acc[item.workMode] += 1;
              return acc;
            },
            { ...modes }
          );
          reviews = builtReviews
            .filter((item) => mode === 'all' || item.workMode === mode)
            .slice(0, limit);
        }
        res.json({ ok: true, reviews, count: reviews.length, mode, modes });
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
      const targetId = req.query.caseId || req.query.targetId || null;

      const entries = ccoAuditLog ? ccoAuditLog.query({ limit, since, action, targetId }) : [];

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

  /* ── GET /api/v1/staff/customer-followup-status/:patientId ─────
     Kundkort/workspace-bro för uppföljningsstatus.
     Returnerar read-only status + timeline-events; skriver ingen journal.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/customer-followup-status/:patientId',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const patientId = String(req.params.patientId || '').trim();
        const customerId = String(req.query.customerId || '').trim();
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';

        if (!patientId) {
          return res.status(400).json({ ok: false, error: 'patientId krävs.' });
        }

        const status = await buildCustomerFollowupStatus({
          patientId,
          customerId,
          tenantId,
        });

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'staff_portal.customer_followup_status.read',
            actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
            target: { kind: 'patient_followup_status', id: patientId, tenantId },
            result: 'ok',
            detail: {
              total: status?.summary?.total || 0,
              waitingDoctor: status?.summary?.waitingDoctor || 0,
              completed: status?.summary?.completed || 0,
            },
          });
        }

        return res.json({
          ok: true,
          ...(status || {
            patientId,
            customerId: customerId || null,
            current: null,
            followups: [],
            timelineEvents: [],
            summary: { total: 0 },
            safety: {
              readOnly: true,
              noAutoJournal: true,
              message: 'Ingen uppföljningsstatus hittades för kunden.',
            },
          }),
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
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

  /* ── POST /api/v1/staff/ordination-reviews/:id/request-completion ─
     Läkare begär komplettering från personal utan att avvisa ärendet.
     Kräver motivering och audit-loggas. Ingen ordination godkänns.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/ordination-reviews/:id/request-completion',
    requirePermission('ordination.approve'),
    async (req, res) => {
      const { id } = req.params;
      const { comment = '', signature = '' } = req.body ?? {};
      const trimmedComment = String(comment || '').trim();
      const trimmedSignature = String(signature || '').trim();

      if (!trimmedComment || trimmedComment.length < 5) {
        return res.status(400).json({ ok: false, error: 'Kompletteringsinstruktion krävs.' });
      }

      if (!trimmedSignature || trimmedSignature.length < 2) {
        return res.status(400).json({ ok: false, error: 'Signatur krävs vid komplettering.' });
      }

      let caseRecord = null;
      try {
        if (bookingCaseStore?.updateOrdinationReview) {
          caseRecord = await bookingCaseStore.updateOrdinationReview(
            id,
            {
              status: 'needs_completion',
              signature: trimmedSignature,
              comment: trimmedComment,
            },
            getActor(req)
          );
        }
      } catch (err) {
        return handleWriteError(res, err);
      }

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'ordination.completion_requested',
          actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { signature: trimmedSignature, comment: trimmedComment },
        });
      }

      res.json({
        ok: true,
        reviewId: id,
        status: 'needs_completion',
        requestedBy: req.auth?.userId ?? req.session?.userId ?? 'unknown',
        requestedAt: new Date().toISOString(),
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
