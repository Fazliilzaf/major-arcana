#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_EXPECTED_REMAINING } = require('../src/ops/closureStatus');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseList(raw = '') {
  return [...new Set(
    String(raw || '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)
  )];
}

function parseArgs(argv) {
  const args = {
    reportFile: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_REPORT_FILE ||
        path.join('data', 'reports', 'closure-status-latest.json')
    ),
    expectedRemaining: normalizeText(
      process.env.ARCANA_EXPECTED_CLOSURE_REMAINING ||
        DEFAULT_EXPECTED_REMAINING.join(',')
    ),
    strictExpectedOnly: parseBoolean(process.env.ARCANA_CLOSURE_GUARD_STRICT_EXPECTED_ONLY, true),
    requireDone: parseBoolean(process.env.ARCANA_CLOSURE_GUARD_REQUIRE_DONE, false),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--report-file') {
      args.reportFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--expected-remaining') {
      args.expectedRemaining = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--allow-subset') {
      args.strictExpectedOnly = false;
      continue;
    }
    if (item === '--require-done') {
      args.requireDone = true;
      continue;
    }
  }
  return args;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = path.resolve(args.reportFile);
  if (!fs.existsSync(reportPath)) {
    console.error('❌ closure status report saknas:', reportPath);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const remaining = Array.isArray(report?.closure?.remaining)
    ? report.closure.remaining.map((item) => normalizeText(item?.id)).filter(Boolean)
    : [];
  const expected = parseList(args.expectedRemaining);
  const expectedSet = new Set(expected);

  const unexpected = remaining.filter((id) => !expectedSet.has(id));
  const missingExpected = expected.filter((id) => !remaining.includes(id));
  const done = report?.closure?.done === true;

  process.stdout.write('== Closure Status Guard ==\n');
  process.stdout.write(`report: ${reportPath}\n`);
  process.stdout.write(`done: ${done ? 'yes' : 'no'}\n`);
  process.stdout.write(`remaining: ${remaining.join(',') || '-'}\n`);
  process.stdout.write(`expectedRemaining: ${expected.join(',') || '-'}\n`);
  process.stdout.write(`unexpectedRemaining: ${unexpected.join(',') || '-'}\n`);
  process.stdout.write(`resolvedExpected: ${missingExpected.join(',') || '-'}\n`);

  if (unexpected.length > 0) {
    console.error('❌ Oväntade blockerare i closure-status.');
    process.exitCode = 1;
    return;
  }

  if (args.strictExpectedOnly && missingExpected.length > 0) {
    process.stdout.write(
      'ℹ️ Vissa förväntade blockerare är nu lösta. Uppdatera expected-listan om detta är avsiktligt.\n'
    );
  }

  if (args.requireDone && done !== true) {
    console.error('❌ Closure-status är inte komplett (done=no).');
    process.exitCode = 2;
  }
}

run();
