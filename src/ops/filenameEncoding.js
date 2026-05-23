'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reparera filnamn som felaktigt tolkats som Latin-1 istället för UTF-8
 * (vanligt vid Drive/zip-import — visar ?? eller mojibake för ÅÄÖ).
 */
function repairMojibakeFilename(name) {
  const text = normalizeText(name);
  if (!text) return text;
  if (!/(?:\?\?|\uFFFD|Ã.|Ã|â€)/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8').trim();
    if (repaired && repaired !== text && !/\?\?/.test(repaired)) {
      return repaired;
    }
  } catch {
    /* ignore */
  }
  return text;
}

module.exports = {
  repairMojibakeFilename,
};
