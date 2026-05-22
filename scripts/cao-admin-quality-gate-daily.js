#!/usr/bin/env node
'use strict';

/**
 * Daglig CAO quality-gate via scheduler-jobb (föredras) eller direkt HTTP.
 * Kör: node scripts/cao-admin-quality-gate-daily.js
 */

const baseUrl = process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3100';

async function runViaSchedulerApi() {
  const response = await fetch(`${baseUrl}/api/v1/ops/scheduler/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId: 'cao_daily_quality_gate', trigger: 'manual_script' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `scheduler run failed (${response.status})`);
  }
  return payload;
}

async function runViaAgentHttp() {
  const response = await fetch(`${baseUrl}/api/v1/agents/CAO/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'admin', input: { maxSuggestions: 3 } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `CAO run failed (${response.status})`);
  }
  const gate = payload?.output?.data?.adminQualityGate;
  return {
    ok: true,
    gatePassed: gate?.gatePassed === true,
    summary: gate?.summary || payload?.output?.data?.executiveSummary,
  };
}

async function main() {
  const mode = process.env.CAO_DAILY_GATE_MODE || 'scheduler';
  const payload =
    mode === 'http' ? await runViaAgentHttp() : await runViaSchedulerApi().catch(() => runViaAgentHttp());
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
