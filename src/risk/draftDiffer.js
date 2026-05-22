'use strict';

/**
 * Draft Differ — analys av skillnader mellan AI-genererat utkast och
 * slutgiltigt skickad text. Används av Smart Drafting Feedback-loop (Fas 4).
 *
 * Mål: extrahera signaler som kan förbättra framtida AI-genererade utkast:
 *   • Längd-justering (gjorde användaren kortare/längre?)
 *   • Tonjustering (formal → casual eller vice versa?)
 *   • Faktatillägg (datum/pris/namn som lades till?)
 *   • Strukturändringar (lade till hälsningsfras, signatur, frågetecken?)
 *
 * Designprinciper:
 *   • Ren JS, inga externa beroenden
 *   • Token-baserad diff (inte char-level — för snabbt + meningsfull output)
 *   • Returnerar strukturerad analys, inte bara en raw diff
 */

function normalizeText(value) {
  return typeof value === 'string' ? value : '';
}

function tokenize(text) {
  return normalizeText(text)
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\b/)
    .filter((t) => t.length > 0);
}

function wordCount(text) {
  return tokenize(text).filter((t) => /\w/.test(t)).length;
}

function sentenceCount(text) {
  const safe = normalizeText(text).trim();
  if (!safe) return 0;
  return (safe.match(/[.!?]+(?=\s|$)/g) || []).length;
}

function detectFormalityShift(originalDraft, editedDraft) {
  const original = normalizeText(originalDraft).toLowerCase();
  const edited = normalizeText(editedDraft).toLowerCase();

  // Markörer för formellt språk (svenska + engelska)
  const FORMAL_MARKERS = [
    'bästa', 'vänliga hälsningar', 'med vänlig', 'mvh', 'sincerely',
    'kind regards', 'dear', 'tack på förhand', 'vi tar gärna emot',
  ];
  // Markörer för informellt
  const CASUAL_MARKERS = [
    'hej!', 'hejsan', 'hej hej', 'tjena', 'hi!', 'hey', 'cheers', 'thanks!',
    'jätte', 'super', 'awesome', 'kul!', 'tack!',
  ];

  const countMarkers = (text, markers) =>
    markers.reduce((acc, m) => acc + (text.includes(m) ? 1 : 0), 0);

  const origFormal = countMarkers(original, FORMAL_MARKERS);
  const origCasual = countMarkers(original, CASUAL_MARKERS);
  const editFormal = countMarkers(edited, FORMAL_MARKERS);
  const editCasual = countMarkers(edited, CASUAL_MARKERS);

  const origScore = origFormal - origCasual;
  const editScore = editFormal - editCasual;

  if (editScore > origScore + 1) return 'more_formal';
  if (editScore < origScore - 1) return 'more_casual';
  return 'unchanged';
}

function diffTokens(original, edited) {
  // LCS-based diff för token-arrays
  const a = tokenize(original);
  const b = tokenize(edited);
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return { added: [], removed: [], common: 0 };
  if (m === 0) return { added: b, removed: [], common: 0 };
  if (n === 0) return { added: [], removed: a, common: 0 };

  // För prestanda: cap LCS-tabell vid 1000x1000
  const cappedM = Math.min(m, 1000);
  const cappedN = Math.min(n, 1000);
  const dp = Array.from({ length: cappedM + 1 }, () => new Array(cappedN + 1).fill(0));
  for (let i = 1; i <= cappedM; i++) {
    for (let j = 1; j <= cappedN; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const added = [];
  const removed = [];
  let i = cappedM;
  let j = cappedN;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      removed.unshift(a[i - 1]);
      i--;
    } else {
      added.unshift(b[j - 1]);
      j--;
    }
  }
  while (i > 0) removed.unshift(a[--i]);
  while (j > 0) added.unshift(b[--j]);

  return { added, removed, common: dp[cappedM][cappedN] };
}

function detectFactAdditions(originalDraft, editedDraft) {
  // Återanvänd guardrails-mönster: tider, datum, priser, telefoner
  const TIME_RE = /\b([01]?\d|2[0-3])[:\.][0-5]\d\b/g;
  const ISO_DATE_RE = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;
  const PRICE_RE = /\b\d{1,6}\s*(?:kr|sek|kronor)\b/gi;

  const findAll = (text, re) => {
    const set = new Set();
    for (const m of normalizeText(text).matchAll(re)) {
      set.add(m[0].toLowerCase().trim());
    }
    return set;
  };

  const origTimes = findAll(originalDraft, TIME_RE);
  const editTimes = findAll(editedDraft, TIME_RE);
  const origDates = findAll(originalDraft, ISO_DATE_RE);
  const editDates = findAll(editedDraft, ISO_DATE_RE);
  const origPrices = findAll(originalDraft, PRICE_RE);
  const editPrices = findAll(editedDraft, PRICE_RE);

  const addedTimes = [...editTimes].filter((t) => !origTimes.has(t));
  const removedTimes = [...origTimes].filter((t) => !editTimes.has(t));
  const addedDates = [...editDates].filter((d) => !origDates.has(d));
  const removedDates = [...origDates].filter((d) => !editDates.has(d));
  const addedPrices = [...editPrices].filter((p) => !origPrices.has(p));
  const removedPrices = [...origPrices].filter((p) => !editPrices.has(p));

  return {
    addedTimes, removedTimes,
    addedDates, removedDates,
    addedPrices, removedPrices,
  };
}

/**
 * Bygg en strukturerad feedback-rapport från diff mellan original och redigerad text.
 *
 * @returns {{
 *   diffStats: { addedTokens, removedTokens, commonTokens, lengthChangeRatio },
 *   wordCounts: { original, edited, delta },
 *   sentenceCounts: { original, edited, delta },
 *   formalityShift: 'more_formal' | 'more_casual' | 'unchanged',
 *   factChanges: {...},
 *   classifications: string[],   // ['shortened', 'tone_more_casual', ...]
 *   learnings: string[],          // mänskliga sammanfattningar
 *   identicalDraft: boolean,      // true om ingen ändring gjordes
 * }}
 */
function buildDiffReport({ originalDraft = '', editedDraft = '' } = {}) {
  const orig = normalizeText(originalDraft);
  const edit = normalizeText(editedDraft);

  const tokenDiff = diffTokens(orig, edit);
  const origWords = wordCount(orig);
  const editWords = wordCount(edit);
  const wordDelta = editWords - origWords;
  const lengthRatio = origWords > 0 ? editWords / origWords : 1;
  const formalityShift = detectFormalityShift(orig, edit);
  const factChanges = detectFactAdditions(orig, edit);

  const classifications = [];
  const learnings = [];

  const identical = orig.trim() === edit.trim();
  if (identical) {
    classifications.push('accepted_unchanged');
    learnings.push('Användaren accepterade utkastet utan ändringar.');
  } else {
    if (lengthRatio < 0.7) {
      classifications.push('shortened');
      learnings.push(`Användaren förkortade utkastet med ${Math.round((1 - lengthRatio) * 100)}%.`);
    } else if (lengthRatio > 1.4) {
      classifications.push('lengthened');
      learnings.push(`Användaren utvidgade utkastet med ${Math.round((lengthRatio - 1) * 100)}%.`);
    }
    if (formalityShift !== 'unchanged') {
      classifications.push('tone_' + formalityShift);
      learnings.push(
        formalityShift === 'more_formal'
          ? 'Användaren gjorde tonen mer formell.'
          : 'Användaren gjorde tonen mer informell.'
      );
    }
    if (factChanges.addedTimes.length > 0) {
      classifications.push('added_time');
      learnings.push(`Användaren lade till tid: ${factChanges.addedTimes.join(', ')}.`);
    }
    if (factChanges.addedDates.length > 0) {
      classifications.push('added_date');
      learnings.push(`Användaren lade till datum: ${factChanges.addedDates.join(', ')}.`);
    }
    if (factChanges.addedPrices.length > 0) {
      classifications.push('added_price');
      learnings.push(`Användaren lade till pris: ${factChanges.addedPrices.join(', ')}.`);
    }
    if (factChanges.removedTimes.length > 0) {
      classifications.push('removed_time');
      learnings.push(`Användaren tog bort tid: ${factChanges.removedTimes.join(', ')}.`);
    }
    if (factChanges.removedPrices.length > 0) {
      classifications.push('removed_price');
      learnings.push(`Användaren tog bort pris: ${factChanges.removedPrices.join(', ')}.`);
    }
    if (classifications.length === 0) {
      classifications.push('minor_edit');
      learnings.push('Mindre redigeringar utan tydlig kategori.');
    }
  }

  return {
    diffStats: {
      addedTokens: tokenDiff.added.length,
      removedTokens: tokenDiff.removed.length,
      commonTokens: tokenDiff.common,
      lengthChangeRatio: Math.round(lengthRatio * 100) / 100,
    },
    wordCounts: { original: origWords, edited: editWords, delta: wordDelta },
    sentenceCounts: {
      original: sentenceCount(orig),
      edited: sentenceCount(edit),
      delta: sentenceCount(edit) - sentenceCount(orig),
    },
    formalityShift,
    factChanges,
    classifications,
    learnings: learnings.slice(0, 6),
    identicalDraft: identical,
  };
}

module.exports = {
  diffTokens,
  detectFormalityShift,
  detectFactAdditions,
  buildDiffReport,
  wordCount,
  sentenceCount,
};
