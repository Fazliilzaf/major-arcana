'use strict';

/**
 * SummarizeThread — auto-summary av en konversationstråd.
 *
 * Tar tråd-historik (inkluderande avsändare, tidstämplar och kropp) och
 * returnerar en kompakt 3-5 punkts sammanfattning + "vad har hänt sedan
 * senast" om det finns ett `lastVisitedAt`.
 *
 * Strategi:
 *   - Heuristisk fallback (alltid tillgänglig, oberoende av AI-provider)
 *   - OpenAI-path om config.aiProvider === 'openai' (annars hoppas över)
 *
 * Designmål:
 *   - Aldrig hitta på fakta. Endast sammanfatta vad som faktiskt sägs.
 *   - Behåll datum + namn + bokade tider exakt som de står i tråden.
 *   - Markera tydligt vilka punkter som är "AI:s tolkning" (medel-konfidens).
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function capText(value, maxLength = 240) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function toIsoOrEmpty(value) {
  if (!value) return '';
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString();
}

function compareByTime(a, b) {
  const ta = Date.parse(String(a?.sentAt || a?.recordedAt || ''));
  const tb = Date.parse(String(b?.sentAt || b?.recordedAt || ''));
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return 1;
  if (!Number.isFinite(tb)) return -1;
  return ta - tb;
}

function describeRelativeTime(iso) {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 0) return 'precis nu';
  if (diffSec < 60) return 'just nu';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min sedan`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)} h sedan`;
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)} d sedan`;
  return new Date(ts).toLocaleDateString('sv-SE');
}

function detectKeyTokens(messages) {
  // Regex-baserad extraktion av faktiska tokens som inte får hallucineras
  const out = {
    times: new Set(),
    dates: new Set(),
    prices: new Set(),
    bookings: 0,
    cancellations: 0,
    questions: 0,
  };
  for (const msg of messages) {
    const body = normalizeText(msg?.body || msg?.bodyPreview || msg?.text || '');
    if (!body) continue;
    // Tider HH:MM eller HH.MM
    for (const m of body.matchAll(/\b([01]?\d|2[0-3])[:\.][0-5]\d\b/g)) {
      out.times.add(m[0].replace('.', ':'));
    }
    // Datumformat: 2026-04-28 (ISO) — leta efter dem först
    const isoMatches = [];
    for (const m of body.matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)) {
      out.dates.add(m[0]);
      isoMatches.push({ start: m.index, end: m.index + m[0].length });
    }
    // Kort datumformat: 28/4, 28.4.2026, 28-4-26 — men hoppa över om matchen
    // ligger inuti ett ISO-datum (för att undvika "26-05" från "2026-05-02")
    for (const m of body.matchAll(/(?<!\d)\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?(?!\d)/g)) {
      const start = m.index;
      const end = start + m[0].length;
      const insideIso = isoMatches.some((iso) => start >= iso.start && end <= iso.end);
      if (!insideIso) out.dates.add(m[0]);
    }
    // Priser: "1500 kr", "1 500 kr", "29 000 kr"
    for (const m of body.matchAll(/\b(\d{1,3}(?:[\s.]\d{3})*|\d+)\s*(?:kr|sek|kronor)\b/gi)) {
      out.prices.add(m[0]);
    }
    // Bokning / avbokning / frågor (heuristisk, svenska)
    if (/\b(bokar|bokad|reserverar|tid hos|kommer in)\b/i.test(body)) out.bookings += 1;
    if (/\b(avboka|avbokar|avbokat|kan inte komma|behöver flytta)\b/i.test(body)) out.cancellations += 1;
    const questionMatches = body.match(/\?/g);
    if (questionMatches) out.questions += questionMatches.length;
  }
  return {
    times: Array.from(out.times),
    dates: Array.from(out.dates),
    prices: Array.from(out.prices),
    bookings: out.bookings,
    cancellations: out.cancellations,
    questions: out.questions,
  };
}

function buildHeuristicSummary({ messages, customerName, subject, lastVisitedAt }) {
  const sorted = asArray(messages).slice().sort(compareByTime);
  const total = sorted.length;
  if (total === 0) {
    return {
      headline: 'Tom tråd',
      bullets: ['Inga meddelanden i denna konversation ännu.'],
      whatChangedSinceLastVisit: '',
      newMessagesSinceLastVisit: 0,
      tokens: detectKeyTokens([]),
    };
  }

  const inbound = sorted.filter((m) => normalizeText(m?.direction).toLowerCase() !== 'outbound');
  const outbound = sorted.filter((m) => normalizeText(m?.direction).toLowerCase() === 'outbound');
  const last = sorted[sorted.length - 1];
  const first = sorted[0];

  const tokens = detectKeyTokens(sorted);
  const customerLabel = capText(customerName, 60) || 'kund';
  const headlineParts = [];
  headlineParts.push(`${total} meddelanden mellan ${customerLabel} och kliniken`);
  if (subject) headlineParts.push(`om "${capText(subject, 80)}"`);
  const headline = headlineParts.join(' ');

  const bullets = [];
  // 1) Senaste händelse
  const lastSenderLabel =
    normalizeText(last?.direction).toLowerCase() === 'outbound'
      ? 'Du svarade'
      : `${customerLabel} skrev`;
  const lastWhen = describeRelativeTime(toIsoOrEmpty(last?.sentAt || last?.recordedAt));
  const lastBody = capText(last?.body || last?.bodyPreview || last?.text, 180);
  if (lastBody) {
    bullets.push(`Senast: ${lastSenderLabel} ${lastWhen}: "${lastBody}"`);
  } else {
    bullets.push(`Senast: ${lastSenderLabel} ${lastWhen}.`);
  }

  // 2) Volym-balans
  if (inbound.length > 0 && outbound.length > 0) {
    bullets.push(
      `${inbound.length} meddelande${inbound.length === 1 ? '' : 'n'} från ${customerLabel}, ${outbound.length} svar från kliniken.`
    );
  } else if (inbound.length > 0) {
    bullets.push(`${inbound.length} obesvarade meddelande${inbound.length === 1 ? '' : 'n'} från ${customerLabel}.`);
  } else {
    bullets.push(`${outbound.length} utgående meddelande${outbound.length === 1 ? '' : 'n'}, inget svar från kund ännu.`);
  }

  // 3) Bokningssignaler
  if (tokens.bookings > 0 && tokens.times.length > 0) {
    bullets.push(`Bokningssignal: tider nämnda — ${tokens.times.slice(0, 3).join(', ')}.`);
  } else if (tokens.cancellations > 0) {
    bullets.push(`Avbokningssignal — kund nämner svårighet att komma.`);
  }

  // 4) Datum & priser om de finns
  if (tokens.dates.length > 0) {
    bullets.push(`Datum nämnda i tråden: ${tokens.dates.slice(0, 3).join(', ')}.`);
  }
  if (tokens.prices.length > 0) {
    bullets.push(`Pris-information: ${tokens.prices.slice(0, 2).join(', ')}.`);
  }

  // 5) Öppna frågor
  if (tokens.questions > 0) {
    bullets.push(`${tokens.questions} fråga${tokens.questions === 1 ? '' : 'or'} ställda i tråden.`);
  }

  // 6) Tråd-ålder om relevant
  const firstIso = toIsoOrEmpty(first?.sentAt || first?.recordedAt);
  if (firstIso) {
    const ageDays = Math.round((Date.now() - Date.parse(firstIso)) / 86400000);
    if (ageDays > 0) {
      bullets.push(`Tråden är ${ageDays} dag${ageDays === 1 ? '' : 'ar'} gammal.`);
    }
  }

  // What changed since last visit
  let whatChanged = '';
  let newSince = 0;
  if (lastVisitedAt) {
    const visitTs = Date.parse(lastVisitedAt);
    if (Number.isFinite(visitTs)) {
      const newer = sorted.filter((m) => {
        const t = Date.parse(String(m?.sentAt || m?.recordedAt || ''));
        return Number.isFinite(t) && t > visitTs;
      });
      newSince = newer.length;
      if (newSince === 0) {
        whatChanged = 'Inget nytt sedan senast.';
      } else {
        const fromCustomer = newer.filter(
          (m) => normalizeText(m?.direction).toLowerCase() !== 'outbound'
        ).length;
        whatChanged = `${newSince} ny${newSince === 1 ? 'tt meddelande' : 'a meddelanden'} sedan senast — ${fromCustomer} från ${customerLabel}.`;
      }
    }
  }

  return {
    headline,
    bullets: bullets.slice(0, 6),
    whatChangedSinceLastVisit: whatChanged,
    newMessagesSinceLastVisit: newSince,
    tokens,
  };
}

async function maybeRunOpenAiSummary({ openai, model, messages, customerName, subject }) {
  if (!openai || !model) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  try {
    const transcript = messages
      .slice(-30) // hardcap för att undvika token-explosion
      .map((m, idx) => {
        const who = normalizeText(m?.direction).toLowerCase() === 'outbound' ? 'KLINIK' : 'KUND';
        const when = toIsoOrEmpty(m?.sentAt || m?.recordedAt) || `(${idx + 1})`;
        const body = capText(m?.body || m?.bodyPreview || m?.text, 800);
        return `[${when}] ${who}: ${body}`;
      })
      .join('\n');

    const systemPrompt =
      'Du sammanfattar en e-postkonversation mellan en klinik och en kund. ' +
      'Skriv KORT, max 5 punkter på svenska. ' +
      'STRIKT REGEL: hitta aldrig på fakta. Använd endast information som finns i transkriptet. ' +
      'Ange aldrig priser, datum eller medicinska detaljer som inte står ordagrant. ' +
      'Returnera JSON enligt schemat: { "headline": string, "bullets": string[] (3-5 st) }.';

    const userPrompt =
      `Sammanfatta denna konversation mellan kliniken och kunden${customerName ? ' ' + customerName : ''}` +
      `${subject ? ' om "' + subject + '"' : ''}:\n\n${transcript}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 600,
    });

    const raw = completion?.choices?.[0]?.message?.content || '';
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      return null;
    }
    const headline = capText(parsed?.headline, 220);
    const bullets = asArray(parsed?.bullets)
      .map((b) => capText(b, 240))
      .filter(Boolean)
      .slice(0, 6);
    if (!headline || bullets.length === 0) return null;
    return { headline, bullets, source: 'openai' };
  } catch (_e) {
    return null;
  }
}

class SummarizeThreadCapability extends BaseCapability {
  static name = 'SummarizeThread';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;

  static persistStrategy = 'none';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['messages'],
    properties: {
      conversationId: { type: 'string', minLength: 0, maxLength: 1024 },
      customerName: { type: 'string', minLength: 0, maxLength: 200 },
      subject: { type: 'string', minLength: 0, maxLength: 220 },
      lastVisitedAt: { type: 'string', minLength: 0, maxLength: 64 },
      messages: {
        type: 'array',
        minItems: 0,
        maxItems: 200,
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            direction: { type: 'string', maxLength: 20 },
            body: { type: 'string', maxLength: 8000 },
            bodyPreview: { type: 'string', maxLength: 2000 },
            text: { type: 'string', maxLength: 8000 },
            sentAt: { type: 'string', maxLength: 64 },
            recordedAt: { type: 'string', maxLength: 64 },
            from: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
  };

  static outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'metadata', 'warnings'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: [
          'conversationId',
          'headline',
          'bullets',
          'whatChangedSinceLastVisit',
          'newMessagesSinceLastVisit',
          'source',
          'generatedAt',
        ],
        properties: {
          conversationId: { type: 'string', maxLength: 1024 },
          headline: { type: 'string', minLength: 1, maxLength: 240 },
          bullets: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 280 },
          },
          whatChangedSinceLastVisit: { type: 'string', maxLength: 280 },
          newMessagesSinceLastVisit: { type: 'integer', minimum: 0, maximum: 1000 },
          source: { type: 'string', enum: ['heuristic', 'openai', 'hybrid'] },
          generatedAt: { type: 'string', minLength: 1, maxLength: 64 },
        },
      },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'version', 'channel', 'tenantId'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', maxLength: 120 },
          correlationId: { type: 'string', maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const messages = asArray(input.messages);
    const customerName = capText(input.customerName, 200);
    const subject = capText(input.subject, 220);
    const conversationId = capText(input.conversationId, 1024);
    const lastVisitedAt = normalizeText(input.lastVisitedAt);

    const heuristic = buildHeuristicSummary({
      messages,
      customerName,
      subject,
      lastVisitedAt,
    });

    const warnings = [];
    let source = 'heuristic';
    let headline = heuristic.headline;
    let bullets = heuristic.bullets;

    // Försök OpenAI (om providern är konfigurerad)
    const openaiClient = safeContext.openai || null;
    const openaiModel = capText(safeContext.openaiModel, 80);

    if (openaiClient && openaiModel) {
      const aiResult = await maybeRunOpenAiSummary({
        openai: openaiClient,
        model: openaiModel,
        messages,
        customerName,
        subject,
      });
      if (aiResult) {
        headline = aiResult.headline || headline;
        bullets = aiResult.bullets.length ? aiResult.bullets : bullets;
        source = 'openai';
      } else {
        warnings.push('AI-summary kunde inte genereras — heuristisk fallback användes.');
      }
    }

    return {
      data: {
        conversationId,
        headline,
        bullets,
        whatChangedSinceLastVisit: heuristic.whatChangedSinceLastVisit,
        newMessagesSinceLastVisit: heuristic.newMessagesSinceLastVisit,
        source,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: SummarizeThreadCapability.name,
        version: SummarizeThreadCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'okand',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

module.exports = {
  SummarizeThreadCapability,
  summarizeThreadCapability: SummarizeThreadCapability,
  // Exporteras för testning
  buildHeuristicSummary,
  detectKeyTokens,
};
