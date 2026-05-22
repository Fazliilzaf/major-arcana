/**
 * app/components/parser-resolver.js
 * Fas 6 av Lit-migration — system-mail parser-integration utan DOM-beroende.
 *
 * Replikerar logiken i app/system-mail-display.js's applyToCard men opererar
 * på thread-data istället för DOM-element. Detta är vad threadToCardProps
 * använder för att bygga sender + systemMailLabel.
 *
 * Three-tier sender-resolving:
 *   1. Parser hittar customerName (Cliento: "Bokning · Anna Karlsson")
 *   2. Parser hittar bara systemLabel → använd system-namn (Klarna, Cliento)
 *   3. nameFromEmail-fallback (anna.karlsson@hotmail.com → "Anna Karlsson")
 *
 * Inga MutationObservers. Inga DOM-queries. Pure function:
 *   thread → { sender, systemMailLabel }
 *
 * system-mail-display.js bibehålls oförändrad — den kör fortfarande mot
 * DOM:en för legacy cards som inte byggs av Lit-komponenten. När Fas 7 är
 * klar och Lit används överallt → system-mail-display.js kan raderas helt.
 */

/**
 * Plocka första non-empty värdet från ev. lista av kandidater.
 */
function pickFirst(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}

/**
 * Extrahera senderEmail från thread-objekt — kollar både flata och nestade
 * fält som worklist-API kan producera.
 */
function extractSenderEmail(thread) {
  return pickFirst(
    thread.customerEmail,
    thread.fromEmail,
    thread.senderEmail,
    thread.from?.address,
    thread.from?.emailAddress?.address,
    thread.raw?.from?.address,
    thread.raw?.from?.emailAddress?.address,
    thread.raw?.sender?.emailAddress?.address,
    thread.raw?.latestMessage?.from?.address,
    thread.raw?.latestMessage?.from?.emailAddress?.address,
  );
}

/**
 * Extrahera senderName från thread-objekt.
 */
function extractSenderName(thread) {
  return pickFirst(
    thread.customerName,
    thread.fromName,
    thread.senderName,
    thread.from?.name,
    thread.from?.emailAddress?.name,
    thread.raw?.from?.name,
    thread.raw?.from?.emailAddress?.name,
    thread.raw?.sender?.emailAddress?.name,
    thread.raw?.latestMessage?.from?.name,
  );
}

/**
 * Anropa window.MajorArcanaSystemMailParser med thread-data.
 * Returnerar { customerName, systemLabel } eller null.
 */
function callParser(thread) {
  if (typeof window === 'undefined') return null;
  const parser = window.MajorArcanaSystemMailParser;
  if (!parser || typeof parser.parse !== 'function') return null;

  const senderEmail = extractSenderEmail(thread);
  const senderName = extractSenderName(thread);

  // Bara om sender ser ut som system-mejl — annars riskerar vi att skriva
  // över riktiga kundnamn med en false positive
  if (typeof parser.isSystemSender === 'function') {
    if (!parser.isSystemSender(senderEmail, senderName)) return null;
  }

  return parser.parse({
    senderEmail,
    senderName,
    subject: pickFirst(thread.displaySubject, thread.subject, thread.title),
    body: pickFirst(thread.preview, thread.systemPreview, thread.detail),
  });
}

/**
 * Sista chansen att hitta kundnamn: extrahera ur email-localpart.
 * Använder parserns nameFromEmail-helper om tillgänglig.
 *   anna.karlsson@hotmail.com → "Anna Karlsson"
 *   akarlsson@hotmail.com → null (för kryptiskt)
 */
function fallbackNameFromEmail(thread) {
  if (typeof window === 'undefined') return null;
  const parser = window.MajorArcanaSystemMailParser;
  if (!parser?.bodyHelpers?.nameFromEmail) return null;

  const email = extractSenderEmail(thread);
  if (!email) return null;

  return parser.bodyHelpers.nameFromEmail(email);
}

/**
 * HUVUD-EXPORT
 * Resolva sender + systemMailLabel via tre-tier prio:
 *
 *   1. Parser hittar customerName (best case)
 *   2. Parser hittar bara systemLabel → använd system-namn (utan "via " prefix)
 *   3. nameFromEmail-fallback (om email ser strukturerat ut)
 *   4. Returnera null → caller använder original sender
 *
 * Returnerar:
 *   { sender, systemMailLabel } eller null
 */
export function resolveSystemMail(thread) {
  if (!thread || typeof thread !== 'object') return null;

  const parsed = callParser(thread);

  // Tier 1+2: parser hittade något
  if (parsed) {
    let sender = parsed.customerName;

    // Tier 2: bara systemLabel → använd system-namn som sender
    // (Bug B-fix från system-mail-display.js)
    if (!sender && parsed.systemLabel) {
      sender = String(parsed.systemLabel).replace(/^via\s+/i, '');
    }

    return {
      sender: sender || null,
      systemMailLabel: parsed.systemLabel || null,
    };
  }

  // Tier 3: nameFromEmail fallback — funkar även för icke-system-mejl
  // där en kund har skickat från typ "anna.karlsson@gmail.com"
  const emailDerivedName = fallbackNameFromEmail(thread);
  if (emailDerivedName) {
    return {
      sender: emailDerivedName,
      systemMailLabel: null,
    };
  }

  return null;
}

// Exponera för debug + direct integration
if (typeof window !== 'undefined') {
  window.__resolveSystemMail = resolveSystemMail;
}
