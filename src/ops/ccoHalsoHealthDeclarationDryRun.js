'use strict';

const {
  HALSO_MAILBOX,
  isHalsoHealthDeclarationSubject,
  parseHealthDeclarationMessage,
} = require('./ccoHalsoHealthDeclarationParser');
const {
  buildHealthDeclarationDedupKeys,
  matchPatientFromParsed,
} = require('./ccoHalsoHealthDeclarationIngest');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskPersonnummer(value = '') {
  const pnr = normalizeText(value);
  if (!pnr) return '';
  const digits = pnr.replace(/\D/g, '');
  if (digits.length >= 4) return `****${digits.slice(-4)}`;
  return '****';
}

function maskEmail(value = '') {
  const email = normalizeText(value);
  if (!email.includes('@')) return email ? '[redacted]' : '';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function summarizeDryRunRows(rows = []) {
  const stats = {
    totalMessagesScanned: 0,
    halsoHdSubjects: 0,
    parsedOk: 0,
    parseFailed: 0,
    parseFailedByReason: {},
    matched: 0,
    matchedByMethod: {},
    needsReview: 0,
    unmatched: 0,
    wouldDuplicate: 0,
    uniquePatientsMatched: 0,
  };

  const seenDedup = new Set();
  const matchedPatientIds = new Set();
  const samples = {
    matched: [],
    needsReview: [],
    unmatched: [],
    parseFailed: [],
  };

  for (const row of rows) {
    stats.totalMessagesScanned += 1;
    if (!row.isHalsoHd) continue;
    stats.halsoHdSubjects += 1;

    if (!row.parsed?.ok) {
      stats.parseFailed += 1;
      const reason = row.parsed?.reason || 'unknown';
      stats.parseFailedByReason[reason] = (stats.parseFailedByReason[reason] || 0) + 1;
      if (samples.parseFailed.length < 5) {
        samples.parseFailed.push(row.sample);
      }
      continue;
    }

    stats.parsedOk += 1;
    const dedupHit = row.dedupKeys.some((key) => seenDedup.has(key));
    row.dedupKeys.forEach((key) => seenDedup.add(key));
    if (dedupHit) {
      stats.wouldDuplicate += 1;
    }

    if (row.match.status === 'MATCHED') {
      stats.matched += 1;
      stats.matchedByMethod[row.match.method] = (stats.matchedByMethod[row.match.method] || 0) + 1;
      if (row.match.patientId) matchedPatientIds.add(row.match.patientId);
      if (samples.matched.length < 12) samples.matched.push(row.sample);
    } else if (row.match.status === 'NEEDS_REVIEW') {
      stats.needsReview += 1;
      if (samples.needsReview.length < 8) samples.needsReview.push(row.sample);
    } else {
      stats.unmatched += 1;
      if (samples.unmatched.length < 8) samples.unmatched.push(row.sample);
    }
  }

  stats.uniquePatientsMatched = matchedPatientIds.size;
  return { stats, samples, matchedPatientIds: [...matchedPatientIds] };
}

function buildDryRunRow(rawMessage = {}, patients = [], config = {}) {
  const isHalsoHd =
    normalizeText(
      rawMessage.mailboxId || rawMessage.mailAccountEmail || config.mailboxEmail
    ).toLowerCase() === normalizeText(config.ccoHalsoMailboxEmail || HALSO_MAILBOX).toLowerCase() &&
    isHalsoHealthDeclarationSubject(rawMessage.subject);

  if (!isHalsoHd) {
    return { isHalsoHd: false, rawMessageId: rawMessage.id || rawMessage.graphMessageId || '' };
  }

  const parsed = parseHealthDeclarationMessage(rawMessage);
  const match = parsed.ok
    ? matchPatientFromParsed(parsed, patients)
    : { status: 'UNMATCHED', confidence: 0, patientId: null, method: null, reason: parsed.reason };
  const dedupKeys = parsed.ok ? buildHealthDeclarationDedupKeys(parsed, rawMessage) : [];

  const sample = {
    messageId: rawMessage.id || rawMessage.graphMessageId || '',
    internetMessageId: normalizeText(rawMessage.internetMessageId),
    subject: normalizeText(rawMessage.subject),
    receivedAt: rawMessage.receivedAt || rawMessage.receivedDateTime || '',
    personnummerMasked: maskPersonnummer(parsed.personnummer),
    emailMasked: maskEmail(parsed.email),
    displayName: parsed.displayName ? `${parsed.displayName.slice(0, 1)}***` : '',
    signedAt: parsed.signedAt || null,
    answerCount: parsed.ok ? parsed.answers.length : 0,
    flagCount: parsed.ok ? parsed.flags.length : 0,
    allergyCount: parsed.ok ? parsed.allergies.length : 0,
    matchStatus: match.status,
    matchMethod: match.method,
    matchConfidence: match.confidence,
    patientId: match.patientId || null,
    candidateCount: Array.isArray(match.candidates) ? match.candidates.length : 0,
    parseOk: parsed.ok === true,
    parseReason: parsed.ok ? null : parsed.reason,
  };

  return {
    isHalsoHd: true,
    parsed,
    match,
    dedupKeys,
    sample,
    stickprovPayload: parsed.ok
      ? {
          parsed: {
            personnummer: parsed.personnummer,
            email: parsed.email,
            phone: parsed.phone,
            displayName: parsed.displayName,
            signedAt: parsed.signedAt,
            answers: parsed.answers,
            flags: parsed.flags,
            allergies: parsed.allergies,
            channel: parsed.channel,
            consent: parsed.consent,
            internetMessageId: parsed.internetMessageId,
            subject: parsed.subject,
          },
          match,
          rawMessage: {
            id: rawMessage.id || rawMessage.graphMessageId || '',
            internetMessageId: rawMessage.internetMessageId || '',
            mailboxId: rawMessage.mailboxId || config.ccoHalsoMailboxEmail || HALSO_MAILBOX,
            subject: rawMessage.subject || '',
            receivedAt: rawMessage.receivedAt || rawMessage.receivedDateTime || '',
          },
        }
      : null,
  };
}

function selectStickprovCandidates(rows = [], { limit = 5 } = {}) {
  const picked = [];
  const usedPatients = new Set();
  const usedMessages = new Set();

  const ranked = rows
    .filter(
      (row) =>
        row.isHalsoHd && row.parsed?.ok && row.match?.status === 'MATCHED' && row.match?.patientId
    )
    .sort((a, b) => {
      const methodRank = { personnummer: 3, email: 2, phone: 1 };
      return (methodRank[b.match.method] || 0) - (methodRank[a.match.method] || 0);
    });

  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (usedPatients.has(row.match.patientId) || usedMessages.has(row.sample.messageId)) continue;
    usedPatients.add(row.match.patientId);
    usedMessages.add(row.sample.messageId);
    picked.push({
      patientId: row.match.patientId,
      matchMethod: row.match.method,
      matchConfidence: row.match.confidence,
      sample: row.sample,
      stickprovPayload: row.stickprovPayload,
    });
  }

  return picked;
}

module.exports = {
  buildDryRunRow,
  maskEmail,
  maskPersonnummer,
  selectStickprovCandidates,
  summarizeDryRunRows,
};
