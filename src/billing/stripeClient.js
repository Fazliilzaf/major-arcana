'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createStripeClient({ apiKey = '', appName = 'Arcana Executive OS', appVersion = '1.0.0' } = {}) {
  const safeKey = normalizeText(apiKey || process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY);
  if (!safeKey) {
    return null;
  }

  const Stripe = require('stripe');
  const stripe = new Stripe(safeKey, {
    apiVersion: '2024-12-18.acacia',
    appInfo: { name: appName, version: appVersion },
    maxNetworkRetries: 2,
    timeout: 10000,
  });

  return stripe;
}

const STRIPE_PLAN_PRICE_MAP = Object.freeze({
  free: null,
  starter: 'price_starter_monthly',
  pro: 'price_pro_monthly',
  enterprise: null,
});

const STRIPE_PRICE_TO_PLAN = Object.freeze(
  Object.fromEntries(
    Object.entries(STRIPE_PLAN_PRICE_MAP)
      .filter(([, priceId]) => priceId)
      .map(([plan, priceId]) => [priceId, plan])
  )
);

function planFromPriceId(priceId) {
  return STRIPE_PRICE_TO_PLAN[normalizeText(priceId)] || null;
}

function priceIdFromPlan(planTier) {
  return STRIPE_PLAN_PRICE_MAP[normalizeText(planTier).toLowerCase()] || null;
}

module.exports = {
  createStripeClient,
  STRIPE_PLAN_PRICE_MAP,
  STRIPE_PRICE_TO_PLAN,
  planFromPriceId,
  priceIdFromPlan,
};
