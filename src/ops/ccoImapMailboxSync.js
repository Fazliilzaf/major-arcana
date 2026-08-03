'use strict';

/*
 * CCO IMAP mailbox sync.
 *
 * This is deliberately separate from CM_IMAP_* (Finance). It reads one
 * explicitly configured external mailbox into CCO's existing mailbox-truth
 * store, keeps a UID cursor per folder and puts attachment bytes in CCO's
 * existing asset cache. No message is sent, moved, marked read or deleted.
 *
 * ORD-78 (OOM 2026-07-17): never materialise/fetch the whole mailbox.
 * Each cycle uses a bounded UID window (max N) + persisted cursor, with SINCE
 * applied even in cursor mode (same lesson as CM ORD-74b). Prefer streaming
 * fetch over search→all-UIDs→slice.
 */

const crypto = require('node:crypto');
const { toMailboxConversationId } = require('../infra/microsoftGraphMailboxTruth');

const DEFAULT_MAX_MESSAGES_PER_CYCLE = 25;
const DEFAULT_MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_FOLDER_TYPES = Object.freeze(['inbox', 'sent']);

function normalizeText(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toPositiveInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function readCcoImapConfig(env = process.env) {
  const mailboxId = normalizeEmail(env.ARCANA_CCO_IMAP_USER);
  const requestedFolders = String(env.ARCANA_CCO_IMAP_FOLDERS || DEFAULT_FOLDER_TYPES.join(','))
    .split(/[\s,]+/)
    .map((value) => normalizeText(value).toLowerCase())
    .filter((value) => DEFAULT_FOLDER_TYPES.includes(value));
  const folderTypes = Array.from(
    new Set(requestedFolders.length ? requestedFolders : DEFAULT_FOLDER_TYPES)
  );
  return {
    enabled: String(env.ARCANA_CCO_IMAP_ENABLED || '').toLowerCase() === 'true',
    host: normalizeText(env.ARCANA_CCO_IMAP_HOST) || 'imap.one.com',
    port: toPositiveInt(env.ARCANA_CCO_IMAP_PORT, 993),
    user: mailboxId,
    password: String(env.ARCANA_CCO_IMAP_PASSWORD || ''),
    since: normalizeText(env.ARCANA_CCO_IMAP_SINCE) || '2026-01-01',
    maxMessagesPerCycle: toPositiveInt(
      env.ARCANA_CCO_IMAP_MAX_MESSAGES_PER_CYCLE,
      DEFAULT_MAX_MESSAGES_PER_CYCLE
    ),
    maxMessageBytes: toPositiveInt(
      env.ARCANA_CCO_IMAP_MAX_MESSAGE_BYTES,
      DEFAULT_MAX_MESSAGE_BYTES
    ),
    folderTypes,
    folderNames: {
      inbox: normalizeText(env.ARCANA_CCO_IMAP_INBOX_FOLDER) || 'INBOX',
      sent: normalizeText(env.ARCANA_CCO_IMAP_SENT_FOLDER) || 'Sent',
    },
  };
}

function toParticipant(value = {}) {
  const safe = asObject(value);
  const address = normalizeEmail(safe.address);
  const name = normalizeText(safe.name);
  return address || name ? { address: address || null, name: name || null } : null;
}

function toParticipants(value = []) {
  return asArray(value).map(toParticipant).filter(Boolean);
}

function normalizeMessageId(value = '') {
  return normalizeText(value).replace(/[<>]/g, '').toLowerCase();
}

function firstReference(value) {
  if (Array.isArray(value)) return normalizeMessageId(value[0]);
  return normalizeMessageId(String(value || '').split(/\s+/)[0]);
}

function toThreadId(parsed = {}, uid = 0) {
  const seed =
    firstReference(parsed.references) ||
    normalizeMessageId(parsed.inReplyTo) ||
    normalizeMessageId(parsed.messageId) ||
    `uid:${uid}`;
  return `imap-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

function toSafeAttachmentId(index, attachment = {}) {
  const safe = asObject(attachment);
  const seed = [index, normalizeText(safe.filename), normalizeText(safe.contentId), safe.size].join(
    ':'
  );
  return `imap-att-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function parseLastUid(checkpoint = {}) {
  const deltaLink = normalizeText(checkpoint?.deltaLink);
  const match = deltaLink.match(/(?:^|[?&#:])uid=(\d+)|:uid:(\d+)/i);
  const parsed = Number(match?.[1] || match?.[2] || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cursorLink({ folderType, uid }) {
  return `imap:cursor:${folderType}:uid:${Math.max(0, Number(uid) || 0)}`;
}

function toFolderCounts(mailbox = {}) {
  const safe = asObject(mailbox);
  return {
    totalItemCount: Math.max(0, Number(safe.exists ?? safe.totalItemCount) || 0),
    unreadItemCount: Math.max(0, Number(safe.unseen ?? safe.unreadItemCount) || 0),
  };
}

function mailboxUidCeiling(mailbox = {}) {
  const safe = asObject(mailbox);
  const uidNext = Math.max(0, Number(safe.uidNext) || 0);
  if (uidNext > 1) return uidNext - 1;
  return Math.max(0, Number(safe.exists ?? safe.totalItemCount) || 0);
}

/**
 * Resolve at most `limit` UIDs to fetch. Never returns an unbounded list.
 * Incremental mode uses a closed UID window (from..to), not `from:*`.
 */
function resolveUidBatch({
  lastUid = 0,
  searchedUids = [],
  limit = DEFAULT_MAX_MESSAGES_PER_CYCLE,
  uidCeiling = 0,
} = {}) {
  const max = Math.max(1, Math.floor(Number(limit)) || DEFAULT_MAX_MESSAGES_PER_CYCLE);
  const cursor = Math.max(0, Number(lastUid) || 0);
  if (cursor > 0) {
    const fromUid = cursor + 1;
    const toUid = fromUid + max - 1;
    const ceiling = Math.max(0, Number(uidCeiling) || 0);
    const windowUids = asArray(searchedUids)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > cursor && value <= toUid)
      .sort((left, right) => left - right)
      .slice(0, max);
    const remainingBacklog =
      ceiling > toUid
        ? Math.max(0, ceiling - toUid)
        : Math.max(0, ceiling - cursor - windowUids.length);
    return {
      batch: windowUids,
      fromUid,
      toUid,
      remainingBacklog,
      // Advance past empty windows so deleted-UID gaps cannot stall the cursor.
      advanceToUid: windowUids.length ? Math.max(...windowUids) : Math.min(toUid, ceiling || toUid),
    };
  }
  const sorted = asArray(searchedUids)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  const remainingBacklog = Math.max(0, sorted.length - max);
  const batch = sorted.slice(0, max);
  // Drop the tail so callers cannot accidentally iterate the full mailbox list.
  sorted.length = 0;
  return {
    batch,
    fromUid: batch[0] || 0,
    toUid: batch.length ? batch[batch.length - 1] : 0,
    remainingBacklog,
    advanceToUid: batch.length ? batch[batch.length - 1] : cursor,
  };
}

function buildFolderSearchQuery({
  lastUid = 0,
  since,
  limit = DEFAULT_MAX_MESSAGES_PER_CYCLE,
} = {}) {
  const sinceDate = since instanceof Date ? since : new Date(since);
  const cursor = Math.max(0, Number(lastUid) || 0);
  const max = Math.max(1, Math.floor(Number(limit)) || DEFAULT_MAX_MESSAGES_PER_CYCLE);
  if (cursor > 0) {
    const fromUid = cursor + 1;
    const toUid = fromUid + max - 1;
    // ORD-74b/ORD-78: SINCE stays in cursor mode so a low cursor cannot swallow
    // the entire historical mailbox (info@ ~16k).
    return { uid: `${fromUid}:${toUid}`, since: sinceDate };
  }
  return { since: sinceDate };
}

function createCcoImapMailboxSync({
  truthStore = null,
  assetCache = null,
  env = process.env,
  imapClientFactory = null,
  parseMessageImpl = null,
  logger = console,
} = {}) {
  if (!truthStore) throw new Error('createCcoImapMailboxSync requires truthStore');
  const config = readCcoImapConfig(env);

  async function defaultClientFactory() {
    const { ImapFlow } = require('imapflow');
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.user, pass: config.password },
      logger: false,
    });
    await client.connect();
    return client;
  }

  async function defaultParseMessage(source) {
    const { simpleParser } = require('mailparser');
    const parsed = await simpleParser(source, { skipImageLinks: true });
    const header = (name) => normalizeText(parsed.headers?.get?.(name));
    return {
      subject: normalizeText(parsed.subject),
      date: parsed.date ? new Date(parsed.date).toISOString() : nowIso(),
      messageId: normalizeText(parsed.messageId),
      inReplyTo: normalizeText(parsed.inReplyTo || header('in-reply-to')),
      references: parsed.references || header('references'),
      text: normalizeText(parsed.text),
      html: typeof parsed.html === 'string' ? parsed.html : '',
      from: toParticipants(parsed.from?.value),
      to: toParticipants(parsed.to?.value),
      cc: toParticipants(parsed.cc?.value),
      replyTo: toParticipants(parsed.replyTo?.value),
      attachments: asArray(parsed.attachments).map((attachment) => ({
        filename: normalizeText(attachment.filename) || 'bilaga',
        contentType: normalizeText(attachment.contentType) || 'application/octet-stream',
        contentId: normalizeText(attachment.contentId).replace(/[<>]/g, ''),
        contentDisposition: normalizeText(attachment.contentDisposition).toLowerCase(),
        size: Math.max(0, Number(attachment.size) || Buffer.byteLength(attachment.content || '')),
        content: Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content || ''),
      })),
    };
  }

  function getConfiguredMailboxIds() {
    return config.enabled && config.user && config.password ? [config.user] : [];
  }

  // Etiketten har EN källa: den här funktionen. Brevlådeväljaren i
  // konversationer v2 renderar det som står här, via mailboxCapabilities i
  // /cco/runtime/status. Härled den inte på nytt i frontend — då får vi samma
  // namn på två ställen och de glider isär.
  const MAILBOX_LABEL = 'fazli.se';

  function getMailboxStatus(mailboxId = '') {
    if (normalizeEmail(mailboxId) !== config.user) return null;
    const active = getConfiguredMailboxIds().length > 0;
    return {
      id: config.user,
      mailboxId: config.user,
      label: MAILBOX_LABEL,
      provider: 'imap',
      active,
      status: active ? 'active' : 'inactive',
    };
  }

  async function getCheckpoint(folderType) {
    if (typeof truthStore.ensureMailboxLoaded === 'function') {
      await truthStore.ensureMailboxLoaded(config.user);
    }
    return typeof truthStore.getSyncCheckpoint === 'function'
      ? truthStore.getSyncCheckpoint(config.user, folderType) || {}
      : {};
  }

  async function cacheAttachments({ messageId, attachments = [] }) {
    const metadata = [];
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = asObject(attachments[index]);
      const attachmentId = toSafeAttachmentId(index, attachment);
      const buffer = Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(attachment.content || '');
      const isInline =
        attachment.contentDisposition === 'inline' || Boolean(normalizeText(attachment.contentId));
      const cached = assetCache?.put
        ? await assetCache.put(
            { mailboxId: config.user, messageId, attachmentId },
            {
              buffer,
              name: attachment.filename,
              contentType: attachment.contentType,
              isInline,
            }
          )
        : { cached: false, reason: 'asset_cache_unavailable' };
      metadata.push({
        id: attachmentId,
        name: normalizeText(attachment.filename) || 'bilaga',
        contentType: normalizeText(attachment.contentType) || 'application/octet-stream',
        contentId: normalizeText(attachment.contentId).replace(/[<>]/g, '') || null,
        isInline,
        size: Math.max(0, Number(attachment.size) || buffer.length),
        sourceType: 'imap_attachment',
        contentBytesAvailable: cached.cached === true,
      });
    }
    return metadata;
  }

  async function toTruthMessage({ uid, folderType, parsed }) {
    const graphMessageId = `imap:${folderType}:${uid}`;
    const attachments = await cacheAttachments({
      messageId: graphMessageId,
      attachments: parsed.attachments,
    });
    const from = toParticipants(parsed.from)[0] || null;
    const conversationId = toThreadId(parsed, uid);
    return {
      mailboxId: config.user,
      mailboxAddress: config.user,
      userPrincipalName: config.user,
      graphUserId: `imap:${config.user}`,
      provider: 'imap',
      graphMessageId,
      immutableGraphId: graphMessageId,
      folderId: config.folderNames[folderType],
      folderType,
      conversationId,
      mailboxConversationId: toMailboxConversationId({
        mailboxId: config.user,
        conversationId,
        internetMessageId: parsed.messageId,
        graphMessageId,
      }),
      internetMessageId: normalizeText(parsed.messageId) || null,
      inReplyTo: normalizeText(parsed.inReplyTo) || null,
      references: parsed.references || null,
      subject: normalizeText(parsed.subject),
      bodyPreview: (
        normalizeText(parsed.text) || normalizeText(parsed.html).replace(/<[^>]+>/g, ' ')
      )
        .replace(/\s+/g, ' ')
        .slice(0, 512),
      bodyHtml: normalizeText(parsed.html) || '',
      bodyText: normalizeText(parsed.text) || '',
      receivedAt: folderType === 'inbox' ? parsed.date : null,
      sentAt: folderType === 'sent' ? parsed.date : null,
      createdAt: parsed.date,
      lastModifiedAt: parsed.date,
      direction: folderType === 'sent' ? 'outbound' : 'inbound',
      isRead: null,
      from,
      sender: from,
      toRecipients: toParticipants(parsed.to),
      ccRecipients: toParticipants(parsed.cc),
      replyToRecipients: toParticipants(parsed.replyTo),
      hasAttachments: attachments.length > 0,
      attachments,
    };
  }

  async function syncFolder({ client, folderType, runId }) {
    const folderName = config.folderNames[folderType];
    const opened = await client.mailboxOpen(folderName, { readOnly: true });
    const mailboxMeta = opened || client.mailbox || {};
    const checkpoint = await getCheckpoint(folderType);
    const lastUid = parseLastUid(checkpoint);
    const searchQuery = buildFolderSearchQuery({
      lastUid,
      since: config.since,
      limit: config.maxMessagesPerCycle,
    });
    const searchedUids = asArray(await client.search(searchQuery, { uid: true }));
    const planned = resolveUidBatch({
      lastUid,
      searchedUids,
      limit: config.maxMessagesPerCycle,
      uidCeiling: mailboxUidCeiling(mailboxMeta),
    });
    // Drop search result ASAP — never keep a full-mailbox UID array around.
    searchedUids.length = 0;

    const changes = [];
    const messageIds = [];
    const skippedTooLarge = [];
    let highestUid = lastUid;
    const parse = parseMessageImpl || defaultParseMessage;

    for (const uid of planned.batch) {
      highestUid = Math.max(highestUid, uid);
      let source = null;
      try {
        const raw = await client.fetchOne(String(uid), { source: true }, { uid: true });
        source = raw?.source || null;
        if (!source) continue;
        if (Buffer.byteLength(source) > config.maxMessageBytes) {
          skippedTooLarge.push(uid);
          continue;
        }
        const parsed = await parse(source);
        // Detach attachment buffers from the truth payload after cache write.
        const message = await toTruthMessage({ uid, folderType, parsed });
        if (Array.isArray(parsed.attachments)) {
          for (const attachment of parsed.attachments) {
            if (attachment && attachment.content) attachment.content = null;
          }
        }
        changes.push({ changeType: 'upsert', graphMessageId: message.graphMessageId, message });
        messageIds.push(message.graphMessageId);
      } finally {
        source = null;
      }
    }

    // Persist cursor even when the window was empty (gap skip) so we never
    // re-scan the same UID range forever after deletes.
    highestUid = Math.max(highestUid, Number(planned.advanceToUid) || 0);

    const counts = toFolderCounts(mailboxMeta);
    await truthStore.recordDeltaPage({
      runId,
      account: {
        mailboxId: config.user,
        mailboxAddress: config.user,
        userPrincipalName: config.user,
        graphUserId: `imap:${config.user}`,
        provider: 'imap',
      },
      folder: {
        folderId: folderName,
        folderName,
        folderType,
        wellKnownName: folderType,
        ...counts,
      },
      changes,
      pageSize: planned.batch.length,
      deltaLink: cursorLink({ folderType, uid: highestUid }),
      sourcePageUrl: `imap://${config.host}/${encodeURIComponent(folderName)}`,
      complete: true,
      roundType: lastUid > 0 ? 'incremental_imap_uid' : 'initial_imap_uid',
    });
    return {
      folderType,
      folderName,
      scanned: planned.batch.length,
      imported: messageIds.length,
      remainingBacklog: planned.remainingBacklog,
      messageIds,
      skippedTooLarge,
      lastUid: highestUid,
      uidWindow: lastUid > 0 ? { from: planned.fromUid, to: planned.toUid } : null,
    };
  }

  async function syncMailbox() {
    const base = {
      ok: true,
      mailboxEmail: config.user || null,
      provider: 'imap',
      folders: [],
      changedMessageIds: [],
      errors: [],
      syncedAt: nowIso(),
    };
    if (!config.enabled)
      return { ...base, ok: false, error: 'ARCANA_CCO_IMAP_ENABLED är inte true' };
    if (!config.user || !config.password) {
      return { ...base, ok: false, error: 'ARCANA_CCO_IMAP_USER/ARCANA_CCO_IMAP_PASSWORD saknas' };
    }

    const factory = imapClientFactory || defaultClientFactory;
    let client = null;
    const run = await truthStore.startDeltaRun({
      mailboxIds: [config.user],
      folderTypes: config.folderTypes,
      mode: 'cco_imap_uid_sync',
    });
    try {
      client = await factory();
      for (const folderType of config.folderTypes) {
        try {
          const result = await syncFolder({ client, folderType, runId: run.runId });
          base.folders.push(result);
          base.changedMessageIds.push(...result.messageIds);
        } catch (error) {
          const message = normalizeText(error?.message) || 'imap_folder_sync_failed';
          base.errors.push({ folderType, error: message });
          await truthStore.recordDeltaError({
            runId: run.runId,
            account: {
              mailboxId: config.user,
              mailboxAddress: config.user,
              graphUserId: `imap:${config.user}`,
            },
            folderType,
            errorCode: 'imap_folder_sync_failed',
            errorMessage: message,
          });
        }
      }
      base.ok = base.errors.length === 0;
      await truthStore.finishDeltaRun(run.runId, {
        status: base.ok ? 'completed' : 'completed_with_errors',
        error: base.errors.length
          ? base.errors.map((item) => `${item.folderType}:${item.error}`).join('; ')
          : null,
      });
      return base;
    } catch (error) {
      const message = normalizeText(error?.message) || 'imap_sync_failed';
      await truthStore.finishDeltaRun(run.runId, { status: 'failed', error: message });
      logger?.error?.('[cco-imap] mailbox sync failed', message);
      return { ...base, ok: false, error: message };
    } finally {
      try {
        await client?.logout?.();
      } catch {
        // The next read-only cycle will reconnect. Logout must not mask a sync result.
      }
    }
  }

  return {
    getConfiguredMailboxIds,
    getMailboxStatus,
    readConfig: () => ({ ...config, password: config.password ? '***' : '' }),
    syncMailbox,
  };
}

module.exports = {
  createCcoImapMailboxSync,
  readCcoImapConfig,
  parseLastUid,
  resolveUidBatch,
  buildFolderSearchQuery,
  mailboxUidCeiling,
  DEFAULT_MAX_MESSAGES_PER_CYCLE,
};
