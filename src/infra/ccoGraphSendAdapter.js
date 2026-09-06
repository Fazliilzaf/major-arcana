'use strict';

const { assertNotDeceased } = require('../ops/ccoDeceasedSendGuard');

/**
 * ccoGraphSendAdapter — tunn shim som exponerar draft-routerns förväntade
 * `sendMail({ from, to, subject, body, attachments })`-form ovanpå den delade
 * microsoftGraphSendConnector (steg 2d-wiring, "B1").
 *
 * Avgränsning:
 *   - Connectorns `sendNewMessage` stödjer INTE bilagor (Graph POST /sendMail
 *     skickar bara to/subject/body). Därför avvisar denna shim utkast med
 *     bilagor (`supportsAttachments = false` + kastar om den ändå anropas), så
 *     ett ofullständigt mail aldrig kan lämna systemet. Bilage-stöd är en egen
 *     följd-uppgift (B2) som rör den delade connectorn.
 *   - Nya utskick ger inget message-id från Graph (202 utan body), så
 *     providerMessageId blir null.
 *   - Wire:as bara in när connectorn finns (flagga + Graph-creds i server.js);
 *     annars förblir graphSendAdapter null → routern svarar 503 no_adapter.
 *
 * P0-003 — sendReply. Konversationsvyns svar (POST /cco/runtime/conversation/
 * :key/reply) gick tidigare direkt på graphSendConnector.sendReply och passerade
 * DÄRMED förbi avlidenspärren och avsändar-allowlisten. Adaptern är nu den ENDA
 * auktoritativa sändvägen för konversationssvar: samma grindar som sendMail
 * (avliden + kundutskicksspärr) PLUS avsändar-allowlisten, och trådningen
 * bevaras via connectorns sendReply.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Samma allowlist-läsning som ccoCommDraft.senderMailboxAllowed: en källa,
 * samma regler. FAIL-CLOSED — tom allowlist = ingen avsändare godkänd (utom
 * uttrycklig '*').
 */
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
  if (!mailbox) return false;
  const allowlist = parseSendMailboxAllowlist(process.env.ARCANA_GRAPH_SEND_ALLOWLIST);
  return allowlist.has('*') || allowlist.has(mailbox);
}

/**
 * @throws {Error} code `SENDER_NOT_ALLOWLISTED` när avsändaren inte är godkänd.
 * Sitter FÖRE connectorn så att ett otillåtet utskick aldrig når Graph.
 */
function assertSenderAllowed(senderMailbox) {
  if (senderMailboxAllowed(senderMailbox)) return;
  const err = new Error(
    `Avsändar-mailboxen är inte allowlistad för Graph-send: ${senderMailbox || '(saknas)'}.`
  );
  err.code = 'SENDER_NOT_ALLOWLISTED';
  err.nonRetryable = true;
  throw err;
}

function createCcoGraphSendAdapter(connector) {
  if (!connector || typeof connector.sendNewMessage !== 'function') {
    throw new Error('createCcoGraphSendAdapter kräver en connector med sendNewMessage.');
  }

  async function sendMail({ from, to, subject, body, bodyHtml, attachments } = {}) {
    // ORD-147 §3 — sändgränsspärr (fail-closed) på mottagaren.
    await assertNotDeceased({ email: to });
    const hasAttachments = Array.isArray(attachments)
      ? attachments.length > 0
      : attachments != null && attachments !== false;
    if (hasAttachments) {
      // Defense-in-depth: routern ska ha blockerat detta före anrop, men om det
      // ändå händer skickar vi hellre inget än ett mail utan sina bilagor.
      const err = new Error('cco_send_attachments_unsupported');
      err.code = 'attachments_not_supported';
      throw err;
    }
    const result = await connector.sendNewMessage({
      mailboxId: from,
      sourceMailboxId: from,
      // ORD-221 — CCO:s manuella utkast går till den adress personalen skrivit
      // in, alltså i praktiken en patient. Deklareras som kund och blockeras
      // därför medan ARCANA_KUNDUTSKICK_ENABLED är av.
      audience: 'customer',
      to: to ? [to] : [],
      subject: subject || '',
      body: body || '',
      // Varumärkt HTML-signatur (inbäddad logga) skickas som HTML-mail när den
      // finns; annars formaterar connectorn själv ren text till HTML.
      ...(bodyHtml ? { bodyHtml } : {}),
    });
    return {
      // Graph /sendMail returnerar 202 utan body → inget message-id.
      messageId: null,
      sentAt: result?.sentAt || null,
      provider: result?.provider || 'microsoft_graph',
    };
  }

  /**
   * P0-003 — konversationssvar via den kanoniska sändvägen.
   *
   * Grindar, i ordning och alla FÖRE connectorn (ingen extern side effect vid
   * blockering):
   *   1. assertNotDeceased — avlidenspärr (fail-closed).
   *   2. assertSenderAllowed — avsändar-allowlist (ARCANA_GRAPH_SEND_ALLOWLIST).
   *   3. audience:'customer' → bedomKundutskick inne i connectorn.
   *
   * Resultatet passtrås rakt igenom connectorn (draft-id / sendMode), så
   * routerns befintliga svarform (`sendResult`) bevaras.
   */
  async function sendReply({
    from,
    to,
    replyToMessageId,
    conversationId = '',
    subject = '',
    body = '',
    bodyHtml = '',
  } = {}) {
    // Avlidenspärr — samma som sendMail, nycklad på MOTTAGAREN (patienten).
    await assertNotDeceased({ email: to });
    // Avsändar-allowlist — avsändaren får aldrig väljas av klienten; den
    // kommer från konversationens brevlåda och måste vara godkänd att skicka som.
    assertSenderAllowed(from);
    if (typeof connector.sendReply !== 'function') {
      const err = new Error('ccoGraphSendAdapter: connector saknar sendReply.');
      err.code = 'graph_send_unavailable';
      err.nonRetryable = true;
      throw err;
    }
    return connector.sendReply({
      mailboxId: from,
      sourceMailboxId: from,
      audience: 'customer',
      conversationId: conversationId || '',
      replyToMessageId,
      subject: subject || '',
      body: body || '',
      ...(bodyHtml ? { bodyHtml } : {}),
      to: to ? [to] : [],
    });
  }

  return {
    sendMail,
    sendReply,
    // Kapabilitets-flagga som draft-routern läser för att blockera bilage-utkast
    // med ett tydligt 422 i stället för att markera utkastet failed.
    supportsAttachments: false,
  };
}

module.exports = { createCcoGraphSendAdapter };
