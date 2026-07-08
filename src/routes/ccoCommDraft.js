'use strict';

/**
 * ccoCommDraft — HTTP-rutter för kommunikations-utkast (Svarstudio v2 · P2).
 *
 * Exponerar den befintliga draft-state-machine (ccoCommDraftStore) och en
 * gateway-styrd AI-generering. Owner-mandat hålls hårt:
 *   - Skriv-väg (skapa/uppdatera/transition) bakom mail.send (RBAC).
 *   - AI-generering går genom execution-gateway (input-risk → agent-run →
 *     output-risk → policy-floor) och den journal-skyddade OpenAI-klienten;
 *     journalinnehåll redigeras bort (inget __aiContext-bypass).
 *   - LIVE-UTSKICK (→ sent) kräver mail.live_send (endast owner), featureflag,
 *     allowlists och en uttryckligt injicerad send-adapter.
 *
 * Speglar router-mönstret i src/routes/ccoCustomerComm.js.
 */

const express = require('express');
const fsp = require('node:fs/promises');
const nodePath = require('node:path');
const nodeCrypto = require('node:crypto');
const { attachRole, requirePermission, roleHasPermission } = require('../security/ccoRbac');
const { containsJournalLikeContent } = require('../ops/ccoJournalAiGuard');
const { composeHtmlBody } = require('../ops/ccoSignatureHtml');
const { createExecutionGateway } = require('../gateway/executionGateway');

// Bilagor på utkast (Svarstudio, steg 1b). Bytes lagras på persistent disk; ingen
// live-send. Storleks-/typgräns skyddar disken och läsytan.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseSendMailboxAllowlist(rawValue = '') {
  return new Set(
    String(rawValue || '')
      .split(/[,\s;]+/)
      .map((item) => text(item).toLowerCase())
      .filter(Boolean)
  );
}

function senderMailboxAllowed(senderMailbox) {
  const mailbox = text(senderMailbox).toLowerCase();
  if (!mailbox) return true;
  const allowlist = parseSendMailboxAllowlist(process.env.ARCANA_GRAPH_SEND_ALLOWLIST);
  return allowlist.has('*') || allowlist.has(mailbox);
}

// ── Risk-/policy-evaluatorer för utkast (återanvänder journal-detektorn) ──
function draftInputRiskEvaluation(snippet) {
  const journalish = containsJournalLikeContent(snippet || '');
  return {
    riskLevel: journalish ? 3 : 1,
    riskScore: journalish ? 0.6 : 0.05,
    decision: journalish ? 'review_required' : '',
    reasonCodes: journalish ? ['journal_like_input'] : [],
  };
}

function draftOutputRiskEvaluation(body) {
  const journalish = containsJournalLikeContent(body || '');
  return {
    riskLevel: journalish ? 4 : 1,
    riskScore: journalish ? 0.7 : 0.05,
    decision: journalish ? 'review_required' : '',
    reasonCodes: journalish ? ['journal_like_output'] : [],
  };
}

function draftPolicyFloorEvaluation(body) {
  const empty = !text(body);
  return {
    blocked: empty,
    maxFloor: empty ? 5 : 1,
    hits: empty ? [{ id: 'empty_body' }] : [],
  };
}

function createCcoCommDraftRouter({
  config = {},
  requireAuth,
  commDraftStore = null,
  recipientAllowlistStore = null,
  graphSendAdapter = null,
  executionGateway = null,
  openai = null,
  auditLog = null,
  appLocals = null,
} = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '64kb' });
  const gateway =
    executionGateway || createExecutionGateway({ buildVersion: config.buildVersion || 'dev' });
  const { draftReply } = require('../ops/ccoAiService');

  let storeRef = commDraftStore;

  function storePath() {
    return config.ccoCommDraftStorePath || `${config.stateRoot || './data'}/cco-comm-draft.json`;
  }

  async function ensureStore() {
    if (storeRef) return storeRef;
    if (appLocals?.ccoCommDraftStore) {
      storeRef = appLocals.ccoCommDraftStore;
      return storeRef;
    }
    const { createCcoCommDraftStore } = require('../ops/ccoCommDraftStore');
    storeRef = await createCcoCommDraftStore({ filePath: storePath(), auditLog });
    if (appLocals && !appLocals.ccoCommDraftStore) appLocals.ccoCommDraftStore = storeRef;
    return storeRef;
  }

  let allowlistRef = recipientAllowlistStore;
  function allowlistPath() {
    return (
      config.ccoRecipientAllowlistStorePath ||
      `${config.stateRoot || './data'}/cco-recipient-allowlist.json`
    );
  }
  async function ensureAllowlistStore() {
    if (allowlistRef) return allowlistRef;
    const { createCcoRecipientAllowlistStore } = require('../ops/ccoRecipientAllowlistStore');
    allowlistRef = await createCcoRecipientAllowlistStore({ filePath: allowlistPath(), auditLog });
    if (appLocals && !appLocals.ccoRecipientAllowlistStore) {
      appLocals.ccoRecipientAllowlistStore = allowlistRef;
    }
    return allowlistRef;
  }

  // Live Graph-send-flagga (default av). 2c läser den bara för att HÅRT BLOCKERA
  // — inget skickas här oavsett värde; själva send-vägen kopplas in först i 2d.
  function graphSendEnabled() {
    return String(process.env.ARCANA_GRAPH_SEND_ENABLED || '').toLowerCase() === 'true';
  }

  function actorOf(req) {
    return { userId: req.auth?.userId || null, role: req.cco?.role || req.auth?.role || 'unknown' };
  }

  // Journal-skyddad modell-komposition: med OpenAI om konfigurerad, annars
  // deterministisk fallback. INGET __aiContext ⇒ journal-mönster redigeras bort.
  async function composeReply({ tone, customerName, threadSnippet, signature }) {
    if (
      openai &&
      openai.chat &&
      openai.chat.completions &&
      typeof openai.chat.completions.create === 'function'
    ) {
      try {
        const completion = await openai.chat.completions.create({
          model: config.openaiModel || 'gpt-4o-mini',
          temperature: 0.6,
          messages: [
            {
              role: 'system',
              content:
                'Du är en svensk klinik-koordinator. Skriv ett kort, artigt och korrekt ' +
                'svar till en patient. Avslöja aldrig journal- eller hälsodata. Ton: ' +
                tone +
                '.',
            },
            {
              role: 'user',
              content: `Kund: ${customerName || 'patienten'}\nInkommande meddelande:\n${threadSnippet || ''}\n\nSkriv ett svar.`,
            },
          ],
        });
        const out = text(completion?.choices?.[0]?.message?.content);
        if (out) {
          const sig = text(signature);
          return sig ? `${out}\n\n${sig}` : out;
        }
      } catch (_error) {
        /* faller tillbaka till deterministisk komposition */
      }
    }
    // Skicka med kundens meddelande (threadSnippet → message) så intent-
    // heuristiken körs och svaret inte blir generiskt i fallback/offline/CI
    // (Bugbot: fallback omits thread snippet).
    return draftReply({ message: threadSnippet, tone, customerName, signature, intent: 'reply' })
      .body;
  }

  // ── POST /cco-comm/drafts/generate-reply — gateway-styrd AI-generering ──
  router.post(
    '/cco-comm/drafts/generate-reply',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      const tenantId = text(req.body?.tenantId) || text(req.auth?.tenantId) || 'hairtpclinic';
      const customerId = text(req.body?.customerId);
      if (!customerId) return res.status(400).json({ error: 'customerId krävs.' });
      const tone = text(req.body?.tone) || 'professional';
      const threadSnippet = text(req.body?.threadSnippet);
      const customerName = text(req.body?.customerName);
      const signature = text(req.body?.signature);
      const subject = text(req.body?.subject);
      const journeyStep = text(req.body?.journeyStep) || null;

      try {
        const store = await ensureStore();
        const result = await gateway.run({
          context: {
            tenant_id: tenantId,
            actor: actorOf(req),
            channel: 'draft',
            intent: 'comm.draft_generate_reply',
            payload: { customerId, tone },
          },
          handlers: {
            audit: async (event) => {
              try {
                auditLog?.append?.({
                  action: 'comm.draft.generate',
                  actor: { role: req.cco?.role, userId: req.auth?.userId || null },
                  target: { kind: 'comm_draft', id: null, tenantId },
                  result: event?.outcome === 'failure' ? 'error' : 'ok',
                  detail: { stage: event?.stage || null, intent: 'reply' },
                });
              } catch (_error) {
                /* tyst */
              }
            },
            // Gateway-gaten wrappar returvärdet som { evaluation: <retur> };
            // handlern ska därför returnera evaluerings-objektet DIREKT.
            inputRisk: async () => draftInputRiskEvaluation(threadSnippet),
            agentRun: async () => ({
              body: await composeReply({ tone, customerName, threadSnippet, signature }),
            }),
            outputRisk: async ({ agentResult }) => draftOutputRiskEvaluation(agentResult?.body),
            policyFloor: async ({ agentResult }) => draftPolicyFloorEvaluation(agentResult?.body),
            persist: async ({ agentResult }) => {
              const draft = await store.createDraft(
                {
                  tenantId,
                  customerId,
                  channel: 'email',
                  subject,
                  body: agentResult?.body || '',
                  journeyStep,
                  aiGenerated: true,
                },
                { actor: actorOf(req) }
              );
              return { artifact_refs: { draft_id: draft.draftId }, draft };
            },
            response: ({ persisted, decision }) => ({
              draftId: persisted?.draft?.draftId || null,
              body: persisted?.draft?.body || '',
              status: persisted?.draft?.status || null,
              decision,
            }),
          },
        });

        if (result.decision === 'blocked' || result.decision === 'critical_escalate') {
          return res.status(403).json({
            error: 'Utkastet blockerades av risk/policy.',
            decision: result.decision,
            safeResponse: result.safe_response || null,
          });
        }
        return res.json({ ...(result.response_payload || {}), decision: result.decision });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  // ── POST /cco-comm/drafts — skapa utkast ──
  router.post(
    '/cco-comm/drafts',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      try {
        const store = await ensureStore();
        const draft = await store.createDraft(
          {
            tenantId: text(req.body?.tenantId) || text(req.auth?.tenantId) || 'hairtpclinic',
            customerId: text(req.body?.customerId),
            channel: text(req.body?.channel) || 'email',
            subject: text(req.body?.subject),
            body: typeof req.body?.body === 'string' ? req.body.body : '',
            journeyStep: text(req.body?.journeyStep) || null,
            signatureId: text(req.body?.signatureId) || null,
            aiGenerated: !!req.body?.aiGenerated,
            mergeFields: req.body?.mergeFields || {},
          },
          { actor: actorOf(req) }
        );
        return res.status(201).json({ draft });
      } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
      }
    }
  );

  // ── PATCH /cco-comm/drafts/:draftId — uppdatera innehåll ──
  router.patch(
    '/cco-comm/drafts/:draftId',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      try {
        const store = await ensureStore();
        const draft = await store.updateDraft(
          text(req.params.draftId),
          {
            subject: req.body?.subject,
            body: req.body?.body,
            channel: req.body?.channel,
            mergeFields: req.body?.mergeFields,
            signatureId: req.body?.signatureId,
          },
          { actor: actorOf(req), tenantId: text(req.auth?.tenantId) || null }
        );
        return res.json({ draft });
      } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
      }
    }
  );

  // ── POST /cco-comm/drafts/:draftId/transition — statusövergång ──
  router.post(
    '/cco-comm/drafts/:draftId/transition',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      const newStatus = text(req.body?.status).toLowerCase();
      const reason = text(req.body?.reason) || null;

      // OWNER-MANDAT: live-utskick (→ sent) är hårt blockerat.
      if (newStatus === 'sent') {
        const role = req.cco?.role || req.auth?.role;
        if (!roleHasPermission(role, 'mail.live_send')) {
          return res.status(403).json({
            error: 'Live-utskick kräver owner (mail.live_send).',
            requiredPermission: 'mail.live_send',
          });
        }
        return res.status(403).json({
          error: 'Live-utskick är avstängt (owner-mandat: ingen auto-send i denna build).',
          decision: 'blocked',
        });
      }

      try {
        const store = await ensureStore();
        const role = req.cco?.role || req.auth?.role;
        const draft = await store.transitionStatus(text(req.params.draftId), newStatus, {
          actor: actorOf(req),
          reason,
          tenantId: text(req.auth?.tenantId) || null,
          // Owner (mail.live_send) får godkänna eget utkast; övriga roller inte
          // (segregation of duties — författare ≠ godkännare).
          allowSelfApprove: roleHasPermission(role, 'mail.live_send'),
        });
        return res.json({ draft });
      } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
      }
    }
  );

  // ── GET /cco-comm/drafts/:draftId — läs ett utkast ──
  router.get(
    '/cco-comm/drafts/:draftId',
    requireAuth,
    attachRole,
    requirePermission('mail.read'),
    async (req, res) => {
      const store = await ensureStore();
      const draft = store.getDraft(text(req.params.draftId), {
        tenantId: text(req.auth?.tenantId) || null,
      });
      if (!draft) return res.status(404).json({ error: 'draft not found' });
      return res.json({ draft });
    }
  );

  // ── GET /cco-comm/drafts?customerId=&status= — lista ──
  router.get(
    '/cco-comm/drafts',
    requireAuth,
    attachRole,
    requirePermission('mail.read'),
    async (req, res) => {
      const store = await ensureStore();
      const customerId = text(req.query?.customerId);
      const status = text(req.query?.status) || null;
      const drafts = customerId
        ? store.listForCustomer(customerId, { status })
        : store.listByStatus(status || 'needs_approval', {
            tenantId: text(req.query?.tenantId) || null,
          });
      return res.json({ drafts });
    }
  );

  // ── Bilage-routes (steg 1b): upload / serve / delete. Ingen live-send. ──
  const multer = require('multer');
  const attachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES },
  });
  function uploadSingleFile(req, res, next) {
    attachmentUpload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Filen är för stor (max 15 MB).' });
        }
        return res.status(400).json({ error: err.message });
      }
      return next();
    });
  }
  function attachmentsRoot() {
    return nodePath.resolve(config.stateRoot || './data', 'cco-comm-attachments');
  }
  // Skydd mot path-traversal: en lagrad sökväg måste ligga under bilage-roten.
  function isPathInsideAttachmentsRoot(storagePath) {
    const resolved = nodePath.resolve(String(storagePath || ''));
    const root = attachmentsRoot();
    return resolved === root || resolved.startsWith(root + nodePath.sep);
  }
  function safeDraftAttachmentSegment(value) {
    const safe = text(value);
    if (!safe || safe === '.' || safe === '..' || safe.includes('/') || safe.includes('\\')) {
      const e = new Error('draft not found');
      e.statusCode = 404;
      throw e;
    }
    return safe;
  }
  function assertDraftAcceptsAttachment(store, draftId, tenantId) {
    const draft = store.getDraft(draftId, { tenantId });
    if (!draft) {
      const e = new Error('draft not found');
      e.statusCode = 404;
      throw e;
    }
    if (['sent', 'cancelled'].includes(draft.status)) {
      const e = new Error('draft is ' + draft.status + ', cannot edit');
      e.statusCode = 409;
      throw e;
    }
    return draft;
  }

  // POST — ladda upp en bilaga till ett utkast (multipart field: file).
  router.post(
    '/cco-comm/drafts/:draftId/attachments',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    uploadSingleFile,
    async (req, res) => {
      let storagePath = null;
      try {
        const store = await ensureStore();
        const tenantId = text(req.auth?.tenantId) || null;
        const draftId = safeDraftAttachmentSegment(req.params.draftId);
        if (!req.file) {
          return res.status(400).json({ error: 'file krävs (multipart/form-data field: file).' });
        }
        const contentType = text(req.file.mimetype).toLowerCase();
        if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
          return res.status(415).json({ error: 'Otillåten filtyp.', contentType });
        }
        assertDraftAcceptsAttachment(store, draftId, tenantId);
        const attachmentId = nodeCrypto.randomUUID();
        const sha256 = nodeCrypto.createHash('sha256').update(req.file.buffer).digest('hex');
        const dir = nodePath.join(attachmentsRoot(), draftId);
        await fsp.mkdir(dir, { recursive: true });
        storagePath = nodePath.join(dir, attachmentId);
        await fsp.writeFile(storagePath, req.file.buffer);
        const result = await store.addDraftAttachment(
          draftId,
          {
            attachmentId,
            name: text(req.file.originalname) || 'Bilaga',
            contentType,
            size: req.file.size,
            storagePath,
            sha256,
          },
          { actor: actorOf(req), tenantId }
        );
        return res.status(201).json({ attachment: result.attachment });
      } catch (error) {
        // Storen avvisade (fel tenant/sent/cancelled) → städa den skrivna filen.
        if (storagePath) await fsp.rm(storagePath, { force: true }).catch(() => {});
        return res.status(error.statusCode || 400).json({ error: error.message });
      }
    }
  );

  // GET — servera bilagans bytes (inline, eller ?download=1 för nedladdning).
  router.get(
    '/cco-comm/drafts/:draftId/attachments/:attachmentId/content',
    requireAuth,
    attachRole,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        const store = await ensureStore();
        const att = store.getDraftAttachment(
          text(req.params.draftId),
          text(req.params.attachmentId),
          { tenantId: text(req.auth?.tenantId) || null }
        );
        if (!att || !att.storagePath || !isPathInsideAttachmentsRoot(att.storagePath)) {
          return res.status(404).json({ error: 'attachment not found' });
        }
        const buffer = await fsp.readFile(nodePath.resolve(att.storagePath)).catch(() => null);
        if (!buffer) return res.status(404).json({ error: 'attachment not found' });
        const disposition = text(req.query.download) === '1' ? 'attachment' : 'inline';
        res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(att.name || 'bilaga')}`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(buffer);
      } catch (error) {
        return res.status(error.statusCode || 404).json({ error: error.message });
      }
    }
  );

  // DELETE — ta bort en bilaga (metadata + fil).
  router.delete(
    '/cco-comm/drafts/:draftId/attachments/:attachmentId',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    async (req, res) => {
      try {
        const store = await ensureStore();
        const { removed } = await store.removeDraftAttachment(
          text(req.params.draftId),
          text(req.params.attachmentId),
          { actor: actorOf(req), tenantId: text(req.auth?.tenantId) || null }
        );
        if (removed?.storagePath && isPathInsideAttachmentsRoot(removed.storagePath)) {
          await fsp.rm(nodePath.resolve(removed.storagePath), { force: true }).catch(() => {});
        }
        return res.json({ ok: true });
      } catch (error) {
        return res.status(error.statusCode || 400).json({ error: error.message });
      }
    }
  );

  // ── POST /cco-comm/drafts/:draftId/send-preview — dry-run (steg 2c) ──
  // Bygger förhandsvisningen av mailet ("så här skulle det skickas") och kör
  // säkerhetskontrollerna, men SKICKAR ALDRIG. Kräver approved-utkast, verifierar
  // mottagaren mot mottagar-allowlisten (2a), och är HÅRT BLOCKERAD när
  // ARCANA_GRAPH_SEND_ENABLED är av (403). Faktisk Graph-send kopplas in i 2d.
  router.post(
    '/cco-comm/drafts/:draftId/send-preview',
    requireAuth,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      try {
        const { isPlausibleEmail, maskAddress } = require('../ops/ccoRecipientAllowlistStore');
        const draftId = text(req.params.draftId);
        const to = text(req.body?.to).toLowerCase();
        const senderMailbox = text(req.body?.senderMailbox).toLowerCase() || null;

        const store = await ensureStore();
        const draft = store.getDraft(draftId, { tenantId: text(req.auth?.tenantId) || null });
        if (!draft) return res.status(404).json({ error: 'draft not found' });

        const tenantId = draft.tenantId || text(req.auth?.tenantId) || null;

        function audit(result, detail) {
          auditLog?.append?.({
            action: 'communication.draft.send_preview',
            actor: actorOf(req),
            target: { kind: 'comm_draft', id: draftId, tenantId },
            result,
            detail: { recipientMasked: maskAddress(to), ...detail },
          });
        }

        // Bara godkända utkast får förhandsvisas för send — samma port som send.
        if (draft.status !== 'approved') {
          audit('error', { reason: 'not_approved', status: draft.status });
          return res
            .status(409)
            .json({ error: 'send-preview kräver approved utkast.', status: draft.status });
        }

        // Mottagaradress måste finnas och vara rimlig.
        if (!isPlausibleEmail(to)) {
          audit('error', { reason: 'invalid_recipient' });
          return res.status(400).json({ error: 'giltig mottagaradress (to) krävs.' });
        }

        // Om klienten anger from-mailbox måste den matcha befintlig Graph-send-
        // allowlist. Annars kan previewen lova en avsändare som 2d senare stoppar.
        if (senderMailbox && !isPlausibleEmail(senderMailbox)) {
          audit('error', { reason: 'invalid_sender_mailbox' });
          return res.status(400).json({ error: 'giltig senderMailbox krävs.' });
        }
        if (senderMailbox && !senderMailboxAllowed(senderMailbox)) {
          audit('error', {
            reason: 'sender_mailbox_not_allowlisted',
            senderMailboxMasked: maskAddress(senderMailbox),
          });
          return res.status(403).json({
            decision: 'blocked',
            reason: 'sender_mailbox_not_allowlisted',
            error: 'Avsändar-mailboxen är inte allowlistad för Graph-send.',
          });
        }

        // Mottagaren måste vara aktivt allowlistad (2a) för denna tenant.
        const allowlist = await ensureAllowlistStore();
        if (!allowlist.isAllowed(tenantId, to)) {
          audit('error', { reason: 'recipient_not_allowlisted' });
          return res.status(403).json({
            decision: 'blocked',
            reason: 'recipient_not_allowlisted',
            error: 'Mottagaren är inte på allowlisten för utgående mail.',
          });
        }

        // Payloaden som ETT framtida utskick skulle bygga — ingen send sker här.
        const preview = {
          from: senderMailbox,
          to,
          subject: draft.subject || '',
          bodyPreview: (draft.body || '').slice(0, 2000),
          bodyLength: (draft.body || '').length,
          channel: draft.channel,
          attachments: (draft.attachments || []).map((a) => ({
            name: a.name,
            contentType: a.contentType,
            size: a.size,
          })),
        };

        // HÅRT BLOCK: med flaggan av (default) returneras 403 men med preview så
        // operatören ser exakt vad som skulle skickas. Inget lämnar systemet.
        if (!graphSendEnabled()) {
          audit('ok', { dryRun: true, blocked: true, reason: 'send_disabled' });
          return res.status(403).json({
            decision: 'blocked',
            reason: 'send_disabled',
            dryRun: true,
            sent: false,
            preview,
          });
        }

        // Flaggan på: 2c förhandsvisar ändå bara — faktisk send är 2d:s ansvar.
        audit('ok', { dryRun: true, blocked: false });
        return res.json({ decision: 'preview_ok', dryRun: true, sent: false, preview });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  // ── POST /cco-comm/drafts/:draftId/send — kontrollerad live-send (steg 2d) ──
  // Den ENDA vägen som kan skicka på riktigt. Den generiska /transition → sent
  // förblir hårt blockerad. Grindar (alla måste passera): owner (mail.live_send,
  // via middleware) · flaggan ARCANA_GRAPH_SEND_ENABLED på · en send-adapter
  // wire:ad · approved-utkast · mottagare allowlistad (2a) · avsändar-brevlåda
  // på ARCANA_GRAPH_SEND_ALLOWLIST. Varje försök loggas i audit (maskerad
  // mottagare). Utan wire:ad adapter skickas inget ens med flaggan på.
  router.post(
    '/cco-comm/drafts/:draftId/send',
    requireAuth,
    attachRole,
    requirePermission('mail.live_send'),
    jsonParser,
    async (req, res) => {
      const { maskAddress, isPlausibleEmail } = require('../ops/ccoRecipientAllowlistStore');
      const draftId = text(req.params.draftId);
      const to = text(req.body?.to).toLowerCase();
      const senderMailbox = text(req.body?.senderMailbox).toLowerCase();

      try {
        const store = await ensureStore();
        const draft = store.getDraft(draftId, { tenantId: text(req.auth?.tenantId) || null });
        if (!draft) return res.status(404).json({ error: 'draft not found' });
        const tenantId = draft.tenantId || text(req.auth?.tenantId) || null;

        const audit = (result, detail) =>
          auditLog?.append?.({
            action: 'communication.draft.send',
            actor: actorOf(req),
            target: { kind: 'comm_draft', id: draftId, tenantId },
            result,
            detail: {
              recipientMasked: maskAddress(to),
              senderMailboxMasked: maskAddress(senderMailbox),
              ...detail,
            },
          });

        // 1) Flagga av (default) → hårt block. Inget lämnar systemet.
        if (!graphSendEnabled()) {
          audit('error', { reason: 'send_disabled' });
          return res.status(403).json({
            decision: 'blocked',
            reason: 'send_disabled',
            error: 'Live-utskick är avstängt (ARCANA_GRAPH_SEND_ENABLED=false).',
          });
        }
        // 2) Ingen adapter wire:ad → skicka inget ens med flaggan på (503).
        if (!graphSendAdapter || typeof graphSendAdapter.sendMail !== 'function') {
          audit('error', { reason: 'no_adapter' });
          return res.status(503).json({
            decision: 'blocked',
            reason: 'no_adapter',
            error: 'Ingen send-adapter är konfigurerad.',
          });
        }
        // 3) Utkastet måste vara godkänt.
        if (draft.status !== 'approved') {
          audit('error', { reason: 'not_approved', status: draft.status });
          return res
            .status(409)
            .json({ error: 'send kräver approved utkast.', status: draft.status });
        }
        // 4) Mottagaradress giltig + aktivt allowlistad (2a).
        if (!isPlausibleEmail(to)) {
          audit('error', { reason: 'invalid_recipient' });
          return res.status(400).json({ error: 'giltig mottagaradress (to) krävs.' });
        }
        const allowlist = await ensureAllowlistStore();
        if (!allowlist.isAllowed(tenantId, to)) {
          audit('error', { reason: 'recipient_not_allowlisted' });
          return res.status(403).json({
            decision: 'blocked',
            reason: 'recipient_not_allowlisted',
            error: 'Mottagaren är inte på allowlisten för utgående mail.',
          });
        }
        // 5) Avsändar-brevlåda giltig + på sender-allowlisten (samma helper som 2c).
        if (!isPlausibleEmail(senderMailbox)) {
          audit('error', { reason: 'invalid_sender_mailbox' });
          return res.status(400).json({ error: 'giltig senderMailbox krävs.' });
        }
        if (!senderMailboxAllowed(senderMailbox)) {
          audit('error', { reason: 'sender_mailbox_not_allowlisted' });
          return res.status(403).json({
            decision: 'blocked',
            reason: 'sender_mailbox_not_allowlisted',
            error: 'Avsändar-brevlådan är inte allowlistad för send.',
          });
        }
        // 6) Bilagor: om utkastet har bilagor men adaptern inte stödjer dem,
        // blockera FÖRE queue/send (422) så utkastet aldrig går ut ofullständigt
        // och inte heller felaktigt markeras failed. (B1: text-only live-send.)
        if (
          (draft.attachments || []).length > 0 &&
          graphSendAdapter.supportsAttachments === false
        ) {
          audit('error', { reason: 'attachments_not_supported' });
          return res.status(422).json({
            decision: 'blocked',
            reason: 'attachments_not_supported',
            error: 'Live-utskick stödjer ännu inte bilagor. Utkastet lämnas orört (approved).',
          });
        }

        // Alla grindar passerade → queue:a och skicka via adaptern.
        // Rik HTML-signatur (inbäddad logga) för det faktiska mailet: följer
        // Svarstudions valda signatur när den sparats. Äldre utkast faller
        // tillbaka till textsignaturen och sist avsändar-brevlådan.
        const bodyHtml = composeHtmlBody(draft.body || '', draft.signatureId || senderMailbox);
        const payload = {
          from: senderMailbox,
          to,
          subject: draft.subject || '',
          body: draft.body || '',
          ...(bodyHtml ? { bodyHtml } : {}),
          attachments: (draft.attachments || []).map((a) => ({
            name: a.name,
            contentType: a.contentType,
            size: a.size,
            storagePath: a.storagePath,
          })),
        };

        const queuedDraft = await store.transitionStatus(draftId, 'queued', {
          actor: actorOf(req),
          tenantId,
        });

        let result;
        try {
          result = await graphSendAdapter.sendMail(payload);
        } catch (sendError) {
          // Leverantören hann inte bekräfta send → markera failed (best-effort).
          try {
            await store.transitionStatus(draftId, 'failed', {
              actor: actorOf(req),
              tenantId,
              reason: 'send_failed',
            });
          } catch (_e) {
            /* status-övergången är sekundär — huvudfelet rapporteras nedan */
          }
          audit('error', {
            reason: 'send_failed',
            message: String(sendError?.message || sendError).slice(0, 200),
          });
          return res.status(502).json({
            decision: 'failed',
            sent: false,
            error: 'Utskicket misslyckades hos leverantören.',
          });
        }

        const providerMessageId = result?.messageId || result?.id || null;
        try {
          const sentDraft = await store.transitionStatus(draftId, 'sent', {
            actor: actorOf(req),
            tenantId,
          });
          audit('ok', { sent: true, providerMessageId });
          return res.json({ decision: 'sent', sent: true, draft: sentDraft, providerMessageId });
        } catch (persistError) {
          // Adaptern har redan bekräftat utskick. Markera aldrig failed här,
          // annars kan nästa försök dubbelskicka ett mail som faktiskt gick iväg.
          const latestDraft = store.getDraft(draftId, { tenantId }) || queuedDraft;
          audit('error', {
            reason: 'sent_persist_failed',
            sent: true,
            providerMessageId,
            message: String(persistError?.message || persistError).slice(0, 200),
          });
          return res.status(202).json({
            decision: 'sent_persist_failed',
            sent: true,
            draft: latestDraft,
            providerMessageId,
            warning: 'Utskicket skickades, men sent-status kunde inte sparas.',
          });
        }
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  // ── Mottagar-allowlist (2a-storen) — hantering ──────────────────────────────
  // Godkända mottagar-adresser (patientens to:) som live-send (2d) får skicka
  // till. Läsning = mail.read; mutation = mail.live_send (owner) — samma ägar-
  // beslut som själva utskicket, eftersom detta är "vem får vi mejla?".
  // Svaren innehåller endast MASKERADE adresser (storen exponerar aldrig rått).

  // GET /cco-comm/recipient-allowlist?includeInactive=1 — lista
  router.get(
    '/cco-comm/recipient-allowlist',
    requireAuth,
    attachRole,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        const allowlist = await ensureAllowlistStore();
        const tenantId = text(req.auth?.tenantId) || 'hairtpclinic';
        const includeInactive = ['1', 'true', 'yes'].includes(
          String(req.query?.includeInactive || '').toLowerCase()
        );
        const recipients = allowlist.listRecipients(tenantId, { includeInactive });
        return res.json({ recipients });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  // POST /cco-comm/recipient-allowlist — lägg till/återaktivera (owner)
  router.post(
    '/cco-comm/recipient-allowlist',
    requireAuth,
    attachRole,
    requirePermission('mail.live_send'),
    jsonParser,
    async (req, res) => {
      try {
        const allowlist = await ensureAllowlistStore();
        const tenantId = text(req.auth?.tenantId) || 'hairtpclinic';
        const address = text(req.body?.address);
        const note = text(req.body?.note);
        const recipient = await allowlist.addRecipient(tenantId, address, {
          actor: actorOf(req),
          note,
        });
        return res.status(201).json({ recipient });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  // DELETE /cco-comm/recipient-allowlist/:address — ta bort (soft, owner)
  router.delete(
    '/cco-comm/recipient-allowlist/:address',
    requireAuth,
    attachRole,
    requirePermission('mail.live_send'),
    async (req, res) => {
      try {
        const allowlist = await ensureAllowlistStore();
        const tenantId = text(req.auth?.tenantId) || 'hairtpclinic';
        const address = text(req.params.address || '');
        const recipient = await allowlist.removeRecipient(tenantId, address, {
          actor: actorOf(req),
        });
        return res.json({ removed: !!recipient, recipient: recipient || null });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoCommDraftRouter };
