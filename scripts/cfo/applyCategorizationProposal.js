#!/usr/bin/env node
'use strict';

/**
 * applyCategorizationProposal — applicerar det ägar-godkända
 * kategoriseringsförslaget (outputs/kategoriseringsforslag-405.json) på de
 * 405 blockerade expensena.
 *
 * Per expense: PATCH {category, vatRatePercent, vatMode} → status approved →
 * ready_for_export. Google-gruppen splittas per belopp (≥1000 = ads
 * marknadsforing, <1000 = Workspace it_telefoni — ägarbeslut: splitta).
 *
 * Standard: torrkörning. Skarpt:
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/applyCategorizationProposal.js
 */

const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const proposalPath =
  process.env.PROPOSAL_PATH ||
  path.join(__dirname, '..', '..', 'outputs', 'kategoriseringsforslag-405.json');
const delayMs = Number(process.env.DELAY_MS || 250);

if (!token) {
  console.error('[apply] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

async function apiFetch(apiPath, { method = 'GET', body } = {}) {
  const res = await fetch(new URL(apiPath, baseUrl), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function main() {
  const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
  const expenses = (await apiFetch('/api/v1/cco-cf/expenses?limit=5000')).expenses || [];
  const byId = new Map(expenses.map((e) => [e.id, e]));

  console.log(`[apply] dryRun=${dryRun}, förslagsgrupper: ${proposal.proposal.length}`);

  const report = { patched: 0, approved: 0, readyForExport: 0, skipped: 0, failed: 0, details: [] };

  for (const group of proposal.proposal) {
    for (const id of group.ids || []) {
      const e = byId.get(id);
      if (!e) {
        report.skipped += 1;
        continue;
      }
      if (e.status !== 'categorized' || e.fortnoxSyncStatus !== 'blocked_integration') {
        report.skipped += 1;
        continue;
      }
      // Google-splitt per belopp (ägarbeslut): ≥1000 kr = ads, <1000 = workspace.
      let { category, vatMode, vatRatePercent } = group;
      if (group.supplier === 'google') {
        if (Number(e.amountSek) >= 1000) {
          category = 'marknadsforing';
          vatMode = 'reverse_charge_eu';
          vatRatePercent = 0;
        } else {
          category = 'it_telefoni';
          vatMode = 'reverse_charge_eu';
          vatRatePercent = 0;
        }
      }
      const label = `${id} ${e.supplier} ${e.amountSek} → ${category}/${vatMode}`;
      if (dryRun) {
        report.details.push({ id, result: 'would_apply', label });
        continue;
      }
      try {
        await apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { category, vatRatePercent, vatMode },
        });
        report.patched += 1;
        await apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}/status`, {
          method: 'POST',
          body: { status: 'approved', reason: 'kategoriseringsförslag 405: ägar-godkänt' },
        });
        report.approved += 1;
        await apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}/status`, {
          method: 'POST',
          body: { status: 'ready_for_export', reason: 'kategoriseringsförslag 405: ägar-godkänt' },
        });
        report.readyForExport += 1;
        report.details.push({ id, result: 'applied', label });
      } catch (err) {
        report.failed += 1;
        report.details.push({ id, result: 'failed', label, error: err.message });
        console.log(`  - MISSLYCKADES: ${label}: ${err.message.slice(0, 60)}`);
      }
      await sleep(delayMs);
    }
  }

  const wouldCount = report.details.filter((d) => d.result === 'would_apply').length;
  console.log(
    `\n[apply] klart: ${report.patched} patchade, ${report.approved} approved, ${report.readyForExport} ready_for_export, ${report.skipped} skipade, ${report.failed} fel` +
      (dryRun ? ` (${wouldCount} skulle appliceras)` : '')
  );
}

main().catch((err) => {
  console.error('[apply] fatal:', err);
  process.exit(1);
});
