'use strict';

const express = require('express');
const netsConnector = require('../pos/netsConnector');
const fortnoxConnector = require('../cfo/cfoFortnoxConnector');

function createPosRouter({ authStore, posStore }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  router.get('/pos/status', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({
      ok: true,
      nets: { configured: netsConnector.isConfigured(), mode: netsConnector.resolveConfig().mode },
      fortnox: {
        configured: fortnoxConnector.isConfigured(),
        mode: fortnoxConnector.resolveConfig().mode,
      },
    });
  });

  router.get('/pos/products', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, products: posStore.listProducts() });
  });

  router.post('/pos/products', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const product = posStore.upsertProduct(req.body || {});
    await posStore.persist();
    return res.json({ ok: true, product });
  });

  router.post('/pos/orders', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const order = posStore.createOrder({
      ...req.body,
      operatorId: req.user?.id || req.body?.operatorId,
    });
    await posStore.persist();
    return res.json({ ok: true, order });
  });

  router.get(
    '/pos/orders/:orderId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const order = posStore.getOrder(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'order_not_found' });
      return res.json({ ok: true, order });
    }
  );

  router.get(
    '/pos/patient/:patientId/orders',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const orders = posStore.listOrdersByPatient(req.params.patientId);
      return res.json({ ok: true, orders });
    }
  );

  router.post(
    '/pos/orders/:orderId/pay/nets',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const order = posStore.getOrder(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'order_not_found' });

      const result = await netsConnector.createPayment({
        orderId: order.orderId,
        amount: order.total,
        currency: order.currency,
        description: order.lineItems.map((li) => li.label).join(', '),
        returnUrl: req.body?.returnUrl,
        cancelUrl: req.body?.cancelUrl,
      });

      if (!result.ok) return res.status(502).json(result);
      return res.json({ ok: true, ...result });
    }
  );

  router.post(
    '/pos/orders/:orderId/pay/record',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const payment = posStore.recordPayment(req.params.orderId, req.body || {});
      if (!payment) return res.status(404).json({ ok: false, error: 'order_not_found' });
      await posStore.persist();
      return res.json({ ok: true, payment, order: posStore.getOrder(req.params.orderId) });
    }
  );

  router.post(
    '/pos/orders/:orderId/invoice',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const order = posStore.getOrder(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'order_not_found' });

      const result = await fortnoxConnector.createInvoice({
        customerNumber: req.body?.customerNumber,
        customerName: req.body?.customerName,
        email: req.body?.email,
        items: order.lineItems,
        dueInDays: Number(req.body?.dueInDays) || 30,
      });

      if (!result.ok) return res.status(502).json(result);

      posStore.setInvoiceRef(order.orderId, String(result.invoiceNumber));
      await posStore.persist();

      if (req.body?.sendEmail !== false && result.invoiceNumber) {
        await fortnoxConnector.sendInvoice(result.invoiceNumber);
      }

      return res.json({ ok: true, invoice: result, order: posStore.getOrder(order.orderId) });
    }
  );

  router.post(
    '/pos/orders/:orderId/cancel',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const order = posStore.cancelOrder(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'order_not_found' });
      await posStore.persist();
      return res.json({ ok: true, order });
    }
  );

  router.get(
    '/pos/orders/:orderId/receipt',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const order = posStore.getOrder(req.params.orderId);
      if (!order) return res.status(404).json({ ok: false, error: 'order_not_found' });
      if (!order.receiptId) {
        posStore.generateReceiptId(req.params.orderId);
      }
      return res.json({ ok: true, receiptId: order.receiptId, order });
    }
  );

  router.get('/pos/report/daily', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const report = posStore.getDailyReport(req.query?.date);
    return res.json({ ok: true, report });
  });

  return router;
}

module.exports = { createPosRouter };
