const fs = require('node:fs/promises');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableMountError(error) {
  const code = error?.code || '';
  return code === 'ENOENT' || code === 'EACCES' || code === 'EBUSY';
}

/**
 * Render persistent disks can mount shortly after the process starts.
 * Retry mkdir/access so booking stores and startup disk guard survive restarts.
 */
async function ensureDirectoryWithRetry(
  directoryPath,
  { attempts = 10, delayMs = 2000, logger = console } = {}
) {
  const target = typeof directoryPath === 'string' ? directoryPath.trim() : '';
  if (!target) return;

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.mkdir(target, { recursive: true });
      await fs.access(target);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableMountError(error) || attempt >= attempts) throw error;
      logger?.warn?.(
        `[persistent-dir] ${target} not ready (${error.code || 'error'}, attempt ${attempt}/${attempts})`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function waitForPersistentRoot(stateRoot, options = {}) {
  await ensureDirectoryWithRetry(stateRoot, options);
}

module.exports = {
  ensureDirectoryWithRetry,
  waitForPersistentRoot,
  isRetryableMountError,
};
