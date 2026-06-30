'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const {
  WORKSPACE_ID,
  normalizeText,
  resolveCcoRouteActor,
  buildCcoRouteContext,
  requireCcoRouteContext,
  serializePatient360,
  buildPatient360SyncContext,
} = require('./ccoRouteShared');

const {
  COMMERCIAL_STATUSES,
  QUOTE_STATUSES,
  PAYMENT_STATUSES,
  buildCommercialCaseReadout,
} = require('../ops/ccoCommercialStore');
const {
  buildOfferDefaultsFromPlan,
  buildOfferDocumentHtml,
  buildOfferPlanData,
  buildPlanSnapshot,
  resolvePlanPhotoDataUrls,
} = require('../ops/ccoOfferFromPlan');
const { listOfferTemplates, getOfferTemplate } = require('../ops/ccoOfferTemplateStore');
const {
  addDaysIso,
  buildEsignToken,
  canAcceptOffer,
  buildOfferSignPageHtml,
  getCoolingOffMeta,
} = require('../ops/ccoOfferEsign');
const { renderHtmlToPdfBuffer: defaultRenderHtmlToPdfBuffer } = require('../ops/ccoOfferPdf');
const { syncPatient360FromCommercialCase } = require('../ops/ccoPatient360Bridge');

function toCaseInput(context, body = {}) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    customerId: context.customerId,
    customerName: context.customerName,
    offerType: normalizeText(body.offerType),
    commercialStatus: normalizeText(body.commercialStatus),
    quoteStatus: normalizeText(body.quoteStatus),
    paymentStatus: normalizeText(body.paymentStatus),
    quotedAmount: normalizeText(body.quotedAmount),
    depositAmount: normalizeText(body.depositAmount),
    dueDateIso: normalizeText(body.dueDateIso),
    notes: normalizeText(body.notes),
    nextStep: normalizeText(body.nextStep),
    linkedOperationCaseId: normalizeText(body.linkedOperationCaseId),
    linkedJournalEntryId: normalizeText(body.linkedJournalEntryId),
    linkedPatientId: normalizeText(body.linkedPatientId),
    offerDocumentId: normalizeText(body.offerDocumentId),
    offerDocumentPdfId: normalizeText(body.offerDocumentPdfId),
    offerDocumentWordId: normalizeText(body.offerDocumentWordId),
    offerTemplateKey: normalizeText(body.offerTemplateKey),
    quoteSentAt: normalizeText(body.quoteSentAt),
    quoteAcceptedAt: normalizeText(body.quoteAcceptedAt),
    customerSignedName: normalizeText(body.customerSignedName),
    coolingOffEndsAt: normalizeText(body.coolingOffEndsAt),
    esignToken: normalizeText(body.esignToken),
    esignStatus: normalizeText(body.esignStatus),
    planSnapshot:
      body.planSnapshot && typeof body.planSnapshot === 'object' ? body.planSnapshot : undefined,
    offerPlan: body.offerPlan && typeof body.offerPlan === 'object' ? body.offerPlan : undefined,
  };
}

function buildPatientRegisterContext(actor, body = {}) {
  const patientId = normalizeText(body.patientId);
  const customerName = normalizeText(body.customerName);
  return {
    tenantId: actor.tenantId,
    workspaceId: WORKSPACE_ID,
    conversationId: 'patient-register',
    customerId: patientId,
    customerName,
    actor,
  };
}

function listOfferPhotoAttachments(commercialCase = {}) {
  const snapshot = commercialCase.planSnapshot || {};
  const offerPlan = commercialCase.offerPlan || {};
  const seen = new Set();
  return [snapshot.attachments, offerPlan.attachments]
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .filter((item) => item && typeof item === 'object')
    .filter((item) => {
      const photoId = normalizeText(item.photoId);
      if (!photoId || seen.has(photoId)) return false;
      seen.add(photoId);
      return true;
    });
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildCustomerOfferPortalPlan(commercialCase = {}) {
  const offerPlan =
    commercialCase.offerPlan && typeof commercialCase.offerPlan === 'object'
      ? commercialCase.offerPlan
      : {};
  return {
    ...offerPlan,
    customerName:
      normalizeText(offerPlan.customerName) ||
      normalizeText(commercialCase.customerName) ||
      normalizeText(commercialCase.customerSignedName) ||
      'Kund',
    operationDateLabel:
      normalizeText(offerPlan.operationDateLabel) ||
      normalizeText(commercialCase.operationDateLabel) ||
      '',
    price: {
      ...(offerPlan.price && typeof offerPlan.price === 'object' ? offerPlan.price : {}),
      quotedAmount:
        normalizeText(offerPlan.price?.quotedAmount) || normalizeText(commercialCase.quotedAmount),
      depositAmount:
        normalizeText(offerPlan.price?.depositAmount) ||
        normalizeText(commercialCase.depositAmount),
      remainingAmount:
        normalizeText(offerPlan.price?.remainingAmount) ||
        normalizeText(commercialCase.remainingAmount),
    },
  };
}

let cachedCustomerOfferPortalHtml = null;

async function loadCustomerOfferPortalHtml() {
  if (cachedCustomerOfferPortalHtml) return cachedCustomerOfferPortalHtml;
  const filePath = path.join(
    __dirname,
    '..',
    '..',
    'public',
    'major-arcana-preview',
    'cco-patient-offer-portal-v3.html'
  );
  cachedCustomerOfferPortalHtml = await fs.readFile(filePath, 'utf8');
  return cachedCustomerOfferPortalHtml;
}

async function buildCustomerOfferPortalHtml(commercialCase = {}) {
  const html = await loadCustomerOfferPortalHtml();
  const plan = buildCustomerOfferPortalPlan(commercialCase);
  const payload = `<script>window.ARCANA_CUSTOMER_OFFER_PLAN=${escapeScriptJson(plan)};</script>`;
  if (html.includes('window.ARCANA_CUSTOMER_OFFER_PLAN || DEMO_OFFER_PLAN')) {
    return html.replace(
      '<script>\n      // ===== K4:',
      `${payload}\n    <script>\n      // ===== K4:`
    );
  }
  return html.replace('</head>', `${payload}\n</head>`);
}

function createCcoCommercialRouter({
  commercialStore,
  journalStore = null,
  journalPhotoStore = null,
  patientMasterStore = null,
  offerDocumentStore = null,
  patientSystemStore = null,
  treatmentAgreementStore = null,
  bookingEngineStore = null,
  graphSendConnector = null,
  authStore,
  config,
  requireAuth,
  requireRole,
  renderHtmlToPdfBuffer = defaultRenderHtmlToPdfBuffer,
}) {
  const router = express.Router();
  const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

  async function syncCommercialPatient360(context, commercialCase, options = {}) {
    const latestEvent = Array.isArray(commercialCase?.events) ? commercialCase.events.at(-1) : null;
    return syncPatient360FromCommercialCase({
      patientSystemStore,
      context: buildPatient360SyncContext(context),
      commercialCase,
      source: options.source || 'cco_commercial',
      includeTimelineEvent: options.includeTimelineEvent === true,
      event: options.event || latestEvent,
    });
  }

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      const context = buildCcoRouteContext(req, actor);
      return await run(context, actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera offert- och betalningsytan.' });
    }
  }

  async function auditCommercial(actor, action, targetId) {
    if (!authStore?.addAuditEvent) return;
    await authStore.addAuditEvent({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      outcome: 'success',
      targetType: 'cco_commercial',
      targetId: targetId || actor.tenantId,
    });
  }

  async function recordCustomerQuoteOpen(commercialCase, source) {
    if (!commercialStore?.recordQuoteOpen || !commercialCase) return null;
    try {
      const result = await commercialStore.recordQuoteOpen({
        tenantId: commercialCase.tenantId,
        patientId: commercialCase.customerId,
        source,
      });
      if (result.recorded && authStore?.addAuditEvent) {
        await authStore.addAuditEvent({
          tenantId: commercialCase.tenantId,
          actorUserId: 'customer_offer_view',
          action: 'cco.commercial.offer_opened',
          outcome: 'success',
          targetType: 'cco_commercial',
          targetId: commercialCase.commercialCaseId,
          metadata: {
            source,
            openIndex: result.openIndex,
            autoAction: false,
          },
        });
      }
      return result;
    } catch {
      return null;
    }
  }

  function verifyGetAcceptWebhookSignature(req) {
    const secret = normalizeText(config?.getAcceptWebhookSecret || config?.getacceptWebhookSecret);
    if (!secret) return true;
    const signature = normalizeText(
      req.get('x-getaccept-signature') || req.get('x-ga-signature') || ''
    );
    if (!signature) return false;
    const payload = JSON.stringify(req.body || {});
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  }

  async function findPatientRegisterCase(actor, patientId) {
    return commercialStore.getPatientRegisterCase({
      tenantId: actor.tenantId,
      patientId,
    });
  }

  async function persistOfferDocuments({
    actor,
    commercialCase,
    planSnapshot,
    origin,
    documentId,
  }) {
    const embeddedPhotos = await resolvePlanPhotoDataUrls({
      journalPhotoStore,
      tenantId: actor.tenantId,
      patientId: planSnapshot.patientId,
      planSnapshot,
    });
    const html = buildOfferDocumentHtml({
      origin,
      commercialCase,
      planSnapshot,
      embeddedPhotos,
    });
    const savedHtml = await offerDocumentStore.saveHtml({
      tenantId: actor.tenantId,
      documentId,
      html,
    });
    let savedPdf = { documentId: '' };
    try {
      const pdfBuffer = await renderHtmlToPdfBuffer(html);
      savedPdf = await offerDocumentStore.savePdf({
        tenantId: actor.tenantId,
        documentId: savedHtml.documentId,
        buffer: pdfBuffer,
      });
    } catch (error) {
      console.warn('[cco-commercial] Offert-PDF kunde inte genereras:', error.message || error);
    }
    const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Offert</title></head><body>${html.replace(/^[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '')}</body></html>`;
    const savedWord = await offerDocumentStore.saveWordHtml({
      tenantId: actor.tenantId,
      documentId: savedHtml.documentId,
      html: wordHtml,
    });
    return {
      html,
      savedHtml,
      savedPdf,
      savedWord,
    };
  }

  router.get(
    '/cco-commercial/offer-templates',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async () =>
        res.json({
          templates: listOfferTemplates(),
        })
      )
  );

  router.get(
    '/cco-commercial/case',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (context) => {
        requireCcoRouteContext(
          context,
          'Välj en aktiv tråd med kund innan offert- och betalningsytan används.'
        );
        const commercialCase = await commercialStore.ensureCase({
          ...toCaseInput(context),
          commercialStatus: 'needs_review',
          quoteStatus: 'missing',
          paymentStatus: 'pending',
        });
        const patientRecord = await syncCommercialPatient360(context, commercialCase, {
          source: 'cco_commercial_case_read',
        });
        return res.json({
          commercialCase,
          commercialReadout: buildCommercialCaseReadout(commercialCase),
          patient360: serializePatient360(patientRecord),
          statuses: {
            commercial: COMMERCIAL_STATUSES,
            quote: QUOTE_STATUSES,
            payment: PAYMENT_STATUSES,
          },
        });
      })
  );

  router.put(
    '/cco-commercial/case',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (context) => {
        requireCcoRouteContext(
          context,
          'Välj en aktiv tråd med kund innan offert- och betalningsytan används.'
        );
        const existing = await commercialStore.ensureCase({
          ...toCaseInput(context),
          commercialStatus: 'needs_review',
          quoteStatus: 'missing',
          paymentStatus: 'pending',
        });
        const commercialCase = await commercialStore.upsertCase({
          ...existing,
          ...toCaseInput(context, req.body),
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'commercial_case_updated',
              label: 'Offert- och betalningsärende uppdaterat',
              detail: normalizeText(req.body?.notes) || 'Det kommersiella läget uppdaterades.',
              actorUserId: context.actor.userId,
              actorName: normalizeText(req.body?.ownerName),
            },
          ],
        });
        const patientRecord = await syncCommercialPatient360(context, commercialCase, {
          source: 'cco_commercial_case_update',
          includeTimelineEvent: true,
        });
        return res.json({
          commercialCase,
          commercialReadout: buildCommercialCaseReadout(commercialCase),
          patient360: serializePatient360(patientRecord),
        });
      })
  );

  router.get(
    '/cco-commercial/patient-case',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        const commercialCase = await commercialStore.getPatientRegisterCase({
          tenantId: actor.tenantId,
          patientId,
        });
        return res.json({
          commercialCase,
          commercialReadout: commercialCase ? buildCommercialCaseReadout(commercialCase) : null,
        });
      })
  );

  router.post(
    '/cco-commercial/offer-from-plan',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        if (!journalStore || !offerDocumentStore) {
          return res.status(503).json({ error: 'Offert från plan är inte konfigurerad.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const entryId = normalizeText(body.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }

        const journalEntry = await journalStore.getEntry({
          tenantId: actor.tenantId,
          patientId,
          entryId,
        });
        if (!journalEntry) {
          return res.status(404).json({ error: 'Behandlingsplanen hittades inte.' });
        }
        if (journalEntry.journalType !== 'consultation_plan') {
          return res.status(400).json({ error: 'Journalposten är inte en behandlingsplan.' });
        }

        let patient = null;
        if (patientMasterStore) {
          patient = await patientMasterStore.getPatient({
            tenantId: actor.tenantId,
            patientId,
          });
        }

        const planSnapshot = buildPlanSnapshot(journalEntry, patient || { id: patientId });
        const defaults = buildOfferDefaultsFromPlan(planSnapshot, {
          ...body,
          notes: normalizeText(body.notesToCustomer) || normalizeText(body.notes) || undefined,
        });
        const offerPlan = buildOfferPlanData(planSnapshot, defaults);
        const context = buildPatientRegisterContext(actor, {
          patientId,
          customerName: patient?.displayName || patient?.fullName || '',
        });

        const origin = `${req.protocol}://${req.get('host')}`;

        if (body.previewOnly === true) {
          const previewCase = toCaseInput(context, {
            ...defaults,
            linkedJournalEntryId: entryId,
            linkedPatientId: patientId,
            planSnapshot,
            offerPlan,
            quoteStatus: 'draft',
            commercialStatus: 'needs_review',
            paymentStatus: 'pending',
          });
          const embeddedPhotos = await resolvePlanPhotoDataUrls({
            journalPhotoStore,
            tenantId: actor.tenantId,
            patientId,
            planSnapshot,
          });
          const previewHtml = buildOfferDocumentHtml({
            origin,
            commercialCase: previewCase,
            planSnapshot,
            embeddedPhotos,
          });
          return res.json({
            preview: true,
            previewHtml,
            summary: {
              quotedAmount: defaults.quotedAmount,
              depositAmount: defaults.depositAmount,
              offerType: defaults.offerType,
              notes: defaults.notes,
              templateKey: defaults.offerTemplateKey,
              offerPlan,
            },
          });
        }

        const existing = await commercialStore.getPatientRegisterCase({
          tenantId: actor.tenantId,
          patientId,
        });

        const draftCase = {
          ...toCaseInput(context, {
            ...defaults,
            linkedJournalEntryId: entryId,
            linkedPatientId: patientId,
            planSnapshot,
            offerPlan,
            quoteStatus: 'draft',
            commercialStatus: 'needs_review',
            paymentStatus: 'pending',
          }),
          ...(existing || {}),
          ...toCaseInput(context, {
            ...defaults,
            linkedJournalEntryId: entryId,
            linkedPatientId: patientId,
            planSnapshot,
            offerPlan,
            quoteStatus: 'draft',
            commercialStatus: 'needs_review',
          }),
          events: [
            ...(Array.isArray(existing?.events) ? existing.events : []),
            {
              type: 'offer_created_from_plan',
              label: 'Offert skapad från behandlingsplan',
              detail: defaults.offerType,
              actorUserId: actor.userId,
            },
            ...(normalizeText(body.internalNotes)
              ? [
                  {
                    type: 'offer_internal_note',
                    label: 'Intern anteckning',
                    detail: normalizeText(body.internalNotes),
                    actorUserId: actor.userId,
                  },
                ]
              : []),
          ],
        };

        let commercialCase = await commercialStore.upsertCase(draftCase);
        const artifacts = await persistOfferDocuments({
          actor,
          commercialCase,
          planSnapshot,
          origin,
          documentId: commercialCase.offerDocumentId || undefined,
        });

        commercialCase = await commercialStore.upsertCase({
          ...commercialCase,
          offerDocumentId: artifacts.savedHtml.documentId,
          offerDocumentPdfId: artifacts.savedPdf.documentId,
          offerDocumentWordId: artifacts.savedWord.documentId,
          offerTemplateKey: defaults.offerTemplateKey,
          esignStatus: 'draft',
          events: [
            ...(Array.isArray(commercialCase.events) ? commercialCase.events : []),
            {
              type: 'offer_document_generated',
              label: 'Offertdokument genererat',
              detail: artifacts.savedHtml.documentId,
              actorUserId: actor.userId,
            },
          ],
        });

        await auditCommercial(
          actor,
          'cco.commercial.offer_from_plan',
          commercialCase.commercialCaseId
        );
        const docId = artifacts.savedHtml.documentId;
        return res.json({
          commercialCase,
          commercialReadout: buildCommercialCaseReadout(commercialCase),
          planSnapshot,
          offerPlan: commercialCase.offerPlan || offerPlan,
          offerDocumentUrl: `/api/v1/cco-commercial/offer-document?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(docId)}`,
          offerDocumentPdfUrl: `/api/v1/cco-commercial/offer-document.pdf?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(docId)}`,
          offerDocumentWordUrl: `/api/v1/cco-commercial/offer-document.doc?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(docId)}`,
        });
      })
  );

  router.get(
    '/cco-commercial/offer-document',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        if (!offerDocumentStore) {
          return res.status(503).json({ error: 'Offertdokument saknas.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const documentId = normalizeText(req.query.documentId);
        if (!patientId || !documentId) {
          return res.status(400).json({ error: 'patientId och documentId krävs.' });
        }
        const commercialCase = await commercialStore.getPatientRegisterCase({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!commercialCase || commercialCase.offerDocumentId !== documentId) {
          return res.status(404).json({ error: 'Offertdokumentet hittades inte för kunden.' });
        }
        const payload = await offerDocumentStore.readHtml({
          tenantId: actor.tenantId,
          documentId,
        });
        if (!payload?.html) {
          return res.status(404).json({ error: 'Offertdokumentet saknas på disk.' });
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.send(payload.html);
      })
  );

  async function loadAuthorizedOfferDocument(actor, patientId, documentId) {
    const commercialCase = await findPatientRegisterCase(actor, patientId);
    if (!commercialCase || commercialCase.offerDocumentId !== documentId) {
      return { error: 'Offertdokumentet hittades inte för kunden.', statusCode: 404 };
    }
    return { commercialCase };
  }

  router.get(
    '/cco-commercial/offer-document.pdf',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        if (!offerDocumentStore) {
          return res.status(503).json({ error: 'Offertdokument saknas.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const documentId = normalizeText(req.query.documentId);
        if (!patientId || !documentId) {
          return res.status(400).json({ error: 'patientId och documentId krävs.' });
        }
        const auth = await loadAuthorizedOfferDocument(actor, patientId, documentId);
        if (auth.error) return res.status(auth.statusCode).json({ error: auth.error });
        let payload = await offerDocumentStore.readPdf({
          tenantId: actor.tenantId,
          documentId,
        });
        if (!payload?.buffer) {
          const htmlPayload = await offerDocumentStore.readHtml({
            tenantId: actor.tenantId,
            documentId,
          });
          if (!htmlPayload?.html) {
            return res.status(404).json({ error: 'Offertdokumentet saknas på disk.' });
          }
          const pdfBuffer = await renderHtmlToPdfBuffer(htmlPayload.html);
          payload = await offerDocumentStore.savePdf({
            tenantId: actor.tenantId,
            documentId,
            buffer: pdfBuffer,
          });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="offert-${documentId.slice(0, 8)}.pdf"`
        );
        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.send(payload.buffer);
      })
  );

  router.get(
    '/cco-commercial/offer-document.doc',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        if (!offerDocumentStore) {
          return res.status(503).json({ error: 'Offertdokument saknas.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const documentId = normalizeText(req.query.documentId);
        if (!patientId || !documentId) {
          return res.status(400).json({ error: 'patientId och documentId krävs.' });
        }
        const auth = await loadAuthorizedOfferDocument(actor, patientId, documentId);
        if (auth.error) return res.status(auth.statusCode).json({ error: auth.error });
        const payload = await offerDocumentStore.readWordHtml({
          tenantId: actor.tenantId,
          documentId,
        });
        if (!payload?.html) {
          return res.status(404).json({ error: 'Word-export saknas för offerten.' });
        }
        const template = getOfferTemplate(auth.commercialCase.offerTemplateKey);
        res.setHeader('Content-Type', 'application/msword; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${template.wordFileHint.replace(/\.docx$/i, '.doc')}"`
        );
        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.send(payload.html);
      })
  );

  router.post(
    '/cco-commercial/offer-send-for-sign',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const existing = await findPatientRegisterCase(actor, patientId);
        if (!existing?.offerDocumentId) {
          return res.status(404).json({ error: 'Ingen offert att skicka.' });
        }
        const template = getOfferTemplate(existing.offerTemplateKey);
        const sentAt = new Date().toISOString();
        const commercialCase = await commercialStore.upsertCase({
          ...existing,
          quoteStatus: 'sent',
          commercialStatus: 'quote_sent',
          quoteSentAt: sentAt,
          offerPlan:
            existing.offerPlan && typeof existing.offerPlan === 'object'
              ? { ...existing.offerPlan, informationDeliveredAt: sentAt }
              : existing.offerPlan,
          coolingOffEndsAt: addDaysIso(sentAt, template.coolingOffDays),
          esignToken: existing.esignToken || buildEsignToken(),
          esignStatus: 'sent',
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'offer_sent_for_sign',
              label: 'Offert skickad för signering',
              detail: template.label,
              actorUserId: actor.userId,
            },
          ],
        });
        const origin = `${req.protocol}://${req.get('host')}`;
        return res.json({
          commercialCase,
          commercialReadout: buildCommercialCaseReadout(commercialCase),
          offerSignUrl: `${origin}/api/v1/cco-commercial/offer-sign-page?token=${encodeURIComponent(commercialCase.esignToken)}`,
          customerPortalUrl: `${origin}/api/v1/cco-commercial/customer-offer-portal?token=${encodeURIComponent(commercialCase.esignToken)}`,
        });
      })
  );

  router.post(
    '/cco-commercial/offer-accept',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const customerSignedName = normalizeText(body.customerSignedName);
        const forceAccept = body.forceAccept === true;
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });
        const existing = await findPatientRegisterCase(actor, patientId);
        if (!existing) return res.status(404).json({ error: 'Offert saknas.' });
        const gate = canAcceptOffer(existing, { forceAccept });
        if (!gate.allowed) {
          return res.status(409).json({ error: gate.reason, coolingOff: gate.coolingOff });
        }
        const acceptedAt = new Date().toISOString();
        const commercialCase = await commercialStore.upsertCase({
          ...existing,
          quoteStatus: 'accepted',
          commercialStatus: 'ready',
          paymentStatus: existing.paymentStatus === 'blocked' ? 'pending' : existing.paymentStatus,
          quoteAcceptedAt: acceptedAt,
          customerSignedName: customerSignedName || existing.customerSignedName || 'Kund',
          esignStatus: 'accepted',
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'offer_accepted',
              label: 'Offert accepterad',
              detail: customerSignedName || 'Kund',
              actorUserId: actor.userId,
            },
          ],
        });
        return res.json({
          commercialCase,
          commercialReadout: buildCommercialCaseReadout(commercialCase),
        });
      })
  );

  router.get('/cco-commercial/offer-sign-page', async (req, res) => {
    try {
      const token = normalizeText(req.query.token);
      if (!token) return res.status(400).send('token saknas.');
      const match = commercialStore.findCaseByEsignToken
        ? await commercialStore.findCaseByEsignToken(token)
        : null;
      if (!match) return res.status(404).send('Signeringssida hittades inte.');
      await recordCustomerQuoteOpen(match, 'offer_sign_page');
      const origin = `${req.protocol}://${req.get('host')}`;
      const html = buildOfferSignPageHtml({
        commercialCase: match,
        planSnapshot: match.planSnapshot || {},
        token,
        origin,
        coolingOff: getCoolingOffMeta(match),
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (error) {
      console.error(error);
      return res.status(500).send('Kunde inte visa signeringssida.');
    }
  });

  router.get('/cco-commercial/customer-offer-portal', async (req, res) => {
    try {
      const token = normalizeText(req.query.token);
      if (!token) return res.status(400).send('token saknas.');
      const match = commercialStore.findCaseByEsignToken
        ? await commercialStore.findCaseByEsignToken(token)
        : null;
      if (!match) return res.status(404).send('Kundportal hittades inte.');
      await recordCustomerQuoteOpen(match, 'customer_offer_portal');
      const html = await buildCustomerOfferPortalHtml(match);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.send(html);
    } catch (error) {
      console.error(error);
      return res.status(500).send('Kunde inte visa kundportal.');
    }
  });

  router.get('/cco-commercial/offer/:token/open-beacon.gif', async (req, res) => {
    const pixel = Buffer.from(
      'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
      'base64'
    );
    try {
      const token = normalizeText(req.params.token);
      const match = commercialStore.findCaseByEsignToken
        ? await commercialStore.findCaseByEsignToken(token)
        : null;
      if (match) await recordCustomerQuoteOpen(match, 'offer_mail_pixel');
    } catch {
      /* pixel ska aldrig läcka fel eller PII */
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).send(pixel);
  });

  router.get('/cco-commercial/offer-photo', async (req, res) => {
    try {
      const token = normalizeText(req.query.token);
      const photoId = normalizeText(req.query.photoId);
      const variant = normalizeText(req.query.variant);
      if (!token || !photoId) return res.status(400).send('token och photoId krävs.');
      if (!journalPhotoStore) return res.status(503).send('Bildlagring ej konfigurerad.');
      const match = commercialStore.findCaseByEsignToken
        ? await commercialStore.findCaseByEsignToken(token)
        : null;
      if (!match) return res.status(404).send('Offert hittades inte.');
      const snapshot = match.planSnapshot || {};
      const attachments = listOfferPhotoAttachments(match);
      const entry = attachments.find((a) => normalizeText(a.photoId) === photoId);
      if (!entry) return res.status(403).send('Bild ej tillgänglig i denna offert.');
      const patientId = normalizeText(snapshot.patientId) || normalizeText(match.customerId);
      const tenantId = normalizeText(match.tenantId);
      let payload = null;
      if (variant === 'annotated' && entry.annotatedPreviewAvailable) {
        payload = await journalPhotoStore.readAnnotatedPreview({ tenantId, patientId, photoId });
      }
      if (!payload) {
        payload = await journalPhotoStore.readPhoto({ tenantId, patientId, photoId });
      }
      if (!payload?.buffer) return res.status(404).send('Bildfil hittades inte.');
      if (authStore?.addAuditEvent) {
        authStore
          .addAuditEvent({
            tenantId,
            actorUserId: 'customer_offer_view',
            action: 'cco.commercial.offer_photo_accessed',
            outcome: 'success',
            targetType: 'cco_commercial',
            targetId: match.commercialCaseId,
            metadata: { photoId, variant: variant || 'original', source: 'offer_photo_endpoint' },
          })
          .catch(() => {});
      }
      res.setHeader('Content-Type', payload.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(payload.buffer);
    } catch (error) {
      console.error('[cco-commercial/offer-photo]', error);
      return res.status(500).send('Kunde inte hämta bild.');
    }
  });

  router.post('/cco-commercial/getaccept/webhook', async (req, res) => {
    try {
      if (!verifyGetAcceptWebhookSignature(req)) {
        return res.status(401).json({ error: 'invalid_signature' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const eventType = normalizeText(body.event || body.eventType || body.type).toLowerCase();
      if (!/view|open/.test(eventType)) {
        return res.json({ ok: true, ignored: true });
      }
      const token = normalizeText(body.token || body.esignToken || body.documentToken);
      const documentId = normalizeText(body.documentId || body.offerDocumentId);
      let match = null;
      if (token && commercialStore.findCaseByEsignToken) {
        match = await commercialStore.findCaseByEsignToken(token);
      }
      if (!match && documentId && commercialStore.listCases) {
        match =
          (await commercialStore.listCases()).find((item) => item.offerDocumentId === documentId) ||
          null;
      }
      if (match) {
        await recordCustomerQuoteOpen(match, 'getaccept_document_viewed');
      }
      return res.json({ ok: true, recorded: Boolean(match) });
    } catch (error) {
      console.error('[cco-commercial/getaccept/webhook]', error);
      return res.status(500).json({ error: 'webhook_failed' });
    }
  });

  router.post(
    '/cco-commercial/offer-accept-public',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const token = normalizeText(req.query.token);
        const customerSignedName = normalizeText(req.body?.customerSignedName);
        if (!token) return res.status(400).send('token saknas.');
        if (!customerSignedName) return res.status(400).send('Namn krävs.');
        if (!commercialStore.findCaseByEsignToken) {
          return res.status(503).send('E-sign är inte konfigurerad.');
        }
        const existing = await commercialStore.findCaseByEsignToken(token);
        if (!existing) return res.status(404).send('Offert hittades inte.');
        const gate = canAcceptOffer(existing);
        if (!gate.allowed) {
          return res.status(409).send(gate.reason);
        }
        const updatedCase = await commercialStore.upsertCase({
          ...existing,
          quoteStatus: 'accepted',
          commercialStatus: 'ready',
          quoteAcceptedAt: new Date().toISOString(),
          customerSignedName,
          esignStatus: 'accepted',
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'offer_accepted_public',
              label: 'Offert accepterad av kund',
              detail: customerSignedName,
            },
          ],
        });

        // Trigger auto-flow: avtal → bokningslänk → SMS/e-post
        try {
          const { triggerAutoFlowIfEnabled } = require('../ops/offerAutoFlow');
          await triggerAutoFlowIfEnabled(
            updatedCase || { ...existing, quoteStatus: 'accepted', customerSignedName },
            {
              treatmentAgreementStore,
              bookingEngineStore,
              graphSendConnector,
              patientMasterStore,
            }
          );
        } catch (_autoFlowErr) {
          /* non-blocking */
        }

        return res
          .status(200)
          .send(
            '<html lang="sv"><body><h1>Tack!</h1><p>Offerten är accepterad. Du får snart en bokningslänk via SMS och e-post.</p></body></html>'
          );
      } catch (error) {
        console.error(error);
        return res.status(500).send('Kunde inte acceptera offert.');
      }
    }
  );

  return router;
}

module.exports = {
  createCcoCommercialRouter,
};
