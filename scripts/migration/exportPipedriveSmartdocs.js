#!/usr/bin/env node
'use strict';

/**
 * Export Pipedrive deal/person files (PDF + dokument) till iCloud-arkiv.
 * ORD-59/59b — auth download fix (401), --retry-failures för manifest-failures.
 */

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_ICLOUD_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data'
);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    limit: 0,
    outDir: '',
    companyDomain: normalizeText(process.env.PIPEDRIVE_COMPANY_DOMAIN) || 'hairtpclinic2',
    apiToken: normalizeText(process.env.PIPEDRIVE_API_TOKEN),
    secondaryApiToken: normalizeText(process.env.PIPEDRIVE_API_TOKEN_SECONDARY),
    pageSize: 100,
    delayMs: 250,
    retryFailures: false,
    manifestPath: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--commit') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--retry-failures') args.retryFailures = true;
    else if (token === '--limit') args.limit = Number.parseInt(argv[++i], 10) || 0;
    else if (token === '--out') args.outDir = argv[++i];
    else if (token === '--domain') args.companyDomain = argv[++i];
    else if (token === '--token') args.apiToken = argv[++i];
    else if (token === '--secondary-token') args.secondaryApiToken = argv[++i];
    else if (token === '--manifest') args.manifestPath = argv[++i];
  }
  if (!args.outDir && args.manifestPath) {
    args.outDir = path.dirname(path.resolve(args.manifestPath));
  }
  if (!args.outDir) {
    const stamp = new Date().toISOString().slice(0, 10);
    args.outDir = path.join(DEFAULT_ICLOUD_ROOT, `pipedrive-smartdocs-${stamp}`);
  }
  return args;
}

const {
  classifyPipedriveDocumentKind: classifyDocumentKind,
} = require('./lib/pipedriveSmartdocsImport');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pipedriveRequest({ companyDomain, apiToken, pathname, searchParams = {} }) {
  const url = new URL(`https://${companyDomain}.pipedrive.com/api/v1${pathname}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('api_token', apiToken);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    const message = payload.error || payload.error_info || payload.message || res.statusText;
    throw new Error(`Pipedrive ${pathname} → ${res.status}: ${message}`);
  }
  return payload;
}

async function listAllFiles({ companyDomain, apiToken, pageSize }) {
  const rows = [];
  let start = 0;
  while (true) {
    const payload = await pipedriveRequest({
      companyDomain,
      apiToken,
      pathname: '/files',
      searchParams: { start, limit: pageSize, sort: 'update_time DESC' },
    });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    rows.push(...batch);
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection) break;
    start = pagination.next_start ?? start + batch.length;
  }
  return rows;
}

async function getFileDetails({ companyDomain, apiToken, fileId }) {
  return pipedriveRequest({
    companyDomain,
    apiToken,
    pathname: `/files/${fileId}`,
  });
}

function withApiToken(urlString, apiToken) {
  const url = new URL(urlString);
  url.searchParams.set('api_token', apiToken);
  return url.toString();
}

async function downloadFileBuffer({ companyDomain, apiToken, fileId, secondaryApiToken = '' }) {
  const tokens = [apiToken, secondaryApiToken].map(normalizeText).filter(Boolean);
  const uniqueTokens = [...new Set(tokens)];
  let lastError = 'download failed';

  for (const token of uniqueTokens) {
    const authUrl = new URL(
      `https://${companyDomain}.pipedrive.com/api/v1/files/${fileId}/download`
    );
    authUrl.searchParams.set('api_token', token);
    const res = await fetch(authUrl);
    if (!res.ok) {
      lastError = `download ${res.status}`;
      continue;
    }
    const contentType = normalizeText(res.headers.get('content-type')).toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      lastError = 'empty_body';
      continue;
    }
    if (contentType.includes('json')) {
      try {
        const payload = JSON.parse(buf.toString('utf8'));
        const remoteUrl = payload?.data?.url || payload?.data?.file_url;
        if (remoteUrl) {
          const remoteRes = await fetch(withApiToken(remoteUrl, token));
          if (remoteRes.ok) {
            const remoteBuf = Buffer.from(await remoteRes.arrayBuffer());
            return {
              ok: true,
              buffer: remoteBuf,
              via: token === apiToken ? 'remote_url_from_json' : 'secondary_remote_url_from_json',
              tokenUsed: token === apiToken ? 'primary' : 'secondary',
            };
          }
        }
        lastError = 'json_without_download_url';
        continue;
      } catch {
        lastError = 'invalid_json_download';
        continue;
      }
    }
    return {
      ok: true,
      buffer: buf,
      via: token === apiToken ? 'download_endpoint' : 'secondary_download_endpoint',
      tokenUsed: token === apiToken ? 'primary' : 'secondary',
    };
  }

  return { ok: false, error: lastError, via: 'download_endpoint' };
}

function safeFileName(value, fallback = 'document.pdf') {
  const base = normalizeText(value)
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, ' ');
  return base || fallback;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function isCandidate(file) {
  const name = normalizeText(file.name || file.file_name).toLowerCase();
  const fileType = normalizeText(file.file_type).toLowerCase();
  if (name.endsWith('.pdf')) return true;
  if (fileType.includes('pdf')) return true;
  if (fileType === 'doc' || fileType === 'gdoc' || fileType === 'remote') return true;
  return /offert|avtal|quote|proposal|smart|behandling/i.test(name);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.apiToken) {
    throw new Error('Saknar PIPEDRIVE_API_TOKEN. Sätt env eller --token <token>.');
  }

  const outRoot = path.resolve(args.outDir);
  const pdfRoot = path.join(outRoot, 'pdfs');
  const reportPath = path.join(outRoot, 'reports', 'export-summary.json');
  const manifestPath = path.resolve(args.manifestPath || path.join(outRoot, 'manifest.json'));

  let existingManifest = null;
  if (args.retryFailures && fs.existsSync(manifestPath)) {
    existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  console.log(`\n=== PIPEDRIVE SMARTDOCS EXPORT ${args.dryRun ? '(DRY-RUN)' : '(COMMIT)'} ===`);
  console.log(`Domain: ${args.companyDomain}.pipedrive.com`);
  console.log(`Output: ${outRoot}`);

  let selected = [];
  if (args.retryFailures && existingManifest) {
    const failedIds = new Set((existingManifest.failures || []).map((f) => String(f.fileId)));
    const retryItems = (existingManifest.items || []).filter((item) =>
      failedIds.has(String(item.fileId))
    );
    selected = args.limit > 0 ? retryItems.slice(0, args.limit) : retryItems;
    console.log(`Retry-failures: ${selected.length} filer`);
  } else {
    const files = await listAllFiles(args);
    console.log(`Files i Pipedrive: ${files.length}`);
    const candidates = files.filter(isCandidate);
    selected = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;
    console.log(`Kandidater: ${candidates.length}, behandlar: ${selected.length}`);
  }

  const manifest =
    args.retryFailures && existingManifest
      ? existingManifest
      : {
          exportedAt: new Date().toISOString(),
          companyDomain: args.companyDomain,
          tenant: 'hair-tp-clinic',
          dryRun: args.dryRun,
          totals: {
            filesListed: 0,
            candidates: 0,
            processed: 0,
            downloaded: 0,
            failed: 0,
            offer: 0,
            agreement: 0,
            other: 0,
          },
          items: [],
          failures: [],
        };

  if (!args.dryRun) {
    await ensureDir(path.join(pdfRoot, 'offer'));
    await ensureDir(path.join(pdfRoot, 'agreement'));
    await ensureDir(path.join(pdfRoot, 'other'));
    await ensureDir(path.dirname(reportPath));
  }

  const itemById = new Map((manifest.items || []).map((item) => [String(item.fileId), item]));
  const failureById = new Map((manifest.failures || []).map((f) => [String(f.fileId), f]));

  for (const seed of selected) {
    manifest.totals.processed += 1;
    const fileId = seed.fileId || seed.id;
    let details = seed;
    const skipDetailsFetch = args.retryFailures && seed.fileName;
    if (!skipDetailsFetch) {
      try {
        const payload = await getFileDetails({ ...args, fileId });
        details = payload.data || seed;
      } catch (error) {
        failureById.set(String(fileId), { fileId, stage: 'details', error: error.message });
        manifest.totals.failed += 1;
        continue;
      }
    }

    const documentKind = classifyDocumentKind(
      details.name || details.file_name,
      details.description
    );
    manifest.totals[documentKind] = (manifest.totals[documentKind] || 0) + 1;

    const item = {
      fileId,
      fileName: details.name || details.file_name || safeFileName(`file-${fileId}.pdf`),
      documentKind,
      dealId: details.deal_id || null,
      personId: details.person_id || null,
      orgId: details.org_id || null,
      fileType: details.file_type || null,
      remoteLocation: details.remote_location || null,
      remoteId: details.remote_id || null,
      addTime: details.add_time || null,
      updateTime: details.update_time || null,
      downloaded: false,
      storageRelativePath: null,
      sha256: null,
      byteSize: null,
    };

    if (args.dryRun) {
      itemById.set(String(fileId), item);
      continue;
    }

    try {
      const downloaded = await downloadFileBuffer({ ...args, fileId });
      if (!downloaded.ok) {
        failureById.set(String(fileId), {
          fileId,
          stage: 'download',
          error: downloaded.error,
          via: downloaded.via,
        });
        manifest.totals.failed += 1;
        itemById.set(String(fileId), item);
        continue;
      }

      const sha256 = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
      const ext = path.extname(safeFileName(item.fileName)) || '.pdf';
      const storageName = `${fileId}-${sha256.slice(0, 8)}${ext}`;
      const storageRelativePath = path.join('pdfs', documentKind, storageName);
      await fsp.writeFile(path.join(outRoot, storageRelativePath), downloaded.buffer);

      item.downloaded = true;
      item.storageRelativePath = storageRelativePath;
      item.sha256 = sha256;
      item.byteSize = downloaded.buffer.length;
      item.downloadVia = downloaded.via;
      manifest.totals.downloaded += 1;
      failureById.delete(String(fileId));
      itemById.set(String(fileId), item);
    } catch (error) {
      failureById.set(String(fileId), { fileId, stage: 'write', error: error.message });
      manifest.totals.failed += 1;
      itemById.set(String(fileId), item);
    }

    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  manifest.items = [...itemById.values()];
  manifest.failures = [...failureById.values()];
  manifest.totals.downloaded = manifest.items.filter((item) => item.downloaded).length;
  manifest.totals.failed = manifest.failures.length;
  if (!args.retryFailures) {
    manifest.totals.candidates = manifest.items.length;
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(manifest.totals, null, 2));
  console.log(`Failures: ${manifest.failures.length}`);

  if (!args.dryRun) {
    await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fsp.writeFile(
      reportPath,
      `${JSON.stringify({ ...manifest.totals, failures: manifest.failures.length, exportedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8'
    );
    console.log(`Manifest: ${manifestPath}`);
  } else {
    console.log('\nDry-run klar — kör med --commit för att skriva PDF:er + manifest.');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
