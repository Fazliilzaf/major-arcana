'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isGoogleDriveConfigured,
  loadServiceAccountFromEnv,
  resolveServiceAccountSource,
  getDriveFileName,
  driveMetadataRequest,
} = require('../../src/lib/googleDriveClient');

describe('googleDriveClient', () => {
  it('resolveServiceAccountSource accepts inline JSON', () => {
    const source = resolveServiceAccountSource(
      '{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}'
    );
    assert.equal(source.kind, 'inline');
  });

  it('isGoogleDriveConfigured is false without env', () => {
    assert.equal(isGoogleDriveConfigured({}), false);
  });

  it('loadServiceAccountFromEnv parses inline JSON + folder id', () => {
    const config = loadServiceAccountFromEnv({
      ARCANA_GOOGLE_DRIVE_FOLDER_ID: 'folder123',
      ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON:
        '{"client_email":"svc@test.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"}',
    });
    assert.equal(config.ok, true);
    assert.equal(config.folderId, 'folder123');
    assert.equal(config.serviceAccountEmail, 'svc@test.iam.gserviceaccount.com');
  });

  it('driveMetadataRequest retries on 429 then succeeds', async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => '0' },
          json: async () => ({ error: { message: 'Rate Limit Exceeded' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ name: 'Journal – Abdulaziz.pdf' }),
      };
    };
    try {
      const result = await driveMetadataRequest('https://example.test/file', {
        accessToken: 'token',
        retries: 2,
      });
      assert.equal(result.ok, true);
      assert.equal(result.payload.name, 'Journal – Abdulaziz.pdf');
      assert.equal(calls, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('getDriveFileName returns Drive UTF-8 name (mocked)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ name: 'Friskförsäkran Hårtransplantation.pdf' }),
    });
    try {
      const result = await getDriveFileName({
        driveFileId: 'drive-abc',
        accessToken: 'test-token',
      });
      assert.equal(result.ok, true);
      assert.match(result.name, /ö/);
      assert.equal(result.error, null);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
