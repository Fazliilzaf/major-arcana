'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  diagnoseEnrichmentBaselineRecovery,
  PRE_BACKFILL_ENRICHED_MAX,
} = require('../../src/ops/ccoInboxEnrichmentBaselineDiagnose');

function buildCapabilityFile(entries) {
  return {
    version: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T01:00:00.000Z',
    entries,
  };
}

function buildWorklistEntry({ id, enrichedCount, total = 9000 }) {
  const rows = [];
  for (let index = 0; index < enrichedCount; index += 1) {
    rows.push({ conversationKey: `mb:conv-${index}`, intent: 'booking', workflowLane: 'inbox' });
  }
  for (let index = enrichedCount; index < total; index += 1) {
    rows.push({ conversationKey: `mb:gap-${index}`, intent: 'unknown' });
  }
  return {
    id,
    ts: '2026-06-01T12:00:00.000Z',
    tenantId: 'hair-tp-clinic',
    capability: { name: 'AnalyzeInbox', version: '1.0.0', persistStrategy: 'analysis' },
    decision: 'allow',
    input: { mailboxIds: ['contact@hairtpclinic.com'] },
    output: {
      data: {
        generatedAt: '2026-06-01T12:00:00.000Z',
        conversationWorklist: rows,
        needsReplyToday: [],
      },
    },
  };
}

test('diagnoseEnrichmentBaselineRecovery prefers pass6 disk source over pre-backfill backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-enrich-diagnose-'));
  const stateRoot = path.join(dir, 'state');
  const backupRoot = path.join(stateRoot, 'backups');
  const capabilityPath = path.join(stateRoot, 'capability-analysis.json');
  await fs.mkdir(backupRoot, { recursive: true });

  await fs.writeFile(
    capabilityPath,
    `${JSON.stringify(
      buildCapabilityFile([
        buildWorklistEntry({ id: '05dd08b4-pass6', enrichedCount: 8563, total: 9338 }),
      ]),
      null,
      2
    )}\n`,
    'utf8'
  );

  const preLabel = 'pre-enrichment-backfill-2026-06-01';
  const preDir = path.join(backupRoot, preLabel);
  await fs.mkdir(preDir, { recursive: true });
  await fs.writeFile(
    path.join(preDir, 'capability-analysis.json'),
    `${JSON.stringify(
      buildCapabilityFile([
        buildWorklistEntry({ id: 'pre-backfill', enrichedCount: 143, total: 9338 }),
      ]),
      null,
      2
    )}\n`,
    'utf8'
  );

  const diagnosis = await diagnoseEnrichmentBaselineRecovery({
    tenantId: 'hair-tp-clinic',
    mailboxIds: ['contact@hairtpclinic.com'],
    stateRoot,
    backupDir: backupRoot,
    capabilityAnalysisStorePath: capabilityPath,
    targetEntryIdPrefix: '05dd08b4',
  });

  assert.equal(diagnosis.liveDisk.matchesPass6, true);
  assert.equal(diagnosis.liveDisk.targetEntry.id, '05dd08b4-pass6');
  assert.equal(diagnosis.recommendation.action, 'restore');
  assert.equal(diagnosis.recommendation.phase, 'reload-capability');
  assert.ok(diagnosis.unsafePreBackfillSources.some((item) => item.label === preLabel));
  assert.ok(
    diagnosis.unsafePreBackfillSources.every((item) => item.enriched <= PRE_BACKFILL_ENRICHED_MAX)
  );

  await fs.rm(dir, { recursive: true, force: true });
});
