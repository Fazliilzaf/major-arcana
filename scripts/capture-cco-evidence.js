/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickIfExists(page, selector) {
  const el = page.locator(selector).first();
  if (await el.count()) {
    await el.click({ timeout: 5000 }).catch(() => {});
  }
}

async function textOf(page, selector) {
  const el = page.locator(selector).first();
  if (!(await el.count())) return '';
  return String(await el.innerText()).trim();
}

function createSyntheticCcoOutput(totalRows = 236) {
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
    const inboundMs = now - i * 37 * 60 * 1000;
    const isCritical = i < 12;
    const isHigh = i >= 12 && i < 48;
    const needsReply = i < 180;
    const priorityLevel = isCritical ? 'Critical' : isHigh ? 'High' : i < 140 ? 'Medium' : 'Low';
    const slaStatus = isCritical ? 'breach' : isHigh ? 'warning' : 'safe';
    const intent = i % 9 === 0 ? 'complaint' : i % 3 === 0 ? 'booking_request' : 'follow_up';
    const tone = i % 11 === 0 ? 'frustrated' : i % 7 === 0 ? 'anxious' : 'neutral';
    const conversationId = `conv-${String(i + 1).padStart(3, '0')}`;
    conversationWorklist.push({
      conversationId,
      messageId: `msg-${String(i + 1).padStart(3, '0')}`,
      mailboxId,
      subject: `Kundärende ${i + 1} – ${intent}`,
      sender: `kund${String(i + 1).padStart(3, '0')}@example.com`,
      latestInboundPreview: `Detta är testkonversation ${i + 1} för UI-skalning och overflow-verifiering.`,
      hoursSinceInbound: Number(((now - inboundMs) / (1000 * 60 * 60)).toFixed(1)),
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: needsReply ? '' : new Date(inboundMs + 12 * 60 * 1000).toISOString(),
      slaStatus,
      hoursRemaining: isCritical ? -2 : isHigh ? 2 : 26,
      slaThreshold: intent === 'complaint' ? 6 : 12,
      isUnanswered: needsReply,
      unansweredThresholdHours: intent === 'complaint' ? 6 : 24,
      stagnated: i >= 90 && i < 130,
      stagnationHours: i >= 90 && i < 130 ? 55 : 0,
      followUpSuggested: i >= 70 && i < 170,
      intent,
      intentConfidence: 0.82,
      tone,
      toneConfidence: 0.79,
      priorityLevel,
      priorityScore: Math.max(5, 99 - i * 0.31),
      dominantRisk:
        slaStatus === 'breach'
          ? 'miss'
          : tone === 'frustrated' || tone === 'anxious'
          ? 'tone'
          : i >= 70 && i < 170
          ? 'follow_up'
          : 'relationship',
      recommendedAction:
        slaStatus === 'breach'
          ? 'Svara inom 1h'
          : tone === 'frustrated' || tone === 'anxious'
          ? 'Svara lugnande och tydligt'
          : 'Skicka mjuk uppföljning idag',
      customerKey: `customer-${String(i + 1).padStart(3, '0')}`,
      customerSummary: {
        customerKey: `customer-${String(i + 1).padStart(3, '0')}`,
        customerName: `Kund ${i + 1}`,
        lifecycleStatus: i % 13 === 0 ? 'ACTIVE_DIALOGUE' : i % 5 === 0 ? 'AWAITING_REPLY' : 'NEW',
        interactionCount: (i % 8) + 1,
        timeline: [
          {
            occurredAt: new Date(inboundMs).toISOString(),
            subject: `Kundärende ${i + 1}`,
            status: needsReply ? 'inbound' : 'outbound',
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
        suggestedDrafts: conversationWorklist.slice(0, 5).map((row, idx) => ({
          conversationId: row.conversationId,
          draftId: `draft-${idx + 1}`,
          subject: `Re: ${row.subject}`,
          body: `Hej ${row.customerSummary.customerName},\n\nTack för ditt meddelande.\n\nBästa hälsningar,\nEgzona`,
          priorityLevel: row.priorityLevel,
          confidence: 0.78,
        })),
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'synthetic-ui-evidence',
      },
    },
  };
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
    body: JSON.stringify({
      email,
      password,
      tenantId: tenant,
    }),
  });
  const loginPayload = await loginResponse.json();
  const token = String(loginPayload?.token || '');
  if (!loginResponse.ok || !token) {
    throw new Error(
      `Kunde inte hämta token för screenshot-capture (${loginResponse.status}): ${String(
        loginPayload?.error || 'okänt fel'
      )}`
    );
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } });

  const syntheticOutput = createSyntheticCcoOutput(236);
  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syntheticOutput),
    });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate((sessionToken) => {
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);
  await page.goto(`${baseUrl}/cco`, { waitUntil: 'networkidle', timeout: 45000 });

  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await clickIfExists(page, '.sectionNavBtn[data-target="ccoWorkspaceSection"]');
  await wait(500);

  await clickIfExists(page, '#runCcoInboxBtn');
  await wait(800);

  await clickIfExists(page, '#ccoInboxDensityFilters [data-cco-density-mode="focus"]');
  await wait(300);
  await page.screenshot({ path: path.join(outDir, 'cco-focus-local.png'), fullPage: true });

  await clickIfExists(page, '#ccoInboxDensityFilters [data-cco-density-mode="work"]');
  await wait(300);
  await page.screenshot({ path: path.join(outDir, 'cco-work-local.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'cco-column-order-local.png'), fullPage: true });
  await page.screenshot({ path: path.join(outDir, 'cco-200-plus-local.png'), fullPage: true });

  await clickIfExists(page, '#ccoInboxDensityFilters [data-cco-density-mode="overview"]');
  await wait(300);
  await page.screenshot({ path: path.join(outDir, 'cco-overview-local.png'), fullPage: true });

  await clickIfExists(page, '#ccoInboxDensityFilters [data-cco-density-mode="work"]');
  await wait(200);

  await page.setViewportSize({ width: 1680, height: 1080 });
  await wait(200);
  await page.screenshot({ path: path.join(outDir, 'cco-viewport-gt-1500-local.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1080 });
  await wait(300);
  await page.screenshot({ path: path.join(outDir, 'cco-viewport-lt-1500-local.png'), fullPage: true });

  const metrics = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    sectionCounts: {
      sprint: await textOf(page, '#ccoInboxGroupAcuteCount'),
      high: await textOf(page, '#ccoInboxGroupTodayCount'),
      needs: await textOf(page, '#ccoInboxGroupFollowupCount'),
      rest: await textOf(page, '#ccoInboxGroupOtherCount'),
    },
    sectionMeta: {
      sprint: await textOf(page, '#ccoInboxGroupAcuteMeta'),
      high: await textOf(page, '#ccoInboxGroupTodayMeta'),
      needs: await textOf(page, '#ccoInboxGroupFollowupMeta'),
      rest: await textOf(page, '#ccoInboxGroupOtherMeta'),
    },
    notes: [
      'local-auth snapshot',
      'synthetic 236-row worklist injected via route fulfill for 200+ verification',
      'density modes captured',
      'viewport >1500 and <1500 captured',
    ],
  };

  await fs.writeFile(
    path.join(outDir, 'cco-ui-evidence-local.json'),
    `${JSON.stringify(metrics, null, 2)}\n`,
    'utf8'
  );

  await browser.close();
  console.log('Screenshots captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
