'use strict';

/**
 * documentClassifier — klassificera importerade assets till titel/kategori/subCategory.
 * Använder originalFileName + mime + befintlig category (ingen gissning av juridik).
 */

const path = require('node:path');

// Toppnivå-kategorier som är tillåtna att exponera som `category`. De
// flesta FORM_PATTERN-subCategories (t.ex. "health_declaration") har
// traditionellt använts både som subCategory och som category i UI-et,
// så de listas här för att bevara det beteendet. När ett FORM_PATTERN
// producerar en subCategory som INTE finns med (t.ex. "medication_timing"),
// faller vi tillbaka på "form" eller "journal" beroende på innehåll.
const VALID_TOP_CATEGORIES = new Set([
  'journal',
  'photo_before',
  'photo_during',
  'photo_after',
  'consent',
  'agreement',
  'form',
  'aisia_report',
  'offer',
  'other',
  'fitness_certificate',
  'health_declaration',
  'treatment_consent',
  'treatment_plan',
  'aftercare',
  'follow_up',
]);

const FORM_PATTERNS = [
  {
    // Tolerera korrupta former av "friskförsäkran":
    //   Friskförsäkran (korrekt)
    //   Friskforsakran (ä → a)
    //   Friskfo??rsa??kran (? ? )
    //   Friskf+?rs+?kran (+?)
    re: /friskf[\+\?a-zäöå\-]*rs[\+\?a-zäöå\-]*kran|fitness/i,
    subCategory: 'fitness_certificate',
    title: 'Friskförsäkran',
  },
  {
    // Tolerera flera importerade korruptionsformer av "hälsodeklaration":
    //   Hälsodeklaration (korrekt)
    //   Halsodeklaration (ä → a)
    //   H-lsodeklaration (ä → -)
    //   H+?lsodeklaration (ä → +?)
    //   Ha??lsodeklaration (ä → a??)
    re: /h[aä+?\-][\+\?a-zäöå]*lso?dekl|health[\W_]?decl/i,
    subCategory: 'health_declaration',
    title: 'Hälsodeklaration',
  },
  {
    // CF7-* (consent form) som dyker upp både från drive_import och
    // pipedrive_import. Behandlas som samtycke tills vi har ett tydligare
    // ursprungssystemssignal.
    re: /\bcf7?\d/i,
    subCategory: 'consent',
    title: 'Samtycke',
  },
  {
    // Operationstimestamps från video-/fotoinstrumentering, t.ex.
    // "FUE-Timestamps.pdf" eller "DHI-Timestamps.pdf".
    re: /\b(fue|dhi)[\s\-]?timestamps/i,
    subCategory: 'operation_timestamps',
    title: 'Operationstimestamps',
  },
  {
    // Medicindeligering / läkemedelslista — klinisk info som journal.
    re: /medicindel|medication list|l[äa]kemedels/i,
    subCategory: 'medication_list',
    title: 'Läkemedelslista',
  },
  {
    // Elektroniska visitkort (vcf). Sätts som medium eftersom det är en
    // kontaktuppgift, inte ett medicinskt dokument.
    re: /elektroniskt[-\s]?visitkort|\.vcf$/i,
    subCategory: 'contact_card',
    title: 'Visitkort',
  },
  {
    // Medication timing / ordination — läkemedelsinstruktioner som
    // importerats som generiska PDF:er. Sätts som journal eftersom det är
    // klinisk information.
    re: /medication timing|ordination/i,
    subCategory: 'medication_timing',
    title: 'Läkemedelsinstruktion',
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

/**
 * Reparera dubbelkodade filnamn från Drive.
 *
 * UTF-8-byten för "ä" (C3 A4) har tolkats som Latin-1 och blivit "Ã¤". I
 * Drive-indexet bär 753 hälsodeklarationer och 697 friskförsäkringar den
 * formen — 56 % respektive 63 % av alla sådana dokument. FORM_PATTERNS
 * matchar dem inte: `/h[aä]lsodekl/i` kan omöjligt träffa "HÃ¤lsodekl",
 * eftersom "Ã" varken är "a" eller "ä". Dokumenten klassificerades därför
 * som `other` och blev aldrig hälsodeklarationer i kundkortet.
 *
 * Reparationen körs BARA när strängen faktiskt ser dubbelkodad ut och
 * avkodningen ger ett rent resultat. Ett korrekt kodat namn skulle annars
 * förstöras: "ä" är U+00E4, som ryms i Latin-1 men inte är giltig UTF-8
 * ensam.
 */
const MOJIBAKE_SIGNATURE = /[ÂÃ][-¿]/;

function repairMojibake(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text || !MOJIBAKE_SIGNATURE.test(text)) return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    // U+FFFD betyder att avkodningen misslyckades — behåll originalet.
    if (!repaired || repaired.includes('�')) return text;
    return repaired;
  } catch (_error) {
    return text;
  }
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
  const fileName = repairMojibake(normalizeText(asset.originalFileName));
  const folder = repairMojibake(normalizeText(asset.originalDrivePath));
  const haystack = `${fileName} ${folder}`;
  const existingCategory = normalizeText(asset.category);
  const existingSubCategory = normalizeText(asset.subCategory);
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

  // Operationsvideor från Drive ligger i mappar som innehåller "OP",
  // "Operation" eller behandlingstyp. MOV/MP4 utan mappkontext vet vi
  // för lite om, så mönstret kräver både video-mime och operationskontext.
  const mimeLower = normalizeText(asset.mimeType).toLowerCase();
  if (
    mimeLower.startsWith('video/') &&
    /\b(op|operation|prp|fue|dhi)\b/i.test(folder)
  ) {
    signals.push('operation_video');
    return {
      category: 'other',
      subCategory: 'operation_video',
      documentTitle: 'Operationsvideo',
      treatmentType: detectTreatment(haystack),
      confidence: 'medium',
      signals,
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
    const derivedCategory =
      formMatch.subCategory === 'offer'
        ? 'offer'
        : existingCategory === 'form'
          ? 'form'
          : formMatch.subCategory === 'medication_timing' ||
              formMatch.subCategory === 'operation_timestamps' ||
              formMatch.subCategory === 'medication_list'
            ? 'journal'
            : formMatch.subCategory === 'contact_card'
              ? 'other'
              : VALID_TOP_CATEGORIES.has(formMatch.subCategory)
                ? formMatch.subCategory
                : 'form';
    return {
      category: derivedCategory,
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
    // m365_halso är ett dedikerat hälsodeklarations-/formulärsystem. När
    // kategorin redan är markerad som 'form' därifrån, men filnamnet inte
    // räcker för att avgöra exakt formulärtyp, är det fortfarande säkrare än
    // ett generiskt 'form'-fall — dokumentet är ett verifierat formulär.
    const isM365Halso = normalizeText(asset.sourceSystem) === 'm365_halso';
    return {
      category: 'form',
      subCategory: 'form',
      documentTitle: 'Formulär',
      treatmentType: detectTreatment(haystack),
      confidence: isM365Halso ? 'medium' : 'low',
      signals,
    };
  }

  // Pipedrive Smartdoc: importerade dokument som redan har en etablerad
  // subCategory från importören. Filnamnet är bara "<namn> <datum> <tid>.pdf",
  // så vi litar på källsystemets klassificering istället för att gissa.
  if (existingSubCategory === 'pipedrive_smartdoc') {
    signals.push('pipedrive_smartdoc');
    return {
      category: 'other',
      subCategory: 'pipedrive_smartdoc',
      documentTitle: 'Smartdoc',
      treatmentType: detectTreatment(haystack),
      confidence: 'medium',
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
  repairMojibake,
  FORM_PATTERNS,
  TREATMENT_PATTERNS,
};
