'use strict';

/**
 * Deliberately manual Block 5 verification harness.
 *
 * This module is not named *.test.js and is never part of the ordinary test
 * suite. It accepts an already authenticated Playwright Page at run time; it
 * creates no session, persists no state and emits masked aggregate evidence
 * only. A production run requires an explicit caller supplied approval.
 */

const crypto = require('node:crypto');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Keep this list deliberately empty until a concrete request has been proved
// safe and documented. Never add wildcards: an unknown same-origin write must
// abort the harness and fail its verdict.
const SAFE_SAME_ORIGIN_WRITES = Object.freeze([]);
// These are the only known top-admin-shell requests that can fail outside the
// V2 preview without changing its result. Keep the list exact: any other
// console or resource error must remain a red harness verdict.
const NON_BLOCKING_ADMIN_SHELL_ERROR_PATHS = new Set([
  '/api/v1/marketing/campaigns',
  '/api/v1/cco-users/fazli',
  '/api/v1/ops/maintenance-window',
]);
const SUPERSEDED_V2_READ_PATHS = new Set([
  '/api/v1/cco/runtime/stream',
  '/api/v1/cco/runtime/worklist/consumer',
]);
const V2_MENU = '[data-cco-more="konversationer_v2_preview"]';
const V2_FRAME = 'iframe[src*="conversations=v2"]';
const V2_ROOT = '#cco-conv-v2-root';
const WORKSPACE_FRAME = '#ccoPreviewEmbedFrame';
const INBOX_THREAD = '[data-v2-inbox] .thread[data-thread-id]';
const INBOX_EMPTY = '[data-v2-inbox] .inbox-empty';
// Runtime rows also carry data-lane. The desktop sidebar and the responsive
// chip rail are the only controls allowed to satisfy these selectors.
const V2_ALL_LANE =
  '#cco-conv-v2-root .lane-row[data-lane="all"]:visible, #cco-conv-v2-root .lane-chip[data-lane="all"]:visible';
const V2_ALL_TAB = '[data-tab="alla"]';
const V2_REVIEW_LANE =
  '#cco-conv-v2-root .lane-row[data-lane="review"]:visible, #cco-conv-v2-root .lane-chip[data-lane="review"]:visible';
const RUNTIME_SELECTED_MAILBOX = '[data-runtime-mailbox]:checked';
const BLOCK5_STAGE_TIMEOUT_MS = 20000;
const BLOCK5_WARMUP_TIMEOUT_MS = 60000;
const V2_INBOX_TERMINAL_TIMEOUT_MS = BLOCK5_STAGE_TIMEOUT_MS;
const BOOKING_ACTION = '[data-v2-thread] [data-v2-action="booking"]';
const DOSSIER_ACTION = '[data-v2-ctx] [data-v2-action="dossier"]';
const NOTE_ACTION = '[data-v2-thread] [data-v2-action="note"][data-note-conversation-id]';

function fail(code) {
  throw new Error(code);
}

function isTimeoutError(error) {
  return error?.name === 'TimeoutError';
}

function createStageTimeoutError() {
  const error = new Error('block5 stage deadline exceeded');
  error.name = 'TimeoutError';
  return error;
}

async function runStage(
  stage,
  operation,
  timeoutMs = BLOCK5_STAGE_TIMEOUT_MS,
  { onTimeout } = {}
) {
  let timer;
  const operationPromise = Promise.resolve().then(operation);
  // The losing Playwright operation can reject after a deadline wins the
  // race. Keep that rejection observed while the dedicated runner page closes.
  operationPromise.catch(() => {});
  const timeoutError = createStageTimeoutError();
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError), timeoutMs);
  });
  try {
    return await Promise.race([operationPromise, deadline]);
  } catch (error) {
    if (error === timeoutError) {
      await onTimeout?.();
      fail(`block5.${stage}_timeout`);
    }
    if (isTimeoutError(error)) {
      await onTimeout?.();
      fail(`block5.${stage}_timeout`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function mask(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 12);
}

function isSameOriginWrite(url, method, origin) {
  try {
    return new URL(url).origin === origin && WRITE_METHODS.has(String(method || '').toUpperCase());
  } catch (_) {
    return false;
  }
}

function isExplicitSafeSameOriginWrite(url, method, origin) {
  try {
    const requestUrl = new URL(url);
    if (requestUrl.origin !== origin) return false;
    const normalizedMethod = String(method || '').toUpperCase();
    const requestPath = `${requestUrl.pathname}${requestUrl.search}`;
    return SAFE_SAME_ORIGIN_WRITES.some(
      (allowed) => allowed.method === normalizedMethod && allowed.path === requestPath
    );
  } catch (_) {
    return false;
  }
}

function assertApprovedRun(baseUrl, ownerApprovedProduction) {
  const url = new URL(baseUrl);
  if (url.hostname === 'arcana.hairtpclinic.com' && ownerApprovedProduction !== true) {
    fail('block5.production_run_requires_explicit_owner_approval');
  }
}

function assertPage(page) {
  if (!page || typeof page.goto !== 'function' || typeof page.route !== 'function') {
    fail('block5.invalid_playwright_page');
  }
}

function sameOriginPath(url, origin) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin) return null;
    return parsed.pathname;
  } catch (_) {
    return null;
  }
}

function isNonBlockingAdminShellResponse(url, status, origin) {
  const pathname = sameOriginPath(url, origin);
  return (
    (Number(status) === 401 || Number(status) === 403) &&
    NON_BLOCKING_ADMIN_SHELL_ERROR_PATHS.has(pathname)
  );
}

function isSupersededV2ReadFailure(failure, origin) {
  return (
    String(failure.method || '').toUpperCase() === 'GET' &&
    String(failure.errorText || '') === 'net::ERR_ABORTED' &&
    SUPERSEDED_V2_READ_PATHS.has(sameOriginPath(failure.url, origin))
  );
}

function isTargetClosedError(error) {
  return /target page, context or browser has been closed|target closed|page has been closed/i.test(
    String(error?.message || error)
  );
}

async function ignoreTargetClosed(operation, tolerateTargetClosed) {
  try {
    return await operation();
  } catch (error) {
    if (tolerateTargetClosed && isTargetClosedError(error)) return undefined;
    throw error;
  }
}

/**
 * Block all same-origin mutations. A blocked write is not merely logged: it
 * fails the final verdict, including writes attempted by recovery handlers.
 */
async function installReadOnlyGuard(page, origin) {
  let blockedWrites = 0;
  const clientErrors = [];
  const requestFailures = [];
  const consoleErrors = [];
  const nonBlockingAdminShellResponses = new Set();
  const routeHandler = async (route) => {
    const request = route.request();
    if (isSameOriginWrite(request.url(), request.method(), origin)) {
      if (isExplicitSafeSameOriginWrite(request.url(), request.method(), origin)) {
        await route.continue();
        return;
      }
      blockedWrites += 1;
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  };
  const onPageError = () => clientErrors.push('pageerror');
  const onRequestFailed = (request) => {
    const failure = typeof request.failure === 'function' ? request.failure() : null;
    requestFailures.push({
      url: request.url(),
      method: typeof request.method === 'function' ? request.method() : '',
      resourceType: String(request.resourceType() || '').toLowerCase(),
      errorText: String(failure?.errorText || ''),
    });
  };
  const onResponse = (response) => {
    if (isNonBlockingAdminShellResponse(response.url(), response.status(), origin)) {
      // Store only origin+path, never query strings or response content.
      nonBlockingAdminShellResponses.add(sameOriginPath(response.url(), origin));
    }
  };
  const onConsole = (message) => {
    if (message.type() !== 'error') return;
    const location = typeof message.location === 'function' ? message.location() : {};
    consoleErrors.push({
      text: String(message.text() || ''),
      locationUrl: String(location?.url || ''),
    });
  };

  await page.route('**/*', routeHandler);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  page.on('console', onConsole);

  return async function cleanupAndAssertReadOnly({
    tolerateTargetClosed = false,
    preservePrimaryError = false,
  } = {}) {
    await ignoreTargetClosed(() => page.unroute('**/*', routeHandler), tolerateTargetClosed);
    await ignoreTargetClosed(() => page.off('pageerror', onPageError), tolerateTargetClosed);
    await ignoreTargetClosed(() => page.off('requestfailed', onRequestFailed), tolerateTargetClosed);
    await ignoreTargetClosed(() => page.off('response', onResponse), tolerateTargetClosed);
    await ignoreTargetClosed(() => page.off('console', onConsole), tolerateTargetClosed);
    const externalImageFailures = requestFailures.filter((failure) => {
      try {
        return new URL(failure.url).origin !== origin && failure.resourceType === 'image';
      } catch (_) {
        return false;
      }
    });
    const supersededReadFailures = requestFailures.filter((failure) =>
      isSupersededV2ReadFailure(failure, origin)
    );
    const redRequestFailures = requestFailures.filter(
      (failure) =>
        !externalImageFailures.includes(failure) && !supersededReadFailures.includes(failure)
    );
    if (redRequestFailures.length) clientErrors.push('resource-failure');
    const externalImageUrls = externalImageFailures.map((failure) => failure.url);
    const hasExternalImageCorrelation = (entry) =>
      externalImageUrls.some(
        (url) => entry.locationUrl === url || (entry.text && entry.text.includes(url))
      );
    const isNonBlockingAdminShellConsoleError = (entry) => {
      const pathname = sameOriginPath(entry.locationUrl, origin);
      return pathname && nonBlockingAdminShellResponses.has(pathname);
    };
    const nonBlockingAdminShellConsoleErrors = consoleErrors.filter(
      (entry) => isNonBlockingAdminShellConsoleError(entry) && !hasExternalImageCorrelation(entry)
    );
    if (
      consoleErrors.some(
        (entry) =>
          !hasExternalImageCorrelation(entry) && !isNonBlockingAdminShellConsoleError(entry)
      )
    ) {
      clientErrors.push('console-error');
    }
    const diagnostics = {};
    if (externalImageFailures.length) {
      diagnostics.externalImageResourceFailures = externalImageFailures.length;
    }
    if (nonBlockingAdminShellConsoleErrors.length) {
      diagnostics.unrelatedAdminShellResourceErrors = nonBlockingAdminShellConsoleErrors.length;
    }
    if (supersededReadFailures.length) {
      diagnostics.supersededReadFailures = supersededReadFailures.length;
    }
    // A timeout or other primary operation error must remain the reported
    // failure. The runner closing as part of that error can abort reads.
    if (preservePrimaryError) return diagnostics;
    if (blockedWrites) fail('block5.same_origin_write_attempted');
    if (clientErrors.length) {
      // Klassen är avsiktligt en liten fast vokabulär, aldrig feltext, URL
      // eller annat körningsunderlag. Den gör en röd verdict felsökbar utan
      // att harnessen blir en PII-artefakt.
      fail(`block5.client_error_detected:${Array.from(new Set(clientErrors)).sort().join(',')}`);
    }
    return diagnostics;
  };
}

function isV2PreviewDocumentResponse(response, origin) {
  try {
    const url = new URL(response.url());
    return (
      url.origin === origin &&
      url.pathname === '/major-arcana-preview/' &&
      url.searchParams.get('view') === 'conversations' &&
      url.searchParams.get('embed') === 'admin' &&
      url.searchParams.get('conversations') === 'v2' &&
      response.request().resourceType() === 'document'
    );
  } catch {
    return false;
  }
}

function getPreviewIntegrityEvidence(response) {
  const headers = response.headers();
  const status = Number(response.status()) || 0;
  return {
    statusOk: status >= 200 && status < 300,
    verified: headers['x-arcana-preview-integrity'] === 'verified',
    buildPresent: Boolean(headers['x-arcana-preview-build']),
  };
}

async function openAdminV2Preview(page, baseUrl) {
  const origin = new URL(baseUrl).origin;
  await page.goto(new URL('/admin#cco', baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: BLOCK5_STAGE_TIMEOUT_MS,
  });
  await page.locator('[data-cco-more-toggle]').click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const previewNavigation = page.waitForResponse(
    (response) => isV2PreviewDocumentResponse(response, origin),
    { timeout: BLOCK5_STAGE_TIMEOUT_MS }
  );
  try {
    await page.locator(V2_MENU).click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
    await page.locator(V2_FRAME).waitFor({ state: 'visible', timeout: BLOCK5_STAGE_TIMEOUT_MS });
    const frame = page.frameLocator(V2_FRAME);
    await frame.locator(V2_ROOT).waitFor({ state: 'visible', timeout: BLOCK5_STAGE_TIMEOUT_MS });
    return { frame, integrity: getPreviewIntegrityEvidence(await previewNavigation) };
  } catch (error) {
    void previewNavigation.catch(() => {});
    throw error;
  }
}

function classifyTerminalInbox({
  rowCount = 0,
  selectedMailboxCount = 0,
  worklistStatus = 0,
} = {}) {
  if (worklistStatus === 401 || worklistStatus === 403) fail('block5.auth_required');
  if (worklistStatus === 422 || Number(selectedMailboxCount) > 2) fail('block5.scope_error');
  if (Number(rowCount) > 0) return { status: 'rows' };
  return { status: 'inconclusive', reason: 'no_canonical_thread_in_scope' };
}

function installWorklistResponseProbe(page, origin) {
  let latestStatus = 0;
  const onResponse = (response) => {
    try {
      const url = new URL(response.url());
      const method = response.request().method();
      if (
        url.origin === origin &&
        url.pathname.startsWith('/api/v1/cco/runtime/worklist/consumer') &&
        method === 'GET'
      ) {
        latestStatus = Number(response.status()) || 0;
      }
    } catch {
      // Ignore malformed or opaque browser response URLs.
    }
  };
  page.on('response', onResponse);
  return {
    getStatus: () => latestStatus,
    reset: () => {
      latestStatus = 0;
    },
    cleanup: ({ tolerateTargetClosed = false } = {}) =>
      ignoreTargetClosed(() => page.off('response', onResponse), tolerateTargetClosed),
  };
}

function isAmbiguousLaneControlError(error) {
  return /strict mode violation|resolved to \d+ elements/i.test(String(error?.message || error));
}

async function selectExactlyOneV2Lane(
  frame,
  selector,
  { waitTimeoutMs = BLOCK5_STAGE_TIMEOUT_MS } = {}
) {
  try {
    // Playwright re-resolves this locator during actionability checks, so a
    // shell re-render cannot split observation, counting, and clicking apart.
    await frame.locator(selector).click({ timeout: waitTimeoutMs });
    return true;
  } catch (error) {
    if (isTimeoutError(error)) return false;
    if (isAmbiguousLaneControlError(error)) fail('block5.ambiguous_visible_lane_control');
    throw error;
  }
}

async function prepareV2Inbox(
  frame,
  worklistProbe,
  { terminalTimeoutMs = V2_INBOX_TERMINAL_TIMEOUT_MS } = {}
) {
  // The Block 5 signoff must inspect the complete active inbox, not a
  // persisted lane or filtered tab from a prior operator session. Some
  // embedded layouts render no lane navigation at all. Without an observable
  // active-lane marker, that is inconclusive rather than an assumed All lane.
  if (!(await selectExactlyOneV2Lane(frame, V2_ALL_LANE, { waitTimeoutMs: terminalTimeoutMs }))) {
    return { status: 'inconclusive', reason: 'no_lane_control_available' };
  }
  await frame.locator(V2_ALL_TAB).first().click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });

  // A visible V2 root is only shell readiness. Mailbox selection starts a
  // debounced authenticated worklist load, so wait for an observable terminal
  // inbox result rather than using a fixed delay.
  await frame
    .locator(`${INBOX_THREAD}, ${INBOX_EMPTY}`)
    .first()
    .waitFor({ state: 'visible', timeout: terminalTimeoutMs });

  const rowCount = await frame.locator(INBOX_THREAD).count();
  const selectedMailboxCount = await frame.locator(RUNTIME_SELECTED_MAILBOX).count();
  return classifyTerminalInbox({
    rowCount,
    selectedMailboxCount,
    worklistStatus: worklistProbe?.getStatus?.() || 0,
  });
}

function warmupMetadata({ status = 'failed', timingClass = 'not_ready' } = {}) {
  return {
    warmCache: status === 'ready',
    warmupStatus: status,
    warmupTimingClass: timingClass,
  };
}

async function warmBlock5Worklist({
  page,
  baseUrl,
  worklistProbe,
  openPreview = openAdminV2Preview,
  prepareInbox = prepareV2Inbox,
  onStageTimeout,
}) {
  worklistProbe?.reset?.();
  const runWarmupStage = (stage, operation) =>
    runStage(stage, operation, BLOCK5_WARMUP_TIMEOUT_MS, { onTimeout: onStageTimeout });
  const preview = await runWarmupStage('warmup_open_preview', () => openPreview(page, baseUrl));
  assertPreviewIntegrity(preview.integrity);
  const inbox = await runWarmupStage(
    'warmup_inbox_hydration',
    () =>
      prepareInbox(preview.frame, worklistProbe, {
        terminalTimeoutMs: BLOCK5_WARMUP_TIMEOUT_MS,
      })
  );
  const worklistStatus = worklistProbe?.getStatus?.() || 0;
  if (worklistStatus !== 200) fail('block5.warmup_worklist_non_200');
  if (inbox.status !== 'rows') {
    return {
      ...warmupMetadata({ status: 'inconclusive', timingClass: 'terminal_empty_scope' }),
      status: 'inconclusive',
      reason: inbox.reason,
    };
  }
  return {
    ...warmupMetadata({ status: 'ready', timingClass: 'within_60_seconds' }),
    status: 'ready',
  };
}

function assertPreviewIntegrity(integrity) {
  if (!integrity?.statusOk || !integrity.verified || !integrity.buildPresent) {
    fail('block5.preview_integrity_failed');
  }
}

async function selectCanonicalThread(frame) {
  const rows = frame.locator(INBOX_THREAD);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    await rows.nth(index).click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
    const booking = frame.locator(BOOKING_ACTION).first();
    const patientId = await booking.getAttribute('data-booking-context-patient-id', {
      timeout: BLOCK5_STAGE_TIMEOUT_MS,
    });
    const disabled = await booking.isDisabled({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
    if (patientId && !disabled) return { patientId, booking };
  }
  fail('block5.no_canonical_thread_available');
}

async function assertNoteUsesSelectedThread(frame) {
  const selectedConversationId = await frame
    .locator('[data-v2-inbox] .thread.active[data-thread-id]')
    .getAttribute('data-thread-id', { timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const noteConversationId = await frame
    .locator(NOTE_ACTION)
    .first()
    .getAttribute('data-note-conversation-id', { timeout: BLOCK5_STAGE_TIMEOUT_MS });
  if (
    !selectedConversationId ||
    !noteConversationId ||
    selectedConversationId !== noteConversationId
  ) {
    fail('block5.note_context_mismatch');
  }
  return { selectedThread: mask(selectedConversationId) };
}

function assertDossierIframeDestination({ topBefore, topAfter, workspaceSrc, expectedPatientId }) {
  const before = new URL(topBefore);
  const after = new URL(topAfter);
  if (
    before.pathname !== '/admin' ||
    before.hash !== '#cco' ||
    after.pathname !== '/admin' ||
    after.hash !== '#cco'
  ) {
    fail('block5.dossier_changed_top_level_admin_route');
  }

  const destination = new URL(workspaceSrc, after.origin);
  const actualPatientId = destination.searchParams.get('patientId');
  if (!actualPatientId || actualPatientId !== expectedPatientId) {
    fail('block5.dossier_destination_context_mismatch');
  }
  return actualPatientId;
}

async function assertDossierHandoff(page, frame, expectedPatientId) {
  const topBefore = await page
    .locator('html')
    .evaluate(() => window.location.href, undefined, { timeout: BLOCK5_STAGE_TIMEOUT_MS });
  await frame.locator('[data-v2-ctx-toggle]').click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const dossier = frame.locator(DOSSIER_ACTION).first();
  if (await dossier.isDisabled({ timeout: BLOCK5_STAGE_TIMEOUT_MS })) {
    fail('block5.dossier_unavailable_for_canonical_thread');
  }
  await dossier.click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  await page.waitForFunction(
    ({ patientId }) => {
      const workspace = document.querySelector('#ccoPreviewEmbedFrame');
      const src = workspace?.getAttribute('src');
      if (!src) return false;
      try {
        return new URL(src, window.location.href).searchParams.get('patientId') === patientId;
      } catch (_) {
        return false;
      }
    },
    { patientId: expectedPatientId },
    { timeout: BLOCK5_STAGE_TIMEOUT_MS }
  );
  const workspaceSrc = await page
    .locator(WORKSPACE_FRAME)
    .getAttribute('src', { timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const topAfter = await page
    .locator('html')
    .evaluate(() => window.location.href, undefined, { timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const actualPatientId = assertDossierIframeDestination({
    topBefore,
    topAfter,
    workspaceSrc,
    expectedPatientId,
  });
  return { patient: mask(actualPatientId) };
}

async function installCalendarMessageProbe(page) {
  await page.addInitScript(() => {
    window.addEventListener('message', (event) => {
      const payload = event && event.data;
      if (
        payload &&
        payload.type === 'cco:kalender:context' &&
        payload.context &&
        payload.context.patientId
      ) {
        document.documentElement.setAttribute(
          'data-block5-calendar-patient-id',
          String(payload.context.patientId)
        );
      }
    });
  });
}

async function assertCalendarHandoff(frame, expectedPatientId) {
  await frame
    .locator('[data-v2-action="calendar"]')
    .first()
    .click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const calendar = frame.frameLocator('iframe.cco-kalender-frame');
  const html = calendar.locator('html');
  await html.waitFor({ state: 'attached', timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const actualPatientId = await html.getAttribute('data-block5-calendar-patient-id', {
    timeout: BLOCK5_STAGE_TIMEOUT_MS,
  });
  if (!actualPatientId) fail('block5.calendar_destination_context_not_observable');
  if (actualPatientId !== expectedPatientId) fail('block5.calendar_destination_context_mismatch');
  return { patient: mask(actualPatientId) };
}

async function assertBookingHandoff(frame, expectedPatientId) {
  const booking = frame.locator(BOOKING_ACTION).first();
  if (
    (await booking.getAttribute('data-booking-context-patient-id', {
      timeout: BLOCK5_STAGE_TIMEOUT_MS,
    })) !== expectedPatientId
  ) {
    fail('block5.booking_expected_context_mismatch');
  }
  await booking.click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const destination = frame
    .locator('[data-booking-surface][data-booking-context-patient-id]')
    .first();
  const actualPatientId = await destination.getAttribute('data-booking-context-patient-id', {
    timeout: BLOCK5_STAGE_TIMEOUT_MS,
  });
  // The source button's marker is expected context only. A booking pass
  // requires destination evidence after the actual click.
  if (!actualPatientId) fail('block5.booking_destination_context_not_observable');
  if (actualPatientId !== expectedPatientId) fail('block5.booking_destination_context_mismatch');
  return { patient: mask(actualPatientId) };
}

async function assertReviewHasNoHandoff(frame) {
  if (!(await selectExactlyOneV2Lane(frame, V2_REVIEW_LANE))) {
    fail('block5.review_lane_control_unavailable');
  }
  const rows = frame.locator(INBOX_THREAD);
  if (!(await rows.count())) fail('block5.no_review_thread_available');
  await rows.first().click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const booking = frame.locator(BOOKING_ACTION).first();
  await frame.locator('[data-v2-ctx-toggle]').click({ timeout: BLOCK5_STAGE_TIMEOUT_MS });
  const dossier = frame.locator(DOSSIER_ACTION).first();
  const noBookingPatient = !(await booking.getAttribute('data-booking-context-patient-id', {
    timeout: BLOCK5_STAGE_TIMEOUT_MS,
  }));
  if (
    !noBookingPatient ||
    !(await booking.isDisabled({ timeout: BLOCK5_STAGE_TIMEOUT_MS })) ||
    !(await dossier.isDisabled({ timeout: BLOCK5_STAGE_TIMEOUT_MS }))
  ) {
    fail('block5.review_thread_exposes_customer_handoff');
  }
  return { status: 'review-no-handoff' };
}

/**
 * Intended only for a separately approved, already authenticated UAT page.
 * Return value is deliberately masked aggregate evidence: no raw thread IDs,
 * patient IDs, URLs, screenshots or storage state leave the process.
 */
async function runBlock5HandoffFlow({ page, baseUrl, worklistProbe, onStageTimeout }) {
  const runHandoffStage = (stage, operation) =>
    runStage(stage, operation, BLOCK5_STAGE_TIMEOUT_MS, { onTimeout: onStageTimeout });
  await runHandoffStage('calendar_probe', () => installCalendarMessageProbe(page));
  let preview = await runHandoffStage('open_preview', () => openAdminV2Preview(page, baseUrl));
  let frame = preview.frame;
  await runHandoffStage('preview_integrity', () => assertPreviewIntegrity(preview.integrity));
  const inbox = await runHandoffStage('inbox_hydration', () => prepareV2Inbox(frame, worklistProbe));
  if (inbox.status === 'inconclusive') return inbox;
  const canonical = await runHandoffStage('canonical_select', () => selectCanonicalThread(frame));
  const note = await runHandoffStage('note_context', () => assertNoteUsesSelectedThread(frame));
  const dossier = await runHandoffStage('dossier_handoff', () =>
    assertDossierHandoff(page, frame, canonical.patientId)
  );

  preview = await runHandoffStage('open_calendar_preview', () => openAdminV2Preview(page, baseUrl));
  frame = preview.frame;
  await runHandoffStage('calendar_preview_integrity', () => assertPreviewIntegrity(preview.integrity));
  const calendarInbox = await runHandoffStage('calendar_inbox_hydration', () =>
    prepareV2Inbox(frame, worklistProbe)
  );
  if (calendarInbox.status === 'inconclusive') {
    fail('block5.scope_became_empty_during_signoff');
  }
  const calendar = await runHandoffStage('calendar_handoff', () =>
    assertCalendarHandoff(frame, canonical.patientId)
  );

  preview = await runHandoffStage('open_booking_preview', () => openAdminV2Preview(page, baseUrl));
  frame = preview.frame;
  await runHandoffStage('booking_preview_integrity', () => assertPreviewIntegrity(preview.integrity));
  const bookingInbox = await runHandoffStage('booking_inbox_hydration', () =>
    prepareV2Inbox(frame, worklistProbe)
  );
  if (bookingInbox.status === 'inconclusive') {
    fail('block5.scope_became_empty_during_signoff');
  }
  const canonicalAgain = await runHandoffStage('booking_canonical_select', () =>
    selectCanonicalThread(frame)
  );
  const booking = await runHandoffStage('booking_handoff', () =>
    assertBookingHandoff(frame, canonicalAgain.patientId)
  );
  if (canonicalAgain.patientId !== canonical.patientId)
    fail('block5.canonical_thread_changed_between_handoffs');

  preview = await runHandoffStage('open_review_preview', () => openAdminV2Preview(page, baseUrl));
  frame = preview.frame;
  await runHandoffStage('review_preview_integrity', () => assertPreviewIntegrity(preview.integrity));
  const reviewInbox = await runHandoffStage('review_inbox_hydration', () =>
    prepareV2Inbox(frame, worklistProbe)
  );
  if (reviewInbox.status === 'inconclusive') {
    fail('block5.scope_became_empty_during_signoff');
  }
  const review = await runHandoffStage('review_guard', () => assertReviewHasNoHandoff(frame));
  return { status: 'pass', dossier, calendar, booking, note, review };
}

async function runBlock5ReadonlyHandoffHarness({ page, baseUrl, ownerApprovedProduction = false }) {
  assertPage(page);
  assertApprovedRun(baseUrl, ownerApprovedProduction);
  const origin = new URL(baseUrl).origin;
  const cleanup = await installReadOnlyGuard(page, origin);
  const worklistProbe = installWorklistResponseProbe(page, origin);
  let result;
  let diagnostics;
  try {
    result = await runBlock5HandoffFlow({ page, baseUrl, worklistProbe });
  } finally {
    await worklistProbe.cleanup();
    diagnostics = await cleanup();
  }
  return { ...result, ...diagnostics };
}

async function closeDedicatedRunnerPage(page) {
  if (typeof page.isClosed === 'function' && page.isClosed()) return;
  await ignoreTargetClosed(() => page.close({ runBeforeUnload: false }), true);
}

async function withDedicatedSignoffRunnerPage(userPage, operation) {
  const context = typeof userPage.context === 'function' ? userPage.context() : null;
  if (!context || typeof context.newPage !== 'function') {
    fail('block5.dedicated_runner_page_unavailable');
  }
  const runnerPage = await context.newPage();
  assertPage(runnerPage);
  try {
    return await operation(runnerPage);
  } finally {
    await closeDedicatedRunnerPage(runnerPage);
  }
}

function createRunnerTimeoutCancellation(runnerPage) {
  let timeoutCancelled = false;
  return {
    onTimeout: async () => {
      timeoutCancelled = true;
      await closeDedicatedRunnerPage(runnerPage);
    },
    isTimeoutCancelled: () => timeoutCancelled,
  };
}

function shouldTolerateClosedCleanup({ timeoutCancelled = false, operationFailed = false } = {}) {
  // Cleanup must not replace the primary failure after a runner page closes.
  return Boolean(timeoutCancelled || operationFailed);
}

async function runBlock5WarmCacheReadonlyHandoffOnPage({
  page,
  baseUrl,
  onStageTimeout,
  isTimeoutCancelled,
}) {
  const origin = new URL(baseUrl).origin;
  const cleanup = await installReadOnlyGuard(page, origin);
  const worklistProbe = installWorklistResponseProbe(page, origin);
  let result;
  let diagnostics;
  let operationFailed = false;
  try {
    const warmup = await warmBlock5Worklist({
      page,
      baseUrl,
      worklistProbe,
      onStageTimeout,
    });
    if (warmup.status !== 'ready') {
      result = warmup;
    } else {
      const handoff = await runBlock5HandoffFlow({
        page,
        baseUrl,
        worklistProbe,
        onStageTimeout,
      });
      result = { ...handoff, ...warmup };
    }
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    const tolerateTargetClosed = shouldTolerateClosedCleanup({
      timeoutCancelled: isTimeoutCancelled?.(),
      operationFailed,
    });
    await worklistProbe.cleanup({ tolerateTargetClosed });
    diagnostics = await cleanup({ tolerateTargetClosed, preservePrimaryError: operationFailed });
  }
  return { ...result, ...diagnostics };
}

/**
 * Warm-cache signoff variant. It intentionally records that its handoff proof
 * was run after a bounded, GET-only cache warm-up; it is never cold-path SLO
 * evidence. It uses a new page in the caller's existing authenticated context
 * so a deadline can cancel the operation without closing an owner page.
 */
async function runBlock5WarmCacheReadonlyHandoffHarness({
  page: userPage,
  baseUrl,
  ownerApprovedProduction = false,
}) {
  assertPage(userPage);
  assertApprovedRun(baseUrl, ownerApprovedProduction);
  return withDedicatedSignoffRunnerPage(userPage, async (runnerPage) => {
    const cancellation = createRunnerTimeoutCancellation(runnerPage);
    return runBlock5WarmCacheReadonlyHandoffOnPage({
      page: runnerPage,
      baseUrl,
      onStageTimeout: cancellation.onTimeout,
      isTimeoutCancelled: cancellation.isTimeoutCancelled,
    });
  });
}

module.exports = {
  SAFE_SAME_ORIGIN_WRITES,
  assertApprovedRun,
  assertBookingHandoff,
  assertDossierIframeDestination,
  assertNoteUsesSelectedThread,
  assertPreviewIntegrity,
  classifyTerminalInbox,
  createRunnerTimeoutCancellation,
  installReadOnlyGuard,
  installWorklistResponseProbe,
  isV2PreviewDocumentResponse,
  isNonBlockingAdminShellResponse,
  isExplicitSafeSameOriginWrite,
  isSameOriginWrite,
  isSupersededV2ReadFailure,
  getPreviewIntegrityEvidence,
  mask,
  prepareV2Inbox,
  runStage,
  shouldTolerateClosedCleanup,
  warmBlock5Worklist,
  withDedicatedSignoffRunnerPage,
  runBlock5ReadonlyHandoffHarness,
  runBlock5WarmCacheReadonlyHandoffHarness,
  selectExactlyOneV2Lane,
};
