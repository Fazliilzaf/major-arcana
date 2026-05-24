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
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[transactionalMailer] graph send failed:', message);
        return { ok: false, mode: 'live', provider: 'graph', error: message || 'graph_send_failed' };
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
