'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PREVIEW = path.join(ROOT, 'public', 'major-arcana-preview');

function readPreview(file) {
  return fs.readFileSync(path.join(PREVIEW, file), 'utf8');
}

test('tablet calendar split assets wired in index.html', () => {
  const html = readPreview('index.html');
  assert.match(html, /data-cco-tablet-calendar-open/);
  assert.match(html, /cco-tablet-shell\.js/);
  assert.match(html, /booking-lazy-load\.js/);
});

test('booking-mobile-calendar supports tablet viewport', () => {
  const js = readPreview('booking-mobile-calendar-day.js');
  assert.match(js, /MQ_TABLET/);
  assert.match(js, /isCalendarViewport/);
  assert.match(js, /dataset\.tabletMode/);
});

test('cco-tablet-shell syncs calendar split flag', () => {
  const js = readPreview('cco-tablet-shell.js');
  assert.match(js, /data-cco-tablet-calendar-split/);
  assert.match(js, /syncCalendarSplit/);
  assert.match(js, /wireCalendarTrigger/);
});

test('cco-tablet-shell.css has calendar side panel grid', () => {
  const css = readPreview('cco-tablet-shell.css');
  assert.match(css, /cco-mobile-calendar-month/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /data-cco-tablet-calendar-split/);
});

test('verify-adaptive-layout-prod script exists with 5 viewports', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-adaptive-layout-prod.js'), 'utf8');
  assert.match(script, /320/);
  assert.match(script, /390/);
  assert.match(script, /834/);
  assert.match(script, /768/);
  assert.match(script, /1024/);
  assert.match(script, /1440/);
});
