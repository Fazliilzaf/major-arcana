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
    const d = status.data || {};
    process.stdout.write(
      `${JSON.stringify(
        {
          enabled: d.enabled,
          started: d.started,
          runOnStartup: d.runOnStartup,
          jobs: Array.isArray(d.jobs)
            ? d.jobs.map((j) => ({ jobId: j?.jobId, enabled: j?.enabled }))
            : d.jobs,
        },
        null,
        2
      )}\n`
    );
  } else {
    process.stdout.write(`kunde inte läsas: ${status.fel}\n`);
  }

  // Tolkningen skrivs ut, men bara när den FÖLJER av data. Att gissa här vore
  // att göra samma fel som rapporten finns till för att undvika.
  process.stdout.write('\n=== TOLKNING ===\n');
  const filFinns = override.ok && override.data && override.data.exists !== false;
  const filSägerPå =
    filFinns && override.data?.override?.schedulerEnabled === true;
  const körInte = status.ok && status.data?.enabled === false;

  if (körInte && filSägerPå) {
    process.stdout.write(
      'Override-filen säger schedulerEnabled=true men schedulern är av.\n' +
        'Då är det prod safe-mode som vann (server.js kör den EFTER overriden).\n' +
        'Åtgärd: ARCANA_SCHEDULER_PROD_SAFE_MODE=false i dashboarden — inte i render.yaml,\n' +
        'eftersom Blueprint-syncen är pausad.\n'
    );
  } else if (körInte && filFinns && !filSägerPå) {
    process.stdout.write(
      'Override-filen finns men tänder inte schedulern.\n' +
        'Åtgärd: POST /api/v1/ops/scheduler/override med {"schedulerEnabled": true}.\n'
    );
  } else if (körInte && !filFinns) {
    process.stdout.write(
      'Ingen override-fil. Då styr env ensam, och dashboarden har ENABLED=false\n' +
        '(render.yaml säger true men syncen är pausad, så yaml:en når inte tjänsten).\n' +
        'Det matchar hypotesen att overriden raderades INNAN syncen återupptogs.\n'
    );
  } else if (status.ok && status.data?.enabled === true) {
    process.stdout.write('Schedulern är på. Ingen åtgärd.\n');
  } else {
    process.stdout.write('Otillräckligt underlag — läs rådata ovan.\n');
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte läsa scheduler-konfigurationen');
  console.error(text(error?.message || error) || error);
  process.exit(1);
});
