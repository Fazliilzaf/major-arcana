function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
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

const ALLOWED_DRAFT_MODES = Object.freeze(['short', 'warm', 'professional']);
const ALLOWED_INTENTS = Object.freeze([
  'booking_request',
  'pricing_question',
  'anxiety_pre_op',
  'complaint',
  'cancellation',
  'follow_up',
  'unclear',
]);
const ALLOWED_TONES = Object.freeze([
  'neutral',
  'stressed',
  'anxious',
  'frustrated',
  'urgent',
  'positive',
]);
const MAX_WORDS = 220;
const DEFAULT_WRITING_PROFILE = Object.freeze({
  greetingStyle: 'Hej,',
  closingStyle: 'Vänliga hälsningar',
  formalityLevel: 5,
  ctaStyle: 'balanced',
  sentenceLength: 'medium',
  emojiUsage: false,
  warmthIndex: 5,
});

const MEDICAL_TOPIC_PATTERN =
  /\b(symptom|symtom|behandling|operation|biverkning|lakemedel|läkemedel|infektion|feber|svullnad|smarta|smärta)\b/i;
const ACUTE_PATTERN =
  /\b(akut|andningssvarigheter|kraftig blodning|svimning|112|omedelbart|nu direkt)\b/i;

const FORBIDDEN_PATTERNS = Object.freeze([
  /\b(garanti|garanterar|alltid resultat|resultatgaranti)\b/gi,
  /100\s*%/gi,
  /\b(juridik|juridisk|advokat|stamning|stämning|ersattning|ersättning)\b/gi,
]);

function normalizeIntent(value = '') {
  const normalized = normalizeText(value);
  return ALLOWED_INTENTS.includes(normalized) ? normalized : 'unclear';
}

function normalizeTone(value = '') {
  const normalized = normalizeText(value);
  return ALLOWED_TONES.includes(normalized) ? normalized : 'neutral';
}

function normalizePriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
}

function normalizeDraftMode(value = '', fallback = 'professional') {
  const normalized = normalizeText(value).toLowerCase();
  if (ALLOWED_DRAFT_MODES.includes(normalized)) return normalized;
  return ALLOWED_DRAFT_MODES.includes(fallback) ? fallback : 'professional';
}

function normalizeToneStyle(value = '') {
  const normalized = normalizeForMatch(value);
  if (!normalized) return 'balanced';
  if (/(professionell|formell|saklig)/.test(normalized)) return 'professional';
  if (/(varm|empatisk|personlig|omhändertagande|omhandertagande)/.test(normalized)) return 'warm';
  if (/(kort|koncis|direkt)/.test(normalized)) return 'short';
  return 'balanced';
}

function normalizeWritingProfile(profile = null) {
  const safe =
    profile && typeof profile === 'object' && !Array.isArray(profile)
      ? profile
      : DEFAULT_WRITING_PROFILE;
  const sentenceLength = normalizeText(safe.sentenceLength).toLowerCase();
  return {
    greetingStyle: normalizeText(safe.greetingStyle) || DEFAULT_WRITING_PROFILE.greetingStyle,
    closingStyle: normalizeText(safe.closingStyle) || DEFAULT_WRITING_PROFILE.closingStyle,
    formalityLevel: Math.round(clampNumber(safe.formalityLevel, 0, 10, 5)),
    ctaStyle: normalizeText(safe.ctaStyle) || DEFAULT_WRITING_PROFILE.ctaStyle,
    sentenceLength: ['short', 'medium', 'long'].includes(sentenceLength) ? sentenceLength : 'medium',
    emojiUsage: safe.emojiUsage === true,
    warmthIndex: Math.round(clampNumber(safe.warmthIndex, 0, 10, 5)),
  };
}

function resolveCustomerName(customerProfile = null) {
  if (!customerProfile || typeof customerProfile !== 'object' || Array.isArray(customerProfile)) {
    return '';
  }
  const candidate =
    normalizeText(customerProfile.firstName) ||
    normalizeText(customerProfile.name) ||
    normalizeText(customerProfile.displayName);
  return candidate ? candidate.split(/\s+/)[0].slice(0, 60) : '';
}

function hasMedicalTopic(text = '', force = false) {
  if (force === true) return true;
  return MEDICAL_TOPIC_PATTERN.test(String(text || ''));
}

function hasAcuteSignal(text = '', force = false) {
  if (force === true) return true;
  return ACUTE_PATTERN.test(String(text || ''));
}

function summarizeInbound(originalMessage = '') {
  const normalized = normalizeText(originalMessage).replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137).trim()}...`;
}

function sanitizePlainText(value = '') {
  let text = normalizeText(value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1');

  for (const pattern of FORBIDDEN_PATTERNS) {
    text = text.replace(pattern, '');
  }

  text = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/!{2,}/g, '!')
    .trim();

  const sentenceChunks = text.split(/(?<=[.!?])\s+/);
  const deduped = [];
  const seen = new Set();
  for (const sentence of sentenceChunks) {
    const cleanSentence = normalizeText(sentence);
    if (!cleanSentence) continue;
    const key = normalizeForMatch(cleanSentence).replace(/[^a-z0-9 ]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(cleanSentence);
  }

  return deduped.join(' ').trim();
}

function sanitizeStructureSections(structure = {}) {
  return {
    acknowledgement:
      sanitizePlainText(structure.acknowledgement) || 'Tack för ditt meddelande. Vi har tagit emot ditt ärende.',
    coreAnswer:
      sanitizePlainText(structure.coreAnswer) ||
      'Vi återkommer med tydlig information och nästa steg efter snabb granskning.',
    cta:
      sanitizePlainText(structure.cta) ||
      'Svara gärna med de viktigaste detaljerna så återkopplar vi snabbt.',
  };
}

function adjustBySentenceLength(text = '', sentenceLength = 'medium') {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  if (!sentences.length) return normalized;
  if (sentenceLength === 'short') {
    return sentences.slice(0, 1).join(' ').trim();
  }
  if (sentenceLength === 'long') {
    if (sentences.length >= 2) return sentences.slice(0, 2).join(' ').trim();
    return sentences[0];
  }
  return sentences.slice(0, 2).join(' ').trim();
}

function limitWordCount(value = '', maxWords = MAX_WORDS) {
  const paragraphs = String(value || '')
    .split(/\n\n+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  if (!paragraphs.length) return '';

  let wordsRemaining = Math.max(1, Number(maxWords) || MAX_WORDS);
  const next = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    if (words.length <= wordsRemaining) {
      next.push(paragraph);
      wordsRemaining -= words.length;
      if (wordsRemaining <= 0) break;
      continue;
    }
    next.push(`${words.slice(0, wordsRemaining).join(' ').trim()}...`);
    wordsRemaining = 0;
    break;
  }

  return next.join('\n\n').trim();
}

function renderDraftText({
  acknowledgement = '',
  coreAnswer = '',
  cta = '',
  customerName = '',
  writingProfile = DEFAULT_WRITING_PROFILE,
} = {}) {
  const profile = normalizeWritingProfile(writingProfile);
  const rawGreeting = normalizeText(profile.greetingStyle) || 'Hej,';
  const greeting = (() => {
    if (!customerName) return rawGreeting;
    if (/\{\{\s*name\s*\}\}/i.test(rawGreeting)) {
      return rawGreeting.replace(/\{\{\s*name\s*\}\}/gi, customerName);
    }
    if (/^hej\b/i.test(rawGreeting)) {
      return `${rawGreeting.replace(/[,\s]+$/, '')} ${customerName},`;
    }
    return rawGreeting;
  })();
  const paragraph1 = sanitizePlainText(`${greeting} ${acknowledgement}`);
  const paragraph2 = sanitizePlainText(
    adjustBySentenceLength(coreAnswer, profile.sentenceLength)
  );
  const paragraph3 = sanitizePlainText(
    `${adjustBySentenceLength(cta, profile.sentenceLength)} ${profile.closingStyle}`.trim()
  );
  const paragraphs = [paragraph1, paragraph2, paragraph3]
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 3);

  const merged = paragraphs.join('\n\n');
  return limitWordCount(merged, MAX_WORDS);
}

function buildAcknowledgement({
  tone = 'neutral',
  mode = 'professional',
  intent = 'unclear',
  writingProfile = DEFAULT_WRITING_PROFILE,
} = {}) {
  const profile = normalizeWritingProfile(writingProfile);
  const warmBonus =
    profile.warmthIndex >= 7 && mode !== 'professional'
      ? ' Vi finns här och guidar dig tryggt vidare.'
      : '';

  if (tone === 'anxious' || tone === 'stressed') {
    if (mode === 'short') {
      return `Vi förstår att det här kan kännas oroligt och hjälper dig steg för steg.${warmBonus}`.trim();
    }
    if (mode === 'warm') {
      return `Vi förstår att situationen kan kännas orolig och vill ge tydlig och trygg återkoppling.${warmBonus}`.trim();
    }
    return 'Vi har noterat din oro och återkopplar med en tydlig och strukturerad plan.';
  }

  if (tone === 'frustrated') {
    if (intent === 'complaint') {
      return 'Tack för tydlig återkoppling. Vi tar ansvar för uppföljningen och hanterar ärendet skyndsamt.';
    }
    return mode === 'short'
      ? 'Vi tar din återkoppling på allvar och följer upp detta direkt.'
      : 'Vi tar din återkoppling på allvar och återkommer med tydlig åtgärdsplan.';
  }

  if (tone === 'urgent') {
    return mode === 'short'
      ? 'Vi har prioriterat ärendet och agerar direkt.'
      : 'Ärendet är prioriterat och hanteras med omedelbar uppföljning.';
  }

  if (tone === 'positive') {
    return profile.warmthIndex >= 7
      ? 'Tack för förtroendet och ditt tydliga meddelande. Det uppskattas.'
      : 'Tack för förtroendet och ditt tydliga meddelande.';
  }

  if (profile.formalityLevel >= 8 && mode === 'professional') {
    return 'Vi bekräftar mottaget meddelande och återkommer med tydlig handlingsplan.';
  }

  return mode === 'short'
    ? 'Vi har tagit emot ditt meddelande.'
    : 'Vi har tagit emot ditt meddelande och återkopplar med tydligt nästa steg.';
}

function buildIntentCoreAnswer({
  intent = 'unclear',
  mode = 'professional',
  originalMessage = '',
  writingProfile = DEFAULT_WRITING_PROFILE,
} = {}) {
  const profile = normalizeWritingProfile(writingProfile);
  const summary = summarizeInbound(originalMessage);

  if (intent === 'booking_request') {
    if (mode === 'short') {
      return 'Nästa steg är att boka konsultation. Föreslagna tider är vardagar kl. 09:00, 11:30 eller 15:00.';
    }
    if (mode === 'warm') {
      return 'Nästa steg är att boka konsultation med tydligt tidsspann. Vi kan normalt erbjuda vardagar kl. 09:00, 11:30 eller 15:00 och bekräftar tid när du väljer.';
    }
    return 'Nästa steg är bokningsbekräftelse med fast tidsslott. Vi föreslår vardagar kl. 09:00, 11:30 eller 15:00 och skickar skriftlig bekräftelse direkt efter ditt val.';
  }

  if (intent === 'pricing_question') {
    const base = mode === 'short'
      ? 'Vi återkommer med konkret prisram i kronor. Prisramen baseras på omfattning, metodval och eftervård.'
      : 'Vi återkommer med konkret prisram i kronor för ditt ärende. Prisramen förklaras tydligt utifrån omfattning, metodval och planerad eftervård.';
    return adjustBySentenceLength(base, profile.sentenceLength);
  }

  if (intent === 'complaint') {
    const base = mode === 'short'
      ? 'Vi bekräftar ärendet och startar omedelbar uppföljning med ansvarig kontaktperson och lösningsförslag.'
      : 'Vi bekräftar ärendet, dokumenterar händelsen och återkommer med ansvarig kontaktperson, tidslinje och konkret lösningsförslag.';
    return adjustBySentenceLength(base, profile.sentenceLength);
  }

  if (intent === 'cancellation') {
    const base = mode === 'short'
      ? 'Vi bekräftar att vi kan hantera avbokning direkt och kan även erbjuda ombokning om du önskar.'
      : 'Vi bekräftar att avbokning kan hanteras direkt. Om du vill kan vi i samma steg erbjuda ombokning med alternativa tider.';
    return adjustBySentenceLength(base, profile.sentenceLength);
  }

  if (intent === 'follow_up') {
    const summaryText = summary ? ` Sammanfattning: ${summary}` : '';
    const base = mode === 'short'
      ? `Vi följer upp ärendet med tydlig återkoppling idag.${summaryText}`
      : `Vi följer upp ärendet strukturerat och återkommer med tydlig status, ansvarig och nästa steg.${summaryText}`;
    return adjustBySentenceLength(base, profile.sentenceLength);
  }

  if (intent === 'anxiety_pre_op') {
    const base = mode === 'short'
      ? 'Vi går igenom nästa steg i lugn ordning så att du har tydlig information inför beslut.'
      : 'Vi går igenom nästa steg i lugn och tydlig ordning så att du får trygg överblick inför kommande beslut.';
    return adjustBySentenceLength(base, profile.sentenceLength);
  }

  const fallback = mode === 'short'
    ? 'För att ge korrekt svar behöver vi kompletterande uppgifter.'
    : 'För att ge korrekt och tydligt svar behöver vi kompletterande uppgifter innan återkoppling.';
  return adjustBySentenceLength(fallback, profile.sentenceLength);
}

function buildSafetySentence({ originalMessage = '', isMedicalTopic = false, isAcute = false } = {}) {
  const medical = hasMedicalTopic(originalMessage, isMedicalTopic);
  const acute = hasAcuteSignal(originalMessage, isAcute);

  if (medical && acute) {
    return 'Vi kan inte ge individuell medicinsk rådgivning via mejl; medicinsk bedömning kräver personlig kontakt, och vid akuta symtom ska du ringa 112 eller kontakta akutmottagning direkt.';
  }
  if (medical) {
    return 'Vi kan inte ge individuell medicinsk rådgivning via mejl; medicinsk bedömning kräver personlig kontakt med legitimerad kliniker.';
  }
  if (acute) {
    return 'Vid akuta symtom ska du ringa 112 eller kontakta akutmottagning direkt.';
  }
  return '';
}

function buildCta({
  intent = 'unclear',
  priorityLevel = 'Low',
  mode = 'professional',
  writingProfile = DEFAULT_WRITING_PROFILE,
} = {}) {
  const profile = normalizeWritingProfile(writingProfile);
  let ask = 'de viktigaste detaljerna i ärendet';
  if (intent === 'booking_request') ask = 'vilken av tiderna som passar dig';
  if (intent === 'pricing_question') ask = 'behandlingstyp och omfattning';
  if (intent === 'complaint') ask = 'händelseförlopp och tidpunkt';
  if (intent === 'cancellation') ask = 'om du vill avboka eller boka om';
  if (intent === 'follow_up') ask = 'vad du främst väntar på svar kring';

  const ctaStyle = normalizeText(profile.ctaStyle).toLowerCase();
  const prefix =
    profile.formalityLevel >= 8 || /structured/.test(ctaStyle)
      ? 'Vänligen '
      : /calm/.test(ctaStyle)
      ? 'När det passar dig, '
      : '';
  const suffix =
    profile.emojiUsage && mode === 'warm' && profile.warmthIndex >= 7 ? ' 🙂' : '';

  if (priorityLevel === 'Critical') {
    return `${prefix}bekräfta ${ask} inom 1 timme så prioriterar vi omedelbar hantering.${suffix}`.trim();
  }
  if (priorityLevel === 'High') {
    return `${prefix}svara idag med ${ask} så återkopplar vi skyndsamt med nästa steg.${suffix}`.trim();
  }
  if (priorityLevel === 'Medium') {
    if (mode === 'short') {
      return `${prefix}svara med ${ask} så återkommer vi snart.${suffix}`.trim();
    }
    if (mode === 'warm') {
      return `${prefix}svara gärna med ${ask} så återkommer vi med tydlig och trygg uppföljning.${suffix}`.trim();
    }
    return `${prefix}återkom med ${ask} så återkopplar vi med strukturerat nästa steg.${suffix}`.trim();
  }
  return mode === 'short'
    ? `${prefix}när det passar dig kan du svara med ${ask}.${suffix}`.trim()
    : `${prefix}när det passar dig får du gärna svara med ${ask}, så hjälper vi dig vidare.${suffix}`.trim();
}

function resolveRecommendedMode({
  intent = 'unclear',
  tone = 'neutral',
  tenantToneStyle = '',
  writingProfile = null,
} = {}) {
  if (intent === 'complaint') return 'professional';
  if (tone === 'urgent') return 'short';
  if (intent === 'pricing_question') return 'professional';
  if (intent === 'booking_request') return 'warm';
  if (tone === 'anxious') return 'warm';

  const style = normalizeToneStyle(tenantToneStyle);
  if (style === 'short') return 'short';
  if (style === 'warm') return 'warm';
  if (style === 'professional') return 'professional';
  const profile = normalizeWritingProfile(writingProfile);
  if (profile.sentenceLength === 'short') return 'short';
  if (profile.warmthIndex >= 7) return 'warm';
  if (profile.formalityLevel >= 7) return 'professional';
  return 'professional';
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

async function runOpenAiStructureFill({
  mode = 'professional',
  intent = 'unclear',
  tone = 'neutral',
  priorityLevel = 'Low',
  deterministicStructure = null,
  originalMessage = '',
  openai = null,
  model = '',
  timeoutMs = 2800,
} = {}) {
  if (!openai || typeof openai.chat?.completions?.create !== 'function') return null;
  const safeModel = normalizeText(model);
  if (!safeModel) return null;
  const structure =
    deterministicStructure && typeof deterministicStructure === 'object' && !Array.isArray(deterministicStructure)
      ? deterministicStructure
      : null;
  if (!structure) return null;

  const request = openai.chat.completions.create({
    model: safeModel,
    temperature: 0.2,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'cco_draft_structure_fill',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['acknowledgement', 'coreAnswer', 'cta'],
          properties: {
            acknowledgement: { type: 'string', minLength: 1, maxLength: 400 },
            coreAnswer: { type: 'string', minLength: 1, maxLength: 1000 },
            cta: { type: 'string', minLength: 1, maxLength: 400 },
          },
        },
      },
    },
    messages: [
      {
        role: 'system',
        content:
          'Du får ENDAST fylla språk i given struktur. Ingen fri generering. Svensk text. Max 220 ord totalt i sluttext, max 3 stycken, ingen medicinsk rådgivning, inga garantier, ingen juridisk formulering, ingen upprepning.',
      },
      {
        role: 'user',
        content: [
          `Mode: ${mode}`,
          `Intent: ${intent}`,
          `Tone: ${tone}`,
          `Priority: ${priorityLevel}`,
          '',
          'Använd denna struktur och förbättra formuleringarna utan att byta innebörd:',
          JSON.stringify(structure),
          '',
          'Originalmeddelande (kontext):',
          normalizeText(originalMessage).slice(0, 500),
        ].join('\n'),
      },
    ],
    max_completion_tokens: 260,
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('draft_semantic_timeout')), Math.max(700, Number(timeoutMs) || 2800));
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
  return sanitizeStructureSections(parsed);
}

async function runSemanticStructureFill({
  mode = 'professional',
  intent = 'unclear',
  tone = 'neutral',
  priorityLevel = 'Low',
  deterministicStructure = null,
  originalMessage = '',
  options = {},
} = {}) {
  const semanticResolver =
    typeof options.semanticResolver === 'function' ? options.semanticResolver : null;
  if (semanticResolver) {
    try {
      const result = await semanticResolver({
        mode,
        intent,
        tone,
        priorityLevel,
        deterministicStructure,
        originalMessage,
      });
      if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
      return sanitizeStructureSections(result);
    } catch {
      return null;
    }
  }

  const runtime = getRuntimeSemanticConfig();
  const semanticMode = normalizeText(options.semanticMode || runtime.semanticMode || 'heuristic').toLowerCase();
  if (semanticMode !== 'hybrid') return null;

  return runOpenAiStructureFill({
    mode,
    intent,
    tone,
    priorityLevel,
    deterministicStructure,
    originalMessage,
    openai: options.openai || runtime.openai,
    model: options.model || runtime.model,
    timeoutMs: options.timeoutMs,
  });
}

function buildDeterministicStructure({
  mode = 'professional',
  intent = 'unclear',
  tone = 'neutral',
  priorityLevel = 'Low',
  originalMessage = '',
  isMedicalTopic = false,
  isAcute = false,
  writingProfile = DEFAULT_WRITING_PROFILE,
} = {}) {
  const acknowledgement = buildAcknowledgement({ tone, mode, intent, writingProfile });
  const intentAnswer = buildIntentCoreAnswer({ intent, mode, originalMessage, writingProfile });
  const safetySentence = buildSafetySentence({ originalMessage, isMedicalTopic, isAcute });
  const coreAnswer = [intentAnswer, safetySentence].filter(Boolean).join(' ').trim();
  const cta = buildCta({ intent, priorityLevel, mode, writingProfile });
  return sanitizeStructureSections({ acknowledgement, coreAnswer, cta });
}

function buildFailSafeDraft() {
  return {
    draftModes: {
      short:
        'Hej,\n\nVi har tagit emot ditt meddelande.\n\nNär det passar dig kan du svara med de viktigaste detaljerna.',
      warm:
        'Hej,\n\nTack för ditt meddelande. Vi har tagit emot ärendet och hjälper dig gärna vidare.\n\nSvara gärna med de viktigaste detaljerna så återkommer vi snart.',
      professional:
        'Hej,\n\nVi har tagit emot ditt ärende och återkommer med tydlig uppföljning.\n\nVänligen återkom med kompletterande information så tar vi nästa steg.',
    },
    recommendedMode: 'professional',
    structureUsed: {
      acknowledgement: 'Vi har tagit emot ditt meddelande.',
      coreAnswer: 'Vi återkommer med tydlig uppföljning.',
      cta: 'Vänligen återkom med kompletterande information.',
    },
  };
}

async function composeContextAwareDraft(input = {}, options = {}) {
  try {
    const intent = normalizeIntent(input.intent);
    const tone = normalizeTone(input.tone);
    const priorityLevel = normalizePriorityLevel(input.priorityLevel);
    const tenantToneStyle = normalizeText(input.tenantToneStyle);
    const originalMessage = normalizeText(input.originalMessage);
    const customerProfile =
      input.customerProfile && typeof input.customerProfile === 'object' && !Array.isArray(input.customerProfile)
        ? input.customerProfile
        : {};
    const writingProfile = normalizeWritingProfile(input.writingProfile);
    const customerName = resolveCustomerName(customerProfile);

    const draftModes = {};
    const structureByMode = {};

    for (const mode of ALLOWED_DRAFT_MODES) {
      const deterministic = buildDeterministicStructure({
        mode,
        intent,
        tone,
        priorityLevel,
        originalMessage,
        isMedicalTopic: input.isMedicalTopic === true,
        isAcute: input.isAcute === true,
        writingProfile,
      });

      const semantic = await runSemanticStructureFill({
        mode,
        intent,
        tone,
        priorityLevel,
        deterministicStructure: deterministic,
        originalMessage,
        options,
      });

      const mergedStructure = sanitizeStructureSections(semantic || deterministic);
      structureByMode[mode] = mergedStructure;
      draftModes[mode] = renderDraftText({
        ...mergedStructure,
        customerName,
        writingProfile,
      });
    }

    const recommendedMode = resolveRecommendedMode({
      intent,
      tone,
      tenantToneStyle,
      writingProfile,
    });

    return {
      draftModes: {
        short: draftModes.short || draftModes.professional,
        warm: draftModes.warm || draftModes.professional,
        professional: draftModes.professional || draftModes.warm || draftModes.short,
      },
      recommendedMode: normalizeDraftMode(recommendedMode, 'professional'),
      structureUsed:
        structureByMode[normalizeDraftMode(recommendedMode, 'professional')] ||
        structureByMode.professional ||
        buildFailSafeDraft().structureUsed,
    };
  } catch {
    return buildFailSafeDraft();
  }
}

module.exports = {
  ALLOWED_DRAFT_MODES,
  composeContextAwareDraft,
  resolveRecommendedMode,
};
