'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recommendNextBestAction,
  ACTION_DEFINITIONS,
  getThreadDirectionStats,
} = require('../../src/risk/nextBestAction');

test('urgent sentiment → escalate_medical (oavsett intent)', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'urgent', confidence: 0.9 },
    intent: { code: 'booking_request', confidence: 0.7 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'escalate_medical');
  assert.ok(r.primaryAction.confidence >= 0.9);
});

test('intent=complaint → escalate_complaint', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'negative', confidence: 0.6 },
    intent: { code: 'complaint', confidence: 0.8 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'escalate_complaint');
  assert.ok(r.primaryAction.reasoning.length > 0);
});

test('anxious sentiment → reply_with_empathy', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'anxious', confidence: 0.7 },
    intent: { code: 'unclear', confidence: 0.3 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'reply_with_empathy');
});

test('anxious + booking → primary empathy, secondary booking', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'anxious', confidence: 0.6 },
    intent: { code: 'booking_request', confidence: 0.75 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'reply_with_empathy');
  assert.ok(r.secondaryActions.some((a) => a.code === 'reply_with_booking_suggestion'));
});

test('intent=cancellation → confirm_cancellation', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'neutral', confidence: 0.4 },
    intent: { code: 'cancellation', confidence: 0.8 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'confirm_cancellation');
});

test('intent=booking_request + positive → reply_with_booking_suggestion (hög confidence)', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'positive', confidence: 0.7 },
    intent: { code: 'booking_request', confidence: 0.85 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'reply_with_booking_suggestion');
  assert.ok(r.primaryAction.confidence >= 0.9);
});

test('intent=pricing_question → reply_with_pricing', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'neutral', confidence: 0.3 },
    intent: { code: 'pricing_question', confidence: 0.8 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'reply_with_pricing');
});

test('intent=follow_up → mark_handled', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'positive', confidence: 0.5 },
    intent: { code: 'follow_up', confidence: 0.7 },
    messages: [],
  });
  assert.equal(r.primaryAction.code, 'mark_handled');
});

test('vi skickade senast >3 dagar sedan → send_reminder', () => {
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
  const r = recommendNextBestAction({
    sentiment: { code: 'neutral' },
    intent: { code: 'unclear' },
    messages: [
      { direction: 'inbound', body: 'Hej', sentAt: new Date(Date.now() - 5 * 86400000).toISOString() },
      { direction: 'outbound', body: 'Hej, här är info', sentAt: fourDaysAgo },
    ],
  });
  assert.equal(r.primaryAction.code, 'send_reminder');
});

test('vi skickade senast bara 1 dag sedan → await_response', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'neutral' },
    intent: { code: 'unclear' },
    messages: [
      { direction: 'inbound', body: 'Hej', sentAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      { direction: 'outbound', body: 'Svar', sentAt: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
  });
  assert.equal(r.primaryAction.code, 'await_response');
});

test('intent=unclear utan andra signaler → ask_clarification', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'neutral' },
    intent: { code: 'unclear' },
    messages: [
      { direction: 'inbound', body: '???', sentAt: new Date().toISOString() },
    ],
  });
  assert.equal(r.primaryAction.code, 'ask_clarification');
});

test('alla actions har required fields', () => {
  for (const code of Object.keys(ACTION_DEFINITIONS)) {
    const def = ACTION_DEFINITIONS[code];
    assert.ok(def.code, `${code} saknar code`);
    assert.ok(def.label, `${code} saknar label`);
    assert.ok(def.icon, `${code} saknar icon`);
    assert.ok(def.primaryButton, `${code} saknar primaryButton`);
    assert.ok(def.description, `${code} saknar description`);
  }
});

test('getThreadDirectionStats räknar inbound/outbound korrekt', () => {
  const stats = getThreadDirectionStats([
    { direction: 'inbound', sentAt: '2026-04-25T10:00:00Z' },
    { direction: 'outbound', sentAt: '2026-04-25T11:00:00Z' },
    { direction: 'inbound', sentAt: '2026-04-25T12:00:00Z' },
  ]);
  assert.equal(stats.inbound, 2);
  assert.equal(stats.outbound, 1);
  assert.equal(stats.lastDirection, 'inbound');
});

test('reasoning är begränsad till 6 items i secondary actions', () => {
  const r = recommendNextBestAction({
    sentiment: { code: 'positive' },
    intent: { code: 'booking_request' },
    messages: [],
  });
  for (const a of r.secondaryActions) {
    assert.ok(a.reasoning.length <= 5, `${a.code} reasoning too long`);
  }
});
