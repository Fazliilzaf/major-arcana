'use strict';

const {
  normalizeEmail,
  normalizePersonnummer,
  normalizePhone,
  phoneMatchKey,
} = require('../../scripts/migration/lib/migrationUtils');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function htmlToText(input) {
  let text = String(input || '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n');
  text = text.replace(/<td[^>]*>/gi, '\t');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const HALSO_MAILBOX = 'halso@hairtpclinic.com';

const IDENTITY_FIELD_ALIASES = Object.freeze({
  personnummer: ['personnummer', 'personnr', 'social security number', 'ssn'],
  email: ['e-post', 'epost', 'email', 'mail'],
  phone: ['telefon', 'mobil', 'mobile', 'phone'],
  firstName: ['förnamn', 'fornamn', 'first name'],
  lastName: ['efternamn', 'last name'],
  displayName: ['namn', 'name', 'fullständigt namn'],
  signedAt: ['inkom', 'inkommet', 'datum', 'signed at', 'signerad'],
});

const RISK_RULES = Object.freeze([
  {
    key: 'tobacco',
    patterns: [/tobak/i, /nikotin/i, /snus/i, /vape/i, /cigaret/i],
    yesLevels: ['ja'],
    level: 'amber',
    flagText: 'Tobak/nikotin',
  },
  {
    key: 'pregnancy',
    patterns: [/gravid/i, /ammar/i],
    yesLevels: ['ja'],
    level: 'red',
    flagText: 'Gravid/amning',
  },
  {
    key: 'heart_disease',
    patterns: [/hjärt/i, /kärlsjukdom/i, /karlsjukdom/i, /hjärtinfarkt/i, /kärlkramp/i],
    yesLevels: ['ja'],
    level: 'red',
    flagText: 'Hjärt-/kärlsjukdom',
  },
  {
    key: 'hypertension',
    patterns: [/blodtryck/i, /hypertoni/i],
    yesLevels: ['ja'],
    level: 'amber',
    flagText: 'Högt blodtryck',
  },
  {
    key: 'blood_thinners',
    patterns: [/blodförtunn/i, /blodfortunn/i],
    yesLevels: ['ja'],
    level: 'red',
    flagText: 'Blodförtunnande',
  },
  {
    key: 'drug_allergy',
    patterns: [/allerg/i, /överkänslig/i, /overkanslig/i],
    patternsRequireMedicine: [/läkemedel/i, /lakemedel/i, /lokalbedöv/i],
    yesLevels: ['ja'],
    level: 'red',
    flagText: 'Läkemedelsallergi',
    allergy: true,
  },
]);

function normalizeFieldKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function extractFieldPairs(text = '') {
  const fields = {};
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([^:\t]{2,120}?)\s*[:\t]\s*(.+)$/);
    if (!match) continue;
    const key = normalizeFieldKey(match[1]);
    const val = match[2].trim();
    if (!key || !val || val.length > 4000) continue;
    if (!fields[key]) fields[key] = val;
  }
  return fields;
}

function pickField(fields, aliases = []) {
  for (const alias of aliases) {
    const key = normalizeFieldKey(alias);
    if (fields[key]) return fields[key];
  }
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (aliases.some((alias) => fieldKey.includes(normalizeFieldKey(alias)))) {
      return value;
    }
  }
  return '';
}

function parseSignedAt(rawValue, fallbackIso = '') {
  const value = normalizeText(rawValue);
  if (!value) return normalizeText(fallbackIso) || null;
  const isoCandidate = Date.parse(value.replace(' ', 'T'));
  if (Number.isFinite(isoCandidate)) return new Date(isoCandidate).toISOString();
  const svMatch = value.match(/(\d{4})[-/.](\d{2})[-/.](\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (svMatch) {
    const [, y, m, d, hh = '00', mm = '00'] = svMatch;
    const parsed = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:00`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return normalizeText(fallbackIso) || null;
}

function normalizeYesNo(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (/^(ja|yes|y)$/i.test(normalized)) return 'Ja';
  if (/^(nej|no|n)$/i.test(normalized)) return 'Nej';
  return normalized;
}

function buildAnswers(fields) {
  const answers = [];
  const identityAliases = Object.values(IDENTITY_FIELD_ALIASES).flat();

  for (const [label, value] of Object.entries(fields)) {
    if (
      identityAliases.some((alias) => label.includes(normalizeFieldKey(alias))) ||
      label.includes('personnummer') ||
      label.includes('e-post') ||
      label.includes('telefon')
    ) {
      continue;
    }
    answers.push({
      key: label.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'field',
      label,
      value: normalizeYesNo(value) || value,
      detail: /ja/i.test(value) && value.length > 3 ? value : '',
      risk: null,
    });
  }
  return answers;
}

function buildRiskFlags(answers = []) {
  const flags = [];
  const allergies = [];

  for (const answer of answers) {
    const label = normalizeFieldKey(answer.label);
    const value = normalizeYesNo(answer.value);
    for (const rule of RISK_RULES) {
      const labelMatch = rule.patterns.some((pattern) => pattern.test(label));
      const medicineRequired = rule.patternsRequireMedicine
        ? rule.patternsRequireMedicine.some((pattern) => pattern.test(label))
        : true;
      if (!labelMatch || !medicineRequired) continue;
      if (!rule.yesLevels.some((level) => value.toLowerCase().startsWith(level))) continue;
      answer.risk = rule.level;
      flags.push({
        key: rule.key,
        level: rule.level,
        text: rule.flagText,
        answerKey: answer.key,
      });
      if (rule.allergy && answer.detail) {
        allergies.push(answer.detail);
      } else if (rule.allergy && value.toLowerCase().startsWith('ja')) {
        allergies.push(answer.detail || rule.flagText);
      }
      break;
    }
  }

  return { flags, allergies };
}

function isHalsoHealthDeclarationSubject(subject = '') {
  const normalized = normalizeText(subject).toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('[injektions-journal/webb]')) return false;
  if (normalized.includes('[hälsodeklaration/webb]')) return true;
  if (normalized.includes('[halsodeklaration/webb]')) return true;
  if (normalized.includes('hälsodeklaration') && normalized.includes('/webb')) return true;
  return false;
}

function isHalsoHealthDeclarationMessage(rawMessage = {}, config = {}) {
  const mailbox = normalizeEmail(rawMessage.mailboxId || rawMessage.mailAccountEmail || '');
  const configuredMailbox = normalizeEmail(config.ccoHalsoMailboxEmail || HALSO_MAILBOX);
  if (mailbox !== configuredMailbox) return false;
  return isHalsoHealthDeclarationSubject(rawMessage.subject);
}

function parseHealthDeclarationMessage(rawMessage = {}) {
  const bodyText = normalizeText(rawMessage.bodyText) || htmlToText(rawMessage.bodyHtml);
  const fields = extractFieldPairs(bodyText);
  const personnummer = normalizePersonnummer(
    pickField(fields, IDENTITY_FIELD_ALIASES.personnummer)
  );
  const email = normalizeEmail(pickField(fields, IDENTITY_FIELD_ALIASES.email));
  const phone = normalizePhone(pickField(fields, IDENTITY_FIELD_ALIASES.phone));
  const firstName = normalizeText(pickField(fields, IDENTITY_FIELD_ALIASES.firstName));
  const lastName = normalizeText(pickField(fields, IDENTITY_FIELD_ALIASES.lastName));
  const displayName =
    normalizeText(pickField(fields, IDENTITY_FIELD_ALIASES.displayName)) ||
    [firstName, lastName].filter(Boolean).join(' ');
  const signedAt = parseSignedAt(
    pickField(fields, IDENTITY_FIELD_ALIASES.signedAt),
    rawMessage.receivedAt || rawMessage.receivedDateTime || ''
  );
  const answers = buildAnswers(fields);
  const { flags, allergies } = buildRiskFlags(answers);

  if (!personnummer && !email && !phone && !displayName) {
    return {
      ok: false,
      reason: 'missing_identity_fields',
      fields,
      bodyTextLength: bodyText.length,
    };
  }

  return {
    ok: true,
    personnummer,
    email,
    phone,
    phoneKey: phoneMatchKey(phone),
    firstName,
    lastName,
    displayName,
    signedAt,
    answers,
    flags,
    allergies,
    fields,
    channel: 'form-hairtpclinic',
    consent:
      /bekräftar|bekräftar/i.test(bodyText) || answers.some((row) => /bekräftar/i.test(row.label)),
    internetMessageId: normalizeText(rawMessage.internetMessageId),
    rawMessageId: normalizeText(rawMessage.id),
    subject: normalizeText(rawMessage.subject),
  };
}

module.exports = {
  HALSO_MAILBOX,
  buildAnswers,
  buildRiskFlags,
  extractFieldPairs,
  htmlToText,
  isHalsoHealthDeclarationMessage,
  isHalsoHealthDeclarationSubject,
  parseHealthDeclarationMessage,
  parseSignedAt,
};
