/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 34) {
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
    const inboundMs = now - (i + 1) * 36 * 60 * 1000;
    const hasOutbound = i % 3 !== 0;
    conversationWorklist.push({
      conversationId: `minimal-v4-video-conv-${i + 1}`,
      messageId: `minimal-v4-video-msg-${i + 1}`,
      mailboxId,
      subject: `Video-tråd ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Video bevisrad ${i + 1}.`,
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: hasOutbound ? new Date(inboundMs + 20 * 60 * 1000).toISOString() : '',
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      slaStatus: i < 5 ? 'breach' : i < 12 ? 'warning' : 'safe',
      hoursRemaining: i < 5 ? -1 : i < 12 ? 3 : 21,
      slaThreshold: 12,
      needsReplyStatus: hasOutbound ? 'active_dialogue' : 'awaiting_reply',
      isUnanswered: !hasOutbound,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 7 && i % 2 === 0,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 4 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.8,
      priorityLevel: i < 5 ? 'Critical' : i < 12 ? 'High' : 'Medium',
      priorityScore: Math.max(10, 95 - i),
      recommendedAction: i < 5 ? 'Svara omedelbart' : 'Svara idag',
      recommendedMode: i % 2 === 0 ? 'warm' : 'professional',
      draftModes: {
        short: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
        warm: 'Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar',
        professional: 'Hej,\n\nTack för ditt meddelande. Vi återkommer med tydlig återkoppling.\n\nVänliga hälsningar',
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
        model: 'synthetic-minimal-v4-video',
      },
    },
  };
}

async function main() {
  const baseUrl = process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3000';
  const outDir = path.join(process.cwd(), 'docs/ops/evidence');
  const frameDir = path.join(outDir, 'cco-minimal-v4-video-frames');
  await fs.mkdir(outDir, { recursive: true });
  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.mkdir(frameDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1510, height: 900 } });

  const output = createSyntheticCcoOutput(42);
  const delayedAnalysisPayload = JSON.stringify({ entries: [{ output: output.output }] });
  const delayedRunPayload = JSON.stringify(output);

  await page.route('**/api/v1/agents/analysis?agent=CCO&limit=1', async (route) => {
    await wait(800);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedAnalysisPayload });
  });
  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await wait(650);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedRunPayload });
  });

  let frame = 1;
  const snap = async () => {
    const fileName = `frame-${String(frame).padStart(3, '0')}.png`;
    await page.screenshot({
      path: path.join(frameDir, fileName),
      fullPage: false,
    });
    frame += 1;
  };

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/cco?evidence=minimal-v4-video-frames`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(1500);
  await page.click('#ccoInboxModeToggle [data-cco-mail-view="queue"]').catch(() => {});
  await wait(600);
  await snap();

  const firstRowBtn = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if ((await firstRowBtn.count()) && (await firstRowBtn.isVisible().catch(() => false))) {
    await firstRowBtn.click({ timeout: 10000 });
  }
  await wait(900);
  await snap();

  const draftInput = page.locator('#ccoDraftBodyInput').first();
  if ((await draftInput.count()) && (await draftInput.isVisible().catch(() => false))) {
    const currentValue = await draftInput.inputValue().catch(() => '');
    const nextValue = `${String(currentValue || '').trim()}\n\n[Video-bevis] Uppdaterad text i editor.`;
    await draftInput.fill(nextValue.trim()).catch(() => {});
  }
  await wait(900);
  await snap();

  await page.click('#ccoDraftModeWarmBtn').catch(() => {});
  await wait(700);
  await snap();

  await page.click('#ccoDraftModeProfessionalBtn').catch(() => {});
  await wait(700);
  await snap();

  await page.click('#ccoDraftModeShortBtn').catch(() => {});
  await wait(700);
  await snap();

  await page.click('#ccoCenterTabCustomerBtn').catch(() => {});
  await wait(700);
  await snap();

  await page.click('#ccoCenterTabConversationBtn').catch(() => {});
  await wait(700);
  await snap();

  for (let i = 0; i < 4; i += 1) {
    await wait(700);
    await snap();
  }

  await browser.close();
  console.log(`MINIMAL v4 video frames captured in ${frameDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
