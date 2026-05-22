/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 24) {
  const now = Date.now();
  const mailboxPool = [
    'contact@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
    'marknad@hairtpclinic.com',
  ];
  const rows = [];
  for (let i = 0; i < totalRows; i += 1) {
    const mailboxId = mailboxPool[i % mailboxPool.length];
    const inboundMs = now - i * 34 * 60 * 1000;
    rows.push({
      conversationId: `p0-conv-${i + 1}`,
      messageId: `p0-msg-${i + 1}`,
      mailboxId,
      subject: `P0 klicktest ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Detta är klicktest-rad ${i + 1}.`,
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: '',
      slaStatus: i < 3 ? 'breach' : i < 8 ? 'warning' : 'safe',
      hoursRemaining: i < 3 ? -2 : i < 8 ? 3 : 22,
      slaThreshold: 12,
      isUnanswered: true,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 7,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 3 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.8,
      priorityLevel: i < 3 ? 'Critical' : i < 8 ? 'High' : 'Medium',
      priorityScore: Math.max(10, 96 - i),
      dominantRisk: i < 3 ? 'miss' : i % 3 === 0 ? 'tone' : 'follow_up',
      recommendedAction: i < 3 ? 'Svara omedelbart' : 'Svara idag',
      recommendedMode: i % 2 === 0 ? 'professional' : 'warm',
      draftModes: {
        short: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
        warm: 'Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar',
        professional: 'Hej,\n\nTack för ditt meddelande. Vi återkommer med tydlig återkoppling.\n\nVänliga hälsningar',
      },
      customerSummary: {
        customerName: `Kund ${i + 1}`,
        lifecycleStatus: i % 2 === 0 ? 'ACTIVE_DIALOGUE' : 'AWAITING_REPLY',
        interactionCount: (i % 4) + 1,
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
        conversationWorklist: rows,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'synthetic-p0',
      },
    },
  };
}

async function main() {
  const baseUrl = process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3000';
  const evidenceMode = process.env.ARCANA_EVIDENCE_MODE !== '0';

  const outDir = path.join(process.cwd(), 'docs/ops/evidence');
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1510, height: 900 } });

  const output = createSyntheticCcoOutput(30);
  const delayedAnalysisPayload = JSON.stringify({ entries: [{ output: output.output }] });
  const delayedRunPayload = JSON.stringify(output);

  await page.route('**/api/v1/agents/analysis?agent=CCO&limit=1', async (route) => {
    await wait(900);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedAnalysisPayload });
  });

  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await wait(700);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedRunPayload });
  });

  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_CCO_DEBUG_CLICKS', '1');
  });

  const ccoUrl = evidenceMode
    ? `${baseUrl}/cco?evidence=1&cco_debug_clicks=1`
    : `${baseUrl}/cco?cco_debug_clicks=1`;
  await page.goto(ccoUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});

  await wait(2200);
  await page.screenshot({ path: path.join(outDir, 'cco-p0-before-click-local.png'), fullPage: true });

  const firstRow = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if (await firstRow.count()) {
    await firstRow.click({ timeout: 10000 });
    await wait(400);
  }

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="inbound"]').catch(() => {});
  await wait(250);
  await page.click('#ccoInboxModeToggle [data-cco-mail-view="sent"]').catch(() => {});
  await wait(250);
  await page.click('#ccoInboxModeToggle [data-cco-mail-view="queue"]').catch(() => {});
  await wait(250);
  await page.click('#runCcoInboxBtn').catch(() => {});
  await wait(1000);

  await page.screenshot({ path: path.join(outDir, 'cco-p0-after-click-local.png'), fullPage: true });

  const debugOnly = consoleMessages.filter((entry) => entry.text.includes('[CCO click-debug]'));
  const errors = consoleMessages.filter((entry) => entry.type === 'error');

  await fs.writeFile(
    path.join(outDir, 'cco-p0-click-debug-local.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        baseUrl,
        evidenceMode,
        debugLogCount: debugOnly.length,
        debugLogs: debugOnly,
        consoleErrorCount: errors.length,
        consoleErrors: errors,
        pageErrorCount: pageErrors.length,
        pageErrors,
      },
      null,
      2
    )
  );

  await browser.close();
  console.log('P0 click evidence saved to', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
