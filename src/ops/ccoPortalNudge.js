'use strict';

/**
 * ccoPortalNudge — förbereder en portal-länk-nudge för en kund som ännu inte är
 * på den fria portal-kanalen. Poängen (kostnad): flytta löpande dialog från
 * SMS/mail till den gratis portalen.
 *
 * VIKTIGT — kontrollerad sändkedja bevaras:
 *   - Servicen SKICKAR ALDRIG något själv. Den myntar en magisk länk och skapar
 *     ett utkast som stannar på 'needs_approval'. Personal godkänner och skickar
 *     i den vanliga kedjan (aldrig auto-live-send, aldrig Graph härifrån).
 *   - Idempotent: en kund nudgas bara en gång (nudgeStore), och aldrig om hen
 *     redan är aktiv i portalen (har portal-meddelanden).
 *
 * Ren funktion med injicerade stores — enkel att enhetstesta utan server-wiring.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildPortalUrl(baseUrl, token) {
  const base = text(baseUrl).replace(/\/+$/, '') || 'https://arcana.hairtpclinic.com';
  return `${base}/portal-chat/${encodeURIComponent(token)}`;
}

/**
 * Utkastets text. Medveten stil (samma disciplin som Svarstudion):
 *   - Svenska, inga em/en-streck, ingen egen avslutshälsning (den bor i signaturen).
 */
function buildNudgeBody({ customerName, url } = {}) {
  const hi = text(customerName) ? `Hej ${text(customerName)},` : 'Hej,';
  return (
    `${hi}\n\n` +
    'Du kan skriva till oss direkt i din trygga portal, helt utan SMS. ' +
    'Där ser du våra svar och kan ställa frågor när det passar dig.\n\n' +
    `Öppna din portal här: ${url}\n\n` +
    'Länken är personlig, spara den gärna.'
  );
}

/**
 * @param {{tenantId?:string, customerId:string, customerName?:string, baseUrl?:string,
 *          subject?:string, channel?:string, actor?:object}} ref
 * @param {{accessStore:object, draftStore:object, nudgeStore:object, messageStore?:object}} stores
 * @returns {Promise<{status:'prepared'|'skipped', reason?:string, draftId?:string, url?:string}>}
 */
async function preparePortalNudge(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const customerId = text(ref.customerId);
  const { accessStore, draftStore, nudgeStore, messageStore = null } = stores;

  if (!customerId) return { status: 'skipped', reason: 'missing_customer_id' };
  if (!accessStore?.issueToken) return { status: 'skipped', reason: 'no_access_store' };
  if (!draftStore?.createDraft || !draftStore?.transitionStatus) {
    return { status: 'skipped', reason: 'no_draft_store' };
  }
  if (!nudgeStore?.wasNudged || !nudgeStore?.recordNudge) {
    return { status: 'skipped', reason: 'no_nudge_store' };
  }

  // Idempotens: aldrig nudga två gånger.
  if (nudgeStore.wasNudged({ tenantId, customerId })) {
    return { status: 'skipped', reason: 'already_nudged' };
  }
  // Redan aktiv i portalen? Då behövs ingen nudge.
  if (messageStore?.listMessagesForCustomer) {
    const existing = messageStore.listMessagesForCustomer({ tenantId, customerId });
    if (Array.isArray(existing) && existing.length > 0) {
      return { status: 'skipped', reason: 'already_active' };
    }
  }

  const issued = await accessStore.issueToken({ tenantId, customerId });
  const url = buildPortalUrl(ref.baseUrl || process.env.PUBLIC_BASE_URL, issued.token);
  const actor = ref.actor || { userId: 'automation:portal-nudge' };

  const draft = await draftStore.createDraft(
    {
      tenantId,
      customerId,
      channel: text(ref.channel) || 'email',
      subject: text(ref.subject) || 'Din trygga portal hos Hair TP Clinic',
      body: buildNudgeBody({ customerName: ref.customerName, url }),
    },
    { actor }
  );

  // Upp till needs_approval — personal godkänner. ALDRIG approved/sent härifrån.
  await draftStore.transitionStatus(draft.draftId, 'needs_approval', {
    actor,
    tenantId,
    reason: 'portal_nudge_prepared',
  });

  await nudgeStore.recordNudge({
    tenantId,
    customerId,
    draftId: draft.draftId,
    token: issued.token,
  });

  return { status: 'prepared', draftId: draft.draftId, url };
}

module.exports = { preparePortalNudge, buildNudgeBody, buildPortalUrl };
