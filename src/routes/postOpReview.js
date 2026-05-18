'use strict';

/**
 * Post-Op Review routes — Fas 1 minimal trigger + token-lookup.
 *
 * Spec: docs/strategy/post-op-review-photo-flow.md
 *
 * Detta är minsta funktionella routes-skikt:
 * - Operator triggar via auth-skyddad endpoint → får reviewLink + emailDraft
 *   som de manuellt skickar via Outlook tills M365 Graph-integration är wirad.
 * - Patient hämtar submission-status via token (public).
 * - Patient bekräftar submission med consent + note (public).
 * - Patient klickar "lämna omdöme" → beacon-pixel.
 *
 * Vad som INTE finns ännu:
 * - Photo-upload (kräver multer + sharp för EXIF-strip).
 * - Patient-frontend (vanilla HTML/CSS/JS — separat 1-dags pass).
 * - Direkt M365 Graph send från capability — operator copy-paste:ar
 *   emailDraft till Outlook manuellt i Fas 1.
 *
 * Spec sektion 2.3 listar full endpoint-tabell — denna fil är subset:n
 * som inte kräver ytterligare dependencies.
 */

const express = require('express');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

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
 * @param {object} deps.capability            — RequestPostOpReviewCapability-instans
 * @param {object} [deps.bookingStore]        — ccoBookingStore för audit-event (optional)
 * @param {object} [deps.authStore]           — för operator-auth
 * @param {object} [deps.config]              — server-config (defaultTenantId)
 */
function createPostOpReviewRouter({
  postOpReviewStore,
  capability,
  bookingStore = null,
  authStore = null,
  config = {},
}) {
  if (!postOpReviewStore) {
    throw new Error('createPostOpReviewRouter: postOpReviewStore krävs');
  }
  if (!capability || typeof capability.execute !== 'function') {
    throw new Error('createPostOpReviewRouter: capability krävs');
  }

  const router = express.Router();

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

      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const customerName = normalizeText(body.customerName);
      const locale = body.locale === 'en' ? 'en' : 'sv';
      const baseUrl = normalizeText(body.baseUrl) || 'https://arcana.hairtpclinic.se';

      const result = await capability.execute({
        tenantId: actor.tenantId,
        channel: 'admin',
        actor,
        postOpReviewStore,
        input: {
          bookingCaseId: caseId,
          customerName,
          locale,
          baseUrl,
        },
      });

      if (!result?.data) {
        return res.status(400).json({
          ok: false,
          error: 'capability_failed',
          warnings: result?.warnings || [],
        });
      }

      // Audit-event i booking-case så operator-vyn visar att triggern körts
      if (bookingStore && typeof bookingStore.addEvent === 'function') {
        await bookingStore.addEvent({
          tenantId: actor.tenantId,
          conversationId: caseId,
          customerEmail: '',
          type: 'final_followup_marked',
          label: 'Sista uppföljning markerad klar',
          detail: result.data.alreadyExists
            ? 'Submission fanns redan — ingen ny token genererad.'
            : `Token-länk genererad. Operator: ${actor.userId}`,
          metadata: {
            submissionId: result.data.submissionId,
            reviewLink: result.data.reviewLink,
            alreadyExists: result.data.alreadyExists === true,
          },
        });
      }

      return res.json({ ok: true, ...result.data, warnings: result.warnings || [] });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ ok: false, error: error.message });
      }
      console.error('[post-op-review/trigger]', error);
      return res.status(500).json({ ok: false, error: 'trigger_failed' });
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
        submittedAt: submission.submittedAt || null,
        consentToPublish: submission.consentToPublish === true,
        photoCount: Array.isArray(submission.photos) ? submission.photos.length : 0,
        reviewClicked: submission.reviewClicked === true,
        expiresAt: submission.expiresAt || null,
      },
    });
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

      // Audit till booking-case att patient submittat
      if (bookingStore && typeof bookingStore.addEvent === 'function') {
        await bookingStore.addEvent({
          tenantId: updated.tenantId,
          conversationId: updated.bookingCaseId,
          customerEmail: '',
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
        });
      }

      return res.json({ ok: true, submission: updated });
    } catch (err) {
      console.error('[post-op-review/submit]', err);
      return res.status(500).json({ ok: false, error: 'submit_failed' });
    }
  });

  // GET /api/v1/post-op-review/:token/review-clicked
  // Beacon → markReviewClicked + 302 till Google Business Profile.
  router.get('/api/v1/post-op-review/:token/review-clicked', async (req, res) => {
    const token = normalizeText(req.params.token);
    const gbpUrl = 'https://maps.google.com/?cid=17939638689643749556';
    if (!token) return res.redirect(302, gbpUrl);
    const submission = postOpReviewStore.findByToken(token);
    if (submission) {
      try {
        await postOpReviewStore.markReviewClicked(submission.submissionId);
        if (bookingStore && typeof bookingStore.addEvent === 'function') {
          await bookingStore.addEvent({
            tenantId: submission.tenantId,
            conversationId: submission.bookingCaseId,
            customerEmail: '',
            type: 'post_op_review_clicked',
            label: 'Patient klickade på Google-omdöme-CTA',
            detail: 'Beacon från /uppfoljning/:token — patient skickades till GBP.',
            metadata: { submissionId: submission.submissionId },
          });
        }
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
