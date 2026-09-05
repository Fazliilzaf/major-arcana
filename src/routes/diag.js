const express = require('express');

const { isCcoSendLive } = require('../ops/ccoSendLiveGate');
const { arKundutskickPa } = require('../infra/kundutskickGate');
const avsandarFacit = require('../../config/avsandare-per-klinik.json');

// Diagnostik-endpoints (env-flaggor + deployad version). Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// config + runtimeState injiceras (stabila referenser i server.js).
function createDiagRouter({ config, runtimeState }) {
  const router = express.Router();

  // Publik diag-endpoint — visar vilka ARCANA_*-env är satta + bootstrap-status.
  router.get('/_diag/env', (req, res) => {
    // ORD-86: bada namnen, med flit. `src/config.js` laser BARA PUBLIC_BASE_URL
    // (rad 169, plus Fortnox- och Swish-callbackarna), medan staffPortal.js:708
    // foredrar ARCANA_PUBLIC_BASE_URL. Ar de satta till olika varden bygger
    // olika delar av appen olika lankar, och inget syns utifran. Det var precis
    // den blindheten som lat ARCANA_PUBLIC_BASE_URL peka pa legacy .se tills
    // drift-gaten gav sex falsklarm. Bada matas ut sa avvikelsen gar att se.
    const flags = [
      'PUBLIC_BASE_URL',
      'ARCANA_PUBLIC_BASE_URL',
      'ARCANA_STATE_ROOT',
      'ARCANA_BOOTSTRAP_MAILBOX_BACKFILL',
      'ARCANA_BOOTSTRAP_TENANT_ID',
      'ARCANA_BOOTSTRAP_PREFERRED_MAILBOX',
      'ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS',
      'ARCANA_BOOTSTRAP_DELAY_MS',
      'ARCANA_GRAPH_READ_ENABLED',
      'ARCANA_GRAPH_SEND_ENABLED',
      'ARCANA_DEFAULT_TENANT',
      // .cursor/rules/website-booking-policy.mdc: icke-forhandlingsbar — ska
      // vara false pa prod tills CCO-bokning ar 100% redo och godkand. Men
      // src/config.js:28 defaultar till true, och render.yaml (ORD-74,
      // 2026-07-17) instruerar att TA BORT en explicit false i Dashboard sa
      // kod-defaulten (true) tar over. Den motsagelsen gick inte att se
      // utifran — samma blindhet som ARCANA_PUBLIC_BASE_URL var (#1315).
      'ARCANA_PUBLIC_WEB_BOOKING_ENABLED',
      // ORD-153 §6: exportgrinden for kommersiella sandvagar. Utan den har
      // raden gick grindens lage inte att lasa utifran alls, sa ett gront
      // verify-script bevisade ingenting — det kunde lika garna ha kort mot
      // en oppen grind. Ravardet ensamt racker dock inte: ccoSendLiveGate
      // rankar BARA 1/true/yes som live, sa "off"/"nej"/"0" ar alla stangd
      // grind. Se resolved.ccoSendLive nedan for det effektiva vardet.
      'CCO_SEND_LIVE',
      /**
       * ORD-221 — den grind ägaren faktiskt bad om, och som inte gick att se.
       *
       * Ägaren 2026-09-03: "det får inte skickas någon info till någon kund."
       * Grinden som håller det löftet är ARCANA_KUNDUTSKICK_ENABLED, och den
       * har saknats här sedan den byggdes i ORD-184. Att svara på frågan "är
       * det avstängt?" krävde alltså tillgång till Render-dashboarden.
       *
       * Det är samma blindhet som CCO_SEND_LIVE hade före ORD-153 §6, med den
       * skillnaden att den här grinden är den enda som skyddar patienterna.
       */
      'ARCANA_KUNDUTSKICK_ENABLED',
      /**
       * ORD-221 — shadow-läget för konversationssvar.
       *
       * `/cco/runtime/conversation/:key/reply` skickar SKARPT till kunden när
       * ARCANA_MAIL_SHADOW_SEND är av. Den defaultar till 'false' i
       * src/config.js:42 — alltså skarpt läge som utgångspunkt. Uppmätt i prod
       * 2026-09-05 gick den inte att läsa utifrån.
       */
      'ARCANA_MAIL_SHADOW_SEND',
    ];
    const env = {};
    for (const k of flags) {
      const v = process.env[k];
      env[k] = v === undefined ? null : v.length > 80 ? v.slice(0, 30) + '...' : v;
    }

    // ORD-155 §4: varifran kom vardet? `renderDefaultsApplied` har alltid
    // funnits, men som en lista man maste veta att man ska korslasa — och den
    // kopplingen fick jag gora for hand 2026-08-31 for att forsta varfor
    // webbokningen stod oppen. Nu star kallan bredvid varje flagga.
    //
    //   "render"       = ett uttryckligt varde finns i Render-dashboarden
    //   "code-default" = nyckeln saknades, appen skrev in sitt eget varde
    //   "unset"        = varken satt eller defaultad (kor pa asBool-fallback)
    const defaultsApplied = new Set(
      Array.isArray(config.renderRuntimeDefaults?.applied)
        ? config.renderRuntimeDefaults.applied
        : []
    );
    const envSource = {};
    for (const k of flags) {
      if (defaultsApplied.has(k)) envSource[k] = 'code-default';
      else if (env[k] !== null) envSource[k] = 'render';
      else envSource[k] = 'unset';
    }

    return res.json({
      ok: true,
      env,
      envSource,
      resolved: {
        // Det EFFEKTIVA vardet efter config.js fallback-kedja — inte bara vilka
        // env som rakar vara satta. Ar detta `http://localhost:<port>` i prod
        // betyder det att PUBLIC_BASE_URL saknas helt.
        publicBaseUrl: config.publicBaseUrl ?? null,
        // Effektivt varde efter config.js:s asBool(..., true)-fallback —
        // se kommentaren vid flaggan ovan for varfor detta maste synas.
        publicWebBookingEnabled:
          typeof config.publicWebBookingEnabled === 'boolean'
            ? config.publicWebBookingEnabled
            : null,
        // ORD-153 §6: EXAKT samma funktion som ccoCommercialMailDispatch.js
        // grindar pa — inte en omtolkning av env har. En flagga, en sanning;
        // avlasning och verklighet kan darfor inte glida isar. Gaten laser
        // process.env per anrop, sa vardet ar farskt vid varje request.
        ccoSendLive: isCcoSendLive(),
        /**
         * ORD-221 — det EFFEKTIVA läget för kundutskicksspärren.
         *
         * Samma funktion som microsoftGraphSendConnector, transactionalMailer,
         * smsConnector och ccoSendActionStore grindar på — inte en omtolkning
         * av env här. Råvärdet ovan räcker inte: `arKundutskickPa` godtar bara
         * 1/true/yes, så "on", "ja" och "PÅ" är alla avstängd grind.
         *
         * `false` betyder: ingenting går ut till någon kund, oavsett vad
         * någon trycker på i personalportalen.
         */
        kundutskickPa: arKundutskickPa(),
        /**
         * ORD-221 — går konversationssvaret till kunden eller till en testlåda?
         *
         * ADRESSEN VISAS INTE, bara om den är satt. /_diag/env är en publik
         * endpoint, och en mailadress i klartext där är en läcka som inte har
         * med grindens läge att göra. Frågan diag ska kunna svara på är "styrs
         * svaren om?", inte "vart?".
         *
         * skarptTillKund: true betyder att ett svar i konversationsvyn går
         * till patientens riktiga adress — förutsatt att kundutskickPa också
         * är true. Är kundutskickPa false stoppas det ändå.
         */
        mailSvar: {
          shadow: String(process.env.ARCANA_MAIL_SHADOW_SEND || '').toLowerCase() === 'true',
          testmottagareSatt: Boolean(
            String(process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT || '').trim()
          ),
          skarptTillKund:
            String(process.env.ARCANA_MAIL_SHADOW_SEND || '').toLowerCase() !== 'true' &&
            !String(process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT || '').trim(),
        },
        /**
         * ORD-213 — kan varje klinik faktiskt skicka?
         *
         * Samma blindhet som ORD-153 §6 löste för sändgrinden, en nivå ner.
         * `aktiv: true` i config/avsandare-per-klinik.json betyder att appen
         * VILL skicka från klinikens adress. Om adressen inte står i
         * ARCANA_GRAPH_SEND_ALLOWLIST vägrar Graph, och resultatet är inte
         * fel avsändare utan INGET BREV — det tystaste felet i hela kedjan.
         *
         * De två fakta bor på olika ställen: viljan i en fil i repot, tillåtet
         * i en env-variabel i Render. Ingen vy visade dem tillsammans, så det
         * gick inte att svara på "kan Curatiio skicka?" utan att logga in på
         * Render och läsa av en maskerad hemlighet för hand. Det gjorde jag
         * 2026-09-04, och det är inte en mätning som går att upprepa.
         *
         * ADRESSERNA LÄCKS INTE. Bara namn, viljeläge och ett ja/nej. Listan
         * i sig är fortfarande maskerad.
         */
        avsandarePerKlinik: (() => {
          const rader = (process.env.ARCANA_GRAPH_SEND_ALLOWLIST || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          const kliniker = (avsandarFacit && avsandarFacit.kliniker) || {};
          return Object.entries(kliniker).map(([id, k]) => {
            const adress = String(k.avsandare || '').toLowerCase();
            const tillaten = Boolean(adress) && rader.includes(adress);
            return {
              klinik: id,
              aktiv: Boolean(k.aktiv),
              tillatenIAllowlist: tillaten,
              // Det enda läget som tyst tappar brev: appen vill skicka, Graph
              // vägrar. Namngivet för att det ska gå att larma på.
              kanSkicka: Boolean(k.aktiv) && tillaten,
              tystFel: Boolean(k.aktiv) && !tillaten,
            };
          });
        })(),
        stateRoot: config.stateRoot,
        aiProvider: config.aiProvider,
        staffJournalOpenAccess: Boolean(config.staffJournalOpenAccess),
        renderDefaultsApplied: Array.isArray(config.renderRuntimeDefaults?.applied)
          ? config.renderRuntimeDefaults.applied
          : [],
      },
      cwd: process.cwd(),
      nodeVersion: process.version,
    });
  });

  // Commit-sha endpoint — så vi kan verifiera vilken version som är deployad.
  router.get('/_diag/version', (req, res) => {
    return res.json({
      ok: true,
      commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'unknown',
      branch: process.env.RENDER_GIT_BRANCH || 'unknown',
      deployedAt: process.env.RENDER_DEPLOY_AT || null,
      serverStartedAt: runtimeState.startedAt,
      fixes: ['FIX3', 'FIX4', 'FIX5', 'FIX6', 'FIX7', 'FIX8'],
    });
  });

  return router;
}

module.exports = { createDiagRouter };
