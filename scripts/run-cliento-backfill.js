#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const { createCcoCustomerStore } = require('../src/ops/ccoCustomerStore');
const { createCcoMailboxTruthStore } = require('../src/ops/ccoMailboxTruthStore');
const { createCcoMailboxTruthWorklistReadModel } = require('../src/ops/ccoMailboxTruthWorklistReadModel');
const { createCcoMailboxTruthWorklistShadow } = require('../src/ops/ccoMailboxTruthWorklistShadow');

const DEFAULT_CSV_PATH = '/Users/fazlikrasniqi/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/6384E403-C804-4D54-9BBD-61A2E5835A9F/hair-tp-clinic-hair-tp-clinic-customers.csv';
const DEFAULT_TENANT_ID = 'hair-tp-clinic';
const DEFAULT_CUSTOMER_STORE_PATH = path.resolve('./data/cco-customers.json');
const DEFAULT_TRUTH_STORE_PATH = path.resolve('./data/cco-mailbox-truth.json');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase().replace(/^mailto:/, '');
}

function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  out.push(current);
  return out;
}

function parseClientoCsvRows(csvText = '') {
  const raw = String(csvText || '').trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((header) => normalizeText(header));
  const rows = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cols = splitCsvLine(lines[lineIndex]);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = normalizeText(cols[headerIndex] || '');
    });
    rows.push(row);
  }

  return rows;
}

function countBy(items = [], getKey) {
  const counts = {};
  for (const item of items) {
    const key = normalizeText(getKey(item)).toLowerCase();
    if (!key) continue;
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return counts;
}

async function runClientoBackfill({
  csvPath = DEFAULT_CSV_PATH,
  tenantId = DEFAULT_TENANT_ID,
  customerStorePath = DEFAULT_CUSTOMER_STORE_PATH,
  truthStorePath = DEFAULT_TRUTH_STORE_PATH,
  allowEmpty = false,
} = {}) {
  const resolvedCsvPath = path.resolve(String(csvPath || '').trim());
  const resolvedCustomerStorePath = path.resolve(String(customerStorePath || '').trim());
  const resolvedTruthStorePath = path.resolve(String(truthStorePath || '').trim());
  const normalizedTenantId = normalizeText(tenantId) || DEFAULT_TENANT_ID;

  if (!resolvedCsvPath || !fs.existsSync(resolvedCsvPath)) {
    throw new Error(`CSV-filen saknas: ${resolvedCsvPath}`);
  }
  if (!resolvedTruthStorePath || !fs.existsSync(resolvedTruthStorePath)) {
    throw new Error(`Truth-store saknas: ${resolvedTruthStorePath}`);
  }

  const csvText = fs.readFileSync(resolvedCsvPath, 'utf8');
  const csvRows = parseClientoCsvRows(csvText);
  const customerStore = await createCcoCustomerStore({ filePath: resolvedCustomerStorePath });
  const truthStore = await createCcoMailboxTruthStore({ filePath: resolvedTruthStorePath });

  const beforeCustomerState = await customerStore.getTenantCustomerState({ tenantId: normalizedTenantId });
  const truthWorklistBefore = createCcoMailboxTruthWorklistReadModel({
    store: truthStore,
    customerState: beforeCustomerState,
  });
  const activeRows = truthWorklistBefore.listWorklistRows({
    mailboxIds: [],
    includeOutOfScopeDraftReview: false,
  });
  const targetEmails = new Set(
    activeRows.map((row) => normalizeEmail(row.customerEmail)).filter(Boolean)
  );

  const selectedRows = csvRows.filter((row) => targetEmails.has(normalizeEmail(row.Epost)));
  if (!selectedRows.length && !allowEmpty) {
    throw new Error('Inga Cliento-rader matchade truth/worklist-lagret.');
  }

  const beforeCoverageReadout = await customerStore.getTenantCustomerImportCoverageReadout({
    tenantId: normalizedTenantId,
  });

  const commitResult = selectedRows.length
    ? await customerStore.commitTenantCustomerImport({
        tenantId: normalizedTenantId,
        rows: selectedRows,
        fileName: path.basename(resolvedCsvPath),
        sourceSystem: 'cliento',
      })
    : {
        customerState: beforeCustomerState,
        importSummary: {
          format: 'csv',
          fileName: path.basename(resolvedCsvPath),
          totalRows: csvRows.length,
          validRows: 0,
          created: 0,
          updated: 0,
          merged: 0,
          review: 0,
          invalid: 0,
          coverageReadout: beforeCoverageReadout,
        },
        coverageReadout: beforeCoverageReadout,
      };

  const afterCoverageReadout = await customerStore.getTenantCustomerImportCoverageReadout({
    tenantId: normalizedTenantId,
  });
  const afterCustomerState = await customerStore.getTenantCustomerState({ tenantId: normalizedTenantId });
  const truthWorklistAfter = createCcoMailboxTruthWorklistReadModel({
    store: truthStore,
    customerState: afterCustomerState,
  });
  const readModel = truthWorklistAfter.buildReadModel({ mailboxIds: [] });
  const consumerModel = truthWorklistAfter.buildConsumerModel({ mailboxIds: [] });
  const shadowModel = createCcoMailboxTruthWorklistShadow({
    store: truthStore,
    customerState: afterCustomerState,
  }).buildShadowRows({ mailboxIds: [] });

  const shadowIdentityCount = shadowModel.filter((row) => Boolean(
    row.customerIdentity &&
      (row.customerIdentity.canonicalCustomerId ||
        row.customerIdentity.canonicalContactId ||
        row.customerIdentity.explicitMergeGroupId)
  )).length;

  const report = {
    tenantId: normalizedTenantId,
    csvPath: resolvedCsvPath,
    truthStorePath: resolvedTruthStorePath,
    customerStorePath: resolvedCustomerStorePath,
    selectedRowCount: selectedRows.length,
    targetEmailCount: targetEmails.size,
    importSummary: commitResult.importSummary,
    beforeCoverageReadout,
    afterCoverageReadout,
    before: summarizeCustomerState(beforeCustomerState),
    after: summarizeCustomerState(afterCustomerState),
    truth: {
      rowCount: readModel.summary.rowCount,
      identityCount: readModel.summary.identityCount,
      identityCoverage: readModel.summary.identityCoverage,
    },
    consumer: {
      rowCount: consumerModel.summary.rowCount,
      identityCount: consumerModel.summary.identityCount,
      identityCoverage: consumerModel.summary.identityCoverage,
    },
    shadow: {
      shadowCount: shadowModel.length,
      shadowIdentityCount,
      shadowIdentityCoverage: shadowModel.length
        ? Math.round((shadowIdentityCount / shadowModel.length) * 1000) / 10
        : 0,
    },
    sourceCounts: countBy(Object.values(afterCustomerState.identityByKey || {}), (entry) =>
      entry?.customerIdentity?.identitySource || entry?.identitySource || 'unknown'
    ),
  };

  return report;
}

function summarizeCustomerState(customerState = {}) {
  const identities = Object.values(customerState.identityByKey || {});
  const canonicalCount = identities.filter((entry) =>
    Boolean(
      entry?.customerIdentity?.canonicalCustomerId ||
        entry?.customerIdentity?.canonicalContactId ||
        entry?.customerIdentity?.explicitMergeGroupId ||
        entry?.canonicalCustomerId ||
        entry?.canonicalContactId ||
        entry?.explicitMergeGroupId
    )
  ).length;

  return {
    customerCount: Object.keys(customerState.directory || {}).length,
    identityCount: identities.length,
    canonicalCount,
    primaryEmailCount: Object.keys(customerState.primaryEmailByKey || {}).length,
    reviewDecisionCount: Object.keys(customerState.mergeReviewDecisionsByPairId || {}).length,
    sourceCounts: countBy(identities, (entry) => entry?.customerIdentity?.identitySource || entry?.identitySource || 'unknown'),
  };
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const token = process.argv[index];
    if (!token.startsWith('--')) continue;
    const [key, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, 'true');
    }
  }

  const report = await runClientoBackfill({
    csvPath: args.get('csv') || process.env.CLIENTO_BACKFILL_CSV_PATH || DEFAULT_CSV_PATH,
    tenantId: args.get('tenant') || process.env.CLIENTO_BACKFILL_TENANT_ID || DEFAULT_TENANT_ID,
    customerStorePath:
      args.get('customer-store') ||
      process.env.CLIENTO_BACKFILL_CUSTOMER_STORE_PATH ||
      DEFAULT_CUSTOMER_STORE_PATH,
    truthStorePath:
      args.get('truth-store') ||
      process.env.CLIENTO_BACKFILL_TRUTH_STORE_PATH ||
      DEFAULT_TRUTH_STORE_PATH,
    allowEmpty: args.get('allow-empty') === 'true' || process.env.CLIENTO_BACKFILL_ALLOW_EMPTY === 'true',
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  parseClientoCsvRows,
  runClientoBackfill,
};
