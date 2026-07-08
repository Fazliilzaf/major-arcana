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

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  const v = text(value).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/**
 * @param {{tenantId?:string, recipientName?:string, recipientEmail:string,
 *          recipientPhone?:string, subject:string, body:string,
 *          channel?:'graph'|'resend', actor?:object}} ref
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
  const { patientMasterStore, draftStore } = stores;

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

  // 2. Utkast → needs_approval. Kanalvalet sparas i mergeFields. ALDRIG sent här.
  const draft = await draftStore.createDraft(
    {
      tenantId,
      customerId,
      channel: 'email',
      subject,
      body,
      mergeFields: { sendChannel: channel, recipientName: recipientName || null },
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
    contactCreated,
  };
}

module.exports = { composeNewMail, maskEmail };
