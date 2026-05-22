const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tickets: [],
  };
}

function normalizeSeverity(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) return normalized;
  return 'high';
}

function normalizeStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['open', 'resolved'].includes(normalized)) return normalized;
  return 'open';
}

function normalizeTicket(rawTicket) {
  const source = rawTicket && typeof rawTicket === 'object' ? rawTicket : {};
  const id = normalizeText(source.id);
  if (!id) return null;
  const tenantId = normalizeText(source.tenantId);
  if (!tenantId) return null;
  const signature = normalizeText(source.signature).toLowerCase();
  if (!signature) return null;

  const occurrences = clamp(source.occurrences, 1, 1000000, 1);
  return {
    id,
    tenantId,
    signature,
    category: normalizeText(source.category) || 'slo_breach',
    source: normalizeText(source.source) || 'scheduler.alert_probe',
    status: normalizeStatus(source.status),
    severity: normalizeSeverity(source.severity),
    summary: normalizeText(source.summary) || signature,
    details: normalizeText(source.details) || '',
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
    firstSeenAt: toIso(source.firstSeenAt) || nowIso(),
    lastSeenAt: toIso(source.lastSeenAt) || toIso(source.firstSeenAt) || nowIso(),
    createdAt: toIso(source.createdAt) || toIso(source.firstSeenAt) || nowIso(),
    updatedAt: toIso(source.updatedAt) || toIso(source.lastSeenAt) || nowIso(),
    resolvedAt: toIso(source.resolvedAt),
    resolvedBy: normalizeText(source.resolvedBy) || null,
    resolveNote: normalizeText(source.resolveNote) || '',
    occurrences,
  };
}

function toSafeTicket(ticket) {
  return {
    id: ticket.id,
    tenantId: ticket.tenantId,
    signature: ticket.signature,
    category: ticket.category,
    source: ticket.source,
    status: ticket.status,
    severity: ticket.severity,
    summary: ticket.summary,
    details: ticket.details,
    metadata: ticket.metadata,
    firstSeenAt: ticket.firstSeenAt,
    lastSeenAt: ticket.lastSeenAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    resolvedBy: ticket.resolvedBy,
    resolveNote: ticket.resolveNote,
    occurrences: Number(ticket.occurrences || 0),
  };
}

function normalizeTicketLimit(value, fallback = 3000) {
  const parsed = parsePositiveInt(value, fallback);
  return clamp(parsed, 100, 50000, fallback);
}

function normalizeHistory(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  for (const item of items) {
    const ticket = normalizeTicket(item);
    if (!ticket) continue;
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    normalized.push(ticket);
  }
  normalized.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return normalized;
}

function sortTicketsDesc(items) {
  return items.slice().sort((a, b) => {
    const byUpdated = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    if (byUpdated !== 0) return byUpdated;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function resolveTicketTenant(ticketTenantId, tenantId) {
  const ticketTenant = normalizeText(ticketTenantId);
  const requestTenant = normalizeText(tenantId);
  if (!requestTenant) return ticketTenant;
  return ticketTenant === requestTenant ? ticketTenant : '';
}

async function createSloTicketStore({
  filePath,
  maxTickets = 3000,
} = {}) {
  if (!filePath) throw new Error('sloTicketStore filePath saknas.');
  const safeMaxTickets = normalizeTicketLimit(maxTickets, 3000);

  let state = emptyState();

  async function load() {
    const existing = await readJson(filePath, null);
    if (!existing || typeof existing !== 'object') {
      state = emptyState();
      return;
    }
    state = {
      version: 1,
      createdAt: toIso(existing.createdAt) || nowIso(),
      updatedAt: toIso(existing.updatedAt) || nowIso(),
      tickets: normalizeHistory(existing.tickets),
    };
    if (state.tickets.length > safeMaxTickets) {
      state.tickets = state.tickets.slice(state.tickets.length - safeMaxTickets);
    }
  }

  async function persist() {
    state.updatedAt = nowIso();
    if (state.tickets.length > safeMaxTickets) {
      state.tickets = state.tickets.slice(state.tickets.length - safeMaxTickets);
    }
    await writeJsonAtomic(filePath, state);
  }

  function selectTicketsForTenant(tenantId) {
    const normalizedTenant = normalizeText(tenantId);
    if (!normalizedTenant) return state.tickets.slice();
    return state.tickets.filter((ticket) => resolveTicketTenant(ticket.tenantId, normalizedTenant));
  }

  async function listTickets({
    tenantId,
    status = '',
    limit = 50,
  } = {}) {
    const safeLimit = clamp(parsePositiveInt(limit, 50), 1, 500, 50);
    const normalizedStatus = normalizeStatus(status);
    const hasStatusFilter = normalizeText(status) !== '';
    const selected = selectTicketsForTenant(tenantId).filter((ticket) => {
      if (!hasStatusFilter) return true;
      return ticket.status === normalizedStatus;
    });
    const sorted = sortTicketsDesc(selected).slice(0, safeLimit);
    return {
      count: sorted.length,
      tickets: sorted.map((ticket) => toSafeTicket(ticket)),
    };
  }

  async function summarize({
    tenantId,
  } = {}) {
    const selected = selectTicketsForTenant(tenantId);
    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    let open = 0;
    let resolved = 0;
    let openBreaches = 0;
    let latestOpenAt = null;

    for (const ticket of selected) {
      const severity = normalizeSeverity(ticket.severity);
      bySeverity[severity] += 1;
      if (ticket.status === 'resolved') {
        resolved += 1;
      } else {
        open += 1;
        if (severity === 'critical' || severity === 'high') {
          openBreaches += 1;
        }
        if (!latestOpenAt || String(ticket.updatedAt || '').localeCompare(latestOpenAt) > 0) {
          latestOpenAt = String(ticket.updatedAt || '');
        }
      }
    }

    return {
      generatedAt: nowIso(),
      tenantId: normalizeText(tenantId) || null,
      totals: {
        tickets: selected.length,
        open,
        resolved,
        openBreaches,
      },
      bySeverity,
      latestOpenAt: toIso(latestOpenAt),
    };
  }

  async function upsertBreach({
    tenantId,
    signature,
    severity = 'high',
    summary = '',
    details = '',
    metadata = {},
    source = 'scheduler.alert_probe',
  } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId) throw new Error('tenantId saknas för SLO-ticket.');
    const normalizedSignature = normalizeText(signature).toLowerCase();
    if (!normalizedSignature) throw new Error('signature saknas för SLO-ticket.');

    const ts = nowIso();
    let created = false;
    let ticket = state.tickets.find(
      (item) =>
        item.tenantId === normalizedTenantId &&
        item.signature === normalizedSignature &&
        item.status === 'open'
    );

    if (!ticket) {
      created = true;
      ticket = {
        id: `slo_${crypto.randomUUID()}`,
        tenantId: normalizedTenantId,
        signature: normalizedSignature,
        category: 'slo_breach',
        source: normalizeText(source) || 'scheduler.alert_probe',
        status: 'open',
        severity: normalizeSeverity(severity),
        summary: normalizeText(summary) || normalizedSignature,
        details: normalizeText(details),
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        firstSeenAt: ts,
        lastSeenAt: ts,
        createdAt: ts,
        updatedAt: ts,
        resolvedAt: null,
        resolvedBy: null,
        resolveNote: '',
        occurrences: 1,
      };
      state.tickets.push(ticket);
    } else {
      ticket.lastSeenAt = ts;
      ticket.updatedAt = ts;
      ticket.severity = normalizeSeverity(severity);
      ticket.summary = normalizeText(summary) || ticket.summary;
      ticket.details = normalizeText(details) || ticket.details;
      ticket.metadata = metadata && typeof metadata === 'object' ? metadata : ticket.metadata || {};
      ticket.occurrences = clamp(Number(ticket.occurrences || 0) + 1, 1, 1000000, 1);
    }

    await persist();
    return {
      created,
      ticket: toSafeTicket(ticket),
      summary: await summarize({ tenantId: normalizedTenantId }),
    };
  }

  async function resolveTicket({
    tenantId,
    ticketId,
    resolvedBy = '',
    note = '',
  } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedTicketId = normalizeText(ticketId);
    if (!normalizedTenantId || !normalizedTicketId) {
      throw new Error('tenantId/ticketId krävs.');
    }
    const ticket = state.tickets.find(
      (item) => item.id === normalizedTicketId && item.tenantId === normalizedTenantId
    );
    if (!ticket) return null;
    if (ticket.status === 'resolved') return toSafeTicket(ticket);
    ticket.status = 'resolved';
    ticket.resolvedAt = nowIso();
    ticket.updatedAt = ticket.resolvedAt;
    ticket.resolvedBy = normalizeText(resolvedBy) || null;
    ticket.resolveNote = normalizeText(note);
    await persist();
    return toSafeTicket(ticket);
  }

  await load();
  await persist();

  return {
    filePath,
    maxTickets: safeMaxTickets,
    listTickets,
    summarize,
    upsertBreach,
    resolveTicket,
  };
}

module.exports = {
  createSloTicketStore,
};
