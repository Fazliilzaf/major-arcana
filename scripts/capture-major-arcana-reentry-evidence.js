/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForQueueState(page, expectedMode, timeoutMs = 30000) {
  await page.waitForFunction(
    (mode) => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      const parity =
        typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
          ? diagnostics.getRuntimeMailboxParitySnapshot()
          : null;
      if (!parity) return false;
      return parity.dom?.queueListMode === mode && parity.flags?.loading === false;
    },
    expectedMode,
    { timeout: timeoutMs }
  );
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

async function main() {
  const repoRoot = process.cwd();
  const baseUrl = String(process.env.ARCANA_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
  const email = String(process.env.ARCANA_OWNER_EMAIL || 'fazli@hairtpclinic.com');
  const password = String(process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026');
  const tenantId = String(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic');
  const outDir = path.join(repoRoot, '.tmp', 'diagnostics', 'major-arcana-reentry-evidence');
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
        ARCANA_GRAPH_SEND_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
    });
    serverProcess.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });

    const ready = await waitForReadyz(baseUrl);
    if (!ready) {
      throw new Error(`Serveren svarade inte på ${baseUrl}/readyz i tid.`);
    }
  }

  const token = await loginForCapture(baseUrl, email, password, tenantId);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate((sessionToken) => {
      window.localStorage.clear();
      window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
    }, token);

    await page.goto(`${baseUrl}/major-arcana-preview/`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });

    const threadSelector = '[data-runtime-thread], [data-history-conversation], .thread-card, .queue-history-item';
    await page.waitForSelector(threadSelector, { timeout: 30000 });

    const firstThread = page.locator(threadSelector).first();
    if (await firstThread.count()) {
      await firstThread.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(750);
    }

    await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      if (typeof diagnostics.captureRuntimeReentrySnapshot === 'function') {
        diagnostics.captureRuntimeReentrySnapshot('evidence_before_auth_loss');
      }
    });
    await waitForQueueState(page, 'live').catch(() => {});

    const beforeState = await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      const mailboxParity =
        typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
          ? diagnostics.getRuntimeMailboxParitySnapshot()
          : null;
      const reentryOutcome =
        typeof diagnostics.getRuntimeReentryOutcome === 'function'
          ? diagnostics.getRuntimeReentryOutcome()
          : null;
      return {
        mailboxParity,
        reentryOutcome,
      };
    });
    const beforeSelection = beforeState.mailboxParity?.selection || {};
    const beforeThreadId = String(beforeSelection.selectedThreadId || '');
    const beforeMailboxIdsJson = JSON.stringify(
      beforeState.mailboxParity?.reentry?.snapshot?.mailboxscope || []
    );
    const beforeQueueMode = String(beforeState.mailboxParity?.dom?.queueListMode || '');
    await page.screenshot({
      path: path.join(outDir, 'before-auth-loss.png'),
      fullPage: true,
    });

    await page.evaluate(() => {
      window.localStorage.removeItem('ARCANA_ADMIN_TOKEN');
    });
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
      await page.waitForTimeout(2500);
    });
    await page.screenshot({
      path: path.join(outDir, 'after-auth-loss.png'),
      fullPage: true,
    });

    await page.evaluate((sessionToken) => {
      window.localStorage.setItem('ARCANA_ADMIN_TOKEN', String(sessionToken || ''));
    }, token);
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector(threadSelector, { timeout: 30000 });
    const postReloadDiagnostics = await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      const parity =
        typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
          ? diagnostics.getRuntimeMailboxParitySnapshot()
          : null;
      return {
        href: window.location.href,
        snapshot:
          typeof diagnostics.getRuntimeReentrySnapshot === 'function'
            ? diagnostics.getRuntimeReentrySnapshot()
            : null,
        rawRecord: window.sessionStorage.getItem('cco.runtimeReentryState.v1'),
        outcome:
          typeof diagnostics.getRuntimeReentryOutcome === 'function'
            ? diagnostics.getRuntimeReentryOutcome()
            : null,
        queueListMode: parity?.dom?.queueListMode || '',
      };
    });
    console.log(JSON.stringify({ postReloadDiagnostics }, null, 2));
    if (
      !postReloadDiagnostics.snapshot ||
      String(postReloadDiagnostics.snapshot.selectedThreadId || '') !== String(beforeThreadId || '') ||
      JSON.stringify(postReloadDiagnostics.snapshot.mailboxscope || []) !== String(beforeMailboxIdsJson || '') ||
      !postReloadDiagnostics.outcome ||
      postReloadDiagnostics.outcome.status === 'fallback_to_default' ||
      postReloadDiagnostics.outcome.status === 'init' ||
      postReloadDiagnostics.queueListMode !== (beforeQueueMode || 'live')
    ) {
      throw new Error(
        `Re-entry restore did not settle to the expected state: ${JSON.stringify(postReloadDiagnostics, null, 2)}`
      );
    }
    await page.waitForTimeout(500);

    const afterState = await page.evaluate(() => {
      const diagnostics = window.MajorArcanaPreviewDiagnostics || {};
      const mailboxParity =
        typeof diagnostics.getRuntimeMailboxParitySnapshot === 'function'
          ? diagnostics.getRuntimeMailboxParitySnapshot()
          : null;
      const reentryOutcome =
        typeof diagnostics.getRuntimeReentryOutcome === 'function'
          ? diagnostics.getRuntimeReentryOutcome()
          : null;
      return {
        mailboxParity,
        reentryOutcome,
      };
    });
    await page.screenshot({
      path: path.join(outDir, 'after-return.png'),
      fullPage: true,
    });

    const afterSelection = afterState.mailboxParity?.selection || {};
    const afterThreadId = String(afterSelection.selectedThreadId || '');
    const beforeMailboxIds = JSON.stringify(beforeSelection.selectedMailboxIds || []);
    const afterMailboxIds = JSON.stringify(afterSelection.selectedMailboxIds || []);
    const afterQueueMode = String(afterState.mailboxParity?.dom?.queueListMode || '');

    if (beforeThreadId !== afterThreadId) {
      throw new Error(`Selected thread changed across re-entry (${beforeThreadId} -> ${afterThreadId}).`);
    }
    if (beforeMailboxIds !== afterMailboxIds) {
      throw new Error(`Mailboxscope changed across re-entry (${beforeMailboxIds} -> ${afterMailboxIds}).`);
    }
    if (beforeQueueMode !== afterQueueMode) {
      throw new Error(`Queue/history mode changed across re-entry (${beforeQueueMode} -> ${afterQueueMode}).`);
    }

    const evidence = {
      baseUrl,
      capturedAt: new Date().toISOString(),
      beforeState,
      afterState,
      screenshots: {
        beforeAuthLoss: path.join(outDir, 'before-auth-loss.png'),
        afterAuthLoss: path.join(outDir, 'after-auth-loss.png'),
        afterReturn: path.join(outDir, 'after-return.png'),
      },
    };
    await fs.writeFile(
      path.join(outDir, 'major-arcana-reentry-evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8'
    );

    console.log(`Re-entry evidence captured in ${outDir}`);
    console.log(JSON.stringify({
      status: afterState.reentryOutcome?.status || '',
      beforeThreadId,
      afterThreadId,
      beforeMailboxIds: JSON.parse(beforeMailboxIds),
      afterMailboxIds: JSON.parse(afterMailboxIds),
      beforeQueueMode,
      afterQueueMode,
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
