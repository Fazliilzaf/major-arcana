'use strict';

/**
 * Patient Portal routes.
 *
 * Token-based pre-visit form intake: patient receives a link, fills in
 * hälsodeklaration/friskförsäkran, data syncs into journal.
 *
 * Replaces Meridiq registration portal functionality.
 */

const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

function createPatientPortalRouter({
  patientPortalStore,
  journalStore,
  auditLog = null,
  bookingCaseStore = null,
  journalPhotoStore = null,
}) {
  const router = express.Router();
  const followupPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
      const mime = normalizeText(file?.mimetype).toLowerCase();
      if (!['image/jpeg', 'image/png'].includes(mime)) {
        const error = new Error('Endast JPG eller PNG stöds.');
        error.statusCode = 415;
        return cb(error);
      }
      return cb(null, true);
    },
  });

  const FOLLOWUP_MILESTONES = [
    { key: 'postop_day_1', day: 1, label: 'Postop dag 1' },
    { key: 'postop_day_7', day: 7, label: 'Postop dag 7' },
    { key: 'postop_day_30', day: 30, label: 'Postop dag 30' },
    { key: 'followup_month_4', day: 120, label: 'Uppföljning 4 månader' },
    { key: 'followup_month_6', day: 180, label: 'Uppföljning 6 månader' },
    { key: 'followup_month_12', day: 365, label: 'Resultatuppföljning 12 månader' },
  ];

  function logPortalAudit(kind, detail = {}) {
    try {
      if (auditLog?.logEvent) {
        auditLog.logEvent({
          kind,
          tenantId: detail.tenantId || 'hair_tp',
          actor: 'patient:portal',
          entityKind: 'patient_portal_invite',
          entityId: detail.token ? detail.token.slice(0, 8) + '…' : null,
          detail: {
            patientId: detail.patientId || null,
            outcome: detail.outcome || null,
            ip: detail.ip || null,
            userAgent: detail.userAgent ? detail.userAgent.slice(0, 80) : null,
            formCount: detail.formCount || null,
          },
        });
      }
    } catch {
      /* audit-bind fail ignored */
    }
  }

  function getClientIp(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  function latestHistoryAt(caseRecord = {}, action) {
    const history = Array.isArray(caseRecord.history) ? caseRecord.history : [];
    return history
      .filter((entry) => entry?.action === action && entry.at)
      .map((entry) => Date.parse(entry.at))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
  }

  function isFollowupCompleted(caseRecord = {}) {
    const completedAt = latestHistoryAt(caseRecord, 'staff_followup_completed');
    if (!completedAt) return false;
    const needsDoctorAt = latestHistoryAt(caseRecord, 'staff_followup_needs_doctor');
    return !needsDoctorAt || completedAt >= needsDoctorAt;
  }

  function isFollowupWaitingClinic(caseRecord = {}) {
    const needsDoctorAt = latestHistoryAt(caseRecord, 'staff_followup_needs_doctor');
    if (!needsDoctorAt) return false;
    const completedAt = latestHistoryAt(caseRecord, 'staff_followup_completed');
    return !completedAt || completedAt < needsDoctorAt;
  }

  function daysSince(startIso, now = new Date()) {
    const startMs = Date.parse(startIso || '');
    if (!Number.isFinite(startMs)) return null;
    return Math.floor((now.getTime() - startMs) / 86400000);
  }

  function buildPatientFollowupItem(caseRecord = {}, { now = new Date() } = {}) {
    const startsAt = caseRecord.startsAt || caseRecord.scheduledAt || caseRecord.scheduledForIso;
    const elapsedDays = daysSince(startsAt, now);
    if (elapsedDays === null) return null;
    const completed = isFollowupCompleted(caseRecord);
    const waitingClinic = isFollowupWaitingClinic(caseRecord);
    const nextMilestone =
      FOLLOWUP_MILESTONES.find((item) => elapsedDays < item.day) ||
      FOLLOWUP_MILESTONES[FOLLOWUP_MILESTONES.length - 1];
    const activeMilestone =
      FOLLOWUP_MILESTONES.filter((item) => elapsedDays >= item.day).at(-1) || nextMilestone;
    const daysUntil = activeMilestone.day - elapsedDays;
    const status = completed
      ? 'completed'
      : waitingClinic
        ? 'clinic_review'
        : elapsedDays < 0
          ? 'before_treatment'
          : daysUntil > 0
            ? 'upcoming'
            : Math.abs(daysUntil) <= 2
              ? 'due'
              : 'overdue';
    return {
      caseId: caseRecord.id || null,
      treatment: caseRecord.serviceLabel || caseRecord.treatment || 'Behandling',
      treatmentDate: startsAt || null,
      daysSinceTreatment: elapsedDays,
      status,
      label:
        status === 'completed'
          ? 'Uppföljning klar'
          : status === 'clinic_review'
            ? 'Kliniken granskar'
            : status === 'overdue'
              ? 'Uppföljning väntar'
              : status === 'due'
                ? 'Dags för uppföljning'
                : status === 'before_treatment'
                  ? 'Inför behandling'
                  : 'Nästa uppföljning',
      milestone: activeMilestone,
      nextMilestone,
      daysUntil,
      readOnly: true,
    };
  }

  function buildPatientAftercareActions(item = null, uploadToken = null) {
    if (!item) return [];
    const base = [
      {
        id: 'aftercare_read',
        label: 'Läs eftervården',
        description:
          'Följ instruktionerna du fått från kliniken. Kontakta oss om något avviker eller känns oklart.',
        state: 'available',
        type: 'read_only',
      },
    ];
    if (item.status === 'clinic_review') {
      return [
        {
          id: 'clinic_review_wait',
          label: 'Kliniken granskar',
          description:
            'Ditt underlag ligger hos kliniken. Du behöver inte göra något mer just nu om vi inte ber om komplettering.',
          state: 'waiting_clinic',
          type: 'read_only',
        },
        ...base,
      ];
    }
    if (item.status === 'due' || item.status === 'overdue') {
      const uploadEnabled = Boolean(uploadToken?.token);
      return [
        {
          id: 'prepare_followup_photos',
          label: 'Förbered uppföljningsbilder',
          description: uploadEnabled
            ? 'Kliniken har öppnat en säker bilduppladdning. Ta bilder i bra ljus, från samma vinklar, utan filter.'
            : 'Om kliniken ber om bilder: ta dem i bra ljus, från samma vinklar, utan filter. Uppladdning aktiveras bara via säker kliniklänk.',
          state: uploadEnabled ? 'available' : 'prepared',
          type: 'photo_upload_intent',
          uploadEnabled,
          uploadUrl: uploadEnabled
            ? `/api/patient-portal/followup-photo-upload/${uploadToken.token}`
            : null,
          expiresAt: uploadToken?.expiresAt || null,
          remainingUploads:
            uploadToken && Number.isFinite(uploadToken.remainingUploads)
              ? uploadToken.remainingUploads
              : null,
        },
        ...base,
      ];
    }
    if (item.status === 'completed') {
      return [
        {
          id: 'followup_completed',
          label: 'Uppföljning klar',
          description:
            'Kliniken har markerat uppföljningen som klar. Historiken finns kvar hos kliniken.',
          state: 'done',
          type: 'read_only',
        },
        ...base,
      ];
    }
    return [
      {
        id: 'next_followup',
        label: 'Nästa steg visas här',
        description: 'När det är dags för nästa uppföljning visar portalen vad som är aktuellt.',
        state: 'planned',
        type: 'read_only',
      },
      ...base,
    ];
  }

  async function findActiveFollowupUploadToken(invite = {}, item = null) {
    if (!item?.caseId || !patientPortalStore?.findFollowupUploadTokenForCase) return null;
    return patientPortalStore.findFollowupUploadTokenForCase({
      tenantId: invite.tenantId,
      patientId: invite.patientId,
      caseId: item.caseId,
      milestoneKey: item.milestone?.key,
    });
  }

  async function buildPatientFollowupStatus(invite = {}) {
    if (!bookingCaseStore?.listCasesForCustomer || !invite?.patientId) return null;
    const cases = await bookingCaseStore.listCasesForCustomer({
      tenantId: invite.tenantId || undefined,
      patientId: invite.patientId,
      customerId: invite.customerId || undefined,
      limit: 20,
    });
    const items = (Array.isArray(cases) ? cases : [])
      .map((item) => buildPatientFollowupItem(item))
      .filter(Boolean)
      .sort((a, b) => {
        const rank = {
          clinic_review: 10,
          overdue: 20,
          due: 30,
          upcoming: 40,
          before_treatment: 50,
          completed: 90,
        };
        return (rank[a.status] || 80) - (rank[b.status] || 80);
      });
    if (!items.length) return null;
    const current = items[0];
    const uploadToken = await findActiveFollowupUploadToken(invite, current);
    const patientActions = buildPatientAftercareActions(current, uploadToken);
    return {
      current,
      items,
      patientActions,
      uploadIntents: patientActions
        .filter((action) => action.type === 'photo_upload_intent')
        .map((action) => ({
          id: action.id,
          label: action.label,
          enabled: action.uploadEnabled === true,
          reason:
            action.uploadEnabled === true
              ? null
              : 'Kräver separat säker upload-token från kliniken.',
          url: action.uploadUrl || null,
          expiresAt: action.expiresAt || null,
          remainingUploads: action.remainingUploads ?? null,
        })),
      summary: {
        total: items.length,
        clinicReview: items.filter((item) => item.status === 'clinic_review').length,
        due: items.filter((item) => item.status === 'due' || item.status === 'overdue').length,
        completed: items.filter((item) => item.status === 'completed').length,
      },
      safety: {
        readOnly: true,
        message:
          'Det här är en trygg översikt. Journalanteckningar och medicinska beslut hanteras alltid av kliniken.',
      },
    };
  }

  router.post('/patient-portal/followup-photo-upload/:uploadToken', async (req, res) => {
    followupPhotoUpload.single('photo')(req, res, async (uploadError) => {
      const uploadToken = normalizeText(req.params?.uploadToken);
      const ip = getClientIp(req);
      const ua = req.headers['user-agent'] || '';

      try {
        if (!uploadToken) {
          return res.status(400).json({ ok: false, error: 'missing_upload_token' });
        }
        if (uploadError) {
          const isTooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
          logPortalAudit('portal.followup_photo.upload_failed', {
            token: uploadToken,
            ip,
            userAgent: ua,
            outcome: isTooLarge ? 'file_too_large' : 'invalid_file_type',
          });
          return res.status(isTooLarge ? 413 : uploadError.statusCode || 415).json({
            ok: false,
            error: isTooLarge ? 'file_too_large' : 'invalid_file_type',
            message: uploadError.message || 'Bilden kunde inte laddas upp.',
          });
        }
        if (!journalPhotoStore?.savePhoto) {
          return res.status(503).json({
            ok: false,
            error: 'photo_store_unavailable',
            message: 'Bilduppladdning är inte aktiv just nu.',
          });
        }
        const tokenRecord = await patientPortalStore.findFollowupUploadToken(uploadToken);
        if (!tokenRecord) {
          logPortalAudit('portal.followup_photo.upload_failed', {
            token: uploadToken,
            ip,
            userAgent: ua,
            outcome: 'upload_token_invalid',
          });
          return res.status(404).json({
            ok: false,
            error: 'upload_token_invalid',
            message: 'Uppladdningslänken är ogiltig eller har gått ut.',
          });
        }
        if (!req.file?.buffer?.length) {
          return res.status(400).json({
            ok: false,
            error: 'missing_photo',
            message: 'Välj en bild innan du laddar upp.',
          });
        }

        const photo = await journalPhotoStore.savePhoto({
          tenantId: tokenRecord.tenantId,
          patientId: tokenRecord.patientId,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
        });
        const updatedToken = await patientPortalStore.recordFollowupUpload(uploadToken, {
          photo,
          ip,
          userAgent: ua,
        });

        logPortalAudit('portal.followup_photo.uploaded', {
          token: uploadToken,
          ip,
          userAgent: ua,
          tenantId: tokenRecord.tenantId,
          patientId: tokenRecord.patientId,
          outcome: 'uploaded',
        });

        return res.json({
          ok: true,
          caseId: tokenRecord.caseId,
          milestoneKey: tokenRecord.milestoneKey,
          remainingUploads: updatedToken?.remainingUploads ?? 0,
          photo: {
            photoId: photo.photoId,
            fileName: photo.fileName,
            byteSize: photo.byteSize,
            storedAt: photo.storedAt,
          },
        });
      } catch (_err) {
        logPortalAudit('portal.followup_photo.upload_failed', {
          token: uploadToken,
          ip,
          userAgent: ua,
          outcome: 'upload_failed',
        });
        return res.status(500).json({
          ok: false,
          error: 'upload_failed',
          message: 'Bilden kunde inte sparas. Försök igen eller kontakta kliniken.',
        });
      }
    });
  });

  router.get('/patient-portal/:token', async (req, res) => {
    const token = normalizeText(req.params?.token);
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    if (!token) {
      logPortalAudit('portal.invite.view_failed', { ip, userAgent: ua, outcome: 'missing_token' });
      return res.status(400).json({ ok: false, error: 'missing_token' });
    }

    const invite = await patientPortalStore.findInvite(token);
    if (!invite) {
      logPortalAudit('portal.invite.view_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'invite_not_found',
      });
      return res.status(404).json({
        ok: false,
        error: 'invite_not_found',
        message: 'Länken är ogiltig eller har utgått.',
      });
    }
    if (invite.completedAt) {
      logPortalAudit('portal.invite.viewed', {
        token,
        ip,
        userAgent: ua,
        tenantId: invite.tenantId,
        patientId: invite.patientId,
        outcome: 'already_completed',
      });
      const followupStatus = await buildPatientFollowupStatus(invite);
      return res.json({
        ok: true,
        status: 'completed',
        message: 'Formuläret är redan inskickat.',
        invite: {
          patientName: invite.patientName,
          serviceLabel: invite.serviceLabel,
        },
        followupStatus,
      });
    }
    logPortalAudit('portal.invite.viewed', {
      token,
      ip,
      userAgent: ua,
      tenantId: invite.tenantId,
      patientId: invite.patientId,
      outcome: 'opened',
      formCount: (invite.forms || []).length,
    });
    const followupStatus = await buildPatientFollowupStatus(invite);
    return res.json({
      ok: true,
      status: 'pending',
      invite: {
        patientName: invite.patientName,
        serviceLabel: invite.serviceLabel,
        appointmentDate: invite.appointmentDate,
        forms: invite.forms,
        expiresAt: invite.expiresAt,
      },
      followupStatus,
    });
  });

  router.post('/patient-portal/:token/submit', async (req, res) => {
    const token = normalizeText(req.params?.token);
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    if (!token) {
      logPortalAudit('portal.submit_failed', { ip, userAgent: ua, outcome: 'missing_token' });
      return res.status(400).json({ ok: false, error: 'missing_token' });
    }

    const invite = await patientPortalStore.findInvite(token);
    if (!invite) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'invite_expired',
      });
      return res.status(404).json({ ok: false, error: 'invite_expired' });
    }
    if (invite.completedAt) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        tenantId: invite.tenantId,
        patientId: invite.patientId,
        outcome: 'already_submitted',
      });
      return res.status(409).json({ ok: false, error: 'already_submitted' });
    }

    const formData = req.body?.formData || {};
    const signature = normalizeText(req.body?.signature);

    // Sprint 14A: Server-side form-spec validation
    if (!signature || signature.length < 2) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        tenantId: invite.tenantId,
        patientId: invite.patientId,
        outcome: 'missing_signature',
      });
      return res
        .status(400)
        .json({ ok: false, error: 'missing_signature', message: 'Signatur krävs (namnteckning).' });
    }
    if (signature.length > 200) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'signature_too_long',
      });
      return res.status(400).json({ ok: false, error: 'signature_too_long' });
    }
    if (formData == null || typeof formData !== 'object' || Array.isArray(formData)) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'invalid_formdata_type',
      });
      return res.status(400).json({ ok: false, error: 'invalid_formdata_type' });
    }
    let formDataSize = 0;
    try {
      formDataSize = JSON.stringify(formData).length;
    } catch (_e) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'formdata_serialization_failed',
      });
      return res.status(400).json({ ok: false, error: 'invalid_formdata' });
    }
    if (formDataSize > 100 * 1024) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'formdata_too_large',
      });
      return res.status(413).json({
        ok: false,
        error: 'formdata_too_large',
        message: 'Formuläret är för stort. Kontakta kliniken.',
      });
    }
    const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
    function hasDangerousKeys(obj, depth = 0) {
      if (depth > 8) return true;
      if (obj == null || typeof obj !== 'object') return false;
      for (const key of Object.keys(obj)) {
        if (DANGEROUS_KEYS.includes(key)) return true;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (hasDangerousKeys(obj[key], depth + 1)) return true;
        }
      }
      return false;
    }
    if (hasDangerousKeys(formData)) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'dangerous_keys_in_formdata',
      });
      return res.status(400).json({ ok: false, error: 'invalid_formdata' });
    }

    await patientPortalStore.completeInvite(token, {
      formData,
      signature,
      submitIp: ip,
      submitUserAgent: ua,
    });

    let journalEntriesCreated = 0;
    if (journalStore && invite.patientId && invite.forms?.length > 0) {
      for (const form of invite.forms) {
        try {
          await journalStore.createEntry({
            tenantId: invite.tenantId,
            patientId: invite.patientId,
            journalType: form.journalType || 'health_declaration',
            formVariant: form.formVariant || 'hair_tp',
            fields: formData[form.formId] || formData,
            encounterId: invite.encounterId || '',
            source: 'patient_portal',
            metadata: { portalToken: token, submittedAt: nowIso(), submitIp: ip },
          });
          journalEntriesCreated += 1;
        } catch (_err) {
          /* journal sync failure non-blocking */
        }
      }
    }

    logPortalAudit('portal.submitted', {
      token,
      ip,
      userAgent: ua,
      tenantId: invite.tenantId,
      patientId: invite.patientId,
      outcome: 'completed',
      formCount: (invite.forms || []).length,
    });

    return res.json({
      ok: true,
      status: 'completed',
      message: 'Tack! Formuläret är inskickat.',
      journalEntriesCreated,
    });
  });

  return router;
}

function createPatientPortalStore({ filePath }) {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  let state = { invites: [], followupUploadTokens: [] };

  function ensureStateShape() {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      state = { invites: [], followupUploadTokens: [] };
    }
    if (!Array.isArray(state.invites)) state.invites = [];
    if (!Array.isArray(state.followupUploadTokens)) state.followupUploadTokens = [];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function activeUploadToken(record = {}) {
    if (!record?.token || record.revokedAt) return false;
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) return false;
    const maxPhotos = clampInt(record.maxPhotos, 1, 12, 6);
    const usedCount = clampInt(record.usedCount, 0, 9999, 0);
    return usedCount < maxPhotos;
  }

  function withRemainingUploads(record = {}) {
    const item = clone(record);
    const maxPhotos = clampInt(item.maxPhotos, 1, 12, 6);
    const usedCount = clampInt(item.usedCount, 0, 9999, 0);
    item.remainingUploads = Math.max(0, maxPhotos - usedCount);
    return item;
  }

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
    ensureStateShape();
  }

  async function persist() {
    ensureStateShape();
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  async function createFollowupUploadToken({
    tenantId,
    patientId,
    caseId,
    milestoneKey,
    label,
    maxPhotos = 6,
    expiresInHours = 72,
  }) {
    ensureStateShape();
    const token = crypto.randomBytes(32).toString('base64url');
    const record = {
      token,
      tenantId: normalizeText(tenantId),
      patientId: normalizeText(patientId),
      caseId: normalizeText(caseId),
      milestoneKey: normalizeText(milestoneKey),
      label: normalizeText(label) || 'Uppföljningsbilder',
      maxPhotos: clampInt(maxPhotos, 1, 12, 6),
      usedCount: 0,
      uploadedPhotos: [],
      expiresAt: new Date(
        Date.now() + clampInt(expiresInHours, 1, 24 * 30, 72) * 60 * 60 * 1000
      ).toISOString(),
      createdAt: nowIso(),
      revokedAt: null,
    };
    state.followupUploadTokens.push(record);
    await persist();
    return withRemainingUploads(record);
  }

  async function findFollowupUploadToken(token) {
    ensureStateShape();
    const record = state.followupUploadTokens.find((item) => item.token === token);
    if (!activeUploadToken(record)) return null;
    return withRemainingUploads(record);
  }

  async function findFollowupUploadTokenForCase({ tenantId, patientId, caseId, milestoneKey }) {
    ensureStateShape();
    const tid = normalizeText(tenantId);
    const pid = normalizeText(patientId);
    const cid = normalizeText(caseId);
    const mid = normalizeText(milestoneKey);
    const record = state.followupUploadTokens
      .filter(
        (item) =>
          activeUploadToken(item) &&
          item.tenantId === tid &&
          item.patientId === pid &&
          item.caseId === cid &&
          (!mid || item.milestoneKey === mid)
      )
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))[0];
    return record ? withRemainingUploads(record) : null;
  }

  async function findLatestFollowupUploadTokenForCase({
    tenantId,
    patientId,
    caseId,
    milestoneKey,
  }) {
    ensureStateShape();
    const tid = normalizeText(tenantId);
    const pid = normalizeText(patientId);
    const cid = normalizeText(caseId);
    const mid = normalizeText(milestoneKey);
    const record = state.followupUploadTokens
      .filter(
        (item) =>
          item?.token &&
          !item.revokedAt &&
          item.tenantId === tid &&
          item.patientId === pid &&
          item.caseId === cid &&
          (!mid || item.milestoneKey === mid)
      )
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))[0];
    return record ? withRemainingUploads(record) : null;
  }

  async function recordFollowupUpload(token, { photo, ip, userAgent } = {}) {
    ensureStateShape();
    const record = state.followupUploadTokens.find((item) => item.token === token);
    if (!activeUploadToken(record)) return null;
    record.usedCount = clampInt(record.usedCount, 0, 9999, 0) + 1;
    record.uploadedPhotos = Array.isArray(record.uploadedPhotos) ? record.uploadedPhotos : [];
    record.uploadedPhotos.push({
      photoId: normalizeText(photo?.photoId),
      fileName: normalizeText(photo?.fileName),
      byteSize: Number.isFinite(Number(photo?.byteSize)) ? Number(photo.byteSize) : 0,
      storedAt: normalizeText(photo?.storedAt) || nowIso(),
      ip: normalizeText(ip),
      userAgent: normalizeText(userAgent).slice(0, 80),
    });
    await persist();
    return withRemainingUploads(record);
  }

  async function createInvite({
    tenantId,
    patientId,
    patientName,
    serviceLabel,
    appointmentDate,
    forms = [],
    encounterId,
    expiresInDays = 7,
  }) {
    const token = crypto.randomBytes(24).toString('base64url');
    const invite = {
      token,
      tenantId: normalizeText(tenantId),
      patientId: normalizeText(patientId),
      patientName: normalizeText(patientName),
      serviceLabel: normalizeText(serviceLabel),
      appointmentDate: normalizeText(appointmentDate),
      encounterId: normalizeText(encounterId),
      forms: forms.map((f) => ({
        formId: normalizeText(f.formId) || crypto.randomUUID(),
        journalType: normalizeText(f.journalType) || 'health_declaration',
        formVariant: normalizeText(f.formVariant) || 'hair_tp',
        label: normalizeText(f.label) || 'Hälsodeklaration',
      })),
      expiresAt: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
      createdAt: nowIso(),
      completedAt: null,
      formData: null,
      signature: null,
    };
    state.invites.push(invite);
    await persist();
    return invite;
  }

  async function findInvite(token) {
    const invite = state.invites.find((i) => i.token === token);
    if (!invite) return null;
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date() && !invite.completedAt)
      return null;
    return invite;
  }

  async function completeInvite(token, { formData, signature }) {
    const invite = state.invites.find((i) => i.token === token);
    if (!invite) return null;
    invite.completedAt = nowIso();
    invite.formData = formData;
    invite.signature = normalizeText(signature);
    await persist();
    return invite;
  }

  function listPending(tenantId) {
    const tid = normalizeText(tenantId);
    return state.invites.filter((i) => (!tid || i.tenantId === tid) && !i.completedAt);
  }

  return {
    load,
    persist,
    createInvite,
    findInvite,
    completeInvite,
    listPending,
    createFollowupUploadToken,
    findFollowupUploadToken,
    findFollowupUploadTokenForCase,
    findLatestFollowupUploadTokenForCase,
    recordFollowupUpload,
  };
}

module.exports = { createPatientPortalRouter, createPatientPortalStore };
