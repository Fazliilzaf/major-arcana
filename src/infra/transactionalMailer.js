'use strict';

/**
 * Transactional mail — Resend first, Graph send fallback, mock last.
 *
 * Bokningsbekräftelser och operatörsnotiser ska fungera på prod utan
 * RESEND_API_KEY så länge ARCANA_GRAPH_SEND_ENABLED=true och connector finns.
 */

const { sendEmail: sendViaResend, isConfigured: isResendConfigured } = require('./resendMailer');
const { resolveGraphSendFrom } = require('./resendConfig');
const { shouldSkipLiveMailSend } = require('./mailDeliveryGuard');
const { assertNotDeceased } = require('../ops/ccoDeceasedSendGuard');
const { bedomKundutskick } = require('./kundutskickGate');

const DEFAULT_FROM_MAILBOX = 'contact@hairtpclinic.com';

function parseFromAddress(from) {
  const raw = from || resolveGraphSendFrom() || DEFAULT_FROM_MAILBOX;
  const match = String(raw).match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.filter((addr) => typeof addr === 'string' && addr.includes('@'));
}

function createTransactionalMailer({ graphSendConnector = null } = {}) {
  async function sendEmail(input = {}) {
    const validTo = normalizeRecipients(input.to);
    if (!validTo.length) {
      return { ok: false, mode: 'mock', provider: 'none', error: 'no_recipient' };
    }

    // ORD-147 §3 — sändgränsspärr (fail-closed). Blockera innan Resend/Graph/mock.
    // Nycklar på mottagaren, så personal/drift-adresser aldrig matchar en avliden.
    await assertNotDeceased({ email: validTo[0], customerId: input.customerId });

    /**
     * ORD-184 — kundutskicksspärren, före allt annat.
     *
     * Ligger FÖRST bland spärrarna med flit: inget ska hinna gå iväg medan en
     * senare kontroll fortfarande överväger. Och den ligger HÄR, i mailern, i
     * stället för i de tretton anropsställena — en ny sändväg ska vara
     * blockerad tills någon aktivt märker den, inte tvärtom.
     *
     * Utskick som inte deklarerar `audience: 'staff' | 'ops' | 'internal'`
     * behandlas som kundutskick. Det är avsiktligt strängt.
     */
    const kundgrind = bedomKundutskick(input.audience);
    if (kundgrind.blockerat) {
      console.log('[transactionalMailer] blockerat av kundutskicksspärren:', {
        subject: input.subject,
        audience: input.audience || '(ej angiven)',
        reason: kundgrind.skal,
      });
      return { ok: true, mode: 'blocked', provider: 'none', skipped: kundgrind.skal };
    }

    const skipCheck = shouldSkipLiveMailSend(validTo);
    if (skipCheck.skip) {
      console.log('[transactionalMailer] skip live send — reserved/verify recipient:', {
        to: validTo,
        skipped: skipCheck.reason,
        blocked: skipCheck.recipients,
        subject: input.subject,
      });
      return {
        ok: true,
        mode: 'mock',
        provider: 'none',
        skipped: skipCheck.reason,
      };
    }

    if (isResendConfigured()) {
      const result = await sendViaResend(input);
      return { ...result, provider: 'resend' };
    }

    if (graphSendConnector && typeof graphSendConnector.sendNewMessage === 'function') {
      const mailboxId = parseFromAddress(input.from);
      try {
        const sent = await graphSendConnector.sendNewMessage({
          mailboxId,
          body: input.text || '',
          bodyHtml: input.html || '',
          subject: input.subject || '(no subject)',
          to: validTo,
        });
        return {
          ok: true,
          mode: 'live',
          provider: 'graph',
          messageId: sent?.replyToMessageId || sent?.mailboxId || null,
          sendMode: sent?.sendMode || 'send_mail',
          attachmentsSkipped: Array.isArray(input.attachments) && input.attachments.length > 0,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[transactionalMailer] graph send failed:', message);
        return {
          ok: false,
          mode: 'live',
          provider: 'graph',
          error: message || 'graph_send_failed',
        };
      }
    }

    console.log('[transactionalMailer] mock-mode — skulle ha skickat:', {
      to: validTo,
      subject: input.subject,
    });
    return { ok: true, mode: 'mock', provider: 'none' };
  }

  return { sendEmail };
}

module.exports = {
  createTransactionalMailer,
  parseFromAddress,
};
