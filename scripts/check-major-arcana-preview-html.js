#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_HTML_PATH = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const OPTIONAL_CLOSE_TAGS = new Set([
  'body',
  'colgroup',
  'dd',
  'dt',
  'head',
  'html',
  'li',
  'option',
  'p',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
]);

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function stripRawTextBlocks(source) {
  return source.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (match) =>
    '\n'.repeat(match.split('\n').length - 1)
  );
}

function isSelfClosingTag(rawTag) {
  return /\/\s*>$/.test(rawTag);
}

function getTagName(rawTag) {
  const match = rawTag.match(/^<\/?\s*([a-zA-Z][\w:-]*)/);
  return match ? match[1].toLowerCase() : '';
}

function validateHtmlStructure(source, filePath) {
  const sanitizedSource = stripRawTextBlocks(source).replace(/<!--[\s\S]*?-->/g, '');
  const tagPattern = /<\/?[a-zA-Z][^>]*>/g;
  const stack = [];
  const errors = [];

  for (const match of sanitizedSource.matchAll(tagPattern)) {
    const rawTag = match[0];
    const tagName = getTagName(rawTag);

    if (
      !tagName ||
      rawTag.startsWith('<!') ||
      VOID_TAGS.has(tagName) ||
      OPTIONAL_CLOSE_TAGS.has(tagName)
    ) {
      continue;
    }

    const line = getLineNumber(sanitizedSource, match.index);

    if (rawTag.startsWith('</')) {
      const previous = stack.pop();
      if (!previous) {
        errors.push(`${filePath}:${line} unexpected closing </${tagName}>`);
        continue;
      }

      if (previous.tagName !== tagName) {
        errors.push(
          `${filePath}:${line} closing </${tagName}> does not match <${previous.tagName}> opened on line ${previous.line}`
        );
      }
      continue;
    }

    if (!isSelfClosingTag(rawTag)) {
      stack.push({ tagName, line });
    }
  }

  for (const entry of stack.reverse()) {
    errors.push(`${filePath}:${entry.line} unclosed <${entry.tagName}>`);
  }

  return errors;
}

function main() {
  const source = fs.readFileSync(PREVIEW_HTML_PATH, 'utf8');
  const errors = validateHtmlStructure(source, path.relative(ROOT, PREVIEW_HTML_PATH));

  if (errors.length > 0) {
    console.error('[major-arcana-preview-html] HTML structure check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('[major-arcana-preview-html] HTML structure OK');
}

if (require.main === module) {
  main();
}

module.exports = {
  validateHtmlStructure,
};
