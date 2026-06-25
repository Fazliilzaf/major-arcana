#!/usr/bin/env node
/**
 * Ladda ner en SharePoint-mall (.docx) via Microsoft Graph till iCloud-arbetsmappen.
 * Usage: node scripts/ops/download-sharepoint-doc.js [--name "1. Hälsodeklaration TP, PRP, Microneedling PRF.docx"]
 */
'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SITE_HOST = 'hairtpclinic1.sharepoint.com';
const SITE_PATH = '/sites/Ledning';
const DRIVE_ID =
  process.env.ARCANA_SHAREPOINT_DRIVE_ID ||
  'b!J9ysU7x080-442YSpY3ck-umNLLDGMRNtOxNUKIJiFmCSMH3wxTSTYHwSsJ7Gy2C';

const DEFAULT_FILE = '1. Hälsodeklaration TP, PRP, Microneedling PRF.docx';
const DEFAULT_RELATIVE =
  'General/1. Kunddokument - KVALITETSSÄKRA/2. Hair TP Clinic 2026/Hårtransplantation';

const OUT_DIR =
  process.env.CCO_PATIENT_DOCS_WORD_DIR ||
  path.join(
    process.env.HOME,
    'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/CCO-patientdokument-live/01-word-original-lokalt'
  );

function parseArgs(argv) {
  const out = { name: DEFAULT_FILE, relative: DEFAULT_RELATIVE };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--name' && argv[i + 1]) {
      out.name = argv[++i];
    } else if (argv[i] === '--relative' && argv[i + 1]) {
      out.relative = argv[++i];
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out.outDir = argv[++i];
    } else if (argv[i] === '--dest' && argv[i + 1]) {
      out.destName = argv[++i];
    }
  }
  return out;
}

async function getToken() {
  const tenantId = process.env.ARCANA_GRAPH_TENANT_ID;
  const clientId = process.env.ARCANA_GRAPH_CLIENT_ID;
  const clientSecret = process.env.ARCANA_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Saknar ARCANA_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET i .env');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Token misslyckades: ${json.error || res.status} ${json.error_description || ''}`
    );
  }
  return json.access_token;
}

async function graphGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${url} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return res;
}

async function resolveItemByPath(token, relativeFolder, fileName) {
  const itemPath = `${relativeFolder}/${fileName}`.replace(/\/+/g, '/');
  const encoded = itemPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encoded}`;
  const meta = await graphGet(url, token);
  return meta.json();
}

async function searchItem(token, query) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root/search(q='${encodeURIComponent(query)}')`;
  const res = await graphGet(url, token);
  const json = await res.json();
  return json.value || [];
}

async function downloadContent(token, itemId, destPath) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${itemId}/content`;
  const res = await graphGet(url, token);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = args.outDir || OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  console.log('SharePoint download via Microsoft Graph');
  console.log(`  Fil: ${args.name}`);
  console.log(`  Mapp: ${args.relative}`);
  console.log(`  Ut:   ${outDir}`);

  const token = await getToken();
  let item = null;

  try {
    item = await resolveItemByPath(token, args.relative, args.name);
    console.log(`✓ Hittad via sökväg: ${item.name} (${item.id})`);
  } catch (pathErr) {
    console.warn(`⚠ Sökväg misslyckades: ${pathErr.message}`);
    const hits = await searchItem(token, args.name.replace(/\.docx$/i, ''));
    item = hits.find((h) => h.name === args.name) || hits[0];
    if (!item) throw new Error(`Fil ej hittad: ${args.name}`);
    console.log(`✓ Hittad via sök: ${item.name} (${item.id})`);
  }

  const safeName =
    args.destName || args.name.replace(/[^\wåäöÅÄÖ\s.-]+/gi, '_').replace(/\s+/g, '-');
  const destPath = path.join(outDir, safeName);
  const bytes = await downloadContent(token, item.id, destPath);
  console.log(`✓ Nedladdad ${bytes} bytes → ${destPath}`);
  console.log(
    JSON.stringify({ ok: true, destPath, bytes, itemId: item.id, webUrl: item.webUrl }, null, 2)
  );
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
