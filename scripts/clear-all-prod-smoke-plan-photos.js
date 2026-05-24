#!/usr/bin/env node
/**
 * Prod: hitta alla behandlingsplaner med foton och rensa smoke (eller --all).
 *   ADMIN_TOKEN=$(node scripts/get-prod-auth-token.js) node scripts/clear-all-prod-smoke-plan-photos.js
 */
require('dotenv').config({ quiet: true });

const baseUrl = (process.env.BASE_URL || 'https://arcana.hairtpclinic.se').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || process.env.CCO_ADMIN_TOKEN || '';
const clearAll = process.argv.includes('--all');

if (!token) {
  console.error('ADMIN_TOKEN krävs (t.ex. node scripts/get-prod-auth-token.js).');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path, attempt = 0) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const text = await res.text();
  if (res.status === 401 && attempt < 1) {
    console.error('Token utgången — kör med färskt ADMIN_TOKEN.');
    process.exit(1);
  }
  if ((!res.ok || text.startsWith('<')) && attempt < 5) {
    await sleep(2000 * (attempt + 1));
    return fetchJson(path, attempt + 1);
  }
  if (!res.ok || text.startsWith('<')) {
    throw new Error(`${path} -> ${res.status} ${text.slice(0, 80)}`);
  }
  return JSON.parse(text);
}

async function clearPlan(patientId, entryId, attempt = 0) {
  const res = await fetch(`${baseUrl}/api/v1/cco-journal/plan-photos/clear`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ patientId, entryId, smokeOnly: !clearAll }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if ((!res.ok || text.startsWith('<')) && attempt < 5) {
    await sleep(2000 * (attempt + 1));
    return clearPlan(patientId, entryId, attempt + 1);
  }
  if (!res.ok) throw new Error(body.error || String(res.status));
  return body;
}

(async () => {
  const stats = await fetchJson('/api/v1/cco-patient-master/stats');
  const total = Number(stats?.stats?.totalPatients) || 0;
  let totalRemoved = 0;
  let plansWithPhotos = 0;

  for (let offset = 0; offset < total; offset += 100) {
    const { patients = [] } = await fetchJson(
      `/api/v1/cco-patient-master/patients?limit=100&offset=${offset}`
    );
    for (const p of patients) {
      const patientId = p.patientId || p.id;
      const { entries = [] } = await fetchJson(
        `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`
      );
      const plan = entries.find((e) => e.journalType === 'consultation_plan');
      if (!plan) continue;
      const photos = (plan.attachments || []).filter((a) => a.type === 'consultation_photo');
      if (!photos.length) continue;
      plansWithPhotos += 1;
      const result = await clearPlan(patientId, plan.entryId);
      const n = Number(result.removedCount) || 0;
      if (n > 0) {
        totalRemoved += n;
        console.log(
          `✓ ${n} (${clearAll ? 'alla' : 'smoke'}) — ${p.displayName || patientId} — hade ${photos.length} foton`
        );
      }
    }
    if (offset % 1000 === 0) {
      console.error(`… offset ${offset}/${total}, borttaget ${totalRemoved}`);
    }
    await sleep(40);
  }

  console.log(
    `Klar. Planer med foton: ${plansWithPhotos}. Borttagna bilagor: ${totalRemoved}.`
  );
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
