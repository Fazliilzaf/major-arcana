// k6 load-test (T4 Test enterprise).
//
// Kör: k6 run tests/load/k6-runtime-status.js
//      CCO_BASE_URL=https://arcana-cco.onrender.com k6 run ...
//
// Stages: 100 → 500 → 1000 VU under 6 min totalt.
// SLO: p95 < 800ms, error-rate < 1%.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.CCO_BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // ramp up till 100 VU
    { duration: '2m', target: 500 },   // ramp up till 500 VU
    { duration: '2m', target: 1000 },  // hold 1000 VU
    { duration: '1m', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    errors: ['rate<0.01'], // <1% errors
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Anropa healthz (snabb, cacheable)
  const healthRes = http.get(`${BASE_URL}/healthz`, {
    timeout: '5s',
  });
  const healthOk = check(healthRes, {
    'healthz 200': (r) => r.status === 200,
    'healthz < 300ms': (r) => r.timings.duration < 300,
  });
  errorRate.add(!healthOk);

  sleep(0.5);

  // Anropa runtime/status (ej autentiserad → ska returnera 401, men snabbt)
  const statusRes = http.get(`${BASE_URL}/api/v1/cco/runtime/status`, {
    timeout: '5s',
  });
  const statusOk = check(statusRes, {
    'status 401 (väntat utan auth)': (r) => r.status === 401,
    'status < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(!statusOk);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'tests/load/k6-summary.json': JSON.stringify(data, null, 2),
    stdout: `\n=== K6 SUMMARY ===\n` +
      `requests: ${data.metrics.http_reqs.values.count}\n` +
      `p95 duration: ${data.metrics.http_req_duration.values['p(95)'].toFixed(0)}ms\n` +
      `errors: ${(data.metrics.errors?.values.rate * 100 || 0).toFixed(2)}%\n`,
  };
}
