'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value) {
  const text = normalizeText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseExifDateTime(value, offsetValue = '') {
  const text = normalizeText(value);
  const match = text.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const offset = normalizeText(offsetValue);
  const suffix = /^[+-]\d{2}:?\d{2}$/.test(offset)
    ? offset.includes(':')
      ? offset
      : offset.slice(0, 3) + ':' + offset.slice(3)
    : '';
  return {
    date: `${year}-${month}-${day}`,
    dateTime: `${year}-${month}-${day}T${hour}:${minute}:${second}${suffix}`,
    source: 'exif',
    confidence: 'high',
  };
}

function parseCaptureDateFromName(value) {
  const text = normalizeText(value);
  if (!text) return null;

  let match = text.match(
    /\b(20\d{2})[-_. ](\d{2})[-_. ](\d{2})[-_ T](\d{2})[-_.:](\d{2})(?:[-_.:](\d{2}))?\b/
  );
  if (match) {
    const [, year, month, day, hour, minute, second = '00'] = match;
    return {
      date: `${year}-${month}-${day}`,
      dateTime: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
      source: 'filename',
      confidence: 'medium',
    };
  }

  match = text.match(/\b(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})\b/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return {
      date: `${year}-${month}-${day}`,
      dateTime: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
      source: 'filename',
      confidence: 'medium',
    };
  }

  match = text.match(/\b(20\d{2})[-_. ](\d{2})[-_. ](\d{2})\b/);
  if (match) {
    const [, year, month, day] = match;
    return {
      date: `${year}-${month}-${day}`,
      dateTime: '',
      source: 'filename',
      confidence: 'low',
    };
  }

  return null;
}

function resolveAssetFilePath({ asset = {}, storageRoot = '' } = {}) {
  const root = normalizeText(storageRoot);
  const storageKey = normalizeText(asset.storageKey);
  if (storageKey) {
    if (path.isAbsolute(storageKey) && fs.existsSync(storageKey)) return storageKey;
    if (root) {
      const candidate = path.join(root, storageKey);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return '';
}

function readImageExif(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const identify = process.env.ARCANA_IMAGE_MAGICK_IDENTIFY || 'identify';
  const result = spawnSync(
    identify,
    [
      '-format',
      '%[EXIF:DateTimeOriginal]|%[EXIF:OffsetTimeOriginal]|%[EXIF:Make]|%[EXIF:Model]',
      filePath,
    ],
    { encoding: 'utf8', timeout: 10000 }
  );
  const raw = normalizeText(result.stdout);
  if (!raw || !raw.includes('|')) return null;
  const [dateTimeOriginal, offsetTimeOriginal, make, model] = raw.split('|');
  const parsed = parseExifDateTime(dateTimeOriginal, offsetTimeOriginal);
  if (!parsed) return null;
  return {
    ...parsed,
    cameraMake: normalizeText(make),
    cameraModel: normalizeText(model),
  };
}

function extractCaptureDate({ asset = {}, sourceRecord = {}, storageRoot = '' } = {}) {
  const mimeType = normalizeText(asset.mimeType || sourceRecord.mimeType).toLowerCase();
  const name = normalizeText(
    asset.originalFileName || asset.displayName || sourceRecord.fileName || sourceRecord.name
  );
  const sourceText = [
    name,
    sourceRecord.fileName,
    sourceRecord.relativePath,
    sourceRecord.path,
    asset.originalDrivePath,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' / ');

  if (mimeType.startsWith('image/')) {
    const exif = readImageExif(resolveAssetFilePath({ asset, storageRoot }));
    if (exif) return exif;
  }

  return parseCaptureDateFromName(sourceText);
}

function buildCaptureDateAudit({ asset = {}, sourceRecord = {}, storageRoot = '' } = {}) {
  const capture = extractCaptureDate({ asset, sourceRecord, storageRoot });
  const documentDate = normalizeDate(asset.documentDate);
  const captureDate = normalizeDate(capture?.date);
  const mismatch = Boolean(documentDate && captureDate && documentDate !== captureDate);
  return {
    captureDate: captureDate || null,
    captureDateTime: normalizeText(capture?.dateTime) || null,
    captureDateSource: normalizeText(capture?.source) || null,
    captureDateConfidence: normalizeText(capture?.confidence) || null,
    captureDateMismatch: mismatch,
    captureCameraMake: normalizeText(capture?.cameraMake) || null,
    captureCameraModel: normalizeText(capture?.cameraModel) || null,
  };
}

module.exports = {
  buildCaptureDateAudit,
  extractCaptureDate,
  normalizeDate,
  parseCaptureDateFromName,
  parseExifDateTime,
  resolveAssetFilePath,
};
