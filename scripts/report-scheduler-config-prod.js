#!/usr/bin/env node
'use strict';

/**
 * LÄSER scheduler-konfigurationen i prod. Skriver ingenting.
 *
 * Bakgrund: readiness rapporterar `scheduler_enabled_started` som
 * {"enabled":false,"started":false}, men den säger inte VARFÖR. Tre lager kan
 * släcka schedulern, och de har olika åtgärder:
 *
 *   1. env  ARCANA_SCHEDULER_ENABLED=false i Renders dashboard
 *   2. override-filen /var/data/scheduler-override.json (persistent disk)
 *   3. prod safe-mode — appliceras EFTER overriden i server.js och VINNER ALLTID
 *
 * render.yaml säger rätt saker, men Blueprint-syncen är pausad, så yaml:en når
 * aldrig tjänsten. Utan den här rapporten går det inte att skilja "overriden är
 * raderad" från "safe-mode åt upp den".
 *
 * ORD-74 är fortfarande öppen (avstämning yaml <-> dashboard), så det här är
 * inte ett engångsverktyg.
 *
 * SÄKERHET: bara GET. Inga hemligheter skrivs ut — override-filen innehåller
 * booleaner och en jobblista. Token loggas aldrig.
 *
 *   BASE_URL=https://arcana.hairtpclinic.com \
 *   ARCANA_OWNER_EMAIL=… ARCANA_OWNER_PASSWORD=… \
 *   node scripts/report-scheduler-config-prod.js
 */

const {
  fetchJson,
  resolveToken,
  normalizeBaseUrl,
} = require('./check-public-readiness-guard.js');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function läsEndpoint(baseUrl, sökväg, token) {
  try {
    const svar = await fetchJson(baseUrl, sökväg, { token });
    return { ok: true, data: svar };
  } catch (error) {
    return { ok: false, fel: text(error?.message || error) || 'okänt_fel' };
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(
    process.env.BASE_URL || process.env.ARCANA_PUBLIC_BASE_URL || ''
  );
  if (!baseUrl) throw new Error('BASE_URL saknas.');

  // Värden ska stå utskriven. Hela poängen med rapporten är att avgöra vilken
  // konfiguration som gäller — då får det inte råda tvivel om vilken maskin.
  process.stdout.write(`baseUrl: ${baseUrl}\n\n`);

  const { token } = await resolveToken({
    baseUrl,
    email: text(process.env.ARCANA_OWNER_EMAIL),
    password: text(process.env.ARCANA_OWNER_PASSWORD),
    tenantId: text(process.env.ARCANA_OWNER_TENANT_ID),
    mfaCode: text(process.env.ARCANA_OWNER_MFA_CODE),
    mfaSecret: text(process.env.ARCANA_OWNER_MFA_SECRET),
    mfaRecoveryCode: text(process.env.ARCANA_OWNER_MFA_RECOVERY_CODE),
  });

  const override = await läsEndpoint(baseUrl, '/api/v1/ops/scheduler/override', token);
  const status = await läsEndpoint(baseUrl, '/api/v1/ops/scheduler/status', token);

  process.stdout.write('=== OVERRIDE-FIL ===\n');
  if (override.ok) {
    process.stdout.write(`${JSON.stringify(override.data, null, 2)}\n`);
  } else {
    process.stdout.write(`kunde inte läsas: ${override.fel}\n`);
  }

  process.stdout.write('\n=== SCHEDULER-STATUS ===\n');
  if (status.ok) {
    const s = plockaStatus(status.data);
    process.stdout.write(
      `${JSON.stringify(
        {
          enabled: s?.enabled,
          started: s?.started,
          runOnStartup: s?.runOnStartup,
          jobs: Array.isArray(s?.jobs)
            ? s.jobs.map((j) => ({ jobId: j?.jobId, enabled: j?.enabled }))
            : s?.jobs,
        },
        null,
        2
      )}\n`
    );
  } else {
    process.stdout.write(`kunde inte läsas: ${status.fel}\n`);
  }

  process.stdout.write('\n=== TOLKNING ===\n');
  process.stdout.write(
    `${tolkaLäge(override.ok ? override.data : null, status.ok ? status.data : null).text}\n`
  );
}

// GET /api/v1/ops/scheduler/status svarar { ok, generatedAt, scheduler: {...} }.
// Statusen ligger NÄSTLAD. Läses den platt blir enabled undefined, och då
// rapporterar verktyget "otillräckligt underlag" på fullgod data — ett tyst fel
// i just det verktyg som ska bevisa något.
function plockaStatus(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.scheduler && typeof data.scheduler === 'object') return data.scheduler;
  // Tolerera platt form om ändpunkten någon gång ändras.
  if (typeof data.enabled === 'boolean') return data;
  return null;
}

/**
 * Ren funktion — hela poängen är att den ska gå att testa mot de EXAKTA former
 * rutthanterarna svarar med, utan att någon behöver prod.
 *
 * GET /scheduler/override svarar en av tre former:
 *   { ok, path, exists: false }                        — ingen fil
 *   { ok, path, exists: true, valid: false }           — fil med trasig JSON
 *   { ok, path, exists: true, valid: true, override }  — fil som gäller
 */
function tolkaLäge(overrideData, statusData) {
  const s = plockaStatus(statusData);
  if (!s || typeof s.enabled !== 'boolean') {
    return { kod: 'okänt', text: 'Otillräckligt underlag — läs rådata ovan.' };
  }
  if (s.enabled === true) {
    return { kod: 'på', text: 'Schedulern är på. Ingen åtgärd.' };
  }

  const finns = Boolean(overrideData && overrideData.exists === true);
  const trasig = finns && overrideData.valid === false;
  const sägerPå = finns && overrideData?.override?.schedulerEnabled === true;

  if (trasig) {
    return {
      kod: 'trasig_fil',
      text:
        'Override-filen finns men innehåller ogiltig JSON och ignoreras därför helt.\n' +
        'Åtgärd: skriv om den via POST /api/v1/ops/scheduler/override.',
    };
  }
  if (sägerPå) {
    return {
      kod: 'safe_mode',
      text:
        'Override-filen säger schedulerEnabled=true men schedulern är av.\n' +
        'Då är det prod safe-mode som vann — server.js kör den EFTER overriden.\n' +
        'Åtgärd: ARCANA_SCHEDULER_PROD_SAFE_MODE=false i dashboarden, inte i render.yaml,\n' +
        'eftersom Blueprint-syncen är pausad och yaml:en aldrig når tjänsten.',
    };
  }
  if (finns) {
    return {
      kod: 'fil_tänder_inte',
      text:
        'Override-filen finns men tänder inte schedulern.\n' +
        'Åtgärd: POST /api/v1/ops/scheduler/override med {"schedulerEnabled": true}.',
    };
  }
  if (overrideData && overrideData.exists === false) {
    return {
      kod: 'ingen_fil',
      text:
        'Ingen override-fil. Då styr env ensam, och dashboarden har ENABLED=false\n' +
        '(render.yaml säger true men syncen är pausad, så yaml:en når inte tjänsten).\n' +
        'Det matchar hypotesen att overriden raderades INNAN syncen återupptogs.',
    };
  }
  return {
    kod: 'okänt',
    text: 'Schedulern är av, men override-filen kunde inte läsas. Läs rådata ovan.',
  };
}

module.exports = { tolkaLäge, plockaStatus };

// Kör bara när filen startas direkt. Ett test som importerar tolkningen ska
// inte logga in mot prod som sidoeffekt.
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Kunde inte läsa scheduler-konfigurationen');
    console.error(text(error?.message || error) || error);
    process.exit(1);
  });
}
