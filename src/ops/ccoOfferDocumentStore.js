'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function writeAtomic(filePath, contents) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  if (typeof contents === 'string') {
    await fs.writeFile(tmpPath, contents, 'utf8');
  } else {
    await fs.writeFile(tmpPath, contents);
  }
  await fs.rename(tmpPath, filePath);
}

async function createCcoOfferDocumentStore({ baseDir }) {
  const root = normalizeText(baseDir);
  if (!root) throw new Error('offerDocumentsDir saknas.');
  await fs.mkdir(root, { recursive: true });

  function documentPath(tenantId, documentId, ext = 'html') {
    return path.join(root, normalizeText(tenantId), `${normalizeText(documentId)}.${ext}`);
  }

  async function saveHtml({ tenantId, documentId, html }) {
    const id = normalizeText(documentId) || crypto.randomUUID();
    const target = documentPath(tenantId, id, 'html');
    await writeAtomic(target, String(html || ''));
    return { documentId: id, filePath: target };
  }

  async function readHtml({ tenantId, documentId }) {
    const target = documentPath(tenantId, documentId, 'html');
    try {
      const html = await fs.readFile(target, 'utf8');
      return { documentId, html, filePath: target };
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function savePdf({ tenantId, documentId, buffer }) {
    const id = normalizeText(documentId) || crypto.randomUUID();
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw new Error('Ogiltig PDF-data.');
    }
    const target = documentPath(tenantId, id, 'pdf');
    await writeAtomic(target, buffer);
    return { documentId: id, filePath: target };
  }

  async function readPdf({ tenantId, documentId }) {
    const target = documentPath(tenantId, documentId, 'pdf');
    try {
      const buffer = await fs.readFile(target);
      return { documentId, buffer, filePath: target };
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function saveWordHtml({ tenantId, documentId, html }) {
    const id = normalizeText(documentId) || crypto.randomUUID();
    const target = documentPath(tenantId, id, 'doc');
    await writeAtomic(target, String(html || ''));
    return { documentId: id, filePath: target };
  }

  async function readWordHtml({ tenantId, documentId }) {
    const target = documentPath(tenantId, documentId, 'doc');
    try {
      const html = await fs.readFile(target, 'utf8');
      return { documentId, html, filePath: target };
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  return { saveHtml, readHtml, savePdf, readPdf, saveWordHtml, readWordHtml };
}

module.exports = {
  createCcoOfferDocumentStore,
};
