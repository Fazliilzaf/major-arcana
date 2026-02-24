#!/usr/bin/env node
require('dotenv').config();

const { config } = require('../src/config');
const { listSchedulerPilotReports } = require('../src/ops/pilotReports');

function parseLimit(argv) {
  const idx = argv.findIndex((item) => item === '--limit');
  if (idx === -1) return 20;
  const value = argv[idx + 1];
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(200, parsed));
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const reports = await listSchedulerPilotReports({
    reportsDir: config.reportsDir,
    limit,
  });

  process.stdout.write(`ReportsDir: ${config.reportsDir}\n`);
  process.stdout.write(`Count: ${reports.length}\n`);
  if (!reports.length) return;

  for (const report of reports) {
    process.stdout.write(
      `- ${report.fileName} | ${report.mtime} | ${report.sizeBytes} bytes\n`
    );
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte lista scheduler-rapporter');
  console.error(error?.message || error);
  process.exit(1);
});
