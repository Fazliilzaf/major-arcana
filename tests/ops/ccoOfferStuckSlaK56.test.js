'use strict';

/* K56 — prioritetsordning/SLA i fastnade offerter.
 * buildCommercialOwnerOfferOverview graderar redan fastnade offerter med en
 * SLA-tier (critical/high/elevated), en fastnad-orsak (opened_no_action vs
 * awaiting_first_response) och en priorityScore, och sorterar stuck-bucketen
 * mest akut först. totals.stuck-kontraktet (K52) lämnas oförändrat. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCommercialOwnerOfferOverview,
  deriveStuckSlaSignal,
} = require('../../src/ops/ccoCommercialStore');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-02T00:00:00.000Z');

function sentCase(id, daysAgo, extra = {}) {
  return {
    commercialCaseId: id,
    customerId: id,
    customerName: id,
    quoteStatus: 'sent',
    quoteSentAt: new Date(NOW - daysAgo * DAY).toISOString(),
    ...extra,
  };
}

// ── 1. SLA-tier graderas på ålder ────────────────────────────────────────────

test('K56: fastnade offerter får SLA-tier efter ålder (elevated/high/critical)', () => {
  const cases = [
    sentCase('elevated', 8), // >7d → fastnad, <10d → elevated
    sentCase('high', 11), // >=10d → high
    sentCase('critical', 20), // >=14d → critical
  ];
  const overview = buildCommercialOwnerOfferOverview(cases, { nowMs: NOW });
  assert.equal(overview.totals.stuck, 3, 'alla tre räknas som fastnade');
  const byId = Object.fromEntries(overview.buckets.stuck.map((r) => [r.commercialCaseId, r]));
  assert.equal(byId.elevated.slaTier, 'elevated');
  assert.equal(byId.high.slaTier, 'high');
  assert.equal(byId.critical.slaTier, 'critical');
  assert.equal(byId.elevated.stuckReason, 'awaiting_first_response');
  assert.equal(byId.critical.daysSinceSent, 20);
});

// ── 2. Prioritetsordning: mest akut först ────────────────────────────────────

test('K56: stuck-bucketen sorteras mest akut (högst priorityScore) först', () => {
  const cases = [sentCase('elevated', 8), sentCase('critical', 20), sentCase('high', 11)];
  const overview = buildCommercialOwnerOfferOverview(cases, { nowMs: NOW });
  assert.deepEqual(
    overview.buckets.stuck.map((r) => r.commercialCaseId),
    ['critical', 'high', 'elevated']
  );
  // priorityScore strikt fallande.
  const scores = overview.buckets.stuck.map((r) => r.priorityScore);
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2], `fallande: ${scores}`);
});

// ── 3. Öppnad-men-orörd väger tyngre än inget-svar vid samma ålder ───────────

test('K56: opened_no_action prioriteras över awaiting_first_response vid samma ålder', () => {
  const openedStuck = sentCase('opened', 12, {
    // öppnad för 5 dagar sedan (>3d utan åtgärd → openedButStuck). Read-modellen
    // läser de normaliserade fälten quoteOpenCount/quoteOpenedAt (inte quoteOpens).
    quoteOpenCount: 1,
    quoteOpenedAt: new Date(NOW - 5 * DAY).toISOString(),
  });
  const waitingStuck = sentCase('waiting', 12);
  const overview = buildCommercialOwnerOfferOverview([waitingStuck, openedStuck], { nowMs: NOW });
  const opened = overview.buckets.stuck.find((r) => r.commercialCaseId === 'opened');
  const waiting = overview.buckets.stuck.find((r) => r.commercialCaseId === 'waiting');
  assert.equal(opened.stuckReason, 'opened_no_action');
  assert.equal(waiting.stuckReason, 'awaiting_first_response');
  assert.equal(opened.daysSinceLastOpen, 5);
  assert.ok(opened.priorityScore > waiting.priorityScore, 'öppnad-men-orörd vinner');
  assert.equal(overview.buckets.stuck[0].commercialCaseId, 'opened', 'öppnad hamnar först');
});

// ── 4. stuckSlaSummary räknar per tier; totals.stuck oförändrat ──────────────

test('K56: stuckSlaSummary räknar per tier och totals.stuck lämnas intakt', () => {
  const cases = [
    sentCase('c1', 20),
    sentCase('c2', 15),
    sentCase('h1', 11),
    sentCase('e1', 8),
    // Inte fastnad: nyss skickad, ingen öppning → waitingCustomer, ej stuck.
    sentCase('fresh', 1),
  ];
  const overview = buildCommercialOwnerOfferOverview(cases, { nowMs: NOW });
  assert.deepEqual(overview.stuckSlaSummary, { critical: 2, high: 1, elevated: 1 });
  assert.equal(overview.totals.stuck, 4);
  assert.equal(overview.totals.waitingCustomer, 1);
});

// ── 5. deriveStuckSlaSignal är ren och robust mot saknade tider ──────────────

test('K56: deriveStuckSlaSignal hanterar saknad sent-tid utan att krascha', () => {
  const signal = deriveStuckSlaSignal({ sentMs: NaN, openCount: 0, nowMs: NOW });
  assert.equal(signal.daysSinceSent, null);
  assert.equal(signal.daysSinceLastOpen, null);
  assert.equal(signal.stuckReason, 'awaiting_first_response');
  assert.equal(signal.slaTier, 'elevated');
  assert.equal(typeof signal.priorityScore, 'number');
});
