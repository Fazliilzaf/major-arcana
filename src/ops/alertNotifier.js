const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampTimeoutMs(value, fallback = 4000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(500, Math.min(15000, parsed));
}

function sanitizeError(error) {
  if (!error) return 'unknown_error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name || 'error';
  return String(error);
}

function buildSignature(secret, body) {
  if (!secret) return '';
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

function createAlertNotifier({
  webhookUrl = '',
  webhookTimeoutMs = 4000,
  webhookSecret = '',
  logger = console,
} = {}) {
  const normalizedWebhookUrl = normalizeText(webhookUrl);
  const normalizedWebhookSecret = normalizeText(webhookSecret);
  const timeoutMs = clampTimeoutMs(webhookTimeoutMs, 4000);
  const enabled = Boolean(normalizedWebhookUrl);

  async function send({
    eventType,
    tenantId = '',
    severity = 'info',
    payload = {},
  } = {}) {
    if (!enabled) {
      return {
        ok: false,
        skipped: true,
        reason: 'disabled',
      };
    }

    if (typeof fetch !== 'function') {
      return {
        ok: false,
        skipped: true,
        reason: 'fetch_unavailable',
      };
    }

    const body = JSON.stringify({
      version: 1,
      sentAt: nowIso(),
      eventType: normalizeText(eventType) || 'unknown',
      tenantId: normalizeText(tenantId) || null,
      severity: normalizeText(severity) || 'info',
      payload: payload && typeof payload === 'object' ? payload : {},
    });

    const headers = {
      'content-type': 'application/json',
      'user-agent': 'arcana-alert-notifier/1.0',
    };
    const signature = buildSignature(normalizedWebhookSecret, body);
    if (signature) headers['x-arcana-signature'] = signature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(normalizedWebhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      return {
        ok: response.ok,
        skipped: false,
        status: response.status,
        statusText: normalizeText(response.statusText),
      };
    } catch (error) {
      clearTimeout(timer);
      const message = sanitizeError(error);
      logger?.error?.('[alert_notifier] send_failed', message);
      return {
        ok: false,
        skipped: false,
        error: message,
      };
    }
  }

  return {
    enabled,
    webhookUrl: normalizedWebhookUrl || null,
    timeoutMs,
    send,
  };
}

module.exports = {
  createAlertNotifier,
};
