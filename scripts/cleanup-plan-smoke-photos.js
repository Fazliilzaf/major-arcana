#!/usr/bin/env node
/**
 * Tar bort smoke/E2E-konsultationsbilder från en patients behandlingsplan (standard).
 * Med --all tas alla planbilder bort.
 *
 *   ADMIN_TOKEN=... node scripts/cleanup-plan-smoke-photos.js <patientId>
 *   ADMIN_TOKEN=... node scripts/cleanup-plan-smoke-photos.js <patientId> --all
 */
const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || process.env.CCO_ADMIN_TOKEN || '';
const argv = process.argv.slice(2);
const clearAll = argv.includes('--all');
const patientId = argv.find((arg) => arg && !arg.startsWith('-'));

if (!patientId) {
  console.error(
    'Usage: ADMIN_TOKEN=... node scripts/cleanup-plan-smoke-photos.js <patientId> [--all]'
  );
  process.exit(1);
}
if (!token) {
  console.error('ADMIN_TOKEN (or CCO_ADMIN_TOKEN) krävs.');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

(async () => {
  const { entries = [] } = await api(
    'GET',
    `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`
  );
  const plan = entries.find((e) => e.journalType === 'consultation_plan');
  if (!plan) {
    console.log('Ingen behandlingsplan hittades.');
    return;
  }
  const photos = (plan.attachments || []).filter(
    (a) => a.type === 'consultation_photo' && a.photoId
  );
  if (!photos.length) {
    console.log('Inga bilder att ta bort.');
    return;
  }
  const modeLabel = clearAll ? 'alla' : 'smoke/E2E';
  console.log(`Tar bort ${modeLabel}-bilder från plan ${plan.entryId}…`);
  const result = await api('POST', '/api/v1/cco-journal/plan-photos/clear', {
    patientId,
    entryId: plan.entryId,
    smokeOnly: !clearAll,
  });
  const removed = Number(result.removedCount) || 0;
  console.log(`✓ ${removed} bilder borttagna (${modeLabel}).`);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
