const test = require('node:test');
const assert = require('node:assert/strict');

const { createTransactionalMailer, parseFromAddress } = require('../../src/infra/transactionalMailer');

test('parseFromAddress extracts mailbox from display name format', () => {
  assert.equal(parseFromAddress('Hair TP Clinic <contact@hairtpclinic.com>'), 'contact@hairtpclinic.com');
  assert.equal(parseFromAddress('contact@hairtpclinic.com'), 'contact@hairtpclinic.com');
});

test('transactionalMailer returns no_recipient when to is empty', async () => {
  const { sendEmail } = createTransactionalMailer();
  const result = await sendEmail({ to: '', subject: 'Hej' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'no_recipient');
});

test('transactionalMailer uses Resend when RESEND_API_KEY is set', async () => {
  const prev = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_test_key';
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'resend-msg-1' }),
  });

  try {
    const { sendEmail } = createTransactionalMailer();
    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Bokning',
      html: '<p>Hej</p>',
    });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'resend');
    assert.equal(result.mode, 'live');
    assert.equal(result.messageId, 'resend-msg-1');
  } finally {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
    global.fetch = originalFetch;
  }
});

test('transactionalMailer falls back to Graph when Resend is not configured', async () => {
  const prev = process.env.RESEND_API_KEY;
  const prevGraphUser = process.env.ARCANA_GRAPH_USER_ID;
  const prevGraphDefault = process.env.ARCANA_GRAPH_DEFAULT_SENDER;
  delete process.env.RESEND_API_KEY;
  delete process.env.ARCANA_GRAPH_USER_ID;
  delete process.env.ARCANA_GRAPH_DEFAULT_SENDER;

  const graphSendConnector = {
    async sendNewMessage(input) {
      assert.equal(input.mailboxId, 'contact@hairtpclinic.com');
      assert.deepEqual(input.to, ['patient@example.com']);
      return { sendMode: 'send_mail', mailboxId: input.mailboxId };
    },
  };

  try {
    const { sendEmail } = createTransactionalMailer({ graphSendConnector });
    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Bokning',
      html: '<p>Hej</p>',
      text: 'Hej',
    });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'graph');
    assert.equal(result.mode, 'live');
    assert.equal(result.sendMode, 'send_mail');
  } finally {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
    if (prevGraphUser === undefined) delete process.env.ARCANA_GRAPH_USER_ID;
    else process.env.ARCANA_GRAPH_USER_ID = prevGraphUser;
    if (prevGraphDefault === undefined) delete process.env.ARCANA_GRAPH_DEFAULT_SENDER;
    else process.env.ARCANA_GRAPH_DEFAULT_SENDER = prevGraphDefault;
  }
});

test('transactionalMailer returns graph error without breaking caller contract', async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  const graphSendConnector = {
    async sendNewMessage() {
      throw new Error('mailbox_not_allowed');
    },
  };

  try {
    const { sendEmail } = createTransactionalMailer({ graphSendConnector });
    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Bokning',
      html: '<p>Hej</p>',
    });
    assert.equal(result.ok, false);
    assert.equal(result.provider, 'graph');
    assert.match(result.error, /mailbox_not_allowed/);
  } finally {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
});

test('transactionalMailer mock-mode when neither Resend nor Graph is available', async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    const { sendEmail } = createTransactionalMailer();
    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Bokning',
      html: '<p>Hej</p>',
    });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'none');
    assert.equal(result.mode, 'mock');
  } finally {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
});
