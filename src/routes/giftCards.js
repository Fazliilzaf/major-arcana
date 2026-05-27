'use strict';

const express = require('express');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function createGiftCardRouter({ authStore, giftCardStore }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  // Cards are tenant-scoped: a card may only be read/redeemed/cancelled within
  // the tenant that issued it, even though the store looks up by code/cardId.
  function sameTenant(card, req) {
    return card && card.tenantId === normalizeText(req.auth?.tenantId);
  }

  router.get('/pos/gift-cards', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, giftCards: giftCardStore.listActive(req.auth?.tenantId) });
  });

  router.get(
    '/pos/gift-cards/stats',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      return res.json({ ok: true, stats: giftCardStore.getStats(req.auth?.tenantId) });
    }
  );

  router.post(
    '/pos/gift-cards/lookup',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const card = giftCardStore.findByCode(normalizeText(req.body?.code));
      if (!sameTenant(card, req))
        return res.status(404).json({ ok: false, error: 'card_not_found' });
      return res.json({ ok: true, giftCard: card });
    }
  );

  router.post('/pos/gift-cards', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_amount' });
    }
    const card = await giftCardStore.create({
      tenantId: req.auth?.tenantId,
      amount,
      currency: normalizeText(req.body?.currency) || 'SEK',
      purchaserName: req.body?.purchaserName,
      recipientName: req.body?.recipientName,
      recipientEmail: req.body?.recipientEmail,
      message: req.body?.message,
      expiresInMonths: Number(req.body?.expiresInMonths) || 12,
    });
    return res.status(201).json({ ok: true, giftCard: card });
  });

  router.post(
    '/pos/gift-cards/redeem',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const code = normalizeText(req.body?.code);
      const existing = giftCardStore.findByCode(code);
      if (!sameTenant(existing, req)) {
        return res.status(404).json({ ok: false, error: 'card_not_found' });
      }
      const result = await giftCardStore.redeem(code, {
        amount: req.body?.amount,
        orderId: req.body?.orderId,
        operatorId: req.auth?.userId,
      });
      if (!result.ok) return res.status(400).json(result);
      return res.json(result);
    }
  );

  router.post(
    '/pos/gift-cards/:cardId/cancel',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const card = giftCardStore.getCard(normalizeText(req.params?.cardId));
      if (!sameTenant(card, req))
        return res.status(404).json({ ok: false, error: 'card_not_found' });
      const cancelled = await giftCardStore.cancel(card.cardId);
      return res.json({ ok: true, giftCard: cancelled });
    }
  );

  return router;
}

module.exports = { createGiftCardRouter };
