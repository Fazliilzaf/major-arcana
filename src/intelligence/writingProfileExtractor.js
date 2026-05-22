const {
  isValidEmail,
  normalizeMailboxAddress,
  toWritingProfile,
} = require('./writingIdentityRegistry');
const {
  getWritingIdentityProfile,
  upsertWritingIdentityProfile,
} = require('./writingIdentityStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toMailboxAddress(value = '') {
  const mailbox = normalizeMailboxAddress(value);
  return isValidEmail(mailbox) ? mailbox : '';
}

function toIso(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function sanitizeSampleText(value = '') {
  return normalizeText(value)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toSampleFromEntry(entry = {}) {
  const safe = asObject(entry);
  const input = asObject(safe.input);
  const output = asObject(safe.output);
  const mailbox =
    toMailboxAddress(output.senderMailboxId) ||
    toMailboxAddress(input.senderMailboxId) ||
    toMailboxAddress(output.mailboxId) ||
    toMailboxAddress(input.mailboxId);
  if (!mailbox) return null;
  const body =
    sanitizeSampleText(output.body) ||
    sanitizeSampleText(output.bodyPreview) ||
    sanitizeSampleText(input.body) ||
    sanitizeSampleText(input.bodyPreview);
  if (!body) return null;
  return {
    mailbox,
    body,
    subject: normalizeText(output.subject || input.subject),
    ts: toIso(safe.ts) || new Date().toISOString(),
  };
}

function pickMostFrequent(values = [], fallback = '') {
  const counts = new Map();
  for (const value of asArray(values)) {
    const key = normalizeText(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size) return fallback;
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

function detectGreeting(body = '') {
  const lines = String(body || '')
    .split('\n')
    .map((item) => normalizeText(item))
    .filter(Boolean);
  if (!lines.length) return '';
  const candidate = lines[0];
  if (candidate.length > 120) return '';
  if (/^(hej|hello|basta halsningar|bästa hälsningar|god dag)/i.test(candidate)) return candidate;
  return '';
}

function detectClosing(body = '') {
  const lines = String(body || '')
    .split('\n')
    .map((item) => normalizeText(item))
    .filter(Boolean);
  if (!lines.length) return '';
  for (let index = lines.length - 1; index >= Math.max(0, lines.length - 8); index -= 1) {
    const line = lines[index];
    if (/^(vanliga halsningar|vänliga hälsningar|basta halsningar|bästa hälsningar|med vanlig halsning|med vänlig hälsning)/i.test(line)) {
      return line;
    }
  }
  return '';
}

function toAverageWordsPerSentence(samples = []) {
  const allSentences = [];
  for (const sample of asArray(samples)) {
    const body = String(sample?.body || '');
    const sentences = body
      .split(/(?<=[.!?])\s+/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
    for (const sentence of sentences) allSentences.push(sentence);
  }
  if (!allSentences.length) return 0;
  const totalWords = allSentences.reduce((sum, sentence) => {
    return sum + sentence.split(/\s+/).filter(Boolean).length;
  }, 0);
  return totalWords / allSentences.length;
}

function classifySentenceLength(avgWordsPerSentence = 0) {
  if (avgWordsPerSentence <= 11) return 'short';
  if (avgWordsPerSentence <= 19) return 'medium';
  return 'long';
}

function detectEmojiUsage(samples = []) {
  const emojiRegex =
    /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  return asArray(samples).some((sample) => emojiRegex.test(String(sample?.body || '')));
}

function toAggregateText(samples = []) {
  return asArray(samples)
    .map((sample) => String(sample?.body || ''))
    .filter(Boolean)
    .join('\n');
}

function inferCtaStyle(samples = []) {
  const text = toAggregateText(samples).toLowerCase();
  if (!text) return 'balanced';
  if (/(inom 1 timme|omedelbar|svara idag|bekrafta|bekräfta snarast|nu direkt)/i.test(text)) {
    return 'direct-structured';
  }
  if (/(nar det passar dig|när det passar dig|nar du ar redo|när du är redo|garna|gärna)/i.test(text)) {
    return 'calm-guiding';
  }
  if (/(vanligen|vänligen|aterkom med|återkom med|nasta steg|nästa steg)/i.test(text)) {
    return 'structured';
  }
  return 'balanced';
}

function inferFormalityLevel(samples = []) {
  const text = toAggregateText(samples).toLowerCase();
  if (!text) return 5;
  let score = 5;
  const formalSignals = [
    'vänligen',
    'bekräfta',
    'återkom',
    'vänliga hälsningar',
    'bästa hälsningar',
  ];
  const casualSignals = ['gärna', 'hej', 'tack', 'vi hjälper dig'];
  for (const token of formalSignals) {
    if (text.includes(token)) score += 0.7;
  }
  for (const token of casualSignals) {
    if (text.includes(token)) score -= 0.4;
  }
  return Math.round(clampNumber(score, 0, 10, 5));
}

function inferWarmthIndex(samples = []) {
  const text = toAggregateText(samples).toLowerCase();
  if (!text) return 5;
  let score = 5;
  const warmSignals = ['tack', 'gärna', 'trygg', 'förstår', 'hjälper', 'välkommen'];
  const coolSignals = ['omedelbar', 'inom 1 timme', 'måste', 'krävs'];
  for (const token of warmSignals) {
    if (text.includes(token)) score += 0.8;
  }
  for (const token of coolSignals) {
    if (text.includes(token)) score -= 0.6;
  }
  return Math.round(clampNumber(score, 0, 10, 5));
}

function extractWritingProfileFromSamples(samples = [], { fallbackProfile = null } = {}) {
  const safeSamples = asArray(samples).filter((sample) => sample && typeof sample === 'object');
  if (!safeSamples.length) {
    return toWritingProfile(fallbackProfile || {});
  }
  const greetingStyle = pickMostFrequent(
    safeSamples.map((sample) => detectGreeting(sample.body)),
    normalizeText(fallbackProfile?.greetingStyle) || 'Hej,'
  );
  const closingStyle = pickMostFrequent(
    safeSamples.map((sample) => detectClosing(sample.body)),
    normalizeText(fallbackProfile?.closingStyle) || 'Vänliga hälsningar'
  );
  const avgWordsPerSentence = toAverageWordsPerSentence(safeSamples);
  const sentenceLength = classifySentenceLength(avgWordsPerSentence);
  const emojiUsage = detectEmojiUsage(safeSamples);
  const formalityLevel = inferFormalityLevel(safeSamples);
  const warmthIndex = inferWarmthIndex(safeSamples);
  const ctaStyle = inferCtaStyle(safeSamples);
  return toWritingProfile({
    greetingStyle,
    closingStyle,
    formalityLevel,
    ctaStyle,
    sentenceLength,
    emojiUsage,
    warmthIndex,
  });
}

async function listRecentSentSamplesForMailbox({
  analysisStore = null,
  tenantId = '',
  mailboxAddress = '',
  sampleSize = 40,
} = {}) {
  if (!analysisStore || typeof analysisStore.list !== 'function') return [];
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) return [];
  const mailbox = toMailboxAddress(mailboxAddress);
  if (!mailbox) return [];
  const safeSampleSize = clampNumber(sampleSize, 30, 50, 40);
  const entries = await analysisStore.list({
    tenantId: normalizedTenantId,
    capabilityName: 'CCO.SendReply',
    limit: 1000,
  });
  const samples = asArray(entries)
    .map((entry) => toSampleFromEntry(entry))
    .filter((sample) => sample && sample.mailbox === mailbox)
    .sort((left, right) => String(right.ts || '').localeCompare(String(left.ts || '')))
    .slice(0, safeSampleSize);
  return samples;
}

async function listMailboxesWithSentSamples({
  analysisStore = null,
  tenantId = '',
  maxMailboxes = 50,
} = {}) {
  if (!analysisStore || typeof analysisStore.list !== 'function') return [];
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) return [];
  const safeMaxMailboxes = clampNumber(maxMailboxes, 1, 200, 50);
  const entries = await analysisStore.list({
    tenantId: normalizedTenantId,
    capabilityName: 'CCO.SendReply',
    limit: 2000,
  });
  const mailboxSet = new Set();
  for (const entry of asArray(entries)) {
    const sample = toSampleFromEntry(entry);
    if (!sample?.mailbox) continue;
    mailboxSet.add(sample.mailbox);
    if (mailboxSet.size >= safeMaxMailboxes) break;
  }
  return Array.from(mailboxSet.values()).sort((left, right) => left.localeCompare(right));
}

async function extractAndPersistWritingIdentityProfile({
  analysisStore = null,
  authStore = null,
  tenantId = '',
  mailboxAddress = '',
  actorUserId = null,
  correlationId = null,
  sampleSize = 40,
} = {}) {
  const mailbox = toMailboxAddress(mailboxAddress);
  if (!mailbox) {
    return {
      mailbox: '',
      sampleCount: 0,
      updated: false,
      reason: 'invalid_mailbox',
      profile: null,
      record: null,
    };
  }
  const fallbackRecord = await getWritingIdentityProfile({
    analysisStore,
    tenantId,
    mailboxAddress: mailbox,
  });
  const samples = await listRecentSentSamplesForMailbox({
    analysisStore,
    tenantId,
    mailboxAddress: mailbox,
    sampleSize,
  });
  if (!samples.length) {
    return {
      mailbox,
      sampleCount: 0,
      updated: false,
      reason: 'no_samples',
      profile: fallbackRecord?.profile || null,
      record: fallbackRecord || null,
    };
  }
  const profile = extractWritingProfileFromSamples(samples, {
    fallbackProfile: fallbackRecord?.profile || null,
  });
  const record = await upsertWritingIdentityProfile({
    analysisStore,
    authStore,
    tenantId,
    actorUserId,
    mailboxAddress: mailbox,
    profile,
    source: 'auto',
    correlationId,
  });
  return {
    mailbox,
    sampleCount: samples.length,
    updated: true,
    reason: '',
    profile: record.profile,
    record,
  };
}

async function extractAndPersistWritingIdentityProfiles({
  analysisStore = null,
  authStore = null,
  tenantId = '',
  mailboxes = [],
  actorUserId = null,
  correlationId = null,
  sampleSize = 40,
} = {}) {
  const explicitMailboxes = asArray(mailboxes)
    .map((value) => toMailboxAddress(value))
    .filter(Boolean);
  const resolvedMailboxes =
    explicitMailboxes.length > 0
      ? explicitMailboxes
      : await listMailboxesWithSentSamples({
          analysisStore,
          tenantId,
          maxMailboxes: 50,
        });
  const updatedProfiles = [];
  const skipped = [];
  for (const mailbox of resolvedMailboxes) {
    const result = await extractAndPersistWritingIdentityProfile({
      analysisStore,
      authStore,
      tenantId,
      mailboxAddress: mailbox,
      actorUserId,
      correlationId,
      sampleSize,
    });
    if (result.updated) {
      updatedProfiles.push(result);
      continue;
    }
    skipped.push({
      mailbox,
      reason: result.reason || 'skipped',
      sampleCount: result.sampleCount || 0,
    });
  }
  return {
    requestedMailboxes: resolvedMailboxes,
    updatedProfiles,
    skipped,
    sampleSize: clampNumber(sampleSize, 30, 50, 40),
  };
}

module.exports = {
  extractAndPersistWritingIdentityProfile,
  extractAndPersistWritingIdentityProfiles,
  extractWritingProfileFromSamples,
  listMailboxesWithSentSamples,
  listRecentSentSamplesForMailbox,
};
