#!/usr/bin/env node
'use strict';

/**
 * Inventera Render prod env mot render.yaml-defaults + kända Dashboard-secrets.
 * Skriver aldrig ut secret-värden — endast nyckelnamn och närvaro.
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { resolveRenderApiKey, fetchAllRenderEnvMap } = require('./lib/renderEnvApi.js');
const { parseRenderYamlEnvDefaults } = require('./merge-render-env-from-blueprint.js');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

/** Nycklar som orsakade boot-krasch när de saknades (2026-06-04). */
const CRITICAL_GRAPH_KEYS = [
  'ARCANA_GRAPH_TENANT_ID',
  'ARCANA_GRAPH_CLIENT_ID',
  'ARCANA_GRAPH_CLIENT_SECRET',
  'ARCANA_GRAPH_USER_ID',
  'ARCANA_GRAPH_SEND_ALLOWLIST',
];

/** Cliento minimum för prod (.com + cliento provider). */
const CRITICAL_CLIENTO_GROUPS = [
  ['CLIENTO_PARTNER_ID', 'CLIENTO_PARTNER_ID_HAIR_TP_CLINIC'],
  ['CLIENTO_API_BASE_URL'],
  ['CLIENTO_ACCOUNT_IDS', 'CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC'],
];

/** Väntar på Cliento-support — har aldrig funnits på prod (ej incident-förlust). */
const PENDING_CLIENTO_KEYS = ['CLIENTO_API_KEY', 'CLIENTO_API_KEY_HAIR_TP_CLINIC'];

/** UI-managed enligt render.yaml-kommentar (ej blueprint value). */
const DASHBOARD_ONLY_EXTRA = ['RESEND_API_KEY', 'RESEND_DOMAIN', 'RESEND_FROM', 'RESEND_REPLY_TO'];

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function parseRenderYamlSyncFalseKeys(yamlText) {
  const keys = [];
  const lines = yamlText.split(/\r?\n/);
  let inEnvVars = false;
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (/^\s*envVars:\s*$/.test(line)) {
      inEnvVars = true;
      continue;
    }
    if (!inEnvVars) continue;
    if (/^\S/.test(line) && !/^\s/.test(rawLine)) break;

    const keyMatch = line.match(/^\s*-\s*key:\s*(.+)\s*$/);
    if (keyMatch) {
      currentKey = keyMatch[1].trim();
      continue;
    }
    if (/^\s*sync:\s*false\s*$/.test(line) && currentKey) {
      keys.push(currentKey);
      currentKey = null;
    }
    const valueMatch = line.match(/^\s*value:\s*(.+)\s*$/);
    if (valueMatch && currentKey) {
      currentKey = null;
    }
  }
  return [...new Set(keys)];
}

function hasAnyKey(map, keys) {
  return keys.some((key) => {
    const value = map.get(key);
    return value !== undefined && String(value).trim() !== '';
  });
}

function missingFromGroups(map, groups) {
  const missing = [];
  for (const group of groups) {
    if (!hasAnyKey(map, group)) missing.push(group.join(' | '));
  }
  return missing;
}

function missingKeys(map, keys) {
  return keys.filter((key) => {
    const value = map.get(key);
    return value === undefined || String(value).trim() === '';
  });
}

async function main() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fail('Saknar Render API-nyckel (RENDER_API_KEY eller ~/.render/cli.yaml)');

  const yamlPath = path.join(process.cwd(), 'render.yaml');
  const yaml = fs.readFileSync(yamlPath, 'utf8');
  const yamlDefaults = parseRenderYamlEnvDefaults(yaml);
  const syncFalseKeys = parseRenderYamlSyncFalseKeys(yaml);
  const dashboardExpected = [...new Set([...syncFalseKeys, ...DASHBOARD_ONLY_EXTRA])];

  const live = await fetchAllRenderEnvMap(serviceId, apiKey);
  const liveKeys = [...live.keys()].sort();

  const missingYamlDefaults = [...yamlDefaults.keys()].filter((key) => {
    const value = live.get(key);
    return value === undefined || String(value).trim() === '';
  });

  const missingDashboard = missingKeys(live, dashboardExpected);
  const missingGraph = missingKeys(live, CRITICAL_GRAPH_KEYS);
  const missingCliento = missingFromGroups(live, CRITICAL_CLIENTO_GROUPS);

  const presentDashboard = dashboardExpected.filter((key) => !missingDashboard.includes(key));

  console.log(`Render prod env inventory (${serviceId})`);
  console.log(`Live keys (paginerad GET): ${liveKeys.length}`);
  console.log(`render.yaml value-defaults: ${yamlDefaults.size}`);
  console.log('');

  console.log('=== Kritiska Graph (boot) ===');
  if (missingGraph.length === 0) {
    console.log('✅ Alla 5 Graph-nycklar finns med värde');
  } else {
    console.log(`❌ Saknas/tomma: ${missingGraph.join(', ')}`);
  }
  console.log('');

  console.log('=== Kritiska Cliento (minst en per grupp) ===');
  if (missingCliento.length === 0) {
    console.log('✅ Alla Cliento-grupper täckta (exkl. API-nyckel — se nedan)');
  } else {
    console.log(`❌ Saknas grupper: ${missingCliento.join('; ')}`);
  }
  console.log('');

  const pendingCliento = missingKeys(live, PENDING_CLIENTO_KEYS);
  console.log('=== Cliento API-nyckel (väntar support@cliento.com) ===');
  if (pendingCliento.length === PENDING_CLIENTO_KEYS.length) {
    console.log(
      '⏳ CLIENTO_API_KEY saknas — förväntat tills Cliento-support svarar (aldrig satt på prod)'
    );
  } else {
    console.log('✅ Minst en CLIENTO_API_KEY-variant finns');
  }
  console.log('');

  console.log('=== yaml-defaults som saknas på Render ===');
  if (missingYamlDefaults.length === 0) {
    console.log('✅ Alla yaml value-defaults finns');
  } else {
    console.log(`⚠ ${missingYamlDefaults.length} saknas:`);
    for (const key of missingYamlDefaults) console.log(`  - ${key}`);
  }
  console.log('');

  console.log('=== Dashboard-only / sync:false (förväntat utanför yaml value) ===');
  console.log(`Finns (${presentDashboard.length}/${dashboardExpected.length}):`);
  for (const key of presentDashboard.sort()) console.log(`  ✓ ${key}`);
  const absentDashboard = missingDashboard.sort();
  if (absentDashboard.length) {
    console.log(`Saknas/tomma (${absentDashboard.length}) — Fazli lägger in i Render Dashboard:`);
    for (const key of absentDashboard) console.log(`  ✗ ${key}`);
  } else {
    console.log('✅ Alla dokumenterade Dashboard-nycklar finns');
  }

  const hasBlockers = missingGraph.length > 0 || missingCliento.length > 0;
  process.exit(hasBlockers ? 1 : 0);
}

main().catch((err) => fail(err.message || String(err)));
