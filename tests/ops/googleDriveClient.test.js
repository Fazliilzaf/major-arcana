'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isGoogleDriveConfigured,
  loadServiceAccountFromEnv,
  resolveServiceAccountSource,
} = require('../../src/lib/googleDriveClient');

describe('googleDriveClient', () => {
  it('resolveServiceAccountSource accepts inline JSON', () => {
    const source = resolveServiceAccountSource('{"client_email":"a@b.iam.gserviceaccount.com","private_key":"x"}');
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
});
