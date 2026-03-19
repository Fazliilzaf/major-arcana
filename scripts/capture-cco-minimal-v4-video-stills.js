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
    const inboundMs = now - (i + 1) * 32 * 60 * 1000;
    const hasOutbound = i % 3 !== 0;
    conversationWorklist.push({
      conversationId: `minimal-v4-still-conv-${i + 1}`,
      messageId: `minimal-v4-still-msg-${i + 1}`,
      mailboxId,
      subject: `Stills-tråd ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Video still ${i + 1}`,
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: hasOutbound ? new Date(inboundMs + 16 * 60 * 1000).toISOString() : '',
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      slaStatus: i < 4 ? 'breach' : i < 10 ? 'warning' : 'safe',
      hoursRemaining: i < 4 ? -2 : i < 10 ? 4 : 21,
      slaThreshold: 12,
      needsReplyStatus: hasOutbound ? 'active_dialogue' : 'awaiting_reply',
      isUnanswered: !hasOutbound,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 7 && i % 2 === 0,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 4 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.82,
      priorityLevel: i < 4 ? 'Critical' : i < 10 ? 'High' : 'Medium',
      priorityScore: Math.max(10, 97 - i),
      recommendedAction: i < 4 ? 'Svara omedelbart' : 'Svara idag',
      recommendedMode: i % 2 === 0 ? 'warm' : 'professional',
      draftModes: {
        short: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
        warm: 'Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar',
        professional: 'Hej,\n\nTack för ditt meddelande. Vi återkommer med tydlig återkoppling.\n\nVänliga hälsningar',
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
        model: 'synthetic-minimal-v4-stills',
      },
    },
  };
}

async function main() {
  const baseUrl = process.env.ARCANA_BASE_URL || 'http://127.0.0.1:3000';
  const outDir = path.join(process.cwd(), 'docs/ops/evidence');
  const stillDir = path.join(outDir, 'cco-minimal-v4-video-stills');
  await fs.mkdir(outDir, { recursive: true });
  await fs.rm(stillDir, { recursive: true, force: true });
  await fs.mkdir(stillDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1510, height: 900 } });

  const output = createSyntheticCcoOutput(36);
  const delayedAnalysisPayload = JSON.stringify({ entries: [{ output: output.output }] });
  const delayedRunPayload = JSON.stringify(output);

  await page.route('**/api/v1/agents/analysis?agent=CCO&limit=1', async (route) => {
    await wait(750);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedAnalysisPayload });
  });
  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await wait(600);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedRunPayload });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto(`${baseUrl}/cco?evidence=minimal-v4-video-stills`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(1400);
  await page.click('#ccoInboxModeToggle [data-cco-mail-view="queue"]').catch(() => {});
  await wait(700);

  const firstRowBtn = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if ((await firstRowBtn.count()) && (await firstRowBtn.isVisible().catch(() => false))) {
    await firstRowBtn.click({ timeout: 10000 });
  }
  await wait(700);
  await page.screenshot({
    path: path.join(stillDir, 'step-1-click-read.jpg'),
    type: 'jpeg',
    quality: 82,
    fullPage: false,
  });

  const draftInput = page.locator('#ccoDraftBodyInput').first();
  if ((await draftInput.count()) && (await draftInput.isVisible().catch(() => false))) {
    const currentValue = await draftInput.inputValue().catch(() => '');
    const nextValue = `${String(currentValue || '').trim()}\n\n[Video-bevis] Ny rad i editor.`;
    await draftInput.fill(nextValue.trim()).catch(() => {});
  }
  await page.click('#ccoDraftModeWarmBtn').catch(() => {});
  await wait(700);
  await page.screenshot({
    path: path.join(stillDir, 'step-2-write-warm.jpg'),
    type: 'jpeg',
    quality: 82,
    fullPage: false,
  });

  await page.click('#ccoDraftModeProfessionalBtn').catch(() => {});
  await wait(700);
  await page.screenshot({
    path: path.join(stillDir, 'step-3-toggle-professional.jpg'),
    type: 'jpeg',
    quality: 82,
    fullPage: false,
  });

  await browser.close();
  console.log(`MINIMAL v4 video stills captured in ${stillDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
