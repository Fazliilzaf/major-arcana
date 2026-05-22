/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canReachReadyz(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/readyz`, { method: 'GET' });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return Boolean(payload && payload.ok === true);
  } catch (_error) {
    return false;
  }
}

async function waitForReadyz(baseUrl, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachReadyz(baseUrl)) return true;
    await sleep(500);
  }
  return false;
}

async function loginForCapture(baseUrl, email, password, tenantId) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': 'arcana-staging.onrender.com',
      'x-arcana-client': 'major_arcana_admin',
    },
    body: JSON.stringify({
      email,
      password,
      tenantId,
    }),
  });
  const payload = await response.json();
  const token = String(payload?.token || '');
  if (!response.ok || !token) {
    throw new Error(
      `Kunde inte logga in för capture (${response.status}): ${String(payload?.error || 'okänt fel')}`
    );
  }
  return token;
}

function buildLiveRuntimeStatusFixture() {
  return {
    graph: {
      readEnabled: true,
      sendEnabled: true,
      deleteEnabled: true,
      runtimeMode: 'live',
      defaultSenderMailbox: 'kons@hairtpclinic.com',
      defaultSignatureProfile: 'fazli',
      senderMailboxOptions: [
        'kons@hairtpclinic.com',
        'contact@hairtpclinic.com',
      ],
      signatureProfiles: [
        {
          key: 'fazli',
          fullName: 'Fazli',
          title: '',
          senderMailboxId: 'kons@hairtpclinic.com',
          email: 'kons@hairtpclinic.com',
          displayEmail: 'kons@hairtpclinic.com',
          html: '',
          label: 'Fazli',
          source: 'fixture',
        },
      ],
      mailboxCapabilities: [
        {
          id: 'kons@hairtpclinic.com',
          email: 'kons@hairtpclinic.com',
          label: 'Kons',
          readAvailable: true,
          sendAvailable: true,
          deleteAvailable: true,
          senderAvailable: true,
          signatureProfileId: 'fazli',
          signatureProfileAvailable: true,
          signatureProfileLabel: 'Fazli',
          order: 0,
        },
        {
          id: 'contact@hairtpclinic.com',
          email: 'contact@hairtpclinic.com',
          label: 'Kontakt',
          readAvailable: true,
          sendAvailable: true,
          deleteAvailable: true,
          senderAvailable: true,
          signatureProfileId: 'fazli',
          signatureProfileAvailable: true,
          signatureProfileLabel: 'Fazli',
          order: 1,
        },
      ],
      readConnectorAvailable: false,
      sendConnectorAvailable: false,
      fullTenant: true,
      userScope: 'all',
      allowlistMode: true,
      allowlistMailboxIds: [
        'kons@hairtpclinic.com',
        'contact@hairtpclinic.com',
      ],
      allowlistMailboxCount: 2,
      maxUsers: 0,
      maxMessagesPerUser: 0,
      maxInboxMessagesPerUser: 0,
      maxSentMessagesPerUser: 0,
      maxMessages: 0,
      maxInboxMessages: 0,
      maxSentMessages: 0,
    },
  };
}

function buildAnalyzeInboxLiveFixture() {
  const conversationId =
    'aaqkada1zge3nwy2lwu5zmytndbjms05yzfjltgxzmq3yzcwmddkygaqajw-ilwujanptjesbk1zey0=';
  const mailboxId = 'kons@hairtpclinic.com';
  const customerName = 'Anna Karlsson';
  const subject = 'Anna Karlsson';
  const preview =
    'Hej QA,\n\nTack för att du hörde av dig. Jag återkommer med nästa steg för svar nu.';
  const recordedAt = '2026-04-02T18:05:00.000Z';

  const row = {
    conversationId,
    messageId: 'msg-reply-fixture-1',
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    mailboxLabel: 'Kons',
    owner: 'Kons',
    ownerLabel: 'Kons',
    ownerKey: 'kons',
    subject,
    displaySubject: subject,
    summary: preview,
    preview,
    bodyPreview: preview,
    latestInboundPreview: preview,
    latestMessageAt: recordedAt,
    lastInboundAt: recordedAt,
    lastOutboundAt: '',
    hasUnreadInbound: true,
    isUnanswered: true,
    waitingOn: 'owner',
    intent: 'needs_reply',
    workflowLane: 'action_now',
    recommendedActionLabel: 'Svara nu',
    recommendedAction: 'Svara kunden och ta nästa tydliga steg.',
    operatorCue: 'Svara nu',
    priorityLevel: 'high',
    slaStatus: 'warning',
    dominantRisk: 'warning',
    customerEmail: 'anna.karlsson@hairtpclinic.com',
    customerName,
    sender: customerName,
    senderName: customerName,
    customerSummary: {
      customerName,
      customerKey: 'anna.karlsson@hairtpclinic.com',
      lifecycleStatus: 'awaiting_reply',
      interactionCount: 1,
      historyMessageCount: 1,
      historyMailboxIds: [mailboxId],
      lastCaseSummary: preview,
      historySignalSummary: preview,
      historySignalActionCue: 'Svara kunden och håll nästa steg tydligt.',
      engagementScore: 0.37,
      caseCount: 1,
    },
    nextActionLabel: 'Svara nu',
    nextActionSummary: 'Öppna tråden och ta nästa tydliga steg.',
    whyInFocus: 'Senaste händelsen i tråden var ett inkommande mail från kunden.',
    riskStackExplanation: 'Hög risk',
    tags: ['all', 'act-now'],
    worklistSource: 'live',
    worklistSourceLabel: 'Live',
    worklistWave: 'wave_1',
    worklistWaveLabel: 'Wave 1',
  };

  return {
    output: {
      data: {
        conversationWorklist: [row],
        needsReplyToday: [row],
        inboundFeed: [
          {
            conversationId,
            messageId: 'msg-reply-fixture-1',
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
            sentAt: recordedAt,
            direction: 'inbound',
            subject,
            summary: preview,
            previewText: preview,
            bodyText: preview,
            bodyHtml: `<p>${preview.replace(/\n/g, '<br />')}</p>`,
            senderName: customerName,
            fromName: customerName,
            customerName,
          },
        ],
        outboundFeed: [],
        metadata: {
          ccoDefaultSenderMailbox: mailboxId,
          ccoDefaultSignatureProfile: 'fazli',
        },
      },
      metadata: {
        source: 'fixture',
      },
    },
  };
}

function buildReplyHistoryFixture() {
  const conversationId =
    'aaqkada1zge3nwy2lwu5zmytndbjms05yzfjltgxzmq3yzcwmddkygaqajw-ilwujanptjesbk1zey0=';
  const mailboxId = 'kons@hairtpclinic.com';
  const customerName = 'Anna Karlsson';
  const subject = 'Anna Karlsson';
  const preview =
    'Hej QA,\n\nTack för att du hörde av dig. Jag återkommer med nästa steg för svar nu.';
  const recordedAt = '2026-04-02T18:05:00.000Z';

  const message = {
    messageId: 'msg-reply-fixture-1',
    conversationId,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    sentAt: recordedAt,
    direction: 'inbound',
    subject,
    summary: preview,
    previewText: preview,
    bodyText: preview,
    bodyHtml: `<p>${preview.replace(/\n/g, '<br />')}</p>`,
    senderName: customerName,
    fromName: customerName,
    customerName,
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'fixture',
    mailboxIds: [mailboxId],
    conversationId,
    messages: [message],
    events: [],
    summary: {
      mailboxCount: 1,
      mailboxIds: [mailboxId],
      messageCount: 1,
    },
    threadDocument: {
      kind: 'mail_thread_document',
      sourceStore: 'fixture',
      conversationId,
      messageCount: 1,
      latestMessageId: message.messageId,
      hasMimeBackedMessages: false,
      hasQuotedMessages: false,
      hasSignatureBlocks: false,
      hasSystemBlocks: false,
      messages: [
        {
          id: message.messageId,
          messageId: message.messageId,
          conversationId,
          mailboxId,
          mailboxAddress: mailboxId,
          sentAt: recordedAt,
          direction: 'inbound',
          senderName: customerName,
          fromName: customerName,
          subject,
          primaryBody: {
            text: preview,
            html: `<p>${preview.replace(/\n/g, '<br />')}</p>`,
          },
          presentation: {
            conversationText: preview,
            conversationHtml: `<p>${preview.replace(/\n/g, '<br />')}</p>`,
          },
        },
      ],
    },
  };
}

function buildReplySendFixture(body = {}) {
  const subject = String(body?.subject || 'QA REPLY FIXTURE KONS [telefon]');
  const bodyText = String(body?.body || '').trim();
  return {
    send: {
      ccoSendRunId: 'fixture-send-run',
      gatewayRunId: 'fixture-gateway-run',
      sourceMailboxId: String(body?.sourceMailboxId || 'kons@hairtpclinic.com'),
      senderMailboxId: String(body?.senderMailboxId || 'kons@hairtpclinic.com'),
      replyToMessageId: String(body?.replyToMessageId || 'msg-reply-fixture-1'),
      conversationId: String(body?.conversationId || 'aaqkada1zge3nwy2lwu5zmytndbjms05yzfjltgxzmq3yzcwmddkygaqajw-ilwujanptjesbk1zey0='),
      decision: 'allow',
      mode: 'manual',
      composeMode: false,
      signatureProfile: String(body?.signatureProfile || 'fazli'),
      sendStrategy: 'graph_send_reply',
    },
    preview: {
      subject,
      body: bodyText,
      bodyHtml: `<p>${bodyText.replace(/\n/g, '<br />')}</p>`,
    },
    decision: 'allow',
    artifactRefs: {
      analysis_id: 'fixture-analysis-id',
      send_provider: 'fixture',
      cco_send_run_id: 'fixture-send-run',
    },
    safeResponse: null,
  };
}

async function main() {
  const repoRoot = process.cwd();
  const baseUrl = String(process.env.ARCANA_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
  const email = String(process.env.ARCANA_OWNER_EMAIL || 'fazli@hairtpclinic.com');
  const password = String(process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026');
  const tenantId = String(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic');
  const outDir = path.join(repoRoot, '.tmp', 'diagnostics', 'reply-completion-evidence');
  await fs.mkdir(outDir, { recursive: true });

  let serverProcess = null;
  if (!(await canReachReadyz(baseUrl))) {
    serverProcess = spawn('node', ['server.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: '3100',
        ARCANA_AI_PROVIDER: 'fallback',
        ARCANA_GRAPH_READ_ENABLED: 'false',
        ARCANA_GRAPH_SEND_ENABLED: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (chunk) => process.stdout.write(chunk));
    serverProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));

    const ready = await waitForReadyz(baseUrl);
    if (!ready) {
      throw new Error(`Serveren svarade inte på ${baseUrl}/readyz i tid.`);
    }
  }

  const token = await loginForCapture(baseUrl, email, password, tenantId);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1080 } });
  await context.setExtraHTTPHeaders({
    Authorization: `Bearer ${token}`,
    'x-auth-token': token,
    'x-arcana-client': 'major_arcana_admin',
  });
  await context.addInitScript(
    (sessionToken) => {
      try {
        window.localStorage.clear();
        window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
      } catch (_error) {
        // If localStorage isn't ready yet, the request headers still carry auth.
      }
    },
    token
  );
  await context.route('**/api/v1/cco/runtime/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: `${JSON.stringify({
        ok: true,
        ready: true,
        generatedAt: new Date().toISOString(),
        ...buildLiveRuntimeStatusFixture(),
      })}\n`,
    });
  });
  await context.route('**/api/v1/capabilities/AnalyzeInbox/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: `${JSON.stringify({
        ok: true,
        generatedAt: new Date().toISOString(),
        ...buildAnalyzeInboxLiveFixture(),
      })}\n`,
    });
  });
  await context.route('**/api/v1/cco/runtime/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: `${JSON.stringify(buildReplyHistoryFixture())}\n`,
    });
  });
  await context.route('**/api/v1/cco/send', async (route) => {
    const request = route.request();
    let body = {};
    try {
      body = JSON.parse(request.postData() || '{}');
    } catch (_error) {
      body = {};
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: `${JSON.stringify({
        ok: true,
        generatedAt: new Date().toISOString(),
        ...buildReplySendFixture(body),
      })}\n`,
    });
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/major-arcana-preview/`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });

    const threadSelector = '[data-runtime-thread]';
    await waitForReadyz(baseUrl).catch(() => {});
    await page.waitForFunction(
      () => {
        const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
        const parity =
          typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
            ? diagnostics.getRuntimeMailboxParitySnapshot()
            : null;
        return Boolean(
          parity &&
            parity.dom?.queueListMode === 'live' &&
            parity.flags?.loading === false &&
            !String(document.body?.innerText || '').includes('Sessionen är ogiltig')
        );
      },
      { timeout: 30000 }
    ).catch(() => {});
    await page.waitForSelector(threadSelector, { timeout: 30000 });

    const replyCard = page.locator('[data-runtime-thread]').filter({ hasText: 'Svara nu' }).first();
    const selectedCard = (await replyCard.count()) ? replyCard : page.locator(threadSelector).first();
    await selectedCard.scrollIntoViewIfNeeded();
    await selectedCard.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    const beforeState = await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      return {
        parity:
          typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
            ? diagnostics.getRuntimeMailboxParitySnapshot()
            : null,
        reentryOutcome:
          typeof diagnostics.getRuntimeReentryOutcome === 'function'
            ? diagnostics.getRuntimeReentryOutcome()
            : null,
        selectedCardText: document.querySelector('[data-runtime-thread].thread-card-selected')?.innerText || '',
        studioHidden: document.querySelector('#studio-shell')?.getAttribute('aria-hidden') || '',
      };
    });
    await page.screenshot({
      path: path.join(outDir, 'before-send.png'),
      fullPage: false,
    });

    const openStudioButton = page
      .locator(
        'button.conversation-next-button[data-runtime-studio-open][aria-controls="studio-shell"]'
      )
      .filter({ hasText: 'Öppna Svarstudio' })
      .first();
    await openStudioButton.click({ timeout: 5000 });
    await page.waitForSelector('[data-studio-editor-input]', { timeout: 30000 });
    await page.waitForTimeout(600);

    const openState = await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      const editor = document.querySelector('[data-studio-editor-input]');
      return {
        parity:
          typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
            ? diagnostics.getRuntimeMailboxParitySnapshot()
            : null,
        replySummary: document.querySelector('[data-studio-editor-summary]')?.textContent || '',
        fromLabel: document.querySelector('[data-studio-compose-from]')?.value || '',
        signatureLabel:
          document.querySelector('[data-studio-signature].is-active')?.textContent || '',
        nextStep: document.querySelector('[data-studio-next-action-title]')?.textContent || '',
        editorValue: editor && 'value' in editor ? editor.value : '',
      };
    });
    await page.locator('#studio-shell').scrollIntoViewIfNeeded();
    await page.locator('#studio-shell').screenshot({
      path: path.join(outDir, 'open-studio.png'),
    });

    const editor = page.locator('[data-studio-editor-input]');
    const replacementDraft = [
      'Hej,',
      '',
      'Tack! Jag återkommer med nästa steg.',
      '',
      'Vänliga hälsningar,',
      'Egzona',
    ].join('\n');
    await editor.fill(replacementDraft);
    await page.waitForTimeout(300);

    await page.locator('[data-studio-send]').click({ timeout: 5000, force: true });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => {
      const shell = document.querySelector('#studio-shell');
      return shell ? shell.getAttribute('aria-hidden') === 'true' : true;
    }, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => {
      const selectedCard = document.querySelector('[data-runtime-thread].thread-card-selected');
      if (!selectedCard) return false;
      const text = String(selectedCard.innerText || '');
      return /inväntar svar|besvarad|invänta svar/i.test(text);
    }, { timeout: 30000 }).catch(() => {});

    const afterState = await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      const parity =
        typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
          ? diagnostics.getRuntimeMailboxParitySnapshot()
          : null;
      return {
        parity,
        outcome:
          typeof diagnostics.getRuntimeReentryOutcome === 'function'
            ? diagnostics.getRuntimeReentryOutcome()
            : null,
        studioHidden: document.querySelector('#studio-shell')?.getAttribute('aria-hidden') || '',
        selectedCardText: document.querySelector('[data-runtime-thread].thread-card-selected')?.innerText || '',
        bodyText: document.body.innerText.slice(0, 2000),
      };
    });
    await page.screenshot({
      path: path.join(outDir, 'after-send.png'),
      fullPage: false,
    });

    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(600);
    await page.locator('[data-runtime-thread].thread-card-selected').screenshot({
      path: path.join(outDir, 'back-to-queue.png'),
    });

    const evidence = {
      baseUrl,
      capturedAt: new Date().toISOString(),
      beforeState,
      openState,
      afterState,
      screenshots: {
        beforeSend: path.join(outDir, 'before-send.png'),
        openStudio: path.join(outDir, 'open-studio.png'),
        afterSend: path.join(outDir, 'after-send.png'),
        backToQueue: path.join(outDir, 'back-to-queue.png'),
      },
    };

    await fs.writeFile(
      path.join(outDir, 'reply-completion-evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await context.close();
    await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
