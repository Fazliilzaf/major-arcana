const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// Tillåtna marknadsföringskanaler (GDPR + ePrivacy: per-kanal samtycke).
const VALID_CHANNELS = ['email', 'sms', 'post', 'phone'];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeChannel(value) {
  return normalizeKey(value);
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, consents: [], tokens: [] };
}

function consentKey(customerId, channel) {
  return `${normalizeKey(customerId)}::${normalizeChannel(channel)}`;
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function createCcoMarketingConsentStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoMarketingConsentStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    consents: Array.isArray(state?.consents) ? state.consents : [],
    tokens: Array.isArray(state?.tokens) ? state.tokens : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(customerId, channel) {
    const key = consentKey(customerId, channel);
    return state.consents.findIndex((c) => consentKey(c.customerId, c.channel) === key);
  }

  function getConsent(customerId, channel) {
    const idx = findIndex(customerId, channel);
    if (idx === -1) {
      return {
        customerId: normalizeKey(customerId),
        channel: normalizeChannel(channel),
        state: 'unknown',
        updatedAt: null,
        history: [],
        exists: false,
      };
    }
    return { ...state.consents[idx], exists: true };
  }

  // Status för en kund över alla kanaler.
  function getStatus(customerId) {
    const custKey = normalizeKey(customerId);
    const channels = {};
    for (const ch of VALID_CHANNELS) {
      const idx = findIndex(custKey, ch);
      if (idx === -1) {
        channels[ch] = { state: 'unknown', updatedAt: null, optedIn: false };
      } else {
        const rec = state.consents[idx];
        channels[ch] = {
          state: rec.state,
          updatedAt: rec.updatedAt,
          optedIn: rec.state === 'opted_in',
        };
      }
    }
    return { customerId: custKey, channels };
  }

  async function upsert(customerId, channel, nextState, actor, detail) {
    const custKey = normalizeKey(customerId);
    const ch = normalizeChannel(channel);
    if (!custKey) throw badRequest('customerId krävs.');
    if (!VALID_CHANNELS.includes(ch)) {
      throw badRequest(`Ogiltig kanal. Tillåtna: ${VALID_CHANNELS.join(', ')}.`);
    }

    const ts = nowIso();
    const historyEntry = {
      state: nextState,
      role: normalizeText(actor?.role) || 'system',
      at: ts,
      ...detail,
    };

    const idx = findIndex(custKey, ch);
    let record;
    if (idx === -1) {
      record = {
        customerId: custKey,
        channel: ch,
        state: nextState,
        createdAt: ts,
        updatedAt: ts,
        history: [historyEntry],
      };
      state.consents.push(record);
    } else {
      record = state.consents[idx];
      record.state = nextState;
      record.updatedAt = ts;
      record.history = [...(record.history || []), historyEntry];
    }
    await save();
    return record;
  }

  async function setOptIn(customerId, channel, opts = {}) {
    const { actorRole, ipAddress, templateVersion, source, note } = opts;
    const detail = {
      ipAddress: normalizeText(ipAddress) || null,
      templateVersion: normalizeText(templateVersion) || null,
      source: normalizeText(source) || null,
      note: normalizeText(note) || null,
    };
    const record = await upsert(customerId, channel, 'opted_in', { role: actorRole }, detail);

    if (auditLog) {
      auditLog.append({
        action: 'cco.marketing_consent.opt_in',
        actor: { role: normalizeText(actorRole) || 'system', userId: opts.userId || null },
        target: { kind: 'marketing_consent', id: consentKey(record.customerId, record.channel) },
        detail: { channel: record.channel, source: detail.source },
      });
    }

    return { ...record, exists: true };
  }

  async function setOptOut(customerId, channel, opts = {}) {
    const { actorRole, reason, source } = opts;
    const detail = {
      reason: normalizeText(reason) || null,
      source: normalizeText(source) || null,
    };
    const record = await upsert(customerId, channel, 'opted_out', { role: actorRole }, detail);

    if (auditLog) {
      auditLog.append({
        action: 'cco.marketing_consent.opt_out',
        actor: { role: normalizeText(actorRole) || 'system', userId: opts.userId || null },
        target: { kind: 'marketing_consent', id: consentKey(record.customerId, record.channel) },
        detail: { channel: record.channel, reason: detail.reason, source: detail.source },
      });
    }

    return { ...record, exists: true };
  }

  // Kontrollera om vi får skicka marknadsföring på en kanal just nu.
  function canSendMarketing(customerId, channel) {
    const ch = normalizeChannel(channel);
    if (!VALID_CHANNELS.includes(ch)) {
      return {
        canSend: false,
        reason: `Ogiltig kanal. Tillåtna: ${VALID_CHANNELS.join(', ')}.`,
        currentState: 'invalid_channel',
      };
    }
    const consent = getConsent(customerId, ch);
    if (consent.state === 'opted_in') {
      return { canSend: true, reason: null, currentState: 'opted_in' };
    }
    if (consent.state === 'opted_out') {
      return {
        canSend: false,
        reason: 'Kunden har avregistrerat sig från denna kanal.',
        currentState: 'opted_out',
      };
    }
    return {
      canSend: false,
      reason: 'Inget aktivt samtycke för denna kanal.',
      currentState: consent.state || 'unknown',
    };
  }

  // Mynta en token för one-click unsubscribe.
  async function createUnsubscribeToken(customerId, channel, opts = {}) {
    const custKey = normalizeKey(customerId);
    const ch = normalizeChannel(channel);
    if (!custKey) throw badRequest('customerId krävs.');
    if (!VALID_CHANNELS.includes(ch)) {
      throw badRequest(`Ogiltig kanal. Tillåtna: ${VALID_CHANNELS.join(', ')}.`);
    }
    const token = crypto.randomBytes(24).toString('hex');
    state.tokens.push({
      token,
      customerId: custKey,
      channel: ch,
      sendId: normalizeText(opts.sendId) || null,
      createdAt: nowIso(),
      usedAt: null,
    });
    await save();
    return token;
  }

  function stats() {
    const byState = { opted_in: 0, opted_out: 0, unknown: 0 };
    const byChannel = {};
    for (const ch of VALID_CHANNELS) {
      byChannel[ch] = { opted_in: 0, opted_out: 0 };
    }
    for (const c of state.consents) {
      byState[c.state] = (byState[c.state] || 0) + 1;
      if (byChannel[c.channel]) {
        byChannel[c.channel][c.state] = (byChannel[c.channel][c.state] || 0) + 1;
      }
    }
    return {
      totalConsents: state.consents.length,
      totalTokens: state.tokens.length,
      byState,
      byChannel,
    };
  }

  return {
    getStatus,
    setOptIn,
    setOptOut,
    stats,
    canSendMarketing,
    createUnsubscribeToken,
  };
}

module.exports = { createCcoMarketingConsentStore, VALID_CHANNELS };
