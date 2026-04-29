'use strict';

/**
 * Anomaly Detection — varnar när en kund avviker från sitt mönster.
 *
 * V1: Intra-thread analys. Bygger en baseline från tidigare meddelanden i
 * tråden och jämför mot senaste kund-meddelandet/meddelandena.
 *
 * Detekterade anomali-typer:
 *   • unusual_negative_tone   — sentiment skifte positivt → negativt
 *   • unusual_anxious_tone    — plötsligt orolig efter neutral/positiv historik
 *   • escalating_urgency      — akut-språk dyker upp för första gången
 *   • cancellation_pattern    — flera avbokningar/cancellation-signaler
 *   • silent_period           — tråden återupptas efter >14 dagars tystnad
 *   • high_message_burst      — kund skickar många meddelanden på kort tid
 *   • repeated_question       — kund upprepar samma fråga (frustration-signal)
 *
 * Designprinciper:
 *   • Pure JS, deterministic
 *   • Confidence + severity per anomali
 *   • Returnerar tom array om ingenting avviker (vanligast)
 *   • Tröskelvärden konfigurerbara via options
 */

const { detectSentiment } = require('./sentimentDetect');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const ANOMALY_DEFINITIONS = Object.freeze({
  unusual_negative_tone: {
    label: 'Ovanligt negativ ton',
    severity: 'high',
    icon: '⚠️',
  },
  unusual_anxious_tone: {
    label: 'Plötslig oro',
    severity: 'medium',
    icon: '😰',
  },
  escalating_urgency: {
    label: 'Eskalerande brådska',
    severity: 'high',
    icon: '🚨',
  },
  cancellation_pattern: {
    label: 'Avbokningsmönster',
    severity: 'medium',
    icon: '🚫',
  },
  silent_period: {
    label: 'Återupptagen tråd efter tystnad',
    severity: 'low',
    icon: '⏰',
  },
  high_message_burst: {
    label: 'Snabb meddelandesvit',
    severity: 'medium',
    icon: '📨',
  },
  repeated_question: {
    label: 'Upprepad fråga',
    severity: 'medium',
    icon: '🔁',
  },
});

function buildAnomaly(code, { confidence = 0.7, message = '', evidence = [] } = {}) {
  const def = ANOMALY_DEFINITIONS[code];
  if (!def) return null;
  return {
    code,
    label: def.label,
    severity: def.severity,
    icon: def.icon,
    confidence: clamp(confidence, 0, 1),
    message: normalizeText(message) || def.label,
    evidence: asArray(evidence).slice(0, 4),
  };
}

function inboundOnly(messages) {
  return asArray(messages).filter(
    (m) => String(m?.direction || 'inbound').toLowerCase() !== 'outbound'
  );
}

function detectSentimentTrend(messages) {
  const inbound = inboundOnly(messages);
  if (inbound.length < 2) return null;
  const half = Math.max(1, Math.floor(inbound.length / 2));
  const baseline = inbound.slice(0, half);
  const recent = inbound.slice(half);

  const sentimentScore = (msgs) => {
    let pos = 0;
    let neg = 0;
    let anxious = 0;
    for (const m of msgs) {
      const text = normalizeText(m?.body || m?.bodyPreview || m?.text);
      if (!text) continue;
      const r = detectSentiment(text);
      if (r.sentiment === 'positive') pos += 1;
      if (r.sentiment === 'negative') neg += 1;
      if (r.sentiment === 'anxious') anxious += 1;
    }
    return { pos, neg, anxious, count: msgs.length };
  };
  return {
    baseline: sentimentScore(baseline),
    recent: sentimentScore(recent),
  };
}

function detectCancellationPattern(messages) {
  const cancellationMarkers = [
    'avboka', 'avbokar', 'avbokat', 'kan inte komma', 'måste flytta',
    'cancel', 'reschedule',
  ];
  const inbound = inboundOnly(messages);
  let hits = 0;
  const evidence = [];
  for (const m of inbound) {
    const text = normalizeText(m?.body || m?.bodyPreview || m?.text).toLowerCase();
    for (const marker of cancellationMarkers) {
      if (text.includes(marker)) {
        hits += 1;
        evidence.push(text.slice(0, 80));
        break;
      }
    }
  }
  return { hits, evidence: evidence.slice(0, 3) };
}

function detectUrgencyEscalation(messages) {
  const urgentMarkers = [
    'akut', 'brådskande', 'nödfall', 'omedelbart', 'genast',
    'urgent', 'emergency', 'asap', 'now',
  ];
  const inbound = inboundOnly(messages);
  if (inbound.length < 2) return null;

  const half = Math.max(1, Math.floor(inbound.length / 2));
  const baselineHasUrgent = inbound.slice(0, half).some((m) => {
    const text = normalizeText(m?.body || m?.bodyPreview || m?.text).toLowerCase();
    return urgentMarkers.some((mk) => text.includes(mk));
  });
  const recentUrgentMessages = inbound.slice(half).filter((m) => {
    const text = normalizeText(m?.body || m?.bodyPreview || m?.text).toLowerCase();
    return urgentMarkers.some((mk) => text.includes(mk));
  });
  if (baselineHasUrgent || recentUrgentMessages.length === 0) return null;
  return {
    appearsForFirstTime: true,
    matches: recentUrgentMessages.length,
  };
}

function detectSilentPeriod(messages, { thresholdDays = 14 } = {}) {
  const inbound = inboundOnly(messages);
  if (inbound.length < 2) return null;
  const sortedByTime = inbound
    .map((m) => ({
      ts: Date.parse(String(m?.sentAt || m?.recordedAt || '')),
      text: normalizeText(m?.body || m?.bodyPreview || m?.text),
    }))
    .filter((entry) => Number.isFinite(entry.ts))
    .sort((a, b) => a.ts - b.ts);
  if (sortedByTime.length < 2) return null;
  let maxGapMs = 0;
  let gapInfo = null;
  for (let i = 1; i < sortedByTime.length; i++) {
    const gap = sortedByTime[i].ts - sortedByTime[i - 1].ts;
    if (gap > maxGapMs) {
      maxGapMs = gap;
      gapInfo = {
        beforeText: sortedByTime[i - 1].text.slice(0, 60),
        afterText: sortedByTime[i].text.slice(0, 60),
      };
    }
  }
  const gapDays = maxGapMs / (24 * 60 * 60 * 1000);
  if (gapDays < thresholdDays) return null;
  return { gapDays: Math.round(gapDays), gapInfo };
}

function detectMessageBurst(messages, { burstWindowMs = 10 * 60 * 1000, minMessagesInBurst = 4 } = {}) {
  const inbound = inboundOnly(messages);
  if (inbound.length < minMessagesInBurst) return null;
  const tsList = inbound
    .map((m) => Date.parse(String(m?.sentAt || m?.recordedAt || '')))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (tsList.length < minMessagesInBurst) return null;
  // Sliding window
  let maxBurst = 0;
  let burstStart = 0;
  let i = 0;
  for (let j = 0; j < tsList.length; j++) {
    while (tsList[j] - tsList[i] > burstWindowMs) i += 1;
    const inWindow = j - i + 1;
    if (inWindow > maxBurst) {
      maxBurst = inWindow;
      burstStart = i;
    }
  }
  if (maxBurst < minMessagesInBurst) return null;
  return {
    count: maxBurst,
    spanMinutes: Math.round((tsList[burstStart + maxBurst - 1] - tsList[burstStart]) / 60000),
  };
}

function detectRepeatedQuestion(messages) {
  const inbound = inboundOnly(messages);
  if (inbound.length < 2) return null;
  // Hitta meddelanden med frågetecken och jämför token-overlap
  const questions = inbound
    .map((m) => normalizeText(m?.body || m?.bodyPreview || m?.text))
    .filter((t) => t.includes('?'))
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  if (questions.length < 2) return null;

  let maxOverlap = 0;
  let pair = null;
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const setA = new Set(questions[i]);
      const setB = new Set(questions[j]);
      let overlap = 0;
      for (const w of setA) if (setB.has(w)) overlap += 1;
      const ratio = overlap / Math.max(1, Math.min(setA.size, setB.size));
      if (ratio > maxOverlap) {
        maxOverlap = ratio;
        pair = [i, j];
      }
    }
  }
  if (maxOverlap < 0.5) return null;
  return { overlapRatio: Math.round(maxOverlap * 100) / 100, pair };
}

/**
 * Huvud-API: kör alla detektorer mot en messages-lista och returnera anomalies.
 *
 * @returns {{ anomalies: Array, totalScore: number, severityCounts: { low, medium, high } }}
 */
function detectAnomalies(messages = [], options = {}) {
  const safeMessages = asArray(messages);
  const anomalies = [];

  // Sentiment-trend: positiv → negativ eller neutral → orolig
  const trend = detectSentimentTrend(safeMessages);
  if (trend) {
    const baselineNegRatio = trend.baseline.count
      ? trend.baseline.neg / trend.baseline.count
      : 0;
    const recentNegRatio = trend.recent.count
      ? trend.recent.neg / trend.recent.count
      : 0;
    if (baselineNegRatio < 0.2 && recentNegRatio >= 0.5) {
      anomalies.push(
        buildAnomaly('unusual_negative_tone', {
          confidence: Math.min(1, recentNegRatio),
          message: 'Tonen har skiftat till markant mer negativ jämfört med tidigare i tråden.',
          evidence: [`Tidigare: ${trend.baseline.neg}/${trend.baseline.count} negativa`,
                     `Senare: ${trend.recent.neg}/${trend.recent.count} negativa`],
        })
      );
    }
    const baselineAnxRatio = trend.baseline.count
      ? trend.baseline.anxious / trend.baseline.count
      : 0;
    const recentAnxRatio = trend.recent.count
      ? trend.recent.anxious / trend.recent.count
      : 0;
    if (baselineAnxRatio < 0.2 && recentAnxRatio >= 0.5) {
      anomalies.push(
        buildAnomaly('unusual_anxious_tone', {
          confidence: Math.min(1, recentAnxRatio),
          message: 'Kunden visar plötslig oro efter tidigare neutralt/positivt tonläge.',
          evidence: [`Tidigare oroliga: ${trend.baseline.anxious}/${trend.baseline.count}`,
                     `Senare oroliga: ${trend.recent.anxious}/${trend.recent.count}`],
        })
      );
    }
  }

  // Eskalerande brådska
  const urgency = detectUrgencyEscalation(safeMessages);
  if (urgency) {
    anomalies.push(
      buildAnomaly('escalating_urgency', {
        confidence: 0.85,
        message: 'Akut-språk dyker upp för första gången sent i tråden.',
        evidence: [`${urgency.matches} senare meddelande(n) med akut-formulering`],
      })
    );
  }

  // Avbokningsmönster
  const cancel = detectCancellationPattern(safeMessages);
  if (cancel.hits >= 2) {
    anomalies.push(
      buildAnomaly('cancellation_pattern', {
        confidence: Math.min(1, cancel.hits / 3),
        message: `${cancel.hits} avbokningssignaler i tråden.`,
        evidence: cancel.evidence,
      })
    );
  }

  // Tyst period återupptagen
  const silent = detectSilentPeriod(safeMessages);
  if (silent) {
    anomalies.push(
      buildAnomaly('silent_period', {
        confidence: 0.7,
        message: `Tråden återupptas efter ${silent.gapDays} dagars tystnad.`,
        evidence: silent.gapInfo
          ? [`Före: "${silent.gapInfo.beforeText}…"`, `Efter: "${silent.gapInfo.afterText}…"`]
          : [],
      })
    );
  }

  // Burst
  const burst = detectMessageBurst(safeMessages);
  if (burst) {
    anomalies.push(
      buildAnomaly('high_message_burst', {
        confidence: Math.min(1, burst.count / 8),
        message: `${burst.count} meddelanden på ${burst.spanMinutes} min.`,
        evidence: [`Burst-fönster: ${burst.spanMinutes} minuter`],
      })
    );
  }

  // Upprepad fråga
  const repeated = detectRepeatedQuestion(safeMessages);
  if (repeated) {
    anomalies.push(
      buildAnomaly('repeated_question', {
        confidence: repeated.overlapRatio,
        message: `Kunden upprepar samma fråga (${Math.round(repeated.overlapRatio * 100)}% ord-överlapp).`,
        evidence: [`Fråga ${repeated.pair[0] + 1} och ${repeated.pair[1] + 1} har stort ord-överlapp.`],
      })
    );
  }

  // Sammanräknat severity
  const severityCounts = { low: 0, medium: 0, high: 0 };
  let totalScore = 0;
  for (const a of anomalies) {
    if (!a) continue;
    severityCounts[a.severity] = (severityCounts[a.severity] || 0) + 1;
    totalScore += { low: 1, medium: 2, high: 3 }[a.severity] * a.confidence;
  }

  return {
    anomalies: anomalies.filter(Boolean),
    totalScore: Math.round(totalScore * 100) / 100,
    severityCounts,
  };
}

module.exports = {
  ANOMALY_DEFINITIONS,
  detectAnomalies,
  detectSentimentTrend,
  detectCancellationPattern,
  detectUrgencyEscalation,
  detectSilentPeriod,
  detectMessageBurst,
  detectRepeatedQuestion,
};
