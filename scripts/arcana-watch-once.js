#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runCommand(command) {
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
  });
}

function main() {
  runCommand('node ./scripts/report-closure-status.js');
  runCommand('node ./scripts/report-release-readiness.js');

  const closurePath = path.resolve('data/reports/closure-status-latest.json');
  const readinessPath = path.resolve('data/reports/release-readiness-latest.json');
  const closure = safeReadJson(closurePath) || {};
  const readiness = safeReadJson(readinessPath) || {};

  const closureSummary = closure.closure || {};
  const readinessSummary = readiness.readiness || {};
  const remaining = Array.isArray(closureSummary.remaining)
    ? closureSummary.remaining.map((item) => item?.id).filter(Boolean)
    : [];

  process.stdout.write('\n== Arcana Watch Once ==\n');
  process.stdout.write(`closure.done=${closureSummary.done === true ? 'yes' : 'no'}\n`);
  process.stdout.write(
    `closure.remaining=${remaining.length > 0 ? remaining.join(',') : '-'}\n`
  );
  process.stdout.write(
    `readiness.goAllowed=${readinessSummary.goAllowed === true ? 'yes' : 'no'}\n`
  );
  process.stdout.write(`readiness.score=${Number(readinessSummary.score || 0)}\n`);
  process.stdout.write(`closure.report=${closurePath}\n`);
  process.stdout.write(`readiness.report=${readinessPath}\n`);
}

main();

