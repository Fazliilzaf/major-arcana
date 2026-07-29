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

/**
 * DEN LAGRADE FORMEN, INTE GRAPHS.
 *
 * Fram till 2026-07-29 letade den här funktionen bara på Graphs form
 * (`from.emailAddress.address`). Truth-storen lagrar `from.address` — den
 * platta formen. Ingen av de fem vägarna träffade, och rapporten svarade
 * "0 kunder" på 19 978 meddelanden utan att något gick fel.
 *
 * Samma söm som #1245: servern skriver under en väg, läsaren letar under en
 * annan, båda halvorna korrekta var för sig.
 */
/**
 * VI ÄR EN DOMÄN, INTE EN LISTA.
 *
 * Först filtrerades bara de brevlådor vi LÄSER. Men personalens egna adresser
 * — britt-louise@, leonora@, andrea@ — ligger på samma domän utan att vara
 * brevlådor, och blev därför "kunder" med hundratals mejl var.
 *
 * En lista över lästa brevlådor är ofullständig av konstruktion: den innehåller
 * bara det vi läser, inte allt som är vi. Tre olika listor missade
 * `info@fazli.se` i dag av precis det skälet.
 *
 * Domänen härleds ur brevlådorna och gäller sedan alla adresser på den.
 * Anställs någon i morgon fungerar filtret utan att någon minns att uppdatera
 * det. Undantaget finns inte: kliniken delar inte ut adresser på sin egen
 * domän till kunder.
 */
function createTenantMatcher(tenantMailboxIds = null) {
  const ids = new Set(
    (tenantMailboxIds instanceof Set ? [...tenantMailboxIds] : Array.isArray(tenantMailboxIds) ? tenantMailboxIds : [])
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
  const domains = new Set(
    [...ids].map((email) => email.split('@')[1] || '').filter(Boolean)
  );
  return {
    has(email) {
      const safe = normalizeEmail(email);
      if (!safe) return false;
      if (ids.has(safe)) return true;
      const domain = safe.split('@')[1] || '';
      return Boolean(domain) && domains.has(domain);
    },
    domains: [...domains],
  };
}

function pickAddress(candidate = {}) {
  const item = asObject(candidate);
  return (
    normalizeEmail(item.address) ||
    normalizeEmail(item.emailAddress?.address) ||
    normalizeEmail(typeof candidate === 'string' ? candidate : '')
  );
}

/**
 * UTGÅENDE MEJL HAR KUNDEN I MOTTAGAREN.
 *
 * `from` är vår egen brevlåda på allt vi skickat, och den raden slogs bort av
 * `email === mailboxId`-kontrollen. Halva korrespondensen med varje kund
 * försvann alltså ur underlaget — och just svaren är det Fazli vill se i
 * tråden ("vem svarade").
 */
function pickCustomerEmail(msg = {}, tenantMailboxIds = null) {
  const isTenant = (email) =>
    Boolean(email) && (tenantMailboxIds ? tenantMailboxIds.has(email) : false);
  const mailboxId = normalizeEmail(msg.mailboxId);

  const explicit =
    normalizeEmail(msg.customerEmail) || normalizeEmail(msg.fromEmail) || normalizeEmail(msg.senderEmail);
  if (explicit && explicit !== mailboxId && !isTenant(explicit)) return explicit;

  const from = pickAddress(msg.from) || pickAddress(msg.sender);
  if (from && from !== mailboxId && !isTenant(from)) return from;

  for (const recipient of Array.isArray(msg.toRecipients) ? msg.toRecipients : []) {
    const address = pickAddress(recipient);
    if (address && address !== mailboxId && !isTenant(address)) return address;
  }
  return null;
}

function pickCustomerName(msg = {}) {
  return (
    normalizeText(msg.customerName) ||
    normalizeText(msg.fromName) ||
    normalizeText(asObject(msg.from).name) ||
    normalizeText(msg.from?.emailAddress?.name) ||
    normalizeText(asObject(msg.sender).name) ||
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
function aggregateByCustomer(messages = [], { tenantMailboxIds = null } = {}) {
  const tenantSet = createTenantMatcher(tenantMailboxIds);
  const map = new Map();
  for (const raw of Array.isArray(messages) ? messages : []) {
    const msg = asObject(raw);
    const email = pickCustomerEmail(msg, tenantSet);
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
  // Vidarebefordra optionerna. Utan detta får aggregeringen aldrig veta vilka
  // adresser som är VÅRA EGNA, och personalens brevlådor blir kunder.
  const map = aggregateByCustomer(messages, options);
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
  // Vidarebefordra optionerna. Utan detta får aggregeringen aldrig veta vilka
  // adresser som är VÅRA EGNA, och personalens brevlådor blir kunder.
  const map = aggregateByCustomer(messages, options);
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
  createTenantMatcher,
  computeIdentityCoverage,
  aggregateByCustomer,
  findCrossMailboxCustomers,
  summarizeAggregation,
  pickCustomerEmail,
  pickCustomerName,
};

/**
 * ANDELEN MEDDELANDEN DÄR EN KUNDADRESS GÅR ATT UTVINNA.
 *
 * OBS: detta är INTE samma sak som "matchar en patient". Funktionen känner
 * inte till patientregistret och frågar det aldrig. Talet är därför en ÖVRE
 * GRÄNS för hur många meddelanden som kan knytas till ett patient-id — allt
 * som inte har en adress kan omöjligen matchas, men allt som har en adress
 * matchar inte nödvändigtvis.
 *
 * Blandas de två ihop ser en registerlucka ut som en fixad bugg.
 *
 * Talet som avgör om den röda tråden är genomförbar. Att stämpla ett kund-id
 * på meddelandena är en engångsoperation över 32 400 poster — den vill man
 * göra en gång, på rätt underlag. Är täckningen 30 % får man en tråd med hål i.
 *
 * Rapporteras uppdelat på inkommande och utgående, för utgående var den grupp
 * som föll bort helt när bara `from` lästes.
 */
function computeIdentityCoverage(messages = [], { tenantMailboxIds = null } = {}) {
  const tenantSet = createTenantMatcher(tenantMailboxIds);
  const out = {
    totalMessages: 0,
    resolved: 0,
    unresolved: 0,
    inbound: { total: 0, resolved: 0 },
    outbound: { total: 0, resolved: 0 },
    uniqueCustomers: 0,
  };
  const seen = new Set();
  const perAddress = new Map();
  for (const raw of Array.isArray(messages) ? messages : []) {
    const msg = asObject(raw);
    out.totalMessages += 1;
    const mailboxId = normalizeEmail(msg.mailboxId);
    const from = pickAddress(msg.from) || pickAddress(msg.sender);
    const isOutbound =
      normalizeText(msg.folderType).toLowerCase() === 'sent' ||
      (Boolean(from) && (from === mailboxId || tenantSet.has(from)));
    const bucket = isOutbound ? out.outbound : out.inbound;
    bucket.total += 1;
    const email = pickCustomerEmail(msg, tenantSet);
    if (email) {
      out.resolved += 1;
      bucket.resolved += 1;
      seen.add(email);
      perAddress.set(email, (perAddress.get(email) || 0) + 1);
    } else {
      out.unresolved += 1;
    }
  }
  out.uniqueCustomers = seen.size;
  out.resolvedShare = out.totalMessages > 0 ? out.resolved / out.totalMessages : 0;

  // MEDDELANDEN ÄR FEL NÄMNARE.
  //
  // Ett nyhetsbrev med 300 utskick väger 300, en patient med tre mejl väger 3.
  // Är restposten 200 avsändare med mycket post är den korrekt — leverantörer
  // och utskick. Är den 15 000 avsändare med lite post saknas verkliga
  // människor, och då är det ett registerproblem och inte ett CCO-problem.
  //
  // Fördelningen nedan skiljer de två fallen åt utan att veta något om
  // patientregistret.
  const counts = [...perAddress.values()].sort((a, b) => b - a);
  out.addressDistribution = {
    uniqueAddresses: counts.length,
    singletons: counts.filter((n) => n === 1).length,
    top10Messages: counts.slice(0, 10).reduce((sum, n) => sum + n, 0),
    median: counts.length ? counts[Math.floor(counts.length / 2)] : 0,
    max: counts[0] || 0,
  };
  out.addressDistribution.top10Share =
    out.resolved > 0 ? out.addressDistribution.top10Messages / out.resolved : 0;
  return out;
}
