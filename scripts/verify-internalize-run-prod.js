#!/usr/bin/env node
'use strict';

/**
 * Read-only QA för internalize-run på prod.
 * - Run-nivå via asset-qa snapshot
 * - Asset-upptäckt via /api/v1/cco/patients/:patientId/assets (importRunId)
 * - Bundle-upptäckbarhet via /api/v1/cco-patient-master/patient (driveFiles)
 * - Download-probe per asset (CCO storage, ingen Drive-länk)
 *
 * Scan (default = hasFiles, rekommenderad full discovery-scan):
 *   hasFiles  — patient master-rader med fil-signaler (default)
 *   all       — varje patient master-rad (--all-patients, långsam)
 *
 * Reliability: retry på 429/5xx, token-refresh på 401, errorrapport i JSON.
 * Scriptet ska inte ensam gate:a nästa batch om scanReliability.unreliable=true.
 *
 * Usage (läsbar rapport):
 *   npm run verify:internalize-run-prod -- \
 *     --run-id b8364d5d-47dd-4e14-8212-fb0bc1a09152 \
 *     --commit-report /tmp/pilot-1319.json
 *
 * Usage (ren JSON — kör node direkt, inte npm run, annars förorenas stdout):
 *   node scripts/verify-internalize-run-prod.js \
 *     --run-id b8364d5d-47dd-4e14-8212-fb0bc1a09152 \
 *     --commit-report /tmp/pilot-1319.json \
 *     --json > /tmp/verify-b8364d5d.json
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const TENANT = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 750;

const SCAN_MODES = {
  hasFiles: {
    id: 'hasFiles',
    label: 'hasFiles (default)',
    description:
      'Patient master-rader med fileSummary/driveLinked/hasImages/hasJournalHistory — rekommenderad discovery-scan.',
  },
  all: {
    id: 'all',
    label: 'all',
    description: 'Varje patient master-rad — långsam, exhaustiv fallback om hasFiles missar rader.',
  },
};

const ALIAS_HEURISTIC_NOTE =
  'asset.patientId=cliento_* och bundle.cliento=null; upptäckt via collectAssetStoreAliases/heuristik (namn/pnr i Drive-sökväg). Inte import-fail.';

function parseArgs(argv) {
  const args = {
    runId: '',
    expectedCount: 10,
    commitReport: '',
    concurrency: 12,
    pageSize: 200,
    json: false,
    scanMode: 'hasFiles',
    maxRetries: DEFAULT_MAX_RETRIES,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--run-id') args.runId = String(argv[++i] || '').trim();
    else if (flag === '--expected-count') args.expectedCount = Math.max(1, Number(argv[++i]) || 10);
    else if (flag === '--commit-report') args.commitReport = String(argv[++i] || '').trim();
    else if (flag === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i]) || 12);
    else if (flag === '--max-retries')
      args.maxRetries = Math.max(1, Number(argv[++i]) || DEFAULT_MAX_RETRIES);
    else if (flag === '--all-patients') args.scanMode = 'all';
    else if (flag === '--scan-mode') {
      const mode = String(argv[++i] || '').trim();
      if (!SCAN_MODES[mode]) fail(`okänd --scan-mode: ${mode} (hasFiles|all)`);
      args.scanMode = mode;
    } else if (flag === '--json') args.json = true;
    else if (flag === '--help' || flag === '-h') {
      console.log(`Usage: node scripts/verify-internalize-run-prod.js --run-id UUID [options]

Options:
  --run-id UUID           Import-run att granska (krävs)
  --expected-count N      Förväntat antal assets (default 10)
  --commit-report PATH    Valfri commit-JSON för run-nivå-jämförelse
  --concurrency N         Parallella patient-anrop (default 12)
  --max-retries N         Retry för 429/5xx/nätverk (default 3)
  --scan-mode MODE        hasFiles (default) | all
  --all-patients          Alias för --scan-mode all
  --json                  Skriv rapport-JSON till stdout (använd node direkt, inte npm run)
`);
      process.exit(0);
    }
  }
  if (!args.runId) {
    console.error('❌ --run-id krävs');
    process.exit(1);
  }
  return args;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchOwnerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || 'owner token misslyckades');
  }
  const token = (result.stdout || '').trim();
  if (!token) fail('tom owner-token');
  return token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-arcana-client': 'major_arcana_admin',
    'x-cco-tenant': TENANT,
  };
}

function createScanErrorLog() {
  return {
    patientList: [],
    assetApi: [],
    bundleApi: [],
    downloadApi: [],
    tokenRefresh: [],
    network: [],
  };
}

function isRetryableHttpStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function createApiClient({ getToken, errorLog, maxRetries = DEFAULT_MAX_RETRIES } = {}) {
  let token = getToken();
  let tokenRefreshes = 0;
  let retriedRequests = 0;

  async function refreshToken(reason) {
    token = getToken();
    tokenRefreshes += 1;
    errorLog.tokenRefresh.push({
      reason,
      count: tokenRefreshes,
      at: new Date().toISOString(),
    });
  }

  async function request(path, opts = {}, meta = {}) {
    const { attempt = 1, allowAuthRefresh = true } = meta;
    let res;
    let body = {};
    try {
      res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: { ...headers(token), ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      const entry = {
        path,
        attempt,
        error: err.message || String(err),
        kind: meta.kind || 'request',
      };
      errorLog.network.push(entry);
      if (attempt < maxRetries) {
        retriedRequests += 1;
        await sleep(DEFAULT_RETRY_BASE_MS * attempt);
        return request(path, opts, { ...meta, attempt: attempt + 1, allowAuthRefresh });
      }
      return { status: 0, body: {}, ok: false, error: entry.error };
    }

    if (res.status === 401 && allowAuthRefresh) {
      await refreshToken('http_401');
      return request(path, opts, { ...meta, attempt, allowAuthRefresh: false });
    }

    if (isRetryableHttpStatus(res.status) && attempt < maxRetries) {
      retriedRequests += 1;
      const retryAfter = Number(res.headers.get('retry-after') || 0);
      await sleep(Math.max(DEFAULT_RETRY_BASE_MS * attempt, retryAfter * 1000));
      return request(path, opts, { ...meta, attempt: attempt + 1, allowAuthRefresh });
    }

    return { status: res.status, body, ok: res.ok };
  }

  async function fetchBinary(path, meta = {}) {
    const { attempt = 1, allowAuthRefresh = true } = meta;
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: 'GET',
        headers: headers(token),
      });
      if (res.status === 401 && allowAuthRefresh) {
        await refreshToken('download_401');
        return fetchBinary(path, { ...meta, attempt, allowAuthRefresh: false });
      }
      if (isRetryableHttpStatus(res.status) && attempt < maxRetries) {
        retriedRequests += 1;
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        await sleep(Math.max(DEFAULT_RETRY_BASE_MS * attempt, retryAfter * 1000));
        return fetchBinary(path, { ...meta, attempt: attempt + 1, allowAuthRefresh });
      }
      return res;
    } catch (err) {
      const entry = {
        path,
        attempt,
        error: err.message || String(err),
        kind: meta.kind || 'downloadApi',
      };
      errorLog.network.push(entry);
      if (attempt < maxRetries) {
        retriedRequests += 1;
        await sleep(DEFAULT_RETRY_BASE_MS * attempt);
        return fetchBinary(path, { ...meta, attempt: attempt + 1, allowAuthRefresh });
      }
      return null;
    }
  }

  return {
    request,
    fetchBinary,
    getToken: () => token,
    stats: () => ({ tokenRefreshes, retriedRequests }),
  };
}

function recordHttpError(errorLog, bucket, entry) {
  const list = errorLog[bucket];
  if (!Array.isArray(list)) return;
  if (list.length >= 50) return;
  list.push(entry);
}

function summarizeScanReliability({
  errorLog,
  apiStats,
  discoveryPass,
  runPass,
  expectedCount,
  assetsFound,
}) {
  const totalErrors =
    errorLog.patientList.length +
    errorLog.assetApi.length +
    errorLog.bundleApi.length +
    errorLog.downloadApi.length +
    errorLog.network.length;
  const unreliable = totalErrors > 0 && runPass && !discoveryPass && assetsFound < expectedCount;
  return {
    unreliable,
    authoritativeForNextBatch: !unreliable && discoveryPass,
    note: unreliable
      ? 'Scan hade HTTP/nätverksfel — använd inte som ensam gate för nästa batch. Verifiera med direkta patient-API-anrop eller kör om.'
      : 'Scan utan blockerande fel.',
    totalErrors,
    tokenRefreshes: apiStats.tokenRefreshes,
    retriedRequests: apiStats.retriedRequests,
    errors: {
      patientList: errorLog.patientList.length,
      assetApi: errorLog.assetApi.length,
      bundleApi: errorLog.bundleApi.length,
      downloadApi: errorLog.downloadApi.length,
      network: errorLog.network.length,
      tokenRefresh: errorLog.tokenRefresh.length,
    },
    samples: {
      patientList: errorLog.patientList.slice(0, 5),
      assetApi: errorLog.assetApi.slice(0, 5),
      bundleApi: errorLog.bundleApi.slice(0, 5),
      downloadApi: errorLog.downloadApi.slice(0, 5),
      network: errorLog.network.slice(0, 5),
      tokenRefresh: errorLog.tokenRefresh.slice(0, 5),
    },
  };
}

function importedDuringRun(importedAt, runRecord) {
  if (!importedAt || !runRecord?.startedAt) return false;
  const ts = Date.parse(importedAt);
  const start = Date.parse(runRecord.startedAt);
  const end = Date.parse(runRecord.finishedAt || runRecord.startedAt) + 120_000;
  return Number.isFinite(ts) && ts >= start - 1000 && ts <= end;
}

function resolvePatientId(patient = {}) {
  return String(patient.patientId || patient.id || '').trim();
}

function patientHasFileSignals(patient = {}) {
  const summary = patient.fileSummary || {};
  return (
    Number(summary.totalFiles) > 0 ||
    patient.driveLinked === true ||
    patient.hasImages === true ||
    patient.hasJournalHistory === true
  );
}

function isCcoViewUrl(url = '') {
  const text = String(url || '');
  if (!text) return false;
  if (text.includes('drive.google.com')) return false;
  return text.startsWith('/api/v1/cco/assets/');
}

function isClientoPatientId(id = '') {
  return String(id || '').startsWith('cliento_');
}

function maskClientoPatientId(id = '') {
  const text = String(id || '');
  if (!isClientoPatientId(text)) return text || null;
  return `cliento_...${text.slice(-4)}`;
}

function buildScanDescriptor(args) {
  const mode = SCAN_MODES[args.scanMode] || SCAN_MODES.hasFiles;
  return {
    mode: mode.id,
    label: mode.label,
    description: mode.description,
    limited: mode.id !== 'all',
  };
}

function shouldScanPatient(patient, scanMode) {
  if (scanMode === 'all') return true;
  return patientHasFileSignals(patient);
}

function evaluateAliasGap({
  pmPatientId,
  assetPatientId,
  clientoSourceId,
  clientoCanonical,
  discoveredViaAssetsApi = false,
  inBundle = false,
} = {}) {
  const bundleClientoPresent = Boolean(clientoSourceId || clientoCanonical);
  const clientoAssetId = isClientoPatientId(assetPatientId);
  const pmAssetMismatch = Boolean(pmPatientId && assetPatientId && pmPatientId !== assetPatientId);
  const heuristicDiscovery =
    clientoAssetId &&
    !bundleClientoPresent &&
    pmAssetMismatch &&
    (discoveredViaAssetsApi || inBundle);

  let classification = 'linked';
  if (heuristicDiscovery) classification = 'known_alias_heuristic';
  else if (clientoAssetId && !bundleClientoPresent)
    classification = 'cliento_asset_without_bundle_link';

  return {
    clientoAssetId,
    bundleClientoPresent,
    pmAssetMismatch,
    heuristicDiscovery,
    classification,
    importFail: false,
    discoveryPath: heuristicDiscovery ? 'collectAssetStoreAliases/heuristik' : null,
  };
}

function summarizeAliasHeuristic(assets = []) {
  const gaps = assets.filter((asset) => asset.aliasGap?.heuristicDiscovery);
  const allKnown =
    gaps.length > 0 &&
    gaps.every((asset) => asset.aliasGap.classification === 'known_alias_heuristic');
  return {
    knownPattern: allKnown,
    count: gaps.length,
    importFail: false,
    note: ALIAS_HEURISTIC_NOTE,
    assets: gaps.map((asset) => ({
      assetId: asset.assetId,
      pmPatientId: asset.patientId,
      assetPatientId: maskClientoPatientId(asset.assetPatientId),
      bundleClientoPresent: asset.aliasGap.bundleClientoPresent,
      classification: asset.aliasGap.classification,
      discoveryPath: asset.aliasGap.discoveryPath,
    })),
  };
}

function classifyOverallStatus({
  runPass,
  discoveryPass,
  bundlePass,
  downloadPass,
  noDriveLinks,
  assetsFound,
  expectedCount,
  aliasHeuristic,
  scanReliability,
}) {
  if (scanReliability?.unreliable) return 'UNRELIABLE';

  const fullPass = runPass && discoveryPass && bundlePass && downloadPass && noDriveLinks;
  if (fullPass) return 'PASS';

  if (runPass && discoveryPass && aliasHeuristic.count > 0 && aliasHeuristic.knownPattern) {
    return bundlePass && downloadPass && noDriveLinks ? 'PASS' : 'PARTIAL';
  }

  if (runPass && assetsFound >= expectedCount - 1) return 'PARTIAL';
  if (runPass) return 'PARTIAL';
  return 'FAIL';
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker));
  return results;
}

function matchesRunAsset(item, runId, runRecord) {
  if (item.importRunId === runId) return 'importRunId';
  if (
    item.status === 'VISIBLE_ON_PATIENT_CARD' &&
    String(item.sourceSystem || '').includes('drive') &&
    importedDuringRun(item.importedAt, runRecord)
  ) {
    return 'importedAtWindow';
  }
  return null;
}

async function collectAssetsForRun(client, runId, runRecord, args, errorLog) {
  const scan = buildScanDescriptor(args);
  const first = await client.request(
    '/api/v1/cco-patient-master/patients?limit=1&offset=0',
    {},
    {
      kind: 'patientList',
    }
  );
  if (!first.ok) {
    recordHttpError(errorLog, 'patientList', {
      page: 0,
      status: first.status,
      error: first.error || null,
    });
    fail(`patient list ${first.status || first.error || 'failed'}`);
  }
  const total = Number(first.body.total) || 0;
  const pages = Math.ceil(total / args.pageSize);
  const candidates = [];

  for (let page = 0; page < pages; page += 1) {
    const list = await client.request(
      `/api/v1/cco-patient-master/patients?limit=${args.pageSize}&offset=${page * args.pageSize}`,
      {},
      { kind: 'patientList' }
    );
    if (!list.ok) {
      recordHttpError(errorLog, 'patientList', {
        page,
        status: list.status,
        error: list.error || null,
      });
      fail(`patient list page ${page}: ${list.status || list.error || 'failed'}`);
    }
    for (const patient of list.body.patients || []) {
      const patientId = resolvePatientId(patient);
      if (!patientId) continue;
      if (!shouldScanPatient(patient, args.scanMode)) continue;
      candidates.push({ patientId, displayName: patient.displayName || '' });
    }
    if ((page + 1) % 5 === 0 || page + 1 === pages) {
      process.stderr.write(
        `scan list ${page + 1}/${pages} mode=${scan.mode} candidates ${candidates.length}\n`
      );
    }
  }

  const byAssetId = new Map();
  await mapPool(candidates, args.concurrency, async (candidate) => {
    const assets = await client.request(
      `/api/v1/cco/patients/${encodeURIComponent(candidate.patientId)}/assets`,
      {},
      { kind: 'assetApi' }
    );
    if (!assets.ok) {
      recordHttpError(errorLog, 'assetApi', {
        patientId: candidate.patientId,
        status: assets.status,
        error: assets.error || null,
      });
      return;
    }
    for (const item of assets.body.items || []) {
      const matchKind = matchesRunAsset(item, runId, runRecord);
      if (!matchKind) continue;
      if (byAssetId.has(item.id)) continue;
      byAssetId.set(item.id, {
        assetId: item.id,
        patientId: candidate.patientId,
        assetPatientId: item.patientId || null,
        displayName: candidate.displayName,
        status: item.status,
        documentDate: item.documentDate || null,
        encounterId: item.encounterId || null,
        importRunId: item.importRunId || null,
        importedAt: item.importedAt || null,
        sourceSystem: item.sourceSystem || null,
        viewUrl: item.viewUrl || '',
        mimeType: item.mimeType || null,
        fileSize: item.fileSize || null,
        discovery: { assetsApi: true, matchKind },
      });
    }
  });

  return {
    scan,
    totalPatients: total,
    candidatesScanned: candidates.length,
    found: [...byAssetId.values()],
  };
}

async function verifyBundleDiscoverability(client, assets, errorLog) {
  const byPatient = new Map();
  for (const asset of assets) {
    if (!byPatient.has(asset.patientId)) byPatient.set(asset.patientId, []);
    byPatient.get(asset.patientId).push(asset);
  }

  for (const [patientId, patientAssets] of byPatient.entries()) {
    const bundle = await client.request(
      `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}&includeDriveFiles=1`,
      {},
      { kind: 'bundleApi' }
    );
    if (!bundle.ok) {
      recordHttpError(errorLog, 'bundleApi', {
        patientId,
        status: bundle.status,
        error: bundle.error || null,
      });
    }
    const patient = bundle.ok ? bundle.body.patient || {} : {};
    const cliento = patient.cliento || {};
    const driveFiles = bundle.ok ? bundle.body.driveFiles || [] : [];
    for (const asset of patientAssets) {
      const match = driveFiles.find(
        (file) =>
          String(file.id || file.assetId || '') === asset.assetId ||
          String(file.assetId || '') === asset.assetId
      );
      asset.bundle = {
        ok: Boolean(match),
        viewUrl: match?.viewUrl || null,
        source: match?.source || null,
        ccoViewUrl: isCcoViewUrl(match?.viewUrl),
        clientoSourceId: cliento.sourceId || null,
        clientoCanonical: cliento.canonicalCustomerId || null,
      };
      asset.discovery.bundleApi = Boolean(match);
      asset.discovery.bundleCcoViewUrl = isCcoViewUrl(match?.viewUrl);
      asset.aliasGap = evaluateAliasGap({
        pmPatientId: asset.patientId,
        assetPatientId: asset.assetPatientId,
        clientoSourceId: cliento.sourceId,
        clientoCanonical: cliento.canonicalCustomerId,
        discoveredViaAssetsApi: asset.discovery.assetsApi,
        inBundle: Boolean(match),
      });
    }
  }
}

async function verifyDownloads(client, assets, errorLog) {
  for (const asset of assets) {
    const path = `/api/v1/cco/assets/${encodeURIComponent(asset.assetId)}/download?inline=1`;
    const res = await client.fetchBinary(path, { kind: 'downloadApi' });
    if (!res) {
      recordHttpError(errorLog, 'downloadApi', {
        assetId: asset.assetId,
        status: 0,
        error: 'download_fetch_failed',
      });
      asset.download = { httpStatus: 0, contentLength: 0, contentType: '', ok: false };
      continue;
    }

    const headerLength = Number(res.headers.get('content-length') || 0);
    const contentLength = headerLength || Number(asset.fileSize) || 0;
    try {
      if (res.body?.cancel) await res.body.cancel();
      else if (res.body?.destroy) res.body.destroy();
    } catch {
      /* ignore stream teardown errors */
    }
    const okStatus = res.status === 200 || res.status === 206;
    asset.download = {
      httpStatus: res.status,
      contentLength,
      contentType: res.headers.get('content-type') || '',
      ok: okStatus && contentLength > 0,
    };
    if (!asset.download.ok) {
      recordHttpError(errorLog, 'downloadApi', {
        assetId: asset.assetId,
        status: res.status,
        error: 'download_probe_failed',
      });
    }
  }
}

function loadCommitReport(path) {
  if (!path || !fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function buildReport({ args, runRecord, scanResult, assets, scanReliability }) {
  const runPass =
    runRecord &&
    runRecord.totalImported === args.expectedCount &&
    runRecord.totalVerified === args.expectedCount &&
    runRecord.totalFailed === 0 &&
    runRecord.totalLinkOnlyBlockers === 0;

  const importRunIdMatches = assets.filter((a) => a.discovery?.matchKind === 'importRunId').length;
  const discoveryPass =
    assets.length === args.expectedCount &&
    assets.every((a) => a.discovery?.assetsApi && a.status === 'VISIBLE_ON_PATIENT_CARD');

  const bundlePass =
    assets.length === args.expectedCount &&
    assets.every((a) => a.discovery?.bundleApi && a.discovery?.bundleCcoViewUrl);

  const downloadPass =
    assets.length === args.expectedCount &&
    assets.every((a) => a.download?.ok && isCcoViewUrl(a.viewUrl));

  const noDriveLinks =
    assets.length === args.expectedCount &&
    assets.every(
      (a) =>
        isCcoViewUrl(a.viewUrl) &&
        isCcoViewUrl(a.bundle?.viewUrl) &&
        a.status !== 'LINK_ONLY_BLOCKER'
    );

  const aliasHeuristic = summarizeAliasHeuristic(assets);
  const overallStatus = classifyOverallStatus({
    runPass,
    discoveryPass,
    bundlePass,
    downloadPass,
    noDriveLinks,
    assetsFound: assets.length,
    expectedCount: args.expectedCount,
    aliasHeuristic,
    scanReliability,
  });

  const discoveryNote = scanReliability.unreliable
    ? scanReliability.note
    : assets.length < args.expectedCount && scanResult.scan.limited
      ? 'Färre träffar än expectedCount — prova --scan-mode all. Detta är inte import-fail om run-nivå är PASS.'
      : 'assets API exponerar importRunId men inte treatmentType/sessionNumber; använd commit-report för behandlingsfält.';

  return {
    generatedAt: new Date().toISOString(),
    base: BASE,
    runId: args.runId,
    expectedCount: args.expectedCount,
    zeroWrites: true,
    scan: scanResult.scan,
    scanReliability,
    runLevel: {
      pass: runPass,
      record: runRecord || null,
    },
    discovery: {
      pass: discoveryPass,
      patientsTotal: scanResult.totalPatients,
      candidatesScanned: scanResult.candidatesScanned,
      assetsFound: assets.length,
      importRunIdMatches,
      notImportFail: runPass && !discoveryPass,
      note: discoveryNote,
    },
    aliasHeuristic,
    bundle: {
      pass: bundlePass,
      api: '/api/v1/cco-patient-master/patient?includeDriveFiles=1',
    },
    download: {
      pass: downloadPass,
      method: 'GET /api/v1/cco/assets/:id/download?inline=1 (headers only, stream cancelled)',
    },
    noDriveLinks: {
      pass: noDriveLinks,
    },
    overallPass: overallStatus === 'PASS',
    overallStatus,
    assets: assets.map((a) => ({
      assetId: a.assetId,
      patientId: a.patientId,
      assetPatientId: maskClientoPatientId(a.assetPatientId),
      displayName: a.displayName,
      status: a.status,
      documentDate: a.documentDate,
      encounterId: a.encounterId,
      viewUrl: a.viewUrl,
      bundleViewUrl: a.bundle?.viewUrl || null,
      aliasClassification: a.aliasGap?.classification || null,
      downloadOk: a.download?.ok || false,
      downloadBytes: a.download?.contentLength || 0,
    })),
  };
}

function resolveExitCode(report) {
  if (report.overallPass) return 0;
  if (report.overallStatus === 'PARTIAL') return 0;
  if (report.overallStatus === 'UNRELIABLE') return 2;
  return 1;
}

async function main() {
  const args = parseArgs(process.argv);
  const errorLog = createScanErrorLog();
  const client = createApiClient({
    getToken: fetchOwnerToken,
    errorLog,
    maxRetries: args.maxRetries,
  });

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch((err) => {
      recordHttpError(errorLog, 'network', { path: '/readyz', error: err.message || String(err) });
      return {};
    });
  if (ready.ready !== true) fail('readyz not ready');

  const snapshot = await client.request(
    '/api/v1/cco/asset-qa/snapshot?tenantId=hair_tp',
    {},
    {
      kind: 'snapshot',
    }
  );
  if (!snapshot.ok) fail(`asset-qa snapshot ${snapshot.status || snapshot.error || 'failed'}`);
  const runRecord = (snapshot.body.recentRuns || []).find((run) => run.id === args.runId) || null;

  const commitReport = loadCommitReport(args.commitReport);
  const scanResult = await collectAssetsForRun(client, args.runId, runRecord, args, errorLog);
  const assets = scanResult.found.sort((a, b) =>
    String(a.documentDate || '').localeCompare(String(b.documentDate || ''))
  );

  await verifyBundleDiscoverability(client, assets, errorLog);
  await verifyDownloads(client, assets, errorLog);

  const runPass =
    runRecord &&
    runRecord.totalImported === args.expectedCount &&
    runRecord.totalVerified === args.expectedCount &&
    runRecord.totalFailed === 0 &&
    runRecord.totalLinkOnlyBlockers === 0;
  const discoveryPass =
    assets.length === args.expectedCount &&
    assets.every((a) => a.discovery?.assetsApi && a.status === 'VISIBLE_ON_PATIENT_CARD');

  const scanReliability = summarizeScanReliability({
    errorLog,
    apiStats: client.stats(),
    discoveryPass,
    runPass,
    expectedCount: args.expectedCount,
    assetsFound: assets.length,
  });

  const report = buildReport({ args, runRecord, scanResult, assets, scanReliability });
  if (commitReport?.report?.stats) {
    report.commitReport = {
      imported: commitReport.report.stats.imported,
      failed: commitReport.report.stats.failed,
      sampleCount: commitReport.report.samples?.length || 0,
    };
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log('✅ verify-internalize-run (read-only)');
    console.log(`   runId: ${args.runId}`);
    console.log(`   scan: ${report.scan.mode} · ${report.scan.description}`);
    console.log(
      `   run-level: ${report.runLevel.pass ? 'PASS' : 'FAIL'} · imported=${runRecord?.totalImported ?? '—'} verified=${runRecord?.totalVerified ?? '—'}`
    );
    console.log(
      `   discovery: ${report.discovery.pass ? 'PASS' : 'FAIL'} · assetsFound=${report.discovery.assetsFound}/${args.expectedCount} · importRunId=${report.discovery.importRunIdMatches} · scanned=${report.discovery.candidatesScanned}/${report.discovery.patientsTotal}${report.discovery.notImportFail ? ' · notImportFail' : ''}`
    );
    console.log(
      `   scanReliability: ${report.scanReliability.unreliable ? 'UNRELIABLE' : 'OK'} · errors=${report.scanReliability.totalErrors} · retries=${report.scanReliability.retriedRequests} · tokenRefresh=${report.scanReliability.tokenRefreshes}`
    );
    console.log(
      `   aliasHeuristic: ${report.aliasHeuristic.count} known · importFail=${report.aliasHeuristic.importFail}`
    );
    console.log(`   bundle: ${report.bundle.pass ? 'PASS' : 'FAIL'} · ${report.bundle.api}`);
    console.log(
      `   download: ${report.download.pass ? 'PASS' : 'FAIL'} · ${report.download.method}`
    );
    console.log(`   noDriveLinks: ${report.noDriveLinks.pass ? 'PASS' : 'FAIL'}`);
    console.log(
      `   overall: ${report.overallStatus}${report.overallPass ? '' : report.overallStatus === 'UNRELIABLE' ? ' (not authoritative for next batch)' : ' (run-level remains authoritative)'}`
    );
    for (const asset of report.assets) {
      console.log(
        `     · ${asset.documentDate || '—'} · ${asset.status} · alias=${asset.aliasClassification || '—'} · bundle=${asset.bundleViewUrl ? 'CCO' : 'MISSING'} · dl=${asset.downloadOk ? asset.downloadBytes + 'B' : 'FAIL'}`
      );
    }
  }

  process.exit(resolveExitCode(report));
}

module.exports = {
  ALIAS_HEURISTIC_NOTE,
  SCAN_MODES,
  buildScanDescriptor,
  classifyOverallStatus,
  createScanErrorLog,
  evaluateAliasGap,
  isClientoPatientId,
  isCcoViewUrl,
  isRetryableHttpStatus,
  maskClientoPatientId,
  patientHasFileSignals,
  resolveExitCode,
  resolvePatientId,
  shouldScanPatient,
  summarizeAliasHeuristic,
  summarizeScanReliability,
};

if (require.main === module) {
  main().catch((err) => fail(err.message || String(err)));
}
