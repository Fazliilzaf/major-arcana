/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 80) {
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
    const inboundMs = now - i * 51 * 60 * 1000;
    const isCritical = i < 6;
    const isHigh = i >= 6 && i < 20;
    const needsReply = i < 50;
    const priorityLevel = isCritical ? 'Critical' : isHigh ? 'High' : i < 40 ? 'Medium' : 'Low';
    const slaStatus = isCritical ? 'breach' : isHigh ? 'warning' : 'safe';
    const intent = i % 6 === 0 ? 'complaint' : i % 3 === 0 ? 'booking_request' : 'follow_up';
    const tone = i % 5 === 0 ? 'frustrated' : i % 4 === 0 ? 'anxious' : 'neutral';
    const conversationId = `conv-flow-${String(i + 1).padStart(3, '0')}`;
    conversationWorklist.push({
      conversationId,
      messageId: `msg-flow-${String(i + 1).padStart(3, '0')}`,
      mailboxId,
      subject: `Kundärende ${i + 1} – ${intent}`,
      sender: `kund${String(i + 1).padStart(3, '0')}@example.com`,
      latestInboundPreview: `Flow-test ${i + 1}: behöver återkoppling med tydlig nästa åtgärd.`,
      hoursSinceInbound: Number(((now - inboundMs) / (1000 * 60 * 60)).toFixed(1)),
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: needsReply ? '' : new Date(inboundMs + 15 * 60 * 1000).toISOString(),
      slaStatus,
      hoursRemaining: isCritical ? -1 : isHigh ? 3 : 20,
      slaThreshold: intent === 'complaint' ? 6 : 12,
      isUnanswered: needsReply,
      unansweredThresholdHours: intent === 'complaint' ? 6 : 24,
      followUpSuggested: i >= 25 && i < 60,
      intent,
      intentConfidence: 0.84,
      tone,
      toneConfidence: 0.79,
      priorityLevel,
      priorityScore: Math.max(10, 97 - i),
      dominantRisk: slaStatus === 'breach' ? 'miss' : tone !== 'neutral' ? 'tone' : 'follow_up',
      recommendedAction:
        slaStatus === 'breach'
          ? 'Svara inom 1h'
          : tone !== 'neutral'
          ? 'Svara lugnande och tydligt'
          : 'Skicka mjuk uppföljning idag',
      recommendedMode: tone !== 'neutral' ? 'warm' : 'professional',
      draftModes: {
        short: `Hej ${`Kund Flow ${i + 1}`},\n\nTack för ditt meddelande. Vi återkommer strax.\n\nVänliga hälsningar,\nTeam Hair TP Clinic`,
        warm: `Hej ${`Kund Flow ${i + 1}`},\n\nTack för att du hör av dig. Vi förstår din situation och hjälper dig gärna vidare med nästa steg.\n\nVänliga hälsningar,\nTeam Hair TP Clinic`,
        professional: `Hej ${`Kund Flow ${i + 1}`},\n\nTack för ditt meddelande. Vi har registrerat ditt ärende och återkommer med tydlig återkoppling enligt prioriterad handläggning.\n\nVänliga hälsningar,\nTeam Hair TP Clinic`,
      },
      customerKey: `customer-flow-${String(i + 1).padStart(3, '0')}`,
      customerSummary: {
        customerKey: `customer-flow-${String(i + 1).padStart(3, '0')}`,
        customerName: `Kund Flow ${i + 1}`,
        lifecycleStatus: i % 4 === 0 ? 'ACTIVE_DIALOGUE' : 'AWAITING_REPLY',
        interactionCount: (i % 5) + 1,
        timeline: [
          {
            occurredAt: new Date(inboundMs - 24 * 60 * 60 * 1000).toISOString(),
            subject: `Äldre ärende ${i + 1}`,
            status: 'closed',
          },
          {
            occurredAt: new Date(inboundMs).toISOString(),
            subject: `Aktuellt ärende ${i + 1}`,
            status: needsReply ? 'inbound' : 'outbound',
          },
        ],
      },
      messageClassification: i % 15 === 0 ? 'system_mail' : 'actionable',
    });
  }

  const actionable = conversationWorklist.filter((item) => item.messageClassification === 'actionable');
  return {
    output: {
      data: {
        generatedAt: new Date().toISOString(),
        conversationWorklist,
        suggestedDrafts: actionable.slice(0, 5).map((row, idx) => ({
          conversationId: row.conversationId,
          draftId: `draft-flow-${idx + 1}`,
          subject: `Re: ${row.subject}`,
          body: `Hej ${row.customerSummary.customerName},\n\nTack för ditt meddelande. Vi återkopplar med tydlig nästa åtgärd.\n\nBästa hälsningar,\nEgzona`,
          priorityLevel: row.priorityLevel,
          confidence: 0.8,
        })),
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'synthetic-flow-evidence',
      },
    },
  };
}

async function clickSafe(page, selector, timeout = 12000) {
  const loc = page.locator(selector).first();
  try {
    await loc.waitFor({ state: 'visible', timeout });
  } catch {
    return false;
  }
  const isDisabled = await loc.evaluate((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const disabledAttr = el.hasAttribute('disabled');
    const disabledProp =
      'disabled' in el && typeof el.disabled === 'boolean' ? Boolean(el.disabled) : false;
    return disabledAttr || disabledProp || el.getAttribute('aria-disabled') === 'true';
  });
  if (isDisabled) return false;
  await loc.click({ timeout });
  return true;
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:4070').replace(/\/$/, '');
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
    throw new Error(`Kunde inte hämta token (${loginResponse.status}): ${String(loginPayload?.error || 'okänt fel')}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1080 },
    recordVideo: {
      dir: outDir,
      size: { width: 1680, height: 1080 },
    },
  });
  const page = await context.newPage();
  let deleteEnabledFlag = true;
  const deleteRequests = [];
  const dialogMessages = [];

  const syntheticOutput = createSyntheticCcoOutput(90);
  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syntheticOutput),
    });
  });
  await page.route('**/api/v1/cco/delete/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        deleteEnabled: deleteEnabledFlag,
        reasonCode: deleteEnabledFlag ? null : 'CCO_DELETE_NOT_ENABLED',
        reason: deleteEnabledFlag ? null : 'Radera mail är inte aktiverat i denna miljö.',
      }),
    });
  });
  await page.route('**/api/v1/cco/delete', async (route) => {
    const request = route.request();
    const body = request.postDataJSON ? request.postDataJSON() : {};
    deleteRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        mode: 'soft_delete',
        softDelete: true,
        mailboxId: body?.mailboxId || 'contact@hairtpclinic.com',
        messageId: body?.messageId || 'msg-delete-proof',
        conversationId: body?.conversationId || 'conv-delete-proof',
        deleteResult: {
          provider: 'microsoft_graph',
          movedMessageId: body?.messageId || 'msg-delete-proof',
          destinationFolderId: 'deleteditems',
          deletedAt: new Date().toISOString(),
        },
      }),
    });
  });

  page.on('dialog', async (dialog) => {
    dialogMessages.push({
      type: dialog.type(),
      message: dialog.message(),
    });
    await dialog.accept();
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate((sessionToken) => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);
  await page.goto(`${baseUrl}/cco?thread=conv-flow-002`, { waitUntil: 'domcontentloaded', timeout: 45000 });

  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => {
    const ccoButton = document.querySelector('.sectionNavBtn[data-target="ccoWorkspaceSection"]');
    if (ccoButton instanceof HTMLElement) ccoButton.click();
  });
  await sleep(500);
  await clickSafe(page, '#runCcoInboxBtn');
  await sleep(900);

  const workModeBtn = page.locator('#ccoInboxDensityFilters [data-cco-density-mode="work"]').first();
  if (await workModeBtn.count()) {
    await workModeBtn.click({ timeout: 8000, force: true }).catch(() => {});
    await sleep(300);
  }

  await clickSafe(page, '#ccoInboxWorklist .ccoConversationSelectBtn');
  await sleep(700);
  const conversationMeta = await page.locator('#ccoConversationMeta').first().innerText().catch(() => '');
  const warmDisabled = await page
    .locator('#ccoDraftModeWarmBtn')
    .first()
    .evaluate((el) => el.disabled)
    .catch(() => true);
  console.log('Flow debug meta:', String(conversationMeta || '').trim());
  console.log('Flow debug warmDisabled:', warmDisabled);
  await page
    .waitForFunction(() => {
      const button = document.getElementById('ccoDraftModeWarmBtn');
      return !!button && button.disabled === false;
    }, { timeout: 12000 })
    .catch(() => {});

  const historyBtn = page.locator('button[data-cco-history-entry-id]').first();
  if (await historyBtn.count()) {
    await historyBtn.click({ timeout: 10000 });
    await sleep(500);
  }
  await page.screenshot({ path: path.join(outDir, 'cco-timeline-selected-local.png'), fullPage: true });

  await clickSafe(page, '#ccoDraftModeWarmBtn');
  await sleep(400);
  await clickSafe(page, '#ccoDraftModeProfessionalBtn');
  await sleep(400);
  await page.screenshot({ path: path.join(outDir, 'cco-scaling-50-plus-local.png'), fullPage: true });

  await clickSafe(page, '.cco-actions-more > summary');
  await sleep(250);
  await clickSafe(page, '#ccoCopyReplyBtn');
  await sleep(500);
  await clickSafe(page, '#ccoSnoozeBtn');
  await sleep(500);
  await clickSafe(page, '#ccoMarkSystemMailBtn');
  await sleep(500);
  await clickSafe(page, '#ccoDeleteMailBtn');
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, 'cco-delete-enabled-local.png'), fullPage: true });

  deleteEnabledFlag = false;
  await page.goto(`${baseUrl}/cco?thread=conv-flow-002&arcana_reset=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => {
    const ccoButton = document.querySelector('.sectionNavBtn[data-target="ccoWorkspaceSection"]');
    if (ccoButton instanceof HTMLElement) ccoButton.click();
  });
  await sleep(500);
  await clickSafe(page, '#runCcoInboxBtn');
  await sleep(900);
  await clickSafe(page, '#ccoInboxWorklist .ccoConversationSelectBtn');
  await sleep(600);
  await page.screenshot({ path: path.join(outDir, 'cco-delete-disabled-local.png'), fullPage: true });

  await page.screenshot({ path: path.join(outDir, 'cco-flow-video-final-frame.png'), fullPage: true });

  const video = page.video();
  await context.close();
  await browser.close();

  const rawVideoPath = await video.path();
  const targetPath = path.join(outDir, 'cco-flow-interaction.webm');
  await fs.copyFile(rawVideoPath, targetPath);
  await fs.writeFile(
    path.join(outDir, 'cco-delete-proof-local.json'),
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        deleteRequests,
        dialogMessages,
        note: 'dialogMessages contains confirm-dialog text; deleteRequests shows softDelete payload; mocked response destinationFolderId=deleteditems.',
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(`Flow video captured: ${targetPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
