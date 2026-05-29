'use strict';

/**
 * ccoDriveLinkBuilder.js — Phase 1 Drive-integration.
 *
 * Konstruerar Google Drive-URLs baserat på treatment-metadata, utan att
 * behöva slå upp folder-IDs via API. Använder folder-ID-mapping för KÄNDA
 * mappar och faller tillbaka på search-URLs för okända.
 *
 * Phase 1 = rena UI-deeplinks. Ingen service-account, ingen API-anrop.
 * Deeplinks går till närmaste KÄNDA mapp (året eller månaden), inte
 * specifik dag-mapp (det kräver Phase 2 + service-account).
 *
 * Drive-struktur som kodifieras:
 *   Kunder HTP / TP / Bokade / Hair TP Clinic <YEAR> / <MONTH SWE> <YEAR> / <DAY-SWE> / <patient>
 *   Kunder Curatiio / ...samma mönster...
 *
 * Källa: docs/strategy/DRIVE-INVENTORY-REPORT-2026-05-30.md
 */

const KNOWN_FOLDERS = {
  hair_tp: {
    root: '0APPck7epTcZ-Uk9PVA',
    tp: '1OegkbmShkiJreD62j4G8ayzxCtKpveoh',
    tpBokade: '1d_ngTN-N4QsQ9Cgs72WmwLgIZV1-h_h5',
    tpBokade2026: '10sOs6wyliXiNs1o2SdJfn61ctXaBG0gH',
    tpBokade2026Maj: '1Gof_xzKOvdote1DCjb-riNozlvpLgjbh',
  },
  curatiio: {
    root: 'CURATIIO_ROOT_TBD', // hämtas när owner ger oss folder-ID
  },
};

const MONTH_SV = [
  'Januari',
  'Februari',
  'Mars',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'Augusti',
  'September',
  'Oktober',
  'November',
  'December',
];

function buildFolderUrl(folderId) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function buildSearchUrl(query, parentFolderId = null) {
  const q = encodeURIComponent(query);
  if (parentFolderId) {
    return `https://drive.google.com/drive/folders/${parentFolderId}#search?q=${q}`;
  }
  return `https://drive.google.com/drive/search?q=${q}`;
}

/**
 * Försök bygga deeplink till exakt dag-mapp baserat på treatmentDate.
 * Faller tillbaka på närmaste kända föräldern + search-query.
 *
 * @param {object} opts
 * @param {string|Date} [opts.treatmentDate] ISO-datum eller Date-objekt
 * @param {string}      [opts.brand='hair_tp'] 'hair_tp' | 'curatiio'
 * @param {string}      [opts.treatmentType='tp'] 'tp' | 'prp' | 'dhi' | …
 * @param {string}      [opts.patientName=''] Bara använd som hint-text (ej PII i URL)
 * @returns {{ url: string|null, level: string, query?: string, hint?: string, note?: string }}
 */
function buildTreatmentDriveLink({
  treatmentDate,
  brand = 'hair_tp',
  treatmentType = 'tp',
  patientName = '',
} = {}) {
  void patientName; // signatur-kompatibilitet, ej använd i URL (PII-skydd)
  const folders = KNOWN_FOLDERS[brand] || KNOWN_FOLDERS.hair_tp;
  if (!folders.root || folders.root.endsWith('_TBD')) {
    return { url: null, level: 'unknown_brand', note: 'Brand-root ej konfigurerad' };
  }
  if (!treatmentDate) {
    return { url: buildFolderUrl(folders.root), level: 'brand_root' };
  }

  const date = treatmentDate instanceof Date ? treatmentDate : new Date(treatmentDate);
  if (!date || Number.isNaN(date.getTime())) {
    return {
      url: buildFolderUrl(folders.root),
      level: 'brand_root',
      note: 'Ogiltigt datum',
    };
  }

  const year = date.getFullYear();
  const monthIdx = date.getMonth();
  const monthName = MONTH_SV[monthIdx];
  const day = date.getDate();

  // För hair_tp + tp + 2026 + maj vet vi exakt mapp-ID
  if (brand === 'hair_tp' && treatmentType === 'tp' && year === 2026 && monthIdx === 4) {
    return {
      url: buildSearchUrl(`Maj ${day}`, folders.tpBokade2026Maj),
      level: 'day_search',
      query: `Maj ${day}`,
      hint: `Söker efter "Maj ${day}" i Maj 2026-mappen. Klicka på rätt dag-mapp i resultatet.`,
    };
  }

  // För hair_tp + tp + 2026 (annan månad)
  if (brand === 'hair_tp' && treatmentType === 'tp' && year === 2026) {
    return {
      url: buildSearchUrl(`${monthName} ${year}`, folders.tpBokade2026),
      level: 'month_search',
      query: `${monthName} ${year}`,
      hint: `Söker efter "${monthName} ${year}" i Hair TP Clinic 2026-mappen.`,
    };
  }

  // För hair_tp + tp (annat år)
  if (brand === 'hair_tp' && treatmentType === 'tp') {
    return {
      url: buildSearchUrl(`Hair TP Clinic ${year}`, folders.tpBokade),
      level: 'year_search',
      query: `Hair TP Clinic ${year}`,
      hint: `Söker efter år ${year} i Bokade-mappen.`,
    };
  }

  // Fallback: bara brand-root
  return {
    url: buildFolderUrl(folders.root),
    level: 'brand_root',
    note: 'Behandlingstyp ej mappad',
  };
}

/**
 * Skapar en patient-namn-sökning inuti brand-rooten. Använd för
 * "Öppna patient i Drive"-knappar i dossier-vyn.
 *
 * @param {object} opts
 * @param {string} opts.patientName
 * @param {string} [opts.brand='hair_tp']
 * @returns {{ url: string|null, level: string, query?: string }}
 */
function buildPatientDriveSearchLink({ patientName, brand = 'hair_tp' } = {}) {
  const folders = KNOWN_FOLDERS[brand] || KNOWN_FOLDERS.hair_tp;
  if (!folders.root || folders.root.endsWith('_TBD')) {
    return { url: null, level: 'unknown_brand' };
  }
  const cleanName = typeof patientName === 'string' ? patientName.trim() : '';
  if (!cleanName) {
    return { url: buildFolderUrl(folders.root), level: 'brand_root' };
  }
  return {
    url: buildSearchUrl(cleanName, folders.root),
    level: 'patient_name_search',
    query: cleanName,
  };
}

module.exports = {
  KNOWN_FOLDERS,
  MONTH_SV,
  buildFolderUrl,
  buildSearchUrl,
  buildTreatmentDriveLink,
  buildPatientDriveSearchLink,
};
