'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

test('Cliento booking store follows ARCANA_STATE_ROOT persistent storage', () => {
  const stateRoot = path.join('/tmp', 'arcana-calendar-config-test');
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      "const {config}=require('./src/config');process.stdout.write(config.clientoBookingStorePath);",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARCANA_STATE_ROOT: stateRoot,
        ARCANA_CLIENTO_BOOKING_STORE_PATH: '',
      },
      encoding: 'utf8',
    }
  );
  assert.equal(output, path.join(stateRoot, 'cco', 'cliento-bookings.json'));
});

test('ARCANA_CLIENTO_BOOKING_STORE_PATH can explicitly override the persistent path', () => {
  const override = path.join('/tmp', 'custom-cliento-bookings.json');
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      "const {config}=require('./src/config');process.stdout.write(config.clientoBookingStorePath);",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARCANA_CLIENTO_BOOKING_STORE_PATH: override,
      },
      encoding: 'utf8',
    }
  );
  assert.equal(output, override);
});
