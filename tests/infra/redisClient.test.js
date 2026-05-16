const test = require('node:test');
const assert = require('node:assert/strict');

const { createRedisConnection } = require('../../src/infra/redisClient');

test('createRedisConnection with empty URL skips TCP and reports disabled', async () => {
  const redis = createRedisConnection({ url: '', required: false });
  const status = await redis.connect();
  assert.equal(status.enabled, false);
  assert.equal(status.connected, false);
  assert.equal(status.urlConfigured, false);
  assert.equal(redis.isConnected(), false);
  assert.equal(redis.getClient(), null);
  await redis.close();
});

test('createRedisConnection getStatus reflects required flag before connect', () => {
  const redis = createRedisConnection({
    url: '   ',
    required: true,
  });
  const status = redis.getStatus();
  assert.equal(status.required, true);
  assert.equal(status.urlConfigured, false);
});

test('createRedisConnection close is safe when never connected', async () => {
  const redis = createRedisConnection({ url: '' });
  await redis.close();
  await redis.close();
});

test('createRedisConnection blank url raknas som ej konfigurerad', async () => {
  const redis = createRedisConnection({ url: '  \n\t  ', required: false });
  const status = await redis.connect();
  assert.equal(status.urlConfigured, false);
  assert.equal(status.enabled, false);
  assert.equal(status.connected, false);
});

test('createRedisConnection connect ar idempotent med tom url', async () => {
  const redis = createRedisConnection({ url: '' });
  const a = await redis.connect();
  const b = await redis.connect();
  assert.equal(a.connected, false);
  assert.equal(b.connected, false);
  assert.equal(redis.isConnected(), false);
});
