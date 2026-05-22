/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSyntheticCcoOutput(totalRows = 42) {
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
    const inboundMs = now - (i + 1) * 27 * 60 * 1000;
    const hasOutbound = i % 3 !== 0;
    const outboundMs = hasOutbound ? inboundMs + 17 * 60 * 1000 : null;
    conversationWorklist.push({
      conversationId: `wow-v5-conv-${i + 1}`,
      messageId: `wow-v5-msg-${i + 1}`,
      mailboxId,
      subject: `WOW v5 tråd ${i + 1}`,
      sender: `kund${i + 1}@example.com`,
      latestInboundPreview: `Maskad preview för WOW v5 ${i + 1}.`,
      lastInboundAt: new Date(inboundMs).toISOString(),
      lastOutboundAt: outboundMs ? new Date(outboundMs).toISOString() : '',
      hoursSinceInbound: Number(((now - inboundMs) / 3600000).toFixed(1)),
      slaStatus: i < 4 ? 'breach' : i < 12 ? 'warning' : 'safe',
      hoursRemaining: i < 4 ? -1 : i < 12 ? 3 : 20,
      slaThreshold: 12,
      needsReplyStatus: hasOutbound ? 'active_dialogue' : 'awaiting_reply',
      isUnanswered: !hasOutbound,
      unansweredThresholdHours: 24,
      followUpSuggested: i > 8 && i % 2 === 0,
      intent: i % 2 === 0 ? 'booking_request' : 'follow_up',
      tone: i % 4 === 0 ? 'anxious' : 'neutral',
      toneConfidence: 0.82,
      priorityLevel: i < 4 ? 'Critical' : i < 12 ? 'High' : i < 26 ? 'Medium' : 'Low',
      priorityScore: Math.max(10, 98 - i),
      recommendedAction: i < 4 ? 'Svara omedelbart' : 'Svara idag',
      recommendedMode: i % 2 === 0 ? 'professional' : 'warm',
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
        model: 'synthetic-wow-v5',
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
  const page = await browser.newPage({ viewport: { width: 1510, height: 900 } });

  const output = createSyntheticCcoOutput(42);
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
  await page.evaluate((sessionToken) => {
    window.localStorage.clear();
    window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
  }, token);

  await page.goto(`${baseUrl}/cco?evidence=wow-v5`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('#ccoWorkspaceSection', { state: 'attached', timeout: 30000 });
  await page.click('.sectionNavBtn[data-target="ccoWorkspaceSection"]').catch(() => {});
  await wait(700);
  await page.click('#runCcoInboxBtn').catch(() => {});
  await wait(1500);
  await page.evaluate(() => {
    const section = document.getElementById('ccoWorkspaceSection');
    if (section) {
      section.style.display = 'block';
      section.style.visibility = 'visible';
    }
  });

  const left = page.locator('#ccoInboxControlsColumn');
  if (await left.count()) {
    try {
      await left.screenshot({ path: path.join(outDir, 'cco-wow-v5-1-left-sidebar-compact.png') });
    } catch {
      await page.screenshot({ path: path.join(outDir, 'cco-wow-v5-1-left-sidebar-compact.png'), fullPage: true });
    }
  } else {
    await page.screenshot({ path: path.join(outDir, 'cco-wow-v5-1-left-sidebar-compact.png'), fullPage: true });
  }

  const rows = page.locator('#ccoInboxWorklist .ccoConversationSelectBtn');
  const rowCount = await rows.count();
  if (rowCount > 1) {
    await rows.nth(1).click({ timeout: 10000 });
    await wait(280);
    await rows.first().hover();
    await wait(220);
  } else if (rowCount === 1) {
    await rows.first().click({ timeout: 10000 });
    await wait(320);
    await rows.first().hover();
  }

  const center = page.locator('#ccoCenterColumn');
  if (await center.count()) {
    try {
      await center.screenshot({ path: path.join(outDir, 'cco-wow-v5-2-worklist-hover-selected.png') });
    } catch {
      await page.screenshot({ path: path.join(outDir, 'cco-wow-v5-2-worklist-hover-selected.png'), fullPage: true });
    }
  } else {
    await page.screenshot({ path: path.join(outDir, 'cco-wow-v5-2-worklist-hover-selected.png'), fullPage: true });
  }

  await page.evaluate(() => {
    const layout = document.getElementById('ccoWorkspaceLayout');
    const reply = document.getElementById('ccoReplyColumn');
    const mainBlocks = document.getElementById('ccoReplyMainBlocks');
    const compose = document.getElementById('ccoComposeStudio');
    const editorBlock = document.querySelector('.cco-editor-block');
    const editor = document.getElementById('ccoDraftBodyInput');
    if (layout) {
      layout.style.height = 'auto';
      layout.style.maxHeight = 'none';
      layout.style.overflow = 'visible';
    }
    if (reply) {
      reply.style.height = 'auto';
      reply.style.maxHeight = 'none';
      reply.style.overflow = 'visible';
      reply.style.alignSelf = 'start';
    }
    if (mainBlocks) {
      mainBlocks.style.gridTemplateRows = 'auto auto';
      mainBlocks.style.height = 'auto';
      mainBlocks.style.maxHeight = 'none';
    }
    if (compose) {
      compose.style.overflow = 'visible';
      compose.style.maxHeight = 'none';
      compose.style.height = 'auto';
      compose.style.height = `${Math.max(compose.scrollHeight, 860)}px`;
      Array.from(compose.children).forEach((node, index) => {
        if (node && node.nodeType === Node.ELEMENT_NODE) {
          node.setAttribute('data-evidence-block', `Block ${index + 1}`);
        }
      });
    }
    if (editorBlock) {
      editorBlock.style.minHeight = '280px';
      editorBlock.style.maxHeight = 'none';
    }
    if (editor) {
      editor.style.minHeight = '180px';
    }
    document.querySelectorAll('.toast').forEach((node) => {
      node.remove();
    });
    const toastHost = document.getElementById('toast');
    if (toastHost) {
      toastHost.textContent = '';
      toastHost.className = 'toast hidden';
    }
    let evidenceStyle = document.getElementById('ccoWowV5EvidenceStyle');
    if (!evidenceStyle) {
      evidenceStyle = document.createElement('style');
      evidenceStyle.id = 'ccoWowV5EvidenceStyle';
      evidenceStyle.textContent = `
        #ccoComposeStudio > .cco-reply-block::before {
          content: attr(data-evidence-block);
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
          border: 1px solid rgba(62,46,41,0.25);
          color: #3E2E29;
          background: rgba(255,255,255,0.7);
        }
      `;
      document.head.appendChild(evidenceStyle);
    }
  });
  await wait(200);

  const composePanel = page.locator('#ccoComposeStudio');
  if (await composePanel.count()) {
    try {
      await composePanel.screenshot({ path: path.join(outDir, 'cco-wow-v5-3-compose-4-blocks.png') });
    } catch {
      await page.screenshot({ path: path.join(outDir, 'cco-wow-v5-3-compose-4-blocks.png'), fullPage: true });
    }
  } else {
    await page.screenshot({ path: path.join(outDir, 'cco-wow-v5-3-compose-4-blocks.png'), fullPage: true });
  }

  const consoleErrors = consoleMessages.filter((entry) => entry.type === 'error');
  await fs.writeFile(
    path.join(outDir, 'cco-wow-v5-console-local.json'),
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
  console.log('WOW v5 evidence captured in', outDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
