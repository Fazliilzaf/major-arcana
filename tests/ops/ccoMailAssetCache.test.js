const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailAssetCache } = require('../../src/ops/ccoMailAssetCache');

test('mail asset cache sparar och läser bilagebytes utanför truth- och ingestion-filer', async () => {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mail-assets-'));
  const cache = createCcoMailAssetCache({ dirPath, maxAssetBytes: 1024, maxTotalBytes: 2048 });
  const context = { mailboxId: 'kons@hairtpclinic.com', messageId: 'msg-1', attachmentId: 'att-1' };

  const stored = await cache.put(context, {
    name: 'logo.png',
    contentType: 'image/png',
    isInline: true,
    buffer: Buffer.from('LOCAL-IMAGE'),
  });
  assert.equal(stored.cached, true);
  const loaded = await cache.get(context);
  assert.equal(String(loaded.buffer), 'LOCAL-IMAGE');
  assert.equal(loaded.metadata.contentType, 'image/png');

  const files = await fs.readdir(dirPath);
  assert.equal(files.some((file) => file.includes('cco-mail-ingestion')), false);
  assert.equal(files.filter((file) => file.endsWith('.bin')).length, 1);
  await fs.rm(dirPath, { recursive: true, force: true });
});

test('mail asset cache avvisar bilagor över den hårda storleksgränsen', async () => {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mail-assets-limit-'));
  const cache = createCcoMailAssetCache({ dirPath, maxAssetBytes: 4, maxTotalBytes: 20 });
  const result = await cache.put(
    { mailboxId: 'kons@hairtpclinic.com', messageId: 'msg-2', attachmentId: 'att-2' },
    { buffer: Buffer.from('TOO-LARGE') }
  );
  assert.equal(result.cached, false);
  assert.equal(result.reason, 'asset_limit');
  await fs.rm(dirPath, { recursive: true, force: true });
});
