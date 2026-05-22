function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function normalizeMailbox(value) {
  return normalizeText(value).toLowerCase();
}

function toRecipientList(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeMailbox(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildCanonicalMailComposeDocument(
  rawInput = {},
  {
    signatureProfile = null,
    renderedBodyText = '',
    renderedBodyHtml = '',
    defaultSenderMailboxId = '',
  } = {}
) {
  const input = safeObject(rawInput);
  const requestedMode = normalizeText(
    input.mode || input.sendMode || input.send_mode
  ).toLowerCase();
  const sourceMailboxId = normalizeMailbox(
    input.sourceMailboxId || input.source_mailbox_id || input.mailboxId || input.mailbox_id
  );
  const senderMailboxId = normalizeMailbox(
    input.senderMailboxId ||
      input.sender_mailbox_id ||
      signatureProfile?.senderMailboxId ||
      defaultSenderMailboxId ||
      sourceMailboxId
  );
  const conversationId = normalizeText(input.conversationId || input.conversation_id);
  const replyToMessageId = normalizeText(input.replyToMessageId || input.reply_to_message_id);
  const forwardToMessageId = normalizeText(input.forwardToMessageId || input.forward_to_message_id);
  const mode =
    requestedMode === 'forward' ||
    (requestedMode !== 'compose' && requestedMode !== 'reply' && forwardToMessageId)
      ? 'forward'
      : requestedMode === 'compose' || (!replyToMessageId && !conversationId && !forwardToMessageId)
        ? 'compose'
        : 'reply';
  const recipients = {
    to: toRecipientList(input.to, 20),
    cc: toRecipientList(input.cc, 20),
    bcc: toRecipientList(input.bcc, 20),
  };
  const subject = normalizeText(input.subject);
  const bodyText = normalizeText(renderedBodyText || input.body);
  const bodyHtml = normalizeText(renderedBodyHtml);
  const requiresExplicitRecipients =
    mode === 'compose' ||
    mode === 'forward' ||
    (sourceMailboxId && senderMailboxId && sourceMailboxId !== senderMailboxId);
  const sendStrategy =
    mode === 'forward'
      ? 'forward_draft'
      : mode === 'reply' && !requiresExplicitRecipients
        ? 'reply_draft'
        : 'send_mail';
  const signature = signatureProfile
    ? {
        key: normalizeText(signatureProfile?.key) || 'contact',
        label:
          normalizeText(signatureProfile?.label) ||
          normalizeText(signatureProfile?.fullName) ||
          'Signatur',
        fullName:
          normalizeText(signatureProfile?.fullName) || normalizeText(signatureProfile?.label),
        title: normalizeText(signatureProfile?.title) || '',
        email: normalizeMailbox(signatureProfile?.email || signatureProfile?.senderMailboxId),
        senderMailboxId: normalizeMailbox(signatureProfile?.senderMailboxId || senderMailboxId),
        source: normalizeText(signatureProfile?.source) || 'profile',
      }
    : null;

  const validationErrors = [];
  if (!sourceMailboxId) {
    validationErrors.push({
      field: 'sourceMailboxId',
      code: 'required',
      message: 'mailboxId kravs.',
    });
  }
  if (!senderMailboxId) {
    validationErrors.push({
      field: 'senderMailboxId',
      code: 'required',
      message: 'senderMailboxId kravs.',
    });
  }
  if (mode === 'reply' && !replyToMessageId) {
    validationErrors.push({
      field: 'replyToMessageId',
      code: 'required',
      message: 'replyToMessageId kravs.',
    });
  }
  if (mode === 'reply' && !conversationId) {
    validationErrors.push({
      field: 'conversationId',
      code: 'required',
      message: 'conversationId kravs.',
    });
  }
  if (mode === 'forward' && !forwardToMessageId) {
    validationErrors.push({
      field: 'forwardToMessageId',
      code: 'required',
      message: 'forwardToMessageId kravs.',
    });
  }
  if (!subject) {
    validationErrors.push({
      field: 'subject',
      code: 'required',
      message: 'subject kravs.',
    });
  }
  if (!bodyText) {
    validationErrors.push({
      field: 'body',
      code: 'required',
      message: 'body kravs.',
    });
  }
  if (requiresExplicitRecipients && !recipients.to.length) {
    validationErrors.push({
      field: 'to',
      code: 'required',
      message: 'to[] kravs.',
    });
  }

  return {
    version: 'phase_5',
    kind: 'mail_compose_document',
    mode,
    sourceMailboxId: sourceMailboxId || null,
    senderMailboxId: senderMailboxId || null,
    replyContext:
      mode === 'reply'
        ? {
            conversationId: conversationId || null,
            replyToMessageId: replyToMessageId || null,
          }
        : null,
    forwardContext:
      mode === 'forward'
        ? {
            forwardToMessageId: forwardToMessageId || null,
            conversationId: conversationId || null,
          }
        : null,
    recipients,
    subject: subject || null,
    content: {
      bodyText: bodyText || '',
      bodyHtml: bodyHtml || null,
    },
    signature,
    delivery: {
      requiresExplicitRecipients,
      sendStrategy,
      capabilityName:
        mode === 'forward'
          ? 'CCO.SendForward'
          : mode === 'compose'
            ? 'CCO.SendCompose'
            : 'CCO.SendReply',
      intent:
        mode === 'forward'
          ? 'cco.send.forward'
          : mode === 'compose'
            ? 'cco.send.compose'
            : 'cco.send.reply',
    },
    validation: {
      valid: validationErrors.length === 0,
      errors: validationErrors,
    },
  };
}

module.exports = {
  buildCanonicalMailComposeDocument,
};
