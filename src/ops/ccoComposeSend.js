'use strict';

/**
 * ccoComposeSend — levererar ett GODKÄNT kompose-utkast via vald kanal (Graph /
 * Resend). Owner-only i routern. Grindas av en EGEN flagga CCO_COMPOSE_SEND_LIVE
 * så kompose-utskick kan slås på isolerat (samma mönster som CCO_PORTAL_NOTIFY_LIVE)
 * utan att röra CCO_SEND_LIVE eller Graph-grinden.
 *
 * Disciplin:
 *   - Grind AV → dry-run: skickar inget och LÄMNAR utkastet orört (kan skickas
 *     senare). Ingen status-förändring.
 *   - Grind PÅ → går den kontrollerade kedjan needs_approval → approved → queued
 *     → sent, och skickar via vald backend. Vid fel → 'failed' (återhämtningsbar).
 *
 * Ren funktion med injicerade beroenden — enhetstestbar utan nätverk.
 */

const { composeHtmlBody } = require('./ccoSignatureHtml');

const SEND_CHANNELS = new Set(['graph', 'resend']);
const DEFAULT_GRAPH_SENDER_MAILBOX_ID = 'kons@hairtpclinic.com';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  const v = text(value).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
}

function resolveGraphSenderMailboxId(draft = {}) {
  return (
    normalizeEmail(draft.mergeFields?.senderMailboxId) ||
    normalizeEmail(draft.senderMailboxId) ||
    normalizeEmail(draft.mergeFields?.mailboxId) ||
    DEFAULT_GRAPH_SENDER_MAILBOX_ID
  );
}

function isComposeSendLive() {
  const v = String(process.env.CCO_COMPOSE_SEND_LIVE || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

function toHtml(body) {
  const safe = escapeHtml(text(body));
  return '<p>' + safe.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

function firstEmail(patient = {}) {
  const cands = [patient.primaryEmail, patient.email, (patient.emails || [])[0]];
  for (const c of cands) {
    const v = text(c);
    if (v) return v;
  }
  return '';
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

// Gå utkastet framåt till 'queued' (needs_approval → approved → queued). Owner
// får själv-godkänna (allowSelfApprove).
async function walkToQueued(draftStore, draft, tenantId, actor) {
  const order = ['draft', 'needs_approval', 'approved', 'queued'];
  let current = draftStore.getDraft(draft.draftId, { tenantId }) || draft;
  const stepFor = { draft: 'needs_approval', needs_approval: 'approved', approved: 'queued' };
  let guard = 0;
  while (current.status !== 'queued' && order.includes(current.status) && guard++ < 6) {
    const next = stepFor[current.status];
    if (!next) break;
    await draftStore.transitionStatus(draft.draftId, next, {
      actor,
      tenantId,
      allowSelfApprove: true,
      reason: 'compose_send',
    });
    current = draftStore.getDraft(draft.draftId, { tenantId });
  }
  return current;
}

/**
 * @param {{draftId:string, tenantId?:string, actor?:object, forceLive?:boolean, from?:string}} ref
 * @param {{draftStore:object, patientMasterStore?:object, graphSendAdapter?:object,
 *          sendStore?:object}} stores
 * @returns {Promise<{status:'sent'|'skipped'|'failed', reason?:string, channel?:string,
 *          dryRun?:boolean, messageId?:string, to?:string}>}
 */
async function deliverComposeDraft(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const draftId = text(ref.draftId);
  const {
    draftStore,
    patientMasterStore = null,
    graphSendAdapter = null,
    sendStore = null,
  } = stores;
  const actor = ref.actor || { userId: 'owner:compose-send' };

  if (!draftId) return { status: 'skipped', reason: 'missing_draft_id' };
  if (!draftStore?.getDraft || !draftStore?.transitionStatus) {
    return { status: 'skipped', reason: 'stores_unavailable' };
  }
  const draft = draftStore.getDraft(draftId, { tenantId });
  if (!draft) return { status: 'skipped', reason: 'draft_not_found' };
  if (draft.status === 'sent') return { status: 'skipped', reason: 'already_sent' };

  const channel = SEND_CHANNELS.has(text(draft.mergeFields?.sendChannel))
    ? text(draft.mergeFields.sendChannel)
    : 'graph';

  // Mottagarens e-post bor på kontaktposten (customerId).
  let to = '';
  if (patientMasterStore?.getPatient) {
    const patient = await patientMasterStore.getPatient({ tenantId, patientId: draft.customerId });
    to = firstEmail(patient || {});
  }
  if (!to) return { status: 'skipped', reason: 'no_recipient', channel };

  // Grind AV → dry-run: rör inte utkastet.
  const live = typeof ref.forceLive === 'boolean' ? ref.forceLive : isComposeSendLive();
  if (!live) return { status: 'skipped', reason: 'compose_gate_off', dryRun: true, channel };

  // Kanal-tillgänglighet innan vi konsumerar utkastet.
  if (channel === 'graph' && typeof graphSendAdapter?.sendMail !== 'function') {
    return { status: 'skipped', reason: 'graph_disabled', channel };
  }
  if (channel === 'resend' && typeof sendStore?.performSend !== 'function') {
    return { status: 'skipped', reason: 'resend_unavailable', channel };
  }
  const senderMailboxId = channel === 'graph' ? resolveGraphSenderMailboxId(draft) : '';
  if (channel === 'graph' && !senderMailboxId) {
    return { status: 'skipped', reason: 'missing_sender_mailbox', channel };
  }

  await walkToQueued(draftStore, draft, tenantId, actor);

  // Varumärkt HTML-signatur (inbäddad logga) för det faktiska mailet — samma
  // system som Svarstudion. Har utkastet en textsignatur (SIG_DIVIDER) byts den
  // mot v9-signaturen; annars null → fall tillbaka på ren toHtml.
  const bodyHtml =
    composeHtmlBody(draft.body, draft.signatureId || senderMailboxId || '') || toHtml(draft.body);

  let ok = false;
  let messageId = null;
  let error = null;
  try {
    if (channel === 'resend') {
      const r = await sendStore.performSend({
        kind: 'notification',
        payload: {
          to,
          subject: draft.subject || '(utan ämne)',
          html: bodyHtml,
          text: text(draft.body),
          meta: { customerId: draft.customerId, reason: 'compose_new_mail' },
        },
        customerId: draft.customerId,
        userId: text(actor.userId) || 'owner',
        dryRunOverride: false,
      });
      ok = r?.ok !== false;
      messageId = r?.messageId || null;
    } else {
      const r = await graphSendAdapter.sendMail({
        from: senderMailboxId,
        to,
        subject: draft.subject || '(utan ämne)',
        body: text(draft.body),
        bodyHtml,
      });
      ok = r?.ok !== false;
      messageId = r?.messageId || null;
    }
  } catch (err) {
    ok = false;
    error = err?.message || 'send_failed';
  }

  if (!ok) {
    await draftStore
      .transitionStatus(draftId, 'failed', { actor, tenantId, reason: 'compose_send_failed' })
      .catch(() => {});
    return { status: 'failed', reason: error || 'send_failed', channel };
  }
  await draftStore.transitionStatus(draftId, 'sent', { actor, tenantId, reason: 'compose_sent' });
  return { status: 'sent', channel, messageId, to: maskEmail(to) };
}

module.exports = {
  deliverComposeDraft,
  isComposeSendLive,
  resolveGraphSenderMailboxId,
  DEFAULT_GRAPH_SENDER_MAILBOX_ID,
};
