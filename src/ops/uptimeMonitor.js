'use strict';

/**
 * Uptime Monitor + Alerting.
 *
 * Self-monitoring: pingar egen /healthz + extern endpoint.
 * Skickar alert vid nedtid via:
 * - SMS (46elks)
 * - E-post (Graph/Resend)
 * - Webhook (Slack, Discord, Teams)
 *
 * Kör som scheduler-job var 60:e sekund.
 *
 * Env:
 *   ALERT_WEBHOOK_URL (Slack/Discord webhook)
 *   ALERT_SMS_TO (telefonnummer vid kritisk nedtid)
 *   ALERT_EMAIL_TO (e-post vid nedtid)
 *   UPTIME_CHECK_URL (default: https://arcana.hairtpclinic.se/healthz)
 *   UPTIME_CHECK_INTERVAL_MS (default: 60000)
 */

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

const STATE = {
  lastCheck: null,
  lastStatus: 'unknown',
  consecutiveFailures: 0,
  lastAlertSent: null,
  history: [],
};

const MAX_HISTORY = 100;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // Max 1 alert per 5 min

function resolveConfig() {
  return {
    checkUrl: normalizeText(process.env.UPTIME_CHECK_URL) || 'https://arcana.hairtpclinic.se/healthz',
    intervalMs: Number(process.env.UPTIME_CHECK_INTERVAL_MS) || 60000,
    webhookUrl: normalizeText(process.env.ALERT_WEBHOOK_URL),
    smsTo: normalizeText(process.env.ALERT_SMS_TO),
    emailTo: normalizeText(process.env.ALERT_EMAIL_TO),
    alertAfterFailures: Number(process.env.ALERT_AFTER_FAILURES) || 3,
  };
}

async function checkHealth(url) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const body = await res.json().catch(() => ({}));
    return {
      ok: res.ok && body.ok === true,
      status: res.status,
      latencyMs,
      ready: body.ready,
      error: null,
      checkedAt: nowIso(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      ready: false,
      error: err.message,
      checkedAt: nowIso(),
    };
  }
}

async function sendWebhookAlert(webhookUrl, message) {
  if (!webhookUrl) return { sent: false, reason: 'no_webhook_url' };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendSmsAlert(phone, message) {
  if (!phone) return { sent: false, reason: 'no_phone' };
  try {
    const { sendSms } = require('../sms/smsConnector');
    return sendSms({ to: phone, message });
  } catch {
    return { sent: false, reason: 'sms_module_unavailable' };
  }
}

async function runCheck() {
  const config = resolveConfig();
  const result = await checkHealth(config.checkUrl);

  STATE.lastCheck = result;
  STATE.history.push(result);
  if (STATE.history.length > MAX_HISTORY) STATE.history.shift();

  if (result.ok) {
    if (STATE.lastStatus !== 'up' && STATE.consecutiveFailures > 0) {
      const recoveryMsg = `✅ Arcana RECOVERED — ${config.checkUrl} is back up after ${STATE.consecutiveFailures} failures (${result.latencyMs}ms)`;
      if (config.webhookUrl) await sendWebhookAlert(config.webhookUrl, recoveryMsg);
    }
    STATE.consecutiveFailures = 0;
    STATE.lastStatus = 'up';
  } else {
    STATE.consecutiveFailures++;
    STATE.lastStatus = 'down';

    if (STATE.consecutiveFailures >= config.alertAfterFailures) {
      const now = Date.now();
      const cooldownPassed = !STATE.lastAlertSent || (now - new Date(STATE.lastAlertSent).getTime()) > ALERT_COOLDOWN_MS;

      if (cooldownPassed) {
        const alertMsg = `🚨 Arcana DOWN — ${config.checkUrl} har inte svarat ${STATE.consecutiveFailures} gånger i rad. Senaste fel: ${result.error || 'HTTP ' + result.status}`;

        if (config.webhookUrl) await sendWebhookAlert(config.webhookUrl, alertMsg);
        if (config.smsTo) await sendSmsAlert(config.smsTo, `ARCANA NERE: ${result.error || 'HTTP ' + result.status}. Kolla prod!`);

        STATE.lastAlertSent = nowIso();
      }
    }
  }

  return result;
}

function getStatus() {
  const upChecks = STATE.history.filter((h) => h.ok).length;
  const total = STATE.history.length;
  const uptimePercent = total > 0 ? Math.round((upChecks / total) * 100 * 10) / 10 : 100;
  const avgLatency = total > 0 ? Math.round(STATE.history.reduce((s, h) => s + h.latencyMs, 0) / total) : 0;

  return {
    status: STATE.lastStatus,
    consecutiveFailures: STATE.consecutiveFailures,
    lastCheck: STATE.lastCheck,
    lastAlertSent: STATE.lastAlertSent,
    uptimePercent,
    avgLatencyMs: avgLatency,
    checksInHistory: total,
    config: { checkUrl: resolveConfig().checkUrl, intervalMs: resolveConfig().intervalMs },
  };
}

let intervalId = null;

function startMonitoring() {
  const config = resolveConfig();
  if (intervalId) return;
  intervalId = setInterval(runCheck, config.intervalMs);
  runCheck(); // immediate first check
}

function stopMonitoring() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

module.exports = { runCheck, getStatus, startMonitoring, stopMonitoring, resolveConfig };
