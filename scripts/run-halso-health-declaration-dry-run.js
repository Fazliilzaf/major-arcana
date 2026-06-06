#!/usr/bin/env node
'use strict';

/**
 * Fas 0 — halso@ hälsodeklaration dry-run (Import 2).
 *
 * Hämtar mejl från halso@ via Microsoft Graph, parser + identitetsmatchning
 * mot prod patient-master — inga skrivningar.
 *
 * Usage:
 *   npm run dry-run:halso-hd
 *   npm run dry-run:halso-hd -- --max 500 --stickprov 5
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { config } = require('../src/config');
const {
  buildDryRunRow,
  selectStickprovCandidates,
  summarizeDryRunRows,
} = require('../src/ops/ccoHalsoHealthDeclarationDryRun');
const { isHalsoHealthDeclarationSubject } = require('../src/ops/ccoHalsoHealthDeclarationParser');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';
const ROOT = path.join(__dirname, '..');
const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const MAILBOX = (
  process.env.ARCANA_MAILBOX ||
  process.env.ARCANA_CCO_HALSO_MAILBOX_EMAIL ||
  config.ccoHalsoMailboxEmail ||
  'halso@hairtpclinic.com'
).toLowerCase();

function parseArgs(argv) {
  const args = {
    max: 0,
    stickprov: 5,
    since: '',
    out: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--max') args.max = Number(argv[++i]) || 0;
    else if (token === '--stickprov') args.stickprov = Number(argv[++i]) || 5;
    else if (token === '--since') args.since = argv[++i] || '';
    else if (token === '--out') args.out = argv[++i] || '';
  }
  return args;
}

async function getGraphToken() {
  const tenantId = process.env.ARCANA_GRAPH_TENANT_ID || process.env.GRAPH_TENANT_ID || '';
  const clientId = process.env.ARCANA_GRAPH_CLIENT_ID || process.env.GRAPH_CLIENT_ID || '';
  const clientSecret =
    process.env.ARCANA_GRAPH_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET || '';
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Saknar Graph-credentials (ARCANA_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`${LOGIN}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await res.json();
  if (!res.ok)
    throw new Error(payload.error_description || payload.error || 'Graph token misslyckades');
  return payload.access_token;
}

async function graphGet(token, url, { search = false } = {}) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (search) headers.ConsistencyLevel = 'eventual';
  const res = await fetch(url, { headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error?.message || `${res.status} Graph GET`);
  return payload;
}

async function fetchMessageBody(token, messageId) {
  const payload = await graphGet(
    token,
    `${GRAPH}/users/${encodeURIComponent(MAILBOX)}/messages/${encodeURIComponent(messageId)}?$select=id,subject,receivedDateTime,internetMessageId,body`
  );
  return payload;
}

async function fetchHalsoMessages(token, { max = 0, since = '' } = {}) {
  const searchTerms = ['Hälsodeklaration', 'Halsodeklaration'];
  const headerMap = new Map();

  for (const term of searchTerms) {
    let url =
      `${GRAPH}/users/${encodeURIComponent(MAILBOX)}/messages` +
      `?$search=${encodeURIComponent(`"${term}"`)}&$select=id,subject,receivedDateTime,internetMessageId,bodyPreview,from&$top=250`;
    while (url) {
      const page = await graphGet(token, url, { search: true });
      for (const msg of page.value || []) {
        if (!isHalsoHealthDeclarationSubject(msg.subject)) continue;
        if (since && msg.receivedDateTime && msg.receivedDateTime < `${since}T00:00:00Z`) continue;
        headerMap.set(msg.id, msg);
        if (max > 0 && headerMap.size >= max) break;
      }
      if (max > 0 && headerMap.size >= max) break;
      url = page['@odata.nextLink'] || null;
    }
    if (max > 0 && headerMap.size >= max) break;
  }

  if (headerMap.size === 0) {
    console.error('⚠ Graph $search gav 0 — fallback inbox-scan');
    return fetchHalsoMessagesFromInbox(token, { max, since });
  }

  const headers = [...headerMap.values()];
  console.error(`HD-träffar (headers): ${headers.length}`);

  const messages = [];
  for (const header of headers) {
    const full = await fetchMessageBody(token, header.id);
    messages.push({ ...header, body: full.body });
    if (messages.length % 100 === 0) {
      console.error(`  … hämtat ${messages.length}/${headers.length} HD-kroppar`);
    }
  }
  return messages;
}

async function fetchHalsoMessagesFromInbox(token, { max = 0, since = '' } = {}) {
  const select = 'id,subject,receivedDateTime,internetMessageId,bodyPreview,from';
  let url =
    `${GRAPH}/users/${encodeURIComponent(MAILBOX)}/mailFolders/inbox/messages` +
    `?$select=${select}&$orderby=receivedDateTime desc&$top=100`;
  if (since) {
    url += `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}T00:00:00Z`)}`;
  }

  const headers = [];
  while (url) {
    const page = await graphGet(token, url);
    for (const msg of page.value || []) {
      if (!isHalsoHealthDeclarationSubject(msg.subject)) continue;
      headers.push(msg);
      if (max > 0 && headers.length >= max) break;
    }
    if (max > 0 && headers.length >= max) break;
    url = page['@odata.nextLink'] || null;
  }

  const messages = [];
  for (const header of headers) {
    const full = await fetchMessageBody(token, header.id);
    messages.push({ ...header, body: full.body });
  }
  return messages;
}

function getProdToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function fetchProdPatients(token) {
  const patients = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const res = await fetch(
      `${BASE}/api/v1/cco-patient-master/patients?limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || `${res.status} patient list`);
    }
    const batch = Array.isArray(payload.patients) ? payload.patients : [];
    patients.push(...batch);
    const total = Number(payload.total || 0);
    offset += batch.length;
    if (!batch.length || (total && offset >= total)) break;
    if (offset >= 20000) break;
  }
  return patients;
}

function loadLocalPatients() {
  const masterPath =
    process.env.CCO_PATIENT_MASTER_PATH || path.join(ROOT, 'data/cco-patient-master.json');
  if (!require('node:fs').existsSync(masterPath)) return [];
  const master = JSON.parse(require('node:fs').readFileSync(masterPath, 'utf8'));
  return master.tenants?.[TENANT_ID]?.patients || [];
}

async function resolvePatients() {
  try {
    const prodToken = getProdToken();
    console.log('Hämtar prod patient-master…');
    const patients = await fetchProdPatients(prodToken);
    console.log(`Prod patienter: ${patients.length}`);
    return { patients, source: 'prod' };
  } catch (error) {
    console.error(`⚠ Prod patient-lista misslyckades (${error.message}) — fallback lokal master`);
    const patients = loadLocalPatients();
    console.log(`Lokal patient-master: ${patients.length}`);
    return { patients, source: 'local' };
  }
}

function normalizeGraphMessage(msg) {
  const bodyHtml = msg.body?.content || '';
  const bodyText =
    msg.body?.contentType === 'text'
      ? msg.body?.content || ''
      : require('../src/ops/ccoHalsoHealthDeclarationParser').htmlToText(bodyHtml);
  return {
    id: msg.id,
    graphMessageId: msg.id,
    mailboxId: MAILBOX,
    subject: msg.subject || '',
    internetMessageId: msg.internetMessageId || '',
    receivedDateTime: msg.receivedDateTime || '',
    receivedAt: msg.receivedDateTime || '',
    bodyText,
    bodyHtml,
    fromEmail: msg.from?.emailAddress?.address || '',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`== halso@ HD dry-run (Fas 0) — ${MAILBOX} ==`);
  console.log(`Prod patient-master: ${BASE}`);

  const graphToken = await getGraphToken();
  console.log('Hämtar inbox via Graph…');
  const graphMessages = await fetchHalsoMessages(graphToken, { max: args.max, since: args.since });
  console.log(`HD-mejl (kropp hämtad): ${graphMessages.length}`);

  const { patients, source: patientSource } = await resolvePatients();

  const rows = graphMessages.map((msg) =>
    buildDryRunRow(normalizeGraphMessage(msg), patients, {
      ccoHalsoMailboxEmail: MAILBOX,
      mailboxEmail: MAILBOX,
    })
  );

  const { stats, samples } = summarizeDryRunRows(rows);
  const stickprov = selectStickprovCandidates(rows, { limit: args.stickprov });

  const report = {
    ok: true,
    phase: 'fas0_dry_run',
    mailbox: MAILBOX,
    prodUrl: BASE,
    patientSource,
    ingestFlagExpectedOff: config.ccoHalsoHealthDeclarationIngestEnabled !== true,
    generatedAt: new Date().toISOString(),
    stats,
    samples,
    stickprovCandidates: stickprov.map((row) => ({
      patientId: row.patientId,
      matchMethod: row.matchMethod,
      matchConfidence: row.matchConfidence,
      sample: row.sample,
    })),
    notes: [
      '§8 facit: parseHealthDeclarationMessage — personnummer, e-post, telefon, signedAt, answers, flags, allergies',
      '§9 facit: matchPatientFromParsed — personnummer → e-post → telefon; osäker → NEEDS_REVIEW',
      'Ingen data skriven. Stickprov körs separat via push-halso-hd-stickprov-prod.js',
    ],
  };

  console.log(JSON.stringify(report, null, 2));

  if (args.out) {
    const outPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const stickprovPath = outPath.replace(/\.json$/i, '') + '.stickprov.json';
    await fs.writeFile(
      stickprovPath,
      `${JSON.stringify({ stickprov, generatedAt: report.generatedAt }, null, 2)}\n`,
      'utf8'
    );
    console.error(`Rapport skriven: ${outPath}`);
    console.error(`Stickprov-payload (PII): ${stickprovPath} — committa INTE till GitHub`);
  }

  if (stats.halsoHdSubjects === 0) {
    console.error('⚠ Inga [Hälsodeklaration/Webb]-mejl hittades i skannade rader.');
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
