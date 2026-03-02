function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function stripDiacritics(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeForMatch(value = '') {
  return stripDiacritics(normalizeText(value).toLowerCase()).replace(/\s+/g, ' ');
}

const ALLOWED_INTENTS = Object.freeze([
  'booking_request',
  'pricing_question',
  'anxiety_pre_op',
  'complaint',
  'cancellation',
  'follow_up',
  'unclear',
]);

const DETERMINISTIC_INTENT_RULES = Object.freeze([
  Object.freeze({
    id: 'booking_request',
    baseWeight: 20,
    patterns: Object.freeze([
      /\b(boka|bokning|boka tid|book|booking|appointment|consultation|konsultation|tid hos)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'pricing_question',
    baseWeight: 16,
    patterns: Object.freeze([/\b(pris|priser|kostar|kostnad|price|pricing|offer|erbjudande)\b/i]),
  }),
  Object.freeze({
    id: 'anxiety_pre_op',
    baseWeight: 18,
    patterns: Object.freeze([
      /\b(orolig|radd|raedd|nervos|nervositet|anxious|worried|scared|inf(or|or) behandling|inf(or|or) operation)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'complaint',
    baseWeight: 22,
    patterns: Object.freeze([
      /\b(missnojd|klagomal|klagomol|complaint|complain|besviken|not happy|dalig upplevelse)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'cancellation',
    baseWeight: 17,
    patterns: Object.freeze([
      /\b(avboka|avbokning|omboka|cancel|cancellation|reschedule|stalla in|kan inte komma)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'follow_up',
    baseWeight: 12,
    patterns: Object.freeze([
      /\b(aterkoppla|aterkoppling|uppfoljning|follow up|follow-up|status update|horde ni|kolla status)\b/i,
    ]),
  }),
]);

function normalizeIntent(value = '') {
  const normalized = normalizeText(value);
  return ALLOWED_INTENTS.includes(normalized) ? normalized : 'unclear';
}

function toIntentResult(intent = 'unclear', confidence = 0.3, source = 'fallback') {
  return {
    intent: normalizeIntent(intent),
    confidence: clamp(confidence, 0, 1),
    source: normalizeText(source) || 'fallback',
  };
}

function runDeterministicIntent(text = '') {
  const source = normalizeForMatch(text);
  if (!source) return toIntentResult('unclear', 0.3, 'deterministic');

  let best = { intent: 'unclear', score: 0, hits: 0 };
  let runnerUpScore = 0;

  for (const rule of DETERMINISTIC_INTENT_RULES) {
    let hits = 0;
    for (const pattern of rule.patterns) {
      if (!(pattern instanceof RegExp)) continue;
      if (!pattern.test(source)) continue;
      hits += 1;
    }
    if (hits === 0) continue;
    const score = Number(rule.baseWeight || 0) + hits * 12;
    if (score > best.score) {
      runnerUpScore = best.score;
      best = { intent: rule.id, score, hits };
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (best.hits === 0) return toIntentResult('unclear', 0.3, 'deterministic');
  const separationBonus = best.score - runnerUpScore >= 8 ? 0.08 : 0;
  const confidence = 0.62 + best.hits * 0.12 + separationBonus;
  return toIntentResult(best.intent, confidence, 'deterministic');
}

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function runOpenAiSemanticIntent({ text = '', openai = null, model = '', timeoutMs = 3000 } = {}) {
  if (!openai || typeof openai.chat?.completions?.create !== 'function') return null;
  const safeModel = normalizeText(model);
  if (!safeModel) return null;
  const source = normalizeText(text);
  if (!source) return null;

  const request = openai.chat.completions.create({
    model: safeModel,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'intent_classification',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['intent', 'confidence'],
          properties: {
            intent: { type: 'string', enum: ALLOWED_INTENTS },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    messages: [
      {
        role: 'system',
        content:
          'Classify the email into exactly one intent. Use only the allowed enum values and output strict JSON.',
      },
      {
        role: 'user',
        content: [
          'Allowed intents:',
          ALLOWED_INTENTS.join(', '),
          '',
          'Email content:',
          source,
        ].join('\n'),
      },
    ],
    max_completion_tokens: 80,
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('intent_semantic_timeout')), Math.max(500, Number(timeoutMs) || 3000));
  });

  let completion = null;
  try {
    completion = await Promise.race([request, timeout]);
  } catch {
    return null;
  }

  const content = normalizeText(completion?.choices?.[0]?.message?.content || '');
  const parsed = parseJsonObject(content);
  if (!parsed) return null;
  const intent = normalizeIntent(parsed.intent);
  const confidence = clamp(parsed.confidence, 0, 1);
  if (intent === 'unclear' && confidence < 0.31) {
    return toIntentResult('unclear', 0.31, 'semantic');
  }
  return toIntentResult(intent, confidence, 'semantic');
}

function getRuntimeSemanticConfig() {
  const semanticMode = normalizeText(process.env.ARCANA_SEMANTIC_MODEL_MODE || 'heuristic').toLowerCase();
  const model = normalizeText(process.env.OPENAI_MODEL || 'gpt-4o-mini');
  if (semanticMode !== 'hybrid') {
    return { semanticMode, model, openai: null };
  }
  try {
    const { openai } = require('../openai/client');
    return { semanticMode, model, openai: openai || null };
  } catch {
    return { semanticMode, model, openai: null };
  }
}

async function runSemanticIntent(text = '', options = {}) {
  const source = normalizeText(text);
  if (!source) return null;

  const semanticResolver =
    typeof options.semanticResolver === 'function' ? options.semanticResolver : null;
  if (semanticResolver) {
    try {
      const result = await semanticResolver({
        text: source,
        allowedIntents: ALLOWED_INTENTS,
      });
      const intent = normalizeIntent(result?.intent);
      const confidence = clamp(result?.confidence, 0, 1);
      if (intent === 'unclear') return toIntentResult('unclear', Math.max(0.3, confidence), 'semantic');
      return toIntentResult(intent, Math.max(0.31, confidence), 'semantic');
    } catch {
      return null;
    }
  }

  const runtime = getRuntimeSemanticConfig();
  const semanticMode = normalizeText(options.semanticMode || runtime.semanticMode || 'heuristic').toLowerCase();
  if (semanticMode !== 'hybrid') return null;

  return runOpenAiSemanticIntent({
    text: source,
    openai: options.openai || runtime.openai,
    model: options.model || runtime.model,
    timeoutMs: options.timeoutMs,
  });
}

async function classifyIntent(text = '', options = {}) {
  const deterministic = runDeterministicIntent(text);
  if (deterministic.intent !== 'unclear') return deterministic;

  const semantic = await runSemanticIntent(text, options);
  if (semantic && semantic.intent !== 'unclear') return semantic;
  if (semantic && semantic.intent === 'unclear') return semantic;

  return toIntentResult('unclear', 0.3, 'fallback');
}

module.exports = {
  ALLOWED_INTENTS,
  classifyIntent,
  runDeterministicIntent,
};
