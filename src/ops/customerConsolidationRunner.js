'use strict';

/**
 * customerConsolidationRunner (DI5) — scannar mailboxTruthStore.listMessages,
 * grupperar messages per kund-email (senderEmail), och hittar kunder som
 * mailat fler än en mailbox. Skriver consolidation-entries till
 * customerConsolidationStore.
 *
 * Heuristik för primaryMailboxId:
 *   1. Om `preferredPrimaryMailbox` är passad och kunden har mailat dit → primaryMailboxId = den
 *   2. Annars: mailbox med flest messages från kunden
 *   3. Tie-breaker: alfabetisk
 *
 * Idempotent — kan köras hur ofta som helst.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Mail från egna mailboxar (företaget) räknas inte som "kund"-mail
function isInternalSender(senderEmail, internalDomains) {
  if (!senderEmail) return true;
  const domain = senderEmail.split('@').pop() || '';
  return internalDomains.has(domain.toLowerCase());
}

function deriveInternalDomains(mailboxAddresses = []) {
  const domains = new Set();
  for (const addr of mailboxAddresses) {
    const lc = normalizeEmail(addr);
    const at = lc.lastIndexOf('@');
    if (at > 0) domains.add(lc.slice(at + 1));
  }
  return domains;
}

function pickPrimaryMailbox(mailboxCounts, preferredPrimaryMailbox) {
  const ids = Object.keys(mailboxCounts);
  if (ids.length === 0) return null;
  // 1. Preferred om kunden mailat dit
  const preferred = normalizeText(preferredPrimaryMailbox);
  if (preferred && mailboxCounts[preferred]) return preferred;
  // 2. Mest aktiva mailbox
  return ids
    .slice()
    .sort((a, b) => {
      const ca = mailboxCounts[a] || 0;
      const cb = mailboxCounts[b] || 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b);
    })[0] || null;
}

async function runCustomerConsolidation({
  tenantId,
  ccoMailboxTruthStore,
  customerConsolidationStore,
  preferredPrimaryMailbox = null,
  yieldEvery = 200,
} = {}) {
  const safeTenantId = normalizeText(tenantId);
  if (!safeTenantId) throw new Error('runCustomerConsolidation kräver tenantId.');
  if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
    throw new Error('Kräver ccoMailboxTruthStore med listMessages.');
  }
  if (
    !customerConsolidationStore ||
    typeof customerConsolidationStore.upsertEntry !== 'function'
  ) {
    throw new Error('Kräver customerConsolidationStore.');
  }

  const startedAt = Date.now();
  const messages = ccoMailboxTruthStore.listMessages({});

  // Samla alla mailbox-adresser för att kunna identifiera interna sändare
  const mailboxAddresses = new Set();
  for (const m of messages) {
    const addr = normalizeEmail(asObject(m).mailboxAddress);
    if (addr) mailboxAddresses.add(addr);
  }
  const internalDomains = deriveInternalDomains(mailboxAddresses);

  // Group: customerEmail → { mailboxCounts, conversationIds, firstSeenAt, lastSeenAt }
  const customerMap = new Map();
  let scanned = 0;

  for (let i = 0; i < messages.length; i += 1) {
    const msg = asObject(messages[i]);
    const senderEmail = normalizeEmail(msg.senderEmail);
    if (!senderEmail || isInternalSender(senderEmail, internalDomains)) {
      scanned += 1;
      continue;
    }
    scanned += 1;
    const mailboxId = normalizeText(msg.mailboxId);
    const conversationId = normalizeText(msg.conversationId);
    const ts =
      normalizeText(msg.receivedDateTime) ||
      normalizeText(msg.sentDateTime) ||
      normalizeText(msg.persistedAt) ||
      '';

    let entry = customerMap.get(senderEmail);
    if (!entry) {
      entry = {
        customerEmail: senderEmail,
        mailboxCounts: {},
        conversationIds: new Set(),
        firstSeenAt: ts || null,
        lastSeenAt: ts || null,
        messageCount: 0,
      };
      customerMap.set(senderEmail, entry);
    }
    if (mailboxId) {
      entry.mailboxCounts[mailboxId] = (entry.mailboxCounts[mailboxId] || 0) + 1;
    }
    if (conversationId) entry.conversationIds.add(conversationId);
    entry.messageCount += 1;
    if (ts) {
      if (!entry.firstSeenAt || ts < entry.firstSeenAt) entry.firstSeenAt = ts;
      if (!entry.lastSeenAt || ts > entry.lastSeenAt) entry.lastSeenAt = ts;
    }

    if ((i + 1) % yieldEvery === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  // Skriv consolidation-entries
  let written = 0;
  let multiMailbox = 0;
  const summary = [];
  for (const [customerEmail, agg] of customerMap.entries()) {
    const observedMailboxIds = Object.keys(agg.mailboxCounts);
    if (observedMailboxIds.length === 0) continue;
    if (observedMailboxIds.length >= 2) multiMailbox += 1;
    const primaryMailboxId = pickPrimaryMailbox(agg.mailboxCounts, preferredPrimaryMailbox);
    await customerConsolidationStore.upsertEntry({
      tenantId: safeTenantId,
      customerEmail,
      primaryMailboxId,
      observedMailboxIds,
      messageCount: agg.messageCount,
      conversationIds: Array.from(agg.conversationIds),
      firstSeenAt: agg.firstSeenAt,
      lastSeenAt: agg.lastSeenAt,
    });
    written += 1;
    if (observedMailboxIds.length >= 2 && summary.length < 25) {
      summary.push({
        customerEmail,
        primaryMailboxId,
        observedMailboxIds,
        messageCount: agg.messageCount,
      });
    }
  }

  if (typeof customerConsolidationStore.flush === 'function') {
    try {
      await customerConsolidationStore.flush();
    } catch (_e) {}
  }
  if (typeof customerConsolidationStore.recordRun === 'function') {
    try {
      await customerConsolidationStore.recordRun({
        tenantId: safeTenantId,
        customersConsolidated: written,
        multiMailboxCount: multiMailbox,
      });
    } catch (_e) {}
  }

  return {
    tenantId: safeTenantId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    scanned,
    customersWritten: written,
    multiMailboxCount: multiMailbox,
    preferredPrimaryMailbox: preferredPrimaryMailbox || null,
    multiMailboxSample: summary,
  };
}

module.exports = {
  runCustomerConsolidation,
};
