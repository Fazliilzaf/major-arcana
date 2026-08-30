#!/usr/bin/env node
'use strict';

/**
 * detachPatientDocUnderlag — lossar patientdokument som felaktigt ligger som
 * bokföringsunderlag på CFO-kvitton.
 *
 * Bakgrund (upp mätt 2026-08-30): repairDanglingStorageKeys matchade på
 * checksum-prefix och pekade om trasiga storageKeys till fel filer — bl.a.
 * patientjournaler, behandlingsavtal (FUE/DHI), hälsodeklarationer och
 * anställningsavtal. Kvittot behåller filen i arkivet (revisions spår), men
 * markeras needs_review så att det inte kan promotas/exporteras vidare med
 * fel underlag. Länkad expense markeras också needs_review.
 *
 * Standard: torrkörning. Skarpt:
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/detachPatientDocUnderlag.js
 */

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());

if (!token) {
  console.error('[detach] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

const PATIENT_DOC_PATTERN =
  /journal|avtal|behandling|halsodeklaration|patient|fue|dhi|injektion|anstallningsavtal|hyresavtal|utbildning/i;

const REASON =
  'underlag är patientdokument (fel fil via checksum-prefix-reparation) — saknar giltigt underlag';

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
    err.body = payload;
    throw err;
  }
  return payload;
}

async function main() {
  const receipts = (await apiFetch('/api/v1/cco-cf/receipts?limit=5000')).receipts || [];
  const expenses = (await apiFetch('/api/v1/cco-cf/expenses?limit=5000')).expenses || [];
  const expenseByReceiptId = new Map();
  for (const e of expenses) {
    if (e.receiptId) expenseByReceiptId.set(e.receiptId, e);
  }

  const keyCount = new Map();
  for (const r of receipts) {
    if (!r.storageKey) continue;
    keyCount.set(r.storageKey, (keyCount.get(r.storageKey) || 0) + 1);
  }

  const targets = receipts.filter((r) => {
    if (!r.storageKey || keyCount.get(r.storageKey) < 2) return false;
    if (r.status === 'rejected') return false; // redan avförda — ingen fara
    if (String(r.notes || '').includes('[DETACH-PATIENTDOC]')) return false; // redan körda
    const hay = `${r.storageKey} ${r.originalFileName || ''}`;
    return PATIENT_DOC_PATTERN.test(hay);
  });

  console.log(`[detach] dryRun=${dryRun}`);
  console.log(
    `[detach] träffar: ${targets.length} kvitton med patientdokument-underlag (exkl. redan rejected)`
  );

  const results = [];
  for (const r of targets) {
    const expense = expenseByReceiptId.get(r.id);
    const label = `${r.id} ${r.supplier || ''} ${r.amountSek} ${r.date} [${r.status}] → ${(r.originalFileName || r.storageKey || '').slice(0, 60)}`;
    if (dryRun) {
      console.log(
        `  - SKULLE lossa: ${label}${expense ? ` (+expense ${expense.id} [${expense.status}])` : ' (ingen expense)'}`
      );
      results.push({ receiptId: r.id, expenseId: expense?.id || null, status: 'dry_run' });
      continue;
    }
    try {
      await apiFetch(`/api/v1/cco-cf/receipts/${encodeURIComponent(r.id)}/status`, {
        method: 'POST',
        body: { status: 'needs_review', reason: `[DETACH-PATIENTDOC] ${REASON}` },
      });
      let expenseResult = 'ingen expense';
      if (expense && expense.status !== 'needs_review' && expense.status !== 'rejected') {
        await apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(expense.id)}/status`, {
          method: 'POST',
          body: { status: 'needs_review', reason: `[DETACH-PATIENTDOC] kvittots ${REASON}` },
        });
        expenseResult = `expense ${expense.id} → needs_review`;
      }
      console.log(`  - OK: ${label} ${expenseResult}`);
      results.push({ receiptId: r.id, expenseId: expense?.id || null, status: 'detached' });
    } catch (err) {
      console.log(`  - MISSLYCKADES: ${label}: ${err.message}`);
      results.push({
        receiptId: r.id,
        expenseId: expense?.id || null,
        status: 'failed',
        error: err.message,
      });
    }
    await new Promise((s) => setTimeout(s, 300));
  }

  const done = results.filter((x) => x.status === 'detached').length;
  const failed = results.filter((x) => x.status === 'failed').length;
  console.log(
    `\n[detach] klart: ${done} lossade, ${failed} misslyckade, ${results.length - done - failed} torrkörda`
  );
}

main().catch((err) => {
  console.error('[detach] fatal:', err);
  process.exit(1);
});
