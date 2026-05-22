'use strict';

const express = require('express');
const { normalizeText, resolveCcoRouteActor, buildCcoRouteContext } = require('./ccoRouteShared');

const {
  buildTreatmentAgreementReadout,
  canAcceptAgreement,
  DEFAULT_COOLING_OFF_DAYS,
} = require('../ops/ccoTreatmentAgreementStore');
const {
  buildTreatmentAgreementHtml,
  buildTreatmentAgreementSignPageHtml,
} = require('../ops/ccoTreatmentAgreementDocument');
const { addDaysIso, buildEsignToken } = require('../ops/ccoOfferEsign');
const { renderHtmlToPdfBuffer } = require('../ops/ccoOfferPdf');
const { checkTreatmentBookingGate } = require('../ops/ccoTreatmentBookingGate');

function createCcoTreatmentAgreementRouter({
  treatmentAgreementStore,
  commercialStore = null,
  patientMasterStore = null,
  offerDocumentStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();
  const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

  async function handle(req, res, fn) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      const context = buildCcoRouteContext(req, actor);
      return fn(context, actor, req, res);
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) console.error(error);
      return res.status(status).json({ error: error.message || 'Internt fel.' });
    }
  }

  async function findCommercialCase(actor, patientId) {
    if (!commercialStore) return null;
    return commercialStore.getPatientRegisterCase({
      tenantId: actor.tenantId,
      patientId,
    });
  }

  router.get(
    '/cco-treatment-agreement/patient-agreement',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        const agreement = await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        });
        return res.json({
          agreement,
          agreementReadout: agreement ? buildTreatmentAgreementReadout(agreement) : null,
        });
      })
  );

  router.get(
    '/cco-treatment-agreement/booking-gate',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        const patientId = normalizeText(req.query.patientId);
        const customerEmail = normalizeText(req.query.customerEmail);
        const serviceId = normalizeText(req.query.serviceId);
        if (!patientId && !customerEmail) {
          return res.status(400).json({ error: 'patientId eller customerEmail krävs.' });
        }
        const gate = await checkTreatmentBookingGate({
          treatmentAgreementStore,
          patientMasterStore,
          tenantId: actor.tenantId,
          patientId,
          customerEmail,
          body: {
            serviceId,
            selectedSlots: serviceId ? [{ serviceId }] : [],
          },
        });
        return res.json({ gate });
      })
  );

  router.post(
    '/cco-treatment-agreement/from-offer',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor, reqInner) => {
        const body = reqInner.body && typeof reqInner.body === 'object' ? reqInner.body : {};
        const patientId = normalizeText(body.patientId);
        const deliveryMode = normalizeText(body.deliveryMode) || 'plats';
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });

        const commercialCase = await findCommercialCase(actor, patientId);
        if (!commercialCase || commercialCase.quoteStatus !== 'accepted') {
          return res
            .status(409)
            .json({ error: 'Offerten måste vara accepterad innan avtal skapas.' });
        }

        let patientName = commercialCase.customerName || '';
        if (patientMasterStore) {
          const patient = await patientMasterStore.getPatient({
            tenantId: actor.tenantId,
            patientId,
          });
          patientName = patient?.displayName || patientName;
        }

        const existing = await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        });

        const origin = `${reqInner.protocol}://${reqInner.get('host')}`;
        const draft = {
          ...(existing || {}),
          tenantId: actor.tenantId,
          patientId,
          patientName,
          deliveryMode: deliveryMode === 'distans' ? 'distans' : 'plats',
          agreementStatus: existing?.agreementStatus || 'draft',
          linkedCommercialCaseId: commercialCase.commercialCaseId,
          linkedJournalEntryId: commercialCase.linkedJournalEntryId,
          offerType: commercialCase.offerType,
          quotedAmount: commercialCase.quotedAmount,
          events: [
            ...(Array.isArray(existing?.events) ? existing.events : []),
            {
              type: 'agreement_created_from_offer',
              label: 'Behandlingsavtal skapat från offert',
              detail: deliveryMode,
              actorUserId: actor.userId,
            },
          ],
        };

        let agreement = await treatmentAgreementStore.upsertAgreement(draft);

        if (offerDocumentStore) {
          const html = buildTreatmentAgreementHtml({
            agreement,
            commercialCase,
            patientName,
            origin,
          });
          const saved = await offerDocumentStore.saveHtml({
            tenantId: actor.tenantId,
            documentId: agreement.agreementDocumentId || undefined,
            html,
          });
          let pdfId = agreement.agreementDocumentPdfId || '';
          try {
            const pdfBuffer = await renderHtmlToPdfBuffer(html);
            const savedPdf = await offerDocumentStore.savePdf({
              tenantId: actor.tenantId,
              documentId: pdfId || undefined,
              buffer: pdfBuffer,
            });
            pdfId = savedPdf.documentId;
          } catch {
            pdfId = pdfId || '';
          }
          agreement = await treatmentAgreementStore.upsertAgreement({
            ...agreement,
            agreementDocumentId: saved.documentId,
            agreementDocumentPdfId: pdfId,
            attachments: [
              {
                type: 'patientinfo_pdf',
                url: '/patientinformation/hartransplantation-dhi-prp-minimal.pdf',
                label: 'Bilaga 1 — Patientinformation',
              },
              ...(pdfId
                ? [
                    {
                      type: 'agreement_pdf',
                      documentId: pdfId,
                      label: 'Behandlingsavtal PDF',
                    },
                  ]
                : []),
            ],
            events: [
              ...(Array.isArray(agreement.events) ? agreement.events : []),
              {
                type: 'agreement_document_generated',
                label: 'Avtalsdokument genererat',
                detail: saved.documentId,
                actorUserId: actor.userId,
              },
            ],
          });
        }

        return res.json({
          agreement,
          agreementReadout: buildTreatmentAgreementReadout(agreement),
          agreementDocumentUrl: agreement.agreementDocumentId
            ? `/api/v1/cco-treatment-agreement/document?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(agreement.agreementDocumentId)}`
            : '',
        });
      })
  );

  router.post(
    '/cco-treatment-agreement/send-patient-info',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor, reqInner) => {
        const body = reqInner.body && typeof reqInner.body === 'object' ? reqInner.body : {};
        const patientId = normalizeText(body.patientId);
        const channel = normalizeText(body.channel) || 'manual';
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });

        const existing = (await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        })) || { tenantId: actor.tenantId, patientId };

        const sentAt = new Date().toISOString();
        const logEntry = {
          sentAt,
          channel,
          version: existing.patientInfoVersion || '251030-minimal',
          pdfUrl: '/patientinformation/hartransplantation-dhi-prp-minimal.pdf',
          actorUserId: actor.userId,
        };

        const agreement = await treatmentAgreementStore.upsertAgreement({
          ...existing,
          patientInfoSentAt: sentAt,
          patientInfoChannel: channel,
          agreementStatus:
            existing.agreementStatus === 'draft' || !existing.agreementStatus
              ? 'patient_info_sent'
              : existing.agreementStatus,
          patientInfoLog: [
            ...(Array.isArray(existing.patientInfoLog) ? existing.patientInfoLog : []),
            logEntry,
          ],
          attachments: [
            ...(Array.isArray(existing.attachments) ? existing.attachments : []),
            {
              type: 'patientinfo_pdf',
              url: '/patientinformation/hartransplantation-dhi-prp-minimal.pdf',
              sentAt,
              label: 'Bilaga 1 — Patientinformation',
            },
          ],
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'patient_info_sent',
              label: 'Patientinformation skickad',
              detail: `${channel} · ${logEntry.version}`,
              actorUserId: actor.userId,
            },
          ],
        });

        return res.json({
          agreement,
          agreementReadout: buildTreatmentAgreementReadout(agreement),
          patientInfoPdfUrl: '/patientinformation/hartransplantation-dhi-prp-minimal.pdf',
        });
      })
  );

  router.post(
    '/cco-treatment-agreement/send-for-sign',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor, reqInner) => {
        const body = reqInner.body && typeof reqInner.body === 'object' ? reqInner.body : {};
        const patientId = normalizeText(body.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });

        const existing = await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!existing?.agreementDocumentId) {
          return res
            .status(404)
            .json({ error: 'Inget avtal att skicka — skapa från offert först.' });
        }

        const sentAt = new Date().toISOString();
        const isDistans = normalizeText(existing.deliveryMode) === 'distans';
        const coolingOffEndsAt = isDistans
          ? addDaysIso(sentAt, existing.coolingOffDays || DEFAULT_COOLING_OFF_DAYS)
          : '';

        const agreement = await treatmentAgreementStore.upsertAgreement({
          ...existing,
          agreementStatus: isDistans ? 'cooling_off' : 'sent',
          agreementSentAt: sentAt,
          coolingOffEndsAt,
          esignToken: existing.esignToken || buildEsignToken(),
          esignStatus: 'sent',
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'agreement_sent_for_sign',
              label: 'Behandlingsavtal skickat för signering',
              detail: isDistans ? 'distans' : 'plats',
              actorUserId: actor.userId,
            },
          ],
        });

        const origin = `${reqInner.protocol}://${reqInner.get('host')}`;
        return res.json({
          agreement,
          agreementReadout: buildTreatmentAgreementReadout(agreement),
          agreementSignUrl: `${origin}/api/v1/cco-treatment-agreement/sign-page?token=${encodeURIComponent(agreement.esignToken)}`,
        });
      })
  );

  router.post(
    '/cco-treatment-agreement/accept',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor, reqInner) => {
        const body = reqInner.body && typeof reqInner.body === 'object' ? reqInner.body : {};
        const patientId = normalizeText(body.patientId);
        const customerSignedName = normalizeText(body.customerSignedName);
        const forceAccept = body.forceAccept === true;
        if (!patientId) return res.status(400).json({ error: 'patientId krävs.' });

        const existing = await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!existing) return res.status(404).json({ error: 'Behandlingsavtal saknas.' });

        const gate = canAcceptAgreement(existing, { forceAccept });
        if (!gate.allowed) {
          return res.status(409).json({ error: gate.reason, coolingOff: gate.coolingOff });
        }

        const signedAt = new Date().toISOString();
        const agreement = await treatmentAgreementStore.upsertAgreement({
          ...existing,
          agreementStatus: 'bookable',
          signedAt,
          customerSignedName: customerSignedName || existing.customerSignedName || 'Kund',
          esignStatus: 'signed',
          events: [
            ...(Array.isArray(existing.events) ? existing.events : []),
            {
              type: 'agreement_signed',
              label: 'Behandlingsavtal signerat',
              detail: customerSignedName || 'Kund',
              actorUserId: actor.userId,
            },
          ],
        });

        return res.json({
          agreement,
          agreementReadout: buildTreatmentAgreementReadout(agreement),
        });
      })
  );

  router.get('/cco-treatment-agreement/sign-page', async (req, res) => {
    try {
      const token = normalizeText(req.query.token);
      if (!token) return res.status(400).send('token saknas.');
      const agreement = treatmentAgreementStore.findAgreementByEsignToken
        ? await treatmentAgreementStore.findAgreementByEsignToken(token)
        : null;
      if (!agreement) return res.status(404).send('Signeringssida hittades inte.');
      const origin = `${req.protocol}://${req.get('host')}`;
      const readout = buildTreatmentAgreementReadout(agreement);
      const html = buildTreatmentAgreementSignPageHtml({
        agreement,
        token,
        origin,
        coolingOff: readout.coolingOff,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (error) {
      return res.status(500).send(error.message || 'Fel.');
    }
  });

  router.post('/cco-treatment-agreement/accept-public', async (req, res) => {
    try {
      const token = normalizeText(req.query.token || req.body?.token);
      const customerSignedName = normalizeText(req.body?.customerSignedName);
      if (!token) return res.status(400).send('token saknas.');
      const existing = treatmentAgreementStore.findAgreementByEsignToken
        ? await treatmentAgreementStore.findAgreementByEsignToken(token)
        : null;
      if (!existing) return res.status(404).send('Avtal hittades inte.');

      const gate = canAcceptAgreement(existing);
      if (!gate.allowed) {
        return res.status(409).send(gate.reason);
      }

      const signedAt = new Date().toISOString();
      await treatmentAgreementStore.upsertAgreement({
        ...existing,
        agreementStatus: 'bookable',
        signedAt,
        customerSignedName: customerSignedName || 'Kund',
        esignStatus: 'signed',
        events: [
          ...(Array.isArray(existing.events) ? existing.events : []),
          {
            type: 'agreement_signed_public',
            label: 'Behandlingsavtal signerat av kund',
            detail: customerSignedName || 'Kund',
          },
        ],
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(
        '<!DOCTYPE html><html lang="sv"><body style="font-family:sans-serif;padding:32px;"><h1>Tack!</h1><p>Behandlingsavtalet är signerat. Kliniken kontaktar dig för bokning.</p></body></html>'
      );
    } catch (error) {
      return res.status(500).send(error.message || 'Fel.');
    }
  });

  router.get(
    '/cco-treatment-agreement/document',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        if (!offerDocumentStore) {
          return res.status(503).json({ error: 'Dokumentlagring saknas.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const documentId = normalizeText(req.query.documentId);
        if (!patientId || !documentId) {
          return res.status(400).json({ error: 'patientId och documentId krävs.' });
        }
        const agreement = await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        });
        if (!agreement || agreement.agreementDocumentId !== documentId) {
          return res.status(404).json({ error: 'Avtalsdokument hittades inte.' });
        }
        const payload = await offerDocumentStore.readHtml({
          tenantId: actor.tenantId,
          documentId,
        });
        if (!payload?.html) return res.status(404).json({ error: 'Dokument saknas.' });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.send(payload.html);
      })
  );

  router.get(
    '/cco-treatment-agreement/document.pdf',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (_context, actor) => {
        if (!offerDocumentStore) {
          return res.status(503).json({ error: 'Dokumentlagring saknas.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const documentId = normalizeText(req.query.documentId) || '';
        const agreement = await treatmentAgreementStore.getPatientAgreement({
          tenantId: actor.tenantId,
          patientId,
        });
        const pdfId = documentId || agreement?.agreementDocumentPdfId;
        if (!patientId || !pdfId) {
          return res.status(400).json({ error: 'patientId och documentId krävs.' });
        }
        const payload = await offerDocumentStore.readPdf({
          tenantId: actor.tenantId,
          documentId: pdfId,
        });
        if (!payload?.buffer) return res.status(404).json({ error: 'PDF saknas.' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="behandlingsavtal.pdf"');
        return res.send(payload.buffer);
      })
  );

  return router;
}

module.exports = { createCcoTreatmentAgreementRouter };
