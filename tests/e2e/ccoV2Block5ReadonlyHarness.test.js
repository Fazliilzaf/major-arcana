'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HARNESS_PATH = path.join(__dirname, 'cco-v2-block5-readonly-harness.js');
const V2_SHELL_PATH = path.join(
  __dirname,
  '../../public/major-arcana-preview/app/cco-conversations-v2-shell.js'
);
const RUNTIME_QUEUE_RENDERERS_PATH = path.join(
  __dirname,
  '../../public/major-arcana-preview/runtime-queue-renderers.js'
);
const V2_CSS_PATH = path.join(
  __dirname,
  '../../public/major-arcana-preview/app/cco-conversations-v2.css'
);
const {
  assertApprovedRun,
  assertDossierIframeDestination,
  assertPreviewIntegrity,
  classifyTerminalInbox,
  getPreviewIntegrityEvidence,
  installReadOnlyGuard,
  installWorklistResponseProbe,
  isNonBlockingAdminShellResponse,
  isExplicitSafeSameOriginWrite,
  isSameOriginWrite,
  isSupersededV2ReadFailure,
  isV2PreviewDocumentResponse,
  mask,
  SAFE_SAME_ORIGIN_WRITES,
  prepareV2Inbox,
  runStage,
  selectExactlyOneV2Lane,
  warmBlock5Worklist,
} = require('./cco-v2-block5-readonly-harness');

function previewDocumentResponse({
  url = 'https://arcana.hairtpclinic.com/major-arcana-preview/?view=conversations&embed=admin&conversations=v2',
  status = 200,
  resourceType = 'document',
  headers = {
    'x-arcana-preview-integrity': 'verified',
    'x-arcana-preview-build': 'build-present',
  },
} = {}) {
  return {
    url: () => url,
    status: () => status,
    headers: () => headers,
    request: () => ({ resourceType: () => resourceType }),
  };
}

test('Block 5-harnessen känner igen enbart same-origin-skrivningar', () => {
  assert.equal(
    isSameOriginWrite(
      'https://arcana.hairtpclinic.com/api/v1/cco/runtime/sync',
      'POST',
      'https://arcana.hairtpclinic.com'
    ),
    true
  );
  assert.equal(
    isSameOriginWrite(
      'https://arcana.hairtpclinic.com/api/v1/cco/runtime/worklist',
      'GET',
      'https://arcana.hairtpclinic.com'
    ),
    false
  );
  assert.equal(
    isSameOriginWrite('https://example.test/api', 'PATCH', 'https://arcana.hairtpclinic.com'),
    false
  );
});

test('Block 5-harnessen kräver uttryckligt produktionsgodkännande', () => {
  assert.throws(
    () => assertApprovedRun('https://arcana.hairtpclinic.com', false),
    /block5\.production_run_requires_explicit_owner_approval/
  );
  assert.doesNotThrow(() => assertApprovedRun('https://arcana.hairtpclinic.com', true));
  assert.doesNotThrow(() => assertApprovedRun('http://127.0.0.1:3100', false));
});

test('Block 5-harnessen använder endast den exakta V2 iframe-dokumentnavigeringen som integritetsbevis', () => {
  const origin = 'https://arcana.hairtpclinic.com';
  assert.equal(isV2PreviewDocumentResponse(previewDocumentResponse(), origin), true);
  assert.equal(
    isV2PreviewDocumentResponse(
      previewDocumentResponse({
        url: 'https://arcana.hairtpclinic.com/major-arcana-preview/?view=customers&embed=admin&conversations=v2',
      }),
      origin
    ),
    false
  );
  assert.equal(
    isV2PreviewDocumentResponse(
      previewDocumentResponse({
        url: 'https://arcana.hairtpclinic.com/major-arcana-preview/?view=conversations&embed=admin',
      }),
      origin
    ),
    false
  );
  assert.equal(
    isV2PreviewDocumentResponse(previewDocumentResponse({ resourceType: 'fetch' }), origin),
    false
  );
});

test('Block 5-harnessen fail-closar preview-integritet vid icke-2xx eller saknad header', () => {
  assert.doesNotThrow(() =>
    assertPreviewIntegrity(getPreviewIntegrityEvidence(previewDocumentResponse()))
  );
  assert.throws(
    () =>
      assertPreviewIntegrity(getPreviewIntegrityEvidence(previewDocumentResponse({ status: 503 }))),
    /block5\.preview_integrity_failed/
  );
  assert.throws(
    () =>
      assertPreviewIntegrity(
        getPreviewIntegrityEvidence(
          previewDocumentResponse({ headers: { 'x-arcana-preview-build': 'build-present' } })
        )
      ),
    /block5\.preview_integrity_failed/
  );
});

test('Block 5-harnessen översätter endast äkta timeout till maskerad stegkod', async () => {
  const timeout = new Error('sensitive driver timing detail');
  timeout.name = 'TimeoutError';
  await assert.rejects(
    runStage('dossier_handoff', async () => {
      throw timeout;
    }),
    (error) => {
      assert.equal(error.message, 'block5.dossier_handoff_timeout');
      assert.doesNotMatch(error.message, /sensitive|driver|timing/i);
      return true;
    }
  );
});

test('Block 5-harnessen stoppar en hydreringsstage som aldrig löser med maskerad timeoutkod', async () => {
  await assert.rejects(
    runStage('inbox_hydration', () => new Promise(() => {}), 1),
    (error) => {
      assert.equal(error.message, 'block5.inbox_hydration_timeout');
      return true;
    }
  );
});

test('Block 5-harnessen låter vanliga fel vara röda och oförändrade', async () => {
  const ordinaryError = new Error('ordinary expected failure');
  await assert.rejects(
    runStage('booking_handoff', async () => {
      throw ordinaryError;
    }),
    (error) => {
      assert.equal(error, ordinaryError);
      return true;
    }
  );
});

test('Block 5-harnessen har separata deadline-steg för V2-mount och varje inkorgshydrering', () => {
  const source = fs.readFileSync(HARNESS_PATH, 'utf8');
  const openPreview = source.slice(
    source.indexOf('async function openAdminV2Preview'),
    source.indexOf('function classifyTerminalInbox')
  );
  assert.doesNotMatch(openPreview, /prepareV2Inbox/);
  assert.match(
    source,
    /runStage\('inbox_hydration', \(\) => prepareV2Inbox\(frame, worklistProbe\)\)/
  );
  assert.match(source, /runStage\('calendar_inbox_hydration'/);
  assert.match(source, /runStage\('booking_inbox_hydration'/);
  assert.match(source, /runStage\('review_inbox_hydration'/);
});

test('Block 5-harnessen kräver samma patient i workspace-iframen och lämnar adminrouten orörd', () => {
  assert.equal(
    assertDossierIframeDestination({
      topBefore: 'https://arcana.hairtpclinic.com/admin#cco',
      topAfter: 'https://arcana.hairtpclinic.com/admin#cco',
      workspaceSrc: '/staff?view=customers&patientId=patient-1',
      expectedPatientId: 'patient-1',
    }),
    'patient-1'
  );
  assert.throws(
    () =>
      assertDossierIframeDestination({
        topBefore: 'https://arcana.hairtpclinic.com/admin#cco',
        topAfter: 'https://arcana.hairtpclinic.com/admin#cco',
        workspaceSrc: '/staff?view=customers&patientId=other-patient',
        expectedPatientId: 'patient-1',
      }),
    /block5\.dossier_destination_context_mismatch/
  );
  assert.throws(
    () =>
      assertDossierIframeDestination({
        topBefore: 'https://arcana.hairtpclinic.com/admin#cco',
        topAfter: 'https://arcana.hairtpclinic.com/staff?patientId=patient-1',
        workspaceSrc: '/staff?view=customers&patientId=patient-1',
        expectedPatientId: 'patient-1',
      }),
    /block5\.dossier_changed_top_level_admin_route/
  );
});

test('Block 5-harnessen väntar på fördröjd hydrering innan den väljer canonical tråd', async () => {
  let hydrated = false;
  const clicks = [];
  const frame = {
    locator(selector) {
      if (
        selector ===
          '#cco-conv-v2-root .lane-row[data-lane="all"]:visible, #cco-conv-v2-root .lane-chip[data-lane="all"]:visible' ||
        selector === '[data-tab="alla"]'
      ) {
        return {
          count: async () => 1,
          click: async () => clicks.push(selector),
          first: () => ({ click: async () => clicks.push(selector) }),
        };
      }
      if (selector === '[data-v2-inbox] .thread[data-thread-id], [data-v2-inbox] .inbox-empty') {
        return {
          first: () => ({
            waitFor: async () => {
              hydrated = true;
            },
          }),
        };
      }
      if (selector === '[data-v2-inbox] .thread[data-thread-id]') {
        return { count: async () => (hydrated ? 1 : 0) };
      }
      if (selector === '[data-runtime-mailbox]:checked') {
        return { count: async () => 1 };
      }
      throw new Error(`Oväntad selector: ${selector}`);
    },
  };

  assert.deepEqual(await prepareV2Inbox(frame), { status: 'rows' });
  assert.deepEqual(clicks, [
    '#cco-conv-v2-root .lane-row[data-lane="all"]:visible, #cco-conv-v2-root .lane-chip[data-lane="all"]:visible',
    '[data-tab="alla"]',
  ]);
});

test('Block 5-harnessen gör avsaknad av lane-kontroll maskerat inconclusive', async () => {
  const frame = {
    locator(selector) {
      if (
        selector ===
        '#cco-conv-v2-root .lane-row[data-lane="all"]:visible, #cco-conv-v2-root .lane-chip[data-lane="all"]:visible'
      ) {
        return { count: async () => 0 };
      }
      throw new Error(`Oväntad selector: ${selector}`);
    },
  };
  assert.deepEqual(await prepareV2Inbox(frame), {
    status: 'inconclusive',
    reason: 'no_lane_control_available',
  });
});

test('Block 5-harnessen vägrar tvetydiga synliga lane-kontroller', async () => {
  const frame = {
    locator: () => ({ count: async () => 2, click: async () => {} }),
  };
  await assert.rejects(
    selectExactlyOneV2Lane(frame, '#cco-conv-v2-root .lane-row[data-lane="all"]:visible'),
    /block5\.ambiguous_visible_lane_control/
  );
});

test('Block 5-harnessen räknar om och klickar säkert efter en render-race', async () => {
  let locatorCalls = 0;
  let clicks = 0;
  const frame = {
    locator: () => {
      locatorCalls += 1;
      return {
        count: async () => 1,
        click: async () => {
          clicks += 1;
          if (clicks === 1) throw new Error('Element is not attached to the DOM');
        },
      };
    },
  };
  assert.equal(
    await selectExactlyOneV2Lane(frame, '#cco-conv-v2-root .lane-row[data-lane="all"]:visible'),
    true
  );
  assert.equal(locatorCalls, 2);
  assert.equal(clicks, 2);
});

test('Block 5-harnessen använder v2-skalets faktiska lane- och Alla-flikselektorer', () => {
  const shell = fs.readFileSync(V2_SHELL_PATH, 'utf8');
  const runtimeQueueRenderers = fs.readFileSync(RUNTIME_QUEUE_RENDERERS_PATH, 'utf8');
  const css = fs.readFileSync(V2_CSS_PATH, 'utf8');
  const harness = fs.readFileSync(HARNESS_PATH, 'utf8');
  assert.match(shell, /class="lane-row'\s*\+\s*active\s*\+\s*'" data-lane="'/);
  assert.match(shell, /class="lane-chip'\s*\+\s*active\s*\+\s*'" data-lane="'/);
  assert.match(shell, /data-tab="'\s*\+\s*tab\.id/);
  assert.match(shell, /\{ id: 'alla', label: 'Alla'/);
  assert.match(
    harness,
    /#cco-conv-v2-root \.lane-row\[data-lane="all"\]:visible, #cco-conv-v2-root \.lane-chip\[data-lane="all"\]:visible/
  );
  assert.match(harness, /const V2_ALL_TAB = '\[data-tab="alla"\]'/);
  assert.match(
    harness,
    /#cco-conv-v2-root \.lane-row\[data-lane="review"\]:visible, #cco-conv-v2-root \.lane-chip\[data-lane="review"\]:visible/
  );
  assert.match(
    runtimeQueueRenderers,
    /data-runtime-mailbox="\$\{escapeHtml\(mailboxScopeId\)\}"\$\{checked/
  );
  assert.match(harness, /const RUNTIME_SELECTED_MAILBOX = '\[data-runtime-mailbox\]:checked'/);
  assert.doesNotMatch(harness, /data-v2-lane/);
  assert.doesNotMatch(harness, /data-v2-folder/);
  assert.match(
    css,
    /@media \(min-width: 769px\) and \(max-width: 1024px\)[\s\S]*?\.lane-sidebar\s*\{\s*display: none;/
  );
  assert.match(
    css,
    /@media \(min-width: 769px\) and \(max-width: 1024px\)[\s\S]*?\.lane-chips\s*\{\s*display: flex;/
  );
  assert.doesNotMatch(harness, /const V2_ALL_LANE = '\[data-lane="all"\]'/);
  assert.doesNotMatch(harness, /const V2_REVIEW_LANE = '\[data-lane="review"\]'/);
});

test('Block 5-harnessen kan inte välja runtime-radens dubbla data-lane-attribut', () => {
  const harness = fs.readFileSync(HARNESS_PATH, 'utf8');
  const runtimeQueueRenderers = fs.readFileSync(RUNTIME_QUEUE_RENDERERS_PATH, 'utf8');
  assert.match(
    runtimeQueueRenderers,
    /const v5DataLane = ` data-lane="\$\{escapeHtml\(v5Lane\)\}"`/
  );
  assert.doesNotMatch(harness, /\.locator\('\[data-lane="(?:all|review)"\]'\)/);
  assert.match(harness, /\.lane-row\[data-lane="all"\]:visible/);
  assert.match(harness, /\.lane-chip\[data-lane="all"\]:visible/);
  assert.match(harness, /\.lane-row\[data-lane="review"\]:visible/);
  assert.match(harness, /\.lane-chip\[data-lane="review"\]:visible/);
});

test('Block 5-harnessen gör ett terminalt tomt scope maskerat inconclusive', () => {
  assert.deepEqual(
    classifyTerminalInbox({
      rowCount: 0,
      selectedMailboxCount: 1,
    }),
    { status: 'inconclusive', reason: 'no_canonical_thread_in_scope' }
  );
  assert.throws(
    () => classifyTerminalInbox({ rowCount: 0, worklistStatus: 401 }),
    /block5\.auth_required/
  );
  assert.throws(
    () => classifyTerminalInbox({ rowCount: 0, selectedMailboxCount: 3 }),
    /block5\.scope_error/
  );
});

test('Block 5 warm-up kräver en observerad consumer-GET 200 och märker godkänd körning som varm cache', async () => {
  let reset = 0;
  let terminalTimeoutMs = 0;
  const result = await warmBlock5Worklist({
    page: {},
    baseUrl: 'https://arcana.hairtpclinic.com',
    worklistProbe: {
      reset: () => {
        reset += 1;
      },
      getStatus: () => 200,
    },
    openPreview: async () => ({
      frame: {},
      integrity: { statusOk: true, verified: true, buildPresent: true },
    }),
    prepareInbox: async (_frame, _probe, options) => {
      terminalTimeoutMs = options.terminalTimeoutMs;
      return { status: 'rows' };
    },
  });

  assert.equal(reset, 1);
  assert.equal(terminalTimeoutMs, 60000);
  assert.deepEqual(result, {
    warmCache: true,
    warmupStatus: 'ready',
    warmupTimingClass: 'within_60_seconds',
    status: 'ready',
  });
});

test('Block 5 warm-up får aldrig fortsätta vid saknad eller icke-grön consumer-GET', async () => {
  await assert.rejects(
    warmBlock5Worklist({
      page: {},
      baseUrl: 'https://arcana.hairtpclinic.com',
      worklistProbe: { reset: () => {}, getStatus: () => 503 },
      openPreview: async () => ({
        frame: {},
        integrity: { statusOk: true, verified: true, buildPresent: true },
      }),
      prepareInbox: async () => ({ status: 'rows' }),
    }),
    /block5\.warmup_worklist_non_200/
  );
});

test('Block 5 warm-up gör terminalt tomt scope inconclusive, aldrig pass', async () => {
  const result = await warmBlock5Worklist({
    page: {},
    baseUrl: 'https://arcana.hairtpclinic.com',
    worklistProbe: { reset: () => {}, getStatus: () => 200 },
    openPreview: async () => ({
      frame: {},
      integrity: { statusOk: true, verified: true, buildPresent: true },
    }),
    prepareInbox: async () => ({
      status: 'inconclusive',
      reason: 'no_canonical_thread_in_scope',
    }),
  });

  assert.deepEqual(result, {
    warmCache: false,
    warmupStatus: 'inconclusive',
    warmupTimingClass: 'terminal_empty_scope',
    status: 'inconclusive',
    reason: 'no_canonical_thread_in_scope',
  });
});

test('Block 5 warm-cache-variant återanvänder read-only-vakten före warm-up och sparar inga artefakter', () => {
  const source = fs.readFileSync(HARNESS_PATH, 'utf8');
  const warmHarness = source.slice(
    source.indexOf('async function runBlock5WarmCacheReadonlyHandoffHarness'),
    source.indexOf('module.exports')
  );
  assert.match(warmHarness, /const cleanup = await installReadOnlyGuard\(page, origin\)/);
  assert.match(warmHarness, /const warmup = await warmBlock5Worklist/);
  assert.match(warmHarness, /result = \{ \.\.\.handoff, \.\.\.warmup \}/);
  assert.doesNotMatch(warmHarness, /screenshot|storageState|cookies\(/i);
});

test('Block 5-harnessen läser verkliga worklist-statusar utan att spara URL eller payload', () => {
  const handlers = {};
  const page = {
    on: (event, handler) => {
      handlers[event] = handler;
    },
    off: (event, handler) => {
      assert.equal(handlers[event], handler);
      delete handlers[event];
    },
  };
  const probe = installWorklistResponseProbe(page, 'https://arcana.hairtpclinic.com');
  handlers.response({
    url: () => 'https://arcana.hairtpclinic.com/api/v1/cco/runtime/worklist/consumer?scope=one',
    status: () => 422,
    request: () => ({ method: () => 'POST' }),
  });
  assert.equal(probe.getStatus(), 0);
  handlers.response({
    url: () => 'https://arcana.hairtpclinic.com/api/v1/cco/runtime/worklist/consumer?scope=one',
    status: () => 422,
    request: () => ({ method: () => 'GET' }),
  });
  assert.equal(probe.getStatus(), 422);
  handlers.response({
    url: () => 'https://arcana.hairtpclinic.com/api/v1/cco/runtime/worklist',
    status: () => 200,
    request: () => ({ method: () => 'GET' }),
  });
  assert.equal(probe.getStatus(), 422);
  probe.cleanup();
  assert.equal(handlers.response, undefined);
});

test('Block 5-harnessen har en tom, exakt allowlist tills säker skrivning är bevisad', () => {
  assert.deepEqual(SAFE_SAME_ORIGIN_WRITES, []);
  assert.equal(
    isExplicitSafeSameOriginWrite(
      'https://arcana.hairtpclinic.com/api/v1/telemetry',
      'POST',
      'https://arcana.hairtpclinic.com'
    ),
    false
  );
});

test('Block 5-harnessen avbryter slutresultatet när en skrivning blockerats', async () => {
  const handlers = {};
  const page = {
    async route(_pattern, handler) {
      handlers.route = handler;
    },
    async unroute() {},
    on(name, handler) {
      handlers[name] = handler;
    },
    off() {},
  };
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  let aborted = false;
  await handlers.route({
    request: () => ({
      url: () => 'https://arcana.hairtpclinic.com/api/v1/cco/runtime/conversation/x/action',
      method: () => 'POST',
    }),
    abort: async () => {
      aborted = true;
    },
    continue: async () => {
      throw new Error('a same-origin write must not continue');
    },
  });
  assert.equal(aborted, true);
  await assert.rejects(cleanup, /block5\.same_origin_write_attempted/);
});

function makeReadOnlyGuardPage() {
  const handlers = {};
  return {
    handlers,
    page: {
      async route(_pattern, handler) {
        handlers.route = handler;
      },
      async unroute() {},
      on(name, handler) {
        handlers[name] = handler;
      },
      off() {},
    },
  };
}

test('Block 5-harnessen gör pageerror rött', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  handlers.pageerror(new Error('render crash'));
  await assert.rejects(cleanup, /block5\.client_error_detected:pageerror/);
});

test('Block 5-harnessen rapporterar misslyckad extern bild maskerat utan rött fel', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  const imageUrl = 'https://images.sender.example/logo.png';
  handlers.requestfailed({
    url: () => imageUrl,
    resourceType: () => 'image',
  });
  handlers.console({
    type: () => 'error',
    text: () => `Failed to load resource: ${imageUrl}`,
    location: () => ({ url: imageUrl }),
  });
  assert.deepEqual(await cleanup(), { externalImageResourceFailures: 1 });
});

test('Block 5-harnessen gör bara de tre verifierade admin-shell 401/403-felen icke-blockerande', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  const paths = [
    '/api/v1/marketing/campaigns',
    '/api/v1/cco-users/fazli',
    '/api/v1/ops/maintenance-window',
  ];
  for (const [index, pathname] of paths.entries()) {
    const url = `https://arcana.hairtpclinic.com${pathname}`;
    handlers.response({ url: () => url, status: () => (index === 1 ? 403 : 401) });
    handlers.console({
      type: () => 'error',
      text: () => 'Failed to load resource',
      location: () => ({ url }),
    });
  }
  assert.deepEqual(await cleanup(), { unrelatedAdminShellResourceErrors: 3 });
});

test('Block 5-harnessen håller andra admin-shell-fel röda', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  const url = 'https://arcana.hairtpclinic.com/api/v1/marketing/campaigns';
  handlers.response({ url: () => url, status: () => 500 });
  handlers.console({
    type: () => 'error',
    text: () => 'Failed to load resource',
    location: () => ({ url }),
  });
  await assert.rejects(cleanup, /block5\.client_error_detected:console-error/);
});

test('Block 5-harnessen gör endast exakta aborterade V2-läsningar icke-blockerande', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  for (const pathname of ['/api/v1/cco/runtime/stream', '/api/v1/cco/runtime/worklist/consumer']) {
    handlers.requestfailed({
      url: () => `https://arcana.hairtpclinic.com${pathname}?scope=contact`,
      method: () => 'GET',
      resourceType: () => 'fetch',
      failure: () => ({ errorText: 'net::ERR_ABORTED' }),
    });
  }
  assert.deepEqual(await cleanup(), { supersededReadFailures: 2 });
});

test('Block 5-harnessen håller andra eller icke-GET aborterade läsningar röda', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  handlers.requestfailed({
    url: () => 'https://arcana.hairtpclinic.com/api/v1/cco/runtime/stream',
    method: () => 'POST',
    resourceType: () => 'fetch',
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  });
  await assert.rejects(cleanup, /block5\.client_error_detected:resource-failure/);
});

test('Block 5-harnessen har snäva path- och metodregler för sina icke-blockerande diagnoser', () => {
  const origin = 'https://arcana.hairtpclinic.com';
  assert.equal(
    isNonBlockingAdminShellResponse(`${origin}/api/v1/marketing/campaigns?tenant=cco`, 401, origin),
    true
  );
  assert.equal(
    isNonBlockingAdminShellResponse(`${origin}/api/v1/marketing/campaigns`, 500, origin),
    false
  );
  assert.equal(
    isNonBlockingAdminShellResponse(`${origin}/api/v1/cco-users/other`, 403, origin),
    false
  );
  assert.equal(
    isSupersededV2ReadFailure(
      {
        url: `${origin}/api/v1/cco/runtime/worklist/consumer?scope=contact`,
        method: 'GET',
        errorText: 'net::ERR_ABORTED',
      },
      origin
    ),
    true
  );
  assert.equal(
    isSupersededV2ReadFailure(
      {
        url: `${origin}/api/v1/cco/runtime/worklist/consumer`,
        method: 'GET',
        errorText: 'net::ERR_FAILED',
      },
      origin
    ),
    false
  );
});

test('Block 5-harnessen gör misslyckad same-origin-resurs röd', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  handlers.requestfailed({
    url: () => 'https://arcana.hairtpclinic.com/assets/preview.js',
    resourceType: () => 'script',
  });
  await assert.rejects(cleanup, /block5\.client_error_detected:resource-failure/);
});

test('Block 5-harnessen gör vanligt console.error rött', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  handlers.console({
    type: () => 'error',
    text: () => 'Uncaught TypeError: selected thread is undefined',
    location: () => ({ url: 'https://arcana.hairtpclinic.com/major-arcana-preview/app.js' }),
  });
  await assert.rejects(cleanup, /block5\.client_error_detected:console-error/);
});

test('Block 5-harnessen rapporterar flera röda klasser utan rådiagnostik', async () => {
  const { page, handlers } = makeReadOnlyGuardPage();
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  handlers.pageerror(new Error('sensitive runtime detail'));
  handlers.requestfailed({
    url: () => 'https://arcana.hairtpclinic.com/assets/preview.js',
    resourceType: () => 'script',
  });
  await assert.rejects(cleanup, /block5\.client_error_detected:pageerror,resource-failure/);
});

test('Block 5-harnessen returnerar bara maskerade identifierare och kräver destinationsbevisning', () => {
  const source = fs.readFileSync(HARNESS_PATH, 'utf8');
  assert.match(source, /crypto\s*\.\s*createHash\('sha256'\)/);
  assert.match(source, /booking_destination_context_not_observable/);
  assert.match(source, /await booking\.click\(\{ timeout: BLOCK5_STAGE_TIMEOUT_MS \}\)/);
  assert.match(source, /assertDossierHandoff/);
  assert.match(source, /#ccoPreviewEmbedFrame/);
  assert.match(source, /dossier_changed_top_level_admin_route/);
  assert.doesNotMatch(source, /page\.waitForURL\(/);
  assert.doesNotMatch(source, /page\.url\(\)/);
  assert.match(source, /assertCalendarHandoff/);
  assert.match(source, /assertReviewHasNoHandoff/);
  assert.match(source, /V2_INBOX_TERMINAL_TIMEOUT_MS/);
  assert.match(source, /const BLOCK5_STAGE_TIMEOUT_MS = 20000/);
  assert.match(source, /function isTimeoutError\(error\)/);
  assert.match(source, /error\?\.name === 'TimeoutError'/);
  assert.match(source, /block5\.\$\{stage\}_timeout/);
  assert.match(source, /Promise\.race\(\[Promise\.resolve\(\)\.then\(operation\), deadline\]\)/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.match(source, /page\.waitForResponse\(/);
  assert.match(source, /isV2PreviewDocumentResponse/);
  assert.match(source, /getPreviewIntegrityEvidence/);
  assert.doesNotMatch(source, /fetch\(window\.location\.href/);
  assert.match(source, /no_canonical_thread_in_scope/);
  assert.match(source, /x-arcana-preview-integrity/);
  assert.match(source, /x-arcana-preview-build/);
  assert.match(source, /frame\.frameLocator\('iframe\.cco-kalender-frame'\)/);
  assert.doesNotMatch(source, /page\.frameLocator\('iframe\.cco-kalender-frame'\)/);
  assert.match(source, /\[data-cco-more-toggle\]/);
  assert.match(source, /\[data-cco-more="konversationer_v2_preview"\]/);
  assert.match(source, /\[data-booking-surface\]\[data-booking-context-patient-id\]/);
  assert.match(source, /\[data-v2-thread\] \[data-v2-action="note"\]\[data-note-conversation-id\]/);
  assert.doesNotMatch(source, /page\.screenshot\(|storageState\s*[:(]/);
  assert.notEqual(mask('patient-secret-123'), 'patient-secret-123');
});
