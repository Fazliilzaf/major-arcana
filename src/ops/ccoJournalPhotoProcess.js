'use strict';

const path = require('node:path');
const { repairMojibakeFilename } = require('./filenameEncoding');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extensionForName(name = '') {
  const ext = path.extname(normalizeText(name)).toLowerCase().replace(/^\./, '');
  return ext || '';
}

function detectUploadMime(mimeType = '', originalName = '') {
  const mime = normalizeText(mimeType).toLowerCase();
  const ext = extensionForName(originalName);
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime) return mime;
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return '';
}

function isHeicLike(mimeType = '', originalName = '') {
  const mime = detectUploadMime(mimeType, originalName);
  const ext = extensionForName(originalName);
  return mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif';
}

function isAllowedJournalPhotoMime(mimeType = '', originalName = '') {
  const mime = detectUploadMime(mimeType, originalName);
  if (!mime) return false;
  return (
    mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/heic' || mime === 'image/heif'
  );
}

function buildStoredFileName(originalName = '', mimeType = 'image/jpeg') {
  const base = repairMojibakeFilename(originalName).replace(/\.[^.]+$/, '') || 'konsultationsbild';
  const safeBase = base.replace(/[^\w\-åäöÅÄÖ ]+/g, '').trim() || 'konsultationsbild';
  if (mimeType === 'image/png') {
    return `${safeBase}.png`;
  }
  return `${safeBase}.jpg`;
}

async function normalizeJournalPhotoUpload({ buffer, mimeType = '', originalName = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw Object.assign(new Error('Ogiltig bildfil.'), { statusCode: 400 });
  }
  if (!isAllowedJournalPhotoMime(mimeType, originalName)) {
    throw Object.assign(new Error('Endast JPEG, PNG och HEIC stöds.'), { statusCode: 415 });
  }

  let working = buffer;
  let outputMime = detectUploadMime(mimeType, originalName);

  if (isHeicLike(outputMime, originalName)) {
    outputMime = 'image/jpeg';
  }

  try {
    const sharp = require('sharp');
    const pipeline = sharp(working, { failOn: 'none' }).rotate();
    if (outputMime === 'image/png') {
      working = await pipeline.png({ compressionLevel: 8 }).toBuffer();
      outputMime = 'image/png';
    } else {
      working = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      outputMime = 'image/jpeg';
    }
  } catch (error) {
    if (isHeicLike(mimeType, originalName)) {
      throw Object.assign(new Error('HEIC-bilden kunde inte konverteras.'), {
        statusCode: 415,
        cause: error,
      });
    }
    if (outputMime === 'image/jpeg') {
      working = stripExifFromJpegFallback(working);
    }
  }

  return {
    buffer: working,
    mimeType: outputMime,
    fileName: buildStoredFileName(originalName, outputMime),
  };
}

function stripExifFromJpegFallback(buffer) {
  try {
    const piexif = require('piexifjs');
    const binary = buffer.toString('binary');
    return Buffer.from(piexif.remove(binary), 'binary');
  } catch {
    return buffer;
  }
}

module.exports = {
  buildStoredFileName,
  detectUploadMime,
  isAllowedJournalPhotoMime,
  isHeicLike,
  normalizeJournalPhotoUpload,
};
