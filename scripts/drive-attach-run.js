#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
const { getAccessToken, listAllDriveFiles } = require('./migration/lib/googleDriveApi');
const { runCcoDriveAttachPipeline } = require('../src/ops/ccoDriveAttachPipeline');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    commit: false,
    tenantId: process.env.ARCANA_TENANT_ID || 'hair-tp-clinic',
    patientMasterPath:
      process.env.ARCANA_CCO_PATIENT_MASTER_PATH ||
      path.resolve(process.cwd(), 'data', 'cco-patient-master.json'),
    reviewQueuePath:
      process.env.ARCANA_CCO_DRIVE_ATTACH_REVIEW_QUEUE_PATH ||
      path.resolve(process.cwd(), 'data', 'cco-drive-attach-review-queue.json'),
    driveIndexPath: '',
    reportPath: '',
    sampleSize: 5,
    limit: 0,
    requireBookedHairTpPath: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.commit = false;
    else if (flag === '--tenant') args.tenantId = String(argv[++i] || '').trim();
    else if (flag === '--patient-master') args.patientMasterPath = path.resolve(argv[++i]);
    else if (flag === '--review-queue') args.reviewQueuePath = path.resolve(argv[++i]);
    else if (flag === '--drive-index') args.driveIndexPath = path.resolve(argv[++i]);
    else if (flag === '--report') args.reportPath = path.resolve(argv[++i]);
    else if (flag === '--sample') args.sampleSize = Math.max(1, Number(argv[++i]) || 5);
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--allow-outside-booked-path') args.requireBookedHairTpPath = false;
  }
  if (!args.reportPath) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    args.reportPath = path.resolve(process.cwd(), 'data', 'reports', `drive-attach-${ts}.json`);
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function normalizeDriveIndexPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.files)) return payload.files;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

async function loadDriveItems(args) {
  if (args.driveIndexPath) {
    return normalizeDriveIndexPayload(await readJson(args.driveIndexPath));
  }
  const config = loadServiceAccountFromEnv();
  if (!config.ok) {
    throw new Error(
      'Drive-index saknas och Google Drive service account är inte konfigurerat. Ange --drive-index för dry-run med lokal kontrollfil.'
    );
  }
  const accessToken = await getAccessToken(config.serviceAccount);
  return listAllDriveFiles({
    accessToken,
    rootFolderId: config.folderId,
    serviceAccount: config.serviceAccount,
  });
}

function gitValue(command, fallback = '') {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

function buildEvidence() {
  const branch = gitValue('git rev-parse --abbrev-ref HEAD');
  const remote = gitValue('git config --get remote.origin.url');
  return {
    branch,
    prUrl: '',
    remote,
    diffStat: gitValue('git diff --stat HEAD'),
    head: gitValue('git rev-parse --short HEAD'),
  };
}

async function main() {
  const args = parseArgs();
  const driveItems = await loadDriveItems(args);
  const limitedDriveItems = args.limit > 0 ? driveItems.slice(0, args.limit) : driveItems;
  const report = await runCcoDriveAttachPipeline({
    tenantId: args.tenantId,
    patientMasterPath: args.patientMasterPath,
    reviewQueuePath: args.reviewQueuePath,
    driveItems: limitedDriveItems,
    dryRun: !args.commit,
    sampleSize: args.sampleSize,
    requireBookedHairTpPath: args.requireBookedHairTpPath,
  });
  report.evidence = buildEvidence();
  report.input = {
    patientMasterPath: args.patientMasterPath,
    reviewQueuePath: args.reviewQueuePath,
    driveIndexPath: args.driveIndexPath || '',
    driveItems: limitedDriveItems.length,
  };
  await fs.mkdir(path.dirname(args.reportPath), { recursive: true });
  await fs.writeFile(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({ ok: true, reportPath: args.reportPath, stats: report.stats, evidence: report.evidence }, null, 2)}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  loadDriveItems,
  normalizeDriveIndexPayload,
  parseArgs,
};
