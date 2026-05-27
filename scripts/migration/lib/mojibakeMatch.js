'use strict';

// Recover Drive matches for files whose names suffered LOSSY mojibake (å/ä/ö
// replaced by literal "?"/"+?" during the old zip import), where byte-level
// repair is impossible. Matching is gated on personnummer — a file can only be
// matched to a Drive file belonging to the same patient — and produces proposals
// for human review rather than auto-linking medical records.

const path = require('node:path');
const { repairMojibakeFilename } = require('../../../src/ops/filenameEncoding');

// Collapse a filename to a comparison skeleton that survives lossy corruption:
// drop recoverable mojibake, HTML entities, extension, dedupe suffix and
// diacritics, then keep only [a-z0-9] (which also discards stray "?"/"+"/spaces).
function skeletonName(name) {
  let value = repairMojibakeFilename(String(name || ''));
  value = value
    .replace(/&#0?39;?/gi, '')
    .replace(/&(?:amp|lt|gt|quot);?/gi, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/\s*\([0-9]+\)\s*$/i, '');
  // NFD splits "ä" into "a" + combining mark; the [^a-z0-9] filter below then
  // drops the combining mark (and stray "?"/"+"/spaces) leaving the base letter.
  return value.normalize('NFD').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function bigrams(value) {
  const set = new Set();
  for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
  return set;
}

// Dice coefficient over character bigrams — tolerant of a dropped/garbled char.
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection += 1;
  return (2 * intersection) / (setA.size + setB.size);
}

function fileNameOf(file = {}) {
  return String(file.fileName || path.basename(String(file.relativePath || ''))).trim();
}

function summarizeMissing(file = {}) {
  return {
    id: String(file.id || ''),
    fileName: fileNameOf(file),
    fileType: String(file.fileType || ''),
    personnummer: String(file.personnummer || ''),
    relativePath: String(file.relativePath || ''),
  };
}

function summarizeDrive(file = {}) {
  return {
    driveFileId: String(file.driveFileId || ''),
    fileName: fileNameOf(file),
    fileType: String(file.fileType || ''),
    relativePath: String(file.relativePath || ''),
  };
}

// Gated, review-first matcher.
// - missingFiles: index files lacking driveFileId.
// - driveFiles:   Drive-API files (each with driveFileId + personnummer).
// Returns { proposed, ambiguous, unresolved, stats }. Nothing is mutated.
function proposeDriveMatches({ missingFiles = [], driveFiles = [], minScore = 0.82, scoreMargin = 0.1 } = {}) {
  const driveByPnr = new Map();
  for (const drive of driveFiles) {
    const pnr = String(drive.personnummer || '').trim();
    if (!pnr || !String(drive.driveFileId || '').trim()) continue;
    if (!driveByPnr.has(pnr)) driveByPnr.set(pnr, []);
    driveByPnr.get(pnr).push(drive);
  }

  const proposed = [];
  const ambiguous = [];
  const unresolved = [];
  const claimed = new Set();

  for (const missing of missingFiles) {
    if (String(missing.driveFileId || '').trim()) continue;
    const pnr = String(missing.personnummer || '').trim();
    if (!pnr) {
      unresolved.push({ file: summarizeMissing(missing), reason: 'no_personnummer' });
      continue;
    }
    const pool = (driveByPnr.get(pnr) || []).filter(
      (drive) => !claimed.has(drive.driveFileId)
    );
    if (!pool.length) {
      unresolved.push({ file: summarizeMissing(missing), reason: 'no_unclaimed_drive_files_under_pnr' });
      continue;
    }

    const sameType = pool.filter((drive) => drive.fileType === missing.fileType);
    const candidates = sameType.length ? sameType : pool;
    const missingSkeleton = skeletonName(fileNameOf(missing));

    const scored = candidates
      .map((drive) => ({ drive, score: nameSimilarity(missingSkeleton, skeletonName(fileNameOf(drive))) }))
      .sort((left, right) => right.score - left.score);

    const best = scored[0];
    const second = scored[1];
    const clearWinner = !second || best.score - second.score >= scoreMargin;

    if (best.score >= minScore && clearWinner) {
      claimed.add(best.drive.driveFileId);
      proposed.push({
        file: summarizeMissing(missing),
        match: summarizeDrive(best.drive),
        score: Number(best.score.toFixed(3)),
        confidence: 'high',
        reason: 'name_skeleton_match',
      });
    } else if (sameType.length === 1) {
      // Exactly one Drive file of this type under the patient: strong structural
      // signal, but the name didn't confirm — needs a human glance before apply.
      claimed.add(best.drive.driveFileId);
      proposed.push({
        file: summarizeMissing(missing),
        match: summarizeDrive(best.drive),
        score: Number(best.score.toFixed(3)),
        confidence: 'medium',
        reason: 'sole_file_of_type_under_pnr',
      });
    } else {
      ambiguous.push({
        file: summarizeMissing(missing),
        candidates: scored.slice(0, 3).map((entry) => ({
          ...summarizeDrive(entry.drive),
          score: Number(entry.score.toFixed(3)),
        })),
        reason: best.score >= minScore ? 'multiple_high_score' : 'low_confidence',
      });
    }
  }

  return {
    proposed,
    ambiguous,
    unresolved,
    stats: {
      missing: missingFiles.length,
      proposedHigh: proposed.filter((entry) => entry.confidence === 'high').length,
      proposedMedium: proposed.filter((entry) => entry.confidence === 'medium').length,
      ambiguous: ambiguous.length,
      unresolved: unresolved.length,
    },
  };
}

module.exports = {
  skeletonName,
  nameSimilarity,
  proposeDriveMatches,
};
