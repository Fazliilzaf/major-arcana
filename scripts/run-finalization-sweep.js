#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: wait } = require('node:timers/promises');
const { loadReusableCycleId } = require('../src/ops/releaseCycleSelection');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseEnum(value, allowed, fallback) {
  const normalized = normalizeText(value).toLowerCase();
  if (allowed.includes(normalized)) return normalized;
  return fallback;
}

function nowStamp() {
  const date = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function parseBaseUrl(rawValue = '') {
  const normalized = normalizeText(rawValue || 'http://localhost:3000');
  try {
    const parsed = new URL(normalized);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    return {
      baseUrl: parsed.toString().replace(/\/$/, ''),
      port,
      origin: parsed.origin,
      host: parsed.hostname,
    };
  } catch {
    return {
      baseUrl: 'http://localhost:3000',
      port: 3000,
      origin: 'http://localhost:3000',
      host: 'localhost',
    };
  }
}

function parseArgs(argv) {
  const base = parseBaseUrl(
    process.env.BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
  );
  const args = {
    baseUrl: base.baseUrl,
    withLocalServer: parseBoolean(process.env.ARCANA_FINALIZATION_SWEEP_WITH_LOCAL_SERVER, false),
    bootstrapReleaseCycle: parseBoolean(
      process.env.ARCANA_FINALIZATION_SWEEP_BOOTSTRAP_RELEASE_CYCLE,
      false
    ),
    bootstrapMode: parseEnum(
      process.env.ARCANA_FINALIZATION_SWEEP_BOOTSTRAP_MODE,
      ['always', 'if_missing'],
      'if_missing'
    ),
    releaseGovernanceFile: normalizeText(
      process.env.ARCANA_RELEASE_GOVERNANCE_STORE_PATH || path.join('data', 'release-governance.json')
    ),
    defaultTenantId: normalizeText(process.env.ARCANA_DEFAULT_TENANT || ''),
    strict: parseBoolean(process.env.ARCANA_FINALIZATION_SWEEP_STRICT, false),
    outFile: normalizeText(
      process.env.ARCANA_FINALIZATION_SWEEP_OUT_FILE ||
        path.join('data', 'reports', 'finalization-sweep-latest.json')
    ),
    json: parseBoolean(process.env.ARCANA_FINALIZATION_SWEEP_JSON, false),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--base-url') {
      args.baseUrl = parseBaseUrl(argv[index + 1]).baseUrl;
      index += 1;
      continue;
    }
    if (item === '--with-local-server') {
      args.withLocalServer = true;
      continue;
    }
    if (item === '--no-local-server') {
      args.withLocalServer = false;
      continue;
    }
    if (item === '--bootstrap-release-cycle') {
      args.bootstrapReleaseCycle = true;
      continue;
    }
    if (item === '--no-bootstrap-release-cycle') {
      args.bootstrapReleaseCycle = false;
      continue;
    }
    if (item === '--bootstrap-mode') {
      args.bootstrapMode = parseEnum(argv[index + 1], ['always', 'if_missing'], args.bootstrapMode);
      index += 1;
      continue;
    }
    if (item === '--release-governance-file') {
      args.releaseGovernanceFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--tenant-id') {
      args.defaultTenantId = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--strict') {
      args.strict = true;
      continue;
    }
    if (item === '--no-strict') {
      args.strict = false;
      continue;
    }
    if (item === '--out-file') {
      args.outFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--json') {
      args.json = true;
      continue;
    }
  }
  return args;
}

async function runCommand({
  id,
  cmd,
  args = [],
  cwd,
  env = {},
  timeoutMs = 10 * 60 * 1000,
}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const maxBytes = 400_000;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1500);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
      if (stdout.length > maxBytes) stdout = stdout.slice(stdout.length - maxBytes);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > maxBytes) stderr = stderr.slice(stderr.length - maxBytes);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const endedAt = new Date().toISOString();
      resolve({
        id,
        command: [cmd, ...args].join(' '),
        startedAt,
        endedAt,
        durationMs: Date.now() - startedMs,
        code: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        ok: !timedOut && code === 0,
        stdout,
        stderr,
      });
    });
  });
}

async function waitForHealth(baseUrl, { timeoutMs = 90_000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/healthz', baseUrl));
      if (response.ok) return true;
    } catch {
      // retry
    }
    await wait(intervalMs);
  }
  return false;
}

function summarizeFailures(steps = []) {
  const failed = steps.filter((item) => item.ok !== true).map((item) => item.id);
  return {
    failed,
    blockers: {
      pentest: failed.includes('check_pentest_evidence') || failed.includes('report_release_readiness'),
      stabilityWindow: failed.includes('report_stability_window') || failed.includes('release_go_live_gate'),
      formalSignoff: failed.includes('release_final_live_signoff'),
    },
  };
}

function getResponseContentType(response) {
  if (!response || !response.headers || typeof response.headers.get !== 'function') return '';
  return normalizeText(response.headers.get('content-type')).toLowerCase();
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

async function probeArcanaBaseUrl(baseUrl) {
  const result = {
    baseUrl,
    healthOk: false,
    healthLooksArcana: false,
    readinessStatus: null,
    readinessLooksJson: false,
    readinessLooksArcana: false,
    arcanaLikely: false,
  };

  try {
    const healthResponse = await fetch(new URL('/healthz', baseUrl), {
      headers: {
        Accept: 'application/json',
      },
    });
    const healthText = await healthResponse.text();
    const healthJson = parseJsonSafely(healthText);
    result.healthOk = healthResponse.ok;
    result.healthLooksArcana =
      healthResponse.ok &&
      Boolean(healthJson && typeof healthJson === 'object') &&
      Object.prototype.hasOwnProperty.call(healthJson, 'ok') &&
      Object.prototype.hasOwnProperty.call(healthJson, 'ready') &&
      Object.prototype.hasOwnProperty.call(healthJson, 'startedAt');
  } catch {
    result.healthOk = false;
    result.healthLooksArcana = false;
  }

  try {
    const readinessResponse = await fetch(new URL('/api/v1/monitor/readiness', baseUrl), {
      headers: {
        Accept: 'application/json',
      },
    });
    const readinessText = await readinessResponse.text();
    const readinessJson = parseJsonSafely(readinessText);
    const contentType = getResponseContentType(readinessResponse);
    const looksJson =
      contentType.includes('application/json') ||
      Boolean(readinessJson && typeof readinessJson === 'object');
    const status = Number(readinessResponse.status || 0);
    result.readinessStatus = status || null;
    result.readinessLooksJson = looksJson;
    result.readinessLooksArcana =
      looksJson && [200, 401, 403].includes(status) && readinessJson && typeof readinessJson === 'object';
  } catch {
    result.readinessStatus = null;
    result.readinessLooksJson = false;
    result.readinessLooksArcana = false;
  }

  result.arcanaLikely = result.healthLooksArcana && result.readinessLooksArcana;
  return result;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const base = parseBaseUrl(args.baseUrl);

  let serverProcess = null;
  let serverStarted = false;

  if (!args.withLocalServer) {
    const probe = await probeArcanaBaseUrl(base.baseUrl);
    if (!probe.arcanaLikely) {
      throw new Error(
        `Base URL verkar inte vara Arcana (${base.baseUrl}). healthLooksArcana=${probe.healthLooksArcana ? 'yes' : 'no'} readinessStatus=${probe.readinessStatus ?? '-'} readinessLooksArcana=${probe.readinessLooksArcana ? 'yes' : 'no'}. Använd --with-local-server eller --base-url mot Arcana API.`
      );
    }
  } else {
    const serverEnv = {
      PORT: String(base.port || 3000),
      PUBLIC_BASE_URL: base.origin,
    };
    serverProcess = spawn('node', ['server.js'], {
      cwd: repoRoot,
      env: { ...process.env, ...serverEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', () => {});
    serverProcess.stderr.on('data', () => {});
    serverStarted = await waitForHealth(base.baseUrl, { timeoutMs: 90_000, intervalMs: 1000 });
    if (!serverStarted) {
      throw new Error(`Local server start failed at ${base.baseUrl}`);
    }
  }

  const steps = [];
  const sharedEnv = { BASE_URL: base.baseUrl };
  let bootstrapCycleId = '';
  const bootstrapReportPath = path.join(
    repoRoot,
    'data',
    'reports',
    'finalization-bootstrap-release-cycle.json'
  );

  try {
    if (args.bootstrapReleaseCycle) {
      if (args.bootstrapMode === 'if_missing') {
        bootstrapCycleId = await loadReusableCycleId({
          filePath: args.releaseGovernanceFile,
          tenantId: args.defaultTenantId,
        });
      }
      if (bootstrapCycleId) {
        steps.push({
          id: 'bootstrap_release_cycle',
          command: 'npm run release:cycle:auto',
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 0,
          code: null,
          signal: null,
          timedOut: false,
          ok: true,
          skipped: true,
          reason: 'reused_existing_cycle',
          cycleId: bootstrapCycleId,
          stdout: '',
          stderr: '',
        });
      } else {
        const bootstrapStep = await runCommand({
          id: 'bootstrap_release_cycle',
          cmd: 'npm',
          args: ['run', 'release:cycle:auto'],
          cwd: repoRoot,
          env: {
            ...sharedEnv,
            ARCANA_RELEASE_AUTO_LAUNCH: 'true',
            ARCANA_RELEASE_REVIEW_NOW: 'true',
            ARCANA_RELEASE_REALITY_AUDIT_NOW: 'true',
            ARCANA_RELEASE_FAIL_ON_GATE: 'false',
            ARCANA_RELEASE_CYCLE_OUT_FILE: bootstrapReportPath,
          },
        });
        steps.push(bootstrapStep);
        if (bootstrapStep.ok) {
          try {
            const raw = JSON.parse(await fs.readFile(bootstrapReportPath, 'utf8'));
            bootstrapCycleId = normalizeText(raw?.cycle?.id || '');
          } catch {
            bootstrapCycleId = '';
          }
        }
      }
    } else {
      steps.push({
        id: 'bootstrap_release_cycle',
        command: 'npm run release:cycle:auto',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        code: null,
        signal: null,
        timedOut: false,
        ok: true,
        skipped: true,
        reason: 'bootstrap disabled',
        stdout: '',
        stderr: '',
      });
    }

    const gateEnv = {
      ...sharedEnv,
      ...(bootstrapCycleId ? { ARCANA_STABILITY_WINDOW_CYCLE_ID: bootstrapCycleId } : {}),
      ARCANA_RELEASE_READINESS_OUT_FILE: path.join(
        repoRoot,
        'data',
        'reports',
        'release-readiness-latest.json'
      ),
      ARCANA_STABILITY_WINDOW_OUT_FILE: path.join(
        repoRoot,
        'data',
        'reports',
        'stability-window-latest.json'
      ),
    };
    steps.push(
      await runCommand({
        id: 'check_syntax',
        cmd: 'npm',
        args: ['run', 'check:syntax'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'test_unit',
        cmd: 'npm',
        args: ['test'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'lint_no_bypass',
        cmd: 'npm',
        args: ['run', 'lint:no-bypass'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'ops_suite_strict',
        cmd: 'npm',
        args: ['run', 'ops:suite:strict'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'check_pentest_evidence',
        cmd: 'npm',
        args: ['run', 'check:pentest:evidence:strict'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'report_release_readiness',
        cmd: 'npm',
        args: ['run', 'report:release-readiness', '--', '--require-pentest-evidence', '--strict'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'report_stability_window',
        cmd: 'npm',
        args: ['run', 'report:stability-window:strict'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'release_go_live_gate',
        cmd: 'npm',
        args: ['run', 'release:go-live:gate'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
    steps.push(
      await runCommand({
        id: 'release_final_live_signoff',
        cmd: 'npm',
        args: ['run', 'release:cycle:final-lock'],
        cwd: repoRoot,
        env: gateEnv,
      })
    );
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await wait(250);
      serverProcess.kill('SIGKILL');
    }
  }

  const summary = summarizeFailures(steps);
  const output = {
    generatedAt: new Date().toISOString(),
    input: {
      baseUrl: base.baseUrl,
      withLocalServer: args.withLocalServer,
      bootstrapReleaseCycle: args.bootstrapReleaseCycle,
      bootstrapMode: args.bootstrapMode,
      bootstrapCycleId: bootstrapCycleId || null,
      strict: args.strict,
    },
    server: {
      attempted: args.withLocalServer,
      started: serverStarted,
      baseUrl: base.baseUrl,
    },
    steps,
    summary: {
      allPassed: summary.failed.length === 0,
      failedSteps: summary.failed,
      blockers: summary.blockers,
    },
  };

  const outPath = path.resolve(args.outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write('== Finalization Sweep ==\n');
    process.stdout.write(`out: ${outPath}\n`);
    process.stdout.write(
      `base: ${base.baseUrl} | localServer=${args.withLocalServer ? 'yes' : 'no'} | allPassed=${output.summary.allPassed ? 'yes' : 'no'}\n`
    );
    process.stdout.write(`failedSteps: ${output.summary.failedSteps.join(',') || '-'}\n`);
    if (!output.summary.allPassed) {
      process.stdout.write(
        `blockers: pentest=${output.summary.blockers.pentest ? 'yes' : 'no'} stabilityWindow=${output.summary.blockers.stabilityWindow ? 'yes' : 'no'} formalSignoff=${output.summary.blockers.formalSignoff ? 'yes' : 'no'}\n`
      );
    }
  }

  if (args.strict && output.summary.allPassed !== true) {
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error('❌ Could not run finalization sweep');
  console.error(error?.message || error);
  process.exitCode = 1;
});
