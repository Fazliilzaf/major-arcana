'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');

const DEFAULT_SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

function resolveRenderSshConfig() {
  const serviceId = process.env.RENDER_SERVICE_ID || DEFAULT_SERVICE_ID;
  const sshHost = process.env.RENDER_SSH_HOST || `${serviceId}@ssh.frankfurt.render.com`;
  const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
  const remoteData = process.env.RENDER_REMOTE_DATA || '/var/data';
  return {
    serviceId,
    sshHost,
    sshKey,
    remoteData,
    remoteStorage: `${remoteData}/cco-secure-storage`,
    remoteAssets: `${remoteData}/cco-patient-assets.json`,
    sshShellOpts: [
      'ssh',
      `-i ${sshKey}`,
      '-o BatchMode=yes',
      '-o ConnectTimeout=120',
      '-o ServerAliveInterval=15',
      '-o ServerAliveCountMax=20',
      '-o TCPKeepAlive=yes',
    ].join(' '),
  };
}

function sshArgs(cfg, extra = []) {
  return [
    '-i',
    cfg.sshKey,
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=120',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=20',
    '-o',
    'TCPKeepAlive=yes',
    cfg.sshHost,
    ...extra,
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry(label, fn, { attempts = 4, delayMs = 5000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      console.error(
        `[render-ssh] ${label} attempt ${attempt}/${attempts} failed: ${error.message}`
      );
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

function execChecked(label, file, args, { stdio = 'inherit' } = {}) {
  try {
    return execFileSync(file, args, { stdio, encoding: stdio === 'pipe' ? 'utf8' : undefined });
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`${label} failed: ${detail || error.message}`);
  }
}

async function uploadAssetsJson(cfg, localAssetsPath) {
  await runWithRetry('scp assets json', () => {
    execChecked('scp assets', 'scp', [
      '-i',
      cfg.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=20',
      localAssetsPath,
      `${cfg.sshHost}:${cfg.remoteAssets}`,
    ]);
  });
}

async function tarBatch(cfg, { storageRoot, batchPath, batchIndex, batchCount }) {
  await runWithRetry(
    `tar batch ${batchIndex}/${batchCount}`,
    async () => {
      await new Promise((resolve, reject) => {
        const tar = spawn('tar', ['-C', storageRoot, '-cf', '-', '-T', batchPath], {
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        const ssh = spawn(
          'ssh',
          [
            '-i',
            cfg.sshKey,
            '-o',
            'BatchMode=yes',
            '-o',
            'ConnectTimeout=120',
            '-o',
            'ServerAliveInterval=15',
            '-o',
            'ServerAliveCountMax=20',
            '-o',
            'TCPKeepAlive=yes',
            cfg.sshHost,
            `mkdir -p ${cfg.remoteStorage} && tar xf - -C ${cfg.remoteStorage}`,
          ],
          { stdio: ['pipe', 'inherit', 'inherit'] }
        );

        let failed = null;
        const fail = (error) => {
          if (failed) return;
          failed = error;
          tar.kill('SIGTERM');
          ssh.kill('SIGTERM');
          reject(error);
        };

        tar.on('error', fail);
        ssh.on('error', fail);
        tar.stdout.on('error', fail);
        ssh.stdin.on('error', (error) => {
          if (error.code === 'EPIPE') return;
          fail(error);
        });

        tar.on('close', (code) => {
          if (failed) return;
          if (code !== 0) fail(new Error(`tar exited with code ${code}`));
        });
        ssh.on('close', (code) => {
          if (failed) return;
          if (code !== 0) fail(new Error(`ssh tar exited with code ${code}`));
          else resolve();
        });

        tar.stdout.pipe(ssh.stdin);
      });
    },
    { attempts: 6, delayMs: 8000 }
  );
}

async function rsyncBatch(
  cfg,
  { storageRoot, batchLines, batchIndex, batchCount, ignoreExisting = false }
) {
  const stagingDir = path.join(
    path.dirname(localManifestPlaceholder(storageRoot)),
    '.render-rsync-batches'
  );
  await fs.mkdir(stagingDir, { recursive: true });
  const batchPath = path.join(stagingDir, `batch-${String(batchIndex).padStart(4, '0')}.txt`);
  await fs.writeFile(batchPath, `${batchLines.join('\n')}\n`, 'utf8');

  const rsyncArgs = ['-avz', '--relative', '--files-from', batchPath, '-e', cfg.sshShellOpts];
  if (ignoreExisting) rsyncArgs.push('--ignore-existing');

  await runWithRetry(`rsync batch ${batchIndex}/${batchCount}`, () => {
    execChecked(`rsync batch ${batchIndex}`, 'rsync', [
      ...rsyncArgs,
      `${storageRoot.replace(/\/$/, '')}/`,
      `${cfg.sshHost}:${cfg.remoteStorage}/`,
    ]);
  });
}

function localManifestPlaceholder(storageRoot) {
  return path.join(storageRoot, '.render-sync-staging');
}

function chunkArray(items, size) {
  const rows = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

async function uploadManifestForRemoteFilter(cfg, manifestPath) {
  const remoteManifest = `${cfg.remoteData}/pipedrive-sync-manifest.txt`;
  await runWithRetry('scp manifest', () => {
    execChecked('scp manifest', 'scp', [
      '-i',
      cfg.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      manifestPath,
      `${cfg.sshHost}:${remoteManifest}`,
    ]);
  });
  return remoteManifest;
}

async function buildMissingManifestOnRemote(cfg, { manifestPath, outPath }) {
  const remoteManifest = await uploadManifestForRemoteFilter(cfg, manifestPath);
  const remoteMissing = `${cfg.remoteData}/pipedrive-sync-missing.txt`;
  const filterScript = `
const fs=require('fs');
const lines=fs.readFileSync('${remoteManifest}','utf8').split(/\\r?\\n/).map(l=>l.trim()).filter(Boolean);
const root='${cfg.remoteStorage}';
const missing=lines.filter(l=>!fs.existsSync(root+'/'+l));
fs.writeFileSync('${remoteMissing}', missing.join('\\n')+(missing.length?'\\n':''));
console.log(JSON.stringify({total:lines.length,missing:missing.length,present:lines.length-missing.length}));
`.trim();

  const statsJson = await runWithRetry('remote missing filter', () =>
    execFileSync('ssh', sshArgs(cfg, [`node -e ${JSON.stringify(filterScript)}`]), {
      encoding: 'utf8',
    })
  );
  console.error(`[render-ssh] ${statsJson.trim()}`);

  await runWithRetry('scp missing manifest', () => {
    execChecked('scp missing', 'scp', [
      '-i',
      cfg.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      `${cfg.sshHost}:${remoteMissing}`,
      outPath,
    ]);
  });
  return outPath;
}

async function scpBatch(cfg, { storageRoot, batchLines, batchIndex, batchCount }) {
  const dirs = [
    ...new Set(batchLines.map((rel) => path.dirname(rel)).filter((d) => d && d !== '.')),
  ];
  if (dirs.length > 0) {
    await runWithRetry(
      `ssh mkdir batch ${batchIndex}`,
      () => {
        execChecked(
          'ssh mkdir',
          'ssh',
          sshArgs(cfg, [`mkdir -p ${dirs.map((dir) => `${cfg.remoteStorage}/${dir}`).join(' ')}`])
        );
      },
      { attempts: 4, delayMs: 5000 }
    );
  }

  for (const relPath of batchLines) {
    const localPath = path.join(storageRoot, relPath);
    await runWithRetry(
      `scp ${relPath}`,
      () => {
        execChecked('scp file', 'scp', [
          '-i',
          cfg.sshKey,
          '-o',
          'BatchMode=yes',
          '-o',
          'ConnectTimeout=120',
          '-o',
          'ServerAliveInterval=15',
          '-o',
          'ServerAliveCountMax=20',
          localPath,
          `${cfg.sshHost}:${cfg.remoteStorage}/${relPath}`,
        ]);
      },
      { attempts: 5, delayMs: 4000 }
    );
  }
}

async function scpManifestBatched(
  cfg,
  { storageRoot, manifestPath, batchSize = 5, stagingDir, progressPath }
) {
  const workDir = stagingDir || path.dirname(manifestPath);
  await fs.mkdir(workDir, { recursive: true });
  const raw = await fs.readFile(manifestPath, 'utf8');
  let lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (progressPath) {
    let done = new Set();
    try {
      const progress = JSON.parse(await fs.readFile(progressPath, 'utf8'));
      done = new Set(Array.isArray(progress.completedKeys) ? progress.completedKeys : []);
    } catch {
      done = new Set();
    }
    const before = lines.length;
    lines = lines.filter((line) => !done.has(line));
    if (before !== lines.length) {
      console.error(`[render-ssh] hoppar över ${before - lines.length} redan uppladdade filer`);
    }
  }

  if (lines.length === 0) {
    console.error('[render-ssh] inga filer att ladda upp');
    return { fileCount: 0, batchCount: 0 };
  }

  const batches = chunkArray(lines, batchSize);
  console.error(
    `[render-ssh] scp-upload ${lines.length} filer i ${batches.length} batchar (size=${batchSize})`
  );

  const completedKeys = [];
  for (let i = 0; i < batches.length; i += 1) {
    console.error(`[render-ssh] batch ${i + 1}/${batches.length} (${batches[i].length} filer)…`);
    await scpBatch(cfg, {
      storageRoot,
      batchLines: batches[i],
      batchIndex: i + 1,
      batchCount: batches.length,
    });
    completedKeys.push(...batches[i]);
    if (progressPath) {
      let existing = [];
      try {
        const progress = JSON.parse(await fs.readFile(progressPath, 'utf8'));
        existing = Array.isArray(progress.completedKeys) ? progress.completedKeys : [];
      } catch {
        existing = [];
      }
      const merged = [...new Set([...existing, ...completedKeys])];
      await fs.writeFile(
        progressPath,
        `${JSON.stringify({ updatedAt: new Date().toISOString(), completedKeys: merged }, null, 2)}\n`,
        'utf8'
      );
    }
    await sleep(1500);
  }
  return { fileCount: lines.length, batchCount: batches.length };
}

async function tarManifestBatched(
  cfg,
  { storageRoot, manifestPath, batchSize = 15, missingOnly = false, stagingDir, progressPath }
) {
  const workDir = stagingDir || path.dirname(manifestPath);
  await fs.mkdir(workDir, { recursive: true });
  let uploadManifest = manifestPath;

  if (missingOnly) {
    uploadManifest = path.join(workDir, 'pipedrive-pdf-rsync-missing.txt');
    try {
      await buildMissingManifestOnRemote(cfg, { manifestPath, outPath: uploadManifest });
    } catch (error) {
      console.error(
        `[render-ssh] remote missing-filter misslyckades (${error.message}) — kör full manifest`
      );
      uploadManifest = manifestPath;
    }
  }

  const raw = await fs.readFile(uploadManifest, 'utf8');
  let lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (progressPath) {
    let done = new Set();
    try {
      const progress = JSON.parse(await fs.readFile(progressPath, 'utf8'));
      done = new Set(Array.isArray(progress.completedKeys) ? progress.completedKeys : []);
    } catch {
      done = new Set();
    }
    const before = lines.length;
    lines = lines.filter((line) => !done.has(line));
    if (before !== lines.length) {
      console.error(`[render-ssh] hoppar över ${before - lines.length} redan uppladdade filer`);
    }
  }

  if (lines.length === 0) {
    console.error('[render-ssh] inga filer att ladda upp');
    return { fileCount: 0, batchCount: 0 };
  }

  const batches = chunkArray(lines, batchSize);
  console.error(
    `[render-ssh] tar-upload ${lines.length} filer i ${batches.length} batchar (size=${batchSize})`
  );

  const batchDir = path.join(workDir, '.render-tar-batches');
  await fs.mkdir(batchDir, { recursive: true });
  const completedKeys = [];

  for (let i = 0; i < batches.length; i += 1) {
    const batchPath = path.join(batchDir, `batch-${String(i + 1).padStart(4, '0')}.txt`);
    await fs.writeFile(batchPath, `${batches[i].join('\n')}\n`, 'utf8');
    console.error(`[render-ssh] batch ${i + 1}/${batches.length} (${batches[i].length} filer)…`);
    await tarBatch(cfg, {
      storageRoot,
      batchPath,
      batchIndex: i + 1,
      batchCount: batches.length,
    });
    completedKeys.push(...batches[i]);
    if (progressPath) {
      let existing = [];
      try {
        const progress = JSON.parse(await fs.readFile(progressPath, 'utf8'));
        existing = Array.isArray(progress.completedKeys) ? progress.completedKeys : [];
      } catch {
        existing = [];
      }
      const merged = [...new Set([...existing, ...completedKeys])];
      await fs.writeFile(
        progressPath,
        `${JSON.stringify({ updatedAt: new Date().toISOString(), completedKeys: merged }, null, 2)}\n`,
        'utf8'
      );
    }
    await sleep(2000);
  }
  return { fileCount: lines.length, batchCount: batches.length };
}

async function rsyncManifestBatched(
  cfg,
  { storageRoot, manifestPath, batchSize = 60, ignoreExisting = false }
) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const batches = chunkArray(lines, batchSize);
  console.error(
    `[render-ssh] rsync ${lines.length} filer i ${batches.length} batchar (size=${batchSize}${ignoreExisting ? ', ignore-existing' : ''})`
  );

  for (let i = 0; i < batches.length; i += 1) {
    console.error(`[render-ssh] batch ${i + 1}/${batches.length} (${batches[i].length} filer)…`);
    await rsyncBatch(cfg, {
      storageRoot,
      batchLines: batches[i],
      batchIndex: i + 1,
      batchCount: batches.length,
      ignoreExisting,
    });
  }
  return { fileCount: lines.length, batchCount: batches.length };
}

async function uploadPipedrivePatch(cfg, patchPath, { mergeScriptPath } = {}) {
  const remotePatch = `${cfg.remoteData}/pipedrive-assets-patch.json`;
  const remoteMerge = `${cfg.remoteData}/merge-pipedrive-assets-patch.js`;
  const localMerge =
    mergeScriptPath || path.join(__dirname, '..', 'merge-pipedrive-assets-patch.js');

  await runWithRetry('scp pipedrive patch', () => {
    execChecked('scp patch', 'scp', [
      '-i',
      cfg.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=20',
      patchPath,
      `${cfg.sshHost}:${remotePatch}`,
    ]);
  });

  await runWithRetry('scp merge script', () => {
    execChecked('scp merge', 'scp', [
      '-i',
      cfg.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=20',
      localMerge,
      `${cfg.sshHost}:${remoteMerge}`,
    ]);
  });

  const output = await runWithRetry('remote merge patch', () =>
    execFileSync('ssh', sshArgs(cfg, [`node ${remoteMerge} ${cfg.remoteAssets} ${remotePatch}`]), {
      encoding: 'utf8',
    })
  );
  console.error(output.trim());
}

module.exports = {
  resolveRenderSshConfig,
  sshArgs,
  runWithRetry,
  uploadAssetsJson,
  uploadPipedrivePatch,
  scpManifestBatched,
  tarManifestBatched,
  rsyncManifestBatched,
  chunkArray,
};
