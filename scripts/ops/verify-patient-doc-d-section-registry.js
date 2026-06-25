#!/usr/bin/env node
/**
 * Verify BOOKOFF sektion D — owner-workshop registry-mapping facit.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const REGISTRY_PATH = path.join(
  ROOT,
  'docs/implementation/patient-documents-live/patient-document-d-section-registry.json'
);
const CONSENT_PATH = path.join(ROOT, 'migration/meridiq/consent-catalog.json');
const CATALOG_PATH = path.join(ROOT, 'src/ops/hairtp-document-types.catalog.json');
const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const registry = readJson(REGISTRY_PATH);
  const consents = readJson(CONSENT_PATH).consents;
  const catalog36 = new Set(readJson(CATALOG_PATH).types.map((t) => t.id));
  const consentIds = new Set(consents.map((c) => c.apiId));

  const errors = [];
  const warnings = [];

  if (registry.workshopGroupCount !== 6) {
    errors.push(`workshopGroupCount förväntat 6, fick ${registry.workshopGroupCount}`);
  }
  if (!registry.nonBlockingForHairTpCutover) {
    errors.push('nonBlockingForHairTpCutover måste vara true');
  }
  if (registry.hairTpBlockingGroups > 0) {
    errors.push(`hairTpBlockingGroups=${registry.hairTpBlockingGroups} — ska vara 0`);
  }

  const proposedIds = new Set();
  for (const group of registry.groups || []) {
    for (const id of [...(group.meridiqApiIds || []), ...(group.agreementApiIds || [])]) {
      if (!consentIds.has(id)) errors.push(`${group.id}: Meridiq ${id} saknas i consent-catalog`);
    }
    if (group.missingMeridiqIds?.length) {
      errors.push(`${group.id}: missingMeridiqIds ${group.missingMeridiqIds.join(',')}`);
    }
    const proposed =
      group.recommended?.proposedRegistryId || group.recommended?.agreementRegistryId || null;
    if (proposed) {
      if (proposedIds.has(proposed)) warnings.push(`dubbel proposedRegistryId: ${proposed}`);
      proposedIds.add(proposed);
      if (catalog36.has(proposed)) {
        warnings.push(`${group.id}: proposed ${proposed} finns redan i 36-katalog`);
      }
    }
    if (group.ownerDecision !== 'PENDING' && group.ownerDecision !== 'APPROVED') {
      warnings.push(`${group.id}: okänd ownerDecision ${group.ownerDecision}`);
    }
  }

  if ((registry.groups || []).length !== 6) {
    errors.push(`groups.length=${registry.groups?.length} — förväntat 6`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const report = {
    generatedAt: new Date().toISOString(),
    script: 'verify:patient-doc-d-section-registry',
    status: errors.length ? 'FAIL' : 'PASS',
    workshopStatus: registry.workshopStatus,
    pendingOwnerDecisions: registry.pendingOwnerDecisions,
    hairTpBlockingGroups: registry.hairTpBlockingGroups,
    errors,
    warnings,
    groupSummary: (registry.groups || []).map((g) => ({
      id: g.id,
      bookoffLabel: g.bookoffLabel,
      recommendedAction: g.recommended?.action,
      proposedRegistryId: g.recommended?.proposedRegistryId,
      ownerDecision: g.ownerDecision,
      hairTpCutoverBlocking: g.hairTpCutoverBlocking,
    })),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `D-SECTION-VERIFY-${stamp}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n=== Sektion D verify ===`);
  console.log(`Status: ${report.status}`);
  console.log(
    `Workshop: ${report.workshopStatus} · pending owner: ${report.pendingOwnerDecisions}`
  );
  console.log(`Hair TP-blockerande grupper: ${report.hairTpBlockingGroups}`);
  if (warnings.length) console.log(`Warnings: ${warnings.length}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (errors.length) {
    for (const e of errors) console.log(`  ✗ ${e}`);
  }
  console.log(`→ ${outPath}\n`);

  if (errors.length) process.exit(1);
}

main();
