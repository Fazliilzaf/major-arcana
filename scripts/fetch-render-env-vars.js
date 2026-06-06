#!/usr/bin/env node
'use strict';

/**
 * Paginerad GET av alla Render env-vars (stdout: JSON array).
 * Används av restore-render-env-from-blueprint.sh och CI verify.
 */
const { resolveRenderApiKey, fetchAllRenderEnvRows } = require('./lib/renderEnvApi.js');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    serviceId: process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng',
    json: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--service-id' && argv[i + 1]) {
      opts.serviceId = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--count') {
      opts.countOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: node scripts/fetch-render-env-vars.js [--service-id ID] [--json|--count]`
      );
      process.exit(0);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fail('Saknar Render API-nyckel (RENDER_API_KEY eller ~/.render/cli.yaml)');

  const rows = await fetchAllRenderEnvRows(opts.serviceId, apiKey);
  if (opts.countOnly) {
    process.stdout.write(String(rows.length));
    return;
  }
  process.stdout.write(JSON.stringify(rows));
}

main().catch((err) => fail(err.message || String(err)));
