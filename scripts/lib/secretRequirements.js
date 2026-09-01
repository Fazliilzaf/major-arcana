'use strict';

/**
 * ORD-156 §3 — när krävs en hemlighet?
 *
 * Svaret är inte "alltid". En hemlighet behövs när funktionen som använder den
 * är påslagen, och inte annars. Utan den kopplingen larmar env-kontrollen om
 * elva tomma nycklar som ska vara tomma — marknadsföringen kör i fixture-läge,
 * SharePoint är inte provisionerad, BankID är inte live.
 *
 * Det spelar roll för att en kontroll som aldrig går att uppfylla är en
 * kontroll man lär sig ignorera. Det var precis så 2026-08-31 kunde gå: larmet
 * skrek i sju timmar och ingen läste det. En permanent röd kontroll hade gjort
 * samma sak, fast med flit.
 *
 * Villkoret är dessutom sammansatt. Marknadsföringskanalerna står
 * ENABLED=true medan MODE=fixture och LIVE_FETCH=false — de anropar aldrig
 * Google, Meta eller LinkedIn på riktigt. Kopplar man bara mot ENABLED larmar
 * kontrollen om sju tokens som inte behövs.
 */

const LIVE_HAMTNING = 'ARCANA_MARKETING_CONNECTORS_LIVE_FETCH';

/** Hemlighet → alla flaggor som måste vara PÅ för att den ska krävas. */
const KRAVS_NAR = Object.freeze({
  ARCANA_GRAPH_SHAREPOINT_SITE_ID: ['ARCANA_GRAPH_SHAREPOINT_ENABLED'],
  ARCANA_GRAPH_SHAREPOINT_SITE_URL: ['ARCANA_GRAPH_SHAREPOINT_ENABLED'],
  ARCANA_GRAPH_SHAREPOINT_DRIVE_ID: ['ARCANA_GRAPH_SHAREPOINT_ENABLED'],

  ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID: ['ARCANA_MARKETING_GOOGLE_ADS_ENABLED', LIVE_HAMTNING],
  ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN: [
    'ARCANA_MARKETING_GOOGLE_ADS_ENABLED',
    LIVE_HAMTNING,
  ],
  ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN: ['ARCANA_MARKETING_GOOGLE_ADS_ENABLED', LIVE_HAMTNING],

  ARCANA_MARKETING_META_AD_ACCOUNT_ID: ['ARCANA_MARKETING_META_ENABLED', LIVE_HAMTNING],
  ARCANA_MARKETING_META_ACCESS_TOKEN: ['ARCANA_MARKETING_META_ENABLED', LIVE_HAMTNING],

  ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID: ['ARCANA_MARKETING_LINKEDIN_ENABLED', LIVE_HAMTNING],
  ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN: ['ARCANA_MARKETING_LINKEDIN_ENABLED', LIVE_HAMTNING],

  BANKID_API_KEY: ['PORTAL_BANKID_LIVE'],
});

/** Samma tolkning som ccoSendLiveGate: bara 1/true/yes/on är på. */
function flaggaPaslagen(env, flagga) {
  const v = env instanceof Map ? env.get(flagga) : env?.[flagga];
  return ['1', 'true', 'yes', 'on'].includes(
    String(v ?? '')
      .trim()
      .toLowerCase()
  );
}

/**
 * Krävs hemligheten i den här miljön?
 * En hemlighet utan känd koppling krävs alltid — okänt är inte samma sak som
 * valfritt, och en ny hemlighet ska inte tyst bli frivillig.
 */
function hemlighetKravs(nyckel, env) {
  const flaggor = KRAVS_NAR[nyckel];
  if (!flaggor) return true;
  return flaggor.every((f) => flaggaPaslagen(env, f));
}

/** Vilka flaggor som är av — för att kunna skriva ut VARFÖR den vilar. */
function vilandeSkal(nyckel, env) {
  return (KRAVS_NAR[nyckel] || []).filter((f) => !flaggaPaslagen(env, f)).map((f) => `${f}=av`);
}

module.exports = { KRAVS_NAR, flaggaPaslagen, hemlighetKravs, vilandeSkal };
