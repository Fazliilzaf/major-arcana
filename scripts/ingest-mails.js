/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { redactForStorage } = require('../src/privacy/redact');

function getArgValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function htmlToText(input) {
  let text = String(input ?? '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return normalizeWhitespace(text);
}

function decodeQuotedPrintable(input) {
  const text = String(input ?? '');
  const softBreaksRemoved = text.replace(/=(\r?\n)/g, '');
  const bytes = [];
  for (let index = 0; index < softBreaksRemoved.length; index += 1) {
    const current = softBreaksRemoved[index];
    if (
      current === '=' &&
      /[A-Fa-f0-9]/.test(softBreaksRemoved[index + 1] || '') &&
      /[A-Fa-f0-9]/.test(softBreaksRemoved[index + 2] || '')
    ) {
      const hex = `${softBreaksRemoved[index + 1]}${softBreaksRemoved[index + 2]}`;
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
      continue;
    }
    bytes.push(current.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeBodyByEncoding(input, transferEncoding = '') {
  const encoding = String(transferEncoding || '').toLowerCase().trim();
  if (!encoding) return String(input ?? '');

  if (encoding.includes('base64')) {
    try {
      return Buffer.from(String(input ?? '').replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return String(input ?? '');
    }
  }

  if (encoding.includes('quoted-printable')) {
    return decodeQuotedPrintable(input);
  }

  return String(input ?? '');
}

function parseHeaders(raw) {
  const map = {};
  const lines = String(raw ?? '').split(/\r?\n/);
  let currentKey = '';

  for (const line of lines) {
    if (!line) continue;
    if (/^\s/.test(line) && currentKey) {
      map[currentKey] = `${map[currentKey]} ${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    currentKey = key;
    map[key] = value;
  }

  return map;
}

function splitHeaderBody(raw) {
  const normalized = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const index = normalized.indexOf('\n\n');
  if (index === -1) return { headersRaw: normalized, bodyRaw: '' };
  return {
    headersRaw: normalized.slice(0, index),
    bodyRaw: normalized.slice(index + 2),
  };
}

function extractBoundary(contentType = '') {
  const match = String(contentType).match(/boundary="?([^";]+)"?/i);
  return match ? match[1].trim() : '';
}

function parseMimePart(rawPart) {
  const { headersRaw, bodyRaw } = splitHeaderBody(rawPart);
  const headers = parseHeaders(headersRaw);
  const contentType = String(headers['content-type'] || 'text/plain').toLowerCase();
  const transferEncoding = String(headers['content-transfer-encoding'] || '').toLowerCase();
  const disposition = String(headers['content-disposition'] || '').toLowerCase();
  const decoded = decodeBodyByEncoding(bodyRaw, transferEncoding);

  return {
    contentType,
    disposition,
    text: contentType.includes('text/html') ? htmlToText(decoded) : normalizeWhitespace(decoded),
  };
}

function extractBestBody({ headers, bodyRaw }) {
  const contentType = String(headers['content-type'] || 'text/plain').toLowerCase();
  const transferEncoding = String(headers['content-transfer-encoding'] || '').toLowerCase();
  const boundary = extractBoundary(contentType);

  if (!contentType.includes('multipart/') || !boundary) {
    const decoded = decodeBodyByEncoding(bodyRaw, transferEncoding);
    return contentType.includes('text/html') ? htmlToText(decoded) : normalizeWhitespace(decoded);
  }

  const marker = `--${boundary}`;
  const parts = String(bodyRaw ?? '').split(marker).map((part) => part.trim()).filter(Boolean);
  let textPlain = '';
  let textHtml = '';

  for (const part of parts) {
    if (part === '--') continue;
    const parsed = parseMimePart(part);
    if (parsed.disposition.includes('attachment')) continue;
    if (parsed.contentType.includes('text/plain') && !textPlain) textPlain = parsed.text;
    if (parsed.contentType.includes('text/html') && !textHtml) textHtml = parsed.text;
  }

  return textPlain || textHtml || '';
}

function parseEmailAddresses(value) {
  const text = String(value || '');
  const regex = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  const result = [];
  let match;
  while ((match = regex.exec(text))) {
    result.push(match[1].toLowerCase());
  }
  return Array.from(new Set(result));
}

function toIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toISOString();
}

function normalizeSubject(value) {
  const subject = normalizeWhitespace(value || '(utan ämne)');
  if (!subject) return '(utan ämne)';
  return subject.slice(0, 240);
}

function normalizeThreadKey(subject) {
  let key = normalizeSubject(subject).toLowerCase();
  while (/^(re|sv|fw|fwd)\s*:\s*/i.test(key)) {
    key = key.replace(/^(re|sv|fw|fwd)\s*:\s*/i, '').trim();
  }
  return key || '(utan ämne)';
}

function emailMatchesClinicDomain(email, clinicDomains) {
  return clinicDomains.some((domain) => email.endsWith(`@${domain}`));
}

function textMatchesAnyHint(text, clinicHints) {
  const value = String(text || '').toLowerCase();
  if (!value) return false;
  return clinicHints.some((hint) => value.includes(hint));
}

function detectDirection({
  fromEmails,
  toEmails,
  clinicDomains,
  clinicHints,
  fromRaw = '',
  toRaw = '',
}) {
  const hasClinicFromDomain = fromEmails.some((email) =>
    emailMatchesClinicDomain(email, clinicDomains)
  );
  const hasClinicToDomain = toEmails.some((email) =>
    emailMatchesClinicDomain(email, clinicDomains)
  );
  const hasClinicFromHint = textMatchesAnyHint(fromRaw, clinicHints);
  const hasClinicToHint = textMatchesAnyHint(toRaw, clinicHints);

  const hasClinicFrom = hasClinicFromDomain || hasClinicFromHint;
  const hasClinicTo = hasClinicToDomain || hasClinicToHint;
  const hasExternalFrom = fromEmails.some((email) => !emailMatchesClinicDomain(email, clinicDomains));
  const hasExternalTo = toEmails.some((email) => !emailMatchesClinicDomain(email, clinicDomains));

  if (hasClinicFrom && hasExternalTo) return 'outbound';
  if (hasExternalFrom && hasClinicTo) return 'inbound';
  if (!hasClinicFrom && hasClinicTo) return 'inbound';
  if (hasClinicFrom && !hasClinicTo) return 'outbound';
  if (hasClinicFrom && hasClinicTo) return 'internal';
  return 'unknown';
}

function textHash(value) {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 16);
}

function detectInputType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.emlx') return '.eml';
  if (!ext && path.basename(filePath).toLowerCase() === 'mbox') return '.mbox';
  return ext;
}

function parseEml(raw, sourceFile) {
  const { headersRaw, bodyRaw } = splitHeaderBody(raw);
  const headers = parseHeaders(headersRaw);
  const fromRaw = String(headers.from || '');
  const toRaw = [headers.to, headers.cc].filter(Boolean).join(', ');
  const subject = normalizeSubject(headers.subject || path.basename(sourceFile));

  return {
    sourceFile,
    fromRaw,
    toRaw,
    subject,
    threadKey: normalizeThreadKey(subject),
    dateIso: toIsoDate(headers.date),
    fromEmails: parseEmailAddresses(fromRaw),
    toEmails: parseEmailAddresses(toRaw),
    body: extractBestBody({ headers, bodyRaw }),
  };
}

function parseMbox(raw, sourceFile) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const chunks = [];
  let current = [];

  for (const line of lines) {
    if (line.startsWith('From ') && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join('\n'));

  const messages = [];
  for (const chunk of chunks) {
    const cleaned = chunk.startsWith('From ') ? chunk.slice(chunk.indexOf('\n') + 1) : chunk;
    const parsed = parseEml(cleaned, sourceFile);
    if (parsed.body || parsed.subject) messages.push(parsed);
  }
  return messages;
}

function parseJsonMail(raw, sourceFile) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.messages)
    ? parsed.messages
    : Array.isArray(parsed?.emails)
    ? parsed.emails
    : [parsed];

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const fromRaw = String(item.from || item.sender || item.fromAddress || '');
      const toRaw = String(item.to || item.recipients || item.toAddress || '');
      const subject = normalizeSubject(item.subject || item.title || '(utan ämne)');
      return {
        sourceFile,
        fromRaw,
        toRaw,
        subject,
        threadKey: normalizeThreadKey(subject),
        dateIso: toIsoDate(item.date || item.sentAt || item.createdAt),
        fromEmails: parseEmailAddresses(fromRaw),
        toEmails: parseEmailAddresses(toRaw),
        body: normalizeWhitespace(item.body || item.text || item.content || item.message || ''),
      };
    })
    .filter((item) => item.body || item.subject);
}

async function listFilesRecursive(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) return [inputPath];

  const queue = [inputPath];
  const files = [];
  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

function shortPreview(text, limit = 260) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function classifyTopic(text) {
  const q = String(text || '').toLowerCase();
  if (/\b(boka|tid|konsultation|omboka|avboka)\b/.test(q)) return 'bokning';
  if (/\b(pris|kostnad|kr|graft)\b/.test(q)) return 'pris';
  if (/\b(eftervård|läkning|tvätta|smärta|svullnad)\b/.test(q)) return 'eftervård';
  if (/\b(prp|microneedling|dermapen|fue|dhi|behandling)\b/.test(q)) return 'behandling';
  if (/\b(finans|delbetal)\b/.test(q)) return 'betalning';
  return 'övrigt';
}

function pickQuestionLine(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (!lines.length) return '';
  const withQuestion = lines.find((line) => line.includes('?'));
  return shortPreview(withQuestion || lines[0], 220);
}

function pickAnswerSnippet(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  if (!lines.length) return '';
  return shortPreview(lines.slice(0, 3).join(' '), 420);
}

function isUsefulQuestionCandidate(question) {
  const value = normalizeWhitespace(question);
  if (!value || value.length < 12) return false;
  if (!/[a-zåäö]/i.test(value)) return false;
  if (/<[^>]+>/.test(value)) return false;
  if (/https?:\/\//i.test(value)) return false;
  if (
    /(du f[aå]r inte ofta e-post|aka\.ms|accountchooser|view image|name=|{{|=\?utf-8\?|google\.com\/maps\/search)/i.test(
      value
    )
  ) {
    return false;
  }
  return true;
}

function mapPairToTemplateCategory(pair) {
  const text = `${pair.question} ${pair.answer}`.toLowerCase();
  if (/\b(boka|omboka|avboka|konsultation)\b/.test(text)) return 'BOOKING';
  if (/\b(eftervård|läkning|smärta|svullnad)\b/.test(text)) return 'AFTERCARE';
  if (/\b(pris|kostnad|betalning|delbetal)\b/.test(text)) return 'LEAD';
  if (/\b(intern|schema|team)\b/.test(text)) return 'INTERNAL';
  return 'CONSULTATION';
}

function extractOpenings(outboundMessages) {
  const counter = new Map();
  for (const message of outboundMessages) {
    const firstLine = String(message.body || '')
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .find(Boolean);
    if (!firstLine) continue;
    const key = shortPreview(firstLine, 120);
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([line, count]) => ({ line, count }));
}

function extractSignoffs(outboundMessages) {
  const counter = new Map();
  for (const message of outboundMessages) {
    const lines = String(message.body || '')
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean);
    if (!lines.length) continue;
    const lastLine = lines[lines.length - 1];
    if (!/(vänlig|hälsning|mvh|tack)/i.test(lastLine)) continue;
    const key = shortPreview(lastLine, 120);
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([line, count]) => ({ line, count }));
}

function buildTemplateSeedItems(pairs, { max = 200 } = {}) {
  return pairs.slice(0, Math.max(1, max)).map((pair, index) => {
    const category = String(pair.templateCategory || 'CONSULTATION').toUpperCase();
    const topic = String(pair.topic || 'övrigt');
    const ordinal = String(index + 1).padStart(3, '0');
    const seedId = textHash(`${pair.threadKey}|${pair.inboundId}|${pair.outboundId}|${ordinal}`);
    const templateName = `Mail seed ${topic} ${ordinal}`;
    const draftTitle = `${templateName} (${category})`;
    const instruction = `Skapa en ${category}-mall i varm och tydlig ton baserat på trigger och svarssnutt.`;
    const draftContent = [
      'Hej {{first_name}},',
      '',
      pair.answer || 'Tack för din fråga. Vi hjälper dig gärna vidare.',
      '',
      'Om du vill går vi gärna igenom nästa steg tillsammans.',
      'Vid medicinska frågor gör klinikteamet alltid en individuell bedömning.',
      '',
      'Med vänlig hälsning,',
      '{{clinic_name}}',
      '{{clinic_phone}}',
    ].join('\n');

    return {
      seedId,
      templateCategory: category,
      topic,
      templateName,
      draftTitle,
      trigger: pair.question || '',
      answerSnippet: pair.answer || '',
      instruction,
      draftContent,
      source: {
        threadKey: pair.threadKey || '',
        inboundId: pair.inboundId || '',
        outboundId: pair.outboundId || '',
      },
    };
  });
}

function buildInboundIntentSummary(messages, { maxQuestions = 80 } = {}) {
  const topicCounts = new Map();
  const questionCounts = new Map();

  for (const message of messages) {
    const topic = classifyTopic(message.body);
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    const question = pickQuestionLine(message.body);
    if (!isUsefulQuestionCandidate(question)) continue;
    questionCounts.set(question, (questionCounts.get(question) || 0) + 1);
  }

  return {
    topicCounts: Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count })),
    topQuestions: Array.from(questionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, maxQuestions))
      .map(([question, count]) => ({ question, count })),
  };
}

function toMarkdownList(rows, formatter) {
  if (!rows.length) return '- (inga data hittades)';
  return rows.map((row, index) => `- ${formatter(row, index)}`).join('\n');
}

async function writeFileSafe(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(content || ''), 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = getArgValue(args, '--input', '');
  const brand = getArgValue(args, '--brand', 'hair-tp-clinic');
  const outDir = getArgValue(args, '--out', path.join(process.cwd(), 'knowledge', brand, 'mail'));
  const maxMessages = asInt(getArgValue(args, '--maxMessages', '4000'), 4000);
  const maxPairs = asInt(getArgValue(args, '--maxPairs', '200'), 200);
  const includeInternal = hasFlag(args, '--include-internal');

  const clinicDomains = getArgValue(
    args,
    '--clinic-domains',
    'hairtpclinic.se,hairtpclinic.com'
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const defaultClinicHints = brand.includes('curatiio')
    ? ['curatiio']
    : ['hair tp clinic', 'hairtpclinic'];
  const clinicHints = getArgValue(args, '--clinic-hints', defaultClinicHints.join(','))
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!inputPath) {
    throw new Error(
      'Saknar --input. Exempel: node scripts/ingest-mails.js --input "./mail-exports" --brand hair-tp-clinic'
    );
  }

  const absoluteInput = path.resolve(inputPath);
  const allFiles = await listFilesRecursive(absoluteInput);
  const supportedFiles = allFiles.filter((file) => {
    const inputType = detectInputType(file);
    return ['.eml', '.mbox', '.json', '.txt', '.md', '.olm'].includes(inputType);
  });
  const unsupportedOlm = supportedFiles.filter((file) => detectInputType(file) === '.olm');

  if (unsupportedOlm.length > 0) {
    console.log('⚠️ .olm-filer kan inte läsas direkt.');
    console.log('   Exportera till .eml/.mbox/.json och kör igen.');
  }

  let parsedMessages = [];
  for (const file of supportedFiles) {
    const inputType = detectInputType(file);
    if (inputType === '.olm') continue;

    let raw = '';
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }

    if (inputType === '.eml') parsedMessages.push(parseEml(raw, file));
    else if (inputType === '.mbox') parsedMessages.push(...parseMbox(raw, file));
    else if (inputType === '.json') parsedMessages.push(...parseJsonMail(raw, file));
    else if (inputType === '.txt' || inputType === '.md') {
      const subject = normalizeSubject(path.basename(file));
      parsedMessages.push({
        sourceFile: file,
        fromRaw: '',
        toRaw: '',
        subject,
        threadKey: normalizeThreadKey(subject),
        dateIso: '',
        fromEmails: [],
        toEmails: [],
        body: normalizeWhitespace(raw),
      });
    }
  }

  parsedMessages = parsedMessages
    .filter((item) => item && (item.body || item.subject))
    .slice(0, Math.max(1, maxMessages));

  const normalized = parsedMessages.map((item, index) => {
    const direction = detectDirection({
      fromEmails: item.fromEmails || [],
      toEmails: item.toEmails || [],
      clinicDomains,
      clinicHints,
      fromRaw: item.fromRaw || '',
      toRaw: item.toRaw || '',
    });
    return {
      id: textHash(`${item.sourceFile}|${item.subject}|${item.dateIso}|${item.body}|${index}`),
      sourceFile: path.relative(process.cwd(), item.sourceFile),
      sourceType: detectInputType(item.sourceFile).replace('.', ''),
      subject: redactForStorage(item.subject),
      threadKey: item.threadKey,
      dateIso: item.dateIso || '',
      direction,
      body: redactForStorage(item.body || ''),
    };
  });

  const filtered = normalized.filter((item) => {
    if (!includeInternal && item.direction === 'internal') return false;
    return true;
  });

  const byThread = new Map();
  for (const item of filtered) {
    const key = item.threadKey || '(utan ämne)';
    const list = byThread.get(key) || [];
    list.push(item);
    byThread.set(key, list);
  }
  for (const [, list] of byThread) {
    list.sort((a, b) => (Date.parse(a.dateIso || '') || 0) - (Date.parse(b.dateIso || '') || 0));
  }

  const pairs = [];
  for (const [threadKey, list] of byThread.entries()) {
    for (let index = 0; index < list.length; index += 1) {
      const current = list[index];
      if (current.direction !== 'inbound') continue;
      let match = null;
      for (let next = index + 1; next < list.length; next += 1) {
        if (list[next].direction === 'outbound') {
          match = list[next];
          break;
        }
      }
      if (!match) continue;

      const pair = {
        threadKey,
        inboundId: current.id,
        outboundId: match.id,
        question: pickQuestionLine(current.body),
        answer: pickAnswerSnippet(match.body),
        topic: classifyTopic(current.body),
        templateCategory: mapPairToTemplateCategory({
          question: current.body,
          answer: match.body,
        }),
      };
      if (!pair.question || !pair.answer) continue;
      pairs.push(pair);
      if (pairs.length >= maxPairs) break;
    }
    if (pairs.length >= maxPairs) break;
  }

  const outboundMessages = filtered.filter((item) => item.direction === 'outbound');
  const inboundMessages = filtered.filter((item) => item.direction === 'inbound');
  const openings = extractOpenings(outboundMessages);
  const signoffs = extractSignoffs(outboundMessages);
  const templateSeedItems = buildTemplateSeedItems(pairs, { max: maxPairs });
  const inboundIntentSummary = buildInboundIntentSummary(inboundMessages);
  const generatedAt = nowIso();

  const report = {
    generatedAt,
    brand,
    inputPath: absoluteInput,
    outputPath: outDir,
    counts: {
      scannedFiles: allFiles.length,
      supportedFiles: supportedFiles.length,
      unsupportedOlm: unsupportedOlm.length,
      messagesParsed: parsedMessages.length,
      messagesUsed: filtered.length,
      threads: byThread.size,
      inbound: inboundMessages.length,
      outbound: outboundMessages.length,
      internal: filtered.filter((item) => item.direction === 'internal').length,
      unknown: filtered.filter((item) => item.direction === 'unknown').length,
      qaPairs: pairs.length,
      templateSeeds: templateSeedItems.length,
      inboundQuestionPatterns: inboundIntentSummary.topQuestions.length,
    },
    clinicDomains,
  };

  const summaryMd = [
    '# Mail ingest summary',
    '',
    `Genererad: ${generatedAt}`,
    `Brand: ${brand}`,
    `Källa: ${absoluteInput}`,
    '',
    '## Volym',
    `- Skannade filer: ${report.counts.scannedFiles}`,
    `- Stödda filer: ${report.counts.supportedFiles}`,
    `- OLM-filer (ej parse): ${report.counts.unsupportedOlm}`,
    `- Meddelanden parse: ${report.counts.messagesParsed}`,
    `- Meddelanden använda: ${report.counts.messagesUsed}`,
    `- Trådar: ${report.counts.threads}`,
    `- Inbound: ${report.counts.inbound}`,
    `- Outbound: ${report.counts.outbound}`,
    `- QA-par byggda: ${report.counts.qaPairs}`,
    '',
    '## GDPR/säkerhet',
    '- Scriptet anonymiserar e-post, telefonnummer och personnummer i output.',
    '- Råmail sparas inte i knowledge-output.',
    '- Lägg inte rå .olm/.mbox/.eml i git.',
    '',
  ].join('\n');

  const faqMd = [
    '# FAQ från mailkonversationer (anonymiserad)',
    '',
    `Genererad: ${generatedAt}`,
    '',
    toMarkdownList(
      pairs,
      (pair) =>
        `**[${pair.topic}]** Fråga: ${pair.question || '(saknas)'}\n  Svarsexempel: ${
          pair.answer || '(saknas)'
        }`
    ),
    '',
  ].join('\n');

  const toneMd = [
    '# Tonalitet från outbound-mail (anonymiserad)',
    '',
    `Genererad: ${generatedAt}`,
    '',
    '## Vanliga öppningar',
    toMarkdownList(openings, (row) => `${row.line} _(x${row.count})_`),
    '',
    '## Vanliga avslut',
    toMarkdownList(signoffs, (row) => `${row.line} _(x${row.count})_`),
    '',
    '## Rekommenderad Arcana-ton',
    '- Varm och tydlig, korta meningar.',
    '- Bekräfta frågan först, ge sedan konkret nästa steg.',
    '- Vid osäker medicinsk fråga: hänvisa till konsultation eller klinikteam.',
    '',
  ].join('\n');

  const templateSeedsMd = [
    '# Template seeds från mail',
    '',
    `Genererad: ${generatedAt}`,
    '',
    toMarkdownList(
      pairs.slice(0, 60),
      (pair, index) =>
        `**Seed ${index + 1} (${pair.templateCategory})**\n  Trigger: ${
          pair.question || '(saknas)'
        }\n  Utgångssvar: ${pair.answer || '(saknas)'}`
    ),
    '',
  ].join('\n');

  const threadSamplesMd = [
    '# Tråd-samples (anonymiserad)',
    '',
    `Genererad: ${generatedAt}`,
    '',
    toMarkdownList(
      pairs.slice(0, 100),
      (pair, index) =>
        `**Tråd ${index + 1}: ${pair.threadKey}**\n  Patient: ${
          pair.question || '(saknas)'
        }\n  Klinik: ${pair.answer || '(saknas)'}`
    ),
    '',
  ].join('\n');

  const inboundIntentsMd = [
    '# Inbound-intents från mail (anonymiserad)',
    '',
    `Genererad: ${generatedAt}`,
    '',
    '## Topic-fördelning',
    toMarkdownList(inboundIntentSummary.topicCounts, (row) => `**${row.topic}** _(x${row.count})_`),
    '',
    '## Vanliga patientfrågor (från inbox)',
    toMarkdownList(inboundIntentSummary.topQuestions, (row) => `${row.question} _(x${row.count})_`),
    '',
    '## Rekommendation',
    '- Dessa frågor kan användas som intent-bibliotek för Patient Agent.',
    '- För tonalitet och svarsmönster behövs även export från Sent/Skickat.',
    '',
  ].join('\n');

  const templateSeedsJson = {
    generatedAt,
    brand,
    count: templateSeedItems.length,
    seeds: templateSeedItems,
  };

  await writeFileSafe(path.join(outDir, 'ingest-report.json'), JSON.stringify(report, null, 2));
  await writeFileSafe(path.join(outDir, 'mail-summary.md'), summaryMd);
  await writeFileSafe(path.join(outDir, 'faq-from-mails.md'), faqMd);
  await writeFileSafe(path.join(outDir, 'tone-style-from-mails.md'), toneMd);
  await writeFileSafe(path.join(outDir, 'template-seeds-from-mails.md'), templateSeedsMd);
  await writeFileSafe(path.join(outDir, 'template-seeds.json'), JSON.stringify(templateSeedsJson, null, 2));
  await writeFileSafe(path.join(outDir, 'thread-samples.md'), threadSamplesMd);
  await writeFileSafe(path.join(outDir, 'inbound-intents.md'), inboundIntentsMd);

  console.log('✅ Mail-ingest klar.');
  console.log(`   Output: ${outDir}`);
  console.log(`   QA-par: ${pairs.length}`);
  if (unsupportedOlm.length > 0) {
    console.log(`   OBS: ${unsupportedOlm.length} st .olm-filer hittades men lästes inte.`);
  }
}

main().catch((error) => {
  console.error('❌ ingest-mails misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
