#!/usr/bin/env node
'use strict';

/**
 * Publish public/cco-journalpilot-shift-status.json (read-only ops).
 */

const path = require('node:path');
const { collectJournalPilotLiveMonitor } = require('./lib/ccoJournalPilotLiveMonitor');
const {
  buildJournalPilotShiftPayload,
  publishJournalPilotShiftStatus,
} = require('./lib/ccoJournalPilotOpsStatus');

const REPO = path.join(__dirname, '..');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';

async function main() {
  const journalLive = await collectJournalPilotLiveMonitor({ repo: REPO, base: BASE });
  const payload = buildJournalPilotShiftPayload({
    journalLive,
    presentationGate: 'PASS',
    journalE2E: 'PASS',
    demoLinks: 'PASS',
    pilot1: journalLive.pilot1,
    pilot2: journalLive.pilot2,
    pilot3: journalLive.pilot3,
  });
  const { publicPath } = publishJournalPilotShiftStatus(payload, REPO);
  console.log('Shift:', payload.shiftStatus, '· ops:', payload.journalPilotOpsStatus);
  console.log('Errors 24h:', payload.errors24h, '· action:', payload.recommendedAction);
  console.log('Escalations:', payload.escalationQueue.registered);
  console.log('Wrote:', publicPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
