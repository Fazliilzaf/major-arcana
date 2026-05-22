const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Kunde inte hitta ${functionName} i app.js.`);

  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parameterDepth += 1;
    if (character === ')') parameterDepth -= 1;
    if (character === '{' && parameterDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `Kunde inte hitta funktionskroppen för ${functionName}.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  throw new Error(`Kunde inte extrahera ${functionName} från app.js.`);
}

function createMailboxScopeHarness({
  selectedMailboxIds = [],
  threads = [],
  availableMailboxes = [],
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getMailboxScopedRuntimeThreads');

  const getMailboxScopedRuntimeThreads = new Function(
    'asArray',
    'canonicalizeRuntimeMailboxId',
    'findRuntimeMailboxByScopeId',
    'getAvailableRuntimeMailboxes',
    'getRuntimeMailboxCanonicalId',
    'getMailboxIdentityTokens',
    'normalizeMailboxId',
    'state',
    `${functionSource}; return getMailboxScopedRuntimeThreads;`
  )(
    (value) => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value];
    },
    (mailboxId, collection = availableMailboxes) => {
      const normalized =
        typeof mailboxId === 'string'
          ? mailboxId.trim().toLowerCase()
          : String(mailboxId || '')
              .trim()
              .toLowerCase();
      if (!normalized) return '';
      const matched = collection.find((mailbox) => {
        const values = [mailbox.id, mailbox.email, mailbox.label];
        return values.some((value) => {
          const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
          if (!candidate) return false;
          if (candidate === normalized) return true;
          return candidate.includes('@') && candidate.split('@')[0] === normalized;
        });
      });
      const canonical =
        typeof matched?.email === 'string' && matched.email.trim()
          ? matched.email.trim().toLowerCase()
          : normalized;
      return canonical;
    },
    (mailboxId, collection = availableMailboxes) => {
      const normalized =
        typeof mailboxId === 'string'
          ? mailboxId.trim().toLowerCase()
          : String(mailboxId || '')
              .trim()
              .toLowerCase();
      if (!normalized) return null;
      return (
        collection.find((mailbox) => {
          const values = [mailbox.id, mailbox.email, mailbox.label];
          return values.some((value) => {
            const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
            if (!candidate) return false;
            if (candidate === normalized) return true;
            return candidate.includes('@') && candidate.split('@')[0] === normalized;
          });
        }) || null
      );
    },
    () => availableMailboxes,
    (mailbox = {}) => {
      const email =
        typeof mailbox.email === 'string' && mailbox.email.trim()
          ? mailbox.email.trim().toLowerCase()
          : typeof mailbox.id === 'string'
            ? mailbox.id.trim().toLowerCase()
            : '';
      return email;
    },
    (mailbox = {}) => {
      const values = [mailbox.id, mailbox.email, mailbox.label];
      const tokens = new Set();
      values.forEach((value) => {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (!normalized) return;
        tokens.add(normalized);
        if (normalized.includes('@')) {
          const localPart = normalized.split('@')[0];
          if (localPart) tokens.add(localPart);
        }
      });
      return Array.from(tokens);
    },
    (value) =>
      typeof value === 'string'
        ? value.trim().toLowerCase()
        : String(value || '')
            .trim()
            .toLowerCase(),
    {
      runtime: {
        selectedMailboxIds,
        threads,
      },
    }
  );

  return getMailboxScopedRuntimeThreads;
}

function createRequestedMailboxIdsHarness({
  selectedMailboxIds = [],
  preferredMailboxId = 'kons@hairtpclinic.com',
  availableMailboxes = [],
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getRequestedRuntimeMailboxIds');

  const getRequestedRuntimeMailboxIds = new Function(
    'asArray',
    'canonicalizeRuntimeMailboxId',
    'getPreferredOperationalMailboxId',
    'state',
    `${functionSource}; return getRequestedRuntimeMailboxIds;`
  )(
    (value) => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value];
    },
    (mailboxId, collection = availableMailboxes) => {
      const normalized =
        typeof mailboxId === 'string'
          ? mailboxId.trim().toLowerCase()
          : String(mailboxId || '')
              .trim()
              .toLowerCase();
      if (!normalized) return '';
      const matched = collection.find((mailbox) => {
        const values = [mailbox.id, mailbox.email, mailbox.label];
        return values.some((value) => {
          const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
          if (!candidate) return false;
          if (candidate === normalized) return true;
          return candidate.includes('@') && candidate.split('@')[0] === normalized;
        });
      });
      const canonical =
        typeof matched?.email === 'string' && matched.email.trim()
          ? matched.email.trim().toLowerCase()
          : normalized;
      return canonical;
    },
    () => preferredMailboxId,
    {
      runtime: {
        selectedMailboxIds,
      },
    }
  );

  return getRequestedRuntimeMailboxIds;
}

function createAvailableRuntimeMailboxesHarness({
  legacyMailboxes = [],
  runtimeMailboxes = [],
  customMailboxes = [],
  defaultSignaturePresets = [],
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const getMailboxIdentityTokensSource = extractFunctionSource(source, 'getMailboxIdentityTokens');
  const isDefaultCustomMailboxSignaturePresetSource = extractFunctionSource(
    source,
    'isDefaultCustomMailboxSignaturePreset'
  );
  const normalizeCustomMailboxDefinitionSource = extractFunctionSource(
    source,
    'normalizeCustomMailboxDefinition'
  );
  const findExistingMailboxKeySource = extractFunctionSource(source, 'findExistingMailboxKey');
  const getRuntimeMailboxCanonicalIdSource = extractFunctionSource(
    source,
    'getRuntimeMailboxCanonicalId'
  );
  const finalizeRuntimeMailboxSurfaceSource = extractFunctionSource(
    source,
    'finalizeRuntimeMailboxSurface'
  );
  const functionSource = extractFunctionSource(source, 'getAvailableRuntimeMailboxes');

  const getAvailableRuntimeMailboxes = new Function(
    'asArray',
    'asText',
    'deriveMailboxLabel',
    'deriveMailboxToneClass',
    'normalizeMailboxId',
    'normalizeMailboxSignatureDraft',
    'resolveRuntimeMailboxPresetEmail',
    'slugifyMailboxId',
    'state',
    'DEFAULT_CUSTOM_MAILBOX_SIGNATURE_PRESETS',
    'LEGACY_RUNTIME_MAILBOXES',
    'titleCaseMailbox',
    `${getMailboxIdentityTokensSource}
     ${isDefaultCustomMailboxSignaturePresetSource}
     ${normalizeCustomMailboxDefinitionSource}
     ${findExistingMailboxKeySource}
     ${getRuntimeMailboxCanonicalIdSource}
     ${finalizeRuntimeMailboxSurfaceSource}
     ${functionSource}
     return getAvailableRuntimeMailboxes;`
  )(
    (value) => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value];
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value.trim() || fallback;
      if (value === undefined || value === null) return fallback;
      return String(value).trim() || fallback;
    },
    (email = '') => {
      const localPart =
        String(email || '')
          .trim()
          .toLowerCase()
          .split('@')[0] || '';
      return localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : '';
    },
    (mailbox = {}) => mailbox?.toneClass || 'mailbox-option-contact',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase(),
    (signature = {}, mailbox = {}) => ({
      label:
        (typeof signature?.label === 'string' && signature.label.trim()) ||
        (typeof signature?.name === 'string' && signature.name.trim()) ||
        `${mailbox?.label || mailbox?.name || 'Mailbox'} signatur`,
      fullName: typeof signature?.fullName === 'string' ? signature.fullName.trim() : '',
      title: typeof signature?.title === 'string' ? signature.title.trim() : '',
      html: typeof signature?.html === 'string' ? signature.html.trim() : '',
    }),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase(),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    {
      runtime: {
        mailboxes: runtimeMailboxes,
      },
      customMailboxes,
    },
    defaultSignaturePresets,
    legacyMailboxes,
    (value = '') => {
      const normalized = String(value || '')
        .trim()
        .toLowerCase();
      const local = normalized.split('@')[0] || normalized;
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  return getAvailableRuntimeMailboxes;
}

test('getMailboxScopedRuntimeThreads matchar legacy mailbox-id mot full mailboxadress', () => {
  const runtimeThread = {
    id: 'thread-kons',
    mailboxAddress: 'kons@hairtpclinic.com',
    mailboxLabel: 'Kons',
  };
  const getMailboxScopedRuntimeThreads = createMailboxScopeHarness({
    selectedMailboxIds: ['kons'],
    threads: [runtimeThread],
    availableMailboxes: [
      {
        id: 'kons',
        email: 'kons@hairtpclinic.com',
        label: 'Kons',
      },
    ],
  });

  assert.deepEqual(getMailboxScopedRuntimeThreads(), [runtimeThread]);
});

test('getMailboxScopedRuntimeThreads returnerar tomt nar valt mailboxscope inte matchar tradens identitet', () => {
  const runtimeThread = {
    id: 'thread-kons',
    mailboxAddress: 'kons@hairtpclinic.com',
    mailboxLabel: 'Kons',
  };
  const getMailboxScopedRuntimeThreads = createMailboxScopeHarness({
    selectedMailboxIds: ['info'],
    threads: [runtimeThread],
    availableMailboxes: [
      {
        id: 'info',
        email: 'info@hairtpclinic.com',
        label: 'Info',
      },
    ],
  });

  assert.deepEqual(getMailboxScopedRuntimeThreads(), []);
});

test('getRequestedRuntimeMailboxIds canonicaliserar legacy mailbox-id till full mailboxadress innan live-request', () => {
  const getRequestedRuntimeMailboxIds = createRequestedMailboxIdsHarness({
    selectedMailboxIds: ['contact', 'fazli'],
    availableMailboxes: [
      {
        id: 'contact',
        email: 'contact@hairtpclinic.com',
        label: 'Kontakt',
      },
      {
        id: 'fazli',
        email: 'fazli@hairtpclinic.com',
        label: 'Fazli',
      },
    ],
  });

  assert.deepEqual(getRequestedRuntimeMailboxIds(), [
    'contact@hairtpclinic.com',
    'fazli@hairtpclinic.com',
  ]);
});

test('getAvailableRuntimeMailboxes skiljer live-mailbox med lokal signaturprofil från ren custom-mailbox', () => {
  const getAvailableRuntimeMailboxes = createAvailableRuntimeMailboxesHarness({
    legacyMailboxes: [
      {
        id: 'fazli',
        email: 'fazli@hairtpclinic.com',
        label: 'Fazli',
        owner: 'Preset',
        custom: false,
        order: 0,
        toneClass: 'mailbox-option-fazli',
      },
    ],
    runtimeMailboxes: [
      {
        id: 'fazli',
        email: 'fazli@hairtpclinic.com',
        label: 'Fazli',
        owner: 'Live',
      },
    ],
    customMailboxes: [
      {
        id: 'fazli',
        email: 'fazli@hairtpclinic.com',
        label: 'Fazli',
        owner: 'Fazli',
        signature: {
          label: 'Fazli',
        },
      },
      {
        id: 'sandbox',
        email: 'sandbox@hairtpclinic.com',
        label: 'Sandbox',
        owner: 'Team',
        signature: {
          label: 'Sandbox',
        },
      },
    ],
    defaultSignaturePresets: [
      {
        id: 'fazli',
        email: 'fazli@hairtpclinic.com',
        label: 'Fazli',
      },
    ],
  });

  const mailboxes = getAvailableRuntimeMailboxes();
  const fazliMailbox = mailboxes.find((mailbox) => mailbox.id === 'fazli');
  const sandboxMailbox = mailboxes.find((mailbox) => mailbox.id === 'sandbox');

  assert.ok(fazliMailbox, 'Förväntade att Fazli-mailboxen finns i den sammanslagna listan.');
  assert.equal(fazliMailbox.custom, false);
  assert.equal(fazliMailbox.statusLabel, 'Aktiv');
  assert.equal(fazliMailbox.surfaceKind, 'live_mailbox_with_local_signature');
  assert.equal(fazliMailbox.hasLiveSource, true);
  assert.equal(fazliMailbox.hasLocalSignatureDefinition, true);
  assert.equal(fazliMailbox.localSignatureLabel, 'Fazli');
  assert.equal(fazliMailbox.adminEditable, true);
  assert.equal(fazliMailbox.adminRemovable, false);
  assert.equal(fazliMailbox.ownerCopy, 'Källa: Live');
  assert.equal(fazliMailbox.signatureCopy, 'Lokal signatur: Fazli');

  assert.ok(sandboxMailbox, 'Förväntade att den rena custom-mailboxen finns kvar separat.');
  assert.equal(sandboxMailbox.custom, true);
  assert.equal(sandboxMailbox.statusLabel, 'Eget');
  assert.equal(sandboxMailbox.surfaceKind, 'custom_mailbox');
  assert.equal(sandboxMailbox.hasLiveSource, false);
  assert.equal(sandboxMailbox.adminEditable, true);
  assert.equal(sandboxMailbox.adminRemovable, true);
  assert.equal(sandboxMailbox.signatureCopy, 'Signatur: Sandbox');
});

test('buildRuntimeMailboxLoadDiagnostics sammanfattar mailboxscope, raw rows och live-trådar konsekvent', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const summarizeMailboxCountsSource = extractFunctionSource(
    source,
    'summarizeMailboxCountsForDiagnostics'
  );
  const summarizeRuntimeThreadSource = extractFunctionSource(
    source,
    'summarizeRuntimeThreadForDiagnostics'
  );
  const buildDiagnosticsSource = extractFunctionSource(
    source,
    'buildRuntimeMailboxLoadDiagnostics'
  );

  const buildRuntimeMailboxLoadDiagnostics = new Function(
    'asArray',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'compactRuntimeCopy',
    'getThreadPrimaryLaneId',
    'normalizeKey',
    'runtimeConversationIdsMatch',
    'titleCaseMailbox',
    'workspaceSourceOfTruth',
    `${summarizeMailboxCountsSource}
     ${summarizeRuntimeThreadSource}
     ${buildDiagnosticsSource}
     return buildRuntimeMailboxLoadDiagnostics;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase(),
    (value, fallback = '', max = 120) => {
      const text = String(value || fallback || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) return '';
      return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
    },
    (thread = {}) => String(thread?.primaryLaneId || 'all'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase(),
    (left, right) =>
      String(left || '')
        .trim()
        .toLowerCase() ===
      String(right || '')
        .trim()
        .toLowerCase(),
    (value = '') => {
      const normalized = String(value || '')
        .trim()
        .toLowerCase();
      const local = normalized.split('@')[0] || normalized;
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    },
    {
      getSelectedThreadId() {
        return 'thread-egzona';
      },
    }
  );

  const diagnostics = buildRuntimeMailboxLoadDiagnostics({
    phase: 'live',
    requestedMailboxIds: ['Egzona@hairtpclinic.com', 'kons@hairtpclinic.com'],
    liveData: {
      conversationWorklist: [
        { mailboxAddress: 'egzona@hairtpclinic.com', subject: 'Legacy egzona row' },
        { mailboxAddress: 'kons@hairtpclinic.com', subject: 'Legacy kons row' },
      ],
      needsReplyToday: [{ mailboxAddress: 'egzona@hairtpclinic.com', subject: 'Reply egzona row' }],
    },
    mergedWorklistData: {
      conversationWorklist: [
        {
          mailboxAddress: 'egzona@hairtpclinic.com',
          subject: 'Truth egzona row',
          worklistSource: 'truth_primary',
        },
        { mailboxAddress: 'kons@hairtpclinic.com', subject: 'Legacy kons row' },
      ],
      needsReplyToday: [],
    },
    threads: [
      {
        id: 'thread-egzona',
        mailboxAddress: 'egzona@hairtpclinic.com',
        mailboxLabel: 'Egzona',
        customerName: 'Circle K EXTRA',
        displaySubject: 'Truth egzona row',
        preview: 'Unread inbound and needs reply',
        ownerLabel: 'Egzona',
        primaryLaneId: 'act-now',
        worklistSource: 'truth_primary',
      },
      {
        id: 'thread-kons',
        mailboxAddress: 'kons@hairtpclinic.com',
        mailboxLabel: 'Kons',
        customerName: 'Okänd kund',
        displaySubject: 'Legacy kons row',
        preview: 'Ingen förhandsvisning tillgänglig',
        ownerLabel: 'Ej tilldelad',
        primaryLaneId: 'all',
        worklistSource: 'legacy',
      },
    ],
    legacyThreads: [
      {
        id: 'legacy-egzona',
        mailboxAddress: 'egzona@hairtpclinic.com',
        mailboxLabel: 'Egzona',
        customerName: 'Circle K EXTRA',
        displaySubject: 'Legacy egzona row',
        preview: 'Legacy preview',
        ownerLabel: 'Egzona',
        primaryLaneId: 'act-now',
        worklistSource: 'legacy',
      },
    ],
    historyPayload: {
      messages: [{ mailboxId: 'kons@hairtpclinic.com' }, { mailboxId: 'kons@hairtpclinic.com' }],
    },
    truthPrimaryPayload: {
      rows: [{ id: 'truth-egzona-row' }],
    },
    configuredTruthPrimaryMailboxIds: ['egzona@hairtpclinic.com'],
    activeTruthPrimaryMailboxIds: ['egzona@hairtpclinic.com'],
  });

  assert.equal(diagnostics.phase, 'live');
  assert.deepEqual(diagnostics.requestedMailboxIds, [
    'egzona@hairtpclinic.com',
    'kons@hairtpclinic.com',
  ]);
  assert.equal(diagnostics.rawWorklist.totalRows, 3);
  assert.equal(diagnostics.mergedWorklist.totalRows, 2);
  assert.equal(diagnostics.liveThreads.count, 2);
  assert.equal(diagnostics.legacyThreads.count, 1);
  assert.equal(diagnostics.historyMessages.count, 2);
  assert.equal(diagnostics.truthPrimary.rowCount, 1);
  assert.equal(diagnostics.liveThreads.samples[0].selected, true);
  assert.equal(diagnostics.liveThreads.samples[0].primaryLaneId, 'act-now');
  assert.deepEqual(
    diagnostics.liveThreads.mailboxCounts.map((entry) => [
      entry.mailboxId,
      entry.count,
      entry.truthPrimaryCount,
    ]),
    [
      ['egzona@hairtpclinic.com', 1, 1],
      ['kons@hairtpclinic.com', 1, 0],
    ]
  );
});
