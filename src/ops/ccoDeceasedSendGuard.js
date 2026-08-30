'use strict';

/**
 * ccoDeceasedSendGuard — ORD-147 §3, sändgränsen för AVLIDEN.
 *
 * En enda spärr, nycklad på MOTTAGAREN (e-post/telefon/id), inte på vägen.
 * Alla sändvägar som når en patient ska kalla `assertNotDeceased` innan de
 * skickar — oavsett om de går via transactionalMailer, sendSms, graphSendAdapter
 * eller anropar graphSendConnector direkt.
 *
 * FAIL-CLOSED: går mottagaruppslaget inte att göra (databasfel, timeout,
 * kastande resolver) blockeras utskicket och larmet loggas HÖGT. Vi släpper
 * aldrig igenom på ett misslyckat uppslag — det är medvetet obekvämt.
 *
 * Resolvern sätts en gång vid boot (server.js) mot patient-masterns
 * `findDeceasedByEmailOrId`. Så länge den inte är inkopplad (isolatorade tester,
 * före boot) varnar vi och släpper igenom — i prod är den alltid inkopplad
 * innan någon sändväg kan köra.
 */

let resolveDeceasedFn = null;
let guardLogger = console;

function setDeceasedResolver(fn, logger = console) {
  if (typeof fn !== 'function') {
    throw new Error('setDeceasedResolver kräver en funktion ({email, phone, customerId}) => boolean|Promise<boolean>.');
  }
  resolveDeceasedFn = fn;
  guardLogger = logger || console;
}

function isDeceasedGuardArmed() {
  return typeof resolveDeceasedFn === 'function';
}

/**
 * Är CCO_SEND_LIVE på? Speglar isDryRunDefault i ccoSendActionStore — men här
 * som en fristående avläsning så startkontrollen inte beror på den storen.
 */
function isSendLiveEnabled() {
  const optIn = String(process.env.CCO_SEND_LIVE || '').trim().toLowerCase();
  return optIn === '1' || optIn === 'true' || optIn === 'yes';
}

/**
 * Startkontroll — ORD-147, fail-open-grunden stängd vid uppstart, inte vid
 * första utskicket. Samma mönster som ENCRYPTION_KEY i CMO.
 *
 *   CCO_SEND_LIVE av  + ej armerad  →  varning, startar (tester/utveckling).
 *   CCO_SEND_LIVE på  + ej armerad  →  KASTAR — processen startar inte.
 *
 * I prod är CCO_SEND_LIVE av, så fail-open kan aldrig bita den dagen grinden
 * öppnas: då krävs en armerad spärr, annars vägrar booten.
 */
function assertDeceasedGuardReadyForLive() {
  if (isSendLiveEnabled() && !isDeceasedGuardArmed()) {
    throw new Error(
      'CCO_SEND_LIVE är på men ccoDeceasedSendGuard är inte armerad — vägrar starta. ' +
        'Utan avlidenspärr kan ett mejl/SMS gå till en avliden patient.'
    );
  }
  if (!isDeceasedGuardArmed()) {
    guardLogger?.warn?.(
      '[cco-deceased-guard] ej inkopplad, men CCO_SEND_LIVE är av — ingen spärr krävs ännu.'
    );
  }
}

/**
 * @param {{email?:string, phone?:string, customerId?:string}} recipient
 * @throws {Error} code `SEND_BLOCKED` (avliden) eller `SEND_GUARD_FAILED_CLOSED` (uppslag misslyckades).
 */
async function assertNotDeceased({ email = '', phone = '', customerId = '' } = {}) {
  if (!isDeceasedGuardArmed()) {
    guardLogger?.warn?.(
      '[cco-deceased-guard] ej inkopplad — ingen avlidenspärr aktiv. Sätt setDeceasedResolver vid boot.'
    );
    return;
  }

  let deceased = false;
  try {
    deceased = Boolean(await resolveDeceasedFn({ email, phone, customerId }));
  } catch (err) {
    guardLogger?.error?.(
      '[cco-deceased-guard] mottagaruppslag misslyckades — blockerar (fail-closed):',
      err?.message || err
    );
    const e = new Error('Kunde inte verifiera mottagarens vårdrelation — utskick blockerat (fail-closed).');
    e.code = 'SEND_GUARD_FAILED_CLOSED';
    throw e;
  }

  if (deceased) {
    const e = new Error('Mottagaren är registrerad som avliden — utskick blockerat.');
    e.code = 'SEND_BLOCKED';
    e.blockReason = 'deceased';
    throw e;
  }
}

module.exports = {
  setDeceasedResolver,
  isDeceasedGuardArmed,
  assertDeceasedGuardReadyForLive,
  isSendLiveEnabled,
  assertNotDeceased,
};
