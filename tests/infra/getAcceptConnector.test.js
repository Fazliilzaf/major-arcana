'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGetAcceptConnector } = require('../../src/infra/getAcceptConnector');

function mockFetch(responder) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const r = responder(url, opts) || {};
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      text: async () => (r.body == null ? '' : JSON.stringify(r.body)),
    };
  };
  fn.calls = calls;
  return fn;
}

test('inert utan token/enabled — nätverkar aldrig', async () => {
  const fetchImpl = mockFetch(() => ({ body: {} }));
  const c = createGetAcceptConnector({ enabled: false, apiToken: '', fetchImpl });
  assert.equal(c.isConfigured(), false);
  const r = await c.sendDocument({ recipientEmail: 'a@b.se' });
  assert.equal(r.ok, false);
  assert.equal(r.disabled, true);
  assert.equal(fetchImpl.calls.length, 0, 'ingen fetch när inaktiverad');
});

test('enabled men token saknas → ej konfigurerad', () => {
  const c = createGetAcceptConnector({ enabled: true, apiToken: '' });
  assert.equal(c.isConfigured(), false);
});

test('sendDocument kräver recipientEmail', async () => {
  const c = createGetAcceptConnector({
    enabled: true,
    apiToken: 'tok',
    fetchImpl: mockFetch(() => ({})),
  });
  const r = await c.sendDocument({ documentName: 'Avtal' });
  assert.equal(r.ok, false);
  assert.match(r.error, /recipientEmail/);
});

test('sendDocument skapar+skickar dokument och returnerar id/signUrl', async () => {
  const fetchImpl = mockFetch((url, opts) => {
    assert.match(url, /\/documents$/);
    assert.equal(opts.method, 'POST');
    const sent = JSON.parse(opts.body);
    assert.equal(sent.is_automatic_sending, true);
    assert.equal(sent.recipients[0].email, 'anna@exempel.se');
    assert.equal(sent.recipients[0].first_name, 'Anna');
    assert.equal(sent.recipients[0].last_name, 'Karlsson');
    assert.match(opts.headers.Authorization, /^Bearer tok$/);
    return { body: { id: 'doc-123', sign_url: 'https://ga/sign/doc-123', status: 'sent' } };
  });
  const c = createGetAcceptConnector({ enabled: true, apiToken: 'tok', fetchImpl });
  const r = await c.sendDocument({
    documentName: 'Behandlingsavtal',
    recipientName: 'Anna Karlsson',
    recipientEmail: 'anna@exempel.se',
    fileName: 'avtal.pdf',
    fileContentBase64: 'BASE64',
  });
  assert.equal(r.ok, true);
  assert.equal(r.documentId, 'doc-123');
  assert.equal(r.signUrl, 'https://ga/sign/doc-123');
  assert.equal(r.status, 'sent');
});

test('getDocumentStatus läser status/signedAt', async () => {
  const fetchImpl = mockFetch((url) => {
    assert.match(url, /\/documents\/doc-123$/);
    return { body: { id: 'doc-123', status: 'signed', signed_at: '2026-06-25T10:00:00Z' } };
  });
  const c = createGetAcceptConnector({ enabled: true, apiToken: 'tok', fetchImpl });
  const r = await c.getDocumentStatus('doc-123');
  assert.equal(r.ok, true);
  assert.equal(r.status, 'signed');
  assert.equal(r.signedAt, '2026-06-25T10:00:00Z');
});

test('API-fel → ok:false med status/error', async () => {
  const fetchImpl = mockFetch(() => ({ ok: false, status: 401, body: { error: 'unauthorized' } }));
  const c = createGetAcceptConnector({ enabled: true, apiToken: 'tok', fetchImpl });
  const r = await c.sendDocument({ recipientEmail: 'a@b.se' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.error, 'unauthorized');
});
