#!/usr/bin/env node
'use strict';

/**
 * CLI wrapper for mailbox-truth restore on prod disk.
 *
 * Prefer ops API after deploy:
 *   GET  /api/v1/ops/mailbox-truth/restore/inspect
 *   POST /api/v1/ops/mailbox-truth/restore
 */

const { config } = require('../src/config');
const {
  inspectMailboxTruthLayout,
  restoreMailboxTruthShards,
} = require('../src/ops/ccoMailboxTruthRestore');

function parseArgs(argv = []) {
  const args = new Set(argv);
  const restoreRaw =
    argv.find((item) => item.startsWith('--restore='))?.slice('--restore='.length) ||
    (argv.includes('--restore') ? argv[argv.indexOf('--restore') + 1] : '');
  return {
    apply: args.has('--apply'),
    restoreMailboxes: String(restoreRaw || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    backupPath: argv.find((item) => item.startsWith('--backup='))?.slice('--backup='.length) || '',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const layout = await inspectMailboxTruthLayout(config);
  console.log(JSON.stringify(layout, null, 2));

  if (options.restoreMailboxes.length > 0 || options.apply) {
    const result = await restoreMailboxTruthShards({
      config,
      backupPath: options.backupPath,
      mailboxIds: options.restoreMailboxes,
      apply: options.apply,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.restartRequired) {
      console.log('Restart Render-instansen så att shard-cache laddas om.');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
