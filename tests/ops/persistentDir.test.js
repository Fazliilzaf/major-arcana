const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { ensureDirectoryWithRetry, isRetryableMountError } = require('../../src/ops/persistentDir');

test('isRetryableMountError matches Render mount race codes', () => {
  assert.equal(isRetryableMountError({ code: 'ENOENT' }), true);
  assert.equal(isRetryableMountError({ code: 'EACCES' }), true);
  assert.equal(isRetryableMountError({ code: 'EBUSY' }), true);
  assert.equal(isRetryableMountError({ code: 'EEXIST' }), false);
});

test('ensureDirectoryWithRetry creates directory when mount becomes ready', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-persistent-dir-'));
  const target = path.join(tempDir, 'nested', 'state');

  await ensureDirectoryWithRetry(target, { attempts: 1, delayMs: 1 });

  const stat = await fs.stat(target);
  assert.equal(stat.isDirectory(), true);
});

test('ensureDirectoryWithRetry retries ENOENT then succeeds', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-persistent-dir-'));
  const target = path.join(tempDir, 'var', 'data');
  let mkdirCalls = 0;
  const originalMkdir = fs.mkdir.bind(fs);

  fs.mkdir = async (dirPath, options) => {
    if (String(dirPath) === target) {
      mkdirCalls += 1;
      if (mkdirCalls === 1) {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      }
    }
    return originalMkdir(dirPath, options);
  };

  try {
    await ensureDirectoryWithRetry(target, { attempts: 3, delayMs: 1, logger: { warn() {} } });
    assert.equal(mkdirCalls >= 2, true);
    const stat = await fs.stat(target);
    assert.equal(stat.isDirectory(), true);
  } finally {
    fs.mkdir = originalMkdir;
  }
});
