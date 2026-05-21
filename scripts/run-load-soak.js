#!/usr/bin/env node

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseFloatSafe(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function maxValue(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  let max = Number(values[0]) || 0;
  for (let i = 1; i < values.length; i += 1) {
    const current = Number(values[i]) || 0;
    if (current > max) max = current;
  }
  return max;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const normalizedKey = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[normalizedKey] = 'true';
      continue;
    }
    out[normalizedKey] = next;
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeText(args.baseUrl || process.env.BASE_URL || 'http://localhost:3000');
  const path = normalizeText(args.path || '/healthz');
  const durationSec = parsePositiveInt(args.durationSec, 60);
  const concurrency = parsePositiveInt(args.concurrency, 8);
  const timeoutMs = parsePositiveInt(args.timeoutMs, 8000);
  const thinkMs = parsePositiveInt(args.thinkMs, 0);
  const failFastErrorRatePct = parseFloatSafe(args.failFastErrorRatePct, 60);

  const targetUrl = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const endAt = Date.now() + durationSec * 1000;

  const totals = {
    requests: 0,
    success2xx: 0,
    status4xx: 0,
    status5xx: 0,
    networkErrors: 0,
  };
  const latencies = [];

  let aborted = false;

  async function workerLoop() {
    while (!aborted && Date.now() < endAt) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'x-load-test': 'arcana-soak',
          },
        });
        const latencyMs = Date.now() - startedAt;
        latencies.push(latencyMs);
        totals.requests += 1;

        if (response.status >= 200 && response.status < 300) totals.success2xx += 1;
        else if (response.status >= 400 && response.status < 500) totals.status4xx += 1;
        else if (response.status >= 500) totals.status5xx += 1;
      } catch {
        const latencyMs = Date.now() - startedAt;
        latencies.push(latencyMs);
        totals.requests += 1;
        totals.networkErrors += 1;
      } finally {
        clearTimeout(timer);
      }

      const totalErrors = totals.status4xx + totals.status5xx + totals.networkErrors;
      const errorRatePct = totals.requests > 0 ? (totalErrors / totals.requests) * 100 : 0;
      if (errorRatePct >= failFastErrorRatePct && totals.requests >= Math.max(20, concurrency * 4)) {
        aborted = true;
      }

      if (thinkMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, thinkMs));
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(workerLoop());
  }
  await Promise.all(workers);

  const elapsedSec = Math.max(1, Math.round((durationSec * 1000 - Math.max(0, endAt - Date.now())) / 1000));
  const rps = Number((totals.requests / elapsedSec).toFixed(2));
  const totalErrors = totals.status4xx + totals.status5xx + totals.networkErrors;
  const errorRatePct = totals.requests > 0 ? Number(((totalErrors / totals.requests) * 100).toFixed(2)) : 0;

  const summary = {
    targetUrl,
    durationSec,
    elapsedSec,
    concurrency,
    totals,
    rps,
    errorRatePct,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: maxValue(latencies),
    },
    aborted,
    generatedAt: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (totals.requests === 0) {
    process.exitCode = 2;
    return;
  }
  if (errorRatePct >= failFastErrorRatePct) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
