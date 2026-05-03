'use strict';

/**
 * CCO Conversation messages — full tråd-historik för en given conversation key.
 *
 * Endpoint: GET /api/v1/cco/runtime/conversation/:key/messages
 *
 * Frontend (/cco/) anropar detta när en tråd väljs i listan. Worklist-consumer
 * returnerar bara metadata + senaste preview — denna endpoint ger alla
 * messages med body, from, time och dir så att tråd-vyn visar hela historiken.
 *
 * Datakälla: ccoMailboxTruthStore.listMessages() filtrerat på
 * mailboxConversationId (samma key som returneras som row.id i consumer-modellen).
 *
 * Designprinciper:
 *   • Read-only — påverkar inget state.
 *   • Sorterad äldst-först (kronologisk läsordning).
 *   • Returnerar minimal shape som /cco/ förväntar: { from, dir, time, body, initials }.
 *   • Inga personliga uppgifter (ID:n) exponeras utöver vad som redan finns i worklist.
 */

const express = require('express');
const { SummarizeThreadCapability } = require('../capabilities/summarizeThread');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deriveDir(folderType) {
  const ft = String(folderType || '').toLowerCase();
  if (ft === 'sent' || ft.includes('sent')) return 'outbound';
  if (ft === 'drafts' || ft.includes('draft')) return 'draft';
  return 'inbound';
}

function deriveFromName(message) {
  const safe = asObject(message);
  const candidates = [
    safe.senderName,
    safe.fromName,
    asObject(asObject(safe.from).emailAddress).name,
    asObject(safe.from).name,
    asObject(asObject(safe.sender).emailAddress).name,
  ];
  for (const c of candidates) {
    const t = normalizeText(c);
    if (t) return t;
  }
  const emailFallback =
    normalizeText(safe.senderEmail) ||
    normalizeText(safe.fromAddress) ||
    normalizeText(asObject(asObject(safe.from).emailAddress).address);
  return emailFallback || '(okänd avsändare)';
}

function deriveTime(message) {
  const safe = asObject(message);
  return (
    normalizeText(safe.sentAt) ||
    normalizeText(safe.receivedAt) ||
    normalizeText(safe.lastModifiedAt) ||
    ''
  );
}

function deriveBody(message) {
  const safe = asObject(message);
  return (
    normalizeText(safe.bodyPreview) ||
    normalizeText(safe.preview) ||
    normalizeText(safe.snippet) ||
    normalizeText(asObject(safe.body).content) ||
    ''
  );
}

function deriveInitials(name) {
  const parts = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]).join('').toUpperCase();
}

function fetchSortedConversationMessages(store, key) {
  if (!store || typeof store.listMessages !== 'function') return [];
  const all = store.listMessages({});
  const matches = all.filter(
    (m) => normalizeText(asObject(m).mailboxConversationId) === key
  );
  return [...matches].sort((a, b) =>
    String(deriveTime(a)).localeCompare(String(deriveTime(b)))
  );
}

// Mappa lagrade meddelanden → SummarizeThread input-shape
function toSummarizeInputMessage(m) {
  const safe = asObject(m);
  const dir = deriveDir(safe.folderType);
  // SummarizeThread förväntar 'direction' = 'inbound' eller 'outbound'
  const direction = dir === 'outbound' ? 'outbound' : 'inbound';
  return {
    direction,
    body: deriveBody(safe),
    bodyPreview: normalizeText(safe.bodyPreview) || '',
    sentAt: deriveTime(safe),
    recordedAt: deriveTime(safe),
    from: deriveFromName(safe),
  };
}

function createCcoConversationRouter({
  ccoMailboxTruthStore,
  requireAuth,
} = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.get(
    '/cco/runtime/conversation/:key/messages',
    authMiddleware,
    (req, res) => {
      try {
        if (
          !ccoMailboxTruthStore ||
          typeof ccoMailboxTruthStore.listMessages !== 'function'
        ) {
          return res
            .status(503)
            .json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_conversation_key' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        const messages = sorted.map((m) => {
          const safe = asObject(m);
          const from = deriveFromName(safe);
          return {
            id: normalizeText(safe.graphMessageId) || normalizeText(safe.messageId) || null,
            from,
            initials: deriveInitials(from),
            dir: deriveDir(safe.folderType),
            time: deriveTime(safe),
            body: deriveBody(safe),
            subject: normalizeText(safe.subject) || null,
            mailboxId: normalizeText(safe.mailboxId) || null,
            folderType: normalizeText(safe.folderType) || null,
          };
        });
        return res.json({
          ok: true,
          conversationKey: key,
          messageCount: messages.length,
          messages,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- AI-summary + nextBestAction -----
  // GET /cco/runtime/conversation/:key/summary
  // Kör SummarizeThread-capabilityn på trådens meddelanden och returnerar
  // headline + bullets + nextBestAction + sentiment + intent. Frontend kan
  // använda detta för att fylla AI-summary-blocket samt risk/nästa-steg.
  router.get(
    '/cco/runtime/conversation/:key/summary',
    authMiddleware,
    async (req, res) => {
      try {
        if (
          !ccoMailboxTruthStore ||
          typeof ccoMailboxTruthStore.listMessages !== 'function'
        ) {
          return res
            .status(503)
            .json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_conversation_key' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.json({
            ok: true,
            conversationKey: key,
            summary: null,
            note: 'no_messages',
          });
        }
        // Härled customerName + subject från första inkommande meddelandet
        const firstInbound =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';

        const inputMessages = sorted.map(toSummarizeInputMessage);

        const capability = new SummarizeThreadCapability();
        const result = await capability.execute({
          channel: 'admin',
          tenantId: normalizeText(req.tenantId) || 'cco',
          input: {
            conversationId: key,
            customerName,
            subject,
            messages: inputMessages,
          },
        });
        const data = asObject(result?.data);
        const nba = asObject(data.nextBestAction);
        const primary = asObject(nba.primaryAction);
        // Bygg en kort risk-text baserat på sentiment + intent + anomalies
        const sentimentLabel = normalizeText(asObject(data.sentiment).label);
        const intentLabel = normalizeText(asObject(data.intent).label);
        const anomalies = Array.isArray(data.anomalies) ? data.anomalies : [];
        const riskParts = [];
        if (sentimentLabel && sentimentLabel.toLowerCase() !== 'neutral') {
          riskParts.push(`Stämning: ${sentimentLabel}`);
        }
        if (intentLabel && intentLabel.toLowerCase() !== 'oklart') {
          riskParts.push(`Avsikt: ${intentLabel}`);
        }
        if (anomalies.length > 0) {
          riskParts.push(`${anomalies.length} avvikelse${anomalies.length === 1 ? '' : 'r'} upptäckta`);
        }
        const risk = riskParts.length > 0 ? riskParts.join(' · ') : '';
        // nextStep = primaryButton + ev. första-reasoning som förklaring
        const nextStepLabel = normalizeText(primary.primaryButton) || normalizeText(primary.label);
        const reasoning = Array.isArray(primary.reasoning) ? primary.reasoning : [];
        const nextStep = nextStepLabel
          ? reasoning.length > 0
            ? `${nextStepLabel} — ${reasoning[0]}`
            : nextStepLabel
          : '';
        return res.json({
          ok: true,
          conversationKey: key,
          summary: {
            headline: normalizeText(data.headline),
            bullets: Array.isArray(data.bullets) ? data.bullets.filter(Boolean) : [],
            risk,
            nextStep,
            sentiment: data.sentiment || null,
            intent: data.intent || null,
            primaryAction: primary || null,
            secondaryActions: Array.isArray(nba.secondaryActions) ? nba.secondaryActions : [],
            source: normalizeText(data.source) || 'heuristic',
            generatedAt: normalizeText(data.generatedAt),
          },
          warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  return router;
}

module.exports = { createCcoConversationRouter };
