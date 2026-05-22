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

const ALLOWED_TONES = Object.freeze([
  'neutral',
  'stressed',
  'anxious',
  'frustrated',
  'urgent',
  'positive',
]);

const DETERMINISTIC_TONE_RULES = Object.freeze([
  Object.freeze({
    id: 'anxious',
    baseWeight: 18,
    patterns: Object.freeze([
      /\b(orolig|radd|raedd|nervos|nervoes|worried|anxious|scared)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'frustrated',
    baseWeight: 20,
    patterns: Object.freeze([
      /\b(besviken|missnojd|missnoejd|frustrerad|arg|upprord|complaint|not happy)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'urgent',
    baseWeight: 22,
    patterns: Object.freeze([
      /\b(snalla svara|snälla svara|akut|urgent|asap|omedelbart|nu direkt)\b/i,
      /!{2,}/,
    ]),
  }),
  Object.freeze({
    id: 'stressed',
    baseWeight: 16,
    patterns: Object.freeze([
      /\b(stressad|panik|pressad|overvaldigad|överväldigad|kan inte vanta|sover inte)\b/i,
    ]),
  }),
  Object.freeze({
    id: 'positive',
    baseWeight: 12,
    patterns: Object.freeze([
      /\b(tack|fantastiskt|jattenojd|jättenöjd|uppskattar|great|excellent)\b/i,
    ]),
  }),
]);

function normalizeTone(value = '') {
  const normalized = normalizeText(value);
  return ALLOWED_TONES.includes(normalized) ? normalized : 'neutral';
}

function toToneResult(tone = 'neutral', toneConfidence = 0.4, source = 'fallback') {
  return {
    tone: normalizeTone(tone),
    toneConfidence: clamp(toneConfidence, 0, 1),
    source: normalizeText(source) || 'fallback',
  };
}

function runDeterministicTone(text = '') {
  const source = normalizeForMatch(text);
  if (!source) return toToneResult('neutral', 0.4, 'deterministic');

  let best = { tone: 'neutral', score: 0, hits: 0 };
  let runnerUpScore = 0;

  for (const rule of DETERMINISTIC_TONE_RULES) {
    let hits = 0;
    for (const pattern of rule.patterns) {
      if (!(pattern instanceof RegExp)) continue;
      if (!pattern.test(source)) continue;
      hits += 1;
    }
    if (hits === 0) continue;
    const score = Number(rule.baseWeight || 0) + hits * 10;
    if (score > best.score) {
      runnerUpScore = best.score;
      best = { tone: rule.id, score, hits };
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (best.hits === 0) return toToneResult('neutral', 0.4, 'deterministic');
  const separationBonus = best.score - runnerUpScore >= 8 ? 0.08 : 0;
  const toneConfidence = 0.62 + best.hits * 0.1 + separationBonus;
  return toToneResult(best.tone, toneConfidence, 'deterministic');
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

function adjustToneConfidenceWithWritingProfile(baseToneConfidence = 0.4, writingProfile = null) {
  if (!writingProfile || typeof writingProfile !== 'object' || Array.isArray(writingProfile)) {
    return clamp(baseToneConfidence, 0, 1);
  }
  const confidence = clamp(baseToneConfidence, 0, 1);
  if (confidence >= 0.75) return confidence;

  const warmthIndex = clamp(writingProfile.warmthIndex, 0, 10);
  const formalityLevel = clamp(writingProfile.formalityLevel, 0, 10, 5);
  const formalityAdjustmentRaw =
    Number.isFinite(Number(writingProfile.formalityAdjustment))
      ? clamp(writingProfile.formalityAdjustment, -1, 1)
      : (formalityLevel - 5) / 5;

  const rawDelta = warmthIndex * 0.05 + formalityAdjustmentRaw * 0.03;
  const safeDelta = clamp(rawDelta, -0.1, 0.1);
  return clamp(confidence + safeDelta, 0, 1);
}

async function runOpenAiSemanticTone({ text = '', openai = null, model = '', timeoutMs = 3000 } = {}) {
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
        name: 'tone_classification',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['tone', 'toneConfidence'],
          properties: {
            tone: { type: 'string', enum: ALLOWED_TONES },
            toneConfidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    messages: [
      {
        role: 'system',
        content:
          'Classify the emotional tone of the email into exactly one allowed tone. Output strict JSON only.',
      },
      {
        role: 'user',
        content: [
          'Allowed tones:',
          ALLOWED_TONES.join(', '),
          '',
          'Email content:',
          source,
        ].join('\n'),
      },
    ],
    max_completion_tokens: 80,
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('tone_semantic_timeout')), Math.max(500, Number(timeoutMs) || 3000));
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
  const tone = normalizeTone(parsed.tone);
  const toneConfidence = clamp(parsed.toneConfidence, 0, 1);
  if (tone === 'neutral' && toneConfidence < 0.4) {
    return toToneResult('neutral', 0.4, 'semantic');
  }
  return toToneResult(tone, Math.max(0.41, toneConfidence), 'semantic');
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

async function runSemanticTone(text = '', options = {}) {
  const source = normalizeText(text);
  if (!source) return null;

  const semanticResolver =
    typeof options.semanticResolver === 'function' ? options.semanticResolver : null;
  if (semanticResolver) {
    try {
      const result = await semanticResolver({
        text: source,
        allowedTones: ALLOWED_TONES,
      });
      const tone = normalizeTone(result?.tone);
      const toneConfidence = clamp(result?.toneConfidence, 0, 1);
      if (tone === 'neutral') return toToneResult('neutral', Math.max(0.4, toneConfidence), 'semantic');
      return toToneResult(tone, Math.max(0.41, toneConfidence), 'semantic');
    } catch {
      return null;
    }
  }

  const runtime = getRuntimeSemanticConfig();
  const semanticMode = normalizeText(options.semanticMode || runtime.semanticMode || 'heuristic').toLowerCase();
  if (semanticMode !== 'hybrid') return null;

  return runOpenAiSemanticTone({
    text: source,
    openai: options.openai || runtime.openai,
    model: options.model || runtime.model,
    timeoutMs: options.timeoutMs,
  });
}

async function detectTone(text = '', options = {}) {
  const deterministic = runDeterministicTone(text);
  let resolved = deterministic;
  if (deterministic.tone === 'neutral') {
    const semantic = await runSemanticTone(text, options);
    if (semantic) {
      resolved = semantic;
    } else {
      resolved = toToneResult('neutral', 0.4, 'fallback');
    }
  }

  const adjustedToneConfidence = adjustToneConfidenceWithWritingProfile(
    resolved.toneConfidence,
    options?.writingProfile
  );

  return toToneResult(resolved.tone, adjustedToneConfidence, resolved.source);
}

module.exports = {
  ALLOWED_TONES,
  adjustToneConfidenceWithWritingProfile,
  detectTone,
  runDeterministicTone,
};
