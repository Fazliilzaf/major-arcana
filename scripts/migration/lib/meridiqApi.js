'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BASE = 'https://api.meridiq.com';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
}

function normalizePhone(value) {
  const cleaned = normalizeText(value).replace(/[\s\-()]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned.replace(/[^\d+]/g, '');
  if (/^0[0-9]/.test(cleaned)) return '+46' + cleaned.slice(1);
  return cleaned;
}

function resolveMeridiqCredentials(options = {}) {
  const baseUrl =
    normalizeText(options.baseUrl) ||
    normalizeText(process.env.ARCANA_MERIDIQ_API_BASE) ||
    DEFAULT_BASE;
  const token =
    normalizeText(options.apiToken) ||
    normalizeText(process.env.ARCANA_MERIDIQ_API_TOKEN) ||
    normalizeText(process.env.MERIDIQ_API_TOKEN);
  let cookie =
    normalizeText(options.cookie) ||
    normalizeText(process.env.ARCANA_MERIDIQ_COOKIE) ||
    normalizeText(process.env.MERIDIQ_SESSION_COOKIE);

  const cookieFile =
    normalizeText(options.cookieFile) ||
    normalizeText(process.env.ARCANA_MERIDIQ_COOKIE_FILE) ||
    normalizeText(process.env.MERIDIQ_COOKIE_FILE);

  if (!cookie && cookieFile) {
    const resolved = path.resolve(cookieFile);
    if (!fs.existsSync(resolved)) {
      return { ok: false, missing: [`cookie file saknas: ${resolved}`], baseUrl };
    }
    cookie = fs.readFileSync(resolved, 'utf8').trim();
  }

  if (!cookie && !token) {
    return {
      ok: false,
      missing: ['ARCANA_MERIDIQ_COOKIE eller ARCANA_MERIDIQ_API_TOKEN'],
      baseUrl,
    };
  }

  return {
    ok: true,
    baseUrl,
    cookie,
    token,
    authMode: cookie ? 'cookie' : 'bearer',
  };
}

function extractPageItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'items', 'clients', 'questionaries', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function extractLastPage(payload, currentPage) {
  const meta =
    payload && typeof payload === 'object' ? payload.meta || payload.pagination || {} : {};
  const last =
    Number(meta.last_page) ||
    Number(meta.lastPage) ||
    Number(payload?.last_page) ||
    Number(payload?.total_pages) ||
    0;
  if (last > 0) return last;
  const items = extractPageItems(payload);
  if (!items.length) return currentPage;
  return currentPage;
}

function buildAuthHeaders(credentials) {
  const headers = { Accept: 'application/json' };
  if (credentials.cookie) headers.Cookie = credentials.cookie;
  else if (credentials.token) headers.Authorization = `Bearer ${credentials.token}`;
  return headers;
}

async function meridiqFetch(relativePath, { credentials, query = {}, method = 'GET' } = {}) {
  const url = new URL(
    relativePath,
    credentials.baseUrl.endsWith('/') ? credentials.baseUrl : `${credentials.baseUrl}/`
  );
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: buildAuthHeaders(credentials),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = { raw: text.slice(0, 200) };
    }
  }
  if (!response.ok) {
    const message =
      (payload && payload.message) ||
      (payload && payload.error) ||
      `Meridiq API HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.authError = response.status === 401 || response.status === 403;
    throw error;
  }
  return payload;
}

async function listAllPages(fetchPage, { startPage = 1, maxPages = 500 } = {}) {
  const out = [];
  let page = startPage;
  let lastPage = startPage;
  while (page <= maxPages) {
    const payload = await fetchPage(page);
    const items = extractPageItems(payload);
    out.push(...items);
    lastPage = extractLastPage(payload, page);
    if (!items.length || page >= lastPage) break;
    page += 1;
  }
  return out;
}

async function verifyMeridiqAccess(credentials) {
  const payload = await meridiqFetch('/api/v2/questionary', {
    credentials,
    query: { per_page: 1, page: 1 },
  });
  const sample = extractPageItems(payload);
  return {
    ok: true,
    sampleCount: sample.length,
    endpoint: '/api/v2/questionary',
  };
}

async function listClients(credentials, { perPage = 50 } = {}) {
  return listAllPages(
    (page) =>
      meridiqFetch('/api/v2/client', {
        credentials,
        query: { per_page: perPage, page },
      }),
    { maxPages: 300 }
  );
}

async function listClientQuestionaries(clientId, credentials) {
  const payload = await meridiqFetch(
    `/api/v2/client/${encodeURIComponent(clientId)}/questionaries`,
    {
      credentials,
    }
  );
  return extractPageItems(payload);
}

function normalizeMeridiqClient(row = {}) {
  const id = row.id ?? row.client_id ?? row.clientId;
  return {
    meridiqClientId: id != null ? String(id) : '',
    email: normalizeEmail(row.email || row.primary_email || row.primaryEmail),
    phone: normalizePhone(row.phone_number || row.phone || row.mobile),
    firstName: normalizeText(row.first_name || row.firstName),
    lastName: normalizeText(row.last_name || row.lastName),
    hasJournalHint: Boolean(row.has_journal || row.journal_count || row.questionaries_count),
  };
}

function normalizeMeridiqQuestionaryEntry(row = {}) {
  const entryId = row.id ?? row.client_questionary_id ?? row.questionary_response_id;
  const questionaryId =
    row.questionary_id ?? row.questionaryId ?? row.company_service_questionnaire_id;
  return {
    meridiqEntryId: entryId != null ? String(entryId) : '',
    questionaryId: questionaryId != null ? String(questionaryId) : '',
    title: normalizeText(row.title || row.name || row.questionary_title),
    signedAt:
      normalizeText(row.signed_at) ||
      normalizeText(row.completed_at) ||
      normalizeText(row.updated_at) ||
      normalizeText(row.created_at) ||
      null,
    pdfUrl:
      normalizeText(row.pdf_url) ||
      normalizeText(row.pdfUrl) ||
      normalizeText(row.signed_pdf_url) ||
      normalizeText(row.file_url) ||
      null,
    authorName:
      normalizeText(row.author_name) ||
      normalizeText(row.user_name) ||
      normalizeText(row.signed_by) ||
      normalizeText(row.created_by_name) ||
      null,
    rawStatus: normalizeText(row.status),
  };
}

module.exports = {
  DEFAULT_BASE,
  resolveMeridiqCredentials,
  meridiqFetch,
  listAllPages,
  extractPageItems,
  verifyMeridiqAccess,
  listClients,
  listClientQuestionaries,
  normalizeMeridiqClient,
  normalizeMeridiqQuestionaryEntry,
  normalizeEmail,
  normalizePhone,
};
