'use strict';

/**
 * ccoSignatureHtml — komponerar HTML-mailkroppen för kontrollerad live-send så
 * att det FAKTISKA mailet får den riktiga, varumärkta v9-signaturen (inbäddad
 * logga + sociala ikoner) i stället för den rena textsignaturen.
 *
 * Rent presentationslager runt utskicket:
 *   - Ändrar INGEN sändlogik, allowlist, RBAC eller audit.
 *   - Om mallen saknas/inte kan läsas returneras null → /send faller tillbaka
 *     på ren text (bodyHtml utelämnas, connectorn formaterar plain-text själv).
 *
 * Signaturvalet följer Svarstudions valda signatur-id när det finns. Äldre
 * utkast utan sparat id kan fortfarande härledas ur textsignaturen, och först
 * därefter används avsändar-brevlådan som fallback.
 */

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_PATH = path.join(__dirname, 'signatures', 'signatureV9Template.html');
const NAME_PLACEHOLDER = '{{SIGNATURE_NAME}}';

// Signatur-id → visningsnamn i den varumärkta signaturen. Klinik/kontakt visar
// kliniknamnet i stället för en persons namn.
const SIGNATURE_NAMES = {
  fazli: 'Fazli Krasniqi',
  egzona: 'Egzona Krasniqi',
  contact: 'Hair TP Clinic',
};

// Textsignaturens divider (speglar SIG_DIVIDER i konversationer-bottom-actions.js).
// Allt från och med dividern är den rena textsignaturen och ersätts av HTML-sig.
const SIG_DIVIDER = '\n\n— — — — —\n';

// Läs mallen en gång och cacha. Läsfel → null (fallback till ren text).
let cachedTemplate;
function readTemplate() {
  if (cachedTemplate !== undefined) return cachedTemplate;
  try {
    cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch (_err) {
    cachedTemplate = null;
  }
  return cachedTemplate;
}

/** Härled signatur-id ur en brevlåde-adress eller ett rått id. */
function resolveSignatureId(mailboxOrId) {
  const value = String(mailboxOrId || '').toLowerCase();
  if (value.includes('fazli')) return 'fazli';
  if (value.includes('egzona')) return 'egzona';
  return 'contact';
}

function isKnownSignatureId(value) {
  return Object.prototype.hasOwnProperty.call(SIGNATURE_NAMES, String(value || '').toLowerCase());
}

/** Härled vald signatur ur den rena textsignaturen i äldre utkast. */
function resolveSignatureIdFromBody(body) {
  const raw = String(body || '');
  const idx = raw.indexOf(SIG_DIVIDER);
  if (idx < 0) return '';
  const signatureText = raw.slice(idx + SIG_DIVIDER.length).toLowerCase();
  if (signatureText.includes('fazli krasniqi')) return 'fazli';
  if (signatureText.includes('egzona krasniqi')) return 'egzona';
  if (signatureText.includes('hair tp clinic')) return 'contact';
  return '';
}

/** HTML-escape för text som stoppas in i mailkroppen. */
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gör om ren meddelandetext till HTML-stycken. Dubbelt radbryt → nytt <p>,
 * enkelt radbryt → <br>. Ren funktion, ingen DOM.
 */
function textToHtmlParagraphs(text) {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const inner = block
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br>');
      return `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#1A1918;">${inner}</p>`;
    })
    .join('');
}

/**
 * Returnerar den varumärkta HTML-signaturen för ett signatur-id/brevlåda med
 * rätt namn insatt, eller null om mallen inte kan läsas.
 */
function getSignatureHtml(signatureIdOrMailbox) {
  const template = readTemplate();
  if (!template) return null;
  const id = resolveSignatureId(signatureIdOrMailbox);
  const name = SIGNATURE_NAMES[id] || SIGNATURE_NAMES.contact;
  return template.split(NAME_PLACEHOLDER).join(escapeHtml(name));
}

/** Strippa den rena textsignaturen (allt från dividern) ur draft.body. */
function stripPlainSignature(body) {
  const value = String(body || '');
  const idx = value.indexOf(SIG_DIVIDER);
  return idx >= 0 ? value.slice(0, idx) : value;
}

/**
 * Komponerar HTML-mailkroppen ur draft.body + avsändar-brevlåda.
 *   - Meddelandetexten (före text-signaturdividern) → HTML-stycken.
 *   - Hade utkastet en textsignatur (divider fanns) → lägg till den varumärkta
 *     HTML-signaturen. Saknades divider läggs ingen signatur till (respekterar
 *     att operatören inte valde någon).
 * Returnerar null om ingen HTML-sig behövs/kan byggas → /send skickar ren text.
 */
function composeHtmlBody(body, senderMailboxOrSignatureId) {
  const raw = String(body || '');
  const hadSignature = raw.indexOf(SIG_DIVIDER) >= 0;
  if (!hadSignature) return null;

  const explicitSignatureId = isKnownSignatureId(senderMailboxOrSignatureId)
    ? String(senderMailboxOrSignatureId || '').toLowerCase()
    : '';
  const signatureId =
    explicitSignatureId ||
    resolveSignatureIdFromBody(raw) ||
    resolveSignatureId(senderMailboxOrSignatureId);
  const signatureHtml = getSignatureHtml(signatureId);
  if (!signatureHtml) return null;

  const messageHtml = textToHtmlParagraphs(stripPlainSignature(raw));
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#1A1918;">${messageHtml}${signatureHtml}</div>`;
}

module.exports = {
  SIGNATURE_NAMES,
  SIG_DIVIDER,
  resolveSignatureId,
  resolveSignatureIdFromBody,
  escapeHtml,
  textToHtmlParagraphs,
  getSignatureHtml,
  stripPlainSignature,
  composeHtmlBody,
};
