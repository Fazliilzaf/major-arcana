'use strict';

const { normalizePersonnummer } = require('./migrationUtils');

function evaluateSpotCheck({
  indexRaw,
  masterRaw,
  tenantId = 'hair-tp-clinic',
  minMatches = 20,
  sampleSize = 30,
  shuffleFn = shuffle,
} = {}) {
  const files = Array.isArray(indexRaw?.files) ? indexRaw.files : [];
  const indexByPnr = new Map();
  for (const file of files) {
    const pnr = normalizePersonnummer(file.personnummer);
    if (!pnr) continue;
    if (!indexByPnr.has(pnr)) indexByPnr.set(pnr, []);
    indexByPnr.get(pnr).push(file);
  }

  const patients = (Array.isArray(masterRaw?.patients) ? masterRaw.patients : []).filter(
    (patient) =>
      String(patient?.tenantId || tenantId) === tenantId &&
      normalizePersonnummer(patient.personnummer)
  );

  const overlap = patients.filter((patient) =>
    indexByPnr.has(normalizePersonnummer(patient.personnummer))
  );

  const sample = shuffleFn(overlap).slice(0, Math.min(sampleSize, overlap.length));
  const warnings = [];
  let checked = 0;

  for (const patient of sample) {
    const pnr = normalizePersonnummer(patient.personnummer);
    const indexFiles = indexByPnr.get(pnr) || [];
    const journalPdfs = indexFiles.filter((file) => file.fileType === 'journal_pdf');
    const masterName = String(patient.displayName || patient.name || '').trim().toLowerCase();
    const indexNames = new Set(
      indexFiles
        .map((file) => String(file.patientName || file.displayName || '').trim().toLowerCase())
        .filter(Boolean)
    );

    checked += 1;
    const nameOk =
      !masterName ||
      !indexNames.size ||
      indexNames.has(masterName) ||
      [...indexNames].some((name) => name.includes(masterName.split(' ')[0]));

    if (!journalPdfs.length) {
      warnings.push({
        personnummer: pnr,
        type: 'missing_journal_pdf',
        detail: patient.displayName || patient.id,
      });
    } else if (!nameOk) {
      warnings.push({
        personnummer: pnr,
        type: 'name_mismatch',
        detail: `master="${masterName}" index=[${[...indexNames].join(', ')}]`,
      });
    }
  }

  return {
    tenantId,
    indexFileCount: files.length,
    patientCount: patients.length,
    overlapCount: overlap.length,
    minMatches,
    sampleSize,
    checked,
    warnings,
    checks: {
      indexExists: files.length > 0,
      patientMasterExists: patients.length > 0,
      overlapMin: overlap.length >= minMatches,
      sampleClean: checked > 0 && warnings.length === 0,
    },
  };
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = {
  evaluateSpotCheck,
  shuffle,
};
