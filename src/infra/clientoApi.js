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

function buildClientoHeaders({ apiKey = '', authHeader = 'Authorization', authScheme = 'Bearer' } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  const normalizedKey = String(apiKey ?? '').trim();
  if (!normalizedKey) {
    return headers;
  }

  const normalizedHeader = String(authHeader ?? '').trim() || 'Authorization';
  const normalizedScheme = String(authScheme ?? '').trim();
  headers[normalizedHeader] = normalizedScheme ? `${normalizedScheme} ${normalizedKey}` : normalizedKey;
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
  return typeof value === 'string' ? value.trim() : '';
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
    safe.startsAt || safe.start || safe.from || safe.startTime || safe.dateTime
  );
  if (!startsAt) return null;
  const resourceId = normalizeText(safe.resourceId || safe.resId || safe.staffId || safe.resource);
  const serviceId = normalizeText(safe.serviceId || safe.srvId || safe.service);
  const slotId =
    normalizeText(safe.slotId || safe.id) ||
    [startsAt, resourceId, serviceId].filter(Boolean).join('::');
  return {
    slotId,
    startsAt,
    endsAt: normalizeText(safe.endsAt || safe.end || safe.to || safe.endTime),
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
  return pickArrayPayload(payload)
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
  const label = normalizeText(
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

function normalizeClientoRefDataPayload(payload) {
  const resources = pickRefArray(payload, [
    'resources',
    'staff',
    'employees',
    'users',
    'resource',
  ])
    .map((item) => normalizeClientoRefItem(item, 'resource'))
    .filter(Boolean);
  const services = pickRefArray(payload, [
    'services',
    'service',
    'treatments',
    'srv',
    'activities',
  ])
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
  };
}

module.exports = {
  DEFAULT_CLIENTO_API_BASE_URL,
  buildClientoPartnerBaseUrl,
  buildClientoHeaders,
  normalizeClientoSlot,
  normalizeClientoRefDataPayload,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
  createClientoApi,
};
