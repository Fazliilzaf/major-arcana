'use strict';

/**
 * CCO Automation Conversation Bridge
 *
 * Kopplar automatiska utskick (bokningsbekräftelser, påminnelser, avbokningar,
 * offerter, behandlingsplaner) direkt till CCO-konversationstrådar genom att
 * skriva ett syntetiskt `sent`-meddelande till ccoMailboxTruthStore omedelbart
 * efter lyckat utskick. Detta gör att automations-mail syns i Konversationer
 * utan att vänta på Graph Sent Items-sync, och även när Resend eller mock-läge
 * används.
 */

const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getCounterpartyEmail(message = {}) {
  const safe = asObject(message);
  const direction = normalizeText(safe.direction || '').toLowerCase();
  const folderType = normalizeText(safe.folderType || '').toLowerCase();
  const isOutbound = direction === 'outbound' || folderType === 'sent' || folderType === 'drafts';

  if (isOutbound) {
    const to = asArray(safe.toRecipients || safe.toEmails)[0];
    return normalizeEmail(asObject(to).address || to);
  }
  return normalizeEmail(safe.fromEmail || asObject(safe.from).address);
}

function findExistingConversationId({ truthStore, mailboxId, counterpartyEmail, subject = '' }) {
  if (!truthStore || typeof truthStore.listMessages !== 'function') return null;
  if (!counterpartyEmail) return null;

  const subjectRoot = normalizeText(subject).split(/[:\-]/)[0].toLowerCase();
  const messages = truthStore.listMessages({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox', 'sent'],
  });

  let best = null;
  let bestAt = '';
  for (const raw of messages) {
    const m = asObject(raw);
    const other = getCounterpartyEmail(m);
    if (other !== counterpartyEmail) continue;

    const mSubjectRoot = normalizeText(m.subject).split(/[:\-]/)[0].toLowerCase();
    const subjectMatch = !subjectRoot || !mSubjectRoot || subjectRoot === mSubjectRoot;
    if (!subjectMatch) continue;

    const at = normalizeText(m.sentAt || m.receivedAt || m.lastModifiedAt || '');
    if (!best || at > bestAt) {
      best = m;
      bestAt = at;
    }
  }
  return best?.mailboxConversationId || null;
}

async function resolvePatientIdByEmail({ patientMasterStore, tenantId, email }) {
  if (!patientMasterStore || !email) return null;
  try {
    if (typeof patientMasterStore.findPatientByEmail === 'function') {
      const result = await patientMasterStore.findPatientByEmail({ tenantId, email });
      if (result?.patientId) return result.patientId;
    }
    if (typeof patientMasterStore.listPatients === 'function') {
      const list = await patientMasterStore.listPatients({ tenantId, limit: 500 });
      const patients = asArray(list?.patients || list);
      const wanted = normalizeEmail(email);
      for (const p of patients) {
        const emails = [
          normalizeEmail(p?.primaryEmail),
          ...asArray(p?.emails).map((e) => normalizeEmail(typeof e === 'string' ? e : e?.address)),
        ].filter(Boolean);
        if (emails.includes(wanted)) {
          return normalizeText(p?.patientId || p?.id) || null;
        }
      }
    }
  } catch (_err) {
    // best-effort
  }
  return null;
}

function createAutomationConversationBridge({
  ccoMailboxTruthStore,
  patientMasterStore = null,
  defaultTenantId = 'hair-tp-clinic',
} = {}) {
  if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.addSyntheticSentMessage !== 'function') {
    return null;
  }

  async function recordAutomationSend({
    mailboxId = '',
    fromEmail = '',
    fromName = '',
    toEmail = '',
    toName = '',
    subject = '',
    bodyHtml = '',
    bodyText = '',
    sentAt = '',
    patientId = '',
    tenantId = '',
    automationType = '',
    sendResult = {},
  } = {}) {
    const safeMailboxId = normalizeEmail(mailboxId);
    const safeToEmail = normalizeEmail(toEmail);
    if (!safeMailboxId || !safeToEmail) {
      return { recorded: false, reason: 'missing_mailbox_or_recipient' };
    }

    const resolvedTenantId = normalizeText(tenantId) || defaultTenantId;
    const resolvedPatientId =
      normalizeText(patientId) ||
      (await resolvePatientIdByEmail({
        patientMasterStore,
        tenantId: resolvedTenantId,
        email: safeToEmail,
      }));

    const existingConversationId = findExistingConversationId({
      truthStore: ccoMailboxTruthStore,
      mailboxId: safeMailboxId,
      counterpartyEmail: safeToEmail,
      subject,
    });

    const safeSentAt = normalizeText(sentAt) || new Date().toISOString();
    const internetMessageId = `<cco-auto-${automationType || 'send'}-${crypto.randomUUID()}@hairtpclinic.com>`;

    const result = await ccoMailboxTruthStore.addSyntheticSentMessage({
      mailboxId: safeMailboxId,
      mailboxAddress: safeMailboxId,
      fromEmail: fromEmail || safeMailboxId,
      fromName,
      toEmail: safeToEmail,
      toName,
      subject,
      bodyHtml,
      bodyText,
      sentAt: safeSentAt,
      mailboxConversationId: existingConversationId || '',
      internetMessageId,
      patientId: resolvedPatientId,
      automationType,
    });

    return {
      recorded: true,
      graphMessageId: result.graphMessageId,
      mailboxConversationId: result.mailboxConversationId,
      patientId: resolvedPatientId,
      reusedConversation: Boolean(existingConversationId),
      provider: sendResult?.provider || null,
      mode: sendResult?.mode || null,
    };
  }

  return { recordAutomationSend };
}

module.exports = { createAutomationConversationBridge };
