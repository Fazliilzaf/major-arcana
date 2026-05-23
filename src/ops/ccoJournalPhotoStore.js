'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extensionForMime(mimeType) {
  const mime = normalizeText(mimeType).toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  return 'jpg';
}

function patientDir(baseDir, tenantId, patientId) {
  return path.join(baseDir, normalizeText(tenantId), normalizeText(patientId));
}

function photoPath(baseDir, tenantId, patientId, photoId, ext = 'jpg') {
  return path.join(patientDir(baseDir, tenantId, patientId), `${normalizeText(photoId)}.${ext}`);
}

function annotationPath(baseDir, tenantId, patientId, photoId) {
  return path.join(
    patientDir(baseDir, tenantId, patientId),
    `${normalizeText(photoId)}.annotations.json`
  );
}

function annotatedPreviewPath(baseDir, tenantId, patientId, photoId) {
  return path.join(
    patientDir(baseDir, tenantId, patientId),
    `${normalizeText(photoId)}.annotated.png`
  );
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function createCcoJournalPhotoStore({ baseDir }) {
  const root = normalizeText(baseDir);
  if (!root) {
    throw new Error('journalPhotosDir saknas.');
  }
  await fs.mkdir(root, { recursive: true });

  async function savePhoto({ tenantId, patientId, buffer, mimeType, originalName = '' }) {
    if (!tenantId || !patientId) {
      throw new Error('tenantId och patientId krävs.');
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw new Error('Ogiltig bildfil.');
    }
    const photoId = crypto.randomUUID();
    const ext = extensionForMime(mimeType);
    const target = photoPath(root, tenantId, patientId, photoId, ext);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return {
      photoId,
      ext,
      mimeType: normalizeText(mimeType) || 'image/jpeg',
      fileName: normalizeText(originalName) || `${photoId}.${ext}`,
      byteSize: buffer.length,
      storedAt: new Date().toISOString(),
    };
  }

  async function resolvePhotoFile({ tenantId, patientId, photoId }) {
    const id = normalizeText(photoId);
    if (!id) return null;
    const dir = patientDir(root, tenantId, patientId);
    for (const ext of ['jpg', 'jpeg', 'png']) {
      const candidate = path.join(dir, `${id}.${ext}`);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  async function readPhoto({ tenantId, patientId, photoId }) {
    const filePath = await resolvePhotoFile({ tenantId, patientId, photoId });
    if (!filePath) return null;
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    return { buffer, mimeType, filePath };
  }

  async function saveAnnotations({
    tenantId,
    patientId,
    photoId,
    annotations = {},
    planSummary = {},
  }) {
    const payload = {
      version: 1,
      photoId: normalizeText(photoId),
      annotations: asObject(annotations),
      planSummary: asObject(planSummary),
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(annotationPath(root, tenantId, patientId, photoId), payload);
    return payload;
  }

  async function readAnnotations({ tenantId, patientId, photoId }) {
    return readJson(annotationPath(root, tenantId, patientId, photoId), null);
  }

  async function saveAnnotatedPreview({ tenantId, patientId, photoId, buffer }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw new Error('Ogiltig förhandsvisning.');
    }
    const target = annotatedPreviewPath(root, tenantId, patientId, photoId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return target;
  }

  async function readAnnotatedPreview({ tenantId, patientId, photoId }) {
    const filePath = annotatedPreviewPath(root, tenantId, patientId, photoId);
    try {
      const buffer = await fs.readFile(filePath);
      return { buffer, mimeType: 'image/png', filePath };
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function deletePhoto({ tenantId, patientId, photoId }) {
    const id = normalizeText(photoId);
    if (!tenantId || !patientId || !id) {
      throw new Error('tenantId, patientId och photoId krävs.');
    }
    const dir = patientDir(root, tenantId, patientId);
    const candidates = [
      `${id}.jpg`,
      `${id}.jpeg`,
      `${id}.png`,
      `${id}.annotations.json`,
      `${id}.annotated.png`,
    ];
    let removed = 0;
    for (const name of candidates) {
      try {
        await fs.unlink(path.join(dir, name));
        removed += 1;
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
      }
    }
    return { removed };
  }

  return {
    savePhoto,
    readPhoto,
    saveAnnotations,
    readAnnotations,
    saveAnnotatedPreview,
    readAnnotatedPreview,
    resolvePhotoFile,
    deletePhoto,
  };
}

module.exports = {
  createCcoJournalPhotoStore,
};
