'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFromAddress,
  extractEmailAddress,
  extractDomain,
  resolveResendDomain,
  resolveResendFrom,
  resolveResendReplyTo,
  resolveGraphSendFrom,
  getResendRuntimeSummary,
} = require('../../src/infra/resendConfig');

test('resolveResendFrom builds booking@notifications when unset', () => {
  const env = { RESEND_DOMAIN: 'notifications.hairtpclinic.com' };
  assert.equal(
    resolveResendFrom(env),
    'Hair TP Clinic <booking@notifications.hairtpclinic.com>'
  );
});

test('resolveResendFrom respects explicit RESEND_FROM', () => {
  const env = {
    RESEND_DOMAIN: 'notifications.hairtpclinic.com',
    RESEND_FROM: 'Hair TP Clinic <noreply@mail.hairtpclinic.com>',
  };
  assert.equal(resolveResendFrom(env), env.RESEND_FROM);
  assert.equal(extractDomain(env.RESEND_FROM), 'mail.hairtpclinic.com');
});

test('resolveResendReplyTo defaults to contact@', () => {
  assert.equal(resolveResendReplyTo({}), 'contact@hairtpclinic.com');
  assert.equal(resolveResendReplyTo({ RESEND_REPLY_TO: 'info@hairtpclinic.com' }), 'info@hairtpclinic.com');
});

test('resolveGraphSendFrom is independent of RESEND_FROM', () => {
  const env = {
    RESEND_FROM: 'Hair TP Clinic <booking@notifications.hairtpclinic.com>',
    ARCANA_GRAPH_USER_ID: 'fazli@hairtpclinic.com',
  };
  assert.equal(resolveGraphSendFrom(env), 'fazli@hairtpclinic.com');
});

test('getResendRuntimeSummary reports configured state', () => {
  const summary = getResendRuntimeSummary({
    RESEND_API_KEY: 're_test',
    RESEND_DOMAIN: 'notifications.hairtpclinic.com',
  });
  assert.equal(summary.configured, true);
  assert.equal(summary.domain, 'notifications.hairtpclinic.com');
  assert.equal(summary.fromMailbox, 'booking@notifications.hairtpclinic.com');
  assert.equal(summary.replyTo, 'contact@hairtpclinic.com');
});

test('extractEmailAddress parses display name format', () => {
  assert.equal(extractEmailAddress('Hair TP Clinic <booking@notifications.hairtpclinic.com>'), 'booking@notifications.hairtpclinic.com');
  assert.equal(extractEmailAddress('contact@hairtpclinic.com'), 'contact@hairtpclinic.com');
});

test('buildFromAddress uses domain and local part', () => {
  assert.equal(
    buildFromAddress({ domain: 'mail.example.com', localPart: 'hello' }),
    'Hair TP Clinic <hello@mail.example.com>'
  );
});
