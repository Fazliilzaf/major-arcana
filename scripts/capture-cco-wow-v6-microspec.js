/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 64) {
  const now = Date.now();
  const mailboxPool = [
    'contact@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
    'marknad@hairtpclinic.com',
  ];
  const conversationWorklist = [];
  for (let i = 0; i < totalRows; i += 1) {
    const mailboxId = mailboxPool[i % mailboxPool.length];
    const inboundMs = now - (i + 1) * 18 * 60 * 1000;
    const hasOutbound = i % 4 !== 0;
    const outboundMs = hasOutbound ? inboundMs + 7 * 60 * 1000 : null;
    const priorityLevel = i < 6 ? 'Critical' : i < 20 ? 'High' : i < 42 ? 'Medium' : 'Low';
    const slaStatus = i < 6 ? 'breach' : i < 20 ? 'warning' : 'safe';
    const mode = i % 3 === 0 ? 'professional' : i % 3 === 1 ? 'warm' : 'short';
    conversationWorklist.push({
      conversationId: `wow-v6-conv-${i + 1}`,
      messageId: `wow-v6-msg-${i + 1}`,
      mailboxId,
      subject: `WOW v6 tråd ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Förhandsvisning för WOW v6-rad ${i + 1}.`,
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: outboundMs ? new Date(outboundMs).toISOString() : '',
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      slaStatus,
      hoursRemaining: i < 6 ? -2 : i < 20 ? 4 : 30,
      slaThreshold: 12,
      needsReplyStatus: hasOutbound ? 'active_dialogue' : 'awaiting_reply',
      isUnanswered: !hasOutbound,
      unansweredThresholdHours: 24,
      followUpSuggested: i % 2 === 0,
      stagnated: i % 8 === 0,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 5 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.82,
      priorityLevel,
      priorityScore: Math.max(9, 99 - i),
      recommendedAction: i < 6 ? 'Svara omedelbart' : i < 20 ? 'Svara idag' : 'Planera uppföljning',
      recommendedMode: mode,
      draftModes: {
        short: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
        warm: 'Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar',
        professional:
          'Hej,\n\nTack för ditt meddelande. Vi återkopplar med tydlig plan och nästa steg.\n\nVänliga hälsningar',
      },
      customerSummary: {
        customerName: `Kund ${i + 1}`,
        lifecycleStatus: i % 2 === 0 ? 'ACTIVE_DIALOGUE' : 'AWAITING_REPLY',
        interactionCount: (i % 6) + 1,
        timeline: [
          {
            occurredAt: new Date(inboundMs).toISOString(),
            subject: `Case ${i + 1}`,
            status: 'inbound',
          },
        ],
      },
    });
  }
  return {
    output: {
      data: {
        generatedAt: new Date().toISOString(),
        conversationWorklist,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'synthetic-wow-v6',
      },
    },
  };
}

async function main() {
  const baseUrl = String(process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const email = String(process.env.ARCANA_OWNER_EMAIL || 'fazli@hairtpclinic.com');
  const password = String(process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026');
  const tenant = String(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic');
  const outDir = path.join(process.cwd(), 'docs/ops/evidence');
  await fs.mkdir(outDir, { recursive: true });

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'arcana-staging.onrender.com',
    },
    body: JSON.stringify({ email, password, tenantId: tenant }),
  });
  const loginPayload = await loginResponse.json();
  const token = String(loginPayload?.token || '');
  if (!loginResponse.ok || !token) {
    throw new Error(`Login misslyckades (${loginResponse.status}): ${String(loginPayload?.error || 'okänt fel')}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const output = createSyntheticCcoOutput(64);
  const analysisPayload = JSON.stringify({ entries: [{ output: output.output }] });
  const runPayload = JSON.stringify(output);

  await page.route('**/api/v1/agents/analysis?agent=CCO&limit=1', async (route) => {
    await wait(500);
    await route.fulfill({ status: 200, contentType: 'application/json', body: analysisPayload });
  });
  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await wait(450);
    await route.fulfill({ status: 200, contentType: 'application/json', body: runPayload });
  });

  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate((sessionToken) => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);

  await page.goto(`${baseUrl}/cco?evidence=v6&arcana_reset=1`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(260);
  await page.click('#runCcoInboxBtn').catch(() => {});
  await wait(1300);
  await page.click('#ccoInboxDensityFilters [data-cco-density-mode="overview"]').catch(() => {});
  await wait(220);

  await page.screenshot({
    path: path.join(outDir, 'cco-wow-v6-1-start-3col-noscroll.png'),
    fullPage: false,
  });

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="queue"]').catch(() => {});
  await wait(250);
  await page.locator('#ccoCenterColumn').screenshot({
    path: path.join(outDir, 'cco-wow-v6-2-workqueue-10plus-rows.png'),
  });

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="inbound"]').catch(() => {});
  await wait(260);
  const inboundRows = page.locator('#ccoInboxFeedList .ccoFeedSelectBtn');
  if ((await inboundRows.count()) > 1) {
    await inboundRows.nth(1).click({ timeout: 12000 });
  } else if ((await inboundRows.count()) > 0) {
    await inboundRows.first().click({ timeout: 12000 });
  }
  await wait(220);
  await page.locator('#ccoReplyColumn').screenshot({
    path: path.join(outDir, 'cco-wow-v6-3-inbound-click-read-panel.png'),
  });

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="sent"]').catch(() => {});
  await wait(260);
  const sentRows = page.locator('#ccoInboxFeedList .ccoFeedSelectBtn');
  if ((await sentRows.count()) > 2) {
    await sentRows.nth(2).click({ timeout: 12000 });
  } else if ((await sentRows.count()) > 0) {
    await sentRows.first().click({ timeout: 12000 });
  }
  await wait(220);
  await page.locator('#ccoReplyColumn').screenshot({
    path: path.join(outDir, 'cco-wow-v6-4-sent-click-read-panel.png'),
  });

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="queue"]').catch(() => {});
  await wait(260);
  await page.click('#ccoInboxDensityFilters [data-cco-density-mode="work"]').catch(() => {});
  await wait(220);
  const queueRows = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn');
  if ((await queueRows.count()) > 0) {
    await queueRows.first().click({ timeout: 12000 });
  }
  await wait(260);
  await page.locator('#ccoReplyColumn').screenshot({
    path: path.join(outDir, 'cco-wow-v6-5-queue-compose-active.png'),
  });

  const indicator = page.locator('#ccoInboxWorklist .cco-thread-indicator').first();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await wait(120);
  if ((await indicator.count()) > 0) {
    await page.evaluate(() => {
      const target = document.querySelector('#ccoInboxWorklist .cco-thread-indicator');
      if (!target) return;
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 360,
        clientY: 420,
      });
      target.dispatchEvent(event);
    });
    await wait(180);
  }
  await page.screenshot({
    path: path.join(outDir, 'cco-wow-v6-6-status-ring-context-menu.png'),
    fullPage: false,
  });

  const consoleErrors = consoleMessages.filter((entry) => entry.type === 'error');
  await page.evaluate(({ consoleErrorCount, pageErrorCount }) => {
    const existing = document.getElementById('ccoConsoleEvidence');
    if (existing) existing.remove();
    const badge = document.createElement('div');
    badge.id = 'ccoConsoleEvidence';
    badge.style.position = 'fixed';
    badge.style.right = '14px';
    badge.style.bottom = '14px';
    badge.style.zIndex = '99999';
    badge.style.padding = '8px 10px';
    badge.style.border = '1px solid rgba(81,61,52,0.35)';
    badge.style.borderRadius = '10px';
    badge.style.background = 'rgba(255,255,255,0.88)';
    badge.style.color = '#513D34';
    badge.style.font = '600 12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif';
    badge.textContent = `Konsol fel: ${consoleErrorCount} · Page errors: ${pageErrorCount}`;
    document.body.appendChild(badge);
  }, {
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
  });
  await page.screenshot({
    path: path.join(outDir, 'cco-wow-v6-7-console-errors.png'),
    fullPage: false,
  });

  await fs.writeFile(
    path.join(outDir, 'cco-wow-v6-console-local.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        baseUrl,
        consoleErrorCount: consoleErrors.length,
        consoleErrors,
        pageErrorCount: pageErrors.length,
        pageErrors,
      },
      null,
      2
    )
  );

  await browser.close();
  console.log('CCO WOW v6 microspec evidence captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
