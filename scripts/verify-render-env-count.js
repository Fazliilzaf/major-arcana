#!/usr/bin/env node
'use strict';

/**
 * ORD-156 — kontroll av prod-miljöns env, i tre delar som rapporteras var för sig.
 *
 * Bakgrunden är två gånger samma dag:
 *
 *   morgonen  2 nycklar mot ett golv på 25 → steget failade vid varje push till
 *             main, hela dagen, och ingen läste det.
 *   kvällen   97 nycklar (över golvet) medan 28 hemligheter var tomma → grönt
 *             antal, tom miljö. Den falska tryggheten är farligare än den
 *             tydliga tomheten.
 *
 * Därför:
 *
 *   §2  golvet härleds ur render.yaml, inte ur en gissad siffra. Ett golv på 25
 *       mot 122 deklarerade nycklar hade passerat med 100 saknade.
 *   §3  hemligheter (`sync: false`) räknas SEPARAT. Blueprinten bär aldrig
 *       deras värden, så en återställning fyller inte i dem — antalet får
 *       aldrig dölja det.
 *   +   dashboard vs körande process. Env läses vid uppstart; en återställning
 *       ingen startat om är osynlig i Render-API:t men fortfarande verklig i
 *       trafiken. Det gick inte att se 2026-08-31 utan att jämföra för hand.
 */
const fs = require('node:fs');
const path = require('node:path');

const { resolveRenderApiKey, fetchAllRenderEnvMap } = require('./lib/renderEnvApi.js');
const {
  parseRenderYamlEnvDefaults,
  parseRenderYamlSecretKeys,
} = require('./merge-render-env-from-blueprint.js');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const prodUrl = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(
  /\/+$/,
  ''
);
const yamlPath = process.env.RENDER_BLUEPRINT_PATH || path.join(process.cwd(), 'render.yaml');

const problems = [];
function problem(msg) {
  problems.push(msg);
  console.error(`::error::${msg}`);
}
function fatal(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

/**
 * Dashboardens innehåll säger inget om vad processen faktiskt fick — env läses
 * vid uppstart. Skiljer de sig ligger en ändring och väntar på en omstart.
 */
async function readRunningProcessSources() {
  try {
    const res = await fetch(`${prodUrl}/api/v1/_diag/env`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body.envSource === 'object' ? body.envSource : null;
  } catch {
    return null; // Nåbarhet är inte den här kontrollens jobb.
  }
}

async function main() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fatal('RENDER_API_KEY saknas — kan inte verifiera env');

  if (!fs.existsSync(yamlPath)) fatal(`Hittar inte blueprinten: ${yamlPath}`);
  const yamlText = fs.readFileSync(yamlPath, 'utf8');
  const declared = parseRenderYamlEnvDefaults(yamlText);
  const secretKeys = parseRenderYamlSecretKeys(yamlText);

  const live = await fetchAllRenderEnvMap(serviceId, apiKey);

  // ── §2 · antal, mot ett golv som följer blueprinten ──────────────────────
  const minCount = Number(process.env.RENDER_ENV_MIN_COUNT || declared.size);
  console.log(`Blueprint deklarerar : ${declared.size} värdesatta + ${secretKeys.length} hemliga`);
  console.log(`Render har           : ${live.size} nycklar (paginerat)`);
  console.log(`Golv                 : ${minCount}`);

  if (live.size < minCount) {
    problem(`För få env-nycklar på prod (${live.size} < ${minCount})`);
  }

  const missingDeclared = [...declared.keys()].filter((k) => !live.has(k));
  if (missingDeclared.length) {
    problem(
      `${missingDeclared.length} deklarerade nycklar saknas i Render: ${missingDeclared.slice(0, 12).join(', ')}` +
        (missingDeclared.length > 12 ? ` … (+${missingDeclared.length - 12})` : '')
    );
  }

  // ── §3 · hemligheter, alltid separat ────────────────────────────────────
  const missingSecrets = secretKeys.filter((k) => !String(live.get(k) || '').trim());
  const haveSecrets = secretKeys.length - missingSecrets.length;
  console.log(`Hemligheter          : ${haveSecrets}/${secretKeys.length} satta`);

  if (missingSecrets.length) {
    problem(
      `${missingSecrets.length} hemligheter är tomma (Blueprinten bär dem aldrig — fyll i för hand): ` +
        missingSecrets.slice(0, 12).join(', ') +
        (missingSecrets.length > 12 ? ` … (+${missingSecrets.length - 12})` : '')
    );
  }

  // ── dashboard vs körande process ────────────────────────────────────────
  const running = await readRunningProcessSources();
  if (!running) {
    console.log('Körande process      : kunde inte läsas (_diag/env svarade inte) — hoppas över');
  } else {
    const onCodeDefault = Object.entries(running)
      .filter(([, source]) => source === 'code-default')
      .map(([key]) => key)
      .filter((key) => live.has(key));

    if (onCodeDefault.length) {
      problem(
        `Processen kör på kod-default för nycklar som FINNS i Render — en ändring väntar på omstart: ` +
          onCodeDefault.join(', ')
      );
    } else {
      console.log('Körande process      : i fas med Render');
    }
  }

  if (problems.length) {
    console.error('');
    console.error(`❌ ${problems.length} problem — se ovan.`);
    console.error(`   Åtgärd: kör workflowen post-deploy-prod-heal med`);
    console.error(`   restore_env_from_blueprint=true, fyll sedan hemligheterna för hand.`);
    process.exit(1);
  }

  console.log('✅ Env-antal, deklarerade nycklar, hemligheter och körande process OK');
}

main().catch((err) => fatal(err.message || String(err)));
