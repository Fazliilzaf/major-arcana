'use strict';

/**
 * crossMailboxAggregator (DI5) — gruppera mail per kund över mailboxar.
 *
 * Tar listan messages från ccoMailboxTruthStore.listMessages() och bygger
 * en map: customerEmail (lowercased) → { mailboxes: [{ mailboxId, count, lastIso }],
 * totalMessages, conversationIds[] }.
 *
 * Exporterar två funktioner:
 *   - aggregateByCustomer(messages) → Map<email, customerSummary>
 *   - findCrossMailboxCustomers(messages) → array av kunder som skrivit till >1 mailbox
 *
 * En "preferred mailbox"-rekommendation kan tilldelas: en mailbox som ska
 * fungera som single source of truth (t.ex. contact@hairtpclinic.com).
 *
 * Pure functions — inga side effects, ingen storage. Är säkra att köra ofta.
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

function pickMessageTimestamp(msg = {}) {
  return (
    Date.parse(msg.receivedDateTime || '') ||
    Date.parse(msg.sentDateTime || '') ||
    Date.parse(msg.receivedAt || '') ||
    Date.parse(msg.sentAt || '') ||
    Date.parse(msg.persistedAt || '') ||
    NaN
  );
}

function pickCustomerEmail(msg = {}) {
  // Föredra explicit customerEmail (normaliserad i mailboxTruthStore)
  return (
    normalizeEmail(msg.customerEmail) ||
    normalizeEmail(msg.fromEmail) ||
    normalizeEmail(msg.from?.emailAddress?.address) ||
    normalizeEmail(msg.sender?.emailAddress?.address) ||
    normalizeEmail(msg.senderEmail) ||
    null
  );
}

function pickCustomerName(msg = {}) {
  return (
    normalizeText(msg.customerName) ||
    normalizeText(msg.fromName) ||
    normalizeText(msg.from?.emailAddress?.name) ||
    normalizeText(msg.sender?.emailAddress?.name) ||
    null
  );
}

/**
 * Gruppera messages per customer-email.
 * Returnerar ett Map<email, summary> där summary innehåller:
 *   - customerEmail
 *   - customerName (senast sett)
 *   - mailboxes: array av { mailboxId, messageCount, firstMessageIso, lastMessageIso }
 *   - mailboxIds: Set
 *   - totalMessages
 *   - conversationIds: Set
 *   - firstMessageIso / lastMessageIso (totalt)
 */
function aggregateByCustomer(messages = []) {
  const map = new Map();
  for (const raw of Array.isArray(messages) ? messages : []) {
    const msg = asObject(raw);
    const email = pickCustomerEmail(msg);
    if (!email) continue;
    // Filtrera bort interna tenant-mailboxar (om kunden råkar vara
    // hair-personal som mailat dem själva — sällan men möjligt)
    const mailboxId = normalizeEmail(msg.mailboxId);
    if (!mailboxId) continue;
    if (email === mailboxId) continue; // mejl till sig själv

    const ts = pickMessageTimestamp(msg);
    const tsIso = Number.isFinite(ts) ? new Date(ts).toISOString() : null;
    const conversationId = normalizeText(msg.conversationId) || null;

    let summary = map.get(email);
    if (!summary) {
      summary = {
        customerEmail: email,
        customerName: pickCustomerName(msg),
        mailboxes: new Map(),
        conversationIds: new Set(),
        totalMessages: 0,
        firstMessageIso: null,
        lastMessageIso: null,
      };
      map.set(email, summary);
    }

    summary.totalMessages += 1;
    if (conversationId) summary.conversationIds.add(conversationId);
    if (!summary.customerName) summary.customerName = pickCustomerName(msg);

    let mb = summary.mailboxes.get(mailboxId);
    if (!mb) {
      mb = { mailboxId, messageCount: 0, firstMessageIso: null, lastMessageIso: null };
      summary.mailboxes.set(mailboxId, mb);
    }
    mb.messageCount += 1;
    if (tsIso) {
      if (!mb.firstMessageIso || tsIso < mb.firstMessageIso) mb.firstMessageIso = tsIso;
      if (!mb.lastMessageIso || tsIso > mb.lastMessageIso) mb.lastMessageIso = tsIso;
      if (!summary.firstMessageIso || tsIso < summary.firstMessageIso) {
        summary.firstMessageIso = tsIso;
      }
      if (!summary.lastMessageIso || tsIso > summary.lastMessageIso) {
        summary.lastMessageIso = tsIso;
      }
    }
  }

  // Konvertera mailboxes Map → sorterad array
  const out = new Map();
  for (const [email, s] of map.entries()) {
    const mailboxes = Array.from(s.mailboxes.values()).sort(
      (a, b) => b.messageCount - a.messageCount
    );
    out.set(email, {
      customerEmail: s.customerEmail,
      customerName: s.customerName,
      mailboxIds: mailboxes.map((m) => m.mailboxId),
      mailboxes,
      conversationIds: Array.from(s.conversationIds),
      conversationCount: s.conversationIds.size,
      totalMessages: s.totalMessages,
      firstMessageIso: s.firstMessageIso,
      lastMessageIso: s.lastMessageIso,
    });
  }
  return out;
}

/**
 * Hitta kunder som skrivit till mer än en mailbox.
 * options.preferredMailboxId: om angiven, markera kund som "needs_consolidation"
 * om de skrivit till annat än preferred (eller inte alls till preferred).
 */
function findCrossMailboxCustomers(messages = [], options = {}) {
  const preferred = normalizeEmail(options.preferredMailboxId || '');
  const map = aggregateByCustomer(messages);
  const customers = [];
  for (const summary of map.values()) {
    if (summary.mailboxes.length < 2) continue;
    const wroteToPreferred = preferred
      ? summary.mailboxes.some((m) => m.mailboxId === preferred)
      : null;
    customers.push({
      ...summary,
      preferredMailboxId: preferred || null,
      wroteToPreferred,
      needsConsolidation: preferred ? !wroteToPreferred : null,
    });
  }
  // Sortera så de mest aktiva kunderna (totalMessages desc) hamnar överst
  customers.sort((a, b) => b.totalMessages - a.totalMessages);
  return customers;
}

/**
 * Översikts-sammanfattning för rapport/UI.
 */
function summarizeAggregation(messages = [], options = {}) {
  const preferred = normalizeEmail(options.preferredMailboxId || '');
  const map = aggregateByCustomer(messages);
  let totalCustomers = 0;
  let crossMailboxCount = 0;
  let needsConsolidationCount = 0;
  const mailboxBreakdown = new Map();

  for (const s of map.values()) {
    totalCustomers += 1;
    if (s.mailboxes.length >= 2) crossMailboxCount += 1;
    if (preferred && s.mailboxes.length >= 2) {
      const wroteToPreferred = s.mailboxes.some((m) => m.mailboxId === preferred);
      if (!wroteToPreferred) needsConsolidationCount += 1;
    }
    for (const mb of s.mailboxes) {
      const cur = mailboxBreakdown.get(mb.mailboxId) || {
        mailboxId: mb.mailboxId,
        uniqueCustomers: 0,
        messageCount: 0,
      };
      cur.uniqueCustomers += 1;
      cur.messageCount += mb.messageCount;
      mailboxBreakdown.set(mb.mailboxId, cur);
    }
  }

  return {
    preferredMailboxId: preferred || null,
    totalCustomers,
    crossMailboxCustomers: crossMailboxCount,
    needsConsolidation: preferred ? needsConsolidationCount : null,
    mailboxBreakdown: Array.from(mailboxBreakdown.values()).sort(
      (a, b) => b.uniqueCustomers - a.uniqueCustomers
    ),
  };
}

module.exports = {
  aggregateByCustomer,
  findCrossMailboxCustomers,
  summarizeAggregation,
  pickCustomerEmail,
  pickCustomerName,
};
