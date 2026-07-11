const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createCacheKey({ mailboxId = '', messageId = '', attachmentId = '' } = {}) {
  // Mailboxar är case-insensitiva, men Graph-id:n är opaka och måste behålla
  // sin exakta casing för att två olika bilagor aldrig ska dela cachefil.
  const identity = [normalizeText(mailboxId).toLowerCase(), normalizeText(messageId), normalizeText(attachmentId)].join(
    '\n'
  );
  if (!identity.replace(/\n/g, '')) return '';
  return crypto.createHash('sha256').update(identity).digest('hex');
}

function createCcoMailAssetCache({
  dirPath = '',
  enabled = true,
  maxAssetBytes = 25 * 1024 * 1024,
  maxTotalBytes = 10 * 1024 * 1024 * 1024,
} = {}) {
  const root = normalizeText(dirPath);
  const safeMaxAssetBytes = toPositiveInt(maxAssetBytes, 25 * 1024 * 1024);
  const safeMaxTotalBytes = toPositiveInt(maxTotalBytes, 10 * 1024 * 1024 * 1024);
  let usageBytes = null;

  function pathsFor(context = {}) {
    const key = createCacheKey(context);
    if (!root || !key) return null;
    return {
      key,
      contentPath: path.join(root, `${key}.bin`),
      metadataPath: path.join(root, `${key}.json`),
    };
  }

  async function ensureUsage() {
    if (usageBytes !== null) return usageBytes;
    if (!root) return 0;
    await fs.mkdir(root, { recursive: true });
    const entries = await fs.readdir(root, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.bin')) continue;
      const stat = await fs.stat(path.join(root, entry.name)).catch(() => null);
      total += Number(stat?.size || 0);
    }
    usageBytes = total;
    return total;
  }

  async function get(context = {}) {
    const paths = pathsFor(context);
    if (!enabled || !paths) return null;
    try {
      const [buffer, rawMetadata] = await Promise.all([
        fs.readFile(paths.contentPath),
        fs.readFile(paths.metadataPath, 'utf8'),
      ]);
      const metadata = JSON.parse(rawMetadata);
      if (!buffer.length) return null;
      return { buffer, metadata, key: paths.key };
    } catch (_error) {
      return null;
    }
  }

  async function put(context = {}, asset = {}) {
    const paths = pathsFor(context);
    const buffer = Buffer.isBuffer(asset?.buffer) ? asset.buffer : Buffer.from(asset?.buffer || []);
    if (!enabled || !paths) return { cached: false, reason: 'disabled_or_invalid_context' };
    if (!buffer.length) return { cached: false, reason: 'empty' };
    if (buffer.length > safeMaxAssetBytes) {
      return { cached: false, reason: 'asset_limit', size: buffer.length };
    }
    const existing = await get(context);
    if (existing) return { cached: true, reused: true, size: existing.buffer.length, key: paths.key };

    const currentUsage = await ensureUsage();
    if (currentUsage + buffer.length > safeMaxTotalBytes) {
      return { cached: false, reason: 'total_limit', size: buffer.length, usageBytes: currentUsage };
    }
    await fs.mkdir(root, { recursive: true });
    const metadata = {
      mailboxId: normalizeText(context.mailboxId).toLowerCase() || null,
      messageId: normalizeText(context.messageId) || null,
      attachmentId: normalizeText(context.attachmentId) || null,
      name: normalizeText(asset.name) || null,
      contentType: normalizeText(asset.contentType) || 'application/octet-stream',
      isInline: asset.isInline === true,
      size: buffer.length,
      cachedAt: new Date().toISOString(),
    };
    const suffix = `${process.pid}.${Date.now()}`;
    await fs.writeFile(`${paths.contentPath}.${suffix}.tmp`, buffer);
    await fs.writeFile(`${paths.metadataPath}.${suffix}.tmp`, JSON.stringify(metadata));
    await fs.rename(`${paths.contentPath}.${suffix}.tmp`, paths.contentPath);
    await fs.rename(`${paths.metadataPath}.${suffix}.tmp`, paths.metadataPath);
    usageBytes = currentUsage + buffer.length;
    return { cached: true, reused: false, size: buffer.length, key: paths.key };
  }

  return {
    get,
    put,
    createCacheKey,
    getStatus: async () => ({
      enabled: Boolean(enabled && root),
      dirPath: root || null,
      usageBytes: await ensureUsage(),
      maxAssetBytes: safeMaxAssetBytes,
      maxTotalBytes: safeMaxTotalBytes,
    }),
  };
}

module.exports = { createCcoMailAssetCache, createCacheKey };
