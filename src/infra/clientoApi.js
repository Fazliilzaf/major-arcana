const DEFAULT_CLIENTO_API_BASE_URL = 'https://cliento.com/api/v2/partner/cliento';

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function buildClientoPartnerBaseUrl({ apiBaseUrl = DEFAULT_CLIENTO_API_BASE_URL, partnerId }) {
  const normalizedPartnerId = String(partnerId ?? '').trim();
  if (!normalizedPartnerId) {
    throw new Error('Cliento partnerId saknas.');
  }

  const normalizedBaseUrl = trimTrailingSlash(apiBaseUrl) || DEFAULT_CLIENTO_API_BASE_URL;
  return `${normalizedBaseUrl}/${encodeURIComponent(normalizedPartnerId)}/`;
}

function buildClientoHeaders({
  apiKey = '',
  authHeader = 'Authorization',
  authScheme = 'Bearer',
} = {}) {
  const headers = {
    Accept: 'application/json',
  };

  const normalizedKey = String(apiKey ?? '').trim();
  if (!normalizedKey) {
    return headers;
  }

  const normalizedHeader = String(authHeader ?? '').trim() || 'Authorization';
  const normalizedScheme = String(authScheme ?? '').trim();
  headers[normalizedHeader] = normalizedScheme
    ? `${normalizedScheme} ${normalizedKey}`
    : normalizedKey;
  return headers;
}

function normalizeCsvParam(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item ?? '').split(','))
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',');
  }
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function padTimePart(value) {
  return String(value).padStart(2, '0');
}

function addMinutesToLocalDateTime(value = '', minutesToAdd = 0) {
  const match = normalizeText(value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  const minutes = Number(minutesToAdd);
  if (!match || !Number.isFinite(minutes) || minutes <= 0) return '';
  const [, date, hoursRaw, minutesRaw, secondsRaw = '00'] = match;
  const totalMinutes = Number(hoursRaw) * 60 + Number(minutesRaw) + minutes;
  const nextHours = Math.floor(totalMinutes / 60) % 24;
  const nextMinutes = totalMinutes % 60;
  return `${date}T${padTimePart(nextHours)}:${padTimePart(nextMinutes)}:${secondsRaw}`;
}

function pickArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  const safe = asObject(payload);
  for (const candidate of [safe.slots, safe.data, safe.items, safe.resources]) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return [];
}

function normalizeClientoSlot(input = {}) {
  const safe = asObject(input);
  const startsAt = normalizeText(
    safe.startsAt ||
      safe.start ||
      safe.from ||
      safe.startTime ||
      safe.dateTime ||
      (safe.date && safe.time ? `${safe.date}T${safe.time}` : '')
  );
  if (!startsAt) return null;
  const resourceId = normalizeText(safe.resourceId || safe.resId || safe.staffId || safe.resource);
  const serviceIds = asArray(safe.serviceIds);
  const serviceId = normalizeText(safe.serviceId || safe.srvId || safe.service || serviceIds[0]);
  const lengthMinutes = Number(safe.length || safe.duration || safe.durationMinutes || 0);
  const computedEndsAt = addMinutesToLocalDateTime(startsAt, lengthMinutes);
  const slotId =
    normalizeText(safe.slotId || safe.id || safe.key) ||
    [startsAt, resourceId, serviceId].filter(Boolean).join('::');
  return {
    slotId,
    startsAt,
    endsAt: normalizeText(safe.endsAt || safe.end || safe.to || safe.endTime) || computedEndsAt,
    resourceId,
    resourceLabel: normalizeText(
      safe.resourceLabel || safe.resourceName || safe.staffName || safe.name
    ),
    serviceId,
    serviceLabel: normalizeText(safe.serviceLabel || safe.serviceName),
    locationLabel: normalizeText(safe.locationLabel || safe.locationName),
    source: 'cliento',
  };
}

function normalizeClientoSlotsPayload(payload) {
  const safePayload = asObject(payload);
  const slotGroups = asArray(safePayload.resourceSlots).length
    ? asArray(safePayload.resourceSlots)
    : pickArrayPayload(payload);
  return slotGroups
    .flatMap((item) => {
      const safe = asObject(item);
      const nestedSlots = asArray(safe.slots);
      if (!nestedSlots.length) return [safe];
      return nestedSlots.map((slot) => ({
        ...slot,
        resourceId: slot.resourceId || safe.resourceId || safe.resId || safe.id,
        resourceLabel: slot.resourceLabel || safe.resourceLabel || safe.name,
      }));
    })
    .map((slot) => normalizeClientoSlot(slot))
    .filter(Boolean);
}

function normalizeClientoRefItem(input = {}, fallbackType = '') {
  const safe = asObject(input);
  const id = normalizeText(
    safe.id || safe.resourceId || safe.resId || safe.serviceId || safe.srvId || safe.value
  );
  if (!id) return null;
  const label =
    normalizeText(
      safe.label || safe.title || safe.name || safe.resourceLabel || safe.serviceLabel || safe.text
    ) || id;
  return {
    id,
    label,
    type: normalizeText(safe.type || fallbackType),
    durationMinutes: Number.isFinite(Number(safe.durationMinutes || safe.duration))
      ? Number(safe.durationMinutes || safe.duration)
      : null,
    raw: safe,
  };
}

function pickRefArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  const safe = asObject(payload);
  for (const key of keys) {
    if (Array.isArray(safe[key])) return safe[key];
  }
  const data = asObject(safe.data);
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function normalizeClientoCustomerRecord(input = {}, accountId = '') {
  const safe = asObject(input);
  const clientoId = normalizeText(
    safe.id || safe.customerId || safe.clientId || safe.custId || safe.hashId
  );
  const name = normalizeText(safe.name || safe.fullName || safe.customerName || safe.label);
  const email = normalizeEmail(safe.email || safe.customerEmail || safe.mail || safe.primaryEmail);
  const phone = normalizePhone(safe.phone || safe.mobile || safe.customerPhone || safe.phoneMobile);
  const altPhone = normalizePhone(safe.altPhone || safe.phoneAlt || safe.otherPhone);
  const personnummer = normalizeText(
    safe.personnummer || safe.personalNumber || safe.ssn || safe.socialSecurityNumber
  );
  const updatedAt = normalizeText(
    safe.updatedAt || safe.modifiedAt || safe.changedAt || safe.lastModified
  );
  const emails = [...new Set([email].filter(Boolean))];
  const phones = [...new Set([phone, altPhone].filter(Boolean))];
  if (!clientoId && !name && !emails.length && !phones.length && !personnummer) {
    return null;
  }
  return {
    clientoId,
    accountId: normalizeText(accountId),
    name,
    personnummer,
    emails,
    primaryEmail: emails[0] || '',
    phones,
    primaryPhone: phones[0] || '',
    updatedAt,
    raw: safe,
  };
}

function normalizeEmail(value) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
  return normalized;
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function pickCustomersArray(payload) {
  if (Array.isArray(payload)) return payload;
  const safe = asObject(payload);
  for (const candidate of [safe.customers, safe.data, safe.items, safe.results, safe.rows]) {
    if (Array.isArray(candidate)) return candidate;
  }
  const data = asObject(safe.data);
  for (const candidate of [data.customers, data.items, data.results, data.rows]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeClientoCustomersPayload(payload, accountId = '') {
  return pickCustomersArray(payload)
    .map((item) => normalizeClientoCustomerRecord(item, accountId))
    .filter(Boolean);
}

function normalizeClientoRefDataPayload(payload) {
  const resources = pickRefArray(payload, ['resources', 'staff', 'employees', 'users', 'resource'])
    .map((item) => normalizeClientoRefItem(item, 'resource'))
    .filter(Boolean);
  const services = pickRefArray(payload, ['services', 'service', 'treatments', 'srv', 'activities'])
    .map((item) => normalizeClientoRefItem(item, 'service'))
    .filter(Boolean);
  return {
    resources,
    services,
  };
}

function appendSearchParams(url, params = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null) continue;
    const value = typeof rawValue === 'number' ? String(rawValue) : String(rawValue).trim();
    if (!value) continue;
    searchParams.set(key, value);
  }
  url.search = searchParams.toString();
  return url;
}

function createClientoApi(
  {
    partnerId,
    apiBaseUrl = DEFAULT_CLIENTO_API_BASE_URL,
    apiKey = '',
    authHeader = 'Authorization',
    authScheme = 'Bearer',
    timeoutMs = 10000,
  } = {},
  { fetchImpl = global.fetch } = {}
) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch saknas för Cliento API.');
  }

  const baseUrl = buildClientoPartnerBaseUrl({ apiBaseUrl, partnerId });
  const headers = buildClientoHeaders({ apiKey, authHeader, authScheme });

  async function requestJson(pathname, params = {}) {
    const url = appendSearchParams(new URL(String(pathname).replace(/^\//, ''), baseUrl), params);
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawText = await response.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = rawText;
    }

    if (!response.ok) {
      const error = new Error(`Cliento request misslyckades (${response.status})`);
      error.statusCode = response.status;
      error.details = payload;
      throw error;
    }

    return payload;
  }

  return {
    getSettings() {
      return requestJson('/settings/');
    },
    getRefData() {
      return requestJson('/ref-data/');
    },
    getSlots({ fromDate, toDate, resIds, srvIds }) {
      return requestJson('/resources/slots', {
        fromDate,
        toDate,
        resIds: normalizeCsvParam(resIds),
        srvIds: normalizeCsvParam(srvIds),
      });
    },
    getReviews({ offset = 0, limit = 10, stars = '' } = {}) {
      return requestJson('/reviews/', {
        offset,
        limit,
        stars: normalizeCsvParam(stars),
      });
    },
    getCustomers({ offset = 0, limit = 100, updatedSince = '' } = {}) {
      return requestJson('/customers/', {
        offset,
        limit,
        updatedSince: normalizeText(updatedSince),
      });
    },
    async listAllCustomers({ pageSize = 100, maxPages = 500, updatedSince = '' } = {}) {
      const rows = [];
      let offset = 0;
      for (let page = 0; page < maxPages; page += 1) {
        const payload = await this.getCustomers({
          offset,
          limit: pageSize,
          updatedSince,
        });
        const batch = normalizeClientoCustomersPayload(payload, partnerId);
        if (!batch.length) break;
        rows.push(...batch);
        if (batch.length < pageSize) break;
        offset += batch.length;
      }
      return rows;
    },
  };
}

module.exports = {
  DEFAULT_CLIENTO_API_BASE_URL,
  buildClientoPartnerBaseUrl,
  buildClientoHeaders,
  normalizeClientoCustomerRecord,
  normalizeClientoCustomersPayload,
  normalizeClientoSlot,
  normalizeClientoRefDataPayload,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
  createClientoApi,
};
