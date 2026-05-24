'use strict';

/**
 * Post-Op Review routes — Fas 1 + Fas 1.B (photo upload).
 *
 * Spec: docs/strategy/post-op-review-photo-flow.md
 *
 * Endpoints:
 * - Operator trigger (auth) → reviewLink + emailDraft
 * - Patient lookup, submit, review-clicked beacon (token-skyddat)
 * - Patient photo-upload (token-skyddat, multer + piexifjs EXIF-strip)
 *
 * GDPR: piexifjs strippar ALL EXIF från JPEG (inkl. GPS, kamera-serie,
 * timestamp) innan disk-skrivning. PNG passar igenom — saknar EXIF-segment
 * i baseline-spec. HEIC/HEIF avvisas (skulle behöva separate dekoder).
 *
 * Photo-disk: <config.postOpPhotosDir>/<submissionId>/<photoId>.{jpg,png}
 * Cron `pruneNoConsentPhotos` rensar foton 12 mån efter submit utan consent.
 */

const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const multer = require('multer');
const piexif = require('piexifjs');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

// ── EXIF-strip via piexifjs ────────────────────────────────────────
// piexifjs jobbar med binary-strings ("\xFF\xD8\xFF…"), inte Buffers.
// Vi konverterar Buffer→binary-string→stripped→Buffer.
function stripExifFromJpeg(buffer) {
  const binary = buffer.toString('binary');
  // piexif.remove kastar om input inte är giltig JPEG. Vi vill failsafe
  // returnera original-buffern om strip:en kraschar — bättre att spara
  // bilden med EXIF än att förlora den helt.
  try {
    const stripped = piexif.remove(binary);
    return Buffer.from(stripped, 'binary');
  } catch (err) {
    console.warn('[post-op-review] EXIF-strip failed, keeping original:', err?.message);
    return buffer;
  }
}

// Multer setup: max 6 filer × 8 MB. memoryStorage så vi kan strippa EXIF
// innan disk-skrivning. fileFilter avvisar allt utom JPEG/PNG.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS_PER_REQUEST = 6;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: MAX_PHOTOS_PER_REQUEST,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase())) {
      cb(Object.assign(new Error('unsupported_media_type'), { statusCode: 415 }));
      return;
    }
    cb(null, true);
  },
});

function isLocalPreviewRequest(req) {
  const host = normalizeText(req.hostname || req.get('host'))
    .split(':')[0]
    .toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(host);
}

function getAuthToken(req) {
  const authHeader = normalizeText(req.get('authorization'));
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return normalizeText(req.get('x-auth-token'));
}

function resolveBookingCaseKey(bookingStore, tenantId, caseRef) {
  const ref = normalizeText(caseRef);
  if (!ref) return '';
  if (bookingStore && typeof bookingStore.findCaseByRef === 'function') {
    const match = bookingStore.findCaseByRef({ tenantId, caseRef: ref });
    return normalizeText(match?.bookingCaseId) || ref;
  }
  return ref;
}

async function resolveOperatorActor(req, { authStore, config }) {
  const token = getAuthToken(req);
  if (token && authStore) {
    const context = await authStore.getSessionContextByToken(token);
    if (!context) {
      const err = new Error('Sessionen är ogiltig.');
      err.statusCode = 401;
      throw err;
    }
    await authStore.touchSession(context.session.id);
    return {
      tenantId: context.membership.tenantId,
      userId: context.user.id,
      role: context.membership.role,
    };
  }
  if (isLocalPreviewRequest(req)) {
    return {
      tenantId: config?.defaultTenantId || 'hair-tp-clinic',
      userId: 'preview-local',
      role: 'OWNER',
    };
  }
  const err = new Error('Inloggning krävs.');
  err.statusCode = 401;
  throw err;
}

/**
 * @param {object} deps
 * @param {object} deps.postOpReviewStore     — från createPostOpReviewStore
 * @param {object} deps.capabilityExecutor    — gateway-backed capability executor
 * @param {object} [deps.bookingStore]        — ccoBookingStore för audit-event (optional)
 * @param {object} [deps.authStore]           — för operator-auth
 * @param {object} [deps.config]              — server-config (defaultTenantId)
 * @param {object} [deps.graphSendConnector]  — Microsoft Graph send connector;
 *                                              om satt + patientEmail finns i
 *                                              request body skickas emailDraft
 *                                              automatiskt istället för manuell
 *                                              copy-paste från operator.
 */
function createPostOpReviewRouter({
  postOpReviewStore,
  capabilityExecutor,
  bookingStore = null,
  authStore = null,
  config = {},
  graphSendConnector = null,
}) {
  if (!postOpReviewStore) {
    throw new Error('createPostOpReviewRouter: postOpReviewStore krävs');
  }
  if (!capabilityExecutor || typeof capabilityExecutor.runCapability !== 'function') {
    throw new Error('createPostOpReviewRouter: capabilityExecutor krävs');
  }

  const router = express.Router();

  async function safeBookingAddEvent(eventInput = {}, resolvedCase = null) {
    if (!bookingStore || typeof bookingStore.addEvent !== 'function') return;
    const tenantId = normalizeText(eventInput.tenantId);
    const conversationId = normalizeText(eventInput.conversationId || resolvedCase?.conversationId);
    const customerEmail = normalizeKey(eventInput.customerEmail || resolvedCase?.customerEmail);
    if (!tenantId || !conversationId || !customerEmail) return;
    try {
      await bookingStore.addEvent({
        ...eventInput,
        tenantId,
        conversationId,
        customerEmail,
      });
    } catch (err) {
      console.warn('[post-op-review] addEvent non-fatal:', err?.message);
    }
  }

  // ── PATIENT-VY ────────────────────────────────────────────────────
  // GET /uppfoljning/:token — serverar public/uppfoljning/index.html.
  // Klient-JS:n läser token från window.location.pathname och fetchar
  // /api/v1/post-op-review/:token/lookup för att rendera rätt state.
  router.get('/uppfoljning/:token', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.join(process.cwd(), 'public', 'uppfoljning', 'index.html'));
  });

  router.get('/uppfoljning/:token/omdome', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.join(process.cwd(), 'public', 'uppfoljning', 'omdome.html'));
  });

  // ── OPERATOR-TRIGGER ──────────────────────────────────────────────
  // POST /api/v1/cco-bookings/:caseId/mark-follow-up-completed
  // Operator trycker "markera sista uppföljning klar" i CCO → vi kallar
  // capability och returnerar emailDraft som operator manuellt skickar.
  router.post('/api/v1/cco-bookings/:caseId/mark-follow-up-completed', async (req, res) => {
    try {
      const actor = await resolveOperatorActor(req, { authStore, config });
      const caseId = normalizeText(req.params.caseId);
      if (!caseId) {
        return res.status(400).json({ ok: false, error: 'caseId saknas' });
      }

      const resolvedCase =
        bookingStore && typeof bookingStore.findCaseByRef === 'function'
          ? bookingStore.findCaseByRef({ tenantId: actor.tenantId, caseRef: caseId })
          : null;
      const bookingCaseKey = normalizeText(resolvedCase?.bookingCaseId) || caseId;

      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const customerName = normalizeText(body.customerName);
      const locale = body.locale === 'en' ? 'en' : 'sv';
      const baseUrl = normalizeText(body.baseUrl) || 'https://arcana.hairtpclinic.se';
      const { formatTreatmentLabel } = require('../lib/postOpTreatmentLabel');
      const treatmentLabel =
        normalizeText(body.treatmentLabel) ||
        formatTreatmentLabel(normalizeText(resolvedCase?.requestedTreatment), locale);

      const run = await capabilityExecutor.runCapability({
        tenantId: actor.tenantId,
        actor: {
          id: actor.userId,
          role: actor.role,
        },
        channel: 'admin',
        capabilityName: 'RequestPostOpReview',
        input: {
          bookingCaseId: bookingCaseKey,
          customerName,
          locale,
          baseUrl,
          treatmentLabel,
          treatmentKey: normalizeText(resolvedCase?.requestedTreatment),
        },
        correlationId: normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null,
        idempotencyKey:
          normalizeText(req.get('x-idempotency-key')) ||
          normalizeText(body.idempotencyKey) ||
          null,
        requestMetadata: {
          route: 'post_op_review_trigger',
          caseId,
        },
      });
      const result = run?.gatewayResult?.response_payload?.output || {};

      if (!result?.data) {
        return res.status(400).json({
          ok: false,
          error: 'capability_failed',
          warnings: result?.warnings || [],
        });
      }

      // ── M365 Graph send: auto-skicka emailDraft om Graph är wired ──
      // Operator skickar `patientEmail` i body — vi kallar då Graph sendMail
      // istället för att tvinga operator till copy-paste i Outlook.
      // Operator kan välja att skippa auto-send via `skipGraphSend:true`
      // (om mottagaren är tveksam eller om de vill verifiera först).
      const patientEmail = normalizeText(body.patientEmail).toLowerCase();
      const skipGraphSend = body.skipGraphSend === true;
      let graphSendResult = null;
      const draft = result.data.emailDraft;

      if (graphSendConnector && patientEmail && !skipGraphSend && draft && !result.data.alreadyExists) {
        // Förhindra dubbel-send: kolla om submission redan har sentAt satt.
        const existing = postOpReviewStore.findById?.(result.data.submissionId);
        if (existing?.sentAt) {
          graphSendResult = { ok: false, mode: 'skipped', reason: 'already_sent_at_' + existing.sentAt };
        } else {
          try {
            const senderMailbox = normalizeText(
              config?.postOpReviewFromMailbox || config?.defaultMailbox
            ) || 'contact@hairtpclinic.com';
            const sent = await graphSendConnector.sendComposeDocument({
              composeDocument: {
                version: 'phase_5',
                kind: 'mail_compose_document',
                mode: 'compose',
                senderMailboxId: senderMailbox,
                sourceMailboxId: senderMailbox,
                recipients: { to: [patientEmail], cc: [], bcc: [] },
                subject: draft.subject,
                content: { bodyText: draft.plain, bodyHtml: draft.html },
                delivery: { sendStrategy: 'send_mail' },
              },
            });
            // Markera submission som skickad så vi inte dubblar vid retry.
            if (typeof postOpReviewStore.markSent === 'function') {
              await postOpReviewStore.markSent(result.data.submissionId, sent.sentAt);
            }
            graphSendResult = {
              ok: true,
              mode: 'graph_send_mail',
              from: sent.mailboxId,
              to: patientEmail,
              sentAt: sent.sentAt,
            };
          } catch (graphErr) {
            console.warn('[post-op-review/graph-send] failed:', graphErr?.message);
            graphSendResult = {
              ok: false,
              mode: 'graph_error',
              error: graphErr?.message || 'graph_send_failed',
            };
          }
        }
      } else if (!graphSendConnector) {
        graphSendResult = { ok: false, mode: 'no_graph_connector' };
      } else if (!patientEmail) {
        graphSendResult = { ok: false, mode: 'no_patient_email_in_request' };
      } else if (skipGraphSend) {
        graphSendResult = { ok: false, mode: 'operator_skipped' };
      } else if (result.data.alreadyExists) {
        graphSendResult = { ok: false, mode: 'submission_already_existed' };
      }

      // Audit-event i booking-case så operator-vyn visar att triggern körts
      if (bookingStore && typeof bookingStore.updateStatus === 'function' && resolvedCase) {
        try {
          await bookingStore.updateStatus({
            tenantId: actor.tenantId,
            workspaceId: resolvedCase.workspaceId,
            conversationId: resolvedCase.conversationId,
            customerEmail: resolvedCase.customerEmail,
            status: 'follow_up_completed',
            ownerUserId: actor.userId,
          });
        } catch (statusError) {
          console.warn('[post-op-review/trigger] updateStatus non-fatal:', statusError?.message);
        }
      }

      if (resolvedCase) {
        const sendSummary = graphSendResult?.ok
          ? ` · 📤 Email skickad via M365 Graph till ${graphSendResult.to}`
          : graphSendResult
            ? ` · 📋 Email INTE auto-skickad (${graphSendResult.mode})`
            : '';
        await safeBookingAddEvent(
          {
            tenantId: actor.tenantId,
            type: 'final_followup_marked',
            label: 'Sista uppföljning markerad klar',
            detail: (result.data.alreadyExists
              ? 'Submission fanns redan — ingen ny token genererad.'
              : `Token-länk genererad. Operator: ${actor.userId}`) + sendSummary,
            metadata: {
              submissionId: result.data.submissionId,
              reviewLink: result.data.reviewLink,
              alreadyExists: result.data.alreadyExists === true,
              graphSend: graphSendResult,
            },
          },
          resolvedCase
        );
      }

      return res.json({
        ok: true,
        ...result.data,
        graphSend: graphSendResult,
        warnings: result.warnings || [],
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ ok: false, error: error.message });
      }
      console.error('[post-op-review/trigger]', error);
      return res.status(500).json({ ok: false, error: 'trigger_failed' });
    }
  });

  // ── OPERATOR THUMBNAIL READ (auth-protected) ──────────────────────
  //
  // GET /api/v1/cco-bookings/:caseId/post-op-photos
  //   Returnerar metadata för alla foton kopplade till caset.
  //
  // GET /api/v1/cco-bookings/:caseId/post-op-photos/:photoId
  //   Streamar bildfilen från disk så CCO kan rendera <img>-tags.
  //
  // Vi gör auth tenant-scoped: submission.tenantId måste matcha operatörens
  // tenant så en operatör i klinik A inte kan se foton från klinik B.

  router.get('/api/v1/cco-bookings/:caseId/post-op-photos', async (req, res) => {
    try {
      const actor = await resolveOperatorActor(req, { authStore, config });
      const caseId = normalizeText(req.params.caseId);
      if (!caseId) return res.status(400).json({ ok: false, error: 'caseId_missing' });

      const bookingCaseKey = resolveBookingCaseKey(bookingStore, actor.tenantId, caseId);
      const submission = postOpReviewStore.findByBookingCaseId(bookingCaseKey);
      if (!submission) {
        return res.json({ ok: true, submission: null, photos: [] });
      }
      if (submission.tenantId && submission.tenantId !== actor.tenantId) {
        return res.status(403).json({ ok: false, error: 'tenant_mismatch' });
      }

      const photos = (Array.isArray(submission.photos) ? submission.photos : []).map((p) => ({
        photoId: p.photoId,
        filename: p.filename,
        size: p.size,
        uploadedAt: p.uploadedAt,
        // Operator-vyn använder denna URL för <img src>. Auth följer med
        // via existing session token (apiRequest sätter Authorization).
        url: `/api/v1/cco-bookings/${encodeURIComponent(caseId)}/post-op-photos/${encodeURIComponent(p.photoId)}`,
      }));

      return res.json({
        ok: true,
        submission: {
          submissionId: submission.submissionId,
          patientName: submission.patientName || '',
          submittedAt: submission.submittedAt || null,
          consentToPublish: submission.consentToPublish === true,
          patientNote: submission.patientNote || '',
          photosDeletedAt: submission.photosDeletedAt || null,
        },
        photos,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ ok: false, error: error.message });
      }
      console.error('[post-op-review/photos-meta]', error);
      return res.status(500).json({ ok: false, error: 'photos_meta_failed' });
    }
  });

  router.get('/api/v1/cco-bookings/:caseId/post-op-photos/:photoId', async (req, res) => {
    try {
      const actor = await resolveOperatorActor(req, { authStore, config });
      const caseId = normalizeText(req.params.caseId);
      const photoId = normalizeText(req.params.photoId);
      if (!caseId || !photoId) {
        return res.status(400).json({ ok: false, error: 'missing_params' });
      }

      const bookingCaseKey = resolveBookingCaseKey(bookingStore, actor.tenantId, caseId);
      const submission = postOpReviewStore.findByBookingCaseId(bookingCaseKey);
      if (!submission) {
        return res.status(404).json({ ok: false, error: 'submission_not_found' });
      }
      if (submission.tenantId && submission.tenantId !== actor.tenantId) {
        return res.status(403).json({ ok: false, error: 'tenant_mismatch' });
      }

      // Verifiera att photoId tillhör submission (förhindrar att operator
      // sniffar andra patienters foton via gissad UUID).
      const photoMeta = (Array.isArray(submission.photos) ? submission.photos : []).find(
        (p) => p.photoId === photoId
      );
      if (!photoMeta) {
        return res.status(404).json({ ok: false, error: 'photo_not_found_in_submission' });
      }

      // Hitta filen på disk. Stödjer .jpg och .png — multer-routen sparar
      // med ext baserat på MIME.
      const photosDir = (config && config.postOpPhotosDir)
        || path.join(process.cwd(), 'data', 'post-op-photos');
      const submissionDir = path.join(photosDir, submission.submissionId);
      const fsSync = require('node:fs');
      let onDiskPath = null;
      let contentType = null;
      for (const ext of ['.jpg', '.jpeg', '.png']) {
        const candidate = path.join(submissionDir, photoId + ext);
        if (fsSync.existsSync(candidate)) {
          onDiskPath = candidate;
          contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
          break;
        }
      }
      if (!onDiskPath) {
        return res.status(404).json({ ok: false, error: 'photo_file_missing_on_disk' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return fsSync.createReadStream(onDiskPath).pipe(res);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ ok: false, error: error.message });
      }
      console.error('[post-op-review/photo-stream]', error);
      return res.status(500).json({ ok: false, error: 'photo_stream_failed' });
    }
  });

  // ── PATIENT-FACING (token-only, public) ───────────────────────────

  // GET /api/v1/post-op-review/:token/lookup
  // Slå upp submission-metadata utan att exponera tokenHash.
  router.get('/api/v1/post-op-review/:token/lookup', async (req, res) => {
    const token = normalizeText(req.params.token);
    if (!token) return res.status(400).json({ ok: false, error: 'token_missing' });
    const submission = postOpReviewStore.findByToken(token);
    if (!submission) {
      return res.status(404).json({ ok: false, error: 'invalid_or_expired_token' });
    }
    return res.json({
      ok: true,
      submission: {
        submissionId: submission.submissionId,
        patientName: submission.patientName || '',
        treatmentLabel: submission.treatmentLabel || '',
        submittedAt: submission.submittedAt || null,
        consentToPublish: submission.consentToPublish === true,
        photoCount: Array.isArray(submission.photos) ? submission.photos.length : 0,
        reviewClicked: submission.reviewClicked === true,
        reviewRating: submission.reviewRating ?? null,
        reviewFeedbackAt: submission.reviewFeedbackAt || null,
        expiresAt: submission.expiresAt || null,
      },
    });
  });

  const GBP_REVIEW_URL = 'https://maps.google.com/?cid=17939638689643749556';
  const MIN_GOOGLE_REVIEW_RATING = 4;

  router.post('/api/v1/post-op-review/:token/review-feedback', async (req, res) => {
    const token = normalizeText(req.params.token);
    if (!token) return res.status(400).json({ ok: false, error: 'token_missing' });
    const submission = postOpReviewStore.findByToken(token);
    if (!submission) {
      return res.status(404).json({ ok: false, error: 'invalid_or_expired_token' });
    }
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const rating = Number(body.rating);
    const feedback = normalizeText(body.feedback);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, error: 'rating_invalid' });
    }
    try {
      const updated = await postOpReviewStore.saveReviewFeedback(submission.submissionId, {
        rating,
        feedback,
      });
      const promoteToGoogle = updated.reviewRating >= MIN_GOOGLE_REVIEW_RATING;
      const resolvedCase =
        bookingStore && typeof bookingStore.findCaseByRef === 'function'
          ? bookingStore.findCaseByRef({
              tenantId: updated.tenantId,
              caseRef: updated.bookingCaseId,
            })
          : null;
      await safeBookingAddEvent(
        {
          tenantId: updated.tenantId,
          type: promoteToGoogle ? 'post_op_review_positive' : 'post_op_review_internal',
          label: promoteToGoogle ? 'Positivt omdöme — Google erbjuds' : 'Internt omdöme — ingen Google-länk',
          detail: promoteToGoogle
            ? `Patient gav ${updated.reviewRating}/5. Google-länk visas efter gate.`
            : `Patient gav ${updated.reviewRating}/5. Feedback sparas internt.`,
          metadata: {
            submissionId: updated.submissionId,
            reviewRating: updated.reviewRating,
            hasFeedback: Boolean(updated.reviewFeedback),
          },
        },
        resolvedCase
      );
      return res.json({
        ok: true,
        promoteToGoogle,
        googleReviewUrl: promoteToGoogle ? GBP_REVIEW_URL : null,
        googleClickPath: promoteToGoogle
          ? `/api/v1/post-op-review/${encodeURIComponent(token)}/review-clicked`
          : null,
        submission: {
          reviewRating: updated.reviewRating,
          reviewFeedbackAt: updated.reviewFeedbackAt,
        },
      });
    } catch (err) {
      console.error('[post-op-review/review-feedback]', err);
      return res.status(500).json({ ok: false, error: 'review_feedback_failed' });
    }
  });

  // POST /api/v1/post-op-review/:token/submit
  // Patient bekräftar submission med consent + frivillig note.
  // Photo-upload sker separat (inte här — kräver multer + sharp som
  // adderas i nästa pass).
  router.post('/api/v1/post-op-review/:token/submit', async (req, res) => {
    const token = normalizeText(req.params.token);
    if (!token) return res.status(400).json({ ok: false, error: 'token_missing' });
    const submission = postOpReviewStore.findByToken(token);
    if (!submission) {
      return res.status(404).json({ ok: false, error: 'invalid_or_expired_token' });
    }
    if (submission.submittedAt) {
      // Idempotent: returnera befintlig submission
      return res.json({ ok: true, submission, alreadySubmitted: true });
    }
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const consentToPublish = body.consentToPublish === true;
    const patientNote = normalizeText(body.patientNote);

    try {
      const updated = await postOpReviewStore.submit(submission.submissionId, {
        consentToPublish,
        patientNote,
      });

      const resolvedCase =
        bookingStore && typeof bookingStore.findCaseByRef === 'function'
          ? bookingStore.findCaseByRef({
              tenantId: updated.tenantId,
              caseRef: updated.bookingCaseId,
            })
          : null;
      await safeBookingAddEvent(
        {
          tenantId: updated.tenantId,
          type: 'post_op_photos_received',
          label: 'Patient har lämnat efter-bilder',
          detail: consentToPublish
            ? 'Patient samtyckte till publicering (ögonbryn och uppåt-crop krävs).'
            : 'Patient lämnade utan publiceringssamtycke — endast klinisk journal.',
          metadata: {
            submissionId: updated.submissionId,
            consentToPublish,
            photoCount: Array.isArray(updated.photos) ? updated.photos.length : 0,
          },
        },
        resolvedCase
      );

      return res.json({ ok: true, submission: updated });
    } catch (err) {
      console.error('[post-op-review/submit]', err);
      return res.status(500).json({ ok: false, error: 'submit_failed' });
    }
  });

  // POST /api/v1/post-op-review/:token/photos
  // Fas 1.B: patient laddar upp 1-6 efter-bilder. multer parsar multipart,
  // piexifjs strippar EXIF (GPS, kamera-serie, datum) före disk-skrivning.
  // Bilder lagras under <config.postOpPhotosDir>/<submissionId>/<photoId>.<ext>.
  // Max 6 totalt per submission (även över flera requests).
  router.post(
    '/api/v1/post-op-review/:token/photos',
    (req, res, next) => {
      photoUpload.array('photos', MAX_PHOTOS_PER_REQUEST)(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ ok: false, error: 'photo_too_large', maxBytes: MAX_PHOTO_BYTES });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ ok: false, error: 'too_many_photos', maxFiles: MAX_PHOTOS_PER_REQUEST });
        }
        if (err.statusCode === 415 || err.message === 'unsupported_media_type') {
          return res.status(415).json({ ok: false, error: 'unsupported_media_type' });
        }
        console.error('[post-op-review/photos] multer error:', err);
        return res.status(400).json({ ok: false, error: 'upload_failed' });
      });
    },
    async (req, res) => {
      const token = normalizeText(req.params.token);
      if (!token) return res.status(400).json({ ok: false, error: 'token_missing' });
      const submission = postOpReviewStore.findByToken(token);
      if (!submission) {
        return res.status(404).json({ ok: false, error: 'invalid_or_expired_token' });
      }
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) {
        return res.status(400).json({ ok: false, error: 'no_photos_in_request' });
      }
      // Kontrollera max-total över flera requests
      const existingCount = Array.isArray(submission.photos) ? submission.photos.length : 0;
      if (existingCount + files.length > MAX_PHOTOS_PER_REQUEST) {
        return res.status(400).json({
          ok: false,
          error: 'photo_limit_exceeded',
          existing: existingCount,
          maxTotal: MAX_PHOTOS_PER_REQUEST,
        });
      }

      const photosDir = (config && config.postOpPhotosDir) || path.join(process.cwd(), 'data', 'post-op-photos');
      const submissionDir = path.join(photosDir, submission.submissionId);

      const uploaded = [];
      try {
        await fs.mkdir(submissionDir, { recursive: true });

        for (const file of files) {
          const isJpeg = String(file.mimetype || '').toLowerCase() === 'image/jpeg';
          const ext = isJpeg ? '.jpg' : '.png';
          const cleanBuffer = isJpeg ? stripExifFromJpeg(file.buffer) : file.buffer;

          // Lägg till photo i store FÖRST så vi får en officiell photoId
          const { photoId } = await postOpReviewStore.addPhoto(submission.submissionId, {
            filename: normalizeText(file.originalname) || `photo${ext}`,
            size: cleanBuffer.length,
          });
          const target = path.join(submissionDir, `${photoId}${ext}`);
          await fs.writeFile(target, cleanBuffer, { mode: 0o600 });
          uploaded.push({ photoId, size: cleanBuffer.length, mime: file.mimetype });
        }

        const resolvedCase =
          bookingStore && typeof bookingStore.findCaseByRef === 'function'
            ? bookingStore.findCaseByRef({
                tenantId: submission.tenantId,
                caseRef: submission.bookingCaseId,
              })
            : null;
        await safeBookingAddEvent(
          {
            tenantId: submission.tenantId,
            type: 'post_op_photo_uploaded',
            label: 'Patient laddade upp efter-bild',
            detail: `${uploaded.length} foto(n) tagna emot, EXIF strippad där tillämpligt.`,
            metadata: {
              submissionId: submission.submissionId,
              photoIds: uploaded.map((p) => p.photoId),
              totalAfter: existingCount + uploaded.length,
            },
          },
          resolvedCase
        );

        return res.json({
          ok: true,
          uploaded,
          totalPhotos: existingCount + uploaded.length,
        });
      } catch (err) {
        console.error('[post-op-review/photos]', err);
        return res.status(500).json({ ok: false, error: 'photo_save_failed' });
      }
    }
  );

  // GET /api/v1/post-op-review/:token/review-clicked
  // Beacon → markReviewClicked + 302 till Google Business Profile.
  router.get('/api/v1/post-op-review/:token/review-clicked', async (req, res) => {
    const token = normalizeText(req.params.token);
    const gbpUrl = GBP_REVIEW_URL;
    const gatePath = token ? `/uppfoljning/${encodeURIComponent(token)}/omdome` : '/';
    if (!token) return res.redirect(302, gatePath);
    const submission = postOpReviewStore.findByToken(token);
    if (submission) {
      if (
        submission.reviewRating != null &&
        submission.reviewRating < MIN_GOOGLE_REVIEW_RATING
      ) {
        return res.redirect(302, `${gatePath}?blocked=1`);
      }
      if (submission.reviewRating == null) {
        return res.redirect(302, gatePath);
      }
      try {
        await postOpReviewStore.markReviewClicked(submission.submissionId);
        const resolvedCase =
          bookingStore && typeof bookingStore.findCaseByRef === 'function'
            ? bookingStore.findCaseByRef({
                tenantId: submission.tenantId,
                caseRef: submission.bookingCaseId,
              })
            : null;
        await safeBookingAddEvent(
          {
            tenantId: submission.tenantId,
            type: 'post_op_review_clicked',
            label: 'Patient klickade på Google-omdöme-CTA',
            detail: 'Beacon från /uppfoljning/:token — patient skickades till GBP.',
            metadata: { submissionId: submission.submissionId },
          },
          resolvedCase
        );
      } catch (err) {
        console.warn('[post-op-review/review-clicked] non-fatal:', err?.message);
      }
    }
    return res.redirect(302, gbpUrl);
  });

  return router;
}

module.exports = {
  createPostOpReviewRouter,
};
