/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 54) {
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
    const inboundMs = now - (i + 1) * 24 * 60 * 1000;
    const hasOutbound = i % 4 !== 0;
    const outboundMs = hasOutbound ? inboundMs + 12 * 60 * 1000 : null;
    const priorityLevel = i < 5 ? 'Critical' : i < 16 ? 'High' : i < 32 ? 'Medium' : 'Low';
    const slaStatus = i < 5 ? 'breach' : i < 16 ? 'warning' : 'safe';
    const recommendedMode = i % 3 === 0 ? 'professional' : i % 3 === 1 ? 'warm' : 'short';

    conversationWorklist.push({
      conversationId: `v5_1-conv-${i + 1}`,
      messageId: `v5_1-msg-${i + 1}`,
      mailboxId,
      subject: `CCO v5.1 tråd ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Förhandsvisning för CCO v5.1 rad ${i + 1}.`,
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: outboundMs ? new Date(outboundMs).toISOString() : '',
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      slaStatus,
      hoursRemaining: i < 5 ? -2 : i < 16 ? 3 : 28,
      slaThreshold: 12,
      needsReplyStatus: hasOutbound ? 'active_dialogue' : 'awaiting_reply',
      isUnanswered: !hasOutbound,
      unansweredThresholdHours: 24,
      followUpSuggested: i % 2 === 0,
      stagnated: i % 7 === 0,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 4 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.81,
      priorityLevel,
      priorityScore: Math.max(8, 98 - i),
      recommendedAction: i < 5 ? 'Svara omedelbart' : i < 16 ? 'Svara idag' : 'Planera uppföljning',
      recommendedMode,
      draftModes: {
        short: 'Hej,\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
        warm: 'Hej,\n\nTack för att du hör av dig. Vi hjälper dig gärna vidare.\n\nVänliga hälsningar',
        professional: 'Hej,\n\nTack för ditt meddelande. Vi återkopplar med tydlig plan och nästa steg.\n\nVänliga hälsningar',
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
        model: 'synthetic-v5_1',
      },
    },
  };
}

async function main() {
  const baseUrl = String(process.env.ARCANA_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const output = createSyntheticCcoOutput(54);
  const delayedAnalysisPayload = JSON.stringify({ entries: [{ output: output.output }] });
  const delayedRunPayload = JSON.stringify(output);

  await page.route('**/api/v1/agents/analysis?agent=CCO&limit=1', async (route) => {
    await wait(650);
    await route.fulfill({ status: 200, contentType: 'application/json', body: delayedAnalysisPayload });
  });

  await page.route('**/api/v1/agents/CCO/run', async (route) => {
    await wait(500);
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
  await page.evaluate((sessionToken) => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);

  await page.goto(`${baseUrl}/cco?evidence=v5_1`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(450);
  await page.click('#runCcoInboxBtn').catch(() => {});
  await wait(1300);

  await page.locator('#ccoWorkspaceLayout').screenshot({
    path: path.join(outDir, 'cco-v5_1-1-start-3col-noscroll.png'),
  });

  await page.click('#ccoInboxDensityFilters [data-cco-density-mode="overview"]').catch(() => {});
  await wait(250);
  await page.locator('#ccoCenterColumn').screenshot({
    path: path.join(outDir, 'cco-v5_1-2-center-10plus-rows.png'),
  });

  const rows = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn');
  const rowCount = await rows.count();
  if (rowCount > 2) {
    await rows.nth(2).click({ timeout: 12000 });
    await wait(220);
  } else if (rowCount > 0) {
    await rows.first().click({ timeout: 12000 });
    await wait(220);
  }
  await page.locator('#ccoCenterColumn').screenshot({
    path: path.join(outDir, 'cco-v5_1-3-selected-row-state.png'),
  });

  await page.evaluate(() => {
    const compose = document.getElementById('ccoComposeStudio');
    if (compose) {
      compose.style.overflow = 'visible';
      compose.style.maxHeight = 'none';
      compose.style.height = `${Math.max(compose.scrollHeight, 760)}px`;
      Array.from(compose.children).forEach((node, index) => {
        if (node && node.nodeType === Node.ELEMENT_NODE) {
          node.setAttribute('data-v5-block-label', `Block ${index + 1}`);
        }
      });
      let styleEl = document.getElementById('ccoV51EvidenceLabels');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ccoV51EvidenceLabels';
        styleEl.textContent = `
          #ccoComposeStudio > .cco-reply-block::before {
            content: attr(data-v5-block-label);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: fit-content;
            padding: 2px 8px;
            margin-bottom: 6px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            border: 1px solid rgba(46,42,39,0.24);
            background: rgba(255,255,255,0.8);
            color: #2E2A27;
          }
        `;
        document.head.appendChild(styleEl);
      }
    }
  });
  await wait(120);

  await page.locator('#ccoComposeStudio').screenshot({
    path: path.join(outDir, 'cco-v5_1-4-compose-4-blocks.png'),
  });

  await page.click('#ccoInboxModeToggle [data-cco-mail-view="inbound"]').catch(() => {});
  await wait(260);
  await page.click('#ccoIndicatorFilterRow [data-cco-indicator-filter="handled"]').catch(() => {});
  await wait(280);
  await page.locator('#ccoReplyColumn').screenshot({
    path: path.join(outDir, 'cco-v5_1-5-readonly-empty-state.png'),
  });

  const consoleErrors = consoleMessages.filter((entry) => entry.type === 'error');
  await fs.writeFile(
    path.join(outDir, 'cco-v5_1-console-local.json'),
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
  console.log('CCO v5.1 evidence captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
