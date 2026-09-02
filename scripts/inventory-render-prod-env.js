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
const {
  parseRenderYamlEnvDefaults,
  parseRenderYamlDuplicateKeys,
} = require('./merge-render-env-from-blueprint.js');

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

/**
 * Feature → { liveFlag, secrets }. När liveFlag är false/ej satt räknas
 * gruppens secrets som OPTIONAL_DISABLED (featuren är av → hemligheten får
 * vara tom utan att vara ett fel). Detta skiljer struktur-cleanup från
 * feature-aktivering: vi ändrar aldrig flaggan här.
 */
const FEATURE_SECRET_GROUPS = [
  {
    name: 'SharePoint',
    liveFlag: 'ARCANA_GRAPH_SHAREPOINT_ENABLED',
    secrets: [
      'ARCANA_GRAPH_SHAREPOINT_DRIVE_ID',
      'ARCANA_GRAPH_SHAREPOINT_SITE_ID',
      'ARCANA_GRAPH_SHAREPOINT_SITE_URL',
    ],
  },
  {
    name: 'Marketing connectors',
    liveFlag: 'ARCANA_MARKETING_CONNECTORS_LIVE_FETCH',
    secrets: [
      'ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN',
      'ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID',
      'ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN',
      'ARCANA_MARKETING_GOOGLE_ADS_LOGIN_CUSTOMER_ID',
      'ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN',
      'ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID',
      'ARCANA_MARKETING_META_ACCESS_TOKEN',
      'ARCANA_MARKETING_META_AD_ACCOUNT_ID',
    ],
  },
  {
    name: 'BankID',
    liveFlag: 'PORTAL_BANKID_LIVE',
    secrets: ['BANKID_API_KEY'],
  },
  {
    name: 'Resend (mejl)',
    liveFlag: null,
    secrets: ['RESEND_API_KEY', 'RESEND_DOMAIN', 'RESEND_FROM', 'RESEND_REPLY_TO'],
  },
];

/** Klassificerar en hemlig nyckel som REQUIRED_NOW eller OPTIONAL_DISABLED. */
function classifySecret(key, live) {
  for (const group of FEATURE_SECRET_GROUPS) {
    if (group.secrets.includes(key)) {
      if (!group.liveFlag) return 'OPTIONAL_DISABLED';
      const flag = String(live.get(group.liveFlag) || '')
        .trim()
        .toLowerCase();
      const isLive = flag === 'true' || flag === '1' || flag === 'live';
      return isLive ? 'REQUIRED_NOW' : 'OPTIONAL_DISABLED';
    }
  }
  return 'REQUIRED_NOW';
}

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

  // value: "" i render.yaml är ett avsiktligt tomt default (t.ex.
  // ARCANA_SCHEDULER_JOBS = "alla obligatoriska jobb"), inte ett gap.
  // Endast "finns inte alls i Render" räknas som saknat.
  const missingYamlDefaults = [...yamlDefaults.keys()].filter((key) => live.get(key) === undefined);

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

  const clientoEnabled =
    String(live.get('ARCANA_CLIENTO_INTEGRATION_ENABLED') || '')
      .trim()
      .toLowerCase() === 'true';
  console.log('=== Kritiska Cliento (minst en per grupp) ===');
  if (missingCliento.length === 0) {
    console.log('✅ Alla Cliento-grupper täckta (exkl. API-nyckel — se nedan)');
  } else if (!clientoEnabled) {
    console.log(
      `OPTIONAL_DISABLED — Cliento av (${missingCliento.length} grupper får vara tomma):`
    );
    for (const group of missingCliento) console.log(`  · ${group}`);
  } else {
    console.log(`❌ Saknas grupper (Cliento PÅ): ${missingCliento.join('; ')}`);
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
  const requiredNow = absentDashboard.filter((k) => classifySecret(k, live) === 'REQUIRED_NOW');
  const optionalDisabled = absentDashboard.filter(
    (k) => classifySecret(k, live) === 'OPTIONAL_DISABLED'
  );
  if (requiredNow.length) {
    console.log(`REQUIRED_NOW — saknas/tomma (${requiredNow.length}) — blockerar:`);
    for (const key of requiredNow) console.log(`  ✗ ${key}`);
  }
  if (optionalDisabled.length) {
    console.log(`OPTIONAL_DISABLED — feature av, får vara tomma (${optionalDisabled.length}):`);
    for (const key of optionalDisabled) console.log(`  · ${key}`);
  }
  if (!absentDashboard.length) console.log('✅ Alla dokumenterade Dashboard-nycklar finns');

  console.log('');
  console.log('=== YAML-dubbletter (samma key deklarerad flera gånger) ===');
  const duplicateKeys = parseRenderYamlDuplicateKeys(yaml);
  // ORD-162: META_APP_ID/SECRET/REDIRECT_URI delas av marketing (sync:false) och
  // CFO Meta OAuth (value:). De är KNOWN BLUEPRINT DUPLICATION och får finnas.
  const KNOWN_BLUEPRINT_DUPLICATES = new Set([
    'META_APP_ID',
    'META_APP_SECRET',
    'META_REDIRECT_URI',
  ]);
  const knownDuplicates = duplicateKeys.filter(([key]) => KNOWN_BLUEPRINT_DUPLICATES.has(key));
  const unexpectedDuplicates = duplicateKeys.filter(
    ([key]) => !KNOWN_BLUEPRINT_DUPLICATES.has(key)
  );
  if (knownDuplicates.length) {
    console.log(
      `KNOWN BLUEPRINT DUPLICATION (${knownDuplicates.length}) — META-block delas av marketing + CFO:`
    );
    for (const [key, count] of knownDuplicates) console.log(`  · ${key} (${count}x)`);
  }
  if (unexpectedDuplicates.length) {
    for (const [key, count] of unexpectedDuplicates) console.log(`  ❌ ${key} (${count}x)`);
  }
  if (!duplicateKeys.length) console.log('✅ Inga dubbletter');

  const hasBlockers =
    missingGraph.length > 0 ||
    (clientoEnabled && missingCliento.length > 0) ||
    unexpectedDuplicates.length > 0 ||
    requiredNow.length > 0;
  process.exit(hasBlockers ? 1 : 0);
}

main().catch((err) => fail(err.message || String(err)));
