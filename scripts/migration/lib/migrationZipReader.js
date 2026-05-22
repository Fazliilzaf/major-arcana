'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.webp': 'image/webp',
  '.dng': 'image/x-adobe-dng',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
};

function resolveZipPath(migrationRoot, zipName) {
  if (!zipName) return '';
  return path.join(path.resolve(migrationRoot), zipName);
}

function zipExists(zipPath) {
  try {
    return fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0;
  } catch {
    return false;
  }
}

function contentTypeForPath(relativePath) {
  const ext = path.extname(String(relativePath || '')).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function openZipEntryStream({ zipPath, relativePath }) {
  if (!zipExists(zipPath)) {
    const error = new Error(`Zip saknas eller är tom: ${zipPath}`);
    error.statusCode = 404;
    throw error;
  }
  const child = spawn('unzip', ['-p', zipPath, relativePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => {
    child.__stderr = `${child.__stderr || ''}${chunk}`;
  });
  child.on('error', (error) => {
    child.__spawnError = error;
  });
  return child;
}

module.exports = {
  contentTypeForPath,
  openZipEntryStream,
  resolveZipPath,
  zipExists,
};
