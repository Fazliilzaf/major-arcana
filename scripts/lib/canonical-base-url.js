#!/usr/bin/env node
'use strict';

/**
 * Skriver ut den KANONISKA bas-URL:en för en given bas-URL.
 *
 * Varför det inte räcker att lita på redirecten:
 *
 * `arcana.hairtpclinic.se` 301:ar till `.com` by design, så en webbläsare landar
 * alltid rätt. Men curl SLÄPPER `Authorization`-headern vid omdirigering över
 * värdgräns — en avsiktlig säkerhetsspärr. Ett skript som loggar in mot
 * legacy-värden får därför en token (credentials ligger i POST-kroppen och
 * bevaras med --post301) men kan sedan inte använda den, eftersom varje
 * autentiserat anrop tappar headern på vägen.
 *
 * Bevisat mot prod 2026-07-28:
 *   .com + header                 -> "Sessionen är ogiltig eller har gått ut."
 *   .se + -L + samma header       -> "Inloggning krävs."     <- headern borta
 *   .com UTAN header              -> "Inloggning krävs."     <- identiskt
 *   .se + --location-trusted      -> "Sessionen är ogiltig eller har gått ut."
 *
 * Därför måste värden vara rätt FRÅN BÖRJAN. `-L` är ett komplement, inte en
 * ersättning.
 *
 * Mappningen är INTE duplicerad här — den läses från
 * src/brand/resolveLegacyHostRedirectUrl.js, som också driver serverns 301.
 * Två källor hade drivit isär, och den ena hade varit den som testerna skyddar.
 *
 *   node scripts/lib/canonical-base-url.js https://arcana.hairtpclinic.se
 *   -> https://arcana.hairtpclinic.com
 *
 * Okänd värd skrivs ut oförändrad (lokal utveckling, staging, egna miljöer).
 * Exit 0 alltid vid giltig URL — det här är en normalisering, inte en kontroll.
 */

const {
  resolveLegacyHostRedirectUrl,
} = require('../../src/brand/resolveLegacyHostRedirectUrl');

function kanoniskBasUrl(rawBaseUrl) {
  const raw = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw; // Inte en URL — lämna orörd, anroparen får hantera det.
  }
  const canonical = resolveLegacyHostRedirectUrl({
    requestHost: url.host,
    requestPath: '/',
  });
  if (!canonical) return raw;
  // resolveLegacyHostRedirectUrl svarar med path — vi vill bara origin.
  try {
    return new URL(canonical).origin;
  } catch {
    return raw;
  }
}

module.exports = { kanoniskBasUrl };

if (require.main === module) {
  const inmatning = process.argv[2] || process.env.BASE_URL || '';
  process.stdout.write(kanoniskBasUrl(inmatning));
}
