'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PERSONNUMMER_RE = /(\d{8})[- ]?(\d{4})/;
const JOURNAL_NAME_RE = /journal|frisk|h[aä]lso|samtycke|friskfors/i;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.heic', '.png', '.dng', '.webp']);
const VIDEO_EXT = new Set(['.mov', '.mp4']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase().replace(/^mailto:/, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[\s()-]/g, '');
}

function normalizePersonnummer(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const match = raw.match(PERSONNUMMER_RE);
  if (!match) return '';
  return `${match[1]}-${match[2]}`;
}

function splitName(fullName) {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function nameTokens(value) {
  return normalizeKey(value)
    .replace(/[^a-z0-9åäöéü\s-]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function nameOverlapScore(a, b) {
  const left = new Set(nameTokens(a));
  const right = new Set(nameTokens(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
}

function classifyFile(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const baseName = path.basename(relativePath);
  if (ext === '.pdf') {
    return JOURNAL_NAME_RE.test(relativePath) ? 'journal_pdf' : 'document_pdf';
  }
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (ext === '.docx' || ext === '.doc') return 'document_word';
  return 'other';
}

function extractPersonnummerFromPath(relativePath) {
  const matches = [];
  for (const match of relativePath.matchAll(/\d{8}[- ]?\d{4}/g)) {
    const pnr = normalizePersonnummer(match[0]);
    if (pnr) matches.push(pnr);
  }
  return [...new Set(matches)];
}

function extractDisplayNameFromSegment(segment) {
  const cleaned = normalizeText(segment)
    .replace(PERSONNUMMER_RE, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—_\s]+|[-–—_\s]+$/g, '');
  return cleaned;
}

function listZipEntries(zipPath) {
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    return { ok: false, entries: [], error: result.stderr || 'unzip failed' };
  }
  const entries = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith('/'));
  return { ok: true, entries, error: null };
}

function discoverMigrationZips(migrationRoot) {
  const root = path.resolve(migrationRoot);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .map((name) => path.join(root, name))
    .sort();
}

function discoverClientoCsv(migrationRoot) {
  const root = path.resolve(migrationRoot);
  if (!fs.existsSync(root)) return null;
  const candidates = fs
    .readdirSync(root)
    .filter((name) => name.toLowerCase().includes('kundexport') && name.toLowerCase().endsWith('.csv'))
    .map((name) => path.join(root, name));
  return candidates[0] || null;
}

function walkFolderEntries(folderRoot, { skipHidden = true } = {}) {
  const root = path.resolve(folderRoot);
  if (!fs.existsSync(root)) {
    return { ok: false, entries: [], error: `Mappen finns inte: ${root}` };
  }

  const entries = [];
  const stack = [{ absPath: root, relativePath: '' }];

  while (stack.length) {
    const current = stack.pop();
    let names = [];
    try {
      names = fs.readdirSync(current.absPath);
    } catch (error) {
      return { ok: false, entries, error: error.message || 'readdir failed' };
    }

    for (const name of names) {
      if (skipHidden && name.startsWith('.')) continue;
      const absPath = path.join(current.absPath, name);
      const relativePath = current.relativePath ? `${current.relativePath}/${name}` : name;
      let stat;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push({ absPath, relativePath });
        continue;
      }
      if (stat.isFile()) {
        entries.push(relativePath.replace(/\\/g, '/'));
      }
    }
  }

  return { ok: true, entries, error: null };
}

function buildFileRecord({
  source = 'zip',
  zipName = '',
  folderRoot = '',
  relativePath,
  driveFileId = '',
  mimeType = '',
  webViewLink = '',
}) {
  const personnummerList = extractPersonnummerFromPath(relativePath);
  const segments = relativePath.split('/').filter(Boolean);
  const patientSegment =
    segments.find((segment) => extractPersonnummerFromPath(segment).length) ||
    segments.find((segment) => /journal|prp|op/i.test(segment)) ||
    segments[segments.length - 2] ||
    '';
  return {
    id: crypto.randomUUID(),
    source,
    zipName: source === 'zip' ? zipName : '',
    folderRoot: source === 'folder' ? folderRoot : '',
    driveFileId: source === 'drive_api' ? driveFileId : '',
    mimeType: source === 'drive_api' ? mimeType : '',
    webViewLink: source === 'drive_api' ? webViewLink : '',
    relativePath,
    fileName: path.basename(relativePath),
    fileType: classifyFile(relativePath),
    personnummer: personnummerList[0] || '',
    personnummerCandidates: personnummerList,
    patientSegment,
    displayName: extractDisplayNameFromSegment(patientSegment),
    indexedAt: new Date().toISOString(),
  };
}

module.exports = {
  PERSONNUMMER_RE,
  buildFileRecord,
  classifyFile,
  discoverClientoCsv,
  discoverMigrationZips,
  extractDisplayNameFromSegment,
  extractPersonnummerFromPath,
  listZipEntries,
  nameOverlapScore,
  normalizeEmail,
  normalizeKey,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  splitName,
  walkFolderEntries,
};
