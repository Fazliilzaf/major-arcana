'use strict';

/**
 * dailyDigestRunner (DD1) — kör digest-utskick för en eller flera tenants.
 *
 * Per-tenant flöde:
 *   1. Hämta tenantConfig (för digest-config + brand)
 *   2. Skip om disabled, eller om recipients-listan är tom
 *   3. Skip om aktuell timme inte matchar sendHour (om scheduler-läget)
 *   4. Skip om vi redan skickat idag (lastSentAt < idag)
 *   5. Kör KPI-capability → bygg digest → skicka via graphSendConnector
 *   6. Persistera lastSentAt i tenantConfig
 *
 * Tenant-config (under tenantConfig.digest):
 *   - enabled: boolean (default false)
 *   - recipients: string[] (e-postadresser)
 *   - sendHour: 0-23 (default 6)
 *   - locale: 'sv' | 'en' | 'de' | 'dk' (default 'sv')
 *   - senderMailbox: e-post som digest skickas FRÅN (default contact@-mailbox)
 *   - lastSentAt: ISO-tid (skrivs av runnern)
 */

const { CcoOperationalKpisCapability } = require('../capabilities/ccoOperationalKpis');
const { buildDigest } = require('./dailyDigest');

function nowIso() {
  return new Date().toISOString();
}

function startOfDayMs(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function defaultSenderForTenant(tenantConfig, fallbackMailbox) {
  const explicit = normalizeText(tenantConfig?.digest?.senderMailbox);
  if (explicit) return explicit;
  const brand = normalizeText(tenantConfig?.brand?.preferredMailbox);
  if (brand) return brand;
  return normalizeText(fallbackMailbox) || 'contact@hairtpclinic.com';
}

async function buildKpisForTenant({
  tenantId,
  ccoHistoryStore,
  tenantConfigStore,
  runtimeMetricsStore,
}) {
  const cap = new CcoOperationalKpisCapability();
  const result = await cap.execute({
    tenantId,
    actor: { id: 'system:daily-digest', role: 'OWNER' },
    channel: 'admin',
    input: { windowDays: 7 },
    ccoHistoryStore,
    tenantConfigStore,
    runtimeMetricsStore,
  });
  return result;
}

async function sendViaGraph({
  graphSendConnector,
  senderMailboxId,
  toRecipients,
  subject,
  htmlBody,
  textBody,
  logger,
}) {
  if (!graphSendConnector || typeof graphSendConnector.sendNewMessage !== 'function') {
    return {
      skipped: true,
      reason: 'graphSendConnector saknas eller stödjer inte sendNewMessage',
    };
  }
  try {
    const result = await graphSendConnector.sendNewMessage({
      mailboxId: senderMailboxId,
      sourceMailboxId: senderMailboxId,
      subject,
      body: textBody,
      bodyHtml: htmlBody,
      to: toRecipients.map((email) => ({ emailAddress: { address: email } })),
    });
    return { sent: true, result };
  } catch (err) {
    if (logger) logger.warn?.('[digest] sendNewMessage failed', { error: err?.message });
    return { sent: false, error: String(err?.message || err) };
  }
}

async function runDigestForTenant({
  tenantId,
  tenantConfig,
  tenantConfigStore,
  ccoHistoryStore,
  graphSendConnector,
  runtimeMetricsStore = null,
  forceSend = false,
  recipientsOverride = null,
  dryRun = false,
  logger = console,
} = {}) {
  const safeTenantId = normalizeText(tenantId);
  if (!safeTenantId) throw new Error('runDigestForTenant kräver tenantId.');
  const cfg = asObject(tenantConfig);
  const digestCfg = asObject(cfg.digest);
  const enabled = digestCfg.enabled === true;
  const recipients = Array.isArray(recipientsOverride)
    ? recipientsOverride
    : Array.isArray(digestCfg.recipients)
      ? digestCfg.recipients
      : [];
  const sendHour = Number.isFinite(Number(digestCfg.sendHour)) ? Number(digestCfg.sendHour) : 6;
  const locale = ['sv', 'en', 'de', 'dk'].includes(digestCfg.locale) ? digestCfg.locale : 'sv';
  const senderMailboxId = defaultSenderForTenant(cfg, digestCfg.senderMailbox);

  if (!enabled && !forceSend) {
    return { tenantId: safeTenantId, skipped: true, reason: 'digest_disabled' };
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { tenantId: safeTenantId, skipped: true, reason: 'no_recipients' };
  }

  // Hour-gating för scheduler-läget
  if (!forceSend) {
    const currentHour = new Date().getHours();
    if (currentHour !== sendHour) {
      return {
        tenantId: safeTenantId,
        skipped: true,
        reason: 'wrong_hour',
        currentHour,
        sendHour,
      };
    }
    // Avduplikering — skicka max en gång per dag
    const lastSentAt = digestCfg.lastSentAt ? Date.parse(digestCfg.lastSentAt) : 0;
    if (Number.isFinite(lastSentAt) && lastSentAt >= startOfDayMs()) {
      return {
        tenantId: safeTenantId,
        skipped: true,
        reason: 'already_sent_today',
        lastSentAt: digestCfg.lastSentAt,
      };
    }
  }

  // Build KPIs + digest
  const kpis = await buildKpisForTenant({
    tenantId: safeTenantId,
    ccoHistoryStore,
    tenantConfigStore,
    runtimeMetricsStore,
  });
  const digest = buildDigest({
    tenantBrand: cfg.brand || {},
    kpis,
    locale,
  });

  if (dryRun) {
    return {
      tenantId: safeTenantId,
      dryRun: true,
      subject: digest.subject,
      recipients,
      htmlLength: digest.html.length,
      textLength: digest.text.length,
    };
  }

  // Skicka
  const sendResult = await sendViaGraph({
    graphSendConnector,
    senderMailboxId,
    toRecipients: recipients,
    subject: digest.subject,
    htmlBody: digest.html,
    textBody: digest.text,
    logger,
  });

  // Persistera lastSentAt om vi lyckats
  if (sendResult?.sent && tenantConfigStore && typeof tenantConfigStore.updateTenantConfig === 'function') {
    try {
      await tenantConfigStore.updateTenantConfig({
        tenantId: safeTenantId,
        patch: {
          digest: {
            ...digestCfg,
            lastSentAt: nowIso(),
            lastError: null,
          },
        },
      });
    } catch (err) {
      if (logger) logger.warn?.('[digest] kunde inte persistera lastSentAt', { error: err?.message });
    }
  }

  return {
    tenantId: safeTenantId,
    sent: sendResult?.sent === true,
    skipped: sendResult?.skipped === true,
    reason: sendResult?.reason || null,
    error: sendResult?.error || null,
    subject: digest.subject,
    recipients,
    senderMailboxId,
  };
}

async function runDailyDigestForAllTenants({
  tenantConfigStore,
  ccoHistoryStore,
  graphSendConnector,
  runtimeMetricsStore = null,
  forceSend = false,
  dryRun = false,
  logger = console,
} = {}) {
  if (!tenantConfigStore || typeof tenantConfigStore.listTenants !== 'function') {
    return { skipped: true, reason: 'tenantConfigStore.listTenants saknas' };
  }
  const tenants = await tenantConfigStore.listTenants();
  const results = [];
  for (const t of tenants || []) {
    const tenantId = normalizeText(t?.tenantId || t?.id);
    if (!tenantId) continue;
    if (t?.disabled === true) {
      results.push({ tenantId, skipped: true, reason: 'tenant_disabled' });
      continue;
    }
    try {
      const r = await runDigestForTenant({
        tenantId,
        tenantConfig: t,
        tenantConfigStore,
        ccoHistoryStore,
        graphSendConnector,
        runtimeMetricsStore,
        forceSend,
        dryRun,
        logger,
      });
      results.push(r);
    } catch (err) {
      results.push({ tenantId, error: String(err?.message || err) });
    }
  }
  return {
    runAt: nowIso(),
    forceSend,
    dryRun,
    totalTenants: tenants.length,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => r.error).length,
    results,
  };
}

module.exports = {
  runDigestForTenant,
  runDailyDigestForAllTenants,
};
