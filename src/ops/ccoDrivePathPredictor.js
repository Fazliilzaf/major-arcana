'use strict';

/**
 * ccoDrivePathPredictor.js
 *
 * Förutsäger Drive-mapp-path för en encounter utan att kalla Drive-API.
 * Används som stub-koppling innan service-account är konfigurerad.
 *
 * Drive-struktur:
 *   Kunder HTP / TP / Bokade / Hair TP Clinic <YEAR> / <MONTH SWE> <YEAR> / <MONTH SWE> <DAY> / <patient>
 *   Kunder Curatiio / ... liknande
 *
 * Källa: docs/strategy/DRIVE-INVENTORY-REPORT-2026-05-30.md
 *        src/ops/ccoDriveLinkBuilder.js (MONTH_SV + KNOWN_FOLDERS)
 */

const { MONTH_SV, KNOWN_FOLDERS, buildSearchUrl, buildFolderUrl } = require('./ccoDriveLinkBuilder');

const BRAND_ROOT_LABEL = {
  hair_tp: 'Kunder HTP/TP/Bokade',
  curatiio: 'Kunder Curatiio',
};

const BRAND_FOLDER_PREFIX = {
  hair_tp: 'Hair TP Clinic',
  curatiio: 'Curatiio',
};

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Predict the Drive-path for a treatment encounter.
 *
 * @param {object} opts
 * @param {string|Date} opts.treatmentDate
 * @param {string} [opts.brand='hair_tp']
 * @param {string} [opts.treatmentType='tp']
 * @returns {{
 *   predictedPath: string|null,
 *   searchUrl: string|null,
 *   existsConfidence: 'high'|'medium'|'low'|'unknown',
 *   level: string,
 *   driveStatus: 'pending_service_account_auth'|'predicted'|'unknown',
 *   notes?: string,
 * }}
 */
function predictDrivePath({ treatmentDate, brand = 'hair_tp', treatmentType = 'tp' } = {}) {
  const folders = KNOWN_FOLDERS[brand] || null;
  const brandLabel = BRAND_ROOT_LABEL[brand] || BRAND_ROOT_LABEL.hair_tp;
  const brandPrefix = BRAND_FOLDER_PREFIX[brand] || BRAND_FOLDER_PREFIX.hair_tp;

  if (!folders || !folders.root || String(folders.root).endsWith('_TBD')) {
    return {
      predictedPath: null,
      searchUrl: null,
      existsConfidence: 'unknown',
      level: 'unknown_brand',
      driveStatus: 'pending_service_account_auth',
      notes: 'Brand-root ej konfigurerad.',
    };
  }

  const date = asDate(treatmentDate);
  if (!date) {
    return {
      predictedPath: `${brandLabel}/`,
      searchUrl: buildFolderUrl(folders.root),
      existsConfidence: 'low',
      level: 'brand_root',
      driveStatus: 'pending_service_account_auth',
      notes: 'Inget treatmentDate — kan bara peka på brand-root.',
    };
  }

  const year = date.getFullYear();
  const monthIdx = date.getMonth();
  const monthName = MONTH_SV[monthIdx];
  const day = date.getDate();
  const yearLabel = `${brandPrefix} ${year}`;
  const monthLabel = `${monthName} ${year}`;
  const dayLabel = `${monthName} ${day}`;

  const predictedPath = `${brandLabel}/${yearLabel}/${monthLabel}/${dayLabel}/`;

  // existsConfidence-heuristik:
  //  - high   : vi har känd folder-ID för exakt månad (t.ex. Maj 2026)
  //  - medium : vi har känd folder-ID för året
  //  - low    : bara brand-root känd, allt annat predicted
  let existsConfidence = 'low';
  let level = 'predicted_day';
  let searchUrl = buildSearchUrl(dayLabel, folders.root);

  if (brand === 'hair_tp' && treatmentType === 'tp') {
    if (year === 2026 && monthIdx === 4 && folders.tpBokade2026Maj) {
      existsConfidence = 'high';
      level = 'known_month_predicted_day';
      searchUrl = buildSearchUrl(dayLabel, folders.tpBokade2026Maj);
    } else if (year === 2026 && folders.tpBokade2026) {
      existsConfidence = 'medium';
      level = 'known_year_predicted_month_day';
      searchUrl = buildSearchUrl(monthLabel, folders.tpBokade2026);
    } else if (folders.tpBokade) {
      existsConfidence = 'low';
      level = 'known_brand_year_search';
      searchUrl = buildSearchUrl(yearLabel, folders.tpBokade);
    }
  }

  return {
    predictedPath,
    searchUrl,
    existsConfidence,
    level,
    driveStatus: 'pending_service_account_auth',
  };
}

module.exports = {
  predictDrivePath,
  BRAND_ROOT_LABEL,
  BRAND_FOLDER_PREFIX,
};
