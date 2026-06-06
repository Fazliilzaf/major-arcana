#!/usr/bin/env node
'use strict';

/**
 * Trigga Render prod-deploy (Frankfurt srv-d8b3i3tckfvc73clgeng).
 *
 * Används när autoDeployTrigger: commit i render.yaml inte startar deploy
 * (t.ex. tappad GitHub-koppling). Körs från arcana-post-deploy-heal på push main.
 *
 * Kräver RENDER_API_KEY. Fallback: RENDER_DEPLOY_HOOK_URL (POST).
 */

require('dotenv').config({ quiet: true });

const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const COMMIT_SHA = process.env.GITHUB_SHA || process.env.RENDER_DEPLOY_COMMIT || '';

async function triggerViaApi(apiKey) {
  const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Render deploy API ${res.status}: ${body.message || JSON.stringify(body).slice(0, 160)}`
    );
  }
  const deployId = body.id || body.deploy?.id || body.deployId || 'started';
  console.log(`✅ Render deploy startad via API: ${deployId} (service ${SERVICE_ID})`);
  if (COMMIT_SHA) console.log(`   commit: ${COMMIT_SHA.slice(0, 7)}`);
  return deployId;
}

async function triggerViaHook(hookUrl) {
  let url = hookUrl.trim();
  if (COMMIT_SHA) {
    url += url.includes('?') ? `&ref=${COMMIT_SHA}` : `?ref=${COMMIT_SHA}`;
  }
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Deploy hook ${res.status}: ${text.slice(0, 160)}`);
  }
  console.log(`✅ Render deploy hook triggad${text ? `: ${text.slice(0, 120)}` : ''}`);
}

async function main() {
  const apiKey = process.env.RENDER_API_KEY || '';
  const hookUrl = process.env.RENDER_DEPLOY_HOOK_URL || '';

  if (apiKey) {
    try {
      await triggerViaApi(apiKey);
      return;
    } catch (error) {
      console.warn(`⚠ Render API deploy misslyckades: ${error.message || error}`);
      if (!hookUrl) throw error;
    }
  }

  if (hookUrl) {
    await triggerViaHook(hookUrl);
    return;
  }

  throw new Error('Saknar RENDER_API_KEY och RENDER_DEPLOY_HOOK_URL — kan inte trigga deploy');
}

main().catch((error) => {
  console.error(`❌ ${error.message || error}`);
  process.exit(1);
});
