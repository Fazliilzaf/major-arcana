'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Monoton — tva anrop i samma millisekund (vanligt i snabba CI-korningar,
// t.ex. skapa+patcha samma rapport direkt efter varandra) far annars
// identisk updatedAt, vilket bryter "patchReport ska andra updatedAt".
let lastIssuedMs = 0;
function nowIso() {
  let ms = Date.now();
  if (ms <= lastIssuedMs) ms = lastIssuedMs + 1;
  lastIssuedMs = ms;
  return new Date(ms).toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function resolveWeekBoundaries(week = '') {
  const normalized = normalizeText(week);
  const match = normalized.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const weekNum = Number(match[2]);
  if (weekNum < 1 || weekNum > 53) return null;

  // ISO 8601: vecka 1 är den vecka som innehåller första torsdagen.
  // Räkna bakåt från 4 jan.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=monday...7=sunday
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
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
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createEmptyState() {
  const ts = nowIso();
  return {
    version: 1,
    updatedAt: ts,
    reports: [],
  };
}

function normalizeReport(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const sections = asObject(source.sections);
  const kpi = asObject(sections.kpi);

  const week = normalizeText(source.week) || '';
  const boundaries = resolveWeekBoundaries(week);

  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    tenantId: normalizeText(source.tenantId) || 'default',
    brand: normalizeText(source.brand) || normalizeText(source.tenantId) || 'default',
    week,
    periodStart: boundaries?.periodStart || normalizeText(source.periodStart) || '',
    periodEnd: boundaries?.periodEnd || normalizeText(source.periodEnd) || '',
    status: normalizeText(source.status).toLowerCase() || 'draft',
    createdBy: normalizeText(source.createdBy) || 'agent',
    summary: normalizeText(source.summary) || '',
    sections: {
      kpi: {
        gsc: asObject(kpi.gsc),
        google_ads: asObject(kpi.google_ads),
        meta: asObject(kpi.meta),
        linkedin: asObject(kpi.linkedin),
        mail: asObject(kpi.mail),
        web: asObject(kpi.web),
      },
      done: asArray(sections.done),
      planned: asArray(sections.planned),
      draftsPending: asArray(sections.draftsPending),
      blockers: asArray(sections.blockers),
    },
    createdAt: normalizeText(source.createdAt) || nowIso(),
    updatedAt: normalizeText(source.updatedAt) || nowIso(),
  };
}

function createMarketingWeeklyReportsStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('marketingWeeklyReportsStore filePath saknas.');

  let state = null;

  async function load() {
    if (state) return state;
    state = await readJson(resolvedPath, createEmptyState());
    if (!state || typeof state !== 'object') state = createEmptyState();
    if (!Array.isArray(state.reports)) state.reports = [];
    return state;
  }

  async function save() {
    const current = await load();
    current.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, current);
  }

  function findIndex({ tenantId, id }) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedId = normalizeText(id);
    return state.reports.findIndex(
      (item) =>
        normalizeText(item.id) === normalizedId &&
        normalizeText(item.tenantId) === normalizedTenantId
    );
  }

  return {
    filePath: resolvedPath,

    async listReports({ tenantId = '', brand = '', week = '', status = '', limit = 200 } = {}) {
      await load();
      const normalizedTenantId = normalizeText(tenantId);
      const normalizedBrand = normalizeText(brand);
      const normalizedWeek = normalizeText(week);
      const normalizedStatus = normalizeText(status).toLowerCase();
      const max = Math.max(1, Math.min(500, Number(limit) || 200));

      let items = state.reports.map((report) => normalizeReport(report));
      if (normalizedTenantId) {
        items = items.filter((report) => report.tenantId === normalizedTenantId);
      }
      if (normalizedBrand) {
        items = items.filter((report) => report.brand === normalizedBrand);
      }
      if (normalizedWeek) {
        items = items.filter((report) => report.week === normalizedWeek);
      }
      if (normalizedStatus) {
        items = items.filter((report) => report.status === normalizedStatus);
      }

      return items
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, max);
    },

    async getReport({ tenantId, id }) {
      await load();
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;
      return normalizeReport(state.reports[index]);
    },

    async getReportByWeek({ tenantId, brand, week }) {
      const items = await this.listReports({ tenantId, brand, week, limit: 1 });
      return items[0] || null;
    },

    async upsertReport(input = {}) {
      await load();
      const next = normalizeReport(input);
      const index = findIndex({ tenantId: next.tenantId, id: next.id });

      if (index >= 0) {
        const existing = normalizeReport(state.reports[index]);
        const merged = {
          ...existing,
          ...next,
          id: existing.id,
          tenantId: existing.tenantId,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
        };
        state.reports[index] = merged;
        await save();
        return normalizeReport(merged);
      }

      state.reports.push(next);
      await save();
      return normalizeReport(next);
    },

    async patchReport({ tenantId, id, fields = {}, changedBy = '' } = {}) {
      await load();
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;

      const existing = normalizeReport(state.reports[index]);
      const safeFields = asObject(fields);
      const updated = {
        ...existing,
        ...safeFields,
        id: existing.id,
        tenantId: existing.tenantId,
        updatedAt: nowIso(),
      };
      state.reports[index] = updated;
      await save();
      return normalizeReport(updated);
    },

    async deleteReport({ tenantId, id }) {
      await load();
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;
      const removed = state.reports.splice(index, 1)[0];
      await save();
      return normalizeReport(removed);
    },

    async replaceKpi({ tenantId, id, channel, data }) {
      await load();
      const index = findIndex({ tenantId, id });
      if (index < 0) return null;

      const existing = normalizeReport(state.reports[index]);
      const sections = { ...existing.sections };
      const kpi = { ...sections.kpi };
      kpi[normalizeText(channel)] = asObject(data);
      sections.kpi = kpi;
      existing.sections = sections;
      existing.updatedAt = nowIso();
      state.reports[index] = existing;
      await save();
      return normalizeReport(existing);
    },
  };
}

module.exports = {
  createMarketingWeeklyReportsStore,
  normalizeReport,
  resolveWeekBoundaries,
};
