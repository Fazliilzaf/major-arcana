'use strict';

/**
 * Paginerad halso@ inbox-scan via Microsoft Graph ($top + @odata.nextLink).
 * Minnessäker: en sida i taget, valfri checkpoint + JSONL-index.
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const { config } = require('../../src/config');
const {
  isHalsoHealthDeclarationSubject,
} = require('../../src/ops/ccoHalsoHealthDeclarationParser');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';

const DEFAULT_MAILBOX = (
  process.env.ARCANA_MAILBOX ||
  process.env.ARCANA_CCO_HALSO_MAILBOX_EMAIL ||
  config.ccoHalsoMailboxEmail ||
  'halso@hairtpclinic.com'
).toLowerCase();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function getGraphToken() {
  const tenantId = process.env.ARCANA_GRAPH_TENANT_ID || process.env.GRAPH_TENANT_ID || '';
  const clientId = process.env.ARCANA_GRAPH_CLIENT_ID || process.env.GRAPH_CLIENT_ID || '';
  const clientSecret =
    process.env.ARCANA_GRAPH_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET || '';
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Saknar Graph-credentials (ARCANA_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`${LOGIN}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await res.json();
  if (!res.ok)
    throw new Error(payload.error_description || payload.error || 'Graph token misslyckades');
  return payload.access_token;
}

async function graphGet(token, url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error?.message || `${res.status} Graph GET`);
  return payload;
}

function buildInboxMessagesUrl(mailbox, { since = '', pageSize = 100, scope = 'mailbox' } = {}) {
  const select = 'id,subject,receivedDateTime,internetMessageId,from';
  const top = Math.min(Math.max(pageSize, 1), 250);
  const basePath =
    scope === 'inbox'
      ? `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`
      : `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages`;
  let url = `${basePath}?$select=${select}&$orderby=receivedDateTime desc&$top=${top}`;
  if (since) {
    url += `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}T00:00:00Z`)}`;
  }
  return url;
}

function emptyScanCheckpoint({
  mailbox = DEFAULT_MAILBOX,
  since = '',
  pageSize = 100,
  scope = 'mailbox',
} = {}) {
  return {
    version: 'halso-hd-corpus-v1',
    mailbox,
    since,
    pageSize,
    scope,
    nextLink: null,
    pagesScanned: 0,
    messagesScanned: 0,
    hdHeadersFound: 0,
    complete: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

async function appendIndexLine(indexPath, entry) {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.appendFile(indexPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function readIndexLines(indexPath) {
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Paginerad inbox-scan. Sparar HD-headers som JSONL (en rad per mejl).
 * @returns {Promise<{checkpoint: object, indexPath: string, hdTotal: number}>}
 */
async function scanHalsoInboxCorpus({
  mailbox = DEFAULT_MAILBOX,
  since = '',
  pageSize = 100,
  scope = 'mailbox',
  checkpointPath = '',
  indexPath = '',
  maxPages = 0,
  onProgress = null,
} = {}) {
  if (!checkpointPath || !indexPath) {
    throw new Error('scanHalsoInboxCorpus requires checkpointPath and indexPath');
  }

  const token = await getGraphToken();
  let checkpoint = await readJsonFile(checkpointPath, null);
  if (!checkpoint) {
    checkpoint = emptyScanCheckpoint({ mailbox, since, pageSize, scope });
    checkpoint.nextLink = buildInboxMessagesUrl(mailbox, { since, pageSize, scope });
  }

  if (checkpoint.complete) {
    const entries = await readIndexLines(indexPath);
    return {
      checkpoint,
      indexPath,
      hdTotal: entries.length,
      resumed: false,
      alreadyComplete: true,
    };
  }

  let url =
    checkpoint.nextLink ||
    buildInboxMessagesUrl(mailbox, { since, pageSize, scope: checkpoint.scope || scope });
  let pagesThisRun = 0;

  while (url) {
    const page = await graphGet(token, url);
    const messages = page.value || [];
    checkpoint.pagesScanned += 1;
    checkpoint.messagesScanned += messages.length;
    pagesThisRun += 1;

    for (const msg of messages) {
      if (!isHalsoHealthDeclarationSubject(msg.subject)) continue;
      checkpoint.hdHeadersFound += 1;
      await appendIndexLine(indexPath, {
        id: msg.id,
        subject: msg.subject || '',
        receivedDateTime: msg.receivedDateTime || '',
        internetMessageId: msg.internetMessageId || '',
        fromEmail: msg.from?.emailAddress?.address || '',
      });
    }

    url = page['@odata.nextLink'] || null;
    checkpoint.nextLink = url;
    checkpoint.updatedAt = new Date().toISOString();
    await writeJsonAtomic(checkpointPath, checkpoint);

    if (typeof onProgress === 'function') {
      onProgress({ checkpoint, pageMessages: messages.length });
    }

    if (maxPages > 0 && pagesThisRun >= maxPages) break;
    if (!url) {
      checkpoint.complete = true;
      checkpoint.nextLink = null;
      checkpoint.updatedAt = new Date().toISOString();
      await writeJsonAtomic(checkpointPath, checkpoint);
      break;
    }
  }

  const entries = await readIndexLines(indexPath);
  return {
    checkpoint,
    indexPath,
    hdTotal: entries.length,
    resumed: Boolean(checkpoint.pagesScanned > pagesThisRun),
    alreadyComplete: checkpoint.complete,
  };
}

async function fetchMessageBody(token, mailbox, messageId) {
  const payload = await graphGet(
    token,
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}?$select=id,subject,receivedDateTime,internetMessageId,body,from`
  );
  return payload;
}

function normalizeGraphMessage(msg, mailbox) {
  const { htmlToText } = require('../../src/ops/ccoHalsoHealthDeclarationParser');
  const bodyHtml = msg.body?.content || '';
  const bodyText =
    msg.body?.contentType === 'text' ? msg.body?.content || '' : htmlToText(bodyHtml);
  return {
    id: msg.id,
    graphMessageId: msg.id,
    mailboxId: mailbox,
    subject: msg.subject || '',
    internetMessageId: msg.internetMessageId || '',
    receivedDateTime: msg.receivedDateTime || '',
    receivedAt: msg.receivedDateTime || '',
    bodyText,
    bodyHtml,
    fromEmail: msg.from?.emailAddress?.address || '',
  };
}

module.exports = {
  DEFAULT_MAILBOX,
  buildInboxMessagesUrl,
  emptyScanCheckpoint,
  scanHalsoInboxCorpus,
  readIndexLines,
  getGraphToken,
  fetchMessageBody,
  normalizeGraphMessage,
  appendIndexLine,
  writeJsonAtomic,
  readJsonFile,
};
