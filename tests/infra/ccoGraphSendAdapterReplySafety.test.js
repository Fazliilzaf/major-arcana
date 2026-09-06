'use strict';

/**
 * P0-003 — ccoGraphSendAdapter.sendReply, den kanoniska sändvägen för
 * konversationssvar.
 *
 * Innan P0-003 gick POST /cco/runtime/conversation/:key/reply direkt på
 * graphSendConnector.sendReply och passerade DÄRMED förbi avlidenspärren och
 * avsändar-allowlisten. Adaptern är nu den ENDA sändvägen och kör samma grindar
 * som sendMail (avliden + kundutskicksspärr via audience:'customer') PLUS
 * avsändar-allowlisten — alla FÖRE connectorn.
 *
 * Testerna mäter att varje blockering ger NOLL connectorn-anrop: beviset för att
 * grinden sitter FÖRE den externa side effecten, inte efter.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCcoGraphSendAdapter } = require('../../src/infra/ccoGraphSendAdapter');
const { setDeceasedResolver } = require('../../src/ops/ccoDeceasedSendGuard');

const ALLOWLIST_KEY = 'ARCANA_GRAPH_SEND_ALLOWLIST';

function makeConnector() {
  const calls = [];
  return {
    calls,
    sendNewMessage: async () => ({ sentAt: 'now' }),
    sendReply: async (args) => {
      calls.push(args);
      return { id: 'draft-1', sendMode: 'reply_draft', provider: 'microsoft_graph' };
    },
  };
}

async function withAllowlist(value, fn) {
  const prev = process.env[ALLOWLIST_KEY];
  try {
    if (value === undefined) delete process.env[ALLOWLIST_KEY];
    else process.env[ALLOWLIST_KEY] = value;
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[ALLOWLIST_KEY];
    else process.env[ALLOWLIST_KEY] = prev;
  }
}

test('P0-003 sendReply: levande mottagare + allowlistad avsändare skickar exakt en gång', async () => {
  setDeceasedResolver(async () => false);
  await withAllowlist('kons@hairtpclinic.com', async () => {
    const connector = makeConnector();
    const adapter = createCcoGraphSendAdapter(connector);
    const res = await adapter.sendReply({
      from: 'kons@hairtpclinic.com',
      to: 'patient@example.com',
      replyToMessageId: 'graph-msg-1',
      conversationId: 'conv-1',
      subject: 'Re: Hej',
      body: 'Tack!',
      bodyHtml: '<p>Tack!</p>',
    });
    assert.equal(connector.calls.length, 1);
    // audience:'customer' deklareras av adaptern — annars blockerar
    // kundutskicksspärren i connectorn utskicket som "audience saknas".
    assert.deepEqual(connector.calls[0], {
      mailboxId: 'kons@hairtpclinic.com',
      sourceMailboxId: 'kons@hairtpclinic.com',
      audience: 'customer',
      conversationId: 'conv-1',
      replyToMessageId: 'graph-msg-1',
      subject: 'Re: Hej',
      body: 'Tack!',
      bodyHtml: '<p>Tack!</p>',
      to: ['patient@example.com'],
    });
    // Passthrough av connectorns resultat — routerns sendResult-form bevaras.
    assert.equal(res.id, 'draft-1');
  });
});

test('P0-003 sendReply: avliden mottagare → SEND_BLOCKED och NOLL connector-anrop', async () => {
  setDeceasedResolver(async ({ email }) => email === 'avliden@example.com');
  await withAllowlist('kons@hairtpclinic.com', async () => {
    const connector = makeConnector();
    const adapter = createCcoGraphSendAdapter(connector);
    await assert.rejects(
      () =>
        adapter.sendReply({
          from: 'kons@hairtpclinic.com',
          to: 'avliden@example.com',
          replyToMessageId: 'msg-1',
          body: 'Hej',
        }),
      (e) => e && e.code === 'SEND_BLOCKED'
    );
    assert.equal(connector.calls.length, 0, 'avliden mottagare får ALDRIG ett Graph-anrop');
  });
});

test('P0-003 sendReply: icke-allowlistad avsändare → SENDER_NOT_ALLOWLISTED och NOLL connector-anrop', async () => {
  setDeceasedResolver(async () => false);
  await withAllowlist('kons@hairtpclinic.com', async () => {
    const connector = makeConnector();
    const adapter = createCcoGraphSendAdapter(connector);
    await assert.rejects(
      () =>
        adapter.sendReply({
          from: 'attacker@evil.example',
          to: 'patient@example.com',
          replyToMessageId: 'msg-1',
          body: 'Hej',
        }),
      (e) => e && e.code === 'SENDER_NOT_ALLOWLISTED'
    );
    assert.equal(connector.calls.length, 0, 'otillåten avsändare får ALDRIG ett Graph-anrop');
  });
});

test('P0-003 sendReply: FAIL-CLOSED — tom allowlist blockerar avsändare', async () => {
  // En tom allowlist får aldrig tolkas som "allt är tillåtet". Samma fail-closed
  // semantik som ccoCommDraft.senderMailboxAllowed.
  setDeceasedResolver(async () => false);
  await withAllowlist(undefined, async () => {
    const connector = makeConnector();
    const adapter = createCcoGraphSendAdapter(connector);
    await assert.rejects(
      () =>
        adapter.sendReply({
          from: 'kons@hairtpclinic.com',
          to: 'patient@example.com',
          replyToMessageId: 'msg-1',
          body: 'x',
        }),
      (e) => e && e.code === 'SENDER_NOT_ALLOWLISTED'
    );
    assert.equal(connector.calls.length, 0);
  });
});

test('P0-003 sendReply: wildcard * i allowlisten godkänner avsändare', async () => {
  setDeceasedResolver(async () => false);
  await withAllowlist('*', async () => {
    const connector = makeConnector();
    const adapter = createCcoGraphSendAdapter(connector);
    await adapter.sendReply({
      from: 'kons@hairtpclinic.com',
      to: 'patient@example.com',
      replyToMessageId: 'msg-1',
      body: 'x',
    });
    assert.equal(connector.calls.length, 1);
  });
});

test('P0-003 sendReply: connector-fel vidarebefordras (ingen swallow → inget falskt sent)', async () => {
  // Ett fel från connectorn får inte sväljas till ett "det gick bra" — annars
  // läser anroparen det som skickat. Adaptern kastar vidare.
  setDeceasedResolver(async () => false);
  await withAllowlist('kons@hairtpclinic.com', async () => {
    const connector = {
      sendNewMessage: async () => ({}),
      sendReply: async () => {
        throw new Error('graph_down');
      },
    };
    const adapter = createCcoGraphSendAdapter(connector);
    await assert.rejects(
      () =>
        adapter.sendReply({
          from: 'kons@hairtpclinic.com',
          to: 'patient@example.com',
          replyToMessageId: 'msg-1',
          body: 'x',
        }),
      /graph_down/
    );
  });
});

test('P0-003 sendReply: saknad connector.sendReply → graph_send_unavailable (fail-closed)', async () => {
  setDeceasedResolver(async () => false);
  await withAllowlist('kons@hairtpclinic.com', async () => {
    const connector = { sendNewMessage: async () => ({}) }; // ingen sendReply
    const adapter = createCcoGraphSendAdapter(connector);
    await assert.rejects(
      () =>
        adapter.sendReply({
          from: 'kons@hairtpclinic.com',
          to: 'patient@example.com',
          replyToMessageId: 'msg-1',
          body: 'x',
        }),
      (e) => e && e.code === 'graph_send_unavailable'
    );
  });
});
