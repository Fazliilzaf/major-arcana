#!/usr/bin/env node
'use strict';

/**
 * P1-001/002 — migrera legacy 'cco'-nycklade conversation-state-poster till
 * deras riktiga canonical tenant.
 *
 * 'cco' är INTE en tenant. Historiskt skrevs operational conversation state
 * (Klar/Senare, tilldelning, AI-sammanfattning) under nyckeln `cco:<conversation>`
 * i conversation-state-filen, medan notes/audit/övriga konsumenter använder
 * canonical tenant (hair-tp-clinic). Det här verktyget flyttar `cco`-prefixade
 * poster till rätt canonical tenant.
 *
 * SÄKERHETSREGLER (frysta i design-gate):
 *   - dry-run är standard; skrivning kräver --apply.
 *   - backup före mutation.
 *   - deterministisk mapping — INGEN gissning om target tenant.
 *   - en rad vars target inte kan BEVISAS migreras INTE (UNRESOLVED).
 *   - kollision → hoppa över, aldrig skriv över canonical state.
 *
 * Användning:
 *   node scripts/migrate-conversation-tenant.js --file data/cco-conversation-state.json
 *   node scripts/migrate-conversation-tenant.js --file data/cco-conversation-state.json --target-tenant hair-tp-clinic
 *   node scripts/migrate-conversation-tenant.js --file data/cco-conversation-state.json --target-tenant hair-tp-clinic --apply
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  planConversationTenantMigration,
  applyConversationTenantMigration,
} = require('../src/ops/ccoConversationTenantMigration');

function parseArgs(argv) {
  const opts = { file: 'data/cco-conversation-state.json', targetTenant: '', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file' && argv[i + 1]) {
      opts.file = argv[i + 1];
      i += 1;
    } else if (arg === '--target-tenant' && argv[i + 1]) {
      opts.targetTenant = argv[i + 1];
      i += 1;
    } else if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`migrate-conversation-tenant.js — migrera legacy 'cco'-conversation-state till canonical tenant.

Användning:
  node scripts/migrate-conversation-tenant.js [--file <path>] [--target-tenant <canonical>] [--apply]

Flaggor:
  --file <path>             State-fil (default: data/cco-conversation-state.json)
  --target-tenant <värde>   Bevisad target tenant (canonicaliseras)
  --apply                   Skriv (default: dry-run)
`);
    return;
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`[migrate-conversation-tenant] Fil saknas: ${filePath}`);
    process.exit(2);
  }

  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const plan = planConversationTenantMigration(state, { targetTenant: opts.targetTenant });

  // B-MIG-1 — INVALID_TARGET_TENANT: fail-closed, ingen analys, ingen mutation.
  if (plan.invalidTarget) {
    console.error('INVALID_TARGET_TENANT: target normaliserar till cco — cco är inte en tenant.');
    console.error('Inga ändringar gjorda.');
    process.exit(2);
  }

  console.log('=== migrate-conversation-tenant ===');
  console.log(`Mode:            ${opts.apply ? 'apply' : 'dry-run'}`);
  console.log(`File:            ${filePath}`);
  console.log(`Target tenant:   ${plan.targetTenant || '(ej angiven — mailbox-bevis används)'}`);
  console.log(`Conversation states legacy 'cco': ${plan.counts.conversationStatesLegacyCco}`);
  console.log(`Idempotency records legacy 'cco':  ${plan.counts.idempotencyRecordsLegacyCco}`);
  console.log(`Would migrate:   ${plan.migrated.length}`);
  console.log(`Collisions:      ${plan.collisions.length}`);
  console.log(`Unresolved:      ${plan.unresolved.length}`);
  console.log(`Invalid:         ${plan.invalid.length}`);

  for (const item of plan.migrated) {
    console.log(`  migrate ${item.kind}: ${item.key} -> ${item.newKey}`);
  }
  for (const item of plan.collisions) {
    console.log(`  COLLISION (hoppas över): ${item.key} -> ${item.newKey} (${item.reason})`);
  }
  for (const item of plan.unresolved) {
    console.log(`  UNRESOLVED LEGACY TENANT ROW: ${item.key} (${item.reason})`);
  }
  for (const item of plan.invalid) {
    console.log(`  INVALID (bevarad, ej migrerad): ${item.key} (${item.reason})`);
  }

  if (opts.apply && plan.migrated.length === 0) {
    console.log('\nInga poster att migrera. Ingen skrivning.');
    return;
  }

  if (!opts.apply) {
    console.log('\nDry-run — inga ändringar skrivna. Använd --apply för att migrera.');
    return;
  }

  const backupPath = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`\nBackup: ${backupPath}`);

  applyConversationTenantMigration(state, plan);

  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
  console.log(`Migrerade ${plan.migrated.length} poster till ${filePath}`);
  console.log(`Post-migration reload: kör en read/verifiering av ${filePath} innan deploy.`);
}

main();
