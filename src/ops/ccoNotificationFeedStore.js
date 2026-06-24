const crypto = require('node:crypto');

// Notif-typer som feeden kan producera (för UI-filter via GET /types).
const NOTIFICATION_TYPES = [
  'booking',
  'compliance',
  'id_verification',
  'agreement',
  'mail',
  'system',
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Deterministiskt id så att läst-status håller över omläsningar av feeden.
function makeId(type, parts) {
  const seed = `${type}::${parts.filter(Boolean).join('::')}`;
  return `${type}_${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16)}`;
}

function notif({ type, title, body = '', at, severity = 'info', source = {}, customerId = null }) {
  return {
    id: makeId(type, [title, customerId, at, JSON.stringify(source)]),
    type,
    title: normalizeText(title),
    body: normalizeText(body),
    severity,
    customerId: customerId ? normalizeText(customerId) : null,
    createdAt: toIso(at) || nowIso(),
    source,
    read: false,
  };
}

function createCcoNotificationFeedStore({
  auditLog = null,
  bookingCaseStore = null,
  complianceScanStore = null,
  idVerificationStore = null,
  agreementStore = null,
  journalStore = null,
  readStore = null,
} = {}) {
  async function collectBooking() {
    if (!bookingCaseStore?.list) return [];
    const cases = asArray(await bookingCaseStore.list());
    return cases
      .map((c) =>
        notif({
          type: 'booking',
          title: `Bokningsärende: ${normalizeText(c.state) || 'okänt'}`,
          body: normalizeText(c.customerName || c.summary || ''),
          at: c.updatedAt || c.createdAt,
          severity: c.state === 'blocked' ? 'warning' : 'info',
          customerId: c.customerId || null,
          source: { kind: 'booking_case', id: c.id || c.caseId || null },
        })
      )
      .filter(Boolean);
  }

  function collectCompliance() {
    if (!complianceScanStore?.getActiveFlags) return [];
    const result = complianceScanStore.getActiveFlags() || {};
    const flags = asArray(result.flags);
    return flags.map((f) =>
      notif({
        type: 'compliance',
        title: normalizeText(f.title || f.code || 'Compliance-flagga'),
        body: normalizeText(f.message || f.detail || ''),
        at: f.at || f.detectedAt || result.scannedAt,
        severity: normalizeText(f.severity) || 'warning',
        source: { kind: 'compliance_flag', id: f.id || f.code || null },
      })
    );
  }

  function collectIdVerification(customerEvalResults) {
    if (!idVerificationStore?.getStatus) return [];
    const cids = asArray(customerEvalResults)
      .map((c) => normalizeText(c.customerId || c.id))
      .filter(Boolean);
    const out = [];
    for (const cid of cids) {
      const status = idVerificationStore.getStatus(cid);
      if (!status) continue;
      const value = normalizeText(status.status || status.state);
      if (!value || value === 'verified') continue;
      out.push(
        notif({
          type: 'id_verification',
          title: `ID-verifiering: ${value}`,
          body: '',
          at: status.updatedAt || status.at,
          severity: value === 'rejected' ? 'warning' : 'info',
          customerId: cid,
          source: { kind: 'id_verification', id: cid },
        })
      );
    }
    return out;
  }

  function collectAgreements(customerEvalResults) {
    if (!agreementStore?.listForCustomer) return [];
    const cids = asArray(customerEvalResults)
      .map((c) => normalizeText(c.customerId || c.id))
      .filter(Boolean);
    const out = [];
    for (const cid of cids) {
      const agreements = asArray(agreementStore.listForCustomer(cid));
      for (const a of agreements) {
        out.push(
          notif({
            type: 'agreement',
            title: `Avtal: ${normalizeText(a.status) || 'utkast'}`,
            body: normalizeText(a.title || ''),
            at: a.updatedAt || a.createdAt,
            customerId: cid,
            source: { kind: 'agreement', id: a.id || a.agreementId || null },
          })
        );
      }
    }
    return out;
  }

  async function collectMail() {
    if (!journalStore?.listAllEntries) return [];
    const entries = asArray(await journalStore.listAllEntries({}));
    return entries.map((e) =>
      notif({
        type: 'mail',
        title: normalizeText(e.subject || e.title || 'Mailhändelse'),
        body: normalizeText(e.preview || e.snippet || ''),
        at: e.at || e.createdAt || e.receivedAt,
        customerId: e.customerId || null,
        source: { kind: 'journal_entry', id: e.id || e.entryId || null },
      })
    );
  }

  async function getFeed({
    role = null,
    sinceHours = 72,
    customerEvalResults = null,
    limit = 100,
    userId = null,
  } = {}) {
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
    const safeSinceHours =
      Number.isFinite(Number(sinceHours)) && Number(sinceHours) > 0 ? Number(sinceHours) : 72;
    const cutoff = Date.now() - safeSinceHours * 3600 * 1000;

    const groups = await Promise.all([
      collectBooking(),
      Promise.resolve(collectCompliance()),
      Promise.resolve(collectIdVerification(customerEvalResults)),
      Promise.resolve(collectAgreements(customerEvalResults)),
      collectMail(),
    ]);

    let items = groups.flat();

    // Filtrera på tidsfönster (sinceHours).
    items = items.filter((it) => {
      const t = new Date(it.createdAt).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });

    // Markera läst-status per användare.
    const readIds = readStore?.getReadIds ? readStore.getReadIds(userId) : new Set();
    items.forEach((it) => {
      it.read = readIds.has(it.id);
    });

    // Sortera nyast först, sen begränsa.
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const limited = items.slice(0, safeLimit);

    const byType = {};
    for (const t of NOTIFICATION_TYPES) byType[t] = 0;
    let unread = 0;
    for (const it of limited) {
      byType[it.type] = (byType[it.type] || 0) + 1;
      if (!it.read) unread += 1;
    }

    if (auditLog) {
      auditLog.append({
        action: 'cco.notification.feed_read',
        actor: {
          role: normalizeText(role) || 'system',
          userId: userId ? normalizeText(userId) : null,
        },
        target: { kind: 'notification_feed', id: userId ? normalizeText(userId) : 'anon' },
        detail: { returned: limited.length, total: items.length, unread },
      });
    }

    return {
      role: role ? normalizeText(role) : null,
      userId: userId ? normalizeText(userId) : null,
      sinceHours: safeSinceHours,
      generatedAt: nowIso(),
      count: limited.length,
      total: items.length,
      unread,
      byType,
      items: limited,
    };
  }

  return { getFeed, NOTIFICATION_TYPES };
}

module.exports = { createCcoNotificationFeedStore, NOTIFICATION_TYPES };
