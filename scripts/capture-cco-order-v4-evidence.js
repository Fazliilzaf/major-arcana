/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 30) {
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
    const inboundMs = now - (i + 1) * 31 * 60 * 1000;
    const hasOutbound = i % 3 !== 0;
    const outboundMs = hasOutbound ? inboundMs + 12 * 60 * 1000 : null;
    conversationWorklist.push({
      conversationId: `order-v4-conv-${i + 1}`,
      messageId: `order-v4-msg-${i + 1}`,
      mailboxId,
      subject: `ORDER v4 tråd ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Maskad preview för order v4 ${i + 1}.`,
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: outboundMs ? new Date(outboundMs).toISOString() : '',
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      slaStatus: i < 3 ? 'breach' : i < 9 ? 'warning' : 'safe',
      hoursRemaining: i < 3 ? -2 : i < 9 ? 3 : 24,
      slaThreshold: 12,
      needsReplyStatus: hasOutbound ? 'active_dialogue' : 'awaiting_reply',
      isUnanswered: !hasOutbound,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 8 && i % 2 === 0,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 3 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.82,
      priorityLevel: i < 3 ? 'Critical' : i < 9 ? 'High' : 'Medium',
      priorityScore: Math.max(10, 97 - i),
      recommendedAction: i < 3 ? 'Svara omedelbart' : 'Svara idag',
      recommendedMode: i % 2 === 0 ? 'professional' : 'warm',
      draftModes: {
        short: 'Hej,\n\nTack for ditt meddelande.\n\nVanliga halsningar',
        warm: 'Hej,\n\nTack for att du hor av dig. Vi hjalper dig garna vidare.\n\nVanliga halsningar',
        professional: 'Hej,\n\nTack for ditt meddelande. Vi aterkommer med tydlig aterkoppling.\n\nVanliga halsningar',
      },
      customerSummary: {
        customerName: `Kund ${i + 1}`,
        lifecycleStatus: i % 2 === 0 ? 'ACTIVE_DIALOGUE' : 'AWAITING_REPLY',
        interactionCount: (i % 5) + 1,
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
        model: 'synthetic-order-v4',
      },
    },
  };
}

async function main() {
  const baseUrl = process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3000';
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
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.message || error));
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => {
    window.localStorage.clear();
  });

  await page.goto(`${baseUrl}/cco?evidence=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(2200);

  await page.screenshot({
    path: path.join(outDir, 'cco-order-v4-1-workqueue.png'),
    fullPage: true,
  });

  const firstQueueRow = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if (await firstQueueRow.count()) {
    await firstQueueRow.click({ timeout: 10000 });
    await wait(400);
  }

  await page.screenshot({
    path: path.join(outDir, 'cco-order-v4-2-clicked-row.png'),
    fullPage: true,
  });

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="inbound"]').catch(() => {});
  await wait(450);
  await page.screenshot({
    path: path.join(outDir, 'cco-order-v4-3-inbound-readonly.png'),
    fullPage: true,
  });

  const replyColumn = page.locator('#ccoReplyColumn');
  if (await replyColumn.count()) {
    await replyColumn.screenshot({
      path: path.join(outDir, 'cco-order-v4-4-readpanel.png'),
    });
  }

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="sent"]').catch(() => {});
  await wait(450);
  await page.screenshot({
    path: path.join(outDir, 'cco-order-v4-5-sent-readonly.png'),
    fullPage: true,
  });

  const consoleErrors = consoleMessages.filter((entry) => entry.type === 'error');
  await fs.writeFile(
    path.join(outDir, 'cco-order-v4-console-local.json'),
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
  console.log('ORDER v4 evidence captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
