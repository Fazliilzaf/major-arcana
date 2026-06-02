'use strict';

/**
 * documentClassifier — klassificera importerade assets till titel/kategori/subCategory.
 * Använder originalFileName + mime + befintlig category (ingen gissning av juridik).
 */

const path = require('node:path');

const FORM_PATTERNS = [
  {
    re: /friskf[oö]rs[aä]kran|fitness/i,
    subCategory: 'fitness_certificate',
    title: 'Friskförsäkran',
  },
  {
    re: /h[aä]lsodekl|health[\W_]?decl/i,
    subCategory: 'health_declaration',
    title: 'Hälsodeklaration',
  },
  { re: /samtycke|consent/i, subCategory: 'consent', title: 'Samtycke' },
  { re: /behandlingssamtycke/i, subCategory: 'treatment_consent', title: 'Behandlingssamtycke' },
  { re: /avtal|agreement|kontrakt/i, subCategory: 'agreement', title: 'Avtal' },
  { re: /offert|offer|quote/i, subCategory: 'offer', title: 'Offert' },
  {
    re: /behandlingsplan|treatment[\W_]?plan|ritning|hairline/i,
    subCategory: 'treatment_plan',
    title: 'Behandlingsplan',
  },
  { re: /efterv[aä]rd|aftercare/i, subCategory: 'aftercare', title: 'Eftervård' },
  { re: /uppf[oö]lj|follow[\W_]?up/i, subCategory: 'follow_up', title: 'Uppföljning' },
  { re: /aisia/i, subCategory: 'aisia_report', title: 'Aisia-rapport' },
];

const TREATMENT_PATTERNS = [
  { re: /\bprp\b/i, label: 'PRP' },
  { re: /\bdhi\b/i, label: 'DHI Operation' },
  { re: /\bfue\b|transplant/i, label: 'FUE Operation' },
  { re: /\btp\b(?!\s*clinic)/i, label: 'FUE Operation' },
  { re: /botox/i, label: 'Botox' },
  { re: /filler/i, label: 'Filler' },
  { re: /bleph|ögonlock/i, label: 'Ögonlocksplastik' },
  { re: /meso/i, label: 'Mesoterapi' },
  { re: /microneedle|microneedling/i, label: 'Microneedling' },
  { re: /trichos/i, label: 'Trichoscopy' },
];

function normalizeText(v) {
  return typeof v === 'string' ? v.trim().normalize('NFC') : '';
}

function parseJournalFilename(fileName) {
  const base = normalizeText(fileName);
  const m = base.match(/^journal-([^-]+)-/i);
  if (!m) return null;
  const token = m[1].toUpperCase();
  if (token === 'PRP')
    return {
      treatmentType: 'PRP',
      documentTitle: 'Journal',
      subCategory: 'journal',
      confidence: 'high',
    };
  if (token === 'TP')
    return {
      treatmentType: 'FUE Operation',
      documentTitle: 'Journal',
      subCategory: 'journal',
      confidence: 'high',
    };
  if (token === 'DHI')
    return {
      treatmentType: 'DHI Operation',
      documentTitle: 'Journal',
      subCategory: 'journal',
      confidence: 'high',
    };
  return {
    treatmentType: token,
    documentTitle: 'Journal',
    subCategory: 'journal',
    confidence: 'medium',
  };
}

function detectTreatment(text) {
  const hay = normalizeText(text);
  if (!hay) return null;
  for (const p of TREATMENT_PATTERNS) {
    if (p.re.test(hay)) return p.label;
  }
  return null;
}

function detectFormTitle(fileName) {
  for (const p of FORM_PATTERNS) {
    if (p.re.test(fileName)) return p;
  }
  return null;
}

function categoryFromMime(mimeType, fileName) {
  const ext = path.extname(normalizeText(fileName)).toLowerCase();
  const mime = normalizeText(mimeType).toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') return 'document';
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.heic', '.webp'].includes(ext))
    return 'image';
  return 'other';
}

/**
 * @param {object} asset
 * @returns {{ category, subCategory, documentTitle, treatmentType, confidence, signals }}
 */
function classifyDocument(asset = {}) {
  const fileName = normalizeText(asset.originalFileName);
  const folder = normalizeText(asset.originalDrivePath);
  const haystack = `${fileName} ${folder}`;
  const existingCategory = normalizeText(asset.category);
  const signals = [];

  if (existingCategory.startsWith('photo_')) {
    return {
      category: existingCategory,
      subCategory: existingCategory.replace('photo_', ''),
      documentTitle: null,
      treatmentType: detectTreatment(haystack),
      confidence: 'medium',
      signals: ['existing_photo_category'],
    };
  }

  const journalParsed = parseJournalFilename(fileName);
  if (journalParsed) {
    signals.push('journal_filename_pattern');
    return { category: 'journal', ...journalParsed, signals };
  }

  const formMatch = detectFormTitle(fileName);
  if (formMatch) {
    signals.push('form_filename_pattern');
    return {
      category:
        formMatch.subCategory === 'offer'
          ? 'offer'
          : existingCategory === 'form'
            ? 'form'
            : formMatch.subCategory,
      subCategory: formMatch.subCategory,
      documentTitle: formMatch.title,
      treatmentType: detectTreatment(haystack),
      confidence: 'high',
      signals,
    };
  }

  if (existingCategory === 'journal' || /journal|anteckning/i.test(fileName)) {
    signals.push('category_or_name_journal');
    return {
      category: 'journal',
      subCategory: 'journal',
      documentTitle: 'Journal',
      treatmentType: detectTreatment(haystack),
      confidence: /journal-/i.test(fileName) ? 'high' : 'medium',
      signals,
    };
  }

  if (existingCategory === 'form') {
    signals.push('existing_form_category');
    return {
      category: 'form',
      subCategory: 'form',
      documentTitle: 'Formulär',
      treatmentType: detectTreatment(haystack),
      confidence: 'low',
      signals,
    };
  }

  if (existingCategory === 'consent' || /samtycke|consent/i.test(fileName)) {
    return {
      category: 'consent',
      subCategory: 'consent',
      documentTitle: 'Samtycke',
      treatmentType: detectTreatment(haystack),
      confidence: 'medium',
      signals: ['consent_hint'],
    };
  }

  if (existingCategory === 'agreement' || /avtal|agreement/i.test(fileName)) {
    return {
      category: 'agreement',
      subCategory: 'agreement',
      documentTitle: 'Avtal',
      treatmentType: detectTreatment(haystack),
      confidence: 'medium',
      signals: ['agreement_hint'],
    };
  }

  if (existingCategory === 'aisia_report') {
    return {
      category: 'aisia_report',
      subCategory: 'aisia_report',
      documentTitle: 'Aisia-rapport',
      treatmentType: detectTreatment(haystack),
      confidence: 'high',
      signals: ['aisia_category'],
    };
  }

  const mimeKind = categoryFromMime(asset.mimeType, fileName);
  if (mimeKind === 'image') {
    return {
      category: existingCategory || 'photo_during',
      subCategory: 'unknown',
      documentTitle: null,
      treatmentType: detectTreatment(haystack),
      confidence: /^img[_-]/i.test(fileName) ? 'low' : 'medium',
      signals: ['generic_image'],
    };
  }

  return {
    category: existingCategory || 'other',
    subCategory: 'unknown',
    documentTitle: 'Dokument',
    treatmentType: detectTreatment(haystack),
    confidence: 'low',
    signals: ['fallback'],
  };
}

module.exports = {
  classifyDocument,
  detectTreatment,
  detectFormTitle,
  parseJournalFilename,
  FORM_PATTERNS,
  TREATMENT_PATTERNS,
};
