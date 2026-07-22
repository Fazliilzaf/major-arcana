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
const V2_MENU = '[data-cco-more="konversationer_v2_preview"]';
const V2_FRAME = 'iframe[src*="conversations=v2"]';
const V2_ROOT = '#cco-conv-v2-root';
const WORKSPACE_FRAME = '#ccoPreviewEmbedFrame';
const INBOX_THREAD = '[data-v2-inbox] .thread[data-thread-id]';
const INBOX_EMPTY = '[data-v2-inbox] .inbox-empty';
const V2_ALL_LANE = '[data-lane="all"]';
const V2_ALL_TAB = '[data-tab="alla"]';
const V2_REVIEW_LANE = '[data-lane="review"]';
const V2_INBOX_TERMINAL_TIMEOUT_MS = 30000;
const BOOKING_ACTION = '[data-v2-thread] [data-v2-action="booking"]';
const DOSSIER_ACTION = '[data-v2-ctx] [data-v2-action="dossier"]';
const NOTE_ACTION = '[data-v2-thread] [data-v2-action="note"][data-note-conversation-id]';

function fail(code) {
  throw new Error(code);
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

/**
 * Block all same-origin mutations. A blocked write is not merely logged: it
 * fails the final verdict, including writes attempted by recovery handlers.
 */
async function installReadOnlyGuard(page, origin) {
  let blockedWrites = 0;
  const clientErrors = [];
  const requestFailures = [];
  const consoleErrors = [];
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
    requestFailures.push({
      url: request.url(),
      resourceType: String(request.resourceType() || '').toLowerCase(),
    });
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
  page.on('console', onConsole);

  return async function cleanupAndAssertReadOnly() {
    await page.unroute('**/*', routeHandler);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
    page.off('console', onConsole);
    if (blockedWrites) fail('block5.same_origin_write_attempted');
    const externalImageFailures = requestFailures.filter((failure) => {
      try {
        return new URL(failure.url).origin !== origin && failure.resourceType === 'image';
      } catch (_) {
        return false;
      }
    });
    const redRequestFailures = requestFailures.filter((failure) => !externalImageFailures.includes(failure));
    if (redRequestFailures.length) clientErrors.push('resource-failure');
    const externalImageUrls = externalImageFailures.map((failure) => failure.url);
    const hasExternalImageCorrelation = (entry) =>
      externalImageUrls.some(
        (url) => entry.locationUrl === url || (entry.text && entry.text.includes(url))
      );
    if (consoleErrors.some((entry) => !hasExternalImageCorrelation(entry))) {
      clientErrors.push('console-error');
    }
    if (clientErrors.length) {
      // Klassen är avsiktligt en liten fast vokabulär, aldrig feltext, URL
      // eller annat körningsunderlag. Den gör en röd verdict felsökbar utan
      // att harnessen blir en PII-artefakt.
      fail(`block5.client_error_detected:${Array.from(new Set(clientErrors)).sort().join(',')}`);
    }
    return { externalImageResourceFailures: externalImageFailures.length };
  };
}

async function openAdminV2Preview(page, baseUrl, worklistProbe) {
  await page.goto(new URL('/admin#cco', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-cco-more-toggle]').click();
  await page.locator(V2_MENU).click();
  await page.locator(V2_FRAME).waitFor({ state: 'visible' });
  const frame = page.frameLocator(V2_FRAME);
  await frame.locator(V2_ROOT).waitFor({ state: 'visible' });
  return { frame, inbox: await prepareV2Inbox(frame, worklistProbe) };
}

function classifyTerminalInbox({ rowCount = 0, selectedMailboxCount = 0, worklistStatus = 0 } = {}) {
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
      if (url.origin === origin && url.pathname === '/api/v1/cco/runtime/worklist') {
        latestStatus = Number(response.status()) || 0;
      }
    } catch {
      // Ignore malformed or opaque browser response URLs.
    }
  };
  page.on('response', onResponse);
  return {
    getStatus: () => latestStatus,
    cleanup: () => page.off('response', onResponse),
  };
}

async function prepareV2Inbox(frame, worklistProbe) {
  // The Block 5 signoff must inspect the complete active inbox, not a
  // persisted lane or filtered tab from a prior operator session.
  await frame.locator(V2_ALL_LANE).first().click();
  await frame.locator(V2_ALL_TAB).first().click();

  // A visible V2 root is only shell readiness. Mailbox selection starts a
  // debounced authenticated worklist load, so wait for an observable terminal
  // inbox result rather than using a fixed delay.
  await frame
    .locator(`${INBOX_THREAD}, ${INBOX_EMPTY}`)
    .first()
    .waitFor({ state: 'visible', timeout: V2_INBOX_TERMINAL_TIMEOUT_MS });

  const rowCount = await frame.locator(INBOX_THREAD).count();
  const selectedMailboxCount = await frame.locator('[data-v2-mailbox].active').count();
  return classifyTerminalInbox({
    rowCount,
    selectedMailboxCount,
    worklistStatus: worklistProbe?.getStatus?.() || 0,
  });
}

async function assertPreviewIntegrity(frame) {
  const integrity = await frame.locator('html').evaluate(async () => {
    const response = await fetch(window.location.href, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    return {
      status: response.status,
      verified: response.headers.get('x-arcana-preview-integrity') === 'verified',
      buildPresent: Boolean(response.headers.get('x-arcana-preview-build')),
    };
  });
  if (
    integrity.status < 200 ||
    integrity.status >= 300 ||
    !integrity.verified ||
    !integrity.buildPresent
  ) {
    fail('block5.preview_integrity_failed');
  }
}

async function selectCanonicalThread(frame) {
  const rows = frame.locator(INBOX_THREAD);
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    await rows.nth(index).click();
    const booking = frame.locator(BOOKING_ACTION).first();
    const patientId = await booking.getAttribute('data-booking-context-patient-id');
    const disabled = await booking.isDisabled();
    if (patientId && !disabled) return { patientId, booking };
  }
  fail('block5.no_canonical_thread_available');
}

async function assertNoteUsesSelectedThread(frame) {
  const selectedConversationId = await frame
    .locator('[data-v2-inbox] .thread.active[data-thread-id]')
    .getAttribute('data-thread-id');
  const noteConversationId = await frame
    .locator(NOTE_ACTION)
    .first()
    .getAttribute('data-note-conversation-id');
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
  const topBefore = await page.locator('html').evaluate(() => window.location.href);
  await frame.locator('[data-v2-ctx-toggle]').click();
  const dossier = frame.locator(DOSSIER_ACTION).first();
  if (await dossier.isDisabled()) fail('block5.dossier_unavailable_for_canonical_thread');
  await dossier.click();
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
    { patientId: expectedPatientId }
  );
  const workspaceSrc = await page.locator(WORKSPACE_FRAME).getAttribute('src');
  const topAfter = await page.locator('html').evaluate(() => window.location.href);
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
  await frame.locator('[data-v2-action="calendar"]').first().click();
  const calendar = frame.frameLocator('iframe.cco-kalender-frame');
  const html = calendar.locator('html');
  await html.waitFor({ state: 'attached' });
  const actualPatientId = await html.getAttribute('data-block5-calendar-patient-id');
  if (!actualPatientId) fail('block5.calendar_destination_context_not_observable');
  if (actualPatientId !== expectedPatientId) fail('block5.calendar_destination_context_mismatch');
  return { patient: mask(actualPatientId) };
}

async function assertBookingHandoff(frame, expectedPatientId) {
  const booking = frame.locator(BOOKING_ACTION).first();
  if ((await booking.getAttribute('data-booking-context-patient-id')) !== expectedPatientId) {
    fail('block5.booking_expected_context_mismatch');
  }
  await booking.click();
  const destination = frame
    .locator('[data-booking-surface][data-booking-context-patient-id]')
    .first();
  const actualPatientId = await destination.getAttribute('data-booking-context-patient-id');
  // The source button's marker is expected context only. A booking pass
  // requires destination evidence after the actual click.
  if (!actualPatientId) fail('block5.booking_destination_context_not_observable');
  if (actualPatientId !== expectedPatientId) fail('block5.booking_destination_context_mismatch');
  return { patient: mask(actualPatientId) };
}

async function assertReviewHasNoHandoff(frame) {
  await frame.locator(V2_REVIEW_LANE).click();
  const rows = frame.locator(INBOX_THREAD);
  if (!(await rows.count())) fail('block5.no_review_thread_available');
  await rows.first().click();
  const booking = frame.locator(BOOKING_ACTION).first();
  await frame.locator('[data-v2-ctx-toggle]').click();
  const dossier = frame.locator(DOSSIER_ACTION).first();
  const noBookingPatient = !(await booking.getAttribute('data-booking-context-patient-id'));
  if (!noBookingPatient || !(await booking.isDisabled()) || !(await dossier.isDisabled())) {
    fail('block5.review_thread_exposes_customer_handoff');
  }
  return { status: 'review-no-handoff' };
}

/**
 * Intended only for a separately approved, already authenticated UAT page.
 * Return value is deliberately masked aggregate evidence: no raw thread IDs,
 * patient IDs, URLs, screenshots or storage state leave the process.
 */
async function runBlock5ReadonlyHandoffHarness({ page, baseUrl, ownerApprovedProduction = false }) {
  assertPage(page);
  assertApprovedRun(baseUrl, ownerApprovedProduction);
  const origin = new URL(baseUrl).origin;
  const cleanup = await installReadOnlyGuard(page, origin);
  const worklistProbe = installWorklistResponseProbe(page, origin);
  let result;
  let diagnostics;
  try {
    await installCalendarMessageProbe(page);
    let preview = await openAdminV2Preview(page, baseUrl, worklistProbe);
    let frame = preview.frame;
    await assertPreviewIntegrity(frame);
    if (preview.inbox.status === 'inconclusive') {
      result = preview.inbox;
    } else {
      const canonical = await selectCanonicalThread(frame);
      const note = await assertNoteUsesSelectedThread(frame);
      const dossier = await assertDossierHandoff(page, frame, canonical.patientId);

      preview = await openAdminV2Preview(page, baseUrl, worklistProbe);
      frame = preview.frame;
      await assertPreviewIntegrity(frame);
      if (preview.inbox.status === 'inconclusive') {
        fail('block5.scope_became_empty_during_signoff');
      }
      const calendar = await assertCalendarHandoff(frame, canonical.patientId);

      preview = await openAdminV2Preview(page, baseUrl, worklistProbe);
      frame = preview.frame;
      await assertPreviewIntegrity(frame);
      if (preview.inbox.status === 'inconclusive') {
        fail('block5.scope_became_empty_during_signoff');
      }
      const canonicalAgain = await selectCanonicalThread(frame);
      const booking = await assertBookingHandoff(frame, canonicalAgain.patientId);
      if (canonicalAgain.patientId !== canonical.patientId)
        fail('block5.canonical_thread_changed_between_handoffs');

      preview = await openAdminV2Preview(page, baseUrl, worklistProbe);
      frame = preview.frame;
      await assertPreviewIntegrity(frame);
      if (preview.inbox.status === 'inconclusive') {
        fail('block5.scope_became_empty_during_signoff');
      }
      const review = await assertReviewHasNoHandoff(frame);
      result = { status: 'pass', dossier, calendar, booking, note, review };
    }
  } finally {
    worklistProbe.cleanup();
    diagnostics = await cleanup();
  }
  return { ...result, ...diagnostics };
}

module.exports = {
  SAFE_SAME_ORIGIN_WRITES,
  assertApprovedRun,
  assertBookingHandoff,
  assertDossierIframeDestination,
  assertNoteUsesSelectedThread,
  assertPreviewIntegrity,
  classifyTerminalInbox,
  installReadOnlyGuard,
  installWorklistResponseProbe,
  isExplicitSafeSameOriginWrite,
  isSameOriginWrite,
  mask,
  prepareV2Inbox,
  runBlock5ReadonlyHandoffHarness,
};
