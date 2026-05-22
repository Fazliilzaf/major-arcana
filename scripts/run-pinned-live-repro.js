#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = '/Users/fazlikrasniqi/Desktop/Arcana';
const DEFAULT_PORT = Number.parseInt(process.env.PORT || '4074', 10);
const NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=4096';
const BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const AUDIT_SCRIPT = path.join(ROOT, '.tmp/diagnostics/live-html-signature-audit.js');
const ENV_PATH = path.join(ROOT, '.env');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.join(ROOT, '.tmp/diagnostics', `pinned-live-repro-${timestamp}`);
const AUDIT_OUT_DIR = path.join(OUT_DIR, 'audit');
const SERVER_LOG_PATH = path.join(OUT_DIR, 'server.log');
const AUDIT_STDOUT_PATH = path.join(OUT_DIR, 'audit-stdout.log');
const AUDIT_STDERR_PATH = path.join(OUT_DIR, 'audit-stderr.log');
const MANIFEST_PATH = path.join(OUT_DIR, 'repro-manifest.json');
const README_PATH = path.join(OUT_DIR, 'README.md');

const RUNTIME_CODE_FILES = [
  path.join(ROOT, 'public/major-arcana-preview/app.js'),
  path.join(ROOT, 'public/major-arcana-preview/runtime-dom-live-composition.js'),
  path.join(ROOT, 'public/major-arcana-preview/runtime-focus-intel-renderers.js'),
  path.join(ROOT, 'public/major-arcana-preview/runtime-thread-ops.js'),
  path.join(ROOT, 'src/routes/capabilities.js'),
  path.join(ROOT, 'src/ops/ccoMailboxTruthReadAdapter.js'),
  path.join(ROOT, 'src/infra/microsoftGraphReadConnector.js'),
  path.join(ROOT, 'src/ops/ccoHistoryStore.js'),
  path.join(ROOT, 'server.js'),
  AUDIT_SCRIPT,
  path.join(ROOT, 'scripts/run-pinned-live-repro.js'),
];

const STATE_FILES = [
  path.join(ROOT, 'data/cco-mailbox-truth.json'),
  path.join(ROOT, 'data/cco-history.json'),
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    ...options,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`
    );
  }
  return String(result.stdout || '');
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function describeFile(filePath) {
  const stats = await fsp.stat(filePath);
  return {
    path: filePath,
    size: stats.size,
    mtime: stats.mtime.toISOString(),
    sha256: await sha256(filePath),
  };
}

function listEnvKeysFromDotenv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean);
}

function waitForHttp(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}; last status=${res.statusCode}`));
          return;
        }
        setTimeout(attempt, 1000);
      });
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

function flattenThreadMap(summary = {}) {
  return (summary.mailboxes || []).flatMap((mailbox) =>
    (mailbox.sampled || []).map((sample) => ({
      mailboxId: mailbox.mailboxId,
      threadId: sample.threadId,
      primary: sample.card?.primary || '',
      preview: sample.card?.preview || '',
      context: sample.card?.context || '',
      threadType: sample.threadType || '',
      screenshotPath: sample.screenshotPath || '',
      coverageSummaryVerdict: mailbox.coverageSummary?.verdict || '',
      bodyFidelityVerdict: sample.bodyFidelityVerdict || '',
      inboundHtmlIdentityVisible: Boolean(sample.inboundHtmlIdentityVisible),
      outboundHtmlIdentityVisible: Boolean(sample.outboundHtmlIdentityVisible),
    }))
  );
}

async function writeReadme(manifest) {
  const lines = [
    '# Pinned Live Repro',
    '',
    `- URL: ${manifest.runtime.url}`,
    `- Port: ${manifest.runtime.port}`,
    `- Server command: \`${manifest.runtime.serverCommand}\``,
    `- Branch: \`${manifest.git.branch}\``,
    `- Commit: \`${manifest.git.commit}\``,
    `- Dirty worktree: \`${manifest.git.dirty}\``,
    `- Manifest: ${MANIFEST_PATH}`,
    `- Audit summary: ${manifest.audit.summaryPath}`,
    '',
    '## Single-command repro',
    '',
    '```bash',
    `cd ${ROOT} && node ${path.join(ROOT, 'scripts/run-pinned-live-repro.js')}`,
    '```',
    '',
    '## State files',
    '',
    ...manifest.stateFiles.map(
      (file) => `- ${file.path} (${file.sha256})`
    ),
    '',
    '## Sampled threads',
    '',
    ...manifest.threadMap.map(
      (thread) =>
        `- ${thread.mailboxId} | ${thread.primary || '(untitled)'} | ${thread.threadId} | ${thread.screenshotPath}`
    ),
    '',
  ];
  await fsp.writeFile(README_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const gitBranch = run('git', ['branch', '--show-current']).trim();
  const gitCommit = run('git', ['rev-parse', 'HEAD']).trim();
  const gitStatusShort = run('git', ['status', '--short']);
  const gitDiffNames = run('git', ['diff', '--name-only', 'HEAD']);

  const envKeys = fs.existsSync(ENV_PATH) ? listEnvKeysFromDotenv(ENV_PATH) : [];
  const envDescriptor = fs.existsSync(ENV_PATH) ? await describeFile(ENV_PATH) : null;

  const serverLogFd = fs.openSync(SERVER_LOG_PATH, 'a');
  const server = spawn('node', ['server.js'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', serverLogFd, serverLogFd],
    env: {
      ...process.env,
      PORT: String(DEFAULT_PORT),
      NODE_OPTIONS,
    },
  });
  server.unref();
  fs.closeSync(serverLogFd);

  await waitForHttp(`${BASE_URL}/major-arcana-preview/`);

  const auditResult = spawnSync('node', [AUDIT_SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    env: {
      ...process.env,
      BASE_URL,
      OUT_ROOT: AUDIT_OUT_DIR,
    },
  });
  await fsp.writeFile(AUDIT_STDOUT_PATH, String(auditResult.stdout || ''), 'utf8');
  await fsp.writeFile(AUDIT_STDERR_PATH, String(auditResult.stderr || ''), 'utf8');
  if (auditResult.status !== 0) {
    throw new Error(`Audit script failed. See ${AUDIT_STDERR_PATH}`);
  }

  const summaryPath = path.join(AUDIT_OUT_DIR, 'summary.json');
  const summary = JSON.parse(await fsp.readFile(summaryPath, 'utf8'));

  const manifest = {
    capturedAt: new Date().toISOString(),
    workspaceRoot: ROOT,
    runtime: {
      url: `${BASE_URL}/major-arcana-preview/`,
      baseUrl: BASE_URL,
      port: DEFAULT_PORT,
      serverCommand: `cd ${ROOT} && PORT=${DEFAULT_PORT} NODE_OPTIONS=${NODE_OPTIONS} node server.js`,
      serverPid: server.pid,
      serverLogPath: SERVER_LOG_PATH,
    },
    git: {
      branch: gitBranch,
      commit: gitCommit,
      dirty: gitStatusShort.trim().length > 0,
      statusShortPath: path.join(OUT_DIR, 'git-status-short.txt'),
      diffNamesPath: path.join(OUT_DIR, 'git-diff-names.txt'),
    },
    environment: {
      dotenvPath: ENV_PATH,
      dotenvSha256: envDescriptor?.sha256 || null,
      dotenvSize: envDescriptor?.size || null,
      explicitOverrides: {
        PORT: String(DEFAULT_PORT),
        NODE_OPTIONS,
        BASE_URL,
        OUT_ROOT: AUDIT_OUT_DIR,
      },
      relevantKeysUsed: [
        'ARCANA_OWNER_EMAIL',
        'ARCANA_OWNER_PASSWORD',
        'OWNER_LOGIN_PASSWORD',
        'ARCANA_DEFAULT_TENANT',
      ],
      dotenvKeysAvailable: envKeys,
    },
    stateFiles: await Promise.all(STATE_FILES.map((filePath) => describeFile(filePath))),
    codeFiles: await Promise.all(RUNTIME_CODE_FILES.map((filePath) => describeFile(filePath))),
    audit: {
      scriptPath: AUDIT_SCRIPT,
      outDir: AUDIT_OUT_DIR,
      summaryPath,
      overallVerdict: summary.overallVerdict,
      mailboxMenuScreenshot: summary.mailboxMenu?.screenshotPath || null,
    },
    threadMap: flattenThreadMap(summary),
  };

  await fsp.writeFile(manifest.git.statusShortPath, gitStatusShort, 'utf8');
  await fsp.writeFile(manifest.git.diffNamesPath, gitDiffNames, 'utf8');
  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  await writeReadme(manifest);

  console.log(
    JSON.stringify(
      {
        manifestPath: MANIFEST_PATH,
        readmePath: README_PATH,
        auditOutDir: AUDIT_OUT_DIR,
        runtimeUrl: manifest.runtime.url,
        serverPid: manifest.runtime.serverPid,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
