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
let token = process.env.CFO_AUTH_TOKEN || '';
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const proposalPath =
  process.env.PROPOSAL_PATH ||
  path.join(__dirname, '..', '..', 'outputs', 'kategoriseringsforslag-405.json');
const delayMs = Number(process.env.DELAY_MS || 250);

// Admin-sessioner lever bara några minuter — för korta för långa körningar.
// Sätt CFO_EMAIL + CFO_PASSWORD så förnyar skriptet token automatiskt vid 401.
const loginEmail = process.env.CFO_EMAIL || '';
const loginPassword = process.env.CFO_PASSWORD || '';

if (!token && !(loginEmail && loginPassword)) {
  console.error(
    '[apply] CFO_AUTH_TOKEN saknas (eller sätt CFO_EMAIL + CFO_PASSWORD för auto-förnyelse).'
  );
  process.exit(1);
}

async function refreshToken() {
  if (!loginEmail || !loginPassword) return false;
  const res = await fetch(new URL('/api/v1/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: loginEmail, password: loginPassword }),
  });
  const payload = await res.json().catch(() => ({}));
  const newToken = payload.token || payload.accessToken || payload.session?.token;
  if (!res.ok || !newToken) return false;
  token = newToken;
  console.log('[apply] token förnyad');
  return true;
}

async function apiFetch(apiPath, { method = 'GET', body, _retried = false } = {}) {
  if (!token) await refreshToken();
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
  if (res.status === 401 && !_retried) {
    const renewed = await refreshToken();
    if (renewed) return apiFetch(apiPath, { method, body, _retried: true });
  }
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

  // VAT_ONLY=true: kör ENBART vatMode-passet (POST /:id/vat) på poster som
  // redan är approved/ready_for_export men saknar vatMode. updateExpenses
  // vitelist (allowed[]) täcker inte vatMode — det måste via setVatMode-routen.
  const vatOnly = String(process.env.VAT_ONLY || '').toLowerCase() === 'true';

  for (const group of proposal.proposal) {
    for (const id of group.ids || []) {
      const e = byId.get(id);
      if (!e) {
        report.skipped += 1;
        continue;
      }
      if (vatOnly) {
        if (e.vatMode || !['approved', 'ready_for_export'].includes(e.status)) {
          report.skipped += 1;
          continue;
        }
      } else if (e.status !== 'categorized' || e.fortnoxSyncStatus !== 'blocked_integration') {
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
      const steps = vatOnly
        ? [
            () =>
              apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}/vat`, {
                method: 'POST',
                body: { vatMode, vatRatePercent },
              }),
          ]
        : [
            () =>
              apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: { category, vatRatePercent, vatMode },
              }),
            () =>
              apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}/status`, {
                method: 'POST',
                body: { status: 'approved', reason: 'kategoriseringsförslag 405: ägar-godkänt' },
              }),
            () =>
              apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(id)}/status`, {
                method: 'POST',
                body: {
                  status: 'ready_for_export',
                  reason: 'kategoriseringsförslag 405: ägar-godkänt',
                },
              }),
          ];
      try {
        // Rate-limit-tålig: vid "För många skriv-anrop" vänta 15s och försök
        // igen (max 3 per steg). Status-stegen är idempotenta på servern.
        let stepIndex = 0;
        let rateRetries = 0;
        while (stepIndex < steps.length) {
          try {
            await steps[stepIndex]();
            stepIndex += 1;
            rateRetries = 0;
          } catch (stepErr) {
            if (/för många skriv-anrop/i.test(stepErr.message) && rateRetries < 3) {
              rateRetries += 1;
              await sleep(15000);
              continue;
            }
            throw stepErr;
          }
        }
        report.patched += 1;
        report.approved += 1;
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
