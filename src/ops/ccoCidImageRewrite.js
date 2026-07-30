'use strict';

/**
 * ORD-93 — EN implementation av "lös upp cid:, aldrig tyst", inte tre.
 *
 * #1272 och #1275 fixade samma bugg i två separata kopior:
 * `rewriteMailCidImageSources` (ccoConversation.js, läsvägen för
 * `/messages`) och `resolveCidInHtml` (ccoMailDocument.js, läsvägen för
 * `/history`). Båda hade identisk logik och identiska tysta bails — en tom
 * cid-karta returnerade html oförändrad, ett okänt cid behöll den trasiga
 * `src="cid:..."`. En chokepunkt (som ORD-98 löste sin motsvarande bugg med)
 * räcker inte här: den skyddar bara EN implementation som alla läser genom.
 * Med tre parallella kopior av samma begrepp missar en fjärde fix alltid
 * någon av dem. Den här filen är den enda platsen kvar att missa.
 *
 * RÖR INTE `resolveInlineCidImages` i `microsoftGraphReadConnector.js`. Den
 * körs vid ingestion (skrivvägen), inte vid läsning, och har ett annat
 * kontrakt: en olöst cid: måste överleva OFÖRÄNDRAD in i lagringen.
 * `toStoredBodyHtml` (ccoMailboxTruthStore.js) strippar redan lösta
 * `data:`-URI:er ovillkorligt — bara en kvarlämnad `cid:`-referens går att
 * reparera senare med lokal bilagemetadata. En permanent "saknas"-markör
 * där, före den lokala kopplingen ens finns, skulle göra ett lagningsbart
 * fall olagbart.
 *
 * (Ett tidigare mätvärde här — "15 av 594 redan src='#'" — var ett mätfel:
 * de femton var `src=""` i vår egen mejlsignatur, inte skada från den här
 * skrivvägen. Slutsatsen ovan står ändå på egna meriter, den lutar sig inte
 * på det talet.)
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Kandidatnycklar för en cid-referens. `decodeURIComponent` görs där möjligt
 * (robustare mot procentkodade tecken än en ren strängjämförelse); ett
 * snedstreck i värdet ger även kortare variant före snedstrecket som extra
 * kandidat (Outlook lägger ibland ett suffix där).
 */
function normalizeCidCandidates(value = '') {
  const stripped = normalizeText(value).replace(/^cid:/i, '').replace(/^<|>$/g, '').trim();
  if (!stripped) return [];
  let decoded = stripped;
  try {
    decoded = decodeURIComponent(stripped);
  } catch (_err) {
    decoded = stripped;
  }
  const normalized = decoded.toLowerCase();
  const candidates = new Set([normalized]);
  if (normalized.includes('/')) {
    candidates.add(normalized.split('/')[0]);
  }
  return Array.from(candidates).filter(Boolean);
}

// Porterad från konversationer.html — samma princip, aldrig en trasig ikon.
const CID_MISSING_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="96" height="64">' +
  '<rect width="96" height="64" rx="6" fill="#f2efec"/>' +
  '<rect x="14" y="14" width="68" height="36" rx="4" fill="none" stroke="#c2aa9c" stroke-width="2"/>' +
  '<circle cx="30" cy="28" r="4" fill="#c2aa9c"/>' +
  '<path d="M20 44 L34 30 L44 38 L54 26 L76 44" fill="none" stroke="#c2aa9c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';
const CID_MISSING_IMAGE_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(CID_MISSING_IMAGE_SVG)}`;
const CID_MISSING_IMAGE_TITLE = 'Bilden kunde inte visas — bilagemetadata saknas i truth-lagret';

function toCidMissingImageMarkup(prefix, quote) {
  return (
    `${prefix}${quote}${CID_MISSING_IMAGE_PLACEHOLDER}${quote}` +
    ` title=${quote}${CID_MISSING_IMAGE_TITLE}${quote} data-cid-missing="true"`
  );
}

function resolveFromMap(cidMap, rawCid) {
  const candidates = normalizeCidCandidates(rawCid);
  for (const candidate of candidates) {
    if (cidMap.has(candidate)) return cidMap.get(candidate);
  }
  return '';
}

/**
 * Skriver om `src="cid:X"` och `url(cid:X)` i HTML mot en redan uppbyggd
 * cid → URL-karta. Ingen early-return på tom karta: en tom karta betyder att
 * INGET cid kan lösas, inte att inget behöver göras. Ett olöst cid ersätts
 * alltid — en riktig URL eller en synlig markering, aldrig lämnat som
 * `cid:` och aldrig lämnat orört.
 *
 * `handleAboutBlank` + `fallbackInlineUrl`: opt-in, används bara av
 * konversationsrutten för en avhuggen inline-bild som binds till trådens
 * enda lokala inline-bild. `resolveCidInHtml` (history-läsvägen) hade aldrig
 * den funktionen och ska inte få den som en bieffekt av sammanslagningen.
 */
function rewriteCidImageReferences(
  html = '',
  cidMap = new Map(),
  { fallbackInlineUrl = '', handleAboutBlank = false } = {}
) {
  const safeHtml = normalizeText(html);
  if (!safeHtml) return safeHtml;
  const pattern = handleAboutBlank ? /cid:|about:blank/i : /cid:/i;
  if (!pattern.test(safeHtml)) return safeHtml;

  let rewritten = safeHtml
    .replace(/\b(src\s*=\s*)(["'])cid:([^"']+)\2/gi, (match, prefix, quote, rawCid) => {
      const url = resolveFromMap(cidMap, rawCid);
      return url ? `${prefix}${quote}${url}${quote}` : toCidMissingImageMarkup(prefix, quote);
    })
    .replace(/url\(\s*(['"]?)cid:([^)'"\\]+)\1\s*\)/gi, (match, _quote, rawCid) => {
      const url = resolveFromMap(cidMap, rawCid);
      return url ? `url("${url}")` : `url("${CID_MISSING_IMAGE_PLACEHOLDER}")`;
    });

  if (handleAboutBlank) {
    rewritten = rewritten.replace(
      /\b(src\s*=\s*)(["'])about:blank(?:\2|$)/gi,
      (match, prefix, quote) =>
        fallbackInlineUrl
          ? `${prefix}${quote}${fallbackInlineUrl}${quote}`
          : toCidMissingImageMarkup(prefix, quote)
    );
  }

  return rewritten;
}

module.exports = {
  normalizeCidCandidates,
  CID_MISSING_IMAGE_PLACEHOLDER,
  CID_MISSING_IMAGE_TITLE,
  toCidMissingImageMarkup,
  rewriteCidImageReferences,
};
