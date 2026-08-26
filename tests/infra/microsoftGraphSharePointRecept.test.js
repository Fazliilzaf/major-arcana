'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMicrosoftGraphSharePointRecept,
  encodePathSegments,
} = require('../../src/infra/microsoftGraphSharePointRecept');
const {
  createOrdinationReceptSharePointPublisher,
} = require('../../src/ops/ordinationReceptSharePointPublish');

function createJsonResponse({ status = 200, body = {}, headers = {} } = {}) {
  const normalizedHeaders = headers && typeof headers === 'object' ? headers : {};
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name = '') {
        const key = String(name || '').toLowerCase();
        if (!key) return null;
        const direct = normalizedHeaders[key];
        if (direct !== undefined && direct !== null) return String(direct);
        const pair = Object.entries(normalizedHeaders).find(
          ([entryKey]) => String(entryKey || '').toLowerCase() === key
        );
        if (!pair) return null;
        return String(pair[1] ?? '');
      },
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function createBufferResponse({ status = 200, buffer, contentType = 'application/pdf' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name = '') {
        const key = String(name || '').toLowerCase();
        if (key === 'content-type') return contentType;
        return null;
      },
    },
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
    async json() {
      return {};
    },
    async text() {
      return '';
    },
  };
}

const SITE_ID = 'sharepoint-site-1';

function configuredConnector({ fetchImpl }) {
  return createMicrosoftGraphSharePointRecept({
    tenantId: 'tenant-1',
    clientId: 'client-1',
    clientSecret: 'client-secret-1',
    siteId: SITE_ID,
    fetchImpl,
  });
}

function tokenResponse() {
  return createJsonResponse({ body: { access_token: 'token-abc', expires_in: 3600 } });
}

test('uploadReceptDocument builds the correct PUT request against drive root content endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) return tokenResponse();
    if (String(url).includes(':/content')) {
      return createJsonResponse({
        status: 201,
        body: {
          id: 'item-1',
          name: 'recept.pdf',
          size: 12345,
          webUrl: 'https://sharepoint/recept.pdf',
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = configuredConnector({ fetchImpl });
  const result = await connector.uploadReceptDocument({
    fileName: 'recept.pdf',
    content: Buffer.from('%PDF-1.4 fake'),
    mimeType: 'application/pdf',
    folderPath: 'recept',
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'sharepoint_e_recept');
  assert.equal(result.itemId, 'item-1');
  assert.equal(result.webUrl, 'https://sharepoint/recept.pdf');

  const contentCall = calls.find((item) => String(item.url).includes('/content'));
  assert.equal(contentCall.options.method, 'PUT');
  assert.ok(
    String(contentCall.url).includes(`/sites/${SITE_ID}/drive/root:/recept/recept.pdf:/content`)
  );
  assert.equal(String(contentCall.options.headers.authorization || '').startsWith('Bearer '), true);
  assert.equal(contentCall.options.headers['content-type'], 'application/pdf');
  assert.equal(Buffer.isBuffer(contentCall.options.body), true);
  assert.equal(String(contentCall.options.body), '%PDF-1.4 fake');
});

test('fetchReceptDocument GETs the content endpoint and returns a PDF buffer', async () => {
  const calls = [];
  const pdfBytes = Buffer.from('APPLICATION/PDF 1.4');
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) return tokenResponse();
    if (String(url).includes('/content')) {
      return createBufferResponse({ buffer: pdfBytes, contentType: 'application/pdf' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = configuredConnector({ fetchImpl });
  const result = await connector.fetchReceptDocument({
    fileName: 'recept.pdf',
    folderPath: 'recept',
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'sharepoint_e_recept');
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(Buffer.isBuffer(result.content), true);
  assert.equal(String(result.content), 'APPLICATION/PDF 1.4');

  const contentCall = calls.find((item) => String(item.url).includes('/content'));
  assert.equal(contentCall.options.method, 'GET');
  assert.ok(
    String(contentCall.url).includes(`/sites/${SITE_ID}/drive/root:/recept/recept.pdf:/content`)
  );
  assert.equal(
    String(String(contentCall.options.headers.authorization)).startsWith('Bearer '),
    true
  );
});

test('ensureReceptFolder creates the folder when it is missing (404 -> POST children)', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/oauth2/v2.0/token')) return tokenResponse();
    if (String(url).includes('/sites/sharepoint-site-1/drive/root:/recept')) {
      return createJsonResponse({ status: 404, body: { error: { message: 'not found' } } });
    }
    if (String(url).includes('/root:/children')) {
      return createJsonResponse({
        status: 201,
        body: { id: 'folder-1', name: 'recept', webUrl: 'https://sharepoint/recept' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = configuredConnector({ fetchImpl });
  const result = await connector.ensureReceptFolder({ folderPath: 'recept' });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.folderId, 'folder-1');

  const createCall = calls.find(
    (item) => item.options.method === 'POST' && !String(item.url).includes('/oauth2/v2.0/token')
  );
  assert.equal(
    createCall.url,
    `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:/children`
  );
  const createHeaders = createCall.options.headers || {};
  assert.equal(createHeaders['content-type'], 'application/json');
  const body = JSON.parse(String(createCall.options.body || '{}'));
  assert.equal(body.name, 'recept');
  assert.deepEqual(body.folder, {});
  assert.equal(body['@microsoft.graph.conflictBehavior'], 'replace');
});

test('ensureReceptFolder reuses the existing folder when found', async () => {
  const fetchImpl = async (url, _options = {}) => {
    if (String(url).includes('/oauth2/v2.0/token')) return tokenResponse();
    if (String(url).includes('/sites/sharepoint-site-1/drive/root:/recept')) {
      return createJsonResponse({
        body: { id: 'folder-1', name: 'recept', webUrl: 'https://sharepoint/recept' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const connector = configuredConnector({ fetchImpl });
  const result = await connector.ensureReceptFolder({ folderPath: 'recept' });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.folderId, 'folder-1');
});

test('connector is fail-soft when credentials/site are missing (never fake success)', async () => {
  const connector = createMicrosoftGraphSharePointRecept({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    siteId: '',
    fetchImpl: async () => {
      throw new Error('Should not be called when not configured');
    },
  });

  assert.equal(connector.isConfigured(), false);
  const upload = await connector.uploadReceptDocument({
    fileName: 'recept.pdf',
    content: Buffer.from('x'),
  });
  assert.deepEqual(upload, {
    ok: false,
    reason: 'not_configured',
    provider: 'sharepoint_e_recept',
  });
  const fetchResult = await connector.fetchReceptDocument({ fileName: 'recept.pdf' });
  assert.deepEqual(fetchResult, {
    ok: false,
    reason: 'not_configured',
    provider: 'sharepoint_e_recept',
  });
  const folder = await connector.ensureReceptFolder({ folderPath: 'recept' });
  assert.deepEqual(folder, {
    ok: false,
    reason: 'not_configured',
    provider: 'sharepoint_e_recept',
  });
});

test('publication service returns not_configured when connector is absent', async () => {
  const publisher = createOrdinationReceptSharePointPublisher({ connector: null, logger: console });
  assert.equal(publisher.isConfigured(), false);
  const result = await publisher.publishReceptDocument({
    patientId: 'p-1',
    content: Buffer.from('%PDF'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_configured');
  assert.equal(result.provider, 'sharepoint_e_recept');
  assert.equal(result.registryId, 'ordination_recept');
});

test('publication service uploads via connector and reports ok (real configured path)', async () => {
  const calls = [];
  const connector = createMicrosoftGraphSharePointRecept({
    tenantId: 'tenant-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    siteId: SITE_ID,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).includes('/oauth2/v2.0/token')) return tokenResponse();
      if (String(url).includes('/content')) {
        return createJsonResponse({
          status: 201,
          body: {
            id: 'item-9',
            name: 'ordination-recept-anna-2026-08-01.pdf',
            size: 99,
            webUrl: 'https://sharepoint/recepts/ordination-recept-anna.pdf',
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const publisher = createOrdinationReceptSharePointPublisher({ connector, logger: console });

  const result = await publisher.publishReceptDocument({
    patientId: 'p-42',
    patientName: 'Anna Andersson',
    content: Buffer.from('%PDF-1.4 real'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'sharepoint_e_recept');
  assert.equal(result.registryId, 'ordination_recept');
  assert.equal(result.itemId, 'item-9');
  assert.equal(result.webUrl, 'https://sharepoint/recepts/ordination-recept-anna.pdf');

  const contentCall = calls.find((item) => String(item.url).includes('/content'));
  assert.equal(contentCall.options.method, 'PUT');
  assert.ok(String(contentCall.url).includes('/drive/root:/recept/ordination-recept-anna'));
});
