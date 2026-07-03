'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('enablePhotoReviewWrite blocked on prod hostname', () => {
  process.env.ENABLE_PHOTO_REVIEW_WRITE = 'true';
  process.env.RENDER_EXTERNAL_HOSTNAME = 'arcana.hairtpclinic.se';
  process.env.PUBLIC_BASE_URL = 'https://arcana.hairtpclinic.se';
  delete require.cache[require.resolve('../../src/config.js')];
  const { config } = require('../../src/config.js');
  assert.equal(config.enablePhotoReviewWrite, false);
});

test('enablePhotoReviewWrite allowed on staging hostname', () => {
  process.env.ENABLE_PHOTO_REVIEW_WRITE = 'true';
  process.env.RENDER_EXTERNAL_HOSTNAME = 'arcana-staging.onrender.com';
  process.env.PUBLIC_BASE_URL = 'https://arcana-staging.onrender.com';
  delete require.cache[require.resolve('../../src/config.js')];
  const { config } = require('../../src/config.js');
  assert.equal(config.enablePhotoReviewWrite, true);
});

test('enableImportReviewWrite requires operator canary master flag', () => {
  process.env.ENABLE_CCO_OPERATOR_CANARY = 'false';
  process.env.ENABLE_IMPORT_REVIEW_WRITE = 'true';
  delete require.cache[require.resolve('../../src/config.js')];
  const { config } = require('../../src/config.js');
  assert.equal(config.enableImportReviewWrite, false);
});

test('enableImportReviewWrite on when canary master + import flag', () => {
  process.env.ENABLE_CCO_OPERATOR_CANARY = 'true';
  process.env.ENABLE_IMPORT_REVIEW_WRITE = 'true';
  delete require.cache[require.resolve('../../src/config.js')];
  const { config } = require('../../src/config.js');
  assert.equal(config.enableImportReviewWrite, true);
  assert.equal(config.importReviewCanaryMax, 25);
});

test('enableDriveImportReviewWrite requires operator canary master flag', () => {
  process.env.ENABLE_CCO_OPERATOR_CANARY = 'false';
  process.env.ENABLE_DRIVE_IMPORT_REVIEW_WRITE = 'true';
  delete require.cache[require.resolve('../../src/config.js')];
  const { config } = require('../../src/config.js');
  assert.equal(config.enableDriveImportReviewWrite, false);
});

test('enableDriveImportReviewWrite on when canary master + drive flag', () => {
  process.env.ENABLE_CCO_OPERATOR_CANARY = 'true';
  process.env.ENABLE_DRIVE_IMPORT_REVIEW_WRITE = 'true';
  delete require.cache[require.resolve('../../src/config.js')];
  const { config } = require('../../src/config.js');
  assert.equal(config.enableDriveImportReviewWrite, true);
  assert.equal(config.driveImportReviewCanaryMax, 50);
});
