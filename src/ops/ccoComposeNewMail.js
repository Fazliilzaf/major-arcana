'use strict';

/**
 * ccoComposeNewMail — komponera ett NYTT mail till en ny/godtycklig mottagare
 * (inte ett svar i en befintlig tråd). Skapar en enkel kontaktpost för mottagaren
 * och ett utkast som stannar på 'needs_approval' — personal godkänner och skickar
 * i den vanliga kedjan. SKICKAR ALDRIG själv.
 *
 * Kanalval sparas på utkastet (mergeFields.sendChannel = 'graph' | 'resend') så
 * godkänn/skicka-steget vet vilken sändväg som ska användas. Mottagarens e-post
 * bor på kontaktposten (customerId), inte i klartext på utkastet.
 *
 * Ren funktion med injicerade stores — enhetstestbar utan server-wiring.
 */

const SEND_CHANNELS = new Set(['graph', 'resend']);
const DEFAULT_GRAPH_SENDER_MAILBOX_ID = 'kons@hairtpclinic.com';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  const v = text(value).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
}

function normalizeMailbox(value) {
  const v = normalizeEmail(value);
  return v || '';
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Patient-länken (fri kanal-chatt) ligger på /portal-chat/:token. */
function buildPortalUrl(baseUrl, token) {
  const base = text(baseUrl).replace(/\/+$/, '') || 'https://arcana.hairtpclinic.com';
  return `${base}/portal-chat/${encodeURIComponent(token)}`;
}

/**
 * Sätter ihop den slutliga mailtexten i rätt ordning:
 *   användartext → (valfri) portal-inbjudan → (valfri) signatur.
 * Portal-inbjudan driver dialogen till den fria kanalen (kostnadsbesparing).
 */
function buildComposeBody({ userBody, portalUrl, signature } = {}) {
  let out = text(userBody);
  if (text(portalUrl)) {
    out +=
      '\n\nDu kan svara direkt i din trygga portal, utan SMS:\n' +
      text(portalUrl) +
      '\nLänken är personlig, spara den gärna.';
  }
  if (text(signature)) out += '\n\n' + text(signature);
  return out;
}

/**
 * @param {{tenantId?:string, recipientName?:string, recipientEmail:string,
 *          recipientPhone?:string, subject:string, body:string, signature?:string,
 *          includePortalLink?:boolean, baseUrl?:string,
 *          channel?:'graph'|'resend', senderMailboxId?:string, actor?:object}} ref
 * @param {{patientMasterStore:object, draftStore:object}} stores
 * @returns {Promise<{status:'prepared'|'skipped', reason?:string, draftId?:string,
 *          customerId?:string, channel?:string, contactCreated?:boolean}>}
 */
async function composeNewMail(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const recipientEmail = normalizeEmail(ref.recipientEmail);
  const recipientName = text(ref.recipientName);
  const recipientPhone = text(ref.recipientPhone);
  const subject = text(ref.subject);
  const body = text(ref.body);
  const channel = SEND_CHANNELS.has(text(ref.channel)) ? text(ref.channel) : 'graph';
  const signature = text(ref.signature);
  const includePortalLink = ref.includePortalLink === true;
  const senderMailboxId =
    normalizeMailbox(ref.senderMailboxId) || (channel === 'graph' ? DEFAULT_GRAPH_SENDER_MAILBOX_ID : '');
  const { patientMasterStore, draftStore, accessStore } = stores;

  if (!recipientEmail) return { status: 'skipped', reason: 'invalid_email' };
  if (!subject) return { status: 'skipped', reason: 'missing_subject' };
  if (!body) return { status: 'skipped', reason: 'missing_body' };
  if (!patientMasterStore?.upsertPatient || !draftStore?.createDraft) {
    return { status: 'skipped', reason: 'stores_unavailable' };
  }

  const actor = ref.actor || { userId: 'staff:compose' };

  // 1. Enkel kontakt: återanvänd befintlig om e-posten redan finns, annars skapa.
  let contact = null;
  if (typeof patientMasterStore.findPatientByEmail === 'function') {
    contact = await patientMasterStore.findPatientByEmail({ tenantId, email: recipientEmail });
  }
  let contactCreated = false;
  if (!contact) {
    contact = await patientMasterStore.upsertPatient({
      tenantId,
      displayName: recipientName || recipientEmail,
      emails: [recipientEmail],
      ...(recipientPhone ? { primaryPhone: recipientPhone } : {}),
      source: 'compose_new_mail',
    });
    contactCreated = true;
  }
  const customerId = text(contact?.id) || text(contact?.patientId);
  if (!customerId) return { status: 'skipped', reason: 'contact_failed' };

  // 2. Valfri portal-inbjudan: mynta en personlig magisk länk och bädda in den i
  // texten. Driver dialogen till den fria portal-kanalen. Aldrig utskick här.
  let portalUrl = '';
  if (includePortalLink && typeof accessStore?.issueToken === 'function') {
    try {
      const issued = await accessStore.issueToken({ tenantId, customerId });
      if (issued?.token) {
        portalUrl = buildPortalUrl(ref.baseUrl || process.env.PUBLIC_BASE_URL, issued.token);
      }
    } catch {
      portalUrl = '';
    }
  }
  const composedBody = buildComposeBody({ userBody: body, portalUrl, signature });

  // 3. Utkast → needs_approval. Kanalvalet sparas i mergeFields. ALDRIG sent här.
  const draft = await draftStore.createDraft(
    {
      tenantId,
      customerId,
      channel: 'email',
      subject,
      body: composedBody,
      mergeFields: {
        sendChannel: channel,
        recipientName: recipientName || null,
        senderMailboxId: senderMailboxId || null,
      },
      recipientMasked: maskEmail(recipientEmail),
    },
    { actor }
  );
  await draftStore.transitionStatus(draft.draftId, 'needs_approval', {
    actor,
    tenantId,
    reason: 'compose_new_mail',
  });

  return {
    status: 'prepared',
    draftId: draft.draftId,
    customerId,
    channel,
    senderMailboxId: senderMailboxId || null,
    contactCreated,
    portalLinkIncluded: Boolean(portalUrl),
  };
}

module.exports = {
  composeNewMail,
  maskEmail,
  buildComposeBody,
  buildPortalUrl,
  DEFAULT_GRAPH_SENDER_MAILBOX_ID,
};
