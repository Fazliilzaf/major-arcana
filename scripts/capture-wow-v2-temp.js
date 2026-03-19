/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
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
  const rows = [];
  for (let i = 0; i < totalRows; i += 1) {
    const mailboxId = mailboxPool[i % mailboxPool.length];
    const inboundMs = now - i * 39 * 60 * 1000;
    const critical = i < 6;
    const high = i >= 6 && i < 22;
    rows.push({
      conversationId: `wow2-conv-${i + 1}`,
      messageId: `wow2-msg-${i + 1}`,
      mailboxId,
      subject: `Uppföljning kund ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Detta är en förhandsvisning för konversation ${i + 1}.`,
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: '',
      slaStatus: critical ? 'breach' : high ? 'warning' : 'safe',
      hoursRemaining: critical ? -1 : high ? 2 : 20,
      slaThreshold: 12,
      isUnanswered: true,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 18,
      intent: i % 3 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 4 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.75,
      priorityLevel: critical ? 'Critical' : high ? 'High' : 'Medium',
      priorityScore: Math.max(10, 95 - i),
      dominantRisk: critical ? 'miss' : i % 4 === 0 ? 'tone' : 'follow_up',
      recommendedAction: critical ? 'Svara inom 1h' : 'Skicka uppföljning idag',
      recommendedMode: i % 4 === 0 ? 'warm' : 'professional',
      draftModes: {
        short: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
        warm: 'Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar',
        professional: 'Hej,\n\nTack för ditt meddelande. Vi återkommer med tydlig återkoppling.\n\nVänliga hälsningar',
      },
      customerSummary: {
        customerName: `Kund ${i + 1}`,
        lifecycleStatus: i % 4 === 0 ? 'ACTIVE_DIALOGUE' : 'AWAITING_REPLY',
        interactionCount: (i % 6) + 1,
        timeline: [
          {
            occurredAt: new Date(inboundMs).toISOString(),
            subject: `Ärende ${i + 1}`,
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
        suggestedDrafts: rows.slice(0, 5).map((row, idx) => ({
          conversationId: row.conversationId,
          draftId: `wow2-draft-${idx + 1}`,
          subject: `Re: ${row.subject}`,
          body: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
          priorityLevel: row.priorityLevel,
          confidence: 0.8,
        })),
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'synthetic-wow-v2',
      },
    },
  };
}

async function main() {
  const baseUrl = 'http://127.0.0.1:3000';
  const email = 'fazli@hairtpclinic.com';
  const password = 'ArcanaPilot!2026';
  const tenant = 'hair-tp-clinic';
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
    throw new Error(`Login failed (${loginResponse.status}): ${String(loginPayload?.error || 'okänt fel')}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1510, height: 940 } });

  const syntheticOutput = createSyntheticCcoOutput(90);
  const delayedPayload = JSON.stringify({ entries: [{ output: syntheticOutput.output }] });
  const delayedRunPayload = JSON.stringify(syntheticOutput);

  await page.route('**/api/v1/agents/analysis?agent=CCO&limit=1', async (route) => {
    await wait(1300);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: delayedPayload,
    });
  });

  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await wait(900);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: delayedRunPayload,
    });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate((sessionToken) => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);

  await page.goto(`${baseUrl}/cco`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});

  // loading state while delayed analysis is in-flight
  await wait(350);
  await page.screenshot({
    path: path.join(outDir, 'cco-wowv2-loading-local.png'),
    fullPage: true,
  });

  // loaded state
  await wait(1500);
  await page.screenshot({
    path: path.join(outDir, 'cco-wowv2-3col-noscroll-local.png'),
    fullPage: true,
  });

  // left accordion expanded + compact filters
  await page.click('#ccoExtraFiltersToggleBtn').catch(() => {});
  await wait(300);
  await page.screenshot({
    path: path.join(outDir, 'cco-wowv2-left-accordion-local.png'),
    fullPage: true,
  });

  // split proof (worklist + read both visible)
  await page.screenshot({
    path: path.join(outDir, 'cco-wowv2-center-split-local.png'),
    fullPage: true,
  });

  // hover + selected thread proof
  const firstThread = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if (await firstThread.count()) {
    await firstThread.hover();
    await wait(250);
    await page.screenshot({
      path: path.join(outDir, 'cco-wowv2-worklist-hover-local.png'),
      fullPage: true,
    });
    await firstThread.click({ timeout: 10000 });
    await wait(450);
    await page.screenshot({
      path: path.join(outDir, 'cco-wowv2-worklist-selected-local.png'),
      fullPage: true,
    });
  }

  await browser.close();
  console.log('WOW v2 evidence captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
