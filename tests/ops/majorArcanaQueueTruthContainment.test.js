const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
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

function createBuildLiveThreadsHarness() {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'buildLiveThreads');
  const calls = {
    buildRuntimeThread: [],
    buildHistoryBackedRuntimeRow: [],
  };

  const buildLiveThreads = new Function(
    'asArray',
    'asText',
    'buildFallbackRowsFromFeed',
    'buildFeedIndex',
    'buildClientThreadDocumentFromHistoryMessages',
    'buildHistoryConversationKey',
    'buildRuntimeThread',
    'buildHistoryBackedRuntimeRow',
    'buildHistoryFeedEntries',
    'buildHistoryRuntimeEvents',
    'deriveRuntimeTags',
    'normalizeKey',
    'titleCaseMailbox',
    `${functionSource}; return buildLiveThreads;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (...values) => {
      for (const value of values) {
        const normalized =
          typeof value === 'string'
            ? value.trim()
            : value === undefined || value === null
              ? ''
              : String(value).trim();
        if (normalized) return normalized;
      }
      return '';
    },
    () => [],
    () => new Map(),
    (messages, { conversationId = '' } = {}) => ({
      kind: 'mail_thread_document',
      conversationId,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      messages: Array.isArray(messages) ? messages : [],
    }),
    (message = {}) => {
      if (message.conversationId) return String(message.conversationId);
      return `history:${String(message.messageId || 'unknown')}`;
    },
    (row, options = {}) => {
      calls.buildRuntimeThread.push({ row, options });
      return {
        id: row.conversationId,
        lastActivityAt: row.lastInboundAt || row.lastOutboundAt || '',
        source: row.__source || 'runtime',
      };
    },
    ({ conversationId, messages, events, liveRow }) => {
      calls.buildHistoryBackedRuntimeRow.push({
        conversationId,
        messages,
        events,
        liveRow,
      });
      return {
        ...(liveRow || {}),
        conversationId,
        __source: liveRow ? 'history-enriched-live-row' : 'history-only-row',
        mailboxAddress: liveRow?.mailboxAddress || 'contact@hairtpclinic.com',
      };
    },
    (messages) => messages.map((message) => ({ id: message.messageId || message.conversationId })),
    (events) => events.map((event) => ({ id: event.id || event.conversationId })),
    (row = {}) => {
      const tags = ['all'];
      const workflowLane = String(row?.workflowLane || '')
        .trim()
        .toLowerCase();
      const priorityLevel = String(row?.priorityLevel || '')
        .trim()
        .toLowerCase();
      const slaStatus = String(row?.slaStatus || '')
        .trim()
        .toLowerCase();
      if (
        workflowLane === 'waiting_reply' ||
        String(row?.waitingOn || '')
          .trim()
          .toLowerCase() === 'customer'
      ) {
        tags.push('later', 'followup');
      }
      if (
        workflowLane === 'booking_ready' ||
        String(row?.bookingState || '')
          .trim()
          .toLowerCase()
          .includes('ready')
      ) {
        tags.push('bookable');
      }
      if (workflowLane === 'medical_review' || row?.needsMedicalReview === true)
        tags.push('medical');
      if (workflowLane === 'admin_low') tags.push('admin');
      if (['critical', 'high'].includes(priorityLevel)) tags.push('sprint');
      if (slaStatus === 'breach' || workflowLane === 'action_now') tags.push('act-now', 'today');
      else if (slaStatus === 'warning') tags.push('today');
      if (!String(row?.owner || '').trim()) tags.push('unassigned');
      if (slaStatus === 'breach' || Number(row?.riskStackScore || 0) >= 0.6) tags.push('high-risk');
      return tags;
    },
    (value = '') =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    (value) => String(value || '')
  );

  return { buildLiveThreads, calls };
}

test('buildLiveThreads keeps active live queue scoped to current worklist even when history contains extra conversations', () => {
  const { buildLiveThreads, calls } = createBuildLiveThreadsHarness();

  const threads = buildLiveThreads(
    {
      conversationWorklist: [
        {
          conversationId: 'conv-live',
          subject: 'Live row',
          mailboxAddress: 'contact@hairtpclinic.com',
          lastInboundAt: '2026-04-01T10:00:00.000Z',
        },
      ],
      needsReplyToday: [
        {
          conversationId: 'conv-live',
          subject: 'Duplicate live row',
        },
      ],
    },
    {
      historyMessages: [
        { conversationId: 'conv-live', messageId: 'm-1' },
        { conversationId: 'conv-history-only', messageId: 'm-2' },
      ],
      historyEvents: [{ conversationId: 'conv-live', id: 'e-1' }],
    }
  );

  assert.equal(threads.length, 1);
  assert.deepEqual(
    threads.map((thread) => thread.id),
    ['conv-live']
  );
  assert.equal(calls.buildHistoryBackedRuntimeRow.length, 1);
  assert.equal(calls.buildHistoryBackedRuntimeRow[0].conversationId, 'conv-live');
  assert.equal(calls.buildRuntimeThread.length, 1);
  assert.equal(calls.buildRuntimeThread[0].row.__source, 'history-enriched-live-row');
  assert.equal(calls.buildRuntimeThread[0].options.threadDocument?.kind, 'mail_thread_document');
  assert.equal(calls.buildRuntimeThread[0].options.threadDocument?.messageCount, 1);
});

test('buildLiveThreads still builds history-only threads when live worklist is empty', () => {
  const { buildLiveThreads, calls } = createBuildLiveThreadsHarness();

  const threads = buildLiveThreads(
    {
      conversationWorklist: [],
      needsReplyToday: [],
    },
    {
      historyMessages: [{ conversationId: 'conv-history-only', messageId: 'm-2' }],
      historyEvents: [{ conversationId: 'conv-history-only', id: 'e-2' }],
    }
  );

  assert.equal(threads.length, 1);
  assert.equal(threads[0].id, 'conv-history-only');
  assert.equal(calls.buildHistoryBackedRuntimeRow.length, 1);
  assert.equal(calls.buildHistoryBackedRuntimeRow[0].liveRow, null);
  assert.equal(calls.buildRuntimeThread[0].row.__source, 'history-only-row');
  assert.equal(calls.buildRuntimeThread[0].options.threadDocument?.kind, 'mail_thread_document');
  assert.equal(calls.buildRuntimeThread[0].options.threadDocument?.messageCount, 1);
});

test('buildLiveThreads merges rows that belong to the same canonical customer across mailbox conversation ids', () => {
  const { buildLiveThreads, calls } = createBuildLiveThreadsHarness();

  const threads = buildLiveThreads(
    {
      conversationWorklist: [
        {
          conversationId: 'conv-a',
          mailboxConversationId: 'mailbox-a:conv-a',
          mailboxAddress: 'kons@hairtpclinic.com',
          customerKey: 'morten_bak_kristoffersen',
          customerEmail: 'morten@example.com',
          customerName: 'Morten Bak Kristoffersen',
          subject: 'Första ingressen',
          lastInboundAt: '2026-04-13T18:00:00.000Z',
        },
        {
          conversationId: 'conv-b',
          mailboxConversationId: 'mailbox-b:conv-b',
          mailboxAddress: 'contact@hairtpclinic.com',
          customerKey: 'morten_bak_kristoffersen',
          customerEmail: 'morten@example.com',
          customerName: 'Morten Bak Kristoffersen',
          subject: 'Andra ingressen',
          lastInboundAt: '2026-04-13T18:05:00.000Z',
          tags: ['all', 'act-now'],
        },
      ],
      needsReplyToday: [],
    },
    {
      historyMessages: [
        {
          conversationId: 'conv-a',
          messageId: 'm-1',
          mailboxId: 'kons@hairtpclinic.com',
          sentAt: '2026-04-13T18:00:00.000Z',
        },
        {
          conversationId: 'conv-b',
          messageId: 'm-2',
          mailboxId: 'contact@hairtpclinic.com',
          sentAt: '2026-04-13T18:05:00.000Z',
        },
      ],
      historyEvents: [],
    }
  );

  assert.equal(threads.length, 1);
  assert.equal(threads[0].id, 'morten_bak_kristoffersen');
  assert.equal(calls.buildHistoryBackedRuntimeRow.length, 1);
  assert.equal(calls.buildHistoryBackedRuntimeRow[0].messages.length, 2);
  assert.equal(calls.buildRuntimeThread.length, 1);
  assert.deepEqual(calls.buildRuntimeThread[0].row.sourceConversationIds.sort(), [
    'conv-a',
    'conv-b',
  ]);
  assert.deepEqual(calls.buildRuntimeThread[0].row.customerSummary.historyMailboxIds.sort(), [
    'contact@hairtpclinic.com',
    'kons@hairtpclinic.com',
  ]);
  assert.ok(calls.buildRuntimeThread[0].row.tags.includes('act-now'));
});

/**
 * Luckan mot legacy: en MATCHAD patient som skrivit från två olika adresser.
 *
 * Testet ovanför ger båda raderna samma `customerKey` — då räcker vilken
 * kandidat som helst. Här skiljer sig både nyckel och adress, och bara den
 * fastställda patientidentiteten binder ihop dem.
 *
 * Legacy nycklade på `patient:${patientId}` när `patientMatch.status` var
 * 'matched' (konversationer.html:5772). V2:s kandidatlista saknade fältet, så
 * e-postadressen vann över en starkare signal och patienten delades i två
 * rader — trots att servern redan hade gjort matchningen.
 *
 * Ordningen är hela poängen: listan returnerar FÖRSTA icke-tomma kandidaten.
 * Läggs patient-id sist blir det en no-op, eftersom customerEmail nästan alltid
 * finns.
 */
test('buildLiveThreads slår ihop en matchad patient med två olika adresser', () => {
  const { buildLiveThreads } = createBuildLiveThreadsHarness();

  const threads = buildLiveThreads(
    {
      conversationWorklist: [
        {
          conversationId: 'conv-privat',
          mailboxConversationId: 'kons@:conv-privat',
          mailboxAddress: 'kons@hairtpclinic.com',
          customerKey: 'anna_privat',
          customerEmail: 'anna@example.com',
          customerName: 'Anna Andersson',
          patientId: 'pat-4711',
          patientMatch: { status: 'matched', patientId: 'pat-4711' },
          subject: 'Fråga om tid',
          lastInboundAt: '2026-04-13T18:00:00.000Z',
        },
        {
          conversationId: 'conv-jobb',
          mailboxConversationId: 'contact@:conv-jobb',
          mailboxAddress: 'contact@hairtpclinic.com',
          customerKey: 'anna_jobb',
          customerEmail: 'anna.andersson@arbetet.se',
          customerName: 'Anna Andersson',
          patientId: 'pat-4711',
          patientMatch: { status: 'matched', patientId: 'pat-4711' },
          subject: 'Uppföljning',
          lastInboundAt: '2026-04-13T18:05:00.000Z',
        },
      ],
      needsReplyToday: [],
    },
    { historyMessages: [], historyEvents: [] }
  );

  assert.equal(threads.length, 1, 'en patient ska vara en tråd, oavsett avsändaradress');
  // normalizeKey saniterar avgränsare, så id:t jämförs på innehåll och inte på
  // exakt form — testet ska inte gå sönder av att saneringen ändras.
  assert.match(threads[0].id, /patient.pat.4711/, 'tråden ska nycklas på patienten');
  assert.doesNotMatch(threads[0].id, /anna_(privat|jobb)/, 'inte på någon av adressnycklarna');
});

test('en OMATCHAD patientgissning får inte slå ihop två kunder', () => {
  const { buildLiveThreads } = createBuildLiveThreadsHarness();

  // status !== 'matched' ⇒ patientId ska inte användas som nyckel. Servern
  // sätter redan patientId till null i det läget; grinden här är ett andra
  // försvar mot att en osäker matchning slår ihop två verkliga personer.
  const threads = buildLiveThreads(
    {
      conversationWorklist: [
        {
          conversationId: 'conv-1',
          mailboxAddress: 'kons@hairtpclinic.com',
          customerEmail: 'ett@example.com',
          patientMatch: { status: 'ambiguous', patientId: 'pat-gissning' },
          lastInboundAt: '2026-04-13T18:00:00.000Z',
        },
        {
          conversationId: 'conv-2',
          mailboxAddress: 'contact@hairtpclinic.com',
          customerEmail: 'tva@example.com',
          patientMatch: { status: 'ambiguous', patientId: 'pat-gissning' },
          lastInboundAt: '2026-04-13T18:05:00.000Z',
        },
      ],
      needsReplyToday: [],
    },
    { historyMessages: [], historyEvents: [] }
  );

  assert.equal(threads.length, 2, 'en osäker matchning får aldrig slå ihop två personer');
});
