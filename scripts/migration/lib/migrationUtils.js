'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { repairMojibakeFilename } = require('../../../src/ops/filenameEncoding');

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
  return normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[\s()-]/g, '');
}

function phoneMatchKey(value) {
  const digits = normalizePhone(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

function parseCsv(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((item) => item.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map((line, index) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current);
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = (cells[cellIndex] || '').trim();
    });
    row.rowNumber = index + 2;
    return row;
  });
}

const PIPEDRIVE_EMAIL_HEADERS = ['E-post - Arbete', 'E-post - Hem', 'E-post - Annan'];
const PIPEDRIVE_PHONE_HEADERS = [
  'Telefon - Mobil',
  'Telefon - Arbete',
  'Telefon - Hem',
  'Telefon - Annan',
];

function collectPipedriveEmails(row = {}) {
  return [
    ...new Set(
      PIPEDRIVE_EMAIL_HEADERS.map((header) => normalizeEmail(row[header])).filter(Boolean)
    ),
  ];
}

function collectPipedrivePhones(row = {}) {
  return [
    ...new Set(
      PIPEDRIVE_PHONE_HEADERS.map((header) => normalizePhone(row[header])).filter(Boolean)
    ),
  ];
}

function discoverPipedriveCsvPair(rootDir) {
  const dir = path.join(rootDir, 'migration', 'pipedrive');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.csv'));
  const people =
    files.find((name) => /^personer/i.test(name)) ||
    files.find((name) => /^people/i.test(name)) ||
    null;
  const deals =
    files.find((name) => /^affar/i.test(name)) ||
    files.find((name) => /^affär/i.test(name)) ||
    files.find((name) => /^deals/i.test(name)) ||
    null;
  if (!people || !deals) return null;
  return {
    peoplePath: path.join(dir, people),
    dealsPath: path.join(dir, deals),
  };
}

// The 8+4 digit pattern alone matches stray numbers in filenames (timestamps,
// invoice ids), which is how mojibake filenames like "...-1771596438-2394.pdf"
// spawned phantom patient profiles with impossible pnr (e.g. 76413983-1433).
// Require the leading 8 digits to be a real YYYYMMDD before accepting the match.
function isPlausiblePersonnummerDate(yyyymmdd) {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  let day = Number(yyyymmdd.slice(6, 8));
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  // Samordningsnummer carry a +60 offset on the day component.
  if (day > 60) day -= 60;
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

function inferFullYearFromYy(yy, refDate = new Date()) {
  const refYear = refDate.getFullYear();
  const currentYy = refYear % 100;
  const y1900 = 1900 + yy;
  const y2000 = 2000 + yy;
  // Svensk 10-siffrig regel: YY > innevarande års två sista → 1900-tal.
  if (yy > currentYy) return y1900;
  // Födelseår får inte ligga i framtiden.
  if (y2000 > refYear) return y1900;
  return y2000;
}

function resolveBirthYyyymmddDigits(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  for (const match of raw.matchAll(/(\d{8})[- ]?(\d{4})/g)) {
    if (isPlausiblePersonnummerDate(match[1])) return match[1];
  }
  for (const match of raw.matchAll(/(?:^|[^\d])(\d{6})[- ]?(\d{4})(?:[^\d]|$)/g)) {
    const yymmdd = match[1];
    const yy = Number(yymmdd.slice(0, 2));
    const fullYear = inferFullYearFromYy(yy);
    const yyyymmdd = `${fullYear}${yymmdd.slice(2)}`;
    if (isPlausiblePersonnummerDate(yyyymmdd)) return yyyymmdd;
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 12 && isPlausiblePersonnummerDate(digits.slice(0, 8))) {
    return digits.slice(0, 8);
  }
  if (digits.length >= 10) {
    const yymmdd = digits.slice(0, 6);
    const yy = Number(yymmdd.slice(0, 2));
    const fullYear = inferFullYearFromYy(yy);
    const yyyymmdd = `${fullYear}${yymmdd.slice(2)}`;
    if (isPlausiblePersonnummerDate(yyyymmdd)) return yyyymmdd;
  }
  return '';
}

function computeAgeYearsFromPersonnummer(value, refDate = new Date()) {
  const yyyymmdd = resolveBirthYyyymmddDigits(value);
  if (!yyyymmdd) return null;
  const birthYear = Number(yyyymmdd.slice(0, 4));
  const birthMonth = Number(yyyymmdd.slice(4, 6));
  let birthDay = Number(yyyymmdd.slice(6, 8));
  if (birthDay > 60) birthDay -= 60;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  if (Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birthYear;
  const month = ref.getMonth() + 1;
  const day = ref.getDate();
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  // 0 år döljs i UI — saknat/ogiltigt pnr ska inte visas som spädbarn.
  return age > 0 && age <= 120 ? age : null;
}

function normalizePersonnummer(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  // Scan all 8+4 candidates and take the first with a plausible date, so a stray
  // number earlier in the string doesn't shadow a real pnr later in it.
  for (const match of raw.matchAll(/(\d{8})[- ]?(\d{4})/g)) {
    if (isPlausiblePersonnummerDate(match[1])) return `${match[1]}-${match[2]}`;
  }
  for (const match of raw.matchAll(/(?:^|[^\d])(\d{6})[- ]?(\d{4})(?:[^\d]|$)/g)) {
    const yymmdd = match[1];
    const yy = Number(yymmdd.slice(0, 2));
    const fullYear = inferFullYearFromYy(yy);
    const yyyymmdd = `${fullYear}${yymmdd.slice(2)}`;
    if (isPlausiblePersonnummerDate(yyyymmdd)) return `${yyyymmdd}-${match[2]}`;
  }
  return '';
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

const SWEDISH_MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

function formatCapturedLabel(capturedAt) {
  const match = normalizeText(capturedAt).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || !day) return '';
  return `${day} ${SWEDISH_MONTHS[month - 1]} ${year}`;
}

function extractCapturedDate(text) {
  const haystack = normalizeText(text);
  if (!haystack) return '';

  const isoMatch = haystack.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const spacedMatch = haystack.match(/\b(20\d{2})[\s_./-](\d{1,2})[\s_./-](\d{1,2})\b/);
  if (spacedMatch) {
    return `${spacedMatch[1]}-${String(spacedMatch[2]).padStart(2, '0')}-${String(spacedMatch[3]).padStart(2, '0')}`;
  }

  return '';
}

function extractFileOccasionContext({
  relativePath = '',
  fileName = '',
  fileType = '',
  patientSegment = '',
} = {}) {
  const pathText = normalizeText(relativePath).replace(/\\/g, '/');
  const segments = pathText.split('/').filter(Boolean);
  const combined = `${pathText} ${fileName} ${patientSegment}`;

  let occasionType = 'other';
  let occasionLabel = '';
  let batchMonth = '';
  let batchYear = '';

  for (const segment of segments) {
    const tpMatch = segment.match(
      /^(Januari|Februari|Mars|April|Maj|Juni|Juli|Augusti|September|Oktober|November|December)\s+TP\s+(\d{4})$/i
    );
    if (tpMatch) {
      occasionType = 'tp_batch';
      batchMonth = tpMatch[1].charAt(0).toUpperCase() + tpMatch[1].slice(1).toLowerCase();
      batchYear = tpMatch[2];
      occasionLabel = `${batchMonth} TP ${batchYear}`;
      break;
    }
  }

  const clinicYear =
    segments.find((segment) => /hair tp clinic/i.test(segment))?.match(/(20\d{2})/)?.[1] || '';

  if (/prp/i.test(combined)) {
    occasionType = occasionType === 'tp_batch' ? 'tp_batch' : 'prp';
    if (!occasionLabel) occasionLabel = 'PRP-behandling';
  }

  if (fileType === 'journal_pdf' || /journal/i.test(fileName)) {
    occasionType = occasionType === 'tp_batch' ? 'tp_batch' : 'journal';
    if (!occasionLabel && clinicYear) occasionLabel = `Journal ${clinicYear}`;
  }

  let capturedAt = extractCapturedDate(combined);
  if (!capturedAt && patientSegment) {
    capturedAt = extractCapturedDate(patientSegment);
  }

  const capturedLabel = formatCapturedLabel(capturedAt);
  const isPrp = /prp/i.test(combined);
  const isJournal = fileType === 'journal_pdf' || /journal/i.test(fileName);

  let timelineKey = 'unknown';
  let timelineLabel = 'Okänt tillfälle';
  let timelineSort = '0000-00-00';

  if (capturedAt) {
    timelineKey = capturedAt;
    timelineSort = capturedAt;
    timelineLabel = capturedLabel;
    if (isPrp) timelineLabel = `${timelineLabel} · PRP`;
    else if (isJournal) timelineLabel = `${timelineLabel} · Journal`;
    else if (occasionLabel) timelineLabel = `${timelineLabel} · ${occasionLabel}`;
  } else if (occasionLabel) {
    timelineKey = normalizeKey(occasionLabel);
    timelineLabel = occasionLabel;
    timelineSort = batchYear ? `${batchYear}-12-31` : `${clinicYear || '0000'}-12-31`;
  } else if (clinicYear) {
    timelineKey = `year-${clinicYear}`;
    timelineLabel = `Arkiv ${clinicYear}`;
    timelineSort = `${clinicYear}-12-31`;
  }

  let occasionHint = '';
  if (capturedLabel && occasionLabel && !timelineLabel.includes(occasionLabel)) {
    occasionHint = occasionLabel;
  } else if (capturedLabel && isPrp) {
    occasionHint = 'PRP';
  } else if (capturedLabel && isJournal) {
    occasionHint = 'Journal';
  } else if (occasionLabel) {
    occasionHint = occasionLabel;
  }

  return {
    occasionType,
    occasionLabel,
    batchMonth,
    batchYear,
    clinicYear,
    capturedAt,
    capturedLabel,
    occasionHint,
    timelineKey,
    timelineLabel,
    timelineSort,
  };
}

function buildOccasionTimeline(files = []) {
  const groups = new Map();
  for (const file of asArray(files)) {
    const context =
      file?.occasionContext && typeof file.occasionContext === 'object'
        ? file.occasionContext
        : extractFileOccasionContext(file || {});
    const key = context.timelineKey || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        timelineKey: key,
        timelineLabel: context.timelineLabel || 'Okänt tillfälle',
        timelineSort: context.timelineSort || '0000-00-00',
        capturedAt: context.capturedAt || '',
        capturedLabel: context.capturedLabel || '',
        occasionLabel: context.occasionLabel || '',
        fileCount: 0,
        journalPdfCount: 0,
        imageCount: 0,
      });
    }
    const group = groups.get(key);
    group.fileCount += 1;
    if (file?.fileType === 'journal_pdf') group.journalPdfCount += 1;
    if (file?.fileType === 'image') group.imageCount += 1;
  }

  return [...groups.values()].sort((a, b) =>
    String(b.timelineSort).localeCompare(String(a.timelineSort))
  );
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function listZipCandidates(rootDir) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root)) {
    if (name.toLowerCase().endsWith('.zip')) {
      out.push(path.join(root, name));
    }
  }
  return out;
}

function discoverMigrationZips(migrationRoot) {
  const root = path.resolve(migrationRoot);
  if (!fs.existsSync(root)) return [];

  const searchRoots = new Set([root]);
  for (const name of fs.readdirSync(root)) {
    const abs = path.join(root, name);
    try {
      if (fs.statSync(abs).isDirectory()) searchRoots.add(abs);
    } catch {
      // ignore unreadable iCloud placeholders
    }
  }

  const archiveJournal = path.join(root, 'MA-Archive', 'journal-zips');
  if (fs.existsSync(archiveJournal)) searchRoots.add(archiveJournal);

  const zips = new Set();
  for (const dir of searchRoots) {
    for (const zipPath of listZipCandidates(dir)) {
      zips.add(zipPath);
    }
  }
  return [...zips].sort();
}

function discoverClientoCsv(migrationRoot) {
  const root = path.resolve(migrationRoot);
  if (!fs.existsSync(root)) return null;

  const searchRoots = [root, path.join(root, 'MA-Archive', 'cliento')];
  for (const name of fs.readdirSync(root)) {
    const abs = path.join(root, name);
    try {
      if (fs.statSync(abs).isDirectory()) searchRoots.push(abs);
    } catch {
      // ignore
    }
  }

  for (const dir of searchRoots) {
    if (!fs.existsSync(dir)) continue;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const lower = name.toLowerCase();
      if (!lower.includes('kundexport') || !lower.endsWith('.csv')) continue;
      return path.join(dir, name);
    }
  }
  return null;
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

function describeMigrationFileStreamability(file, { driveConfigured = false } = {}) {
  const driveFileId = normalizeText(file?.driveFileId);
  const hasFolder = file?.source === 'folder' && Boolean(normalizeText(file?.folderRoot));
  const hasZip = Boolean(normalizeText(file?.zipName));
  const streamable = hasFolder || (driveConfigured && Boolean(driveFileId)) || hasZip;
  const driveLinkMissing = driveConfigured && !driveFileId && !hasFolder;
  return {
    streamable,
    driveLinkMissing,
    hasDriveFileId: Boolean(driveFileId),
  };
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
    fileName: repairMojibakeFilename(path.basename(relativePath)),
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
  PIPEDRIVE_EMAIL_HEADERS,
  PIPEDRIVE_PHONE_HEADERS,
  buildFileRecord,
  describeMigrationFileStreamability,
  classifyFile,
  collectPipedriveEmails,
  collectPipedrivePhones,
  discoverClientoCsv,
  discoverMigrationZips,
  discoverPipedriveCsvPair,
  parseCsv,
  phoneMatchKey,
  extractDisplayNameFromSegment,
  extractFileOccasionContext,
  extractPersonnummerFromPath,
  buildOccasionTimeline,
  formatCapturedLabel,
  listZipEntries,
  nameOverlapScore,
  normalizeEmail,
  normalizeKey,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  computeAgeYearsFromPersonnummer,
  resolveBirthYyyymmddDigits,
  splitName,
  walkFolderEntries,
};
