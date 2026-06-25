#!/usr/bin/env node
'use strict';

/**
 * Försök hämta Curatiio GetAccept-PDF:er (88 st) som saknar binär.
 * Kräver GETACCEPT_ENTITY_ID_CURATIIO om dokumenten ligger i annan entity.
 *
 *   node scripts/recover-getaccept-curatiio-pdfs.js --probe
 *   node scripts/recover-getaccept-curatiio-pdfs.js --commit --limit 5
 */

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { resolveSecureStorageRoot } = require('./lib/halsoHdLocalPdfReader');

const ROOT = path.join(__dirname, '..');
const LEGACY_PATH = path.join(ROOT, 'data/cco-legacy-agreements.json');
const ASSETS_PATH = path.join(ROOT, 'data/cco-patient-assets.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/getaccept-curatiio-recovery.json');

const API_BASE = 'https://api.getaccept.com/v1';

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function auth(entityId) {
  const email = normalizeText(process.env.GETACCEPT_EMAIL || process.env.GETACCEPT_CURATIIO_EMAIL);
  const password = normalizeText(
    process.env.GETACCEPT_PASSWORD || process.env.GETACCEPT_CURATIIO_PASSWORD
  );
  if (!email || !password) throw new Error('Saknar GETACCEPT_EMAIL/PASSWORD');
  const body = { email, password };
  const entity = normalizeText(
    entityId || process.env.GETACCEPT_ENTITY_ID_CURATIIO || process.env.GETACCEPT_ENTITY_ID
  );
  if (entity) body.entity_id = entity;
  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || payload.error || `auth ${res.status}`);
  return { token: payload.access_token, entityId: entity || null };
}

async function switchEntity(token, entityId) {
  const res = await fetch(`${API_BASE}/refresh/${encodeURIComponent(entityId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return payload.access_token || null;
}

async function downloadPdf(token, documentId) {
  const url = `${API_BASE}/documents/${encodeURIComponent(documentId)}/download?with_file_content=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: payload.message || payload.error || res.statusText,
    };
  }
  if (!payload.file_content)
    return { ok: false, status: res.status, error: 'missing_file_content' };
  const buf = Buffer.from(payload.file_content, 'base64');
  if (buf.length < 100 || buf.slice(0, 4).toString() !== '%PDF') {
    return { ok: false, status: res.status, error: 'not_pdf' };
  }
  return { ok: true, buffer: buf, fileName: payload.file || `${documentId}.pdf` };
}

function storageKeyFor(documentId, fileName) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const hash = crypto.createHash('sha256').update(documentId).digest('hex').slice(0, 12);
  // GetAccepts payload.file kan vara en S3-presigned-URL med querystring
  // (…pdf%22&x-amz-checksum-mode=…&x-id=GetObject) → path.extname() drog då med
  // skräp i nyckeln. downloadPdf() har redan validerat %PDF, så tvinga .pdf.
  const ext = '.pdf';
  const id = crypto.randomUUID();
  return `${y}/${m}/${hash}/${id}${ext}`;
}

async function main() {
  const probe = process.argv.includes('--probe');
  const commit = process.argv.includes('--commit');
  const limitArg = process.argv.find((a, i) => process.argv[i - 1] === '--limit');
  const limit = limitArg ? Number(limitArg) : probe ? 3 : 999;

  const legacy = JSON.parse(await fs.readFile(LEGACY_PATH, 'utf8'));
  const pending = Object.values(legacy.agreements || {}).filter(
    (a) => a.brand === 'Curatiio' && !a.pdfStorageKey && a.sourceRecordId
  );

  const { token: defaultToken } = await auth();
  let curatiioToken = defaultToken;
  const curatiioEntity = normalizeText(process.env.GETACCEPT_ENTITY_ID_CURATIIO);
  if (curatiioEntity) {
    const switched = await switchEntity(defaultToken, curatiioEntity);
    if (switched) curatiioToken = switched;
    else
      await auth(curatiioEntity).then((r) => {
        curatiioToken = r.token;
      });
  }

  const me = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${curatiioToken}` },
  }).then((r) => r.json());
  const entityInfo = me?.user ? { id: me.user.entity_id, name: me.user.entity_name } : null;

  const results = [];
  const storageRoot = resolveSecureStorageRoot();
  let stored = 0;

  for (const agreement of pending.slice(0, limit)) {
    const docId = agreement.sourceRecordId;
    let dl = await downloadPdf(curatiioToken, docId);
    if (!dl.ok && curatiioToken !== defaultToken) {
      dl = await downloadPdf(defaultToken, docId);
    }
    const row = {
      agreementId: agreement.agreementId,
      documentId: docId,
      patientEmail: agreement.recipients?.[0]?.email || null,
      documentName: agreement.documentName,
      signedAt: agreement.signedAt,
      ok: dl.ok,
      error: dl.error || null,
      status: dl.status || null,
    };
    results.push(row);

    if (!commit || !dl.ok) continue;

    const storageKey = storageKeyFor(docId, dl.fileName);
    const outPath = path.join(storageRoot, storageKey);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, dl.buffer);
    const checksum = crypto.createHash('sha256').update(dl.buffer).digest('hex');

    const assetsState = JSON.parse(await fs.readFile(ASSETS_PATH, 'utf8'));
    const asset = assetsState.items[agreement.assetId];
    if (asset) {
      assetsState.items[agreement.assetId] = {
        ...asset,
        storageKey,
        checksum,
        fileSize: dl.buffer.length,
        mimeType: 'application/pdf',
        status: 'VISIBLE_ON_PATIENT_CARD',
        uiStatus: 'imported',
        updatedAt: new Date().toISOString(),
        technicalInfo: {
          ...(asset.technicalInfo || {}),
          pdfPending: false,
          binaryStatus: null,
          pdfStatus: null,
          pdfFetchedAt: new Date().toISOString(),
          importBadge: 'imported',
          badge: null,
          sourceAvailability: null,
        },
      };
      await fs.writeFile(ASSETS_PATH, `${JSON.stringify(assetsState, null, 2)}\n`, 'utf8');
    }

    legacy.agreements[agreement.agreementId] = {
      ...agreement,
      pdfStorageKey: storageKey,
      pdfStatus: null,
      binaryStatus: null,
      unavailableReason: null,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(LEGACY_PATH, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    stored += 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    entityInfo,
    curatiioEntityEnv: curatiioEntity || null,
    pendingTotal: pending.length,
    probed: results.length,
    stored,
    commit,
    results,
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
