const assert = require('node:assert/strict');

const WILDCARD_PATTERN = /(?:\[\\s\\S\][*+](?:\?)?|\[\^[^\]]+\]\*|\["']|\\s[*+?]?|\\b)+/g;
const UNSAFE_LITERAL_PATTERN = /(^|[^\\])(?:\.\*|\.\+|\.|\(|\)|\[|\]|\{|\}|\||\^|\$|\+|\?)/;

function decodeLiteralSegment(segment = '') {
  if (!segment) return '';
  if (UNSAFE_LITERAL_PATTERN.test(segment)) {
    return null;
  }

  let decoded = '';
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }

    index += 1;
    if (index >= segment.length) {
      return null;
    }

    const escaped = segment[index];
    if ('\\/()[]{}.*+?|^$-'.includes(escaped)) {
      decoded += escaped;
      continue;
    }

    return null;
  }

  return decoded;
}

function buildSequentialPlan(matcher) {
  if (!(matcher instanceof RegExp)) {
    return null;
  }

  const source = matcher.source || '';
  const literalSource = decodeLiteralSegment(source);
  if (literalSource !== null) {
    return {
      caseInsensitive: matcher.flags.includes('i'),
      parts: literalSource ? [literalSource] : [],
    };
  }

  if (!WILDCARD_PATTERN.test(source)) {
    return null;
  }

  WILDCARD_PATTERN.lastIndex = 0;
  const parts = source.split(WILDCARD_PATTERN).map(decodeLiteralSegment);
  if (parts.some((part) => part === null)) {
    return null;
  }

  return {
    caseInsensitive: matcher.flags.includes('i'),
    parts: parts.filter(Boolean),
  };
}

function assertMatchFast(value, matcher, message) {
  const plan = typeof value === 'string' ? buildSequentialPlan(matcher) : null;
  if (!plan) {
    assert.match(value, matcher, message);
    return;
  }

  const haystack = plan.caseInsensitive ? value.toLowerCase() : value;
  let cursor = 0;

  for (const part of plan.parts) {
    const needle = plan.caseInsensitive ? part.toLowerCase() : part;
    const foundAt = haystack.indexOf(needle, cursor);
    if (foundAt === -1) {
      assert.match(value, matcher, message);
      return;
    }
    cursor = foundAt + needle.length;
  }
}

module.exports = {
  assertMatchFast,
};
