#!/usr/bin/env node
'use strict';

/**
 * Stickprov — skriv 5 hälsodeklarationer till prod patient-master via PUT.
 * Kräver INTE ARCANA_CCO_HALSO_HD_INGEST_ENABLED=true (samma modell som Cliento delta).
 *
 * Usage:
 *   npm run push:halso-hd-stickprov-prod -- --from ./data/reports/halso-hd-dry-run.stickprov.json
 *   npm run push:halso-hd-stickprov-prod -- --dry-run --from ./data/reports/halso-hd-dry-run.stickprov.json
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';

function parseArgs(argv) {
  const args = { from: '', dryRun: false, limit: 5 };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--from') args.from = argv[++i] || '';
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--limit') args.limit = Number(argv[++i]) || 5;
  }
  return args;
}

function getToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function fetchPatient(token, patientId) {
  const res = await fetch(
    `${BASE}/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-arcana-client': 'major_arcana_admin',
      },
    }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `${res.status} get patient ${patientId}`);
  return payload.patient;
}

async function putPatient(token, body) {
  const res = await fetch(`${BASE}/api/v1/cco-patient-master/patient`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `${res.status} PUT patient ${body.id}`);
  }
  return payload;
}

function buildHealthDeclarationUpsert({ parsed, match, rawMessage, stickprovRunId }) {
  return {
    source: 'halso_mailbox',
    channel: parsed.channel,
    signedAt: parsed.signedAt,
    consent: parsed.consent,
    importedAt: new Date().toISOString(),
    internetMessageId: parsed.internetMessageId || rawMessage.internetMessageId || '',
    rawMessageId: rawMessage.id || '',
    mailboxId: rawMessage.mailboxId || 'halso@hairtpclinic.com',
    subject: parsed.subject || rawMessage.subject || '',
    matchMethod: match.method,
    matchConfidence: match.confidence,
    reviewRequired: false,
    answers: parsed.answers,
    flags: parsed.flags,
    stickprovRunId,
    processorVersion: 'halso-hd-stickprov-v1',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.from || !fs.existsSync(args.from)) {
    throw new Error(
      'Saknar --from ./data/reports/halso-hd-dry-run.stickprov.json (kör dry-run med --out först)'
    );
  }

  const payload = JSON.parse(fs.readFileSync(args.from, 'utf8'));
  const candidates = (payload.stickprov || payload.stickprovCandidates || []).slice(0, args.limit);
  if (!candidates.length) throw new Error('Inga stickprov-kandidater i filen');

  const token = getToken();
  const stickprovRunId = `halso-stickprov-${new Date().toISOString().slice(0, 10)}`;
  const results = [];

  for (const candidate of candidates) {
    const body = candidate.stickprovPayload || candidate;
    const patientId = candidate.patientId || body.match?.patientId;
    const parsed = body.parsed;
    const match = body.match;
    const rawMessage = body.rawMessage || {};
    if (!patientId || !parsed) {
      results.push({ patientId, ok: false, error: 'saknar patientId eller parsed' });
      continue;
    }

    const existing = await fetchPatient(token, patientId);
    const healthDeclaration = buildHealthDeclarationUpsert({
      parsed,
      match,
      rawMessage,
      stickprovRunId,
    });
    const allergies = [
      ...new Set([...(existing.allergies || []), ...(parsed.allergies || [])].filter(Boolean)),
    ];

    const upsertBody = {
      ...existing,
      tenantId: existing.tenantId || TENANT_ID,
      id: patientId,
      healthDeclaration,
      allergies,
      halsoHdStickprov: {
        runId: stickprovRunId,
        matchMethod: match.method,
        importedAt: new Date().toISOString(),
      },
    };

    if (args.dryRun) {
      results.push({
        ok: true,
        dryRun: true,
        patientId,
        matchMethod: match.method,
        signedAt: parsed.signedAt,
        answerCount: parsed.answers?.length || 0,
        flagCount: parsed.flags?.length || 0,
      });
      continue;
    }

    const saved = await putPatient(token, upsertBody);
    results.push({
      ok: true,
      patientId,
      matchMethod: match.method,
      hasHealthDeclaration: Boolean(saved.card?.hasHealthDeclaration),
      missingHealthDeclaration: saved.card?.missingHealthDeclaration,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((row) => row.ok),
        dryRun: args.dryRun,
        stickprovRunId,
        base: BASE,
        ingestFlagNote: 'ARCANA_CCO_HALSO_HD_INGEST_ENABLED förblir false — direkt PUT som Cliento',
        results,
      },
      null,
      2
    )
  );

  if (!results.every((row) => row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
