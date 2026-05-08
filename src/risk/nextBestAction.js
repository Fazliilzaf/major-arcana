'use strict';

/**
 * Next-Best-Action — recommendation engine för CCO-trådar.
 *
 * Tar signaler från sentiment + intent + språk + tråd-historik och föreslår
 * en primär åtgärd med 1-2 sekundära alternativ.
 *
 * Designprinciper:
 *   • Pure JS, deterministic — samma input → samma output (testbart)
 *   • Regelbaserad prioritering: urgent > complaint > medical > intent-baserat
 *   • Returnerar reasoning-array så användaren ser VARFÖR vi föreslår just detta
 *   • Confidence-score reflekterar regel-styrkan + signal-styrkan
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

const ACTION_DEFINITIONS = Object.freeze({
  escalate_medical: {
    code: 'escalate_medical',
    label: 'Eskalera medicinskt',
    icon: '🩺',
    primaryButton: 'Eskalera medicinskt',
    description: 'Akut/oroväckande signaler — koppla till medicinsk personal direkt.',
  },
  escalate_complaint: {
    code: 'escalate_complaint',
    label: 'Eskalera klagomål',
    icon: '⚠️',
    primaryButton: 'Eskalera till chef',
    description: 'Klagomål — bör hanteras av klinikchef innan svar går ut.',
  },
  reply_with_empathy: {
    code: 'reply_with_empathy',
    label: 'Svara med empati + lugnande info',
    icon: '🤝',
    primaryButton: 'Skriv lugnande svar',
    description: 'Kunden visar oro/anxiety — börja med empati innan information.',
  },
  reply_with_booking_suggestion: {
    code: 'reply_with_booking_suggestion',
    label: 'Föreslå tider för bokning',
    icon: '📅',
    primaryButton: 'Föreslå tider',
    description: 'Kunden vill boka — föreslå konkreta datum/tider.',
  },
  reply_with_pricing: {
    code: 'reply_with_pricing',
    label: 'Skicka prislista / pris-info',
    icon: '💰',
    primaryButton: 'Skicka pris-info',
    description: 'Kunden frågar om pris — bifoga prislista eller länk till priser.',
  },
  confirm_cancellation: {
    code: 'confirm_cancellation',
    label: 'Bekräfta avbokning + erbjud nytt datum',
    icon: '🚫',
    primaryButton: 'Bekräfta + erbjud ny tid',
    description: 'Kunden avbokar — bekräfta + öppna dörr för ombokning.',
  },
  send_reminder: {
    code: 'send_reminder',
    label: 'Skicka påminnelse',
    icon: '🔔',
    primaryButton: 'Skicka påminnelse',
    description: 'Vi väntar på kunden — skicka vänlig påminnelse.',
  },
  mark_handled: {
    code: 'mark_handled',
    label: 'Markera som klar',
    icon: '✅',
    primaryButton: 'Markera klar',
    description: 'Tråden är slutförd — markera som hanterad.',
  },
  schedule_followup: {
    code: 'schedule_followup',
    label: 'Schemalägg uppföljning',
    icon: '📌',
    primaryButton: 'Schemalägg uppföljning',
    description: 'Behöver uppföljning senare — skapa påminnelse.',
  },
  ask_clarification: {
    code: 'ask_clarification',
    label: 'Be om förtydligande',
    icon: '❓',
    primaryButton: 'Be om förtydligande',
    description: 'Oklart vad kunden vill — be om mer information.',
  },
  await_response: {
    code: 'await_response',
    label: 'Vänta på svar',
    icon: '⏳',
    primaryButton: 'Inget att göra ännu',
    description: 'Vi har skickat senast — invänta kundens svar.',
  },
});

function action(code, { confidence = 0.7, reasoning = [], extras = {} } = {}) {
  const def = ACTION_DEFINITIONS[code];
  if (!def) return null;
  return {
    code: def.code,
    label: def.label,
    icon: def.icon,
    primaryButton: def.primaryButton,
    description: def.description,
    confidence: clamp(confidence),
    reasoning: asArray(reasoning).slice(0, 5),
    ...extras,
  };
}

function getThreadDirectionStats(messages = []) {
  const safeMessages = asArray(messages);
  let inbound = 0;
  let outbound = 0;
  let lastDirection = '';
  let lastTs = 0;
  for (const msg of safeMessages) {
    const dir = String(msg?.direction || 'inbound').toLowerCase();
    const ts = Date.parse(String(msg?.sentAt || msg?.recordedAt || ''));
    if (dir === 'outbound') outbound += 1;
    else inbound += 1;
    if (Number.isFinite(ts) && ts > lastTs) {
      lastTs = ts;
      lastDirection = dir;
    }
  }
  const ageMs = lastTs > 0 ? Date.now() - lastTs : 0;
  return { inbound, outbound, lastDirection, lastTs, ageMs };
}

/**
 * Beräkna nästa-bästa-åtgärd baserat på sentiment + intent + tråd-tillstånd.
 *
 * @param {Object} args
 * @param {Object} args.sentiment   — { code, confidence }
 * @param {Object} args.intent      — { code, confidence }
 * @param {Array}  args.messages    — meddelanden i tråden
 * @param {Object} args.detectedLanguage — { primary }
 * @returns {Object} primaryAction + secondaryActions + topLevelReasoning
 */
function recommendNextBestAction({
  sentiment = null,
  intent = null,
  messages = [],
  detectedLanguage = null,
} = {}) {
  const sentimentCode = sentiment?.code || 'unknown';
  const intentCode = intent?.code || 'unclear';
  const stats = getThreadDirectionStats(messages);
  const reasoning = [];
  const candidates = [];

  // 1. URGENT eller medicinsk akut → eskalera direkt
  if (sentimentCode === 'urgent') {
    reasoning.push('Kunden använder akut/nödfall-formulering.');
    return {
      primaryAction: action('escalate_medical', {
        confidence: 0.95,
        reasoning: [...reasoning, 'Får inte hanteras av AI utan mänsklig granskning.'],
      }),
      secondaryActions: [
        action('reply_with_empathy', { confidence: 0.6 }),
      ].filter(Boolean),
      topLevelReasoning: reasoning,
    };
  }

  // 2. Klagomål → eskalera till klinikchef
  if (intentCode === 'complaint') {
    reasoning.push('Tråden klassificeras som klagomål.');
    if (sentimentCode === 'negative' || sentimentCode === 'anxious') {
      reasoning.push(`Förstärkt av negativ/orolig stämning (${sentimentCode}).`);
    }
    return {
      primaryAction: action('escalate_complaint', {
        confidence: 0.9,
        reasoning: [...reasoning, 'Klinikchefen bör läsa tråden innan svar.'],
      }),
      secondaryActions: [
        action('reply_with_empathy', { confidence: 0.5 }),
      ].filter(Boolean),
      topLevelReasoning: reasoning,
    };
  }

  // 3. Anxiety inför behandling → empatiskt svar
  if (intentCode === 'anxiety_pre_op' || sentimentCode === 'anxious') {
    reasoning.push(
      sentimentCode === 'anxious'
        ? 'Kunden visar tydlig oro i tonen.'
        : 'Tråden klassificeras som "orolig inför behandling".'
    );
    candidates.push(
      action('reply_with_empathy', {
        confidence: 0.85,
        reasoning: [...reasoning, 'Börja med empati innan information.'],
      })
    );
    if (intentCode === 'booking_request') {
      candidates.push(
        action('reply_with_booking_suggestion', {
          confidence: 0.6,
          reasoning: ['Kunden vill också boka tid.'],
        })
      );
    }
    return {
      primaryAction: candidates[0],
      secondaryActions: candidates.slice(1),
      topLevelReasoning: reasoning,
    };
  }

  // 4. Avbokning → bekräfta + erbjud ny tid
  if (intentCode === 'cancellation') {
    reasoning.push('Kunden vill avboka.');
    return {
      primaryAction: action('confirm_cancellation', {
        confidence: 0.85,
        reasoning: [...reasoning, 'Bekräfta + öppna dörr för omboking.'],
      }),
      secondaryActions: [
        action('mark_handled', { confidence: 0.5 }),
      ].filter(Boolean),
      topLevelReasoning: reasoning,
    };
  }

  // 5. Bokningsförfrågan → föreslå tider
  if (intentCode === 'booking_request') {
    reasoning.push('Kunden vill boka tid.');
    if (sentimentCode === 'positive') {
      reasoning.push('Positiv stämning — säker att gå direkt på förslag.');
    }
    return {
      primaryAction: action('reply_with_booking_suggestion', {
        confidence: sentimentCode === 'positive' ? 0.92 : 0.85,
        reasoning,
      }),
      secondaryActions: [
        action('schedule_followup', { confidence: 0.4 }),
      ].filter(Boolean),
      topLevelReasoning: reasoning,
    };
  }

  // 6. Pris-fråga → skicka prislista
  if (intentCode === 'pricing_question') {
    reasoning.push('Kunden frågar om pris.');
    return {
      primaryAction: action('reply_with_pricing', {
        confidence: 0.88,
        reasoning,
      }),
      secondaryActions: [
        action('reply_with_booking_suggestion', { confidence: 0.55 }),
      ].filter(Boolean),
      topLevelReasoning: reasoning,
    };
  }

  // 7. Follow-up intent → schemalägg eller markera klar
  if (intentCode === 'follow_up') {
    reasoning.push('Tråden klassificeras som uppföljning.');
    return {
      primaryAction: action('mark_handled', {
        confidence: 0.7,
        reasoning,
      }),
      secondaryActions: [
        action('schedule_followup', { confidence: 0.5 }),
      ].filter(Boolean),
      topLevelReasoning: reasoning,
    };
  }

  // 8. Vi skickade senast + kund inte svarat på 3+ dagar → påminnelse
  if (stats.lastDirection === 'outbound' && stats.outbound > 0) {
    const ageDays = stats.ageMs / (24 * 60 * 60 * 1000);
    reasoning.push('Vi skickade senast meddelandet.');
    if (ageDays > 3) {
      reasoning.push(`Kund har inte svarat på ${Math.round(ageDays)} dagar.`);
      return {
        primaryAction: action('send_reminder', {
          confidence: 0.75,
          reasoning,
        }),
        secondaryActions: [
          action('mark_handled', { confidence: 0.4 }),
        ].filter(Boolean),
        topLevelReasoning: reasoning,
      };
    }
    return {
      primaryAction: action('await_response', {
        confidence: 0.6,
        reasoning: [...reasoning, `Bara ${Math.round(ageDays)} dagar sedan — ge kund tid att svara.`],
      }),
      secondaryActions: [],
      topLevelReasoning: reasoning,
    };
  }

  // 9. Unclear → be om förtydligande
  if (intentCode === 'unclear') {
    reasoning.push('Oklart vad kunden vill.');
    return {
      primaryAction: action('ask_clarification', {
        confidence: 0.55,
        reasoning,
      }),
      secondaryActions: [],
      topLevelReasoning: reasoning,
    };
  }

  // 10. Default-fallback
  return {
    primaryAction: action('ask_clarification', {
      confidence: 0.3,
      reasoning: ['Inga starka signaler — be om förtydligande.'],
    }),
    secondaryActions: [],
    topLevelReasoning: ['Inga matchande regler.'],
  };
}

module.exports = {
  ACTION_DEFINITIONS,
  recommendNextBestAction,
  getThreadDirectionStats,
};
