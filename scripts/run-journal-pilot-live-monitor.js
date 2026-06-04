#!/usr/bin/env node
'use strict';

/**
 * run-journal-pilot-live-monitor.js — read-only Journal Pilot Live Monitor
 *
 *   node scripts/run-journal-pilot-live-monitor.js
 *   CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com node scripts/run-journal-pilot-live-monitor.js
 */

const {
  collectJournalPilotLiveMonitor,
  publishJournalPilotLiveMonitor,
} = require('./lib/ccoJournalPilotLiveMonitor');

const REPO = require('node:path').join(__dirname, '..');

async function main() {
  console.log('=== Journal Pilot Live Monitor ===');
  const monitor = await collectJournalPilotLiveMonitor({ repo: REPO });
  const paths = publishJournalPilotLiveMonitor(monitor, REPO);

  console.log('Overall:', monitor.overall);
  console.log('Personal kan journalföra:', monitor.personalCanContinueJournaling);
  console.log('24h writes/activity:', monitor.last24h.journalEntriesActivity);
  console.log('24h signed:', monitor.last24h.signedCount);
  console.log('24h corrections:', monitor.last24h.correctionsCount);
  console.log('24h errors:', monitor.last24h.errorsCount);
  console.log('Pilots:', monitor.pilot1, monitor.pilot2, monitor.pilot3);
  console.log('Route 5xx:', monitor.route5xxCount);
  console.log('');
  console.log('Wrote:', paths.publicPath);

  process.exit(monitor.overall === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
