const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-queue-renderers.js'
);
const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);
const LIVE_COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);
const ASYNC_ORCHESTRATION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-async-orchestration.js'
);
const THREAD_OPS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-thread-ops.js'
);
const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'index.html'
);
const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Kunde inte hitta ${functionName} i runtime-queue-renderers.js.`);

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

  throw new Error(`Kunde inte extrahera ${functionName} från runtime-queue-renderers.js.`);
}

function extractCssBlock(source, selector) {
  const startIndex = source.indexOf(selector);
  assert.notEqual(startIndex, -1, `Kunde inte hitta CSS-regeln för ${selector}.`);

  const bodyStart = source.indexOf('{', startIndex);
  assert.notEqual(bodyStart, -1, `Kunde inte hitta CSS-kroppen för ${selector}.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  throw new Error(`Kunde inte extrahera CSS-regeln för ${selector}.`);
}

const APP_SOURCE = fs.readFileSync(APP_PATH, 'utf8');
const BUILD_CLIENT_MAIL_THREAD_MESSAGE_FROM_ENTRY_SOURCE = extractFunctionSource(
  APP_SOURCE,
  'buildClientMailThreadMessageFromEntry'
);

global.buildClientMailThreadMessageFromEntry = new Function(
  'asArray',
  'asNumber',
  'asText',
  'normalizeKey',
  `${BUILD_CLIENT_MAIL_THREAD_MESSAGE_FROM_ENTRY_SOURCE}; return buildClientMailThreadMessageFromEntry;`
)(
  (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
  (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  },
  (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
);

function createRenderRuntimeQueueHarness({
  filteredThreads = [],
  queueScopedThreads = filteredThreads,
  mailboxScopedThreads = filteredThreads,
  selectedThreadId = '',
} = {}) {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'renderRuntimeQueue');
  const queueContent = { innerHTML: '' };
  const queueHistoryList = null;

  const renderRuntimeQueue = new Function(
    'buildAvatarDataUri',
    'buildThreadCardMarkup',
    'decorateStaticPills',
    'getFilteredRuntimeThreads',
    'getMailboxScopedRuntimeThreads',
    'getQueueScopedRuntimeThreads',
    'normalizeKey',
    'QUEUE_LANE_LABELS',
    'queueContent',
    'queueHistoryList',
    'renderRuntimeMailboxMenu',
    'renderRuntimeOwnerMenu',
    'renderRuntimeQueueCounts',
    'renderSelectedThreadInlineControls',
    'state',
    `${functionSource}; return renderRuntimeQueue;`
  )(
    () => '',
    (thread, index, selected) =>
      `<article data-thread-id="${thread.id}" data-index="${index}"${selected ? ' data-selected="true"' : ''}></article>`,
    () => {},
    () => filteredThreads,
    () => mailboxScopedThreads,
    () => queueScopedThreads,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    { all: 'Alla' },
    queueContent,
    queueHistoryList,
    () => {},
    () => {},
    () => {},
    () => {},
    {
      runtime: {
        loading: false,
        error: '',
        authRequired: false,
        selectedOwnerKey: 'all',
        activeLaneId: 'all',
        selectedThreadId,
      },
    }
  );

  return {
    queueContent,
    renderRuntimeQueue,
  };
}

function createBuildThreadCardMarkupHarness() {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const smartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const functionSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  return new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'getQueueInlineLaneSignalNext',
    'getQueueInlineLaneSignalWhat',
    'getQueueInlineLaneSignalWhy',
    'normalizeKey',
    `${smartSummarySource}\n${functionSource}; return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (iconKey) => `<span data-icon="${String(iconKey || '')}"></span>`,
    (value) => String(value || ''),
    (thread = {}, laneId = '') => {
      const normalizedLaneId = String(laneId || '').trim().toLowerCase();
      if (normalizedLaneId === 'act_now') return 'Svara nu';
      return thread.nextActionLabel || thread.nextActionSummary || 'Granska tråden';
    },
    (thread = {}, laneId = '') => {
      const normalizedLaneId = String(laneId || '').trim().toLowerCase();
      if (normalizedLaneId === 'act_now') return 'Svar krävs nu';
      if (thread.highRisk === true) return 'Hög risk';
      return thread.whyInFocus || 'Behöver uppmärksamhet';
    },
    (thread = {}, laneId = '') => {
      const normalizedLaneId = String(laneId || '').trim().toLowerCase();
      if (normalizedLaneId === 'act_now') return 'Svara nu';
      return thread.nextActionSummary || 'Granska tråden';
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );
}

test('renderRuntimeQueue renderar alla filtrerade tradar utan hard cap', () => {
  const filteredThreads = Array.from({ length: 12 }, (_, index) => ({
    id: `thread-${index + 1}`,
  }));
  const harness = createRenderRuntimeQueueHarness({
    filteredThreads,
    selectedThreadId: 'thread-9',
  });

  harness.renderRuntimeQueue();

  const renderedCount =
    harness.queueContent.innerHTML.match(/data-thread-id="/g)?.length || 0;

  assert.equal(renderedCount, filteredThreads.length);
  assert.match(harness.queueContent.innerHTML, /data-thread-id="thread-12"/);
  assert.match(harness.queueContent.innerHTML, /data-thread-id="thread-9" data-index="8" data-selected="true"/);
});

test('buildThreadCardMarkup använder ett enhetligt livekort utan indexvarianter', () => {
  const renderersSource = fs.readFileSync(RENDERERS_PATH, 'utf8');

  assert.match(
    renderersSource,
    /const crossMailboxClass = crossMailboxEvidenceMode \? " thread-card-cross-mailbox" : ""[\s\S]*class="thread-card thread-card-live\$\{crossMailboxClass\}\$\{selectedClass\}\$\{priorityClass\}"/,
    'Livekortet ska använda ett enhetligt live-shell utan mailboxbundna variantklasser eller en separat audit-komponentfamilj.'
  );

  assert.doesNotMatch(
    renderersSource,
    /thread-card--\$\{variant\}|const variant = index === 0 \? "anna" : index === 1 \? "erik" : "maria"/,
    'Renderern ska inte längre bära gamla anna\/erik\/maria-varianter som kan skapa ojämn geometri mellan mailboxar.'
  );
});

test('buildThreadCardMarkup ger cross-mailbox-kort kompakt klass men behåller live-innehåll', () => {
  const buildThreadCardMarkup = createBuildThreadCardMarkupHarness();

  const html = buildThreadCardMarkup(
    {
      id: 'thread-cross-mailbox',
      customerName: 'Morten Bak Kristoffersen',
      displaySubject: 'Morten Bak Kristoffersen kontaktformulär om konsultation',
      subject: 'Morten Bak Kristoffersen kontaktformulär om konsultation',
      lastActivityLabel: '16:07',
      lastActivityAt: '2026-04-01T16:07:25.000Z',
      displayOwnerLabel: 'Ej tilldelad',
      mailboxLabel: 'Kons',
      mailboxProvenanceLabel: '3 mailboxar',
      mailboxProvenanceDetail: 'Fazli · Contact · Egzona',
      primaryLaneId: 'review',
      crossMailboxProvenanceEvidence: true,
      unread: true,
      avatar: 'avatar.svg',
      tags: ['review'],
      worklistSource: 'legacy',
      rowFamily: 'human_mail',
      preview: 'Vill boka konsultation och undrar över nästa steg.',
      intentLabel: 'Kontaktformulär',
      statusLabel: 'Behöver granskning',
      nextActionSummary: 'Granska tråden och återkom med nästa steg.',
      nextActionLabel: 'Granska tråden',
    },
    0,
    true
  );

  assert.match(
    html,
    /thread-card-cross-mailbox/,
    'Cross-mailbox-evidence ska rendera med en separat kompakt kortklass sa att den kan fa eget layoutkontrakt.'
  );

  assert.doesNotMatch(
    html,
    /Samma kund har skrivit från flera mailboxar|Historiken hålls ihop, men varje meddelande visar sin mailboxproveniens.|Fortsätt från samma/,
    'Cross-mailbox-kortet ska använda kompakt design men fortsatt bygga innehåll från live-trådens egna data, inte probe-copy.'
  );

  assert.doesNotMatch(
    html,
    /thread-card-act-now/,
    'Cross-mailbox-kort ska inte automatiskt tvångsmarkeras som act-now bara för att raden är merged över flera mailboxar.'
  );

  assert.doesNotMatch(
    html,
    /thread-unread-indicator/,
    'Evidence-kortet ska inte behalla unread-dotten eftersom referenskortet bygger pa kompakt merged provenance-layout.'
  );

  assert.match(
    html,
    /thread-subject-context">kontaktformulär om konsultation</,
    'Cross-mailbox-kortet ska visa den faktiska sekundära ämneskontexten från live-tråden.'
  );

  assert.match(
    html,
    /Vill boka konsultation och undrar över nästa steg\./,
    'Cross-mailbox-kortet ska visa preview från den faktiska live-tråden.'
  );

  assert.match(
    html,
    /Mailboxspår<\/span>\s*<p class="intel-card-provenance-detail">Fazli · Contact · Egzona<\/p>/,
    'Cross-mailbox-kortet ska inte duplicera mailboxantalet i proveniensraden när kortet redan signalerar att flera mailboxar är ihopslagna.'
  );
});

test('buildQueueMailboxDisplayLabels låter personnamn vinna över mailboxlabel i Alla', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const helperSource = extractFunctionSource(source, 'buildQueueMailboxDisplayLabels');
  const buildQueueMailboxDisplayLabels = new Function(
    `${helperSource}
     return buildQueueMailboxDisplayLabels;`
  )();

  const sami = buildQueueMailboxDisplayLabels(
    {
      counterpartyLabel: 'Hairtpclinic Se',
      title: 'Sami Bonyadi Kontaktformulär',
      subject: 'Sami Bonyadi Kontaktformulär',
      summary:
        'Från: Sami Bonyadi E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Jag tappar mycket hår pga mina dåliga gener.',
      mailboxLabel: 'Kons',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    {
      asText: (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      compactRuntimeCopy: (value, fallback = '', max = 108) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      normalizeKey: (value = '') =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
    }
  );

  assert.equal(sami.primaryLabel, 'Sami Bonyadi');
  assert.match(sami.secondaryLabel, /Hairtpclinic Se/);
  assert.match(sami.secondaryLabel, /Kontaktformulär/);

  const fazli = buildQueueMailboxDisplayLabels(
    {
      counterpartyLabel: 'Hairtpclinic Com',
      title: 'CCO live refresh proof [telefon]T[telefon]Z',
      subject: 'CCO live refresh proof [telefon]T[telefon]Z',
      summary:
        'Hej, Detta är ett verkligt live-refresh-test för CCO. Bästa hälsningar, Fazli Krasniqi Hårspecialist | Hårtransplantationer & PRP-injektioner.',
      mailboxLabel: 'Kons',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    {
      asText: (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      compactRuntimeCopy: (value, fallback = '', max = 108) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      normalizeKey: (value = '') =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
    }
  );

  assert.equal(fazli.primaryLabel, 'Fazli Krasniqi');
  assert.match(fazli.secondaryLabel, /Hairtpclinic Com/);
  assert.match(fazli.secondaryLabel, /Live refresh/);

  const fallback = buildQueueMailboxDisplayLabels(
    {
      title: 'Meddelande',
      subject: 'Meddelande',
      summary: '',
      mailboxLabel: 'Kons',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    {
      asText: (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      compactRuntimeCopy: (value, fallback = '', max = 108) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      normalizeKey: (value = '') =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
    }
  );

  assert.equal(fallback.primaryLabel, 'Kons');
  assert.equal(fallback.secondaryLabel, '');
});

test('Alla-kortet renderar primary och secondary label i rätt ordning', () => {
  const buildThreadCardMarkup = createBuildThreadCardMarkupHarness();
  const html = buildThreadCardMarkup(
    {
      id: 'mailbox-card',
      customerName: 'Sami Bonyadi',
      displaySubject: 'Hairtpclinic Se · Kontaktformulär',
      subject: 'Hairtpclinic Se · Kontaktformulär',
      lastActivityLabel: 'Idag 14:48',
      lastActivityAt: '2026-04-14T14:48:05.000Z',
      displayOwnerLabel: 'Ej tilldelad',
      mailboxLabel: 'Kons',
      mailboxProvenanceLabel: '',
      mailboxProvenanceDetail: '',
      primaryLaneId: 'all',
      crossMailboxProvenanceEvidence: false,
      unread: false,
      avatar: 'avatar.svg',
      tags: ['all'],
      worklistSource: 'truth',
      rowFamily: 'human_mail',
      preview: 'Från: Sami Bonyadi E-post: [email] Telefon: [telefon]',
      nextActionSummary: 'Öppna tråden',
    },
    0,
    false
  );

  assert.match(
    html,
    /thread-subject-primary">Sami Bonyadi<\/span>\s*<span class="thread-subject-context">Hairtpclinic Se · Kontaktformulär<\/span>/,
    'Alla-kortet ska visa personnamn först och organisation\/kontext på rad två.'
  );
});

test('loading-fallbacken i vansterkon stanger av gamla bakgrundsrader', () => {
  const renderersSource = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    renderersSource,
    /setQueueHistoryMeta\("Laddar live-trådar…",\s*\{\s*showHead:\s*false\s*\}\)/,
    'Live-loadingfallbacken ska gora history-head dold sa den inte lagger sig bakom tomrutan.'
  );

  assert.match(
    renderersSource,
    /syncQueueHistoryActionButton\(completeActionButton,\s*\{\s*visible:\s*false,\s*disabled:\s*true\s*\}\);[\s\S]*syncQueueHistoryActionButton\(deleteActionButton,\s*\{[\s\S]*visible:\s*false,[\s\S]*disabled:\s*true,[\s\S]*action:\s*"delete"/,
    'Live-loadingfallbacken ska nolla check- och delete-actions i queue-history-head.'
  );

  assert.match(
    renderersSource,
    /state\.runtime\.loading \|\|[\s\S]*state\.runtime\.live \|\|[\s\S]*state\.runtime\.authRequired[\s\S]*runtimeMode === "offline_history"[\s\S]*!\s*runtimeThread/,
    'Tradkontext-raden ska dodoljas i loadingfallbacken sa Kons\/Oklart\/Ingen deadline inte bubblar tillbaka.'
  );

  assert.match(
    appSource,
    /const shouldHideShortcutRows =[\s\S]*state\.runtime\.loading === true[\s\S]*state\.runtime\.authRequired === true[\s\S]*Boolean\(asText\(state\.runtime\.error\)\)/,
    'Actionraden under sekundarsignalerna ska kunna dodoljas i fallbacklagen.'
  );

  assert.match(
    appSource,
    /row\.hidden = shouldHideShortcutRows;[\s\S]*if \(shouldHideShortcutRows\) \{[\s\S]*strip\.innerHTML = "";/,
    'Fallbacklagen ska rensa actionraden helt i stallet for att lamna Alla\/check\/radera bakom bakgrunden.'
  );

  assert.match(
    renderersSource,
    /buildUnifiedQueueLoadingItems\(\)[\s\S]*renderQueueInlineLaneList\(buildUnifiedQueueLoadingItems\(\)\)/,
    'Live-loading i den synliga vänsterlistan ska återanvända samma livekortssystem i stället för en blockerande tomruta eller historikrad.'
  );
});

test('queue inline livekort bygger syntetisk ämnesrad när mailboxdata är tunn', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'buildQueueInlineLaneSignalItems',
    'getQueueHistoryItemInitials',
    'isSentRuntimeThread',
    'normalizeKey',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    () => [],
    (label) => String(label || '').slice(0, 2).toUpperCase() || '?',
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'okänd avsändare',
    mailboxLabel: 'Kons',
    displaySubject: 'Ingen förhandsvisning tillgänglig',
    preview: '',
    systemPreview: '',
    whyInFocus: '',
    nextActionSummary: '',
    primaryLaneId: 'all',
  });

  assert.equal(item.title, 'Nytt inkommande mejl i Kons');
  assert.equal(item.detail, 'Ingen förhandsvisning tillgänglig.');
});

test('queue inline livekort prioriterar operativ nästa steg-text för act-now-rader', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'buildQueueInlineLaneSignalItems',
    'getQueueHistoryItemInitials',
    'isSentRuntimeThread',
    'normalizeKey',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    () => [],
    (label) => String(label || '').slice(0, 2).toUpperCase() || '?',
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'Sivan Bergenstein',
    mailboxLabel: 'Kons',
    displaySubject: 'Kontaktformulär om pris och konsultation',
    preview: 'Hej, jag vill förstå prisbilden och vad nästa steg är för en konsultation.',
    whyInFocus: 'Kunden väntar på ett tydligt nästa steg.',
    nextActionSummary: 'Öppna tråden och ge ett konkret nästa steg.',
    statusLabel: 'Svar krävs',
    nextActionLabel: 'Svara nu',
    primaryLaneId: 'act-now',
    tags: ['all', 'act-now'],
    unread: true,
  });

  assert.equal(item.detail, 'Öppna tråden och ge ett konkret nästa steg.');
  assert.notEqual(item.detail, item.title);
});

test('buildThreadCardMarkup visar kort AI-sammanfattning i nästa-chipet nar nextActionSummary ar generisk', () => {
  const buildThreadCardMarkup = createBuildThreadCardMarkupHarness();

  const html = buildThreadCardMarkup(
    {
      id: 'thread-act-now-1',
      customerName: 'Sivan Bergenstein',
      displaySubject: 'Kontaktformulär om pris och konsultation',
      subject: 'Kontaktformulär om pris och konsultation',
      preview: 'Hej, jag vill förstå prisbilden och vad nästa steg är för en konsultation.',
      nextActionSummary: 'Öppna tråden och ge ett konkret nästa steg.',
      whyInFocus: 'Kunden väntar på ett tydligt nästa steg.',
      nextActionLabel: 'Svara nu',
      primaryLaneId: 'act-now',
      tags: ['all', 'act-now', 'high-risk'],
      mailboxLabel: 'Kons',
      lastActivityLabel: 'Nu',
      lastActivityAt: '2026-04-11T10:00:00.000Z',
      avatar: 'avatar.png',
      displayOwnerLabel: 'Ej tilldelad',
      ownerLabel: 'Ej tilldelad',
    },
    0,
    false
  );

  assert.match(
    html,
    /thread-intelligence-item-value">Klargör pris<\/span>/,
    'Nästa-chippet ska visa en kort operativ sammanfattning i stället för den generiska etiketten.'
  );
  assert.doesNotMatch(
    html,
    /thread-intelligence-item--next"[\s\S]*thread-intelligence-item-value">Svara nu<\/span>/,
    'Nästa-chippet ska inte bära kvar Svara nu när en mer specifik etikett kan visas.'
  );
});

test('buildThreadCardMarkup kondenserar konkret nextActionSummary till 1-3 ord i nästa-chipet', () => {
  const buildThreadCardMarkup = createBuildThreadCardMarkupHarness();

  const html = buildThreadCardMarkup(
    {
      id: 'thread-act-now-2',
      customerName: 'Sivan Bergenstein',
      displaySubject: 'Bilagor inför bedömning',
      subject: 'Bilagor inför bedömning',
      preview: 'Hej, jag undrar hur ni vill att jag skickar bilderna inför bedömning.',
      nextActionSummary: 'Be om bilder före bedömning.',
      whyInFocus: 'Kunden väntar på tydliga instruktioner.',
      nextActionLabel: 'Svara nu',
      primaryLaneId: 'act-now',
      tags: ['all', 'act-now', 'high-risk'],
      mailboxLabel: 'Kons',
      lastActivityLabel: 'Nu',
      lastActivityAt: '2026-04-11T10:00:00.000Z',
      avatar: 'avatar.png',
      displayOwnerLabel: 'Ej tilldelad',
      ownerLabel: 'Ej tilldelad',
    },
    0,
    false
  );

  assert.match(
    html,
    /thread-intelligence-item-value">Be om bilder<\/span>/,
    'När threaden redan har en konkret åtgärd ska Nästa-chippet kondensera den till en kort operativ etikett.'
  );
});

test('mailboxbyte nollar vald tråd innan ny livekö laddas', () => {
  const liveCompositionSource = fs.readFileSync(LIVE_COMPOSITION_PATH, 'utf8');

  assert.match(
    liveCompositionSource,
    /mailboxMenuGrid\.addEventListener\("change"[\s\S]*workspaceSourceOfTruth\.setSelectedThreadId\(""\);[\s\S]*state\.runtime\.historyContextThreadId = "";/,
    'Mailboxbyte ska rensa vald tråd och historikkontext innan den nya livekön laddas.'
  );
  assert.match(
    liveCompositionSource,
    /state\.runtime\.mailboxScopePinned\s*=\s*nextSelectedMailboxIds\.length\s*>\s*0;/,
    'Mailboxbyte ska pinna ett manuellt valt mailboxscope så att selected mailbox inte skrivs över av thread-reconciliation.'
  );

  assert.match(
    liveCompositionSource,
    /loadLiveRuntime\(\{[\s\S]*requestedMailboxIds:\s*nextSelectedMailboxIds,[\s\S]*preferredThreadId:\s*"",[\s\S]*resetHistoryOnChange:\s*true/,
    'Mailboxbyte ska inte försöka bära över föregående trådval in i nytt mailboxscope.'
  );

  assert.match(
    liveCompositionSource,
    /state\.runtime\.queueHistory = \{[\s\S]*open:\s*false,[\s\S]*loaded:\s*false,[\s\S]*items:\s*\[\],[\s\S]*selectedConversationId:\s*""[\s\S]*scopeKey:\s*""[\s\S]*\};/,
    'Mailboxbyte ska stänga historikläget helt, så nästa mailbox öppnas i samma vanliga livekö och inte fastnar i kompakt historikvy.'
  );
});

test('vansterkons mailkort har tajtare spacing, skarpare horn och innehallsstyrda bottenpills', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.queue-bubble-row-actions,\s*\.focus-action-row,\s*\.focus-intel-action-row\s*\{[\s\S]*margin-top:\s*1px;[\s\S]*\}/,
    'Alla-raden ska ligga tajtare under sekundarsignalerna.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-shell\s*\{[\s\S]*margin-top:\s*0;[\s\S]*gap:\s*4px;[\s\S]*\}/,
    'Historikskalet ska ligga tajtare mot Alla-raden.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-panel\.is-open\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*align-self:\s*stretch;[\s\S]*\}/,
    'Den öppna queue-history-panel ska vara en kolumnflexyta så att listan får faktisk höjd och inte kollapsar till 0px.'
  );

  assert.match(
    stylesSource,
    /\.queue-topzone\s*\{[\s\S]*display:\s*flex;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*border-bottom:\s*1px solid rgba\(162,\s*146,\s*134,\s*0\.18\);[\s\S]*\}/,
    'Toppsektionen ska ligga fast som ett statiskt block utan egen ljus wash eller sticky-scroll.'
  );

  assert.match(
    stylesSource,
    /\.queue-action-shortcut-strip\s+\.queue-history-head-action\s+svg\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;[\s\S]*\}/,
    'Checkmark- och papperskorgsymbolen ska vara lite storre.'
  );

  assert.match(
    stylesSource,
    /\.thread-card\s*\{[\s\S]*border-radius:\s*var\(--mail-card-radius\);[\s\S]*min-height:\s*118px;[\s\S]*\}/,
    'Mailkorten ska behålla sin stabila livehöjd men bära ytterformen via samma delade radie i ett bladliknande worklist-shell.'
  );

  assert.match(
    stylesSource,
    /\.thread-card-selected\s*\{[\s\S]*min-height:\s*136px;[\s\S]*padding:\s*16px 16px 16px;[\s\S]*\}/,
    'Den valda mailraden ska vara lite rymligare men fortfarande följa samma worklistfamilj som övriga rader.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-list\[data-queue-list-mode="live"\]\s*\{[\s\S]*gap:\s*14px;[\s\S]*padding:\s*0;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*overflow-y:\s*auto;[\s\S]*\}/,
    'Den levande mejllistan ska vara den enda scrollpanelen i vänsterspalten, medan toppsektionen ligger still.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-list\[data-queue-list-mode="live"\]\s*>\s*\.thread-card\s*\{[\s\S]*border:\s*1px solid rgba\(223,\s*212,\s*204,\s*0\.62\);[\s\S]*border-radius:\s*12px;[\s\S]*background:[\s\S]*rgba\(252,\s*248,\s*244,\s*0\.92\)[\s\S]*rgba\(248,\s*241,\s*236,\s*0\.54\)[\s\S]*box-shadow:[\s\S]*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.88\)[\s\S]*inset 0 -1px 0 rgba\(228,\s*216,\s*206,\s*0\.2\);[\s\S]*\}/,
    'Varje mejlrad i live-listan ska nu få en lätt glossy row-surface så att varje mailruta läses som en egen rad utan att bli ett tungt bubbelskal.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-list\[data-queue-list-mode="live"\]\s*>\s*\.thread-card::before\s*\{[\s\S]*height:\s*0;[\s\S]*opacity:\s*0;[\s\S]*background:\s*none;[\s\S]*\}/,
    'Varje live-rad ska inte längre bära en egen glossy toppkropp; djupet ska i stället ligga i den gemensamma listpanelen.'
  );

  assert.match(
    stylesSource,
    /\.thread-story-inline\s*\{[\s\S]*margin-top:\s*4px;[\s\S]*\}[\s\S]*\.thread-support-stack\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*6px;[\s\S]*padding:\s*8px 10px 8px 0;[\s\S]*background:[\s\S]*rgba\(255,\s*252,\s*249,\s*0\.78\)[\s\S]*rgba\(250,\s*244,\s*239,\s*0\.34\)[\s\S]*border-bottom:\s*1px solid rgba\(221,\s*210,\s*202,\s*0\.42\);[\s\S]*\}/,
    'Mailkortens läsordning ska vara header, preview direkt under rubriken och därefter en separat, lägre signalzon.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-avatar\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.9\)[\s\S]*rgba\(244,\s*238,\s*232,\s*0\.88\)[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.82\);[\s\S]*\}/,
    'Initialrutan ska anvanda samma neutrala gradientbakgrund som de andra bubblorna.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-item-meta--fullwidth\s*>\s*\.queue-history-pill,\s*[\s\S]*\.queue-history-operational-pill\.queue-filter-chip\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*width:\s*auto;[\s\S]*max-width:\s*max-content;[\s\S]*\}/,
    'Kons och Granska tråden ska anpassa sig till innehållet i stället for att stretchas.'
  );
});

test('mejlrutans sju pilltyper har fasta semantiska farger', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.queue-history-pill--source\s*\{[\s\S]*color:\s*var\(--accent-violet\);[\s\S]*\}/,
    'Source-pill ska ha en fast violett identitet.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-pill--mailbox\s*\{[\s\S]*color:\s*var\(--accent-rose\);[\s\S]*\}/,
    'Mailbox-pill ska ha en fast ros identitet.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-pill--direction\s*\{[\s\S]*color:\s*var\(--accent-cyan\);[\s\S]*\}/,
    'Direction-pill ska ha en fast cyan identitet.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-pill--queue\s*\{[\s\S]*color:\s*var\(--accent-amber\);[\s\S]*\}/,
    'Queue-pill ska ha en fast bärnstensidentitet.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-operational-pill--what\.queue-filter-chip\s*\{[\s\S]*color:\s*var\(--accent-indigo\);[\s\S]*\}/,
    'What-signalen ska ha en fast indigo identitet.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-operational-pill--why\.queue-filter-chip\s*\{[\s\S]*color:\s*var\(--accent-red\);[\s\S]*\}/,
    'Why-signalen ska ha en fast korallrod identitet.'
  );

  assert.match(
    stylesSource,
    /\.queue-history-operational-pill--next\.queue-filter-chip\s*\{[\s\S]*color:\s*var\(--accent-green\);[\s\S]*\}/,
    'Next-signalen ska ha en fast gron identitet.'
  );
});

test('renderRuntimeMailboxMenu markerar valt canonical mailboxscope och renderar canonical data-runtime-mailbox', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'renderRuntimeMailboxMenu');

  function createElement(tagName) {
    return {
      tagName,
      className: '',
      title: '',
      innerHTML: '',
      children: [],
      dataset: {},
      classList: {
        active: new Set(),
        add(name) {
          this.active.add(name);
        },
      },
      appendChild(child) {
        this.children.push(child);
      },
    };
  }

  const mailboxMenuGrid = {
    innerHTML: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
  };
  const mailboxTriggerLabel = { textContent: '' };
  const queueMailboxScopeLabel = { textContent: '' };
  const queueMailboxScopeCount = { textContent: '' };

  const renderRuntimeMailboxMenu = new Function(
    'asArray',
    'compactRuntimeCopy',
    'escapeHtml',
    'getAvailableRuntimeMailboxes',
    'getSelectedRuntimeMailboxScopeIds',
    'getRuntimeMailboxCapabilityMeta',
    'mailboxMenuGrid',
    'mailboxTriggerLabel',
    'normalizeMailboxId',
    'queueMailboxScopeCount',
    'queueMailboxScopeLabel',
    'state',
    'document',
    `${functionSource}; return renderRuntimeMailboxMenu;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value) => String(value || ''),
    (value) => String(value || ''),
    () => [
      {
        id: 'contact',
        canonicalId: 'contact@hairtpclinic.com',
        email: 'contact@hairtpclinic.com',
        label: 'Kontakt',
      },
      {
        id: 'consult',
        canonicalId: 'kons@hairtpclinic.com',
        email: 'kons@hairtpclinic.com',
        label: 'Kons',
      },
    ],
    () => ['kons@hairtpclinic.com'],
    () => 'Läs: live · Skicka: aktiv · Signatur: Kons',
    mailboxMenuGrid,
    mailboxTriggerLabel,
    (value) => {
      const text = String(value || '').trim().toLowerCase();
      if (!text) return '';
      if (text.includes('@')) return text;
      if (text === 'consult' || text === 'kons') return 'kons@hairtpclinic.com';
      return `${text}@hairtpclinic.com`;
    },
    queueMailboxScopeCount,
    queueMailboxScopeLabel,
    {
      runtime: {
        selectedMailboxIds: ['consult'],
      },
    },
    {
      createElement,
    }
  );

  renderRuntimeMailboxMenu();

  assert.equal(mailboxTriggerLabel.textContent, 'Hair TP Clinic - Kons');
  assert.equal(queueMailboxScopeLabel.textContent, 'Kons');
  assert.equal(queueMailboxScopeCount.textContent, '1');
  const konsOption = mailboxMenuGrid.children.find((child) =>
    child.innerHTML.includes('mailbox-option-name">Kons')
  );
  assert.ok(konsOption);
  assert.match(konsOption.innerHTML, /mailbox-option-status">Live/);
  assert.match(konsOption.innerHTML, /mailbox-option-email">kons@hairtpclinic\.com/);
  assert.match(
    konsOption.innerHTML,
    /mailbox-option-meta">Läs: live · Skicka: aktiv · Signatur: Kons/
  );
  assert.match(
    konsOption.innerHTML,
    /data-runtime-mailbox="kons@hairtpclinic\.com" checked/
  );
});

test('renderRuntimeMailboxMenu behaller Live-status for live-mailboxar med lokal signaturprofil', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'renderRuntimeMailboxMenu');

  function createElement(tagName) {
    return {
      tagName,
      className: '',
      title: '',
      innerHTML: '',
      children: [],
      dataset: {},
      classList: {
        active: new Set(),
        add(name) {
          this.active.add(name);
        },
      },
      appendChild(child) {
        this.children.push(child);
      },
    };
  }

  const mailboxMenuGrid = {
    innerHTML: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
  };
  const mailboxTriggerLabel = { textContent: '' };
  const queueMailboxScopeLabel = { textContent: '' };
  const queueMailboxScopeCount = { textContent: '' };

  const renderRuntimeMailboxMenu = new Function(
    'asArray',
    'compactRuntimeCopy',
    'escapeHtml',
    'getAvailableRuntimeMailboxes',
    'getSelectedRuntimeMailboxScopeIds',
    'getRuntimeMailboxCapabilityMeta',
    'mailboxMenuGrid',
    'mailboxTriggerLabel',
    'normalizeMailboxId',
    'queueMailboxScopeCount',
    'queueMailboxScopeLabel',
    'state',
    'document',
    `${functionSource}; return renderRuntimeMailboxMenu;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value) => String(value || ''),
    (value) => String(value || ''),
    () => [
      {
        id: 'fazli',
        canonicalId: 'fazli@hairtpclinic.com',
        email: 'fazli@hairtpclinic.com',
        label: 'Fazli',
        custom: false,
        statusLabel: 'Live',
        signatureCopy: 'Lokal signatur: Fazli',
      },
    ],
    () => ['fazli@hairtpclinic.com'],
    () => '',
    mailboxMenuGrid,
    mailboxTriggerLabel,
    (value) => {
      const text = String(value || '').trim().toLowerCase();
      if (!text) return '';
      return text.includes('@') ? text : `${text}@hairtpclinic.com`;
    },
    queueMailboxScopeCount,
    queueMailboxScopeLabel,
    {
      runtime: {
        selectedMailboxIds: ['fazli'],
      },
    },
    {
      createElement,
    }
  );

  renderRuntimeMailboxMenu();

  const fazliOption = mailboxMenuGrid.children.find((child) =>
    child.innerHTML.includes('mailbox-option-name">Fazli')
  );
  assert.ok(fazliOption);
  assert.match(fazliOption.innerHTML, /mailbox-option-status">Live/);
  assert.match(fazliOption.innerHTML, /mailbox-option-meta">Lokal signatur: Fazli/);
});

test('renderQueueHistoryList markerar vald offline-historikruta med selected state och canonical conversation id', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryMailboxMetaSource = extractFunctionSource(source, 'getQueueHistoryMailboxMeta');
  const getQueueHistorySignalIconSource = extractFunctionSource(source, 'getQueueHistorySignalIcon');
  const getQueueHistoryDirectionMetaSource = extractFunctionSource(source, 'getQueueHistoryDirectionMeta');
  const getQueueHistoryQueueMetaSource = extractFunctionSource(source, 'getQueueHistoryQueueMeta');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const queueHistoryList = { innerHTML: '' };
  const state = {
    runtime: {
      queueHistory: {
        selectedConversationId: 'conversation-2',
      },
    },
  };

  const renderQueueHistoryList = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getAvailableRuntimeMailboxes',
    'decorateStaticPills',
    'normalizeKey',
    'normalizeMailboxId',
    'queueHistoryList',
    'runtimeConversationIdsMatch',
    'state',
    `${getQueueHistoryMailboxMetaSource}
     ${getQueueHistorySignalIconSource}
     ${getQueueHistoryDirectionMetaSource}
     ${getQueueHistoryQueueMetaSource}
     ${buildQueueHistoryCardMarkupSource}
     ${renderQueueHistoryListSource}
     return renderQueueHistoryList;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || ''),
    (value) => String(value || ''),
    () => [],
    () => {},
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value) => String(value || '').trim().toLowerCase(),
    queueHistoryList,
    (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(),
    state
  );

  renderQueueHistoryList([
    {
      conversationId: 'conversation-1',
      counterpartyLabel: 'Adam',
      title: 'Ämne 1',
      detail: 'Detalj 1',
      mailboxLabel: 'Kons',
    },
    {
      conversationId: 'conversation-2',
      counterpartyLabel: 'Bea',
      title: 'Ämne 2',
      detail: 'Detalj 2',
      mailboxLabel: 'Kons',
    },
  ]);

  assert.match(queueHistoryList.innerHTML, /data-history-conversation="conversation-1"/);
  assert.match(queueHistoryList.innerHTML, /data-history-conversation="conversation-2"/);
  assert.match(queueHistoryList.innerHTML, /queue-history-item is-selected/);
  assert.match(queueHistoryList.innerHTML, /data-history-selected="true"/);
});

test('renderQueueInlineLaneList använder den befintliga thread-card-live-designen för live-rader', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'renderQueueInlineLaneList');

  assert.match(
    functionSource,
    /queueHistoryList\.dataset\.queueListMode = "live"/,
    'Den enhetliga vänsterkön ska markera sitt läge som live när riktiga runtime-trådar renderas.'
  );

  assert.match(
    functionSource,
    /const renderLiveThreadCard =[\s\S]*typeof buildThreadCardMarkup === "function"[\s\S]*renderLiveThreadCard\(thread,\s*index,\s*thread\.id === state\.runtime\.selectedThreadId\)/,
    'Live-rader i den enhetliga vänsterkön ska använda den redan befintliga thread-card-live-designen och ha en säker fallback när hjälpen saknas.'
  );

  assert.match(
    functionSource,
    /queueHistoryList\.innerHTML = asArray\(threads\)[\s\S]*renderLiveThreadCard\(thread,\s*index,\s*thread\.id === state\.runtime\.selectedThreadId\)/,
    'Live-listan ska renderas genom den befintliga thread-card-grenen och inte den äldre history-card-familjen.'
  );
});

test('queue inline lane cards render operational chips in the bottom meta row instead of a middle signal row', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const getQueueHistoryMailboxMetaSource = extractFunctionSource(source, 'getQueueHistoryMailboxMeta');
  const getQueueHistorySignalIconSource = extractFunctionSource(source, 'getQueueHistorySignalIcon');
  const getQueueHistoryDirectionMetaSource = extractFunctionSource(source, 'getQueueHistoryDirectionMeta');
  const getQueueHistoryQueueMetaSource = extractFunctionSource(source, 'getQueueHistoryQueueMeta');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');

  const buildMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getAvailableRuntimeMailboxes',
    'isSentRuntimeThread',
    'normalizeKey',
    'normalizeMailboxId',
    'runtimeConversationIdsMatch',
    `${getQueueHistoryItemInitialsSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${getQueueHistoryMailboxMetaSource}
     ${getQueueHistorySignalIconSource}
     ${getQueueHistoryDirectionMetaSource}
     ${getQueueHistoryQueueMetaSource}
     ${buildQueueInlineLaneSignalItemsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${buildQueueHistoryCardMarkupSource}
     return {
       buildQueueInlineLaneHistoryItem,
       buildQueueHistoryCardMarkup,
     };`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) => String(value || ''),
    () => [
      {
        canonicalId: 'kons@hairtpclinic.com',
        id: 'consult',
        email: 'kons@hairtpclinic.com',
        label: 'Kons',
        toneClass: 'mailbox-option-consult',
      },
    ],
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value) => String(value || '').trim().toLowerCase(),
    (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
  );

  const item = buildMarkup.buildQueueInlineLaneHistoryItem({
    customerName: 'Sivan Bergenstein',
    lastActivityLabel: '10:42',
    lastActivityAt: '2026-04-01T10:42:00.000Z',
    displaySubject: 'Kontaktformulär om pris och konsultation',
    preview: 'Hej, jag vill förstå prisbilden och vad nästa steg är för en konsultation.',
    mailboxLabel: 'Kons',
    mailboxProvenanceLabel: '2 mailboxar',
    mailboxProvenanceDetail: 'Egzona · Fazli',
    intentLabel: 'Prisfråga',
    statusLabel: 'Svar krävs',
    nextActionLabel: 'Svara nu',
    nextActionSummary: 'Ge prisbild och föreslå konsultation.',
    primaryLaneId: 'act-now',
    tags: ['all', 'act-now'],
    unread: true,
    worklistSource: 'truth_primary',
    worklistSourceLabel: 'Truth primary',
  });

  const markup = buildMarkup.buildQueueHistoryCardMarkup(item, {
    runtimeThreadId: 'thread-1',
    selectedConversationId: 'thread-1',
  });

  assert.match(markup, /queue-history-item-meta/);
  assert.match(markup, /queue-history-operational-pill--what/);
  assert.match(markup, /queue-history-operational-pill--why/);
  assert.match(markup, /queue-history-operational-pill--next/);
  assert.doesNotMatch(markup, /queue-history-chip-row/);
  assert.match(markup, /Prisfråga/);
  assert.match(markup, /Svar krävs nu/);
  assert.match(markup, /Svara nu/);
  assert.match(markup, /queue-history-pill--mailbox/);
  assert.match(markup, /queue-history-pill--provenance/);
  assert.match(markup, /queue-history-pill--source/);
  assert.match(markup, /2 mailboxar/);
  assert.match(markup, /queue-history-item-freshness/);
  assert.match(markup, /queue-history-item-freshness-dot/);
  assert.doesNotMatch(markup, />Ny</);
  assert.match(markup, /data-worklist-source="truth_primary"/);
  assert.match(markup, /data-worklist-source-label="Truth primary"/);
  assert.match(markup, /Truth primary/);
  assert.match(markup, /data-pill-icon="mail"/);
  assert.match(markup, /data-pill-icon="layers"/);
  assert.match(markup, /data-pill-icon="clock"/);
  assert.match(markup, /data-pill-icon="bolt"/);
  assert.match(markup, /queue-history-pill--source[\s\S]*queue-history-pill--mailbox[\s\S]*queue-history-operational-pill--what/);
  assert.doesNotMatch(markup, /queue-history-pill--direction/);
  assert.doesNotMatch(markup, /queue-history-pill--queue/);
});

test('queue inline lane cards suppress what chips when they would only repeat the subject text', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');

  const getQueueInlineLaneSignalWhat = new Function(
    'asText',
    'compactRuntimeCopy',
    'normalizeKey',
    `${getQueueInlineLaneSignalWhatSource}
     return getQueueInlineLaneSignalWhat;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (label) =>
      String(label || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.slice(0, 1).toUpperCase())
        .join('') || '?',
    new Function(
      'asText',
      'compactRuntimeCopy',
      'normalizeKey',
      `${getQueueInlineLaneSignalWhatSource}
       return getQueueInlineLaneSignalWhat;`
    )(
      (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      (value, fallback = '', max = 32) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
    ),
    new Function(
      'asArray',
      'asText',
      'compactRuntimeCopy',
      'normalizeKey',
      'isSentRuntimeThread',
      `${getQueueInlineLaneSignalWhySource}
       return getQueueInlineLaneSignalWhy;`
    )(
      (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
      (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      (value, fallback = '', max = 32) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
      () => false
    ),
    new Function(
      'asText',
      'compactRuntimeCopy',
      'normalizeKey',
      `${getQueueInlineLaneSignalNextSource}
       return getQueueInlineLaneSignalNext;`
    )(
      (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      (value, fallback = '', max = 32) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
    ),
    new Function(
      'asText',
      'compactRuntimeCopy',
      'getQueueInlineLaneSignalWhat',
      'getQueueInlineLaneSignalWhy',
      'getQueueInlineLaneSignalNext',
      'normalizeKey',
      `${buildQueueInlineLaneSignalItemsSource}
       return buildQueueInlineLaneSignalItems;`
    )(
      (value, fallback = '') => {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return fallback;
        return String(value);
      },
      (value, fallback = '', max = 32) => {
        const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
      },
      (thread, laneId) => {
        const normalizedLaneId = String(laneId || '').trim().toLowerCase();
        const intentLabel = String(thread?.intentLabel || '').trim();
        if (intentLabel && normalizedLaneId !== 'unclear') return intentLabel;
        if (normalizedLaneId === 'medical') return 'Medicinsk fråga';
        if (normalizedLaneId === 'bookable') return 'Bokning';
        if (normalizedLaneId === 'review') return 'Granskning';
        if (normalizedLaneId === 'admin') return 'Administrativt';
        return '';
      },
      (thread) => String(thread?.statusLabel || '').trim() || 'Behöver uppmärksamhet',
      (thread) => String(thread?.nextActionLabel || '').trim() || 'Granska tråden',
      (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
    ),
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );
  const getQueueInlineLaneSignalWhy = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'normalizeKey',
    'isSentRuntimeThread',
    `${getQueueInlineLaneSignalWhySource}
     return getQueueInlineLaneSignalWhy;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => false
  );
  const getQueueInlineLaneSignalNext = new Function(
    'asText',
    'compactRuntimeCopy',
    'normalizeKey',
    `${getQueueInlineLaneSignalNextSource}
     return getQueueInlineLaneSignalNext;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );
  const buildQueueInlineLaneSignalItems = new Function(
    'asText',
    'compactRuntimeCopy',
    'getQueueInlineLaneSignalWhat',
    'getQueueInlineLaneSignalWhy',
    'getQueueInlineLaneSignalNext',
    'normalizeKey',
    `${buildQueueInlineLaneSignalItemsSource}
     return buildQueueInlineLaneSignalItems;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    getQueueInlineLaneSignalWhat,
    getQueueInlineLaneSignalWhy,
    getQueueInlineLaneSignalNext,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );

  const signalItems = buildQueueInlineLaneSignalItems({
    displaySubject: 'CCO-next live send inspect',
    preview: 'Ingen förhandsvisning tillgänglig',
    statusLabel: 'Behöver åtgärd',
    nextActionLabel: 'Granska tråden',
    primaryLaneId: 'unclear',
    tags: ['all', 'unclear'],
  });

  const renderedRoles = (signalItems || []).map((item) => item.role);
  assert.deepEqual(renderedRoles, ['next']);
});

test('queue inline lane signal items map key lanes to operational why labels', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');

  const getQueueInlineLaneSignalWhat = new Function(
    'asText',
    'compactRuntimeCopy',
    'normalizeKey',
    `${getQueueInlineLaneSignalWhatSource}
     return getQueueInlineLaneSignalWhat;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );

  const getQueueInlineLaneSignalWhy = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'normalizeKey',
    `${getQueueInlineLaneSignalWhySource}
     return getQueueInlineLaneSignalWhy;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 32) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
  );

  assert.equal(getQueueInlineLaneSignalWhat({ intentLabel: 'Pricing Question' }, ''), 'Prisfråga');
  assert.equal(getQueueInlineLaneSignalWhat({ intentLabel: 'Contact Form' }, ''), 'Kontaktformulär');
  assert.equal(getQueueInlineLaneSignalWhy({}, 'act-now'), 'Svar krävs nu');
  assert.equal(getQueueInlineLaneSignalWhy({}, 'review'), 'Behöver granskning');
  assert.equal(getQueueInlineLaneSignalWhy({}, 'medical'), 'Medicinsk bedömning');
  assert.equal(getQueueInlineLaneSignalWhy({}, 'bookable'), 'Tid kan erbjudas');
  assert.equal(
    getQueueInlineLaneSignalWhy(
      { followUpAgeLabel: '48h inaktiv', statusLabel: 'Besvarad', nextActionLabel: 'Följ upp nu' },
      ''
    ),
    '48h inaktiv'
  );
  assert.equal(
    getQueueInlineLaneSignalWhy(
      { whyInFocus: 'Obesvarad konversation med operativ miss-risk.', statusLabel: 'Behöver svar' },
      ''
    ),
    'Svar krävs nu'
  );
});

test('mail feed cards prioriterar follow-up aging i stampen', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /followUpAgeLabel \|\| thread\.followUpLabel \|\| thread\.nextActionLabel/,
    'Förväntade att Senare-feedens stamp prioriterar follow-up aging-copy.'
  );
  assert.match(
    source,
    /followUpAgeLabel \|\| thread\.lastActivityLabel/,
    'Förväntade att skickade-feedens stamp prioriterar follow-up aging-copy.'
  );
});

test('queue inline lane cards avoid repeating sender name across sender row, issue row and preview', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'getQueueHistoryItemInitials',
    'normalizeKey',
    'isSentRuntimeThread',
    `${getQueueHistoryItemInitialsSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${buildQueueInlineLaneSignalItemsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    new Function(
      `${getQueueHistoryItemInitialsSource}
       return getQueueHistoryItemInitials;`
    )(),
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => false
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'Sivan Bergenstein',
    displaySubject: 'Sivan Bergenstein Kontaktformulär',
    preview: 'Från: Sivan Bergenstein E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig med konsultation och pris?',
    lastActivityLabel: '26 mars',
    primaryLaneId: 'unclear',
    mailboxLabel: 'Kons',
  });

  assert.equal(item.counterpartyLabel, 'Sivan Bergenstein');
  assert.equal(item.title, 'Vill ha hjälp med konsultation och pris?');
  assert.equal(item.detail, '');
});

test('queue inline lane cards suppress preview text when it only repeats the issue line', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'getQueueHistoryItemInitials',
    'normalizeKey',
    'isSentRuntimeThread',
    `${getQueueHistoryItemInitialsSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${buildQueueInlineLaneSignalItemsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    new Function(
      `${getQueueHistoryItemInitialsSource}
       return getQueueHistoryItemInitials;`
    )(),
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => false
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'Fazli | Hair TP Clinic',
    displaySubject: 'QA Reply Kons Send [telefon]',
    preview: 'QA Reply Kons Send [telefon]',
    lastActivityLabel: '1 apr.',
    primaryLaneId: 'review',
    mailboxLabel: 'Kons',
  });

  assert.equal(item.title, 'QA Reply Kons Send [telefon]');
  assert.equal(item.detail, '');
});

test('queue inline lane cards drop generic contact-form prompts before building the issue summary', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'getQueueHistoryItemInitials',
    'normalizeKey',
    'isSentRuntimeThread',
    `${getQueueHistoryItemInitialsSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${buildQueueInlineLaneSignalItemsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    new Function(
      `${getQueueHistoryItemInitialsSource}
       return getQueueHistoryItemInitials;`
    )(),
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => false
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'Sivan Bergenstein',
    displaySubject: 'Sivan Bergenstein Kontaktformulär',
    preview:
      'Från: Sivan Bergenstein E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej, Jag har en PRP-tid bokat nu under våren men kan inte hitta vilket datum.',
    lastActivityLabel: '26 mars',
    primaryLaneId: 'unclear',
    mailboxLabel: 'Kons',
  });

  assert.match(item.title, /^Jag har en PRP-tid bokat nu under våren/i);
});

test('queue inline lane cards keep operational focus out of the issue row when only a contact-form case label is known', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'getQueueHistoryItemInitials',
    'normalizeKey',
    'isSentRuntimeThread',
    `${getQueueHistoryItemInitialsSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${buildQueueInlineLaneSignalItemsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    new Function(
      `${getQueueHistoryItemInitialsSource}
       return getQueueHistoryItemInitials;`
    )(),
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => false
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'Sivan Bergenstein',
    displaySubject: 'Sivan Bergenstein Kontaktformulär',
    preview: 'Från: Sivan Bergenstein E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig?',
    whyInFocus: 'Senaste händelsen i tråden var ett utgående svar från kliniken',
    lastActivityLabel: '26 mars',
    primaryLaneId: 'unclear',
    mailboxLabel: 'Kons',
  });

  assert.equal(item.title, 'Ärende via kontaktformulär');
  assert.equal(item.detail, 'Senaste händelsen i tråden var ett utgående svar från kliniken');
});

test('queue inline lane cards strip technical QA prefixes before using preview text as the issue line', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const buildQueueInlineLaneSignalItemsSource = extractFunctionSource(source, 'buildQueueInlineLaneSignalItems');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');

  const buildQueueInlineLaneHistoryItem = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'getQueueHistoryItemInitials',
    'normalizeKey',
    'isSentRuntimeThread',
    `${getQueueHistoryItemInitialsSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${buildQueueInlineLaneSignalItemsSource}
     ${buildQueueInlineLaneHistoryItemSource}
     return buildQueueInlineLaneHistoryItem;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', max = 108) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    new Function(
      `${getQueueHistoryItemInitialsSource}
       return getQueueHistoryItemInitials;`
    )(),
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => false
  );

  const item = buildQueueInlineLaneHistoryItem({
    customerName: 'Fazli | Hair TP Clinic',
    displaySubject: 'QA Reply Kons Send [telefon]',
    preview: 'QA-REPLY-KONS-SEND-[telefon] Detta är en kontrollerad reply-fixtur för verifiering.',
    lastActivityLabel: '1 apr.',
    primaryLaneId: 'review',
    mailboxLabel: 'Kons',
  });

  assert.equal(item.title, 'Detta är en kontrollerad reply-fixtur för verifiering.');
  assert.equal(item.detail, '');
});

test('major arcana preview exposes a clearly labeled secondary truth worklist surface', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const styles = fs.readFileSync(STYLES_PATH, 'utf8');
  const pageButtons = Array.from(html.matchAll(/data-truth-worklist-page-button=\"([^\"]+)\"/g)).map(
    (match) => match[1]
  );
  const truthSectionMatch = html.match(
    /<section\s+class="truth-worklist-shell"[\s\S]*?data-truth-worklist-rows[\s\S]*?<\/section>/
  );

  assert.ok(truthSectionMatch, 'Kunde inte hitta den öppnade truth worklist-surface:n.');
  assert.match(truthSectionMatch[0], /truth-worklist-toolbar/);
  assert.match(truthSectionMatch[0], /truth-worklist-layout/);
  assert.match(truthSectionMatch[0], /truth-worklist-hero-band/);
  assert.match(truthSectionMatch[0], /truth-worklist-hero-topline/);
  assert.match(truthSectionMatch[0], /truth-worklist-page-nav/);
  assert.match(truthSectionMatch[0], /truth-worklist-band-grid--overview/);
  assert.match(truthSectionMatch[0], /truth-worklist-band-grid--assist/);
  assert.match(truthSectionMatch[0], /truth-worklist-band--baseline/);
  assert.match(truthSectionMatch[0], /truth-worklist-band--rows/);
  assert.deepEqual(
    pageButtons,
    ['overview', 'guardrail', 'assist', 'parity', 'scope'],
    'Truth worklist ska exponera fem klickbara undersidor i stabil ordning.'
  );
  assert.match(truthSectionMatch[0], /data-truth-worklist-page-panel="overview"/);
  assert.match(truthSectionMatch[0], /data-truth-worklist-page-panel="guardrail"/);
  assert.match(truthSectionMatch[0], /data-truth-worklist-page-panel="assist"/);
  assert.match(truthSectionMatch[0], /data-truth-worklist-page-panel="parity"/);
  assert.match(truthSectionMatch[0], /data-truth-worklist-page-panel="scope"/);
  assert.match(
    styles,
    /\.truth-worklist-band-grid--overview,\s*\.truth-worklist-band-grid--assist\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    'Överblick och Assistläge ska använda en samlad enkolumnsstruktur i stället för att lämna en tom högersida.'
  );
  assert.match(
    styles,
    /\.truth-worklist-shell\s+\.queue-truth-view-mailboxes\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    'Mailbox parity ska renderas som fullbreddsrader, inte som två splittrade spalter.'
  );
  assert.match(
    styles,
    /\.truth-worklist-shell\s+\.queue-truth-view-row-head-trail\s*\{[\s\S]*display:\s*flex;/,
    'Truth scope-rader ska samla tid, parity och relay på första raden bredvid rubriken.'
  );
  assert.match(
    styles,
    /\.truth-worklist-layout\s*\{[\s\S]*align-content:\s*start;/,
    'Truth worklist-layouten ska packa sitt innehåll uppåt i stället för att stretcha raderna över hela surface:n.'
  );
  assert.match(
    styles,
    /\.truth-worklist-layout\s*\{[\s\S]*justify-items:\s*start;/,
    'Truth worklist-layouten ska vänsterförankra innehållet i en samlad rail i stället för att låta allt använda fullbredd.'
  );
  assert.match(
    styles,
    /\.truth-worklist-layout\s*>\s*\.truth-worklist-hero-band,\s*\.truth-worklist-layout\s*>\s*\.truth-worklist-page-nav,\s*\.truth-worklist-layout\s*>\s*\[data-truth-worklist-page-panel\]\s*\{[\s\S]*width:\s*min\(100%,\s*var\(--truth-worklist-rail-width\)\);/,
    'Hero, sidnavigering och panelsidor ska dela samma smalare content-rail i truth worklist.'
  );
  assert.match(
    styles,
    /\.truth-worklist-shell\s*\{[\s\S]*--truth-worklist-shell-width:\s*1120px;[\s\S]*--truth-worklist-rail-width:\s*780px;[\s\S]*width:\s*min\(var\(--truth-worklist-shell-width\),\s*calc\(100vw - 48px\)\);[\s\S]*height:\s*var\(--truth-worklist-shell-height\);/,
    'Truth-surface:n ska vara mindre än tidigare och bära en smalare shell- och railbredd.'
  );
  assert.match(
    styles,
    /\.truth-worklist-hero-topline\s*\{[\s\S]*justify-content:\s*flex-start;/,
    'Toppradens truth-statuschips ska ligga intill Truth-driven arbetsyta i stället för att skjutas ut till höger.'
  );
  assert.match(
    styles,
    /#truth-worklist-page-scope\s+\.queue-truth-view-row\s*\{[\s\S]*padding-inline-end:\s*18px;/,
    'Truth scope-radernas högersida ska dras in från kanten så att datum, parity och legacy-status inte hänger ute i shellens ytterkant.'
  );
  assert.match(
    styles,
    /#truth-worklist-page-scope\s+\.queue-truth-view-row\s*\{[\s\S]*padding-block:\s*5px;[\s\S]*padding-inline-end:\s*18px;/,
    'Truth scope-raderna ska ha tydligt mindre vertikal luft mellan sig än tidigare.'
  );
  assert.match(
    styles,
    /#truth-worklist-page-scope\s+\.queue-truth-view-row-preview\s*\{[\s\S]*margin:\s*0;/,
    'Truth scope-previewn ska inte bära defaultmarginaler som skapar onödig luft mellan raderna.'
  );
  assert.match(
    styles,
    /\.truth-worklist-page-nav\s*\{[\s\S]*align-items:\s*flex-start;/,
    'Truth-tabbarna ska inte stretchas till höga kolumner när surface:n har ledig höjd.'
  );
  assert.match(
    styles,
    /\[data-truth-worklist-page-panel\]\[hidden\]\s*\{[\s\S]*display:\s*none\s*!important;/,
    'Inaktiva truth-sidor ska tvingas bort ur layouten när en annan kategori är vald.'
  );
  assert.match(html, /data-truth-worklist-launch/);
  assert.match(html, /aria-controls="truth-worklist-shell"/);
  assert.match(html, /data-truth-worklist-shell/);
  assert.match(html, /data-truth-worklist-close/);
  assert.match(html, /Truth-driven/);
  assert.match(html, /Sekundär vy/);
  assert.match(html, /Legacy queue fortfarande styrande/);
  assert.match(html, /Shadow guardrail aktiv/);
  assert.match(html, /data-truth-worklist-relay-note/);
  assert.doesNotMatch(html, /<section class="queue-truth-view"/);
  assert.doesNotMatch(truthSectionMatch[0], /data-runtime-thread/);
  assert.doesNotMatch(truthSectionMatch[0], /data-studio-open/);
  assert.match(
    styles,
    /\.truth-worklist-shell\s*\{[\s\S]*position:\s*fixed;[\s\S]*top:\s*calc\(16px \+ var\(--topbar-height\) \+ 6px\);[\s\S]*\}/,
    'Truth assisten ska öppnas som en egen fast surface, inte som en inline-drop i vänsterspåret.'
  );
  assert.match(
    styles,
    /\.preview-canvas\.is-truth-worklist-open\s+\.preview-workspace\s*>\s*\.preview-shell[\s\S]*visibility:\s*hidden;/,
    'När truth-assistenten är öppen ska den gamla arbetsytan lämna plats för den öppnade surface:n.'
  );
});

test('truth worklist mailbox rendering keeps not comparable mailboxes explicit', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const parityLabelSource = extractFunctionSource(source, 'getTruthWorklistParityLabel');
  const mailboxMarkupSource = extractFunctionSource(source, 'buildTruthWorklistMailboxMarkup');

  const buildTruthWorklistMailboxMarkup = new Function(
    'asArray',
    'escapeHtml',
    'normalizeText',
    `${parityLabelSource}
     ${mailboxMarkupSource}
     return buildTruthWorklistMailboxMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),
    (value = '') => (typeof value === 'string' ? value.trim() : '')
  );

  const markup = buildTruthWorklistMailboxMarkup({
    parityBaseline: {
      mailboxAssessment: [
        {
          mailboxId: 'contact@hairtpclinic.com',
          parityStatus: 'comparable',
          legacyCount: 11,
          shadowCount: 11,
          bothCount: 11,
        },
        {
          mailboxId: 'marknad@hairtpclinic.com',
          parityStatus: 'not_comparable_no_legacy_baseline',
          legacyCount: 0,
          shadowCount: 4,
          bothCount: 0,
        },
      ],
    },
  });

  assert.match(markup, /contact@hairtpclinic\.com/);
  assert.match(markup, /Jämförbar/);
  assert.match(markup, /marknad@hairtpclinic\.com/);
  assert.match(markup, /Not comparable yet/);
});

test('truth worklist rows expose advisory legacy relay without runtime selection hooks', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const comparableMailboxSource = extractFunctionSource(
    source,
    'getTruthWorklistComparableMailboxIds'
  );
  const rowsMarkupSource = extractFunctionSource(source, 'buildTruthWorklistRowsMarkup');

  const buildTruthWorklistRowsMarkup = new Function(
    'asArray',
    'compactRuntimeCopy',
    'escapeHtml',
    'formatConversationTime',
    'getTruthWorklistViewLimit',
    'normalizeMailboxId',
    'normalizeText',
    `${comparableMailboxSource}
     ${rowsMarkupSource}
     return buildTruthWorklistRowsMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '', max = 160) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    (value) => String(value || '1 apr.'),
    () => 6,
    (value = '') => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    (value = '') => (typeof value === 'string' ? value.trim() : '')
  );

  const comparableMarkup = buildTruthWorklistRowsMarkup(
    {
      parityBaseline: {
        comparableMailboxIds: ['contact@hairtpclinic.com'],
      },
      rows: [
        {
          id: 'contact@hairtpclinic.com:conv-1',
          lane: 'all',
          subject: 'Bokningsfråga inför återbesök',
          preview: 'Kunden vill ha tid i nästa vecka.',
          conversation: {
            key: 'contact@hairtpclinic.com:conv-1',
          },
          mailbox: {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            ownershipMailbox: 'contact@hairtpclinic.com',
          },
          customer: {
            email: 'kund@example.com',
            name: 'Kund Test',
          },
          timing: {
            latestMessageAt: '2026-04-02T20:00:00.000Z',
            lastInboundAt: '2026-04-02T19:00:00.000Z',
          },
          state: {
            hasUnreadInbound: true,
            needsReply: true,
            folderPresence: {
              inbox: true,
              sent: false,
            },
          },
        },
      ],
    },
    {
      conversationKey: 'contact@hairtpclinic.com:conv-1',
    }
  );

  assert.match(comparableMarkup, /Jämförbar parity/);
  assert.match(comparableMarkup, /Relay aktivt i legacy-kö/);
  assert.match(comparableMarkup, /data-truth-relay-legacy/);
  assert.doesNotMatch(comparableMarkup, /data-runtime-thread/);
  assert.doesNotMatch(comparableMarkup, /data-studio-open/);

  const notComparableMarkup = buildTruthWorklistRowsMarkup({
    parityBaseline: {
      comparableMailboxIds: [],
    },
    rows: [
      {
        id: 'marknad@hairtpclinic.com:conv-2',
        lane: 'all',
        subject: 'Not comparable yet',
        preview: 'Legacy baseline saknas i den här körningen.',
        conversation: {
          key: 'marknad@hairtpclinic.com:conv-2',
        },
        mailbox: {
          mailboxId: 'marknad@hairtpclinic.com',
          mailboxAddress: 'marknad@hairtpclinic.com',
          ownershipMailbox: 'marknad@hairtpclinic.com',
        },
        customer: {
          email: 'kund2@example.com',
          name: 'Kund Marknad',
        },
        timing: {
          latestMessageAt: '2026-04-02T21:00:00.000Z',
          lastInboundAt: '2026-04-02T20:30:00.000Z',
        },
        state: {
          hasUnreadInbound: true,
          needsReply: true,
          folderPresence: {
            inbox: true,
            sent: false,
          },
        },
      },
    ],
  });

  assert.match(notComparableMarkup, /Not comparable yet/);
  assert.match(notComparableMarkup, /Legacy-baseline saknas/);
  assert.match(notComparableMarkup, /disabled/);
});

test('truth worklist rows surface customer rollup provenance without hiding operational summary', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const comparableMailboxSource = extractFunctionSource(
    source,
    'getTruthWorklistComparableMailboxIds'
  );
  const rowsMarkupSource = extractFunctionSource(source, 'buildTruthWorklistRowsMarkup');

  const buildTruthWorklistRowsMarkup = new Function(
    'asArray',
    'compactRuntimeCopy',
    'escapeHtml',
    'formatConversationTime',
    'getTruthWorklistViewLimit',
    'normalizeMailboxId',
    'normalizeText',
    `${comparableMailboxSource}
     ${rowsMarkupSource}
     return buildTruthWorklistRowsMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '', max = 160) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    (value) => String(value || '1 apr.'),
    () => 6,
    (value = '') => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    (value = '') => (typeof value === 'string' ? value.trim() : '')
  );

  const markup = buildTruthWorklistRowsMarkup(
    {
      parityBaseline: {
        comparableMailboxIds: ['egzona@hairtpclinic.com', 'contact@hairtpclinic.com'],
      },
      rows: [
        {
          id: 'egzona@hairtpclinic.com:conv-safe-1',
          lane: 'act-now',
          subject: 'QA Reply Kons Send [telefon]',
          preview: 'Jag behöver hjälp med min bokning.',
          conversation: {
            key: 'egzona@hairtpclinic.com:conv-safe-1',
          },
          mailbox: {
            mailboxId: 'egzona@hairtpclinic.com',
            mailboxAddress: 'egzona@hairtpclinic.com',
            ownershipMailbox: 'egzona@hairtpclinic.com',
          },
          customer: {
            email: 'patient@example.com',
            name: 'Patient Example',
          },
          rollup: {
            enabled: true,
            count: 2,
            mailboxCount: 2,
            provenanceLabel: '2 mailboxar',
            provenanceDetail: 'egzona@hairtpclinic.com · contact@hairtpclinic.com',
            operationalSummary: {
              unreadCount: 1,
              needsReplyCount: 1,
              inboxCount: 1,
              sentCount: 1,
            },
          },
          timing: {
            latestMessageAt: '2026-04-02T20:00:00.000Z',
            lastInboundAt: '2026-04-02T19:00:00.000Z',
          },
          state: {
            hasUnreadInbound: true,
            needsReply: true,
            folderPresence: {
              inbox: true,
              sent: true,
            },
          },
        },
      ],
    },
    {
      conversationKey: 'egzona@hairtpclinic.com:conv-safe-1',
    }
  );

  assert.match(markup, /Rollup 2/);
  assert.match(markup, /2 mailboxar/);
  assert.match(markup, /egzona@hairtpclinic\.com/);
  assert.match(markup, /contact@hairtpclinic\.com/);
  assert.match(markup, /Unread 1/);
  assert.match(markup, /Needs reply 1/);
});

test('truth worklist assist controls stay local to the assist surface', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const comparableMailboxSource = extractFunctionSource(
    source,
    'getTruthWorklistComparableMailboxIds'
  );
  const filterLabelSource = extractFunctionSource(source, 'getTruthWorklistAssistFilterLabel');
  const sortLabelSource = extractFunctionSource(source, 'getTruthWorklistAssistSortLabel');
  const visibleRowsSource = extractFunctionSource(source, 'getTruthWorklistVisibleRows');
  const controlsMarkupSource = extractFunctionSource(source, 'buildTruthWorklistControlsMarkup');
  const guidanceMarkupSource = extractFunctionSource(source, 'buildTruthWorklistGuidanceMarkup');

  const { buildTruthWorklistControlsMarkup, buildTruthWorklistGuidanceMarkup } = new Function(
    'asArray',
    'escapeHtml',
    'normalizeMailboxId',
    'normalizeText',
    `${comparableMailboxSource}
     ${filterLabelSource}
     ${sortLabelSource}
     ${visibleRowsSource}
     ${controlsMarkupSource}
     ${guidanceMarkupSource}
     return {
       buildTruthWorklistControlsMarkup,
       buildTruthWorklistGuidanceMarkup
     };`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    (value = '') => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    (value = '') => (typeof value === 'string' ? value.trim() : '')
  );

  const payload = {
    shadowGuardrail: {
      acceptanceGate: {
        canConsiderCutover: true,
      },
    },
    parityBaseline: {
      comparableMailboxIds: ['contact@hairtpclinic.com'],
    },
    rows: [
      {
        lane: 'all',
        mailbox: { mailboxId: 'contact@hairtpclinic.com' },
        state: { hasUnreadInbound: true, needsReply: true },
        timing: {
          latestMessageAt: '2026-04-03T10:00:00.000Z',
          lastInboundAt: '2026-04-03T09:55:00.000Z',
        },
        subject: 'A',
      },
      {
        lane: 'act-now',
        mailbox: { mailboxId: 'contact@hairtpclinic.com' },
        state: { hasUnreadInbound: false, needsReply: true },
        timing: {
          latestMessageAt: '2026-04-03T09:00:00.000Z',
          lastInboundAt: '2026-04-03T08:55:00.000Z',
        },
        subject: 'B',
      },
    ],
  };

  const controlsMarkup = buildTruthWorklistControlsMarkup(payload, {
    localFilter: 'needs_reply',
    localSort: 'inbound',
  });
  const guidanceMarkup = buildTruthWorklistGuidanceMarkup(payload, {
    localFilter: 'needs_reply',
    localSort: 'inbound',
    relay: null,
  });

  assert.match(controlsMarkup, /data-truth-worklist-filter="needs_reply"/);
  assert.match(controlsMarkup, /data-truth-worklist-sort="inbound"/);
  assert.match(controlsMarkup, /Visar 2 av 2 truth-rader/);
  assert.match(controlsMarkup, /legacy queue, selection, fokusyta och studio lämnas orörda/i);
  assert.match(guidanceMarkup, /Ingen global selection/);
  assert.match(guidanceMarkup, /Ingen fokusyta/);
  assert.match(guidanceMarkup, /Ingen studio/);
  assert.match(guidanceMarkup, /Operativ öppning sker fortfarande manuellt via legacy-kön/);
});

test('getRuntimeCustomerName faller tillbaka till kontaktformular-subject nar avsandarfalt saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');

  const getRuntimeCustomerName = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     return getRuntimeCustomerName;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const customerName = getRuntimeCustomerName({
    customerName: 'Okänd avsändare',
    senderName: 'Okänd avsändare',
    senderDisplayName: '',
    sender: '',
    subject: 'Sivan Bergenstein Kontaktformulär',
  });

  assert.equal(customerName, 'Sivan Bergenstein');
});

test('getRuntimeCustomerName faller tillbaka till tekniskt subject nar avsandarfalt ar placeholders', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');

  const getRuntimeCustomerName = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${isRuntimePlaceholderLineSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     return getRuntimeCustomerName;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const customerName = getRuntimeCustomerName({
    customerName: 'Okänd avsändare',
    senderName: 'Okänd avsändare',
    senderDisplayName: '',
    sender: '',
    subject: 'QA Reply Kons Send [telefon]',
  });

  assert.equal(customerName, 'QA Reply Kons Send [telefon]');
});

test('getRuntimeCustomerName humaniserar generisk extern avsandaradress till domanetikett', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');

  const getRuntimeCustomerName = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     return getRuntimeCustomerName;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const customerName = getRuntimeCustomerName({
    customerName: 'info@e.circlekextra.se',
    senderName: 'info@e.circlekextra.se',
    sender: 'info@e.circlekextra.se',
    subject: 'Egzona, din månadsstatus är här',
  });

  assert.equal(customerName, 'Circlekextra Se');
});

test('getRuntimeCustomerName kan lasa verklig avsandare fran replyhuvud i bodytext', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');

  const getRuntimeCustomerName = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     return getRuntimeCustomerName;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const customerName = getRuntimeCustomerName({
    customerName: 'Okänd avsändare',
    senderName: 'Okänd avsändare',
    subject: '8 månader update',
    latestMessage: {
      body: 'Stort tack! Skickat från Outlook för Mac Från: Alma Persson <alma@example.com> Datum: tisdag, 31 mars 2026 11:38 Till: Marknad | Hair TP Clinic <marknad@hairtpclinic.com> Ämne: Re: 8 månader update',
    },
  });

  assert.equal(customerName, 'Alma Persson');
});

test('runtime placeholder helpers behandlar svenska placeholderstrangar som placeholders', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );

  const evaluate = new Function(
    `${normalizeTextSource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     return {
       isRuntimePlaceholderLine,
       isRuntimeUnknownCustomerName,
     };`
  )();

  assert.equal(
    evaluate.isRuntimePlaceholderLine('Ingen förhandsvisning tillgänglig.'),
    true
  );
  assert.equal(evaluate.isRuntimeUnknownCustomerName('Okänd avsändare'), true);
  assert.equal(
    evaluate.isRuntimePlaceholderLine('Du får inte ofta e-post från [email]'),
    true
  );
  assert.equal(
    evaluate.isRuntimePlaceholderLine(
      'Unread inbound och needs reply läses från mailbox truth i wave 1.'
    ),
    true
  );
});

test('createHistoryEvent rensar bort provider-copy fran historiktitlar och detaljer', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const createHistoryEventSource = extractFunctionSource(source, 'createHistoryEvent');

  const createHistoryEvent = new Function(
    'asText',
    'deriveHistoryEventResultType',
    'formatHistoryTimestamp',
    'normalizeMailboxId',
    'toIso',
    `${createHistoryEventSource}
     return createHistoryEvent;`
  )(
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (definition) => String(definition?.resultType || definition?.type || 'message'),
    () => 'Nu',
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => String(value || '')
  );

  const event = createHistoryEvent({
    title:
      'Du får inte ofta e-post från [email]. Läs om varför det här är viktigt Viktigt | Inför din hårtransplantation',
    description:
      'Du får inte ofta e-post från [email]. Läs om varför det här är viktigt Viktigt | Inför din hårtransplantation',
    detail:
      'Du får inte ofta e-post från [email]. Läs om varför det här är viktigt Hej, stort tack för idag!',
    mailboxId: 'contact@hairtpclinic.com',
    recordedAt: '2026-04-02T18:05:00.000Z',
  });

  assert.equal(event.title, 'Viktigt | Inför din hårtransplantation');
  assert.equal(event.description, 'Viktigt | Inför din hårtransplantation');
  assert.equal(event.detail, 'Hej, stort tack för idag!');
});

test('classifyRuntimeRowFamily delar upp human mail, booking-systemmail och notifieringar', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'classifyRuntimeRowFamily');

  const classifyRuntimeRowFamily = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    `${functionSource}
     return classifyRuntimeRowFamily;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  assert.equal(
    classifyRuntimeRowFamily({
      subject: 'Charlie Lagerkvist Kontaktformulär',
      preview: 'Jag råkade skriva in fel mail adress till er när jag bokade mitt besök',
      intent: 'contact_form',
    }),
    'human_mail'
  );
  assert.equal(
    classifyRuntimeRowFamily({
      subject: 'Ny bokning (web): Hewa sadi, måndag 6 april 2026 17:00',
      preview: 'Ny bokning (web): Hewa sadi, måndag 6 april 2026 17:00',
      mailboxLabel: 'Kons',
    }),
    'booking_system_mail'
  );
  assert.equal(
    classifyRuntimeRowFamily({
      subject: 'QA Reply Kons Send [telefon]',
      preview: 'Fazli, Tack för ditt meddelande',
    }),
    'notification/system_notice'
  );
});

test('buildPreviewMessages anvander bodyPreview nar feed-preview saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-1',
      customerName: '',
      senderName: '',
      subject: 'Noha Haj omar Kontaktformulär',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-1',
        direction: 'inbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        preview: '',
        bodyPreview:
          'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
      },
    ]
  );

  assert.equal(messages[0].author, 'Noha Haj omar');
  assert.match(messages[0].body, /Min fråga är, är det möjligt att transplantera ögonbrynshår/);
});

test('buildPreviewMessages faller tillbaka till latestMessage-detail nar previewfalten ar tomma', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-noha-raw',
      customerName: '',
      senderName: '',
      subject: 'Noha Haj omar Kontaktformulär',
      mailboxAddress: 'kons@hairtpclinic.com',
      preview: '',
      latestInboundPreview: '',
      latestMessage: {
        detail:
          'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
      },
    },
    []
  );

  assert.equal(messages[0].author, 'Noha Haj omar');
  assert.match(messages[0].body, /ögonbrynshår/);
});

test('buildPreviewMessages faller tillbaka till latestMessage-bodyHtml nar ovriga previewfalt ar tomma', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-noha-body-html',
      customerName: '',
      senderName: '',
      subject: 'Noha Haj omar Kontaktformulär',
      mailboxAddress: 'kons@hairtpclinic.com',
      preview: '',
      latestInboundPreview: '',
      latestMessage: {
        bodyHtml:
          '<div>Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?</div>',
      },
    },
    []
  );

  assert.equal(messages[0].author, 'Noha Haj omar');
  assert.match(messages[0].body, /ögonbrynshår/);
});

test('buildPreviewMessages bar med bodyHtml som conversationBodyHtml nar htmlsignatur kan visas senare i fokusytan', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-html-signature',
      customerName: 'Linda Ölander',
      subject: 'Sv: Konsultation',
      mailboxAddress: 'egzona@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-html-signature',
        direction: 'outbound',
        sentAt: '2026-04-07T08:24:00.000Z',
        bodyHtml:
          '<table><tr><td><img src="https://arcana.hairtpclinic.se/assets/hair-tp-clinic/hairtpclinic-mark-light.svg" alt="Hair TP Clinic" width="94" /></td><td><div><strong>Egzona Krasniqi</strong><br />Hårspecialist</div></td></tr></table>',
        body: 'Bästa hälsningar\nEgzona Krasniqi\nHårspecialist',
      },
    ]
  );

  assert.match(messages[0].conversationBody, /Egzona Krasniqi/);
  assert.match(messages[0].conversationBodyHtml, /hairtpclinic-mark-light\.svg/);
  assert.match(messages[0].conversationBodyHtml, /<img/i);
});

test('buildPreviewMessages behaller kontaktformularets faktiska fraga i conversationBody utan formulärpreamble', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-noha-form-body',
      customerName: '',
      senderName: '',
      subject: 'Noha Haj omar Kontaktformulär',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-noha-form-body',
        direction: 'inbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        bodyHtml:
          '<div>Från: Noha Haj omar<br>E-post: noha@example.com<br>Telefon: 0700000000<br>Hur kan vi hjälpa dig?<br>Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?</div>',
      },
    ]
  );

  assert.doesNotMatch(messages[0].conversationBody, /Från:\s*Noha Haj omar/i);
  assert.doesNotMatch(messages[0].conversationBody, /E-post:/i);
  assert.match(messages[0].conversationBody, /Hej\. Min fråga är, är det möjligt att transplantera ögonbrynshår/i);
});

test('buildPreviewMessages behaller utgaende signatur i conversationBody men klipper bort citerad reply-kedja', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-alma-signature',
      customerName: 'Alma Persson',
      senderName: '',
      subject: '8 månader update',
      mailboxAddress: 'marknad@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-alma-signature',
        direction: 'outbound',
        sentAt: '2026-03-31T11:25:00.000Z',
        senderName: 'Marknad',
        body:
          'Hej Alma, Hoppas allt är bra med dig. Vi tänkte re-posta din video på våra sociala medier.\nTack på förhand!\nHa en fin dag, Mån\nSkickat från Outlook för Mac Från: Alma Persson <alma@example.com> Datum: tisdag, 31 mars 2026 11:38 Till: Marknad | Hair TP Clinic <marknad@hairtpclinic.com> Ämne: Re: 8 månader update',
      },
    ]
  );

  assert.match(messages[0].conversationBody, /Ha en fin dag, Mån/i);
  assert.match(messages[0].conversationBody, /Skickat från Outlook för Mac/i);
  assert.doesNotMatch(messages[0].conversationBody, /Från:\s*Alma Persson/i);
  assert.doesNotMatch(messages[0].conversationBody, /Datum:\s*tisdag, 31 mars 2026/i);
  assert.doesNotMatch(messages[0].conversationBody, /Till:\s*Marknad \| Hair TP Clinic/i);
});

test('buildPreviewMessages klipper weekday-svarskedja och senare Från-block men behaller signaturdelar', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const inboundMessages = buildPreviewMessages(
    {
      conversationId: 'conv-mi-mv',
      customerName: 'MI MV',
      subject: 'Tis kväll',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-mi-mv',
        direction: 'inbound',
        sentAt: '2026-03-31T19:15:00.000Z',
        senderName: 'Mirzet',
        body:
          'Hej Ring mig gärna när du har tid MVH tis 31 mars 2026 kl. 19:15 skrev Contact | Hair TP Clinic <contact@hairtpclinic.com>: Hej! Hoppas du har en fin kväll',
      },
    ]
  );

  assert.match(inboundMessages[0].conversationBody, /Hej Ring mig gärna när du har tid\s+MVH/i);
  assert.match(inboundMessages[0].conversationBody, /MVH\s+Mirzet/i);
  assert.doesNotMatch(inboundMessages[0].conversationBody, /\btis\b/i);
  assert.doesNotMatch(inboundMessages[0].conversationBody, /skrev Contact \| Hair TP Clinic/i);

  const outboundMessages = buildPreviewMessages(
    {
      conversationId: 'conv-linda-olander',
      customerName: 'Linda Ölander',
      subject: 'Kollo platsen',
      mailboxAddress: 'egzona@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-linda-olander',
        direction: 'outbound',
        sentAt: '2026-04-06T12:10:00.000Z',
        senderName: 'Egzona Krasniqi',
        body:
          'Jag/vi tackar ja till platsen!\nBästa hälsningar, Egzona Krasniqi Hårspecialist | Hårtransplantationer & PRP-injektioner [telefon] [email] Vasaplatsen 2, 411 34 Göteborg ________________________________ Från: Linda Ölander <linda@example.com>',
      },
    ]
  );

  assert.match(outboundMessages[0].conversationBody, /Bästa hälsningar, Egzona Krasniqi/i);
  assert.doesNotMatch(outboundMessages[0].conversationBody, /Från:\s*Linda Ölander/i);
  assert.doesNotMatch(outboundMessages[0].conversationBody, /_{10,}/);
});

test('history feed entries behaller rik body fidelity sa att quoted chains kan rensas i fokuskedjan', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const compareHistoryEventsDescSource = extractFunctionSource(source, 'compareHistoryEventsDesc');
  const buildHistoryConversationKeySource = extractFunctionSource(
    source,
    'buildHistoryConversationKey'
  );
  const buildHistoryFeedEntriesSource = extractFunctionSource(source, 'buildHistoryFeedEntries');
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const titleCaseMailbox = (value = '') => String(value || '').trim() || 'Kons';
  const toIso = (value) => String(value || '');

  const buildHistoryFeedEntries = new Function(
    'asArray',
    'asText',
    'buildHistoryConversationKey',
    'compareHistoryEventsDesc',
    'isRuntimePlaceholderLine',
    'normalizeKey',
    'normalizeText',
    'toIso',
    `${isRuntimePlaceholderLineSource}
     ${compareHistoryEventsDescSource}
     ${buildHistoryConversationKeySource}
     ${buildHistoryFeedEntriesSource}
     return buildHistoryFeedEntries;`
  )(asArray, asText, null, null, null, normalizeKey, normalizeText, toIso);

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(asArray, asText, (value) => String(value || 'Nu'), normalizeKey, normalizeText, titleCaseMailbox, toIso);

  const historyFeedEntries = buildHistoryFeedEntries([
    {
      messageId: 'history-emma-1',
      conversationId: 'conv-emma-history',
      mailboxId: 'contact@hairtpclinic.com',
      direction: 'inbound',
      senderName: 'Emma Magnusson',
      subject: 'Ombokning av tid',
      body:
        'Ja kl 12 hade funkat bra\nMed vänlig hälsning\nEmma Magnusson\nFrom: Contact | Hair TP Clinic <contact@hairtpclinic.com>\nSent: Thursday, April 2, 2026 8:00:50 AM',
    },
  ]);

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-emma-history',
      customerName: 'Emma Magnusson',
      subject: 'Ombokning av tid',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    historyFeedEntries
  );

  assert.match(messages[0].conversationBody, /Ja kl 12 hade funkat bra/i);
  assert.match(messages[0].conversationBody, /Med vänlig hälsning\s+Emma Magnusson/i);
  assert.doesNotMatch(messages[0].conversationBody, /From:\s*Contact \| Hair TP Clinic/i);
  assert.doesNotMatch(messages[0].conversationBody, /Sent:\s*Thursday/i);
});

test('buildPreviewMessages rensar bort provider-copy och behaller verklig mailtext', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-provider-preview',
      subject: 'Isak Nyström Ang',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-provider-preview',
        direction: 'inbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        bodyPreview:
          'Du får inte ofta e-post från [email] Läs om varför det här är viktigt. Hej, jag får inte ofta e-post från denna adress men undrar om ni kan hjälpa mig med bokningen.',
      },
    ]
  );

  assert.doesNotMatch(messages[0].body, /Du får inte ofta e-post från/);
  assert.doesNotMatch(messages[0].body, /Läs om varför det här är viktigt/);
  assert.match(messages[0].body, /Hej, jag får inte ofta e-post från denna adress/);

  const variantMessages = buildPreviewMessages(
    {
      conversationId: 'conv-provider-preview-variant',
      subject: 'Info Wilundia',
      mailboxAddress: 'info@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-provider-preview-variant',
        direction: 'inbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        body:
          'Vissa som har fått det här meddelandet får inte ofta e-post från [email]. Läs om varför det här är viktigt Hej Se nedan info från Göteborg Energi. Med vänlig hälsning Susanne Lundkvist Wilundia AB',
      },
    ]
  );

  assert.doesNotMatch(variantMessages[0].body, /Vissa som har fått det här meddelandet/i);
  assert.doesNotMatch(variantMessages[0].conversationBody, /Vissa som har fått det här meddelandet/i);
  assert.match(variantMessages[0].conversationBody, /Med vänlig hälsning Susanne Lundkvist Wilundia AB/i);

  const learnWhyMessages = buildPreviewMessages(
    {
      conversationId: 'conv-provider-preview-learn-why',
      subject: 'Bladh Anders',
      mailboxAddress: 'info@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-provider-preview-learn-why',
        direction: 'inbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        body:
          'Learn why this is important Hej, Jag har nu läst på informationen som ni skickade mig och vill därför avboka. Med vänliga hälsningar Anders',
      },
    ]
  );

  assert.doesNotMatch(learnWhyMessages[0].conversationBody, /Learn why this is important/i);
  assert.match(learnWhyMessages[0].conversationBody, /Hej, Jag har nu läst på informationen/i);
});

test('buildHistoryFeedEntries och buildPreviewMessages prioriterar canonical mailDocument i Phase 1', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(
    source,
    'isRuntimePlaceholderLine'
  );
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const compareHistoryEventsDescSource = extractFunctionSource(source, 'compareHistoryEventsDesc');
  const buildHistoryConversationKeySource = extractFunctionSource(
    source,
    'buildHistoryConversationKey'
  );
  const buildHistoryFeedEntriesSource = extractFunctionSource(source, 'buildHistoryFeedEntries');
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const titleCaseMailbox = (value = '') => String(value || '').trim() || 'Kons';
  const toIso = (value) => String(value || '');

  const buildHistoryFeedEntries = new Function(
    'asArray',
    'asText',
    'buildHistoryConversationKey',
    'compareHistoryEventsDesc',
    'isRuntimePlaceholderLine',
    'normalizeKey',
    'normalizeText',
    'toIso',
    `${isRuntimePlaceholderLineSource}
     ${compareHistoryEventsDescSource}
     ${buildHistoryConversationKeySource}
     ${buildHistoryFeedEntriesSource}
     return buildHistoryFeedEntries;`
  )(asArray, asText, null, null, null, normalizeKey, normalizeText, toIso);

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(asArray, asText, (value) => String(value || 'Nu'), normalizeKey, normalizeText, titleCaseMailbox, toIso);

  const historyFeedEntries = buildHistoryFeedEntries([
    {
      messageId: 'history-phase1-1',
      conversationId: 'conv-phase1',
      mailboxId: 'contact@hairtpclinic.com',
      direction: 'inbound',
      senderName: 'Vincent',
      subject: 'Till Exona',
      bodyPreview: 'Tunn preview',
      mailDocument: {
        kind: 'mail_document',
        previewText: 'Hej Exona, kort fråga om tid imorgon.',
        primaryBodyText: 'Hej Exona,\nKan du ringa när du har tid?\nMed vänlig hälsning\nVincent',
        primaryBodyHtml:
          '<div>Hej Exona,<br>Kan du ringa när du har tid?</div><div>Med vänlig hälsning<br>Vincent</div>',
        subject: 'Till Exona',
        from: { name: 'Vincent', email: 'vincent@example.com' },
      },
    },
  ]);

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-phase1',
      customerName: 'Vincent',
      subject: 'Till Exona',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    historyFeedEntries
  );

  assert.match(messages[0].body, /Hej Exona, kort fråga om tid imorgon/i);
  assert.match(messages[0].conversationBody, /Kan du ringa när du har tid/i);
  assert.match(messages[0].conversationBodyHtml, /Med vänlig hälsning/i);
});

test('buildHistoryFeedEntries och buildPreviewMessages prioriterar canonical mailThreadMessage i Phase 3', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(
    source,
    'isRuntimePlaceholderLine'
  );
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const compareHistoryEventsDescSource = extractFunctionSource(source, 'compareHistoryEventsDesc');
  const buildHistoryConversationKeySource = extractFunctionSource(
    source,
    'buildHistoryConversationKey'
  );
  const buildHistoryFeedEntriesSource = extractFunctionSource(source, 'buildHistoryFeedEntries');
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const titleCaseMailbox = (value = '') => String(value || '').trim() || 'Kons';
  const toIso = (value) => String(value || '');

  const buildHistoryFeedEntries = new Function(
    'asArray',
    'asText',
    'buildHistoryConversationKey',
    'compareHistoryEventsDesc',
    'isRuntimePlaceholderLine',
    'normalizeKey',
    'normalizeText',
    'toIso',
    `${isRuntimePlaceholderLineSource}
     ${compareHistoryEventsDescSource}
     ${buildHistoryConversationKeySource}
     ${buildHistoryFeedEntriesSource}
     return buildHistoryFeedEntries;`
  )(asArray, asText, null, null, null, normalizeKey, normalizeText, toIso);

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(asArray, asText, (value) => String(value || 'Nu'), normalizeKey, normalizeText, titleCaseMailbox, toIso);

  const historyFeedEntries = buildHistoryFeedEntries([
    {
      messageId: 'history-phase3-1',
      conversationId: 'conv-phase3',
      mailboxId: 'contact@hairtpclinic.com',
      direction: 'inbound',
      senderName: 'Vincent',
      subject: 'Till Exona',
      bodyPreview: 'Tunn preview',
      bodyHtml: '<div>Legacy html</div>',
      mailDocument: {
        kind: 'mail_document',
        previewText: 'Phase 1 preview',
        primaryBodyText: 'Phase 1 body',
        primaryBodyHtml: '<div>Phase 1 html</div>',
        subject: 'Till Exona',
        from: { name: 'Vincent', email: 'vincent@example.com' },
      },
      mailThreadMessage: {
        kind: 'mail_thread_message',
        presentation: {
          previewText: 'Hydrator preview från Phase 3',
          conversationText: 'Hej Exona,\nKan vi boka om till fredag?\n\nMed vänlig hälsning\nVincent',
          conversationHtml:
            '<div>Hej Exona,<br>Kan vi boka om till fredag?</div><div>Med vänlig hälsning<br>Vincent</div>',
        },
        primaryBody: {
          text: 'Hej Exona,\nKan vi boka om till fredag?',
        },
      },
    },
  ]);

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-phase3',
      customerName: 'Vincent',
      subject: 'Till Exona',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    historyFeedEntries
  );

  assert.match(messages[0].body, /Hydrator preview från Phase 3/i);
  assert.match(messages[0].conversationBody, /Kan vi boka om till fredag/i);
  assert.match(messages[0].conversationBodyHtml, /Med vänlig hälsning/i);
  assert.equal(messages[0].mailThreadMessage?.kind, 'mail_thread_message');
  assert.doesNotMatch(messages[0].conversationBodyHtml, /Phase 1 html/i);
});

test('buildPreviewMessages prioriterar top-level threadDocument over legacy feed entries i foundation cutover', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(
    source,
    'isRuntimePlaceholderLine'
  );
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const titleCaseMailbox = (value = '') => String(value || '').trim() || 'Kons';
  const toIso = (value) => String(value || '');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(asArray, asText, (value) => String(value || 'Nu'), normalizeKey, normalizeText, titleCaseMailbox, toIso);

  const feedEntries = [
    {
      messageId: 'history-cutover-1',
      conversationId: 'conv-cutover',
      mailboxId: 'contact@hairtpclinic.com',
      direction: 'inbound',
      senderName: 'Vincent',
      subject: 'Till Exona',
      bodyPreview: 'Legacy preview ska inte vinna',
      bodyHtml: '<div>Legacy html ska inte vinna</div>',
      mailDocument: {
        kind: 'mail_document',
        previewText: 'Legacy phase 1 preview',
        primaryBodyText: 'Legacy phase 1 body',
        primaryBodyHtml: '<div>Legacy phase 1 html</div>',
        subject: 'Till Exona',
        from: { name: 'Vincent', email: 'vincent@example.com' },
      },
      mailThreadMessage: {
        kind: 'mail_thread_message',
        messageId: 'history-cutover-1',
        presentation: {
          previewText: 'Legacy hydrator preview',
          conversationText: 'Legacy hydrator body',
          conversationHtml: '<div>Legacy hydrator html</div>',
        },
        primaryBody: {
          text: 'Legacy hydrator body',
          html: '<div>Legacy hydrator html</div>',
        },
      },
    },
  ];

  const threadDocument = {
    kind: 'mail_thread_document',
    messages: [
      {
        kind: 'mail_thread_message',
        messageId: 'history-cutover-1',
        direction: 'inbound',
        sentAt: '2026-04-08T12:00:00.000Z',
        subject: 'Till Exona',
        presentation: {
          previewText: 'Canonical preview från threadDocument',
          conversationText: 'Hej Exona,\nCanonical body\n\nMed vänlig hälsning\nVincent',
          conversationHtml:
            '<div>Hej Exona<br>Canonical body</div><div>Med vänlig hälsning<br>Vincent</div>',
        },
        primaryBody: {
          text: 'Hej Exona\nCanonical body',
          html: '<div>Hej Exona<br>Canonical body</div>',
        },
        signatureBlock: {
          text: 'Med vänlig hälsning\nVincent',
        },
        quotedBlocks: [],
        systemBlocks: [],
      },
    ],
  };

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-cutover',
      customerName: 'Vincent',
      subject: 'Till Exona',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    feedEntries,
    threadDocument
  );

  assert.match(messages[0].body, /Canonical preview från threadDocument/i);
  assert.match(messages[0].conversationBody, /Canonical body/i);
  assert.match(messages[0].conversationBodyHtml, /Canonical body/i);
  assert.doesNotMatch(messages[0].body, /Legacy preview ska inte vinna/i);
  assert.doesNotMatch(messages[0].conversationBodyHtml, /Legacy hydrator html/i);
});

test('buildPreviewMessages foredrar MIME-backed canonical body fran mailDocument nar thread-data ar tunn eller legacy', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(
    source,
    'isRuntimePlaceholderLine'
  );
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const titleCaseMailbox = (value = '') => String(value || '').trim() || 'Kons';
  const toIso = (value) => String(value || '');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(asArray, asText, (value) => String(value || 'Nu'), normalizeKey, normalizeText, titleCaseMailbox, toIso);

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-mime-phasec',
      customerName: 'Curatiio',
      subject: 'Bokningsbekräftelse',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    [
      {
        messageId: 'mime-phasec-1',
        conversationId: 'conv-mime-phasec',
        mailboxId: 'contact@hairtpclinic.com',
        direction: 'inbound',
        senderName: 'Curatiio',
        subject: 'Bokningsbekräftelse',
        bodyPreview: 'Legacy preview ska inte vinna',
        bodyHtml: '<div>Legacy html ska inte vinna</div>',
        mailDocument: {
          kind: 'mail_document',
          previewText: 'Legacy phase 1 preview',
          primaryBodyText: 'Legacy phase 1 body',
          primaryBodyHtml: '<div>Legacy phase 1 html</div>',
          mime: {
            parsed: {
              body: {
                preferredText: 'Bokningsbekräftelse\nFredag 10:00\nVasaplatsen 2',
                preferredHtml:
                  '<table><tr><td><img src="cid:booking-logo@arcana" alt="Logo" /></td><td><strong>Bokningsbekräftelse</strong><br />Fredag 10:00<br />Vasaplatsen 2</td></tr></table>',
              },
            },
          },
        },
        mailThreadMessage: {
          kind: 'mail_thread_message',
          presentation: {
            previewText: 'Legacy hydrator preview',
            conversationText: '',
            conversationHtml: '',
          },
          primaryBody: {
            text: '',
            html: '',
          },
        },
      },
    ]
  );

  assert.match(messages[0].body, /Bokningsbekräftelse/i);
  assert.match(messages[0].conversationBody, /Fredag 10:00/i);
  assert.match(messages[0].conversationBodyHtml, /booking-logo@arcana/i);
  assert.doesNotMatch(messages[0].body, /Legacy preview ska inte vinna/i);
  assert.doesNotMatch(messages[0].conversationBodyHtml, /Legacy phase 1 html/i);
});

test('buildPreviewMessages foredrar MIME-backed html och assets for table-heavy service mail nar legacy-data ar tunn', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(
    source,
    'isRuntimePlaceholderLine'
  );
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const titleCaseMailbox = (value = '') => String(value || '').trim() || 'Kons';
  const toIso = (value) => String(value || '');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(asArray, asText, (value) => String(value || 'Nu'), normalizeKey, normalizeText, titleCaseMailbox, toIso);

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-mime-phasec-service',
      customerName: 'Pipedrive Authentication Service',
      subject: 'Ny inloggning i Pipedrive',
      mailboxAddress: 'contact@hairtpclinic.com',
    },
    [
      {
        messageId: 'mime-phasec-service-1',
        conversationId: 'conv-mime-phasec-service',
        mailboxId: 'contact@hairtpclinic.com',
        direction: 'inbound',
        senderName: 'Pipedrive Authentication Service',
        subject: 'Ny inloggning i Pipedrive',
        bodyPreview: 'Legacy preview ska inte vinna',
        bodyHtml: '<div>Legacy html ska inte vinna</div>',
        mailDocument: {
          kind: 'mail_document',
          previewText: 'Legacy phase 1 preview',
          primaryBodyText: 'Legacy phase 1 body',
          primaryBodyHtml: '<div>Legacy phase 1 html</div>',
          mime: {
            parsed: {
              body: {
                preferredText:
                  'Ny inloggning i Pipedrive från Safari, Mac OS\nOm detta inte var du, byt lösenord direkt.',
                preferredHtml:
                  '<table><tr><td><img src="cid:hero@arcana" alt="Hero" /></td><td><strong>Ny inloggning i Pipedrive från Safari, Mac OS</strong><br />Om detta inte var du, byt lösenord direkt.</td></tr></table>',
              },
            },
          },
        },
        mailThreadMessage: {
          kind: 'mail_thread_message',
          presentation: {
            previewText: 'Legacy hydrator preview',
            conversationText: '',
            conversationHtml: '',
          },
          primaryBody: {
            text: '',
            html: '',
          },
        },
      },
    ]
  );

  assert.match(messages[0].body, /Ny inloggning i Pipedrive/i);
  assert.match(messages[0].conversationBody, /Om detta inte var du/i);
  assert.match(messages[0].conversationBodyHtml, /hero@arcana/i);
  assert.doesNotMatch(messages[0].body, /Legacy preview ska inte vinna/i);
  assert.doesNotMatch(messages[0].conversationBodyHtml, /Legacy phase 1 html/i);
});

test('buildPreviewMessages behaller faktisk utgaende avsandare nar den finns i feeden', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getRuntimeCustomerNameFromFeedEntriesSource = extractFunctionSource(
    source,
    'getRuntimeCustomerNameFromFeedEntries'
  );
  const buildPreviewMessagesSource = extractFunctionSource(source, 'buildPreviewMessages');

  const buildPreviewMessages = new Function(
    'asArray',
    'asText',
    'formatConversationTime',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getRuntimeCustomerNameFromFeedEntriesSource}
     ${buildPreviewMessagesSource}
     return buildPreviewMessages;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => String(value || 'Nu'),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim() || 'Kons',
    (value) => String(value || '')
  );

  const messages = buildPreviewMessages(
    {
      conversationId: 'conv-outbound-author',
      customerName: 'Noha Haj omar',
      senderName: '',
      subject: 'Noha Haj omar Kontaktformulär',
      mailboxAddress: 'kons@hairtpclinic.com',
    },
    [
      {
        messageId: 'message-outbound-author',
        direction: 'outbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        senderName: 'Fazli Krasniqi',
        bodyPreview: 'Hej Noha, tack för ditt meddelande.',
      },
    ]
  );

  assert.equal(messages[0].author, 'Fazli Krasniqi');
  assert.equal(messages[0].role, 'staff');
});

test('live-rad kan hitta feed-preview via mailbox och subject nar conversationId-traffen missar', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const getUsableRuntimeRowPreviewSource = extractFunctionSource(source, 'getUsableRuntimeRowPreview');
  const buildRuntimeRowSemanticKeySource = extractFunctionSource(source, 'buildRuntimeRowSemanticKey');
  const buildFeedIndexSource = extractFunctionSource(source, 'buildFeedIndex');
  const getFeedEntriesForRuntimeRowSource = extractFunctionSource(
    source,
    'getFeedEntriesForRuntimeRow'
  );
  const asText = (value, fallback = '') => {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return fallback;
    return String(value);
  };
  const compactRuntimeCopy = (value, fallback = '') => {
    const text = String(value || '').trim();
    return text || fallback;
  };
  const normalizeKey = (value = '') =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const normalizeText = (value = '') =>
    typeof value === 'string' ? value.trim() : String(value || '').trim();
  const canonicalizeRuntimeMailboxId = (value = '') => String(value || '').trim().toLowerCase();

  const isRuntimePlaceholderLine = new Function(
    'normalizeText',
    `${isRuntimePlaceholderLineSource}
     return isRuntimePlaceholderLine;`
  )(normalizeText);
  const looksLikeMailboxIdentity = new Function(
    'normalizeKey',
    `${looksLikeMailboxIdentitySource}
     return looksLikeMailboxIdentity;`
  )(normalizeKey);
  const isRuntimeUnknownCustomerName = new Function(
    'normalizeText',
    `${isRuntimeUnknownCustomerNameSource}
     return isRuntimeUnknownCustomerName;`
  )(normalizeText);
  const normalizeRuntimeDisplaySubject = new Function(
    'asText',
    'compactRuntimeCopy',
    'normalizeKey',
    'normalizeText',
    `${normalizeRuntimeDisplaySubjectSource}
     return normalizeRuntimeDisplaySubject;`
  )(asText, compactRuntimeCopy, normalizeKey, normalizeText);
  const deriveRuntimeCustomerNameFromSubject = new Function(
    'asText',
    'compactRuntimeCopy',
    'isRuntimePlaceholderLine',
    'looksLikeMailboxIdentity',
    'normalizeRuntimeDisplaySubject',
    'isRuntimeUnknownCustomerName',
    `${deriveRuntimeCustomerNameFromSubjectSource}
     return deriveRuntimeCustomerNameFromSubject;`
  )(
    asText,
    compactRuntimeCopy,
    isRuntimePlaceholderLine,
    looksLikeMailboxIdentity,
    normalizeRuntimeDisplaySubject,
    isRuntimeUnknownCustomerName
  );
  const getRuntimeCustomerName = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    'looksLikeMailboxIdentity',
    'isRuntimeUnknownCustomerName',
    'deriveRuntimeCustomerNameFromSubject',
    `${getRuntimeCustomerNameSource}
     return getRuntimeCustomerName;`
  )(
    asText,
    normalizeKey,
    normalizeText,
    looksLikeMailboxIdentity,
    isRuntimeUnknownCustomerName,
    deriveRuntimeCustomerNameFromSubject
  );

  const evaluate = new Function(
    'asArray',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'compactRuntimeCopy',
    'deriveRuntimeCustomerNameFromSubject',
    'getRuntimeCustomerName',
    'isRuntimePlaceholderLine',
    'normalizeKey',
    'normalizeText',
    'normalizeRuntimeDisplaySubject',
    `${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${getUsableRuntimeRowPreviewSource}
     ${buildRuntimeRowSemanticKeySource}
     ${buildFeedIndexSource}
     ${getFeedEntriesForRuntimeRowSource}
     return { buildFeedIndex, getFeedEntriesForRuntimeRow };`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    asText,
    canonicalizeRuntimeMailboxId,
    compactRuntimeCopy,
    deriveRuntimeCustomerNameFromSubject,
    getRuntimeCustomerName,
    isRuntimePlaceholderLine,
    normalizeKey,
    normalizeText,
    normalizeRuntimeDisplaySubject
  );

  const feedLookup = evaluate.buildFeedIndex({
    inboundFeed: [
      {
        conversationId: 'truth-conversation-id',
        mailboxAddress: 'kons@hairtpclinic.com',
        subject: 'Noha Haj omar Kontaktformulär',
        counterpart: 'Noha Haj omar',
        preview:
          'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
        sentAt: '2026-04-03T09:00:00.000Z',
      },
    ],
    outboundFeed: [],
  });

  const entries = evaluate.getFeedEntriesForRuntimeRow(
    {
      conversationId: 'legacy-conversation-id',
      mailboxAddress: 'kons@hairtpclinic.com',
      subject: 'Noha Haj omar Kontaktformulär',
      customerName: 'Noha Haj omar',
      latestInboundPreview: '',
    },
    feedLookup
  );

  assert.equal(entries.length, 1);
  assert.match(String(entries[0].preview || ''), /ögonbrynshår/);
});

test('deriveHistoryCustomerName ignorerar okand avsandare och faller tillbaka till subject', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const extractEmailSource = extractFunctionSource(source, 'extractEmail');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const humanizeHistoryCounterpartyEmailSource = extractFunctionSource(
    source,
    'humanizeHistoryCounterpartyEmail'
  );
  const extractHistoryCustomerEmailSource = extractFunctionSource(
    source,
    'extractHistoryCustomerEmail'
  );
  const deriveHistoryCustomerNameSource = extractFunctionSource(
    source,
    'deriveHistoryCustomerName'
  );

  const deriveHistoryCustomerName = new Function(
    'asArray',
    'asText',
    'normalizeKey',
    'normalizeText',
    `${compactRuntimeCopySource}
     ${extractEmailSource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${humanizeHistoryCounterpartyEmailSource}
     ${extractHistoryCustomerEmailSource}
     ${deriveHistoryCustomerNameSource}
     return deriveHistoryCustomerName;`
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
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const customerName = deriveHistoryCustomerName(
    [
      {
        direction: 'inbound',
        senderName: 'Okänd avsändare',
        subject: 'Sivan Bergenstein Kontaktformulär',
      },
    ],
    ['kons@hairtpclinic.com']
  );

  assert.equal(customerName, 'Sivan Bergenstein');
});

test('deriveHistoryCustomerName kan lasa avsandare fran replyhuvud i historikbody', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const deriveHistoryCustomerNameSource = extractFunctionSource(source, 'deriveHistoryCustomerName');

  const deriveHistoryCustomerName = new Function(
    'asArray',
    'asText',
    'deriveRuntimeCustomerNameFromSubject',
    'extractEmail',
    'humanizeHistoryCounterpartyEmail',
    'isRuntimeUnknownCustomerName',
    'looksLikeMailboxIdentity',
    'normalizeKey',
    'normalizeText',
    `${normalizeTextSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${looksLikeMailboxIdentitySource}
     ${deriveHistoryCustomerNameSource}
     return deriveHistoryCustomerName;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') => String(value || '').trim(),
    (value = '') => String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '',
    () => '',
    () => false,
    () => false,
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const customerName = deriveHistoryCustomerName([
    {
      direction: 'inbound',
      senderName: 'Okänd avsändare',
      body:
        'Stort tack! Skickat från Outlook för Mac Från: Alma Persson <alma@example.com> Datum: tisdag, 31 mars 2026 11:38 Till: Marknad | Hair TP Clinic <marknad@hairtpclinic.com> Ämne: Re: 8 månader update',
      subject: '8 månader update',
    },
  ]);

  assert.equal(customerName, 'Alma Persson');
});

test('getQueueHistoryCounterpartyLabel humaniserar extern email nar explicit namn saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const asTextSource = extractFunctionSource(source, 'asText');
  const extractEmailSource = extractFunctionSource(source, 'extractEmail');
  const deriveMailboxLabelSource = extractFunctionSource(source, 'deriveMailboxLabel');
  const humanizeHistoryCounterpartyEmailSource = extractFunctionSource(
    source,
    'humanizeHistoryCounterpartyEmail'
  );
  const getQueueHistoryCounterpartyLabelSource = extractFunctionSource(
    source,
    'getQueueHistoryCounterpartyLabel'
  );

  const getQueueHistoryCounterpartyLabel = new Function(
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${asTextSource}
     ${extractEmailSource}
     ${deriveMailboxLabelSource}
     ${humanizeHistoryCounterpartyEmailSource}
     ${getQueueHistoryCounterpartyLabelSource}
     return getQueueHistoryCounterpartyLabel;`
  )();

  assert.equal(
    getQueueHistoryCounterpartyLabel(
      { senderName: 'info@e.circlekextra.se' },
      'info@e.circlekextra.se',
      'Egzona'
    ),
    'Circlekextra Se'
  );
});

test('getRuntimeCustomerNameFromFeedEntries kan backfylla verkligt senderName nar raden annars ar okand', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const asTextSource = extractFunctionSource(source, 'asText');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const helperSource = extractFunctionSource(source, 'getRuntimeCustomerNameFromFeedEntries');
  const formatDueLabelSource = extractFunctionSource(source, 'formatDueLabel');
  const followUpAgingStateSource = extractFunctionSource(source, 'deriveFollowUpAgingState');

  const getRuntimeCustomerNameFromFeedEntries = new Function(
    'asArray',
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${asTextSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${helperSource}
     return getRuntimeCustomerNameFromFeedEntries;`
  )((value) => (Array.isArray(value) ? value : value == null ? [] : [value]));

  const customerName = getRuntimeCustomerNameFromFeedEntries(
    [
      {
        direction: 'inbound',
        senderName: 'Isak Nyström',
        bodyPreview: 'Hej, jag behöver hjälp med min bokning.',
      },
    ],
    'Okänd kund'
  );

  assert.equal(customerName, 'Isak Nyström');
});

test('buildHistoryBackedRuntimeRow behaller live-row-mailbox som primar proveniens i Kons-scope', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const buildRowSource = extractFunctionSource(source, 'buildHistoryBackedRuntimeRow');

  const normalizeText = new Function(
    `${normalizeTextSource}
     return normalizeText;`
  )();
  const isRuntimePlaceholderLine = new Function(
    'normalizeText',
    `${isRuntimePlaceholderLineSource}
     return isRuntimePlaceholderLine;`
  )(normalizeText);

  const buildHistoryBackedRuntimeRow = new Function(
    'asArray',
    'asNumber',
    'asText',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'compareHistoryEventsDesc',
    'deriveHistoryCustomerName',
    'deriveHistoryEngagementScore',
    'deriveHistoryPriorityLevel',
    'deriveHistorySlaStatus',
    'deriveHistoryThreadTags',
    'extractCustomerEmail',
    'extractHistoryCustomerEmail',
    'getRuntimeCustomerName',
    'isRuntimePlaceholderLine',
    'normalizeKey',
    'normalizeText',
    'toIso',
    `${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${buildRowSource}
     return buildHistoryBackedRuntimeRow;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => 'notification/system_notice',
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (left, right) => Date.parse(String(right?.sentAt || '')) - Date.parse(String(left?.sentAt || '')),
    () => 'QA Reply Kons Send [telefon]',
    () => 0.42,
    () => 'low',
    () => 'safe',
    () => ['all'],
    () => '',
    () => '',
    () => 'QA Reply Kons Send [telefon]',
    isRuntimePlaceholderLine,
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    normalizeText,
    (value) => String(value || '')
  );

  const row = buildHistoryBackedRuntimeRow({
    conversationId: 'conv-fazli-proveniens',
    liveRow: {
      mailboxAddress: 'kons@hairtpclinic.com',
      owner: 'Oägd',
    },
    messages: [
      {
        messageId: 'hist-1',
        direction: 'inbound',
        sentAt: '2026-04-02T13:24:00.000Z',
        mailboxAddress: 'fazli@hairtpclinic.com',
        subject: 'QA Reply Kons Send [telefon]',
        bodyPreview: 'Fazli, Tack för ditt meddelande',
        customerIdentity: {
          canonicalCustomerId: 'cust-1',
          canonicalContactId: 'contact-1',
          explicitMergeGroupId: 'merge-1',
          verifiedPersonalEmailNormalized: 'patient@example.com',
          verifiedPhoneE164: '+46701234567',
          identitySource: 'backend',
          identityConfidence: 'strong',
          provenance: {
            source: 'backend',
            mailboxIds: ['kons@hairtpclinic.com'],
            conversationIds: ['conv-fazli-proveniens'],
            sourceRecordIds: ['hist-1'],
          },
        },
        hardConflictSignals: [
          { type: 'email', left: 'patient@example.com', right: 'patient@example.com', reason: 'match' },
        ],
        mergeReviewDecisionsByPairId: {
          'pair-1': { decision: 'dismissed' },
        },
        identityProvenance: {
          source: 'backend',
          mailboxIds: ['kons@hairtpclinic.com'],
          conversationIds: ['conv-fazli-proveniens'],
          sourceRecordIds: ['hist-1'],
        },
      },
    ],
  });

  assert.equal(row.mailboxAddress, 'kons@hairtpclinic.com');
  assert.equal(row.mailboxId, 'kons@hairtpclinic.com');
  assert.equal(row.customerIdentity?.canonicalCustomerId, 'cust-1');
  assert.equal(row.hardConflictSignals?.length, 1);
  assert.equal(row.mergeReviewDecisionsByPairId?.['pair-1']?.decision, 'dismissed');
  assert.equal(row.identityProvenance?.source, 'backend');
});

test('buildHistoryBackedRuntimeRow prioriterar canonical preview fran mail foundation over legacy bodyPreview', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const buildRowSource = extractFunctionSource(source, 'buildHistoryBackedRuntimeRow');

  const normalizeText = new Function(
    `${normalizeTextSource}
     return normalizeText;`
  )();
  const isRuntimePlaceholderLine = new Function(
    'normalizeText',
    `${isRuntimePlaceholderLineSource}
     return isRuntimePlaceholderLine;`
  )(normalizeText);

  const buildHistoryBackedRuntimeRow = new Function(
    'asArray',
    'asNumber',
    'asText',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'compareHistoryEventsDesc',
    'deriveHistoryCustomerName',
    'deriveHistoryEngagementScore',
    'deriveHistoryPriorityLevel',
    'deriveHistorySlaStatus',
    'deriveHistoryThreadTags',
    'extractCustomerEmail',
    'extractHistoryCustomerEmail',
    'getRuntimeCustomerName',
    'isRuntimePlaceholderLine',
    'normalizeKey',
    'normalizeText',
    'toIso',
    `${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${buildRowSource}
     return buildHistoryBackedRuntimeRow;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => 'human_mail',
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (left, right) => Date.parse(String(right?.sentAt || '')) - Date.parse(String(left?.sentAt || '')),
    () => 'Vincent',
    () => 0.42,
    () => 'low',
    () => 'safe',
    () => ['all'],
    () => '',
    () => '',
    () => 'Vincent',
    isRuntimePlaceholderLine,
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    normalizeText,
    (value) => String(value || '')
  );

  const row = buildHistoryBackedRuntimeRow({
    conversationId: 'conv-foundation-preview',
    liveRow: {
      mailboxAddress: 'contact@hairtpclinic.com',
      owner: 'Oägd',
    },
    messages: [
      {
        messageId: 'hist-foundation-1',
        direction: 'inbound',
        sentAt: '2026-04-08T13:24:00.000Z',
        mailboxAddress: 'contact@hairtpclinic.com',
        subject: 'Till Exona',
        bodyPreview: 'Legacy preview ska inte vinna',
        mailDocument: {
          previewText: 'Legacy document preview ska inte vinna först',
        },
        mailThreadMessage: {
          presentation: {
            previewText: 'Canonical preview från history foundation',
          },
        },
      },
    ],
  });

  assert.equal(row.latestInboundPreview, 'Canonical preview från history foundation');
  assert.equal(row.bodyPreview, 'Canonical preview från history foundation');
});

test('buildHistoryConversationKey prioriterar mailboxConversationId for live-prefixade historiktraffar', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'buildHistoryConversationKey');

  const buildHistoryConversationKey = new Function(
    'asText',
    'extractEmail',
    'normalizeKey',
    `${functionSource}
     return buildHistoryConversationKey;`
  )(
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => {
      const text = String(value || '').trim().toLowerCase();
      const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      return match ? match[0] : '';
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
  );

  const key = buildHistoryConversationKey({
    mailboxConversationId:
      'marknad@hairtpclinic.com:AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
    conversationId: 'AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
    mailboxId: 'marknad@hairtpclinic.com',
  });

  assert.equal(
    key,
    'marknad@hairtpclinic.com:AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8='
  );
});

test('buildLiveThreads historikbackfillar live-rader nar conversationId bara skiljer i mailbox-prefix eller case', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'buildLiveThreads');

  const buildLiveThreads = new Function(
    'asArray',
    'asText',
    'buildFallbackRowsFromFeed',
    'buildFeedIndex',
    'buildClientThreadDocumentFromHistoryMessages',
    'buildHistoryBackedRuntimeRow',
    'buildHistoryConversationKey',
    'buildHistoryFeedEntries',
    'buildHistoryRuntimeEvents',
    'deriveRuntimeTags',
    'buildRuntimeThread',
    'getFeedEntriesForRuntimeRow',
    'normalizeKey',
    'normalizeRuntimeConversationId',
    'titleCaseMailbox',
    `${functionSource}
     return buildLiveThreads;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    () => [],
    () => new Map(),
    (messages = [], { conversationId = '' } = {}) => ({
      kind: 'mail_thread_document',
      conversationId,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      messages: Array.isArray(messages) ? messages : [],
    }),
    ({ conversationId, liveRow, messages }) => ({
      ...(liveRow || {}),
      conversationId,
      sender: messages[0]?.senderName || 'okänd avsändare',
      latestInboundPreview: messages[0]?.bodyPreview || 'Ingen förhandsvisning tillgänglig.',
      historyBacked: true,
    }),
    (message = {}) => {
      const mailboxConversationId = String(message?.mailboxConversationId || '').trim();
      if (mailboxConversationId) return mailboxConversationId;
      const conversationId = String(message?.conversationId || '').trim();
      const mailboxId = String(message?.mailboxId || '').trim().toLowerCase();
      return mailboxId && conversationId && !conversationId.includes(':')
        ? `${mailboxId}:${conversationId}`
        : conversationId;
    },
    (messages = []) => messages,
    (events = []) => events,
    (row = {}) => {
      const tags = ['all'];
      const workflowLane = String(row?.workflowLane || '').trim().toLowerCase();
      const priorityLevel = String(row?.priorityLevel || '').trim().toLowerCase();
      const slaStatus = String(row?.slaStatus || '').trim().toLowerCase();
      if (
        workflowLane === 'waiting_reply' ||
        String(row?.waitingOn || '').trim().toLowerCase() === 'customer'
      ) {
        tags.push('later', 'followup');
      }
      if (
        workflowLane === 'booking_ready' ||
        String(row?.bookingState || '').trim().toLowerCase().includes('ready')
      ) {
        tags.push('bookable');
      }
      if (workflowLane === 'medical_review' || row?.needsMedicalReview === true) tags.push('medical');
      if (workflowLane === 'admin_low') tags.push('admin');
      if (['critical', 'high'].includes(priorityLevel)) tags.push('sprint');
      if (slaStatus === 'breach' || workflowLane === 'action_now') tags.push('act-now', 'today');
      else if (slaStatus === 'warning') tags.push('today');
      if (!String(row?.owner || '').trim()) tags.push('unassigned');
      if (slaStatus === 'breach' || Number(row?.riskStackScore || 0) >= 0.6) tags.push('high-risk');
      return tags;
    },
    (row, options = {}) => ({
      id: row?.conversationId,
      sender: row?.sender,
      preview: row?.latestInboundPreview,
      historyBacked: row?.historyBacked === true,
      historyMessageCount: Array.isArray(options?.feedEntries) ? options.feedEntries.length : 0,
    }),
    () => [],
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => String(value || '').trim()
  );

  const threads = buildLiveThreads(
    {
      needsReplyToday: [
        {
          conversationId:
            'Marknad@hairtpclinic.com:AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
          sender: 'okänd avsändare',
          latestInboundPreview: 'Ingen förhandsvisning tillgänglig.',
        },
      ],
    },
    {
      historyMessages: [
        {
          mailboxConversationId:
            'marknad@hairtpclinic.com:AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
          conversationId:
            'AAQkAGQzNWNiYWVkLTFiNzUtNDY4NC1hNWJhLWUzYzc1NjAzMDZjNgAQAL0wbM_Erd5Op_O39VIZIv8=',
          mailboxId: 'marknad@hairtpclinic.com',
          senderName: 'Alma Persson',
          bodyPreview: 'Hej! Absolut, här kommer den.',
        },
      ],
      historyEvents: [],
    }
  );

  assert.equal(threads.length, 1);
  assert.equal(threads[0].historyBacked, true);
  assert.equal(threads[0].sender, 'Alma Persson');
  assert.equal(threads[0].preview, 'Hej! Absolut, här kommer den.');
});

test('truth primary row anvander detail som preview fallback nar preview saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const buildRowSource = extractFunctionSource(source, 'buildTruthPrimaryRuntimeRow');

  const buildTruthPrimaryRuntimeRow = new Function(
    'WORKLIST_TRUTH_PRIMARY',
    'asArray',
    'asNumber',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    `${isRuntimePlaceholderLineSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${buildRowSource}
     return buildTruthPrimaryRuntimeRow;`
  )(
    { limit: 120 },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  const row = buildTruthPrimaryRuntimeRow({
    id: 'truth-noha-key',
    lane: 'all',
    subject: 'Noha Haj omar Kontaktformulär',
    preview: 'Ingen förhandsvisning tillgänglig.',
    detail:
      'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
    conversation: {
      key: 'truth-noha-key',
      conversationId: 'truth-noha-conversation',
    },
    mailbox: {
      mailboxId: 'kons@hairtpclinic.com',
      ownershipMailbox: 'kons@hairtpclinic.com',
    },
    customer: {
      email: 'noha@example.com',
      name: 'Noha Haj omar',
    },
    timing: {
      latestMessageAt: '2026-04-03T10:00:00.000Z',
      lastInboundAt: '2026-04-03T09:00:00.000Z',
      lastOutboundAt: '2026-04-03T08:00:00.000Z',
    },
    state: {
      hasUnreadInbound: true,
      needsReply: true,
      messageCount: 1,
    },
  });

  assert.match(row.latestInboundPreview, /ögonbrynshår/);
  assert.match(row.preview, /ögonbrynshår/);
});

test('buildRuntimeThread backfyller customerName fran feedEntries nar raden annars ar okand', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const asTextSource = extractFunctionSource(source, 'asText');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const helperSource = extractFunctionSource(source, 'getRuntimeCustomerNameFromFeedEntries');
  const formatDueLabelSource = extractFunctionSource(source, 'formatDueLabel');
  const followUpAgingStateSource = extractFunctionSource(source, 'deriveFollowUpAgingState');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const deriveRuntimeRelevantActivityAtSource = extractFunctionSource(
    source,
    'deriveRuntimeRelevantActivityAt'
  );
  const buildClientThreadDocumentFromPreviewMessagesSource = extractFunctionSource(
    source,
    'buildClientThreadDocumentFromPreviewMessages'
  );
  const resolveRuntimeFoundationStateSource = extractFunctionSource(
    source,
    'resolveRuntimeFoundationState'
  );
  const buildRuntimeThreadSource = extractFunctionSource(source, 'buildRuntimeThread');

  const buildRuntimeThread = new Function(
    'asArray',
    'asNumber',
    'asText',
    'buildAvatarDataUri',
    'buildMailboxCatalog',
    'buildPreviewMessages',
    'buildRuntimeSummaryCards',
    'buildHistoryEvents',
    'buildRuntimeDisplaySubject',
    'clamp',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'derivePrimaryRuntimeLane',
    'deriveRuntimeTags',
    'extractCustomerEmail',
    'formatListTime',
    'getRuntimeCustomerName',
    'humanizeCode',
    'isRuntimePlaceholderLine',
    'isVerificationRuntimeThread',
    'mapRuntimeDisplayEngagementLabel',
    'mapRuntimeDisplayOwnerLabel',
    'mapRuntimeLifecycleLabel',
    'mapRuntimeNextActionLabel',
    'mapRuntimeRiskLabel',
    'mapRuntimeStatusLabel',
    'mapRuntimeWaitingLabel',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${helperSource}
     ${formatDueLabelSource}
     ${followUpAgingStateSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${deriveRuntimeRelevantActivityAtSource}
     ${buildClientThreadDocumentFromPreviewMessagesSource}
     ${resolveRuntimeFoundationStateSource}
     ${buildRuntimeThreadSource}
     return buildRuntimeThread;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => '',
    (_rows, options = {}) =>
      (Array.isArray(options?.sourceMailboxIds) ? options.sourceMailboxIds : []).map((id) => {
        const local = String(id || '')
          .trim()
          .toLowerCase()
          .split('@')[0];
        return {
          id,
          label: local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox',
        };
      }),
    () => [],
    () => [],
    () => [],
    (row) => String(row?.subject || ''),
    (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
    () => 'human_mail',
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => 'all',
    () => ['all'],
    () => '',
    () => 'Nu',
    () => 'Okänd kund',
    (_value, fallback = '-') => fallback,
    () => false,
    () => false,
    () => 'Stabil aktivitet',
    (value) => String(value || '').trim() || 'Ej tilldelad',
    () => 'Aktiv dialog',
    () => 'Granska tråden',
    () => 'Safe',
    () => 'Behöver åtgärd',
    () => 'Behöver åtgärd',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    },
    (value) => String(value || '')
  );

  const thread = buildRuntimeThread(
    {
      conversationId: 'conv-identity-gap',
      subject: 'Ang',
      customerName: 'Okänd avsändare',
      senderName: 'Okänd avsändare',
      mailboxAddress: 'kons@hairtpclinic.com',
      owner: '',
      customerIdentity: {
        canonicalCustomerId: 'cust-rt-1',
        canonicalContactId: 'contact-rt-1',
        explicitMergeGroupId: 'merge-rt-1',
        verifiedPersonalEmailNormalized: 'vincent@example.com',
        verifiedPhoneE164: '+46701230000',
        identitySource: 'backend',
        identityConfidence: 'strong',
        provenance: {
          source: 'backend',
          mailboxIds: ['kons@hairtpclinic.com'],
          conversationIds: ['conv-identity-gap'],
          sourceRecordIds: ['row-1'],
        },
      },
      hardConflictSignals: [
        { type: 'email', left: 'vincent@example.com', right: 'vincent@example.com', reason: 'match' },
      ],
      mergeReviewDecisionsByPairId: {
        'pair-rt-1': { decision: 'dismissed' },
      },
      identityProvenance: {
        source: 'backend',
        mailboxIds: ['kons@hairtpclinic.com'],
        conversationIds: ['conv-identity-gap'],
        sourceRecordIds: ['row-1'],
      },
      customerSummary: {
        historyMailboxIds: ['egzona@hairtpclinic.com', 'fazli@hairtpclinic.com'],
      },
      lastInboundAt: '2026-04-02T13:24:00.000Z',
      lastOutboundAt: '2026-04-02T11:24:00.000Z',
    },
    {
      feedEntries: [
        {
          messageId: 'feed-identity-1',
          direction: 'inbound',
          senderName: 'Isak Nyström',
          bodyPreview: 'Hej, jag behöver hjälp med min bokning.',
          sentAt: '2026-04-02T13:24:00.000Z',
        },
      ],
      historyEvents: [],
    }
  );

  assert.equal(thread.customerName, 'Isak Nyström');
  assert.equal(thread.mailboxProvenanceLabel, '2 mailboxar');
  assert.match(thread.mailboxProvenanceDetail, /Egzona/);
  assert.match(thread.mailboxProvenanceDetail, /Fazli/);
  assert.equal(thread.customerIdentity?.canonicalCustomerId, 'cust-rt-1');
  assert.equal(thread.hardConflictSignals?.length, 1);
  assert.equal(thread.mergeReviewDecisionsByPairId?.['pair-rt-1']?.decision, 'dismissed');
  assert.equal(thread.identityProvenance?.source, 'backend');
});

test('buildRuntimeThread markerar åldrad reply som följ upp nu', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const helperSource = extractFunctionSource(source, 'getRuntimeCustomerNameFromFeedEntries');
  const formatDueLabelSource = extractFunctionSource(source, 'formatDueLabel');
  const followUpAgingStateSource = extractFunctionSource(source, 'deriveFollowUpAgingState');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const deriveRuntimeRelevantActivityAtSource = extractFunctionSource(
    source,
    'deriveRuntimeRelevantActivityAt'
  );
  const buildClientThreadDocumentFromPreviewMessagesSource = extractFunctionSource(
    source,
    'buildClientThreadDocumentFromPreviewMessages'
  );
  const resolveRuntimeFoundationStateSource = extractFunctionSource(
    source,
    'resolveRuntimeFoundationState'
  );
  const buildRuntimeThreadSource = extractFunctionSource(source, 'buildRuntimeThread');

  const buildRuntimeThread = new Function(
    'asArray',
    'asNumber',
    'asText',
    'buildAvatarDataUri',
    'buildMailboxCatalog',
    'buildPreviewMessages',
    'buildRuntimeSummaryCards',
    'buildHistoryEvents',
    'buildRuntimeDisplaySubject',
    'clamp',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'derivePrimaryRuntimeLane',
    'deriveRuntimeTags',
    'extractCustomerEmail',
    'formatListTime',
    'getRuntimeCustomerName',
    'humanizeCode',
    'isRuntimePlaceholderLine',
    'isVerificationRuntimeThread',
    'mapRuntimeDisplayEngagementLabel',
    'mapRuntimeDisplayOwnerLabel',
    'mapRuntimeLifecycleLabel',
    'mapRuntimeNextActionLabel',
    'mapRuntimeRiskLabel',
    'mapRuntimeStatusLabel',
    'mapRuntimeWaitingLabel',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${helperSource}
     ${formatDueLabelSource}
     ${followUpAgingStateSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${deriveRuntimeRelevantActivityAtSource}
     ${buildClientThreadDocumentFromPreviewMessagesSource}
     ${resolveRuntimeFoundationStateSource}
     ${buildRuntimeThreadSource}
     return buildRuntimeThread;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => '',
    () => [],
    () => [],
    () => [],
    () => [],
    (row) => String(row?.subject || ''),
    (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
    () => 'human_mail',
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => 'all',
    () => ['all'],
    () => '',
    () => 'Nu',
    () => 'Okänd kund',
    (_value, fallback = '-') => fallback,
    () => false,
    () => false,
    () => 'Stabil aktivitet',
    (value) => String(value || '').trim() || 'Ej tilldelad',
    () => 'Aktiv dialog',
    () => 'Granska tråden',
    () => 'Safe',
    () => 'Behöver åtgärd',
    () => 'Behöver åtgärd',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    },
    (value) => String(value || '')
  );

  const agedThread = buildRuntimeThread(
    {
      conversationId: 'conv-followup-aging',
      subject: 'Återkoppling',
      customerName: 'Kund',
      senderName: 'Kund',
      mailboxAddress: 'kons@hairtpclinic.com',
      owner: 'Sara',
      waitingOn: 'customer',
      statusLabel: 'Besvarad',
      nextActionLabel: 'Invänta svar',
      lastOutboundAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    },
    {
      feedEntries: [],
      historyEvents: [],
    }
  );

  assert.equal(agedThread.followUpAgeLabel, '48h inaktiv');
  assert.equal(agedThread.nextActionLabel, 'Följ upp nu');
  assert.ok(agedThread.tags.includes('followup'));
  assert.ok(agedThread.tags.includes('today'));
});

test('buildRuntimeThread backfyller customerName fran radens senaste messagebody nar feedEntries saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const helperSource = extractFunctionSource(source, 'getRuntimeCustomerNameFromFeedEntries');
  const formatDueLabelSource = extractFunctionSource(source, 'formatDueLabel');
  const followUpAgingStateSource = extractFunctionSource(source, 'deriveFollowUpAgingState');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const deriveRuntimeRelevantActivityAtSource = extractFunctionSource(
    source,
    'deriveRuntimeRelevantActivityAt'
  );
  const buildClientThreadDocumentFromPreviewMessagesSource = extractFunctionSource(
    source,
    'buildClientThreadDocumentFromPreviewMessages'
  );
  const resolveRuntimeFoundationStateSource = extractFunctionSource(
    source,
    'resolveRuntimeFoundationState'
  );
  const buildRuntimeThreadSource = extractFunctionSource(source, 'buildRuntimeThread');

  const getRuntimeCustomerName = new Function(
    'asText',
    'normalizeKey',
    'normalizeText',
    `${extractFunctionSource(source, 'compactRuntimeCopy')}
     ${extractFunctionSource(source, 'normalizeRuntimeDisplaySubject')}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     return getRuntimeCustomerName;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const buildRuntimeThread = new Function(
    'asArray',
    'asNumber',
    'asText',
    'buildAvatarDataUri',
    'buildMailboxCatalog',
    'buildPreviewMessages',
    'buildRuntimeSummaryCards',
    'buildHistoryEvents',
    'buildRuntimeDisplaySubject',
    'clamp',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'derivePrimaryRuntimeLane',
    'deriveRuntimeTags',
    'extractCustomerEmail',
    'formatListTime',
    'getRuntimeCustomerName',
    'humanizeCode',
    'isRuntimePlaceholderLine',
    'isVerificationRuntimeThread',
    'mapRuntimeDisplayEngagementLabel',
    'mapRuntimeDisplayOwnerLabel',
    'mapRuntimeLifecycleLabel',
    'mapRuntimeNextActionLabel',
    'mapRuntimeRiskLabel',
    'mapRuntimeStatusLabel',
    'mapRuntimeWaitingLabel',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${helperSource}
     ${formatDueLabelSource}
     ${followUpAgingStateSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${deriveRuntimeRelevantActivityAtSource}
     ${buildClientThreadDocumentFromPreviewMessagesSource}
     ${resolveRuntimeFoundationStateSource}
     ${buildRuntimeThreadSource}
     return buildRuntimeThread;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => '',
    () => [],
    () => [],
    () => [],
    () => [],
    (row) => String(row?.subject || ''),
    (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
    () => 'human_mail',
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => 'all',
    () => ['all'],
    () => '',
    () => 'Nu',
    getRuntimeCustomerName,
    (_value, fallback = '-') => fallback,
    () => false,
    () => false,
    () => 'Stabil aktivitet',
    (value) => String(value || '').trim() || 'Ej tilldelad',
    () => 'Aktiv dialog',
    () => 'Granska tråden',
    () => 'Safe',
    () => 'Behöver åtgärd',
    () => 'Behöver åtgärd',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    },
    (value) => String(value || '')
  );

  const thread = buildRuntimeThread(
    {
      conversationId: 'conv-body-identity-gap',
      subject: '8 månader update',
      customerName: 'Okänd avsändare',
      senderName: 'Okänd avsändare',
      mailboxAddress: 'marknad@hairtpclinic.com',
      owner: '',
      latestMessage: {
        body: 'Stort tack! Skickat från Outlook för Mac Från: Alma Persson <alma@example.com> Datum: tisdag, 31 mars 2026 11:38 Till: Marknad | Hair TP Clinic <marknad@hairtpclinic.com> Ämne: Re: 8 månader update',
      },
      lastInboundAt: '2026-03-31T11:38:00.000Z',
      lastOutboundAt: '2026-03-31T09:20:00.000Z',
    },
    {
      feedEntries: [],
      historyEvents: [],
    }
  );

  assert.equal(thread.customerName, 'Alma Persson');
});

test('buildRuntimeThread skickar canonical threadDocument vidare till buildPreviewMessages i foundation cutover', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(
    source,
    /const messages = buildPreviewMessages\(row,\s*feedEntries,\s*threadDocument\);/
  );
});

test('buildRuntimeThread prioriterar canonical preview och senaste aktivitet fran threadDocument i foundation cutover', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const helperSource = extractFunctionSource(source, 'getRuntimeCustomerNameFromFeedEntries');
  const formatDueLabelSource = extractFunctionSource(source, 'formatDueLabel');
  const followUpAgingStateSource = extractFunctionSource(source, 'deriveFollowUpAgingState');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const deriveRuntimeRelevantActivityAtSource = extractFunctionSource(
    source,
    'deriveRuntimeRelevantActivityAt'
  );
  const buildClientThreadDocumentFromPreviewMessagesSource = extractFunctionSource(
    source,
    'buildClientThreadDocumentFromPreviewMessages'
  );
  const resolveRuntimeFoundationStateSource = extractFunctionSource(
    source,
    'resolveRuntimeFoundationState'
  );
  const buildRuntimeThreadSource = extractFunctionSource(source, 'buildRuntimeThread');

  const buildRuntimeThread = new Function(
    'asArray',
    'asNumber',
    'asText',
    'buildAvatarDataUri',
    'buildMailboxCatalog',
    'buildPreviewMessages',
    'buildRuntimeSummaryCards',
    'buildHistoryEvents',
    'buildRuntimeDisplaySubject',
    'clamp',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'derivePrimaryRuntimeLane',
    'deriveRuntimeTags',
    'extractCustomerEmail',
    'formatListTime',
    'getRuntimeCustomerName',
    'humanizeCode',
    'isRuntimePlaceholderLine',
    'isVerificationRuntimeThread',
    'mapRuntimeDisplayEngagementLabel',
    'mapRuntimeDisplayOwnerLabel',
    'mapRuntimeLifecycleLabel',
    'mapRuntimeNextActionLabel',
    'mapRuntimeRiskLabel',
    'mapRuntimeStatusLabel',
    'mapRuntimeWaitingLabel',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${helperSource}
     ${formatDueLabelSource}
     ${followUpAgingStateSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${deriveRuntimeRelevantActivityAtSource}
     ${buildClientThreadDocumentFromPreviewMessagesSource}
     ${resolveRuntimeFoundationStateSource}
     ${buildRuntimeThreadSource}
     return buildRuntimeThread;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => '',
    () => [],
    () => [
      {
        author: 'Vincent',
        role: 'customer',
        body: 'Canonical preview från foundation',
        conversationBody: 'Canonical body från foundation',
      },
    ],
    () => [],
    () => [],
    (row) => String(row?.subject || ''),
    (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
    () => 'human_mail',
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => 'all',
    () => ['all'],
    () => '',
    (value) => String(value || ''),
    (row) => String(row?.customerName || ''),
    (_value, fallback = '-') => fallback,
    () => false,
    () => false,
    () => 'Stabil aktivitet',
    (value) => String(value || '').trim() || 'Ej tilldelad',
    () => 'Aktiv dialog',
    () => 'Granska tråden',
    () => 'Safe',
    () => 'Behöver åtgärd',
    () => 'Behöver åtgärd',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    },
    (value) => String(value || '')
  );

  const thread = buildRuntimeThread(
    {
      conversationId: 'conv-thread-cutover',
      subject: 'Till Exona',
      customerName: 'Vincent',
      senderName: 'Vincent',
      mailboxAddress: 'contact@hairtpclinic.com',
      owner: '',
      latestInboundPreview: 'Legacy row preview ska inte vinna',
      lastInboundAt: '2026-04-08T10:00:00.000Z',
      lastOutboundAt: '2026-04-08T09:00:00.000Z',
    },
    {
      feedEntries: [],
      historyEvents: [],
      threadDocument: {
        messages: [
          {
            sentAt: '2026-04-08T13:15:00.000Z',
          },
        ],
      },
    }
  );

  assert.match(thread.preview, /Canonical preview från foundation/i);
  assert.equal(thread.lastActivityAt, '2026-04-08T13:15:00.000Z');
});

test('buildRuntimeThread materialiserar client threadDocument fran canonical preview-messages nar top-level threadDocument saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const normalizeKeySource = extractFunctionSource(source, 'normalizeKey');
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const helperSource = extractFunctionSource(source, 'getRuntimeCustomerNameFromFeedEntries');
  const formatDueLabelSource = extractFunctionSource(source, 'formatDueLabel');
  const followUpAgingStateSource = extractFunctionSource(source, 'deriveFollowUpAgingState');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const deriveRuntimeRelevantActivityAtSource = extractFunctionSource(
    source,
    'deriveRuntimeRelevantActivityAt'
  );
  const buildClientThreadDocumentFromPreviewMessagesSource = extractFunctionSource(
    source,
    'buildClientThreadDocumentFromPreviewMessages'
  );
  const resolveRuntimeFoundationStateSource = extractFunctionSource(
    source,
    'resolveRuntimeFoundationState'
  );
  const buildRuntimeThreadSource = extractFunctionSource(source, 'buildRuntimeThread');

  const buildRuntimeThread = new Function(
    'asArray',
    'asNumber',
    'asText',
    'buildAvatarDataUri',
    'buildMailboxCatalog',
    'buildPreviewMessages',
    'buildRuntimeSummaryCards',
    'buildHistoryEvents',
    'buildRuntimeDisplaySubject',
    'clamp',
    'classifyRuntimeRowFamily',
    'compactRuntimeCopy',
    'derivePrimaryRuntimeLane',
    'deriveRuntimeTags',
    'extractCustomerEmail',
    'formatListTime',
    'getRuntimeCustomerName',
    'humanizeCode',
    'isRuntimePlaceholderLine',
    'isVerificationRuntimeThread',
    'mapRuntimeDisplayEngagementLabel',
    'mapRuntimeDisplayOwnerLabel',
    'mapRuntimeLifecycleLabel',
    'mapRuntimeNextActionLabel',
    'mapRuntimeRiskLabel',
    'mapRuntimeStatusLabel',
    'mapRuntimeWaitingLabel',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    'toIso',
    `${normalizeTextSource}
     ${normalizeKeySource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimeUnknownCustomerNameSource}
     ${helperSource}
     ${formatDueLabelSource}
     ${followUpAgingStateSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${deriveRuntimeRelevantActivityAtSource}
     ${buildClientThreadDocumentFromPreviewMessagesSource}
     ${resolveRuntimeFoundationStateSource}
     ${buildRuntimeThreadSource}
     return buildRuntimeThread;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => '',
    () => [],
    () => [
      {
        messageId: 'msg-foundation-1',
        author: 'Vincent',
        role: 'customer',
        body: 'Canonical preview från foundation messages',
        conversationBody: 'Canonical body från foundation messages',
        mailDocument: {
          sourceStore: 'graph_runtime',
          previewText: 'Canonical document preview',
        },
        mailThreadMessage: {
          version: 'phase_3',
          sourceStore: 'graph_runtime',
          messageId: 'msg-foundation-1',
          sentAt: '2026-04-08T15:18:00.000Z',
          conversationId: 'conv-foundation-messages',
          direction: 'inbound',
          presentation: {
            previewText: 'Canonical preview från foundation messages',
            conversationText: 'Canonical conversation text från foundation messages',
          },
          primaryBody: {
            text: 'Canonical primary body från foundation messages',
          },
        },
      },
    ],
    () => [],
    () => [],
    (row) => String(row?.subject || ''),
    (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
    () => 'human_mail',
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => 'all',
    () => ['all'],
    () => '',
    (_value, fallback = '-') => fallback,
    () => 'Vincent',
    (_value, fallback = '-') => fallback,
    () => false,
    () => false,
    () => 'Stabil aktivitet',
    (value) => String(value || '').trim() || 'Ej tilldelad',
    () => 'Aktiv dialog',
    () => 'Granska tråden',
    () => 'Safe',
    () => 'Behöver åtgärd',
    () => 'Behöver åtgärd',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    },
    (value) => String(value || '')
  );

  const thread = buildRuntimeThread(
    {
      conversationId: 'conv-foundation-messages',
      subject: 'Till Exona',
      customerName: 'Vincent',
      senderName: 'Vincent',
      mailboxAddress: 'contact@hairtpclinic.com',
      owner: '',
      latestInboundPreview: 'Legacy row preview ska inte vinna',
      lastInboundAt: '2026-04-08T10:00:00.000Z',
      lastOutboundAt: '2026-04-08T09:00:00.000Z',
    },
    {
      feedEntries: [],
      historyEvents: [],
    }
  );

  assert.equal(thread.threadDocument?.kind, 'mail_thread_document');
  assert.equal(thread.threadDocument?.messageCount, 1);
  assert.equal(thread.foundationState?.source, 'graph_runtime');
  assert.equal(thread.foundationState?.messageCount, 1);
  assert.match(thread.preview, /Canonical preview från foundation messages/i);
  assert.equal(thread.lastActivityAt, '2026-04-08T15:18:00.000Z');
});

test('truth primary row anvander latestInboundPreview nar den finns pa raden', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const buildRowSource = extractFunctionSource(source, 'buildTruthPrimaryRuntimeRow');

  const buildTruthPrimaryRuntimeRow = new Function(
    'WORKLIST_TRUTH_PRIMARY',
    'asArray',
    'asNumber',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    `${isRuntimePlaceholderLineSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${buildRowSource}
     return buildTruthPrimaryRuntimeRow;`
  )(
    { limit: 120 },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  const row = buildTruthPrimaryRuntimeRow({
    id: 'truth-noha-latest-preview',
    lane: 'all',
    subject: 'Noha Haj omar Kontaktformulär',
    latestInboundPreview:
      'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
    conversation: {
      key: 'truth-noha-latest-preview',
      conversationId: 'truth-noha-latest-preview',
    },
    mailbox: {
      mailboxId: 'kons@hairtpclinic.com',
      ownershipMailbox: 'kons@hairtpclinic.com',
    },
    customer: {
      email: 'noha@example.com',
      name: 'Noha Haj omar',
    },
    timing: {
      latestMessageAt: '2026-04-03T10:00:00.000Z',
      lastInboundAt: '2026-04-03T09:00:00.000Z',
      lastOutboundAt: '2026-04-03T08:00:00.000Z',
    },
    state: {
      hasUnreadInbound: true,
      needsReply: true,
      messageCount: 1,
    },
  });

  assert.match(row.latestInboundPreview, /ögonbrynshår/);
  assert.match(row.preview, /ögonbrynshår/);
});

test('truth primary row anvander latestMessage-bodyHtml nar ovriga previewfalt ar tomma', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const buildRowSource = extractFunctionSource(source, 'buildTruthPrimaryRuntimeRow');

  const buildTruthPrimaryRuntimeRow = new Function(
    'WORKLIST_TRUTH_PRIMARY',
    'asArray',
    'asNumber',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    `${isRuntimePlaceholderLineSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${buildRowSource}
     return buildTruthPrimaryRuntimeRow;`
  )(
    { limit: 120 },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  const row = buildTruthPrimaryRuntimeRow({
    id: 'truth-noha-body-html',
    lane: 'all',
    subject: 'Noha Haj omar Kontaktformulär',
    preview: '',
    latestInboundPreview: '',
    latestMessage: {
      bodyHtml:
        '<div>Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?</div>',
    },
    conversation: {
      key: 'truth-noha-body-html',
      conversationId: 'truth-noha-body-html',
    },
    mailbox: {
      mailboxId: 'kons@hairtpclinic.com',
      ownershipMailbox: 'kons@hairtpclinic.com',
    },
    customer: {
      email: 'noha@example.com',
      name: 'Noha Haj omar',
    },
    timing: {
      latestMessageAt: '2026-04-03T10:00:00.000Z',
      lastInboundAt: '2026-04-03T09:00:00.000Z',
      lastOutboundAt: '2026-04-03T08:00:00.000Z',
    },
    state: {
      hasUnreadInbound: true,
      needsReply: true,
      messageCount: 1,
    },
  });

  assert.match(row.latestInboundPreview, /ögonbrynshår/);
  assert.match(row.preview, /ögonbrynshår/);
});

test('getUsableRuntimeRowPreview kan backfylla preview fran customerSummary lastCaseSummary', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const getUsableRuntimeRowPreviewSource = extractFunctionSource(
    source,
    'getUsableRuntimeRowPreview'
  );

  const normalizeText = new Function(
    `${normalizeTextSource}
     return normalizeText;`
  )();
  const isRuntimePlaceholderLine = new Function(
    'normalizeText',
    `${isRuntimePlaceholderLineSource}
     return isRuntimePlaceholderLine;`
  )(normalizeText);
  const getUsableRuntimeRowPreview = new Function(
    'asArray',
    'asText',
    'isRuntimePlaceholderLine',
    'normalizeText',
    `${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${getUsableRuntimeRowPreviewSource}
     return getUsableRuntimeRowPreview;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    isRuntimePlaceholderLine,
    normalizeText
  );

  const preview = getUsableRuntimeRowPreview({
    subject: 'Noha Haj omar Kontaktformulär',
    customerSummary: {
      lastCaseSummary:
        'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
    },
  });

  assert.match(preview, /ögonbrynshår/);
});

test('getUsableRuntimeRowPreview prioriterar canonical mail foundation over legacy bodyPreview', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const normalizeTextSource = extractFunctionSource(source, 'normalizeText');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const getUsableRuntimeRowPreviewSource = extractFunctionSource(
    source,
    'getUsableRuntimeRowPreview'
  );

  const normalizeText = new Function(
    `${normalizeTextSource}
     return normalizeText;`
  )();
  const isRuntimePlaceholderLine = new Function(
    'normalizeText',
    `${isRuntimePlaceholderLineSource}
     return isRuntimePlaceholderLine;`
  )(normalizeText);
  const getUsableRuntimeRowPreview = new Function(
    'asArray',
    'asText',
    'isRuntimePlaceholderLine',
    'normalizeText',
    `${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${getUsableRuntimeRowPreviewSource}
     return getUsableRuntimeRowPreview;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    isRuntimePlaceholderLine,
    normalizeText
  );

  const preview = getUsableRuntimeRowPreview({
    bodyPreview: 'Legacy rå preview',
    mailDocument: {
      previewText: 'Canonical preview från mail foundation',
    },
    mailThreadMessage: {
      presentation: {
        previewText: 'Canonical preview från thread foundation',
      },
    },
  });

  assert.equal(preview, 'Canonical preview från thread foundation');
});

test('truth worklist assist rows can be filtered and sorted locally', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const comparableMailboxSource = extractFunctionSource(
    source,
    'getTruthWorklistComparableMailboxIds'
  );
  const visibleRowsSource = extractFunctionSource(source, 'getTruthWorklistVisibleRows');

  const getTruthWorklistVisibleRows = new Function(
    'asArray',
    'normalizeMailboxId',
    'normalizeText',
    `${comparableMailboxSource}
     ${visibleRowsSource}
     return getTruthWorklistVisibleRows;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value = '') => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    (value = '') => (typeof value === 'string' ? value.trim() : '')
  );

  const payload = {
    parityBaseline: {
      comparableMailboxIds: ['contact@hairtpclinic.com', 'info@hairtpclinic.com'],
    },
    rows: [
      {
        subject: 'Third',
        lane: 'all',
        mailbox: { mailboxId: 'info@hairtpclinic.com' },
        state: { hasUnreadInbound: true, needsReply: false },
        timing: {
          latestMessageAt: '2026-04-03T08:00:00.000Z',
          lastInboundAt: '2026-04-03T07:55:00.000Z',
        },
      },
      {
        subject: 'First',
        lane: 'all',
        mailbox: { mailboxId: 'contact@hairtpclinic.com' },
        state: { hasUnreadInbound: true, needsReply: true },
        timing: {
          latestMessageAt: '2026-04-03T10:00:00.000Z',
          lastInboundAt: '2026-04-03T09:55:00.000Z',
        },
      },
      {
        subject: 'Second',
        lane: 'act-now',
        mailbox: { mailboxId: 'marknad@hairtpclinic.com' },
        state: { hasUnreadInbound: false, needsReply: true },
        timing: {
          latestMessageAt: '2026-04-03T09:00:00.000Z',
          lastInboundAt: '2026-04-03T08:50:00.000Z',
        },
      },
    ],
  };

  const comparableOnly = getTruthWorklistVisibleRows(payload, {
    localFilter: 'comparable',
    localSort: 'latest',
  });
  assert.deepEqual(
    comparableOnly.map((item) => item.subject),
    ['First', 'Third']
  );

  const unreadFirst = getTruthWorklistVisibleRows(payload, {
    localFilter: 'all',
    localSort: 'unread',
  });
  assert.deepEqual(
    unreadFirst.map((item) => item.subject),
    ['First', 'Third', 'Second']
  );
});

test('truth worklist relay note keeps legacy steering explicit', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const relayMarkupSource = extractFunctionSource(source, 'buildTruthWorklistRelayNoteMarkup');

  const buildTruthWorklistRelayNoteMarkup = new Function(
    'compactRuntimeCopy',
    'escapeHtml',
    'normalizeText',
    `${relayMarkupSource}
     return buildTruthWorklistRelayNoteMarkup;`
  )(
    (value, fallback = '', max = 92) => {
      const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    (value = '') => (typeof value === 'string' ? value.trim() : '')
  );

  const markup = buildTruthWorklistRelayNoteMarkup({
    mailboxId: 'contact@hairtpclinic.com',
    customerEmail: 'kund@example.com',
    subject: 'Bokningsfråga inför återbesök',
    lane: 'all',
    comparable: true,
  });

  assert.match(markup, /Truth relay/);
  assert.match(markup, /Legacy queue fortfarande styrande/);
  assert.match(markup, /Envägs-relay aktivt/);
  assert.match(markup, /Rensa relay/);
  assert.match(markup, /öppnar inte fokusyta/);
  assert.match(markup, /öppnar inte studio/);
});

test('truth worklist assist view waits for admin auth before loading consumer json', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const waitSource = extractFunctionSource(source, 'waitForTruthWorklistAuthToken');
  const loadSource = extractFunctionSource(source, 'loadTruthWorklistView');

  assert.match(waitSource, /getAdminToken/);
  assert.match(waitSource, /window\.setTimeout/);

  const waitIndex = loadSource.indexOf('await waitForTruthWorklistAuthToken()');
  const requestIndex = loadSource.indexOf('apiRequest(');

  assert.notEqual(waitIndex, -1, 'Truth Worklist Assist View måste vänta in admin-token före consumer-request.');
  assert.notEqual(requestIndex, -1, 'Kunde inte hitta consumer-requesten för Truth Worklist Assist View.');
  assert.ok(
    waitIndex < requestIndex,
    'Truth Worklist Assist View ska vänta in admin-token innan consumer-requesten skickas.'
  );
  assert.match(loadSource, /authRequired:\s*true/);
  assert.match(loadSource, /Logga in igen i admin/);
});

test('truth worklist assist scope falls back to comparable baseline when queue scope is not comparable', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const baselineSource = extractFunctionSource(
    source,
    'getTruthWorklistComparableBaselineMailboxIds'
  );
  const resolveSource = extractFunctionSource(source, 'resolveTruthWorklistScope');

  const resolveTruthWorklistScope = new Function(
    'asArray',
    'canonicalizeRuntimeMailboxId',
    'getCanonicalAvailableRuntimeMailboxIds',
    'getQueueHistoryScopeIds',
    'WORKLIST_TRUTH_VIEW',
    `${baselineSource}
     ${resolveSource}
     return resolveTruthWorklistScope;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value = '') => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    () => [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
    ],
    () => ['kons@hairtpclinic.com'],
    {
      comparableBaselineMailboxIds: [
        'egzona@hairtpclinic.com',
        'contact@hairtpclinic.com',
        'fazli@hairtpclinic.com',
        'info@hairtpclinic.com',
      ],
    }
  );

  const resolved = resolveTruthWorklistScope();

  assert.equal(resolved.scopeMode, 'comparable_baseline');
  assert.deepEqual(resolved.mailboxIds, [
    'egzona@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'info@hairtpclinic.com',
  ]);
});

test('truth worklist assist scope keeps queue scope when it already includes comparable mailboxes', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const baselineSource = extractFunctionSource(
    source,
    'getTruthWorklistComparableBaselineMailboxIds'
  );
  const resolveSource = extractFunctionSource(source, 'resolveTruthWorklistScope');

  const resolveTruthWorklistScope = new Function(
    'asArray',
    'canonicalizeRuntimeMailboxId',
    'getCanonicalAvailableRuntimeMailboxIds',
    'getQueueHistoryScopeIds',
    'WORKLIST_TRUTH_VIEW',
    `${baselineSource}
     ${resolveSource}
     return resolveTruthWorklistScope;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value = '') => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    () => [
      'egzona@hairtpclinic.com',
      'contact@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
    ],
    () => ['contact@hairtpclinic.com'],
    {
      comparableBaselineMailboxIds: [
        'egzona@hairtpclinic.com',
        'contact@hairtpclinic.com',
        'fazli@hairtpclinic.com',
        'info@hairtpclinic.com',
      ],
    }
  );

  const resolved = resolveTruthWorklistScope();

  assert.equal(resolved.scopeMode, 'queue_scope');
  assert.deepEqual(resolved.mailboxIds, ['contact@hairtpclinic.com']);
});

test('truth primary worklist mailbox ids honor wave-1 allowlist and rollback kill switch', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const enabledSource = extractFunctionSource(source, 'isTruthPrimaryWorklistFeatureEnabled');
  const configuredSource = extractFunctionSource(source, 'getTruthPrimaryConfiguredMailboxIds');
  const mailboxIdsSource = extractFunctionSource(source, 'getTruthPrimaryWorklistMailboxIds');

  const buildHarness = (disabledValue = null) =>
    new Function(
      'window',
      'WORKLIST_TRUTH_PRIMARY',
      'TRUTH_PRIMARY_WORKLIST_DISABLE_STORAGE_KEY',
      'asArray',
      'canonicalizeRuntimeMailboxId',
      `${enabledSource}
       ${configuredSource}
       ${mailboxIdsSource}
       return { isTruthPrimaryWorklistFeatureEnabled, getTruthPrimaryWorklistMailboxIds };`
    )(
      {
        localStorage: {
          getItem(key) {
            return key === 'cco.truthPrimaryWorklist.disabled' ? disabledValue : null;
          },
        },
      },
      {
        enabled: true,
        mailboxIds: [
          'egzona@hairtpclinic.com',
          'contact@hairtpclinic.com',
        ],
      },
      'cco.truthPrimaryWorklist.disabled',
      (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
      (value = '') => String(value || '').trim().toLowerCase()
    );

  const activeHarness = buildHarness(null);
  assert.equal(activeHarness.isTruthPrimaryWorklistFeatureEnabled(), true);
  assert.deepEqual(
    activeHarness.getTruthPrimaryWorklistMailboxIds({
      mailboxIds: [
        'egzona@hairtpclinic.com',
        'fazli@hairtpclinic.com',
        'kons@hairtpclinic.com',
        'marknad@hairtpclinic.com',
      ],
    }),
    ['egzona@hairtpclinic.com']
  );

  const disabledHarness = buildHarness('1');
  assert.equal(disabledHarness.isTruthPrimaryWorklistFeatureEnabled(), false);
  assert.deepEqual(
    disabledHarness.getTruthPrimaryWorklistMailboxIds({
      mailboxIds: ['egzona@hairtpclinic.com', 'contact@hairtpclinic.com'],
    }),
    []
  );
});

test('truth primary worklist merge replaces matched wave-1 mailbox rows but preserves unmatched legacy rows', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const getUsableRuntimeRowPreviewSource = extractFunctionSource(source, 'getUsableRuntimeRowPreview');
  const buildRuntimeRowSemanticKeySource = extractFunctionSource(source, 'buildRuntimeRowSemanticKey');
  const mergeTruthPrimaryRuntimeRowWithLegacyRowSource = extractFunctionSource(
    source,
    'mergeTruthPrimaryRuntimeRowWithLegacyRow'
  );
  const buildRowSource = extractFunctionSource(source, 'buildTruthPrimaryRuntimeRow');
  const mergeSource = extractFunctionSource(source, 'mergeTruthPrimaryWorklistData');

  const mergeTruthPrimaryWorklistData = new Function(
    'WORKLIST_TRUTH_PRIMARY',
    'asArray',
    'asNumber',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${getUsableRuntimeRowPreviewSource}
     ${buildRuntimeRowSemanticKeySource}
     ${mergeTruthPrimaryRuntimeRowWithLegacyRowSource}
     ${buildRowSource}
     ${mergeSource}
     return mergeTruthPrimaryWorklistData;`
  )(
    { limit: 120 },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  const merged = mergeTruthPrimaryWorklistData(
    {
      conversationWorklist: [
        {
          conversationId: 'legacy-contact',
          mailboxAddress: 'contact@hairtpclinic.com',
          subject: 'Legacy contact row',
        },
        {
          conversationId: 'legacy-fazli',
          mailboxAddress: 'fazli@hairtpclinic.com',
          subject: 'Legacy fazli row',
        },
      ],
      needsReplyToday: [
        {
          conversationId: 'legacy-egzona',
          mailboxAddress: 'egzona@hairtpclinic.com',
          subject: 'Legacy egzona row',
        },
      ],
    },
    {
      rows: [
        {
          id: 'truth-contact-key',
          lane: 'all',
          subject: 'Truth contact row',
          preview: 'Truth preview',
          conversation: {
            key: 'truth-contact-key',
            conversationId: 'legacy-contact',
          },
          mailbox: {
            mailboxId: 'contact@hairtpclinic.com',
            ownershipMailbox: 'contact@hairtpclinic.com',
          },
          customer: {
            email: 'customer@example.com',
            name: 'Customer Example',
          },
          timing: {
            latestMessageAt: '2026-04-03T10:00:00.000Z',
            lastInboundAt: '2026-04-03T09:00:00.000Z',
            lastOutboundAt: '2026-04-03T08:00:00.000Z',
          },
          state: {
            hasUnreadInbound: true,
            needsReply: true,
            messageCount: 3,
          },
        },
      ],
    },
    {
      truthPrimaryMailboxIds: [
        'egzona@hairtpclinic.com',
        'contact@hairtpclinic.com',
      ],
    }
  );

  const mergedSubjects = merged.conversationWorklist.map((row) => row.subject);
  assert.deepEqual(mergedSubjects, ['Legacy fazli row', 'Truth contact row']);
  assert.equal(merged.conversationWorklist[1].worklistSource, 'truth_primary');
  assert.equal(merged.conversationWorklist[1].worklistWave, 'wave_1');
  assert.deepEqual(merged.needsReplyToday.map((row) => row.subject), ['Legacy egzona row']);
});

test('truth primary worklist merge preserves unmatched legacy rows for truth mailboxes in conversation worklist', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const getUsableRuntimeRowPreviewSource = extractFunctionSource(source, 'getUsableRuntimeRowPreview');
  const buildRuntimeRowSemanticKeySource = extractFunctionSource(source, 'buildRuntimeRowSemanticKey');
  const mergeTruthPrimaryRuntimeRowWithLegacyRowSource = extractFunctionSource(
    source,
    'mergeTruthPrimaryRuntimeRowWithLegacyRow'
  );
  const buildRowSource = extractFunctionSource(source, 'buildTruthPrimaryRuntimeRow');
  const mergeSource = extractFunctionSource(source, 'mergeTruthPrimaryWorklistData');

  const mergeTruthPrimaryWorklistData = new Function(
    'WORKLIST_TRUTH_PRIMARY',
    'asArray',
    'asNumber',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${getUsableRuntimeRowPreviewSource}
     ${buildRuntimeRowSemanticKeySource}
     ${mergeTruthPrimaryRuntimeRowWithLegacyRowSource}
     ${buildRowSource}
     ${mergeSource}
     return mergeTruthPrimaryWorklistData;`
  )(
    { limit: 120 },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  const merged = mergeTruthPrimaryWorklistData(
    {
      conversationWorklist: [
        {
          conversationId: 'legacy-contact-fresh',
          mailboxAddress: 'contact@hairtpclinic.com',
          subject: 'Fresh legacy contact row',
        },
      ],
      needsReplyToday: [],
    },
    {
      rows: [
        {
          id: 'truth-contact-old',
          lane: 'all',
          subject: 'Older truth contact row',
          preview: 'Truth preview',
          conversation: {
            key: 'truth-contact-old',
            conversationId: 'truth-contact-old-conversation',
          },
          mailbox: {
            mailboxId: 'contact@hairtpclinic.com',
            ownershipMailbox: 'contact@hairtpclinic.com',
          },
          customer: {
            email: 'other@example.com',
            name: 'Other Example',
          },
          timing: {
            latestMessageAt: '2026-04-03T10:00:00.000Z',
            lastInboundAt: '2026-04-03T09:00:00.000Z',
            lastOutboundAt: '2026-04-03T08:00:00.000Z',
          },
          state: {
            hasUnreadInbound: true,
            needsReply: true,
            messageCount: 3,
          },
        },
      ],
    },
    {
      truthPrimaryMailboxIds: ['contact@hairtpclinic.com'],
    }
  );

  assert.deepEqual(
    merged.conversationWorklist.map((row) => row.subject),
    ['Fresh legacy contact row', 'Older truth contact row']
  );
});

test('truth primary worklist merge backfyller preview fran legacy-rad nar truth-raden saknar egen preview', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const compactRuntimeCopySource = extractFunctionSource(source, 'compactRuntimeCopy');
  const normalizeRuntimeDisplaySubjectSource = extractFunctionSource(
    source,
    'normalizeRuntimeDisplaySubject'
  );
  const looksLikeMailboxIdentitySource = extractFunctionSource(source, 'looksLikeMailboxIdentity');
  const isRuntimePlaceholderLineSource = extractFunctionSource(source, 'isRuntimePlaceholderLine');
  const isRuntimeUnknownCustomerNameSource = extractFunctionSource(
    source,
    'isRuntimeUnknownCustomerName'
  );
  const deriveRuntimeCustomerNameFromSubjectSource = extractFunctionSource(
    source,
    'deriveRuntimeCustomerNameFromSubject'
  );
  const getRuntimeCustomerNameSource = extractFunctionSource(source, 'getRuntimeCustomerName');
  const getMailFoundationPreviewCandidatesSource = extractFunctionSource(
    source,
    'getMailFoundationPreviewCandidates'
  );
  const resolveRuntimePreviewTextSource = extractFunctionSource(
    source,
    'resolveRuntimePreviewText'
  );
  const getUsableRuntimeRowPreviewSource = extractFunctionSource(source, 'getUsableRuntimeRowPreview');
  const buildRuntimeRowSemanticKeySource = extractFunctionSource(source, 'buildRuntimeRowSemanticKey');
  const mergeTruthPrimaryRuntimeRowWithLegacyRowSource = extractFunctionSource(
    source,
    'mergeTruthPrimaryRuntimeRowWithLegacyRow'
  );
  const buildRowSource = extractFunctionSource(source, 'buildTruthPrimaryRuntimeRow');
  const mergeSource = extractFunctionSource(source, 'mergeTruthPrimaryWorklistData');

  const mergeTruthPrimaryWorklistData = new Function(
    'WORKLIST_TRUTH_PRIMARY',
    'asArray',
    'asNumber',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'normalizeText',
    'titleCaseMailbox',
    `${compactRuntimeCopySource}
     ${normalizeRuntimeDisplaySubjectSource}
     ${looksLikeMailboxIdentitySource}
     ${isRuntimePlaceholderLineSource}
     ${isRuntimeUnknownCustomerNameSource}
     ${deriveRuntimeCustomerNameFromSubjectSource}
     ${getRuntimeCustomerNameSource}
     ${getMailFoundationPreviewCandidatesSource}
     ${resolveRuntimePreviewTextSource}
     ${getUsableRuntimeRowPreviewSource}
     ${buildRuntimeRowSemanticKeySource}
     ${mergeTruthPrimaryRuntimeRowWithLegacyRowSource}
     ${buildRowSource}
     ${mergeSource}
     return mergeTruthPrimaryWorklistData;`
  )(
    { limit: 120 },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    (value, fallback = '') => {
      const normalized = String(value ?? '').trim();
      return normalized || fallback;
    },
    (value = '') => String(value || '').trim().toLowerCase(),
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value = '') => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    (value = '') => {
      const local = String(value || '').trim().toLowerCase().split('@')[0] || '';
      return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Mailbox';
    }
  );

  const merged = mergeTruthPrimaryWorklistData(
    {
      conversationWorklist: [
        {
          conversationId: 'legacy-noha-conversation',
          mailboxAddress: 'kons@hairtpclinic.com',
          subject: 'Noha Haj omar Kontaktformulär',
          customerName: 'Noha Haj omar',
          latestInboundPreview:
            'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
        },
      ],
      needsReplyToday: [],
    },
    {
      rows: [
        {
          id: 'truth-noha-key',
          lane: 'all',
          subject: 'Noha Haj omar Kontaktformulär',
          preview: '',
          latestInboundPreview: '',
          conversation: {
            key: 'truth-noha-key',
            conversationId: 'truth-noha-conversation',
          },
          mailbox: {
            mailboxId: 'kons@hairtpclinic.com',
            ownershipMailbox: 'kons@hairtpclinic.com',
          },
          customer: {
            email: 'noha@example.com',
            name: 'Noha Haj omar',
          },
          timing: {
            latestMessageAt: '2026-04-03T10:00:00.000Z',
            lastInboundAt: '2026-04-03T09:00:00.000Z',
            lastOutboundAt: '2026-04-03T08:00:00.000Z',
          },
          state: {
            hasUnreadInbound: true,
            needsReply: true,
            messageCount: 2,
          },
        },
      ],
    },
    {
      truthPrimaryMailboxIds: ['kons@hairtpclinic.com'],
    }
  );

  assert.equal(merged.conversationWorklist.length, 1);
  assert.equal(merged.conversationWorklist[0].worklistSource, 'truth_primary');
  assert.match(String(merged.conversationWorklist[0].latestInboundPreview || ''), /ögonbrynshår/);
  assert.match(String(merged.conversationWorklist[0].preview || ''), /ögonbrynshår/);
});

test('buildThreadCardMarkup marks truth-primary rows clearly in the worklist UI', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (iconKey) => ({ outerHTML: `<svg data-thread-signal-icon="${iconKey}"></svg>` }),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'truth-thread-1',
      customerName: 'Customer Example',
      avatar: '',
      lastActivityAt: '2026-04-03T10:00:00.000Z',
      lastActivityLabel: '10:00',
      mailboxLabel: 'Contact',
      mailboxProvenanceLabel: '2 mailboxar',
      mailboxProvenanceDetail: 'Contact · Kons',
      intentLabel: 'Behöver svar',
      statusLabel: 'Svar krävs',
      preview: 'Truth preview',
      nextActionSummary: 'Svara kunden och ta nästa tydliga steg.',
      nextActionLabel: 'Svara nu',
      unread: true,
      worklistSource: 'truth_primary',
      worklistSourceLabel: 'Truth primary',
      tags: ['all', 'act-now'],
    },
    0,
    false
  );

  assert.match(markup, /data-worklist-source="truth_primary"/);
  assert.match(markup, /thread-unread-indicator/);
  assert.doesNotMatch(markup, /Unread inbound/);
  assert.match(markup, /thread-intelligence-row/);
  assert.match(markup, />Contact</);
  assert.doesNotMatch(markup, /thread-operational-summary/);
  assert.match(
    markup,
    /<div class="thread-heading thread-heading-merged">[\s\S]*thread-unread-indicator[\s\S]*<p class="thread-subject">[\s\S]*thread-subject-primary">Customer Example<\/span>[\s\S]*<\/p>[\s\S]*<\/div>[\s\S]*<div class="thread-card-stamp-top">[\s\S]*<time/,
    'Olästpricken ska ligga först i den sammanslagna titellinjen, före avsändarnamnet och inte i datumstapeln.'
  );
  assert.match(markup, /thread-support-stack/);
  assert.match(markup, /Mailboxspår/);
  assert.match(markup, /2 mailboxar/);
  assert.match(markup, /thread-story/);
  assert.match(
    markup,
    /thread-card-head-copy[\s\S]*thread-heading thread-heading-merged[\s\S]*thread-story thread-story-inline[\s\S]*<\/div>[\s\S]*<\/div>[\s\S]*<div class="thread-card-stamp">/,
    'Mailpreviewn ska nu ligga direkt under rubrikraden i headern innan intelligensraden längre ned i kortet.'
  );
  assert.match(markup, />Truth preview</);
  assert.doesNotMatch(markup, /thread-meta-row/);
  assert.doesNotMatch(markup, /thread-meta-item-label/);
  assert.doesNotMatch(markup, /thread-meta-item-value/);
  assert.doesNotMatch(markup, /thread-story-placeholder/);
  assert.doesNotMatch(markup, /chip-row/);
  assert.doesNotMatch(markup, /thread-summary-shell/);
  assert.match(markup, /thread-intelligence-row/);
  assert.match(markup, />Contact</);
  assert.match(markup, />Behöver svar</);
  assert.match(markup, />Svara nu</);
  assert.match(markup, /<button class="thread-intelligence-item thread-intelligence-item--next"/);
  assert.match(markup, /data-runtime-studio-open/);
  assert.match(markup, /data-thread-signal-icon="mail"/);
  assert.match(markup, /data-thread-signal-icon="layers"/);
  assert.match(markup, /data-thread-signal-icon="bolt"/);
});

test('buildThreadCardMarkup kan visa preview fran raw latestMessage bodyHtml nar preview ar tom', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (iconKey) => ({ outerHTML: `<svg data-thread-signal-icon="${iconKey}"></svg>` }),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'truth-thread-body-html',
      customerName: 'Noha Haj omar',
      avatar: '',
      subject: 'Noha Haj omar Kontaktformulär',
      displaySubject: 'Noha Haj omar Kontaktformulär',
      lastActivityAt: '2026-04-03T10:00:00.000Z',
      lastActivityLabel: '10:00',
      mailboxLabel: 'Kons',
      preview: '',
      nextActionLabel: 'Granska tråden',
      nextActionSummary: 'Granska tråden',
      unread: true,
      worklistSource: 'truth_primary',
      tags: ['all'],
      raw: {
        latestMessage: {
          bodyHtml:
            '<div>Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?</div>',
        },
      },
    },
    0,
    false
  );

  assert.match(markup, /ögonbrynshår/);
});

test('buildThreadCardMarkup kan falla tillbaka till raw customerSummary lastCaseSummary nar preview saknas', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (iconKey) => ({ outerHTML: `<svg data-thread-signal-icon="${iconKey}"></svg>` }),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'truth-thread-last-case-summary',
      customerName: 'Noha Haj omar',
      avatar: '',
      subject: 'Noha Haj omar Kontaktformulär',
      displaySubject: 'Noha Haj omar Kontaktformulär',
      lastActivityAt: '2026-04-03T10:00:00.000Z',
      lastActivityLabel: '10:00',
      mailboxLabel: 'Kons',
      preview: '',
      nextActionLabel: 'Granska tråden',
      nextActionSummary: 'Granska tråden',
      unread: true,
      tags: ['all'],
      raw: {
        customerSummary: {
          lastCaseSummary:
            'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
        },
      },
    },
    0,
    false
  );

  assert.match(markup, /ögonbrynshår/);
});

test('buildThreadCardMarkup prioriterar canonical threadDocument preview over raw bodyHtml i legacy sunset-pass', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (iconKey) => ({ outerHTML: `<svg data-thread-signal-icon="${iconKey}"></svg>` }),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'truth-thread-thread-document-preview',
      customerName: 'Noha Haj omar',
      avatar: '',
      subject: 'Noha Haj omar Kontaktformulär',
      displaySubject: 'Noha Haj omar Kontaktformulär',
      lastActivityAt: '2026-04-03T10:00:00.000Z',
      lastActivityLabel: '10:00',
      mailboxLabel: 'Kons',
      preview: '',
      nextActionLabel: 'Granska tråden',
      nextActionSummary: 'Granska tråden',
      unread: true,
      tags: ['all'],
      threadDocument: {
        kind: 'mail_thread_document',
        messages: [
          {
            role: 'customer',
            presentation: {
              previewText:
                'Canonical preview från threadDocument som ska vinna över legacy HTML',
            },
          },
        ],
      },
      raw: {
        latestMessage: {
          bodyHtml: '<div>Legacy HTML preview som inte ska vinna längre</div>',
        },
      },
    },
    0,
    false
  );

  assert.match(markup, /Canonical preview från threadDocument/i);
  assert.doesNotMatch(markup, /Legacy HTML preview som inte ska vinna längre/i);
  assert.match(markup, /data-foundation-mode="foundation"/);
  assert.match(markup, /data-foundation-source="mail_foundation"/);
});

test('buildThreadCardMarkup markerar legacy fallback tydligt nar canonical foundation saknas', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    (iconKey) => ({ outerHTML: `<svg data-thread-signal-icon="${iconKey}"></svg>` }),
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'legacy-fallback-thread-card',
      customerName: 'Fallback Preview',
      avatar: '',
      subject: 'Fallback Preview',
      displaySubject: 'Fallback Preview',
      preview: 'Legacy previewtext som fortfarande visas via fallbackkedjan',
      lastActivityAt: '2026-04-03T10:00:00.000Z',
      lastActivityLabel: '10:00',
      mailboxLabel: 'Kons',
      nextActionLabel: 'Granska tråden',
      nextActionSummary: 'Granska tråden',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /data-foundation-mode="legacy_fallback"/);
  assert.match(markup, /data-foundation-source="legacy_preview_fallback"/);
});

test('vald mailruta visar en kort varfor-nu-rad utan att duplicera hela operativt stod', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-all-intel',
      customerName: 'Egzona',
      avatar: '',
      displaySubject: 'Kons flow verification',
      subject: 'Kons flow verification',
      preview: 'Unread inbound and needs reply läses från mailbox truth i wave 1.',
      whyInFocus: 'Kunden väntar på ett tydligt nästa steg.',
      nextActionLabel: 'Svara nu',
      nextActionSummary: 'Öppna tråden och ge ett konkret nästa steg.',
      lifecycleLabel: 'Aktiv dialog',
      waitingLabel: 'Behöver åtgärd',
      statusLabel: 'Svar krävs',
      riskLabel: 'Bevaka',
      displayOwnerLabel: 'Egzona',
      ownerLabel: 'Egzona',
      lastActivityAt: '2026-04-02T08:00:00.000Z',
      lastActivityLabel: '2 apr.',
      mailboxLabel: 'Kons',
      worklistSource: 'truth_primary',
      worklistSourceLabel: 'Truth primary',
      worklistWaveLabel: 'Wave 1',
      unread: true,
      cards: {
        actions: [{ chip: 'Nästa drag', lines: ['Svara nu', 'Ingen planerad uppföljning ännu.'] }],
        customer: [{ chip: 'Kundläge', lines: ['Kontaktväg: Kons', 'Nu väntar vi på: Behöver åtgärd'] }],
        history: [{ chip: 'Historikmönster', lines: ['Historiken visar bäst respons på tydliga CTA.'] }],
        signals: [{ chip: 'Prioriteringssignal', lines: ['Prioritetsskäl: Oläst kundrad', 'Nästa steg: Svara nu'] }],
        medicine: [{ chip: 'Medicinsk kontext', lines: ['Ingen dominant risk', 'Ingen medicinsk spärr registrerad.'] }],
        team: [{ chip: 'Teamläge', lines: ['Ägare: Egzona', 'Ingen eskalering krävs just nu.'] }],
      },
      tags: ['act-now'],
    },
    0,
    true
  );

  assert.match(markup, /thread-intelligence-row/);
  assert.match(markup, />Kons</);
  assert.match(markup, /Svar krävs nu/);
  assert.match(markup, /thread-intelligence-item--next[\s\S]*>Ge instruktion</);
  assert.doesNotMatch(markup, /thread-intelligence-item--next[\s\S]*>Svara nu</);
  assert.doesNotMatch(markup, /All intel i tråden/);
  assert.doesNotMatch(markup, /thread-card-selected-audit/);
});

test('vald mailruta visar fortfarande varfor-nu-signalen nar cards saknas', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-fallback-intel',
      customerName: 'Charlie Lagerkvist',
      avatar: '',
      displaySubject: 'Charlie Lagerkvist Kontaktformulär',
      subject: 'Charlie Lagerkvist Kontaktformulär',
      whyInFocus: 'Obesvarad konversation med operativ miss-risk.',
      nextActionLabel: 'Svara nu',
      nextActionSummary: 'Var konkret med tider eller nästa steg direkt i svaret.',
      lifecycleLabel: 'Aktiv dialog',
      waitingLabel: '',
      statusLabel: 'Behöver svar',
      riskLabel: '',
      displayOwnerLabel: '',
      ownerLabel: '',
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      mailboxLabel: 'Kons',
      worklistSource: 'truth_primary',
      worklistWaveLabel: 'Wave 1',
      unread: true,
      raw: {
        tempoProfile: 'reflekterande',
        customerSummary: {
          historySignalSummary: 'Historiken visar bäst respons på tydliga CTA.',
          historySignalActionCue: 'Led kunden med ett tydligt nästa steg i samma svar.',
          historyMessageCount: 4,
        },
        priorityReasons: ['oläst kundrad i aktivt scope'],
        slaStatus: 'riskerar_sla',
        tone: 'neutral',
        ctaIntensity: 'normal',
        dominantRisk: '',
        medicalContext: '',
      },
      tags: ['act-now'],
    },
    0,
    true
  );

  assert.match(markup, /thread-intelligence-row/);
  assert.match(markup, /Svar krävs nu/);
  assert.doesNotMatch(markup, /Obesvarad konversation med operativ miss-risk/);
  assert.doesNotMatch(markup, /Unread inbound · needs reply · läses från mailbox truth i Wave 1/);
  assert.doesNotMatch(markup, /thread-story/);
  assert.doesNotMatch(markup, /thread-story-placeholder/);
  assert.doesNotMatch(markup, /All intel i tråden/);
});

test('mejlraden visar rensad kundpreview utan formulärfält när mailtext finns', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-preview-clean',
      customerName: 'Sivan Bergenstein',
      avatar: '',
      displaySubject: 'Sivan Bergenstein Kontaktformulär',
      subject: 'Sivan Bergenstein Kontaktformulär',
      preview:
        'Från: Sivan Bergenstein E-post: [email] Telefon: [telefon] Hur kan vi hjälpa dig? Hej, Jag har en PRP-tid bokat nu under våren men kan inte hitta vilket datum.',
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      mailboxLabel: 'Kons',
      intentLabel: 'Kontaktformulär',
      statusLabel: 'Behöver svar',
      nextActionLabel: 'Granska tråden',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /thread-story/);
  assert.match(markup, /Jag har en PRP-tid bokat nu under våren/);
  assert.doesNotMatch(markup, /Från:/);
  assert.doesNotMatch(markup, /E-post:/);
  assert.doesNotMatch(markup, /Telefon:/);
});

test('mejlraden visar ingen previewrad när preview bara är placeholder-copy', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-preview-placeholder',
      customerName: 'Okänd avsändare',
      avatar: '',
      displaySubject: 'QA Reply Kons Send [telefon]',
      subject: 'QA Reply Kons Send [telefon]',
      preview: 'Ingen förhandsvisning tillgänglig',
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      mailboxLabel: 'Kons',
      intentLabel: 'QA Reply Kons Send [telefon]',
      statusLabel: 'Behöver åtgärd',
      nextActionLabel: 'Granska tråden',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.doesNotMatch(markup, /thread-story/);
  assert.doesNotMatch(markup, /Ingen förhandsvisning tillgänglig/);
  assert.match(markup, /thread-intelligence-row/);
});

test('mejlraden faller tillbaka till forsta riktiga kundtexten nar preview saknas', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-preview-message-fallback',
      customerName: 'Noha Haj omar',
      avatar: '',
      displaySubject: 'Noha Haj omar Kontaktformulär',
      subject: 'Noha Haj omar Kontaktformulär',
      preview: '',
      systemPreview: '',
      messages: [
        {
          id: 'message-1',
          role: 'customer',
          body:
            'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
        },
      ],
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      mailboxLabel: 'Kons',
      intentLabel: 'Pricing Question',
      statusLabel: 'Miss-risk',
      nextActionLabel: 'Granska tråden',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /thread-story/);
  assert.match(markup, /Min fråga är, är det möjligt att transplantera ögonbrynshår/);
});

test('mejlraden faller tillbaka till raw detail nar preview och messages saknas', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'getQueueInlineLaneSignalNext',
    'getQueueInlineLaneSignalWhat',
    'getQueueInlineLaneSignalWhy',
    'normalizeKey',
    'buildThreadSmartSummary',
    'buildThreadIntelAuditMarkup',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim() || fallback;
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => 'Granska tråden',
    () => 'Pricing Question',
    () => 'Miss-risk',
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    () => '',
    () => '',
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-preview-raw-detail-fallback',
      customerName: 'Noha Haj omar',
      avatar: '',
      displaySubject: 'Noha Haj omar Kontaktformulär',
      subject: 'Noha Haj omar Kontaktformulär',
      preview: '',
      systemPreview: '',
      messages: [],
      raw: {
        detail:
          'Hej. Min fråga är, är det möjligt att transplantera ögonbrynshår, och hur mycket kostar det?',
      },
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      mailboxLabel: 'Kons',
      intentLabel: 'Pricing Question',
      statusLabel: 'Miss-risk',
      nextActionLabel: 'Granska tråden',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /thread-story/);
  assert.match(markup, /ögonbrynshår/);
});

test('mejlraden filtrerar provider-copy fran previewrad men behaller faktisk kundtext', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-preview-provider-filter',
      customerName: 'Isak Nyström',
      avatar: '',
      displaySubject: 'Isak Nyström Ang',
      subject: 'Isak Nyström Ang',
      preview:
        'Du får inte ofta e-post från [email]. Läs om varför det här är viktigt. Hej, jag får inte ofta e-post från denna adress men undrar om ni kan hjälpa mig med bokningen.',
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      mailboxLabel: 'Kons',
      statusLabel: 'Behöver åtgärd',
      nextActionLabel: 'Granska tråden',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /jag får inte ofta e-post från denna adress/);
  assert.doesNotMatch(markup, /Du får inte ofta e-post från/);
  assert.doesNotMatch(markup, /Läs om varför det här är viktigt/);
});

test('mailrubriken kollapsar dubbelnamn och visar kontaktformular som sekundar kontext', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '') => {
      const text = String(value || '').trim();
      return text || fallback;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-compact-header',
      customerName: 'Charlie Lagerkvist',
      avatar: '',
      displaySubject: 'Charlie Lagerkvist Kontaktformulär',
      subject: 'Charlie Lagerkvist Kontaktformulär',
      preview: 'Unread inbound and needs reply.',
      lastActivityAt: '2026-04-02T13:24:00.000Z',
      lastActivityLabel: '13:24',
      displayOwnerLabel: '',
      ownerLabel: '',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /thread-subject-primary">Charlie Lagerkvist<\/span>/);
  assert.match(markup, /thread-subject-context">Kontaktformulär<\/span>/);
  assert.doesNotMatch(markup, />Charlie Lagerkvist Kontaktformulär</);
});

test('booking-systemmail renderar kompakt previewrad utan inline-kontext i headern', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const pillMarkupSource = extractFunctionSource(source, 'buildQueuePillMarkup');
  const getQueueInlineLaneSignalWhatSource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhat');
  const getQueueInlineLaneSignalWhySource = extractFunctionSource(source, 'getQueueInlineLaneSignalWhy');
  const getQueueInlineLaneSignalNextSource = extractFunctionSource(source, 'getQueueInlineLaneSignalNext');
  const threadSmartSummarySource = extractFunctionSource(source, 'buildThreadSmartSummary');
  const threadIntelAuditMarkupSource = extractFunctionSource(source, 'buildThreadIntelAuditMarkup');
  const threadMarkupSource = extractFunctionSource(source, 'buildThreadCardMarkup');

  const buildThreadCardMarkup = new Function(
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'createPillIcon',
    'escapeHtml',
    'isSentRuntimeThread',
    'normalizeKey',
    'state',
    `${pillMarkupSource}
     ${getQueueInlineLaneSignalWhatSource}
     ${getQueueInlineLaneSignalWhySource}
     ${getQueueInlineLaneSignalNextSource}
     ${threadSmartSummarySource}
     ${threadIntelAuditMarkupSource}
     ${threadMarkupSource}
     return buildThreadCardMarkup;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value, fallback = '', maxChars = 120) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim() || fallback;
      if (!normalized) return '';
      return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
    },
    () => null,
    (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    () => false,
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    {
      runtime: {
        live: true,
      },
    }
  );

  const markup = buildThreadCardMarkup(
    {
      id: 'thread-booking-compact',
      customerName: 'Hair TP Clinic',
      avatar: '',
      displaySubject: 'Ny bokning (web): Hewa sadi, måndag 6 april 2026 17:00',
      subject: 'Ny bokning (web): Hewa sadi, måndag 6 april 2026 17:00',
      preview: 'Ny bokning (web): Hewa sadi, måndag 6 april 2026 17:00',
      lastActivityAt: '2026-04-06T11:24:00.000Z',
      lastActivityLabel: '11:24',
      mailboxLabel: 'Kons',
      intentLabel: 'Booking Request',
      statusLabel: 'Miss-risk',
      nextActionLabel: 'Granska tråden',
      rowFamily: 'booking_system_mail',
      unread: true,
      tags: ['all'],
    },
    0,
    false
  );

  assert.match(markup, /data-row-family="booking_system_mail"/);
  assert.match(markup, /thread-subject-primary">Hair TP Clinic<\/span>/);
  assert.doesNotMatch(markup, /thread-subject-context">Ny bokning/);
  assert.match(markup, /thread-story thread-story-inline">Ny bokning \(web\): Hewa sadi/);
  assert.match(markup, /thread-intelligence-row/);
});

test('worklistkortens mejlrad visar bara nodvandig copy och fyra oppna intelligenssignaler utan bubblor', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const renderersSource = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const liveCardRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card'
  );
  const liveHeadRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card .thread-card-head'
  );
  const storyRule = extractCssBlock(stylesSource, '\n.thread-story {\n');
  const liveStoryRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card .thread-story'
  );
  const intelligenceRowRule = extractCssBlock(stylesSource, '\n.thread-intelligence-row {\n');
  const intelligenceIconRule = extractCssBlock(stylesSource, '.thread-intelligence-item-icon');
  const intelligenceIconInnerRule = extractCssBlock(
    stylesSource,
    '.thread-intelligence-item-icon .pill-icon'
  );
  const intelligenceValueRule = extractCssBlock(
    stylesSource,
    '\n.thread-intelligence-item-value {\n'
  );
  const mailboxToneRule = extractCssBlock(stylesSource, '.thread-intelligence-item--mailbox');
  const whatToneRule = extractCssBlock(stylesSource, '.thread-intelligence-item--what');
  const whyToneRule = extractCssBlock(stylesSource, '.thread-intelligence-item--why');
  const nextToneRule = extractCssBlock(stylesSource, '.thread-intelligence-item--next');
  const identityRule = extractCssBlock(stylesSource, '\n.thread-card-identity {\n');
  const headCopyRule = extractCssBlock(stylesSource, '\n.thread-card-head-copy {\n');
  const headingMergedRule = extractCssBlock(stylesSource, '\n.thread-heading-merged {\n');
  const subjectRule = extractCssBlock(stylesSource, '\n.thread-subject {\n');
  const subjectPrimaryRule = extractCssBlock(stylesSource, '\n.thread-subject-primary {\n');
  const subjectContextRule = extractCssBlock(stylesSource, '\n.thread-subject-context {\n');
  const storyPlaceholderRule = extractCssBlock(stylesSource, '.thread-story-placeholder');
  const unreadRule = extractCssBlock(stylesSource, '.thread-unread-indicator');
  const liveAvatarRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card .avatar'
  );
  const liveSupportStackRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card .thread-support-stack'
  );
  const selectedCardRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card-selected'
  );
  const liveIntelligenceValueRule = extractCssBlock(
    stylesSource,
    '.queue-history-list[data-queue-list-mode="live"] > .thread-card .thread-intelligence-item-value'
  );
  const overlayRule = extractCssBlock(stylesSource, '.thread-card::before');
  const actionIconRule = extractCssBlock(
    stylesSource,
    '.queue-action-shortcut-strip .queue-history-head-action svg'
  );

  assert.match(liveCardRule, /display:\s*grid;/);
  assert.match(liveCardRule, /grid-template-rows:\s*minmax\(0,\s*auto\)\s+auto;/);
  assert.match(liveCardRule, /align-content:\s*start;/);
  assert.match(liveHeadRule, /padding:\s*2px 10px 11px 0;/);
  assert.match(liveHeadRule, /border-bottom:\s*1px solid rgba\(222,\s*211,\s*203,\s*0\.46\);/);
  assert.match(storyRule, /font-size:\s*13px;/);
  assert.match(storyRule, /line-height:\s*18px;/);
  assert.match(storyRule, /font-weight:\s*540;/);
  assert.match(storyRule, /-webkit-line-clamp:\s*1;/);

  assert.match(liveStoryRule, /color:\s*rgba\(58,\s*52,\s*48,\s*0\.98\);/);
  assert.match(liveStoryRule, /font-weight:\s*540;/);

  assert.match(intelligenceRowRule, /display:\s*flex;/);
  assert.match(intelligenceRowRule, /flex-wrap:\s*wrap;/);
  assert.match(intelligenceRowRule, /gap:\s*7px 14px;/);

  assert.match(intelligenceIconRule, /width:\s*16px;/);
  assert.match(intelligenceIconRule, /height:\s*16px;/);
  assert.match(intelligenceIconInnerRule, /width:\s*16px;/);
  assert.match(intelligenceIconInnerRule, /height:\s*16px;/);
  assert.match(intelligenceIconInnerRule, /color:\s*currentColor;/);

  assert.match(intelligenceValueRule, /color:\s*currentColor;/);
  assert.match(intelligenceValueRule, /font-size:\s*10px;/);
  assert.match(mailboxToneRule, /color:\s*#6a564a;/i);
  assert.match(whatToneRule, /var\(--accent-indigo\)/);
  assert.match(whyToneRule, /var\(--accent-magenta\)/);
  assert.match(nextToneRule, /var\(--accent-green\)/);
  assert.match(identityRule, /padding-top:\s*1px;/);
  assert.match(headCopyRule, /display:\s*grid;/);
  assert.match(headCopyRule, /grid-template-rows:\s*auto auto;/);
  assert.match(headCopyRule, /padding-top:\s*1px;/);
  assert.match(headingMergedRule, /display:\s*grid;/);
  assert.match(headingMergedRule, /grid-template-columns:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(headingMergedRule, /min-height:\s*19px;/);
  assert.match(subjectRule, /align-items:\s*baseline;/);
  assert.match(subjectRule, /min-height:\s*19px;/);

  assert.match(subjectPrimaryRule, /font-size:\s*15px;/);
  assert.match(subjectPrimaryRule, /line-height:\s*19px;/);
  assert.match(subjectPrimaryRule, /font-weight:\s*700;/);
  assert.match(subjectContextRule, /font-size:\s*12px;/);
  assert.match(subjectContextRule, /line-height:\s*16px;/);
  assert.match(subjectContextRule, /font-weight:\s*620;/);

  assert.match(storyPlaceholderRule, /font-weight:\s*580;/);
  assert.match(unreadRule, /background:\s*#4d69d6;/);
  assert.match(unreadRule, /margin-top:\s*5px;/);
  assert.match(liveAvatarRule, /margin-top:\s*1px;/);
  assert.match(liveSupportStackRule, /margin-top:\s*auto;/);
  assert.match(actionIconRule, /width:\s*18px;/);
  assert.match(actionIconRule, /height:\s*18px;/);
  assert.match(overlayRule, /height:\s*60px;/);
  assert.match(overlayRule, /pointer-events:\s*none;/);
  assert.match(selectedCardRule, /min-height:\s*126px;/);
  assert.match(selectedCardRule, /border-radius:\s*12px;/);
  assert.match(liveIntelligenceValueRule, /font-size:\s*10\.25px;/);
  assert.match(liveIntelligenceValueRule, /font-weight:\s*660;/);

  assert.doesNotMatch(
    renderersSource,
    /thread-meta-row|thread-meta-item-label|thread-meta-item-value/,
    'Thread-renderern ska inte längre bygga en separat footer-faktaruta under varje mejlrad.'
  );

  assert.match(
    renderersSource,
    /key:\s*"Mailbox"[\s\S]*key:\s*"Gäller"[\s\S]*key:\s*"Nu"[\s\S]*key:\s*"Nästa"/,
    'Mailraden ska rendera exakt de fyra intelligensämnena i fast ordning: Mailbox, Gäller, Nu, Nästa.'
  );

  assert.match(
    renderersSource,
    /queue-history-pill-label/,
    'Historikpillsen ska bära egen label-span så texten kan trunkeras i enradsläge.'
  );
});

test('studio-send behaller signaturberikad previewbody i fokusytans outboundpatch', () => {
  const asyncSource = fs.readFileSync(ASYNC_ORCHESTRATION_PATH, 'utf8');
  const threadOpsSource = fs.readFileSync(THREAD_OPS_PATH, 'utf8');

  assert.match(
    asyncSource,
    /const sendResult = await apiRequest\("\/api\/v1\/cco\/send"[\s\S]*patchStudioThreadAfterSend\(thread,\s*studioState\.draftBody,\s*sendResult\);/,
    'Förväntade att studio-send skickar API-resultatet vidare till trådpatchen efter lyckad sändning.'
  );

  assert.match(
    threadOpsSource,
    /const outboundConversationBody = asText\(sendResult\?\.preview\?\.body,\s*draftBody\);[\s\S]*const outboundConversationBodyHtml = asText\(sendResult\?\.preview\?\.bodyHtml\);[\s\S]*conversationBody:\s*outboundConversationBody,[\s\S]*conversationBodyHtml:\s*outboundConversationBodyHtml[\s\S]*detail:\s*compactRuntimeCopy\(outboundConversationBody,\s*draftBody,\s*220\)/,
    'Förväntade att trådpatchen använder både signaturberikad textbody och bodyHtml för fokusytans outboundmeddelande och historikhändelsen.'
  );
});
