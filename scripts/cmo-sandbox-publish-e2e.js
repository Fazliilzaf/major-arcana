#!/usr/bin/env node
'use strict';

/**
 * Fas P — admin E2E: seed → godkänn → scheduler sandbox publish → verifiera API.
 *
 *   npm run demo:cmo-sandbox-publish:e2e
 *   ARCANA_SMOKE_BASE_URL=http://127.0.0.1:3100 npm run demo:cmo-sandbox-publish:e2e
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createMarketingCampaignDraftsStore } = require('../src/ops/marketingCampaignDraftsStore');

const ROOT_DIR = path.join(__dirname, '..');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const OWNER_EMAIL = process.env.ARCANA_OWNER_EMAIL || 'fazli@hairtpclinic.com';
const OWNER_PASSWORD = process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026';
const CAMPAIGN_ID = 'fas-p-e2e-linkedin';
const EPHEMERAL_PORT = Number(process.env.CMO_E2E_PORT || 3113);

function log(title, payload) {
  console.log(`\n=== ${title} ===`);
  if (payload !== undefined) {
    console.log(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
  }
}

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status}: ${body.error || JSON.stringify(body)}`);
  }
  return body;
}

async function waitForReadyz(baseUrl, attempts = 90) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const payload = await fetchJson(`${baseUrl}/readyz`);
      if (payload.ready === true) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server not ready at ${baseUrl}/readyz`);
}

async function fetchOwnerToken(baseUrl) {
  const { execFileSync } = require('node:child_process');
  return execFileSync('bash', [`${ROOT_DIR}/scripts/extract-owner-token.sh`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_URL: baseUrl,
      ARCANA_OWNER_EMAIL: OWNER_EMAIL,
      ARCANA_OWNER_PASSWORD: OWNER_PASSWORD,
      ARCANA_DEFAULT_TENANT: TENANT_ID,
    },
  }).trim();
}

async function seedPendingCampaign(stateRoot) {
  const draftsPath = path.join(stateRoot, 'marketing-campaign-drafts.json');
  const store = await createMarketingCampaignDraftsStore({ filePath: draftsPath });
  const proposedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await store.upsertCampaign({
    tenantId: TENANT_ID,
    id: CAMPAIGN_ID,
    name: 'Fas P E2E — LinkedIn pilot',
    channel: 'linkedin',
    status: 'pending_approval',
    owner: 'OWNER',
    readiness: 'ready',
    payload: {
      bodyOutline: 'Sandbox publish demo från admin E2E.',
      publishSchedule: {
        platform: 'linkedin',
        proposedAt,
        topic: 'Pilot launch',
        windowLabel: '7d',
        status: 'proposed',
        publishMode: 'pilot_auto_queue',
        pilotAutoPublishEligible: true,
      },
    },
  });
}

function startEphemeralServer(stateRoot, port) {
  const child = spawn('node', ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      ARCANA_STATE_ROOT: stateRoot,
      ARCANA_AI_PROVIDER: 'fallback',
      ARCANA_GRAPH_READ_ENABLED: 'false',
      ARCANA_GRAPH_SEND_ENABLED: 'false',
      ARCANA_SCHEDULER_ENABLED: 'true',
      ARCANA_DEFAULT_TENANT: TENANT_ID,
      ARCANA_OWNER_EMAIL: OWNER_EMAIL,
      ARCANA_OWNER_PASSWORD: OWNER_PASSWORD,
      ARCANA_MARKETING_CONNECTORS_ENABLED: 'true',
      ARCANA_MARKETING_PUBLISH_PILOT_ENABLED: 'true',
      ARCANA_MARKETING_AUTO_PUBLISH_PILOT_CHANNELS: 'linkedin',
      ARCANA_MARKETING_PUBLISH_LIVE_ENABLED: 'true',
      ARCANA_MARKETING_PUBLISH_SANDBOX: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

async function runHttpFlow(baseUrl) {
  const token = await fetchOwnerToken(baseUrl);
  log('Auth', `token acquired (${token.length} chars)`);

  const before = await fetchJson(`${baseUrl}/api/v1/marketing/campaigns?limit=20`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  const seeded = (before.items || []).find((item) => item.id === CAMPAIGN_ID);
  if (!seeded) fail(`Campaign ${CAMPAIGN_ID} missing before approve`);
  if (seeded.status !== 'pending_approval') {
    fail(`Expected pending_approval, got ${seeded.status}`);
  }
  log('Seed visible in admin API', {
    id: seeded.id,
    status: seeded.status,
    channel: seeded.channel,
  });

  const approved = await fetchJson(
    `${baseUrl}/api/v1/marketing/campaigns/${encodeURIComponent(CAMPAIGN_ID)}/approve`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: '{}',
    }
  );
  log('Approve (admin)', { status: approved.item?.status, version: approved.item?.version });

  const scheduler = await fetchJson(`${baseUrl}/api/v1/ops/scheduler/run`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jobId: 'cmo_pilot_publish_due',
      tenantId: TENANT_ID,
    }),
  });
  log('Scheduler cmo_pilot_publish_due', scheduler.result || scheduler);

  const after = await fetchJson(
    `${baseUrl}/api/v1/marketing/campaigns/${encodeURIComponent(CAMPAIGN_ID)}`,
    {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    }
  );
  const schedule = after.item?.payload?.publishSchedule || {};
  log('Publish status (admin API)', {
    publishStatus: schedule.publishStatus,
    publishQueueMode: schedule.publishQueueMode,
    externalPublishInvoked: schedule.externalPublishInvoked,
    externalPublishId: schedule.externalPublishId,
    publishMessage: schedule.publishMessage,
  });

  if (schedule.publishStatus !== 'published') {
    fail(`Expected publishStatus=published, got ${schedule.publishStatus || 'missing'}`);
  }
  if (schedule.externalPublishInvoked !== true) {
    fail('Expected externalPublishInvoked=true in sandbox mode');
  }
  if (!String(schedule.externalPublishId || '').includes('sandbox-linkedin')) {
    fail(`Expected sandbox external id, got ${schedule.externalPublishId}`);
  }

  return { token, schedule };
}

async function main() {
  const externalBase = String(process.env.ARCANA_SMOKE_BASE_URL || '').trim().replace(/\/$/, '');
  let server = null;
  let stateRoot = null;
  let baseUrl = externalBase;

  console.log('CMO Fas P — admin sandbox publish E2E');

  try {
    if (!baseUrl) {
      stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-publish-e2e-'));
      await seedPendingCampaign(stateRoot);
      baseUrl = `http://127.0.0.1:${EPHEMERAL_PORT}`;
      log('Ephemeral server', { stateRoot, baseUrl });
      server = startEphemeralServer(stateRoot, EPHEMERAL_PORT);
      await waitForReadyz(baseUrl);
    } else {
      log('Using existing server', baseUrl);
      await seedPendingCampaign(
        process.env.ARCANA_STATE_ROOT || path.join(ROOT_DIR, 'data')
      );
      log('Seeded campaign into existing state root — restart server if campaign missing');
    }

    await runHttpFlow(baseUrl);
    console.log('\n✅ Admin sandbox publish E2E passed');
    console.log('   Öppna Admin → CMO → Kampanjer och ladda om listan för grön publish-rad.');
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((resolve) => {
        server.on('exit', resolve);
        setTimeout(resolve, 2000);
      });
    }
  }
}

main().catch((error) => {
  fail(error.message || error);
});
