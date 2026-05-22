/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 120) {
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
    const inboundMs = now - i * 43 * 60 * 1000;
    const critical = i < 8;
    const high = i >= 8 && i < 35;
    rows.push({
      conversationId: `polish-conv-${i + 1}`,
      messageId: `polish-msg-${i + 1}`,
      mailboxId,
      subject: `Kundärende ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Polish evidence preview för konversation ${i + 1}.`,
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: '',
      slaStatus: critical ? 'breach' : high ? 'warning' : 'safe',
      hoursRemaining: critical ? -1 : high ? 3 : 22,
      slaThreshold: 12,
      isUnanswered: true,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 25,
      intent: i % 3 === 0 ? 'booking_request' : 'follow_up',
      intentConfidence: 0.84,
      tone: i % 5 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.77,
      priorityLevel: critical ? 'Critical' : high ? 'High' : 'Medium',
      priorityScore: Math.max(10, 98 - i),
      dominantRisk: critical ? 'miss' : i % 5 === 0 ? 'tone' : 'follow_up',
      recommendedAction: critical ? 'Svara inom 1h' : 'Skicka uppföljning idag',
      recommendedMode: i % 5 === 0 ? 'warm' : 'professional',
      draftModes: {
        short: `Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar`,
        warm: `Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar`,
        professional: `Hej,\n\nTack för ditt meddelande. Vi återkommer med tydlig återkoppling.\n\nVänliga hälsningar`,
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
          draftId: `polish-draft-${idx + 1}`,
          subject: `Re: ${row.subject}`,
          body: `Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar`,
          priorityLevel: row.priorityLevel,
          confidence: 0.8,
        })),
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'synthetic-polish-evidence',
      },
    },
  };
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
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
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } });

  const syntheticOutput = createSyntheticCcoOutput(160);
  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syntheticOutput),
    });
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate((sessionToken) => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);
  await page.goto(`${baseUrl}/cco`, { waitUntil: 'networkidle', timeout: 45000 });

  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(500);

  await page.click('#runCcoInboxBtn').catch(() => {});
  await wait(1000);

  await page.screenshot({ path: path.join(outDir, 'cco-polish-mailbox-short-labels-local.png'), fullPage: true });

  await page.fill('#ccoInboxSearchInput', 'zzzz-no-match-polish').catch(() => {});
  await wait(500);
  await page.screenshot({ path: path.join(outDir, 'cco-polish-empty-state-local.png'), fullPage: true });

  await page.click('#ccoClearFiltersBtn').catch(() => {});
  await wait(500);

  const firstThread = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn').first();
  if (await firstThread.count()) {
    await firstThread.click({ timeout: 10000 }).catch(() => {});
    await wait(600);
  }
  await page.screenshot({ path: path.join(outDir, 'cco-polish-selected-thread-local.png'), fullPage: true });

  await page.click('#ccoToggleSignaturePreviewBtn').catch(() => {});
  await wait(300);
  await page.screenshot({ path: path.join(outDir, 'cco-polish-signature-preview-local.png'), fullPage: true });

  await page.setViewportSize({ width: 1540, height: 1020 });
  await wait(300);
  await page.screenshot({ path: path.join(outDir, 'cco-polish-top-compact-local.png'), fullPage: true });

  await browser.close();
  console.log('Polish evidence screenshots captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
