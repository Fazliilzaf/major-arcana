#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const {
  resolveMeridiqCredentials,
  verifyMeridiqAccess,
  listClients,
  normalizeMeridiqClient,
} = require('./lib/meridiqApi');

function parseArgs(argv) {
  const args = { json: false };
  for (const raw of argv.slice(2)) {
    if (raw === '--json') args.json = true;
    else if (raw.startsWith('--cookie-file=')) args.cookieFile = raw.split('=')[1];
    else if (raw.startsWith('--meridiq-api-token=')) args.apiToken = raw.split('=')[1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const creds = resolveMeridiqCredentials(args);
  const report = {
    ok: false,
    authMode: creds.authMode || null,
    missing: creds.missing || [],
    questionarySample: null,
    clientSampleCount: 0,
  };

  if (!creds.ok) {
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('Meridiq API preflight — FAIL');
      console.log('Saknas:', creds.missing.join(', '));
      console.log('');
      console.log('Sätt i .env (utanför GitHub):');
      console.log('  ARCANA_MERIDIQ_COOKIE="<exporterad Cookie-header från app.meridiq.com>"');
      console.log('  # eller');
      console.log('  ARCANA_MERIDIQ_COOKIE_FILE=/path/meridiq-cookies.txt');
      console.log('');
      console.log(
        'Hämta cookie: logga in i Meridiq → DevTools → Network → api.meridiq.com → Copy Cookie header.'
      );
    }
    process.exit(1);
  }

  try {
    report.questionarySample = await verifyMeridiqAccess(creds);
    const clients = await listClients(creds, { perPage: 1 });
    report.clientSampleCount = clients.length;
    report.ok = true;
    report.authMode = creds.authMode;

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log('Meridiq API preflight — PASS');
    console.log('Auth:', creds.authMode);
    console.log('Questionary sample:', report.questionarySample.sampleCount, 'post(er)');
    console.log('Client list reachable: ja');
    if (clients[0]) {
      const sample = normalizeMeridiqClient(clients[0]);
      console.log('Client sample id present:', Boolean(sample.meridiqClientId));
    }
    console.log('');
    console.log('Nästa:');
    console.log('  node scripts/migration/sync-meridiq-client-ids.js --dry-run');
    console.log('  node scripts/import-meridiq-historical-journals.js --limit=5');
  } catch (error) {
    report.error = error.message;
    report.status = error.status || null;
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error('Meridiq API preflight — FAIL');
      console.error(error.message);
      if (error.authError) {
        console.error(
          'Cookie/token ogiltig eller utgången — exportera ny session från app.meridiq.com.'
        );
      }
    }
    process.exit(2);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[meridiq-preflight] FATAL:', error.message);
    process.exit(1);
  });
}
