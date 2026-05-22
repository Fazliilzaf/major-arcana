'use strict';

/**
 * AI Guardrails — hallucinationsskydd för AI-genererade outputs.
 *
 * Detekterar när AI-text introducerar fakta (priser, datum, tider, telefoner,
 * mejladresser, medicinska påståenden) som inte finns i source-materialet.
 *
 * Designprinciper:
 *   • Vi blockerar inte AI-outputen — vi MARKERAR misstänkta fakta som ej
 *     verifierade. Användaren kan fortfarande använda outputen, men med
 *     full transparens om vad som inte är källbelagt.
 *   • Strikt regex-baserad fakta-extraktion. Inga LLM-baserade kontroller
 *     (skulle introducera samma hallucinationsrisk).
 *   • Numeriska jämförelser för priser och tider tillåter normalisering
 *     ("1 500 kr" ≈ "1500 kr"; "14:30" ≈ "14.30").
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const MEDICAL_TERM_PATTERNS = [
  /\b(?:diagnos|recept|läkemedel|medicin|biverkning|kontraindikation|dosering|symptom|behandling|operation|kirurgi|injektion|infektion|inflammation|allergi|graviditet|cancer|tumör|stroke|hjärtinfarkt|blödning|smärta)\b/i,
];

const URGENT_PATTERNS = [
  /\b(?:akut|nödfall|brådskande|livshotande|sjukhus|ambulans|112|911)\b/i,
];

// Extraherar normaliserade fakta-tokens från en text
function extractFacts(text) {
  const safe = normalizeText(text);
  const out = {
    times: new Set(),
    dates: new Set(),
    prices: new Set(),
    phones: new Set(),
    emails: new Set(),
    urls: new Set(),
    medical: false,
    urgent: false,
  };
  if (!safe) return out;

  // Tider: HH:MM eller HH.MM
  for (const m of safe.matchAll(/\b([01]?\d|2[0-3])[:\.][0-5]\d\b/g)) {
    out.times.add(m[0].replace('.', ':'));
  }

  // ISO-datum 2026-04-28
  for (const m of safe.matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)) {
    out.dates.add(m[0]);
  }
  // Kort: 28/4, 28.4.2026
  const isoSpans = [];
  for (const m of safe.matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)) {
    isoSpans.push({ start: m.index, end: m.index + m[0].length });
  }
  for (const m of safe.matchAll(/(?<!\d)\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?(?!\d)/g)) {
    const start = m.index;
    const end = start + m[0].length;
    const insideIso = isoSpans.some((iso) => start >= iso.start && end <= iso.end);
    if (!insideIso) out.dates.add(m[0]);
  }

  // Priser: "1 500 kr", "1500 kr", "29.000 SEK"
  for (const m of safe.matchAll(/\b(\d{1,3}(?:[\s.]\d{3})*|\d+)\s*(?:kr|sek|kronor)\b/gi)) {
    const numeric = m[1].replace(/[\s.]/g, '');
    out.prices.add(numeric); // lagra normaliserat (bara siffror)
  }

  // Telefonnummer: 08-123 45 67, +46 70 123 45 67, 070-1234567
  for (const m of safe.matchAll(/\+?\d[\d\s\-]{6,}\d/g)) {
    const compact = m[0].replace(/[\s\-]/g, '');
    if (compact.length >= 7 && compact.length <= 15) {
      out.phones.add(compact);
    }
  }

  // Mejladresser
  for (const m of safe.matchAll(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi)) {
    out.emails.add(m[0].toLowerCase());
  }

  // URLs
  for (const m of safe.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    out.urls.add(m[0].toLowerCase().replace(/[.,;)]+$/, ''));
  }

  // Medicinska termer
  for (const pattern of MEDICAL_TERM_PATTERNS) {
    if (pattern.test(safe)) {
      out.medical = true;
      break;
    }
  }
  for (const pattern of URGENT_PATTERNS) {
    if (pattern.test(safe)) {
      out.urgent = true;
      break;
    }
  }

  return out;
}

function unionFacts(factSets) {
  const merged = {
    times: new Set(),
    dates: new Set(),
    prices: new Set(),
    phones: new Set(),
    emails: new Set(),
    urls: new Set(),
    medical: false,
    urgent: false,
  };
  for (const facts of asArray(factSets)) {
    if (!facts) continue;
    for (const t of facts.times || []) merged.times.add(t);
    for (const d of facts.dates || []) merged.dates.add(d);
    for (const p of facts.prices || []) merged.prices.add(p);
    for (const ph of facts.phones || []) merged.phones.add(ph);
    for (const e of facts.emails || []) merged.emails.add(e);
    for (const u of facts.urls || []) merged.urls.add(u);
    merged.medical = merged.medical || !!facts.medical;
    merged.urgent = merged.urgent || !!facts.urgent;
  }
  return merged;
}

/**
 * Hitta fakta i `outputText` som INTE finns i `sourceFacts`.
 *
 * @param {Object} args
 * @param {string} args.outputText  - AI:s genererade text
 * @param {Array<string>} args.sourceTexts  - originalmaterial (mejl, dokument)
 * @returns {Object} { passed, violations: [{type, value, severity}], outputFacts, sourceFacts }
 */
function detectFabricatedFacts({ outputText, sourceTexts = [] } = {}) {
  const outputFacts = extractFacts(outputText);
  const sourceFactList = asArray(sourceTexts).map((t) => extractFacts(t));
  const sourceFacts = unionFacts(sourceFactList);

  const violations = [];

  // Tider — helt nya tider i output får inte hittas på
  for (const time of outputFacts.times) {
    if (!sourceFacts.times.has(time)) {
      violations.push({
        type: 'time',
        value: time,
        severity: 'high',
        message: `Tiden "${time}" finns inte i källan.`,
      });
    }
  }

  // Datum
  for (const date of outputFacts.dates) {
    if (!sourceFacts.dates.has(date)) {
      violations.push({
        type: 'date',
        value: date,
        severity: 'high',
        message: `Datumet "${date}" finns inte i källan.`,
      });
    }
  }

  // Priser — strikt: ny prisnivå får inte påhittas
  for (const price of outputFacts.prices) {
    if (!sourceFacts.prices.has(price)) {
      violations.push({
        type: 'price',
        value: price + ' kr',
        severity: 'high',
        message: `Priset "${price} kr" finns inte i källan.`,
      });
    }
  }

  // Telefonnummer — superkritiskt om AI kompositerar nummer
  for (const phone of outputFacts.phones) {
    if (!sourceFacts.phones.has(phone)) {
      violations.push({
        type: 'phone',
        value: phone,
        severity: 'critical',
        message: `Telefonnumret "${phone}" finns inte i källan.`,
      });
    }
  }

  // Mejladresser
  for (const email of outputFacts.emails) {
    if (!sourceFacts.emails.has(email)) {
      violations.push({
        type: 'email',
        value: email,
        severity: 'high',
        message: `Mejladressen "${email}" finns inte i källan.`,
      });
    }
  }

  // Medicinska påståenden — varna om AI introducerar medicinsk terminologi
  // som inte finns i källan (kunden tog inte upp det).
  if (outputFacts.medical && !sourceFacts.medical) {
    violations.push({
      type: 'medical',
      value: 'medicinsk terminologi',
      severity: 'critical',
      message:
        'AI-output innehåller medicinsk terminologi (t.ex. diagnos/läkemedel/behandling) som inte fanns i källan.',
    });
  }

  // Akuta påståenden
  if (outputFacts.urgent && !sourceFacts.urgent) {
    violations.push({
      type: 'urgent',
      value: 'akut/nödfall-formulering',
      severity: 'critical',
      message: 'AI-output använder akut/nödfall-språk som inte fanns i källan.',
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    outputFacts,
    sourceFacts,
  };
}

/**
 * Returnerar en sammanfattande "verified-status" lämplig för UI:
 *  • verified: true  — inga violations
 *  • verified: false — minst en violation
 *  • severity        — högsta sett (none/low/high/critical)
 *  • shortLabel      — "Verifierad" / "Ej verifierad"
 */
function buildGuardrailReport({ outputText, sourceTexts = [] } = {}) {
  const result = detectFabricatedFacts({ outputText, sourceTexts });
  const severity = result.violations.reduce((acc, v) => {
    const order = { none: 0, low: 1, high: 2, critical: 3 };
    return order[v.severity] > order[acc] ? v.severity : acc;
  }, 'none');
  return {
    verified: result.passed,
    severity,
    shortLabel: result.passed ? 'Verifierad' : 'Ej verifierad',
    violations: result.violations,
    violationCount: result.violations.length,
  };
}

/**
 * Markera misstänkta fakta i output-text med [⚠ ej verifierat]-suffix.
 * Använd när du vill BEHÅLLA outputen men varna användaren inline.
 */
function annotateUnverifiedFacts({ outputText, sourceTexts = [] } = {}) {
  const result = detectFabricatedFacts({ outputText, sourceTexts });
  if (result.passed) return outputText;

  let annotated = outputText;
  const seen = new Set();
  for (const violation of result.violations) {
    const v = violation.value;
    if (!v || seen.has(v)) continue;
    seen.add(v);
    // Söker EXAKT match (inte regex eftersom v kan innehålla specialtecken)
    if (typeof annotated === 'string' && annotated.includes(v)) {
      annotated = annotated.split(v).join(`${v} [⚠ ej verifierat]`);
    }
  }
  return annotated;
}

module.exports = {
  extractFacts,
  unionFacts,
  detectFabricatedFacts,
  buildGuardrailReport,
  annotateUnverifiedFacts,
};
