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
 *   - LIVE-UTSKICK (→ sent) är hårt blockerat: kräver mail.live_send (endast
 *     owner) OCH är ändå avstängt — ingen auto-send i denna build.
 *
 * Speglar router-mönstret i src/routes/ccoCustomerComm.js.
 */

const express = require('express');
const { attachRole, requirePermission, roleHasPermission } = require('../security/ccoRbac');
const { containsJournalLikeContent } = require('../ops/ccoJournalAiGuard');
const { createExecutionGateway } = require('../gateway/executionGateway');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    const { createCcoCommDraftStore } = require('../ops/ccoCommDraftStore');
    storeRef = await createCcoCommDraftStore({ filePath: storePath(), auditLog });
    if (appLocals && !appLocals.ccoCommDraftStore) appLocals.ccoCommDraftStore = storeRef;
    return storeRef;
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

  return router;
}

module.exports = { createCcoCommDraftRouter };
