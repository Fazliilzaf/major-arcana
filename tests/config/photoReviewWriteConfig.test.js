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
