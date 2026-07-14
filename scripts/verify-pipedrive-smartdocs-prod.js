#!/usr/bin/env node
'use strict';

/**
 * ORD-59b — Pipedrive SmartDocs prod readiness verify.
 *
 * Usage:
 *   npm run verify:pipedrive-smartdocs-prod
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

const REPO = path.join(__dirname, '..');
const REPORT_PATH = path.join(REPO, 'data/reports/pipedrive-smartdocs-prod-verify.json');

const CANARY = {
  offerPatientId: '5683443c-cb18-4931-893d-2502d1592a65',
  agreementPatientId: '72b3c17d-19e6-4725-ad08-5fda0b85dc0d',
  minOffers: 1,
  minAgreements: 1,
};

const FACIT = {
  minVisible: 1660,
  offert: 11,
  avtal: 42,
  maxRejected: 0,
  maxNeedsReview: 0,
  maxLinkOnly: 0,
};

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function api(token, route) {
  const res = await fetch(`${BASE}${route}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function loadProdPipedriveStatsViaSsh() {
  const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
  const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
  const sshHost = process.env.RENDER_SSH_HOST || `${serviceId}@ssh.frankfurt.render.com`;
  if (!fs.existsSync(sshKey)) return { ok: false, reason: 'ssh_key_missing' };

  const script =
    "const a=JSON.parse(require('fs').readFileSync('/var/data/cco-patient-assets.json','utf8'));const stats={total:0,visible:0,verified:0,rejected:0,needsReview:0,offert:0,avtal:0,ovrigt:0,noPatient:0,linkOnly:0};for(const x of Object.values(a.items||{})){if(x.sourceSystem!=='pipedrive_import')continue;stats.total++;if(x.status==='REJECTED')stats.rejected++;else if(x.status==='NEEDS_REVIEW')stats.needsReview++;else if(x.status==='VISIBLE_ON_PATIENT_CARD')stats.visible++;else if(x.status==='VERIFIED_IN_CCO')stats.verified++;if(!['VISIBLE_ON_PATIENT_CARD','VERIFIED_IN_CCO'].includes(x.status))continue;const s=(x.patientCardSection||'').toLowerCase();if(s==='offert')stats.offert++;else if(s==='samtycken_avtal')stats.avtal++;else stats.ovrigt++;if(!x.patientId||x.patientId==='unknown')stats.noPatient++;if(!x.storageKey||x.storageKey==='pending-no-binary')stats.linkOnly++;}console.log(JSON.stringify(stats));";

  const out = execFileSync(
    'ssh',
    [
      '-i',
      sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=90',
      sshHost,
      `node -e ${JSON.stringify(script)}`,
    ],
    { encoding: 'utf8', timeout: 120000 }
  );
  return { ok: true, stats: JSON.parse(out.trim()) };
}

async function verifyDocumentBundle(token, patientId, kind) {
  const { status, body } = await api(
    token,
    `/api/v1/cco-patient-master/patient/document-bundle?patientId=${encodeURIComponent(patientId)}`
  );
  const offers = (body?.documents?.offers || []).filter(
    (row) => row?.documentTypeId === 'pipedrive_historical_offer'
  );
  const agreements = (body?.documents?.healthForms || []).filter(
    (row) => row?.documentTypeId === 'pipedrive_historical_agreement'
  );
  const rows = kind === 'offer' ? offers : agreements;
  const viewUrl = rows[0]?.viewUrl || '';
  let pdfOk = false;
  if (viewUrl) {
    const assetMatch = viewUrl.match(/\/api\/v1\/cco\/assets\/([^/]+)\/download/);
    if (assetMatch) {
      const dl = await fetch(`${BASE}${viewUrl}`, {
        headers: {
          Accept: 'application/pdf,*/*',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      });
      const buf = dl.ok ? Buffer.from(await dl.arrayBuffer()) : null;
      pdfOk = Boolean(buf && buf.length > 500 && buf.slice(0, 4).toString() === '%PDF');
    }
  }
  return {
    patientId,
    kind,
    bundleStatus: status,
    rowCount: rows.length,
    previewable: rows.filter((row) => row.previewable && row.viewUrl).length,
    pdfOk,
    pass: status === 200 && rows.length > 0 && pdfOk,
  };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };
  const report = { verifiedAt: new Date().toISOString(), base: BASE, checks: {} };

  console.log(`Pipedrive SmartDocs verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  report.checks.readyz = ready.ready === true;
  if (!record('PD-01 readyz', report.checks.readyz)) hardFail = true;

  let token;
  try {
    token = getToken();
    record('PD-02 auth token', true);
  } catch (err) {
    fail('PD-02 auth token', err.message);
    process.exit(1);
  }

  const version = await api(token, '/api/v1/_diag/version');
  const commit = String(version.body?.commit || '').slice(0, 8);
  report.checks.versionCommit = commit;
  record(
    'PD-03 prod commit',
    version.status === 200 && commit.length >= 7,
    commit || `HTTP ${version.status}`
  );

  try {
    const ssh = loadProdPipedriveStatsViaSsh();
    report.checks.sshStats = ssh.stats || null;
    if (!ssh.ok) {
      fail('PD-04 ssh asset facit', ssh.reason || 'ssh_failed');
    } else {
      const s = ssh.stats;
      record('PD-04 pipedrive total', s.total >= FACIT.minVisible, `${s.total}`);
      record(
        'PD-05 visible+verified',
        s.visible + s.verified >= FACIT.minVisible,
        `${s.visible}+${s.verified}`
      );
      if (!record('PD-06 rejected', s.rejected <= FACIT.maxRejected, `${s.rejected}`))
        hardFail = true;
      if (
        !record('PD-07 needs review', s.needsReview <= FACIT.maxNeedsReview, `${s.needsReview}`)
      ) {
        hardFail = true;
      }
      if (
        !record(
          'PD-08 offert section',
          s.offert === FACIT.offert,
          `${s.offert} (facit ${FACIT.offert})`
        )
      ) {
        hardFail = true;
      }
      if (
        !record('PD-09 avtal section', s.avtal === FACIT.avtal, `${s.avtal} (facit ${FACIT.avtal})`)
      ) {
        hardFail = true;
      }
      if (!record('PD-10 link-only blockers', s.linkOnly <= FACIT.maxLinkOnly, `${s.linkOnly}`)) {
        hardFail = true;
      }
      record('PD-11 patient linked', s.noPatient === 0, `${s.noPatient} utan patientId`);
    }
  } catch (err) {
    fail('PD-04 ssh asset facit', err.message || String(err));
  }

  const offerCheck = await verifyDocumentBundle(token, CANARY.offerPatientId, 'offer');
  report.checks.offerCanary = offerCheck;
  if (
    !record(
      'PD-12 offer document-bundle + PDF',
      offerCheck.pass && offerCheck.rowCount >= CANARY.minOffers,
      `${offerCheck.rowCount} rader, pdf=${offerCheck.pdfOk}`
    )
  ) {
    hardFail = true;
  }

  const agreementCheck = await verifyDocumentBundle(token, CANARY.agreementPatientId, 'agreement');
  report.checks.agreementCanary = agreementCheck;
  if (
    !record(
      'PD-13 agreement document-bundle + PDF',
      agreementCheck.pass && agreementCheck.rowCount >= CANARY.minAgreements,
      `${agreementCheck.rowCount} rader, pdf=${agreementCheck.pdfOk}`
    )
  ) {
    hardFail = true;
  }

  const assets = await api(token, `/api/v1/cco/patients/${CANARY.agreementPatientId}/assets`);
  const pipedriveRows = (assets.body?.assets || assets.body?.items || []).filter(
    (row) => row?.sourceSystem === 'pipedrive_import'
  );
  report.checks.patientAssetsApi = { count: pipedriveRows.length, status: assets.status };
  record(
    'PD-14 patient assets API',
    assets.status === 200 && pipedriveRows.length > 0,
    `${pipedriveRows.length} pipedrive assets`
  );

  report.pass = !hardFail;
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nReport: ${path.relative(REPO, REPORT_PATH)}`);
  console.log(hardFail ? '\nRESULT: FAIL' : '\nRESULT: PASS — ORD-59b prod-ready');
  process.exit(hardFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
