'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const GIFT_CARD_STATUSES = Object.freeze([
  'active',
  'partially_used',
  'depleted',
  'expired',
  'cancelled',
]);

function createGiftCardStore({ filePath }) {
  let state = { cards: [] };

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  async function create({
    tenantId,
    amount,
    currency = 'SEK',
    purchaserName,
    recipientName,
    recipientEmail,
    message,
    expiresInMonths = 12,
  }) {
    const code = `GC-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const card = {
      cardId: crypto.randomUUID(),
      code,
      tenantId: normalizeText(tenantId),
      originalAmount: Number(amount) || 0,
      remainingAmount: Number(amount) || 0,
      currency,
      status: 'active',
      purchaserName: normalizeText(purchaserName),
      recipientName: normalizeText(recipientName),
      recipientEmail: normalizeText(recipientEmail),
      message: normalizeText(message),
      redemptions: [],
      expiresAt: new Date(Date.now() + expiresInMonths * 30 * 86400000).toISOString(),
      createdAt: nowIso(),
    };
    state.cards.push(card);
    await persist();
    return card;
  }

  function findByCode(code) {
    const normalized = normalizeText(code).toUpperCase();
    return state.cards.find((c) => c.code === normalized && c.status !== 'cancelled') || null;
  }

  function getCard(cardId) {
    return state.cards.find((c) => c.cardId === cardId) || null;
  }

  async function redeem(code, { amount, orderId, operatorId }) {
    const card = findByCode(code);
    if (!card) return { ok: false, error: 'card_not_found' };
    if (card.status === 'depleted' || card.status === 'expired')
      return { ok: false, error: 'card_not_usable', status: card.status };
    if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
      card.status = 'expired';
      await persist();
      return { ok: false, error: 'card_expired' };
    }

    const redeemAmount = Math.min(Number(amount) || card.remainingAmount, card.remainingAmount);
    card.remainingAmount -= redeemAmount;
    card.redemptions.push({
      amount: redeemAmount,
      orderId: normalizeText(orderId),
      operatorId: normalizeText(operatorId),
      redeemedAt: nowIso(),
    });
    card.status = card.remainingAmount <= 0 ? 'depleted' : 'partially_used';
    await persist();
    return {
      ok: true,
      redeemed: redeemAmount,
      remaining: card.remainingAmount,
      status: card.status,
    };
  }

  async function cancel(cardId) {
    const card = getCard(cardId);
    if (!card) return null;
    card.status = 'cancelled';
    await persist();
    return card;
  }

  function listActive(tenantId) {
    const tid = normalizeText(tenantId);
    return state.cards
      .filter((c) => c.status === 'active' || c.status === 'partially_used')
      .filter((c) => !tid || c.tenantId === tid);
  }

  function getStats(tenantId) {
    const tid = normalizeText(tenantId);
    const cards = state.cards.filter((c) => !tid || c.tenantId === tid);
    const active = cards.filter((c) => c.status === 'active' || c.status === 'partially_used');
    return {
      totalIssued: cards.length,
      activeCount: active.length,
      totalOutstanding: active.reduce((s, c) => s + c.remainingAmount, 0),
      totalRedeemed: cards.reduce(
        (s, c) => s + c.redemptions.reduce((rs, r) => rs + r.amount, 0),
        0
      ),
    };
  }

  return {
    load,
    persist,
    create,
    findByCode,
    getCard,
    redeem,
    cancel,
    listActive,
    getStats,
    GIFT_CARD_STATUSES,
  };
}

module.exports = { createGiftCardStore, GIFT_CARD_STATUSES };
