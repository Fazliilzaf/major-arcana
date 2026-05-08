function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizePath(pathValue) {
  const raw = typeof pathValue === 'string' ? pathValue.trim() : '';
  if (!raw) return '/';
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token');
}

function inferArea(pathValue = '') {
  const path = normalizePath(pathValue);
  if (path.startsWith('/api/v1/auth')) return 'auth';
  if (path.startsWith('/api/v1/risk')) return 'risk';
  if (path.startsWith('/api/v1/orchestrator')) return 'orchestrator';
  if (path.startsWith('/api/v1/incidents')) return 'incidents';
  if (path.startsWith('/api/v1/monitor')) return 'monitor';
  if (path.startsWith('/api/v1/ops')) return 'ops';
  if (path.startsWith('/api/v1/templates')) return 'templates';
  if (path.startsWith('/api/public')) return 'public_api';
  if (path === '/chat' || path.startsWith('/chat')) return 'public_chat';
  return 'other';
}

function percentile(sortedValues, q) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
  const clamped = Math.max(0, Math.min(100, Number(q) || 0));
  if (clamped === 0) return sortedValues[0];
  const rank = Math.ceil((clamped / 100) * sortedValues.length) - 1;
  const index = Math.max(0, Math.min(sortedValues.length - 1, rank));
  return sortedValues[index];
}

function summarizeLatency(samples = []) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      count: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    };
  }
  const values = samples
    .map((item) => Number(item.durationMs || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!values.length) {
    return {
      count: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, item) => sum + item, 0);
  return {
    count: values.length,
    avgMs: Number((total / values.length).toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function createRuntimeMetricsStore({
  maxSamples = 5000,
  slowRequestMs = 1500,
} = {}) {
  const safeMaxSamples = clampInt(maxSamples, 5000, 500, 50000);
  const safeSlowRequestMs = clampInt(slowRequestMs, 1500, 50, 60000);

  const state = {
    startedAt: nowIso(),
    totalRequests: 0,
    statusBuckets: {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
      other: 0,
    },
    samples: [],
  };

  function pushSample(sample) {
    state.samples.push(sample);
    if (state.samples.length > safeMaxSamples) {
      state.samples.splice(0, state.samples.length - safeMaxSamples);
    }
  }

  function record({
    method = 'GET',
    path = '/',
    statusCode = 200,
    durationMs = 0,
  } = {}) {
    const normalizedMethod = typeof method === 'string' ? method.toUpperCase() : 'GET';
    const normalizedPath = normalizePath(path);
    const area = inferArea(normalizedPath);
    const status = Number(statusCode);
    const duration = Number(durationMs);

    state.totalRequests += 1;
    if (status >= 200 && status < 300) state.statusBuckets['2xx'] += 1;
    else if (status >= 300 && status < 400) state.statusBuckets['3xx'] += 1;
    else if (status >= 400 && status < 500) state.statusBuckets['4xx'] += 1;
    else if (status >= 500 && status < 600) state.statusBuckets['5xx'] += 1;
    else state.statusBuckets.other += 1;

    pushSample({
      ts: nowIso(),
      method: normalizedMethod,
      path: normalizedPath,
      area,
      statusCode: status,
      durationMs: Number.isFinite(duration) ? Number(duration.toFixed(2)) : 0,
    });
  }

  function middleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      record({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
      });
    });
    return next();
  }

  function getSnapshot({
    areaLimit = 10,
  } = {}) {
    const limit = clampInt(areaLimit, 10, 1, 100);
    const samples = Array.isArray(state.samples) ? state.samples : [];
    const overallLatency = summarizeLatency(samples);
    const slowRequests = samples.filter((item) => Number(item.durationMs || 0) >= safeSlowRequestMs).length;

    const byAreaMap = new Map();
    for (const sample of samples) {
      const key = sample.area || 'other';
      if (!byAreaMap.has(key)) byAreaMap.set(key, []);
      byAreaMap.get(key).push(sample);
    }

    const byArea = Array.from(byAreaMap.entries())
      .map(([area, areaSamples]) => {
        const latency = summarizeLatency(areaSamples);
        const total = areaSamples.length;
        const failures = areaSamples.filter((item) => Number(item.statusCode || 0) >= 500).length;
        const clientErrors = areaSamples.filter((item) => {
          const code = Number(item.statusCode || 0);
          return code >= 400 && code < 500;
        }).length;
        return {
          area,
          requests: total,
          serverErrors: failures,
          clientErrors,
          failureRatePercent: total > 0 ? Number(((failures / total) * 100).toFixed(2)) : 0,
          latency,
        };
      })
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);

    return {
      generatedAt: nowIso(),
      startedAt: state.startedAt,
      settings: {
        maxSamples: safeMaxSamples,
        slowRequestMs: safeSlowRequestMs,
      },
      totals: {
        requests: state.totalRequests,
        sampledRequests: samples.length,
        slowRequests,
        statusBuckets: { ...state.statusBuckets },
      },
      latency: overallLatency,
      byArea,
    };
  }

  // SF2 (fyller MT6): tenant-usage-aggregat. Stub-värden om granular per-tenant-
  // tracking ej implementerat ännu — returnerar struktur som
  // TenantUsageMetricsCapability förväntar sig.
  async function getTenantUsage(tenantId, options = {}) {
    const windowDays = Math.max(1, Math.min(365, Number(options?.windowDays) || 30));
    const snapshot = getSnapshot();
    const overallTotal = snapshot?.overall?.totalRequests || 0;
    const byArea = snapshot?.byArea || {};

    const capabilityRunsByName = {};
    for (const [area, info] of Object.entries(byArea)) {
      if (typeof area === 'string' && area.startsWith('cap:')) {
        capabilityRunsByName[area.slice(4)] = info?.totalRequests || 0;
      }
    }
    const capabilityRunsTotal = Object.values(capabilityRunsByName).reduce(
      (a, b) => a + (Number(b) || 0),
      0
    );

    return {
      tenantId: String(tenantId || ''),
      windowDays,
      capabilityRunsTotal,
      capabilityRunsByName,
      mailboxReadsApprox: Math.floor(overallTotal * 0.15),
      storageBytesApprox: 0,
      collectedAt: new Date().toISOString(),
    };
  }

  return {
    middleware,
    record,
    getSnapshot,
    getTenantUsage,
  };
}

module.exports = {
  createRuntimeMetricsStore,
};
