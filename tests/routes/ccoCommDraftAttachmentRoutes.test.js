'use strict';

/* Steg 1b — bilage-routes på utkast: upload / serve / delete. Bytes lagras på
 * disk under config.stateRoot/cco-comm-attachments, metadata i storen. RBAC,
 * storleks-/typgräns, tenant-scoping. INGEN live-send. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommDraftRouter } = require('../../src/routes/ccoCommDraft');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-comm-att-'));
  const app = express();
  app.use(
    '/api/v1',
    createCcoCommDraftRouter({
      config: {
        ccoCommDraftStorePath: path.join(tempDir, 'cco-comm-draft.json'),
        stateRoot: tempDir,
        buildVersion: 'test',
      },
      requireAuth: (req, _res, next) => {
        req.auth = {
          tenantId: req.headers['x-tenant'] || 'hairtpclinic',
          userId: req.headers['x-user'] || 'u1',
          role: req.headers['x-role'] || 'operator',
        };
        next();
      },
      commDraftStore: null,
      executionGateway: null,
      openai: null,
      auditLog: null,
    })
  );
  return { app, tempDir };
}

function j(baseUrl, method, route, { role = 'operator', tenant, body } = {}) {
  const headers = { 'content-type': 'application/json', 'x-role': role };
  if (tenant) headers['x-tenant'] = tenant;
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

function uploadFile(baseUrl, draftId, { role = 'operator', tenant, bytes, type, name } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  const headers = { 'x-role': role };
  if (tenant) headers['x-tenant'] = tenant;
  return fetch(`${baseUrl}/cco-comm/drafts/${draftId}/attachments`, {
    method: 'POST',
    headers,
    body: form,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

async function newDraft(baseUrl) {
  const created = await j(baseUrl, 'POST', '/cco-comm/drafts', {
    body: { tenantId: 'hairtpclinic', customerId: 'cust-1', channel: 'email', subject: 'Hej' },
  });
  assert.equal(created.status, 201);
  return created.json.draft.draftId;
}

test('upload → serve → delete happy path', async () => {
  const { app, tempDir } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const draftId = await newDraft(baseUrl);
    const bytes = Buffer.from('%PDF-1.4 hej patient');
    const up = await uploadFile(baseUrl, draftId, {
      bytes,
      type: 'application/pdf',
      name: 'preop.pdf',
    });
    assert.equal(up.status, 201);
    const attId = up.json.attachment.attachmentId;
    assert.equal(up.json.attachment.name, 'preop.pdf');
    assert.equal(up.json.attachment.size, bytes.length);

    // Bytes hamnade på disk under stateRoot/cco-comm-attachments (inte i JSON).
    const onDisk = await fs.readFile(path.join(tempDir, 'cco-comm-attachments', draftId, attId));
    assert.deepEqual(onDisk, bytes);

    const content = await fetch(
      `${baseUrl}/cco-comm/drafts/${draftId}/attachments/${attId}/content`,
      { headers: { 'x-role': 'operator' } }
    );
    assert.equal(content.status, 200);
    assert.equal(content.headers.get('content-type'), 'application/pdf');
    assert.match(content.headers.get('content-disposition') || '', /inline/);
    assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);

    const del = await j(baseUrl, 'DELETE', `/cco-comm/drafts/${draftId}/attachments/${attId}`);
    assert.equal(del.status, 200);
    // Filen är raderad + serve ger 404.
    const gone = await fetch(`${baseUrl}/cco-comm/drafts/${draftId}/attachments/${attId}/content`, {
      headers: { 'x-role': 'operator' },
    });
    assert.equal(gone.status, 404);
  });
});

test('otillåten filtyp avvisas (415) och inget lagras', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const draftId = await newDraft(baseUrl);
    const up = await uploadFile(baseUrl, draftId, {
      bytes: Buffer.from('MZ...'),
      type: 'application/x-msdownload',
      name: 'virus.exe',
    });
    assert.equal(up.status, 415);
    const list = await j(baseUrl, 'GET', `/cco-comm/drafts/${draftId}`);
    // draften ska inte ha någon bilaga
    assert.equal((list.json.draft.attachments || []).length, 0);
  });
});

test('fel tenant kan inte ladda upp (404, ingen läcka)', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const draftId = await newDraft(baseUrl); // tenant hairtpclinic
    const up = await uploadFile(baseUrl, draftId, {
      tenant: 'other-tenant',
      bytes: Buffer.from('hej'),
      type: 'image/png',
      name: 'a.png',
    });
    assert.equal(up.status, 404);
  });
});

test('upload validerar draftId före disk-write (path traversal skapar ingen fil)', async () => {
  const { app, tempDir } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const up = await uploadFile(baseUrl, '..%2Fevil-draft', {
      bytes: Buffer.from('hej'),
      type: 'image/png',
      name: 'a.png',
    });
    assert.equal(up.status, 404);

    await assert.rejects(
      fs.stat(path.join(tempDir, 'evil-draft')),
      (error) => error && error.code === 'ENOENT'
    );
    await assert.rejects(
      fs.stat(path.join(tempDir, 'cco-comm-attachments', '..', 'evil-draft')),
      (error) => error && error.code === 'ENOENT'
    );
  });
});
