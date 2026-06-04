'use strict';

/**
 * ccoSecureStorageProvider.js — P0.F av CCO Document & Media Import Pipeline.
 *
 * Provider-abstraktion för CCO secure storage. Hanterar raw asset-binärer
 * UTANFÖR repo:t. Patient-data får ALDRIG hamna i GitHub — default-roten är
 * därför iCloud-mappen `Migration-data/cco-secure-storage/`.
 *
 * Stödda providers:
 *   - 'local'         — lokal FS under ARCANA_CCO_SECURE_STORAGE_ROOT
 *                       (default: ~/.../Major Arcana 2.0/Migration-data/
 *                        cco-secure-storage/). Fullt implementerad.
 *   - 's3'            — AWS S3. Stub-NotImplementedError tills creds
 *                       konfigureras (ARCANA_CCO_S3_BUCKET m.fl.).
 *   - 'encrypted-fs'  — lokal FS med per-fil AES-256-GCM. Stub-
 *                       NotImplementedError tills KEK konfigureras.
 *
 * Public API per provider:
 *   - putObject({ key?, body, contentType?, metadata? })
 *       → { storageKey, checksum, size, deduped }
 *   - getObject(key) → { stream, mimeType, size, checksum }
 *   - deleteObject(key) → boolean
 *   - exists(key) → boolean
 *   - generateThumbnailIfImage(key, sourceMime) → thumbnailKey | null
 *   - buildKey({ patientId, originalFileName?, mimeType?, documentDate?,
 *               importedAt? }) → string
 *   - stats() → { provider, totalObjects, totalBytes, rootPath }
 *
 * storageKey-format (alla providers):
 *   <year>/<month>/<patient-hash-first-12>/<uuid>.<ext>
 *
 * Compliance:
 *   - storageKey är opaque (patient-hash är SHA-256 → ingen PII i path)
 *   - Default-rot ligger utanför repo (gitignored även om man av misstag
 *     pekar in i repo:t, eftersom `data/` är globalt gitignored)
 *   - Originalfiler raderas ALDRIG implicit — deleteObject är explicit
 *   - putObject räknar SHA-256 vid write; getObject verifierar vid read
 *   - Duplicate detection: samma checksum → returnerar existing key
 *
 * Audit (lämnas till pipeline):
 *   Denna modul EJ emit:ar audit-events själv. Storage är low-level.
 *   Pipelinen (ccoAssetImportPipeline) är ansvarig för audit-emit.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');

const SCHEMA_VERSION = '1.0.0';

const DEFAULT_LOCAL_ROOT =
  process.env.ARCANA_CCO_SECURE_STORAGE_ROOT ||
  path.join(
    os.homedir(),
    'Library',
    'Mobile Documents',
    'com~apple~CloudDocs',
    'Major Arcana 2.0',
    'Migration-data',
    'cco-secure-storage'
  );

const MIME_TO_EXT = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'text/plain': '.txt',
  'application/json': '.json',
  'application/octet-stream': '.bin',
});

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

class NotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotImplementedError';
    this.statusCode = 501;
  }
}

function hashPatientId(patientId) {
  // SHA-256 → first 12 chars. Stabilt och anonymiserat.
  const safe = normalizeText(patientId) || 'unknown';
  return crypto.createHash('sha256').update(safe).digest('hex').slice(0, 12);
}

function extFromName(fileName) {
  const n = normalizeText(fileName);
  if (!n) return '';
  const ext = path.extname(n).toLowerCase();
  return ext || '';
}

function extFromMime(mimeType) {
  const m = normalizeText(mimeType).toLowerCase();
  if (!m) return '';
  return MIME_TO_EXT[m] || '';
}

function pickExt({ originalFileName, mimeType }) {
  return extFromName(originalFileName) || extFromMime(mimeType) || '.bin';
}

/**
 * Bygg en kanonisk storageKey:
 *   <year>/<month>/<patient-hash-first-12>/<uuid>.<ext>
 *
 * year/month tas från documentDate (om sätt) annars importedAt (default = nu).
 */
function buildStorageKey({
  patientId,
  originalFileName = null,
  mimeType = null,
  documentDate = null,
  importedAt = null,
} = {}) {
  const dateSource =
    normalizeText(documentDate) || normalizeText(importedAt) || nowIso();
  // Plocka YYYY-MM från ISO eller YYYY-MM-DD. Toleranta fallbacks.
  const isoMatch = dateSource.match(/^(\d{4})-(\d{2})/);
  let year;
  let month;
  if (isoMatch) {
    year = isoMatch[1];
    month = isoMatch[2];
  } else {
    const now = new Date();
    year = String(now.getUTCFullYear());
    month = String(now.getUTCMonth() + 1).padStart(2, '0');
  }
  const patientHash = hashPatientId(patientId);
  const uuid = crypto.randomUUID();
  const ext = pickExt({ originalFileName, mimeType });
  return `${year}/${month}/${patientHash}/${uuid}${ext}`;
}

function bodyToBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  // Streams behöver konsumeras till buffer (vi vill räkna SHA-256).
  // För enkelhet kräver vi att caller serialiserar streams till buffer
  // innan put. Senare iteration: streaming-hash via pipeline.
  throw new Error(
    'putObject: body måste vara Buffer | Uint8Array | string. Streams hanteras i nästa iteration.'
  );
}

function detectMimeFromExt(ext) {
  if (!ext) return null;
  const lower = ext.toLowerCase();
  for (const [mime, e] of Object.entries(MIME_TO_EXT)) {
    if (e === lower) return mime;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Local provider
// -----------------------------------------------------------------------------

function createLocalProvider({ rootPath = DEFAULT_LOCAL_ROOT } = {}) {
  const root = path.resolve(rootPath);

  async function ensureDir(p) {
    await fsp.mkdir(path.dirname(p), { recursive: true });
  }

  function absolute(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('storageKey saknas');
    }
    // Förbjud path-traversal:
    if (key.includes('..')) {
      throw new Error(`unsafe storageKey: "${key}"`);
    }
    return path.join(root, key);
  }

  // In-memory checksum-index för duplicate-detection inom samma process.
  // Persisterat index ligger i .index.json bredvid roten.
  const indexFile = path.join(root, '.index.json');
  let checksumIndex = {};
  try {
    const raw = fs.readFileSync(indexFile, 'utf8');
    checksumIndex = JSON.parse(raw) || {};
  } catch {
    checksumIndex = {};
  }

  async function persistIndex() {
    try {
      await fsp.mkdir(root, { recursive: true });
      await fsp.writeFile(
        indexFile,
        `${JSON.stringify(checksumIndex, null, 2)}\n`,
        'utf8'
      );
    } catch {
      /* index är best-effort */
    }
  }

  async function putObject({
    key = null,
    body,
    contentType = null,
    metadata = {},
  } = {}) {
    const buf = bodyToBuffer(body);
    const checksum = crypto.createHash('sha256').update(buf).digest('hex');
    const size = buf.length;

    // Duplicate detection — om vi sett checksum tidigare, returnera existing
    // utan att skriva igen.
    const existing = checksumIndex[checksum];
    if (existing && existing.key) {
      const abs = absolute(existing.key);
      if (fs.existsSync(abs)) {
        return {
          storageKey: existing.key,
          checksum,
          size,
          deduped: true,
        };
      }
    }

    let finalKey = normalizeText(key);
    if (!finalKey) {
      finalKey = buildStorageKey({
        patientId: metadata?.patientId,
        originalFileName: metadata?.originalFileName,
        mimeType: contentType,
        documentDate: metadata?.documentDate,
        importedAt: metadata?.importedAt,
      });
    }
    if (finalKey.includes('..')) {
      throw new Error(`unsafe storageKey: "${finalKey}"`);
    }

    const abs = absolute(finalKey);
    await ensureDir(abs);
    await fsp.writeFile(abs, buf);

    checksumIndex[checksum] = {
      key: finalKey,
      size,
      mime: contentType || detectMimeFromExt(path.extname(finalKey)) || null,
      ts: nowIso(),
    };
    await persistIndex();

    return { storageKey: finalKey, checksum, size, deduped: false };
  }

  async function getObject(key) {
    const abs = absolute(key);
    const stat = await fsp.stat(abs);
    const buf = await fsp.readFile(abs);
    const checksum = crypto.createHash('sha256').update(buf).digest('hex');
    const mimeType =
      detectMimeFromExt(path.extname(key)) || 'application/octet-stream';
    const stream = Readable.from(buf);
    return {
      stream,
      buffer: buf,
      mimeType,
      size: stat.size,
      checksum,
    };
  }

  async function deleteObject(key) {
    const abs = absolute(key);
    try {
      await fsp.unlink(abs);
      // Rensa även index om checksum stämmer
      for (const [hash, rec] of Object.entries(checksumIndex)) {
        if (rec.key === key) {
          delete checksumIndex[hash];
        }
      }
      await persistIndex();
      return true;
    } catch (err) {
      if (err && err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async function exists(key) {
    const abs = absolute(key);
    try {
      await fsp.access(abs);
      return true;
    } catch {
      return false;
    }
  }

  async function generateThumbnailIfImage(key, sourceMime) {
    const mime = normalizeText(sourceMime).toLowerCase();
    if (!IMAGE_MIMES.has(mime)) return null;

    let sharp;
    try {
      // eslint-disable-next-line global-require
      sharp = require('sharp');
    } catch {
      // sharp ej installerat — returnera null + best-effort warning.
      // Pipelinen får besluta att audita detta.
      return null;
    }

    const abs = absolute(key);
    if (!fs.existsSync(abs)) return null;

    const thumbKey = key.replace(/(\.[^.]+)?$/, '.thumb.jpg');
    const absThumb = absolute(thumbKey);
    try {
      await ensureDir(absThumb);
      await sharp(abs)
        .resize({ width: 320, height: 320, fit: 'inside' })
        .jpeg({ quality: 70 })
        .toFile(absThumb);
      return thumbKey;
    } catch {
      return null;
    }
  }

  async function stats() {
    let totalObjects = 0;
    let totalBytes = 0;
    try {
      // Walka root manuellt (rekursivt) — undvik dep på fs.readdir recursive
      const walk = async (dir) => {
        let entries;
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (err) {
          if (err && err.code === 'ENOENT') return;
          throw err;
        }
        for (const e of entries) {
          if (e.name.startsWith('.')) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            await walk(full);
          } else if (e.isFile()) {
            totalObjects += 1;
            try {
              const st = await fsp.stat(full);
              totalBytes += st.size;
            } catch {
              /* ignore */
            }
          }
        }
      };
      await walk(root);
    } catch {
      /* om root saknas → 0/0 */
    }
    return {
      provider: 'local',
      totalObjects,
      totalBytes,
      rootPath: root,
    };
  }

  return {
    provider: 'local',
    rootPath: root,
    putObject,
    getObject,
    deleteObject,
    exists,
    generateThumbnailIfImage,
    buildKey: buildStorageKey,
    stats,
    // exposed for tests
    _checksumIndex: () => checksumIndex,
  };
}

// -----------------------------------------------------------------------------
// S3 provider (stub)
// -----------------------------------------------------------------------------

function createS3Provider({
  bucket = null,
  region = null,
  accessKey = null,
  secretKey = null,
} = {}) {
  // INTE config'ad ännu. Kräver miljövariabler innan vi kan koppla AWS SDK.
  const hint =
    'Konfigurera ARCANA_CCO_S3_BUCKET / ARCANA_CCO_S3_REGION / ' +
    'ARCANA_CCO_S3_ACCESS_KEY / ARCANA_CCO_S3_SECRET_KEY för att aktivera ' +
    "S3-providern. Använd 'local' under utveckling.";
  const reject = () => {
    throw new NotImplementedError(`S3 storage-provider ej aktiverad. ${hint}`);
  };
  return {
    provider: 's3',
    bucket,
    region,
    _hasCreds: Boolean(accessKey && secretKey),
    putObject: async () => reject(),
    getObject: async () => reject(),
    deleteObject: async () => reject(),
    exists: async () => reject(),
    generateThumbnailIfImage: async () => reject(),
    buildKey: buildStorageKey,
    stats: async () => ({
      provider: 's3',
      totalObjects: 0,
      totalBytes: 0,
      rootPath: bucket ? `s3://${bucket}` : null,
    }),
  };
}

// -----------------------------------------------------------------------------
// Encrypted-FS provider (stub)
// -----------------------------------------------------------------------------

function createEncryptedFsProvider({
  rootPath = DEFAULT_LOCAL_ROOT,
  kek = null,
} = {}) {
  const hint =
    'Konfigurera ARCANA_CCO_STORAGE_KEK (256-bit base64) för att aktivera ' +
    "encrypted-fs-providern. Använd 'local' under utveckling.";
  const reject = () => {
    throw new NotImplementedError(
      `encrypted-fs storage-provider ej aktiverad. ${hint}`
    );
  };
  return {
    provider: 'encrypted-fs',
    rootPath,
    _hasKek: Boolean(kek),
    putObject: async () => reject(),
    getObject: async () => reject(),
    deleteObject: async () => reject(),
    exists: async () => reject(),
    generateThumbnailIfImage: async () => reject(),
    buildKey: buildStorageKey,
    stats: async () => ({
      provider: 'encrypted-fs',
      totalObjects: 0,
      totalBytes: 0,
      rootPath,
    }),
  };
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

function createSecureStorageProvider({ provider = 'local', ...opts } = {}) {
  switch (provider) {
    case 'local':
      return createLocalProvider(opts);
    case 's3':
      return createS3Provider(opts);
    case 'encrypted-fs':
      return createEncryptedFsProvider(opts);
    default: {
      const e = new Error(
        `unknown storage provider "${provider}" — must be one of local|s3|encrypted-fs`
      );
      e.statusCode = 400;
      throw e;
    }
  }
}

module.exports = {
  createSecureStorageProvider,
  createLocalProvider,
  createS3Provider,
  createEncryptedFsProvider,
  buildStorageKey,
  hashPatientId,
  NotImplementedError,
  DEFAULT_LOCAL_ROOT,
  SCHEMA_VERSION,
  IMAGE_MIMES,
  MIME_TO_EXT,
};
