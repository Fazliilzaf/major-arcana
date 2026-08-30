#!/usr/bin/env node
'use strict';

/**
 * approveRepairedReceipts — tunn wrapper mot serverns auto-approve-endpoint.
 *
 * Logiken lever i src/cfo/cfoReceiptAutoApprove.js (delas med scheduler-jobbet
 * cfo_receipt_auto_approve). Detta skript anropar bara endpointen.
 *
 * Standard: torrkörning. Skarpt:
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/approveRepairedReceipts.js
 */

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const limit = Number(process.env.LIMIT || 50);

if (!token) {
  console.error('[approve] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

async function main() {
  const res = await fetch(
    new URL(`/api/v1/cco-cf/receipts/auto-approve?dryRun=${dryRun}&limit=${limit}`, baseUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[approve] HTTP ${res.status}:`, payload.error || res.statusText);
    process.exit(1);
  }
  for (const d of payload.details || []) {
    console.log(`  - ${d.result}: ${d.id}${d.reason ? ` (${d.reason})` : ''}`);
  }
  console.log(
    `\n[approve] klart: ${payload.approved} godkända, ${payload.kept} kvar i needs_review, ${payload.failed} fel (dryRun=${dryRun})`
  );
}

main().catch((err) => {
  console.error('[approve] fatal:', err);
  process.exit(1);
});
