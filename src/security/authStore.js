const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { hashPassword, verifyPassword } = require('./password');
const { ROLE_OWNER, ROLE_STAFF, normalizeRole, isValidRole } = require('./roles');
const { getRequestContext } = require('../observability/requestContext');
const { publishRuntimeEvent } = require('../observability/eventBus');

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeTenantId(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_TOTP_STEP_SEC = 30;
const MFA_TOTP_DIGITS = 6;
const MFA_TOTP_WINDOW = 1;
const MFA_RECOVERY_CODE_COUNT = 10;
const MFA_MAX_VERIFY_ATTEMPTS = 10;

function normalizeMfaCode(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecoveryCode(value) {
  return normalizeMfaCode(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function safeEqualText(a, b) {
  const aText = String(a || '');
  const bText = String(b || '');
  const aBuffer = Buffer.from(aText, 'utf8');
  const bBuffer = Buffer.from(bText, 'utf8');
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function hashRecoveryCode(normalizedCode) {
  return crypto.createHash('sha256').update(String(normalizedCode || '')).digest('hex');
}

function encodeBase32(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!bytes.length) return '';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(value) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');
  if (!normalized) return Buffer.alloc(0);
  let bits = 0;
  let current = 0;
  const out = [];
  for (const ch of normalized) {
    const index = BASE32_ALPHABET.indexOf(ch);
    if (index < 0) continue;
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateMfaSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function formatRecoveryCode(rawHex) {
  const value = String(rawHex || '')
    .toUpperCase()
    .replace(/[^A-F0-9]/g, '')
    .padEnd(16, '0')
    .slice(0, 16);
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`;
}

function generateRecoveryCodes(count = MFA_RECOVERY_CODE_COUNT) {
  const codes = [];
  const hashes = [];
  const total = Math.max(1, Math.min(50, Number(count) || MFA_RECOVERY_CODE_COUNT));
  for (let index = 0; index < total; index += 1) {
    const code = formatRecoveryCode(crypto.randomBytes(8).toString('hex'));
    const normalized = normalizeRecoveryCode(code);
    codes.push(code);
    hashes.push(hashRecoveryCode(normalized));
  }
  return { codes, hashes };
}

function generateTotpToken(secret, counter) {
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedSecret) return '';
  const key = decodeBase32(normalizedSecret);
  if (!key.length) return '';
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(Math.max(0, Number(counter) || 0)));
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const divisor = 10 ** MFA_TOTP_DIGITS;
  const token = binary % divisor;
  return String(token).padStart(MFA_TOTP_DIGITS, '0');
}

function verifyTotpCode(secret, code, { nowMs = Date.now(), window = MFA_TOTP_WINDOW } = {}) {
  const normalizedCode = normalizeMfaCode(code);
  if (!/^\d{6}$/.test(normalizedCode)) return false;
  const baseCounter = Math.floor(Math.max(0, Number(nowMs) || Date.now()) / 1000 / MFA_TOTP_STEP_SEC);
  const clampedWindow = Math.max(0, Math.min(3, Number(window) || MFA_TOTP_WINDOW));
  for (let offset = -clampedWindow; offset <= clampedWindow; offset += 1) {
    const candidate = generateTotpToken(secret, baseCounter + offset);
    if (candidate && safeEqualText(candidate, normalizedCode)) {
      return true;
    }
  }
  return false;
}

function buildOtpAuthUrl({ secret, email, issuer = 'Arcana' }) {
  const normalizedSecret = String(secret || '').trim();
  const normalizedEmail = normalizeEmail(email);
  const safeIssuer = normalizeMfaCode(issuer) || 'Arcana';
  if (!normalizedSecret || !normalizedEmail) return '';
  const label = encodeURIComponent(`${safeIssuer}:${normalizedEmail}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(
    normalizedSecret
  )}&issuer=${encodeURIComponent(safeIssuer)}&algorithm=SHA1&digits=${MFA_TOTP_DIGITS}&period=${MFA_TOTP_STEP_SEC}`;
}

const AUDIT_CHAIN_VERSION = 1;

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function normalizeJsonValue(value) {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJsonValue(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (typeof value === 'object') {
    const source = safeObject(value);
    const out = {};
    for (const key of Object.keys(source).sort()) {
      const normalized = normalizeJsonValue(source[key]);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

function stableJson(value) {
  const normalized = normalizeJsonValue(value);
  if (normalized === undefined) return 'null';
  return JSON.stringify(normalized);
}

function toAuditEventPayload(event) {
  return {
    id: String(event?.id || ''),
    ts: String(event?.ts || ''),
    tenantId: event?.tenantId || null,
    actorUserId: event?.actorUserId || null,
    action: String(event?.action || 'unknown'),
    outcome: String(event?.outcome || 'unknown'),
    targetType: String(event?.targetType || ''),
    targetId: String(event?.targetId || ''),
    metadata: safeObject(event?.metadata),
  };
}

function computeAuditEventHash({ seq, prevHash = null, event }) {
  const payload = {
    v: AUDIT_CHAIN_VERSION,
    seq: Number(seq),
    prevHash: prevHash || null,
    event: toAuditEventPayload(event),
  };
  return crypto.createHash('sha256').update(stableJson(payload)).digest('hex');
}

function hasAuditChainFields(event) {
  return (
    Number.isInteger(event?.seq) &&
    event.seq > 0 &&
    (event.prevHash === null || isSha256Hex(event.prevHash)) &&
    isSha256Hex(event.hash)
  );
}

function toSafeAuditEvent(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    ...event,
    metadata: safeObject(event.metadata),
  };
}

function emptyState() {
  return {
    users: {},
    memberships: {},
    sessions: {},
    pendingLogins: {},
    pendingMfaChallenges: {},
    auditEvents: [],
  };
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
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors; tmp may not exist if write failed early.
    }
    throw error;
  }
}

function toSafeUser(user) {
  if (!user) return null;
  const mfaSecret = typeof user.mfaSecret === 'string' ? user.mfaSecret.trim() : '';
  const recoveryCodeHashes = Array.isArray(user.mfaRecoveryCodeHashes)
    ? user.mfaRecoveryCodeHashes
    : [];
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    mfaRequired: Boolean(user.mfaRequired),
    mfaConfigured: Boolean(mfaSecret),
    mfaRecoveryCodesRemaining: recoveryCodeHashes.length,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toSafeMembership(membership) {
  if (!membership) return null;
  return {
    id: membership.id,
    userId: membership.userId,
    tenantId: membership.tenantId,
    role: membership.role,
    status: membership.status,
    createdBy: membership.createdBy || null,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

function toSafeSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    userId: session.userId,
    membershipId: session.membershipId,
    tenantId: session.tenantId,
    role: session.role,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt || null,
  };
}

async function createAuthStore({
  filePath,
  sessionTtlMs,
  sessionIdleTtlMs = 0,
  loginTicketTtlMs,
  auditMaxEntries = 5000,
  auditAppendOnly = true,
}) {
  const rawState = await readJson(filePath, emptyState());
  const state = {
    users: safeObject(rawState.users),
    memberships: safeObject(rawState.memberships),
    sessions: safeObject(rawState.sessions),
    pendingLogins: safeObject(rawState.pendingLogins),
    pendingMfaChallenges: safeObject(rawState.pendingMfaChallenges),
    auditEvents: Array.isArray(rawState.auditEvents) ? rawState.auditEvents : [],
  };

  function inspectAuditChain({ repairMissing = false, maxIssues = 25 } = {}) {
    const clampedMaxIssues = Math.max(1, Math.min(500, Number(maxIssues) || 25));
    const issues = [];
    let changed = false;

    function pushIssue(type, details = {}) {
      if (issues.length >= clampedMaxIssues) return;
      issues.push({ type, ...details });
    }

    let expectedPrevHash = null;
    let expectedSeq = 0;
    let head = null;
    let tail = null;

    for (let index = 0; index < state.auditEvents.length; index += 1) {
      const event = state.auditEvents[index];
      if (!event || typeof event !== 'object') {
        pushIssue('invalid_event_shape', { index });
        continue;
      }

      const nextExpectedSeq = expectedSeq + 1;
      const expectedHash = computeAuditEventHash({
        seq: nextExpectedSeq,
        prevHash: expectedPrevHash,
        event,
      });
      const hasChain = hasAuditChainFields(event);

      if (!hasChain) {
        if (repairMissing) {
          event.seq = nextExpectedSeq;
          event.prevHash = expectedPrevHash;
          event.hash = expectedHash;
          event.chainVersion = AUDIT_CHAIN_VERSION;
          changed = true;
        } else {
          pushIssue('missing_chain_fields', {
            index,
            eventId: event.id || null,
          });
        }
      } else {
        if (event.chainVersion === undefined && repairMissing) {
          event.chainVersion = AUDIT_CHAIN_VERSION;
          changed = true;
        } else if (event.chainVersion !== AUDIT_CHAIN_VERSION) {
          pushIssue('chain_version_mismatch', {
            index,
            eventId: event.id || null,
            expected: AUDIT_CHAIN_VERSION,
            actual: event.chainVersion,
          });
        }
        if (event.seq !== nextExpectedSeq) {
          pushIssue('sequence_mismatch', {
            index,
            eventId: event.id || null,
            expected: nextExpectedSeq,
            actual: event.seq,
          });
        }
        if ((event.prevHash || null) !== (expectedPrevHash || null)) {
          pushIssue('prev_hash_mismatch', {
            index,
            eventId: event.id || null,
            expected: expectedPrevHash || null,
            actual: event.prevHash || null,
          });
        }
        if (event.hash !== expectedHash) {
          pushIssue('hash_mismatch', {
            index,
            eventId: event.id || null,
            expected: expectedHash,
            actual: event.hash || null,
          });
        }
      }

      const currentSeq = hasChain ? event.seq : nextExpectedSeq;
      const currentHash = hasChain ? event.hash : expectedHash;
      if (!head) {
        head = {
          id: event.id || null,
          ts: event.ts || null,
          seq: currentSeq,
          hash: currentHash,
        };
      }
      tail = {
        id: event.id || null,
        ts: event.ts || null,
        seq: currentSeq,
        hash: currentHash,
      };

      expectedSeq = currentSeq;
      expectedPrevHash = currentHash;
    }

    return {
      changed,
      checkedEvents: state.auditEvents.length,
      head,
      tail,
      issues,
    };
  }

  const auditChainMigration = inspectAuditChain({ repairMissing: false, maxIssues: 50 });
  if (auditChainMigration.issues.length > 0) {
    console.warn(
      `Audit chain warning: ${auditChainMigration.issues.length} issue(s) detected in ${filePath}. Run scripts/audit-repair.js explicitly if repair is required.`
    );
  }

  const idleTtlMs = Number.isFinite(Number(sessionIdleTtlMs))
    ? Math.max(0, Number(sessionIdleTtlMs))
    : 0;

  function getSessionTiming(session, now = Date.now()) {
    const expiresAt = Date.parse(session?.expiresAt || '');
    const absoluteExpired = !Number.isFinite(expiresAt) || expiresAt <= now;

    const lastSeenAt = Date.parse(session?.lastSeenAt || session?.createdAt || '');
    const idleExpired = idleTtlMs > 0 && Number.isFinite(lastSeenAt) && lastSeenAt + idleTtlMs <= now;

    return {
      expired: absoluteExpired || idleExpired,
      reason: idleExpired ? 'idle_timeout' : 'expired',
    };
  }

  function prune() {
    let changed = false;
    const now = Date.now();

    for (const [id, session] of Object.entries(state.sessions)) {
      const timing = getSessionTiming(session, now);
      const revokedAt = Date.parse(session.revokedAt || '');
      if (timing.expired) {
        delete state.sessions[id];
        changed = true;
        continue;
      }
      if (Number.isFinite(revokedAt) && revokedAt + 24 * 60 * 60 * 1000 <= now) {
        delete state.sessions[id];
        changed = true;
      }
    }

    for (const [ticket, pending] of Object.entries(state.pendingLogins)) {
      const expiresAt = Date.parse(pending.expiresAt || '');
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        delete state.pendingLogins[ticket];
        changed = true;
      }
    }

    for (const [ticket, challenge] of Object.entries(state.pendingMfaChallenges)) {
      const expiresAt = Date.parse(challenge.expiresAt || '');
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        delete state.pendingMfaChallenges[ticket];
        changed = true;
      }
    }

    if (auditMaxEntries > 0 && state.auditEvents.length > auditMaxEntries) {
      state.auditEvents = state.auditEvents.slice(-auditMaxEntries);
      changed = true;
    }
    return changed;
  }

  async function save() {
    prune();
    await writeJsonAtomic(filePath, state);
  }

  function findRawUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    for (const user of Object.values(state.users)) {
      if (normalizeEmail(user.email) === normalizedEmail) {
        return user;
      }
    }
    return null;
  }

  function listRawMembershipsForUser(userId, { includeDisabled = false } = {}) {
    return Object.values(state.memberships).filter((membership) => {
      if (membership.userId !== userId) return false;
      if (!includeDisabled && membership.status !== 'active') return false;
      return true;
    });
  }

  function findRawMembershipForUserAndTenant(userId, tenantId) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) return null;
    return (
      Object.values(state.memberships).find(
        (membership) =>
          membership.userId === userId &&
          normalizeTenantId(membership.tenantId) === normalizedTenantId
      ) || null
    );
  }

  function getRawSessionByToken(token) {
    const tokenHash = hashToken(token);
    for (const session of Object.values(state.sessions)) {
      if (session.tokenHash === tokenHash) return session;
    }
    return null;
  }

  function getAuditTail() {
    const total = state.auditEvents.length;
    if (total === 0) {
      return { seq: 0, hash: null };
    }
    const last = state.auditEvents[total - 1];
    if (hasAuditChainFields(last)) {
      return {
        seq: last.seq,
        hash: last.hash,
      };
    }
    const seq = Number.isInteger(last?.seq) && last.seq > 0 ? last.seq : total;
    const prevHash = last?.prevHash && isSha256Hex(last.prevHash) ? last.prevHash : null;
    const hash = isSha256Hex(last?.hash)
      ? last.hash
      : computeAuditEventHash({ seq, prevHash, event: last });
    return { seq, hash };
  }

  async function verifyAuditIntegrity({ maxIssues = 25 } = {}) {
    const inspected = inspectAuditChain({ repairMissing: false, maxIssues });
    return {
      ok: inspected.issues.length === 0,
      chainVersion: AUDIT_CHAIN_VERSION,
      appendOnly: Boolean(auditAppendOnly),
      totalEvents: state.auditEvents.length,
      checkedEvents: inspected.checkedEvents,
      head: inspected.head,
      tail: inspected.tail,
      issues: inspected.issues,
      generatedAt: nowIso(),
    };
  }

  async function addAuditEvent({
    tenantId = null,
    actorUserId = null,
    action,
    outcome = 'success',
    targetType = '',
    targetId = '',
    metadata = {},
  }) {
    const { seq: lastSeq, hash: lastHash } = getAuditTail();
    const nextSeq = lastSeq + 1;
    const metadataValue = metadata && typeof metadata === 'object' ? safeObject(metadata) : {};
    const requestContext = getRequestContext();
    const correlationId = normalizeText(requestContext?.correlationId || '');
    if (correlationId && !normalizeText(metadataValue?.correlationId)) {
      metadataValue.correlationId = correlationId;
    }
    const event = {
      id: crypto.randomUUID(),
      ts: nowIso(),
      tenantId: tenantId || null,
      actorUserId: actorUserId || null,
      action: String(action || 'unknown'),
      outcome: String(outcome || 'unknown'),
      targetType: String(targetType || ''),
      targetId: String(targetId || ''),
      metadata: metadataValue,
      chainVersion: AUDIT_CHAIN_VERSION,
      seq: nextSeq,
      prevHash: lastHash || null,
    };
    event.hash = computeAuditEventHash({
      seq: nextSeq,
      prevHash: event.prevHash,
      event,
    });
    state.auditEvents.push(event);
    await save();
    const safeEvent = toSafeAuditEvent(event);
    publishRuntimeEvent('audit.event', safeEvent);
    return safeEvent;
  }

  async function createUser({ email, password, mfaRequired = false }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error('E-postadress saknas.');
    }
    const existing = findRawUserByEmail(normalizedEmail);
    if (existing) {
      throw new Error('Användaren finns redan.');
    }
    const passwordDigest = await hashPassword(password);
    const createdAt = nowIso();
    const user = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordHash: passwordDigest.hash,
      passwordSalt: passwordDigest.salt,
      mfaRequired: Boolean(mfaRequired),
      mfaSecret: '',
      mfaRecoveryCodeHashes: [],
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    };
    state.users[user.id] = user;
    await save();
    return toSafeUser(user);
  }

  async function setUserPassword(userId, password) {
    const user = state.users[userId];
    if (!user) return null;
    const passwordDigest = await hashPassword(password);
    user.passwordHash = passwordDigest.hash;
    user.passwordSalt = passwordDigest.salt;
    user.updatedAt = nowIso();
    await save();
    return toSafeUser(user);
  }

  async function getUserById(userId) {
    const user = state.users[userId];
    return toSafeUser(user);
  }

  async function authenticateUser({ email, password }) {
    const user = findRawUserByEmail(email);
    if (!user || user.status !== 'active') return null;
    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) return null;
    return toSafeUser(user);
  }

  async function listMembershipsForUser(userId, { includeDisabled = false } = {}) {
    return listRawMembershipsForUser(userId, { includeDisabled }).map(toSafeMembership);
  }

  async function ensureMembership({
    userId,
    tenantId,
    role,
    createdBy = null,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedRole = normalizeRole(role);
    if (!normalizedTenantId) {
      throw new Error('tenantId saknas.');
    }
    if (!isValidRole(normalizedRole)) {
      throw new Error('Ogiltig roll.');
    }

    const existing = findRawMembershipForUserAndTenant(userId, normalizedTenantId);
    if (existing) {
      let changed = false;
      if (existing.status !== 'active') {
        existing.status = 'active';
        changed = true;
      }
      if (existing.role !== ROLE_OWNER && existing.role !== normalizedRole) {
        existing.role = normalizedRole;
        changed = true;
      }
      if (changed) {
        existing.updatedAt = nowIso();
        await save();
      }
      return toSafeMembership(existing);
    }

    const createdAt = nowIso();
    const membership = {
      id: crypto.randomUUID(),
      userId,
      tenantId: normalizedTenantId,
      role: normalizedRole,
      status: 'active',
      createdBy,
      createdAt,
      updatedAt: createdAt,
    };
    state.memberships[membership.id] = membership;
    await save();
    return toSafeMembership(membership);
  }

  async function getMembershipById(membershipId) {
    return toSafeMembership(state.memberships[membershipId]);
  }

  async function createPendingLoginTicket({ userId, membershipIds }) {
    const ticket = createSessionToken();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + loginTicketTtlMs).toISOString();
    state.pendingLogins[ticket] = {
      id: crypto.randomUUID(),
      userId,
      membershipIds: Array.isArray(membershipIds) ? membershipIds : [],
      createdAt,
      expiresAt,
    };
    await save();
    return {
      ticket,
      expiresAt,
    };
  }

  async function consumePendingLoginTicket(ticket) {
    const entry = state.pendingLogins[ticket];
    if (!entry) return null;
    delete state.pendingLogins[ticket];
    await save();

    const expiresAt = Date.parse(entry.expiresAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }

    return entry;
  }

  async function createPendingMfaChallenge({
    userId,
    membershipIds = [],
    selectedMembershipId = '',
    requestedTenantId = '',
  }) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!normalizedUserId) {
      throw new Error('userId saknas för MFA challenge.');
    }
    const user = state.users[normalizedUserId];
    if (!user || user.status !== 'active') {
      throw new Error('Användaren är inte aktiv.');
    }

    const uniqueMembershipIds = Array.isArray(membershipIds)
      ? [...new Set(membershipIds.map((item) => String(item || '').trim()).filter(Boolean))]
      : [];
    const normalizedSelectedMembershipId =
      typeof selectedMembershipId === 'string' ? selectedMembershipId.trim() : '';
    const normalizedRequestedTenantId = normalizeTenantId(requestedTenantId);

    const ticket = createSessionToken();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + loginTicketTtlMs).toISOString();
    const existingSecret = typeof user.mfaSecret === 'string' ? user.mfaSecret.trim() : '';
    const setupRequired = !existingSecret;

    const challenge = {
      id: crypto.randomUUID(),
      userId: normalizedUserId,
      membershipIds: uniqueMembershipIds,
      selectedMembershipId: normalizedSelectedMembershipId,
      requestedTenantId: normalizedRequestedTenantId,
      setupRequired,
      createdAt,
      expiresAt,
      attempts: 0,
      provisionalSecret: '',
      provisionalRecoveryCodeHashes: [],
    };

    let setup = null;
    if (setupRequired) {
      const secret = generateMfaSecret();
      const recovery = generateRecoveryCodes();
      challenge.provisionalSecret = secret;
      challenge.provisionalRecoveryCodeHashes = recovery.hashes;
      setup = {
        issuer: 'Arcana',
        accountName: user.email,
        secret,
        otpauthUrl: buildOtpAuthUrl({
          secret,
          email: user.email,
          issuer: 'Arcana',
        }),
        recoveryCodes: recovery.codes,
      };
    }

    state.pendingMfaChallenges[ticket] = challenge;
    await save();
    return {
      ticket,
      expiresAt,
      setupRequired,
      setup,
    };
  }

  async function verifyMfaChallenge({
    ticket,
    code,
  }) {
    const normalizedTicket = typeof ticket === 'string' ? ticket.trim() : '';
    const normalizedCode = normalizeMfaCode(code);
    if (!normalizedTicket || !normalizedCode) {
      return { ok: false, error: 'missing_fields' };
    }

    const challenge = state.pendingMfaChallenges[normalizedTicket];
    if (!challenge) return { ok: false, error: 'invalid_ticket' };

    const expiresAtMs = Date.parse(challenge.expiresAt || '');
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      delete state.pendingMfaChallenges[normalizedTicket];
      await save();
      return { ok: false, error: 'expired_ticket', userId: challenge.userId };
    }

    const user = state.users[challenge.userId];
    if (!user || user.status !== 'active') {
      delete state.pendingMfaChallenges[normalizedTicket];
      await save();
      return { ok: false, error: 'user_not_active', userId: challenge.userId };
    }

    const challengeSecret = String(challenge.provisionalSecret || '').trim();
    const userSecret = String(user.mfaSecret || '').trim();
    const effectiveSecret = challenge.setupRequired ? challengeSecret : userSecret;
    const numericCode = /^\d{6}$/.test(normalizedCode);
    const codeNormalizedForRecovery = normalizeRecoveryCode(normalizedCode);
    const challengeRecoveryHashes = Array.isArray(challenge.provisionalRecoveryCodeHashes)
      ? challenge.provisionalRecoveryCodeHashes
      : [];
    const userRecoveryHashes = Array.isArray(user.mfaRecoveryCodeHashes)
      ? user.mfaRecoveryCodeHashes
      : [];
    const effectiveRecoveryHashes = challenge.setupRequired ? challengeRecoveryHashes : userRecoveryHashes;
    const recoveryHash = hashRecoveryCode(codeNormalizedForRecovery);

    let verified = false;
    let usedRecoveryCode = false;
    let usedRecoveryIndex = -1;

    if (numericCode && effectiveSecret) {
      verified = verifyTotpCode(effectiveSecret, normalizedCode);
    }
    if (!verified && codeNormalizedForRecovery) {
      usedRecoveryIndex = effectiveRecoveryHashes.findIndex((item) => safeEqualText(item, recoveryHash));
      if (usedRecoveryIndex >= 0) {
        verified = true;
        usedRecoveryCode = true;
      }
    }

    if (!verified) {
      challenge.attempts = Math.max(0, Number(challenge.attempts) || 0) + 1;
      if (challenge.attempts >= MFA_MAX_VERIFY_ATTEMPTS) {
        delete state.pendingMfaChallenges[normalizedTicket];
      }
      await save();
      return {
        ok: false,
        error: challenge.attempts >= MFA_MAX_VERIFY_ATTEMPTS ? 'too_many_attempts' : 'invalid_code',
        userId: challenge.userId,
      };
    }

    const now = nowIso();
    let setupCompleted = false;
    if (challenge.setupRequired) {
      user.mfaSecret = challengeSecret;
      user.mfaRecoveryCodeHashes = [...challengeRecoveryHashes];
      user.mfaRequired = true;
      user.updatedAt = now;
      setupCompleted = true;
    }

    if (usedRecoveryCode) {
      const targetHashes = Array.isArray(user.mfaRecoveryCodeHashes) ? user.mfaRecoveryCodeHashes : [];
      const targetIndex = targetHashes.findIndex((item) => safeEqualText(item, recoveryHash));
      if (targetIndex >= 0) {
        targetHashes.splice(targetIndex, 1);
        user.mfaRecoveryCodeHashes = targetHashes;
        user.updatedAt = now;
      }
    }

    delete state.pendingMfaChallenges[normalizedTicket];
    await save();

    return {
      ok: true,
      userId: challenge.userId,
      membershipIds: Array.isArray(challenge.membershipIds) ? [...challenge.membershipIds] : [],
      selectedMembershipId: String(challenge.selectedMembershipId || ''),
      requestedTenantId: normalizeTenantId(challenge.requestedTenantId),
      usedRecoveryCode,
      setupCompleted,
      recoveryCodesRemaining: Array.isArray(user.mfaRecoveryCodeHashes)
        ? user.mfaRecoveryCodeHashes.length
        : 0,
    };
  }

  async function createSession({ userId, membershipId }) {
    const user = state.users[userId];
    const membership = state.memberships[membershipId];
    if (!user || user.status !== 'active') {
      throw new Error('Användaren är inte aktiv.');
    }
    if (!membership || membership.status !== 'active' || membership.userId !== userId) {
      throw new Error('Medlemskap saknas eller är inte aktivt.');
    }

    const token = createSessionToken();
    const createdAt = nowIso();
    const session = {
      id: crypto.randomUUID(),
      userId,
      membershipId,
      tenantId: membership.tenantId,
      role: membership.role,
      tokenHash: hashToken(token),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(Date.now() + sessionTtlMs).toISOString(),
      revokedAt: null,
    };

    state.sessions[session.id] = session;
    await save();
    return {
      token,
      session: toSafeSession(session),
    };
  }

  async function getSessionContextByToken(token) {
    const session = getRawSessionByToken(token);
    if (!session) return null;
    if (session.revokedAt) return null;
    const timing = getSessionTiming(session, Date.now());
    if (timing.expired) {
      if (!session.revokedAt) {
        session.revokedAt = nowIso();
        session.revokeReason = timing.reason;
        await save();
      }
      return null;
    }

    const user = state.users[session.userId];
    const membership = state.memberships[session.membershipId];
    if (!user || user.status !== 'active') return null;
    if (!membership || membership.status !== 'active') return null;

    return {
      session: toSafeSession(session),
      user: toSafeUser(user),
      membership: toSafeMembership(membership),
    };
  }

  async function touchSession(sessionId) {
    const session = state.sessions[sessionId];
    if (!session) return null;
    if (session.revokedAt) return null;
    const timing = getSessionTiming(session, Date.now());
    if (timing.expired) {
      session.revokedAt = nowIso();
      session.revokeReason = timing.reason;
      await save();
      return null;
    }
    session.lastSeenAt = nowIso();
    // Rolling session: om mindre än halva TTL återstår, förläng expiresAt
    // till full TTL igen. Förhindrar att aktiv användare blir utloggad mitt i jobbet.
    const expiresAtMs = Date.parse(session.expiresAt || '');
    const createdAtMs = Date.parse(session.createdAt || '');
    if (Number.isFinite(expiresAtMs) && Number.isFinite(createdAtMs)) {
      const totalTtlMs = expiresAtMs - createdAtMs;
      const remainingMs = expiresAtMs - Date.now();
      // Förläng om mindre än halva TTL återstår
      if (totalTtlMs > 0 && remainingMs < totalTtlMs / 2) {
        session.expiresAt = new Date(Date.now() + totalTtlMs).toISOString();
      }
    }
    await save();
    return toSafeSession(session);
  }

  async function revokeSession(sessionId, { reason = 'manual' } = {}) {
    const session = state.sessions[sessionId];
    if (!session) return false;
    if (!session.revokedAt) {
      session.revokedAt = nowIso();
      session.revokeReason = String(reason || 'manual');
      await save();
    }
    return true;
  }

  async function revokeSessionsByMembership(membershipId, { reason = 'membership_disabled' } = {}) {
    let count = 0;
    for (const session of Object.values(state.sessions)) {
      if (session.membershipId !== membershipId) continue;
      if (session.revokedAt) continue;
      session.revokedAt = nowIso();
      session.revokeReason = String(reason || 'membership_disabled');
      count += 1;
    }
    if (count > 0) await save();
    return count;
  }

  async function revokeSessionsByUser(
    userId,
    {
      tenantId = '',
      excludeSessionId = '',
      reason = 'manual',
    } = {}
  ) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedExcludeSessionId =
      typeof excludeSessionId === 'string' ? excludeSessionId.trim() : '';

    if (!normalizedUserId) return { count: 0, revokedSessionIds: [] };

    let count = 0;
    const revokedSessionIds = [];
    for (const session of Object.values(state.sessions)) {
      if (!session || session.userId !== normalizedUserId) continue;
      if (normalizedTenantId && normalizeTenantId(session.tenantId) !== normalizedTenantId) continue;
      if (normalizedExcludeSessionId && session.id === normalizedExcludeSessionId) continue;
      if (session.revokedAt) continue;
      session.revokedAt = nowIso();
      session.revokeReason = String(reason || 'manual');
      revokedSessionIds.push(session.id);
      count += 1;
    }

    if (count > 0) await save();
    return { count, revokedSessionIds };
  }

  async function getSessionById(sessionId) {
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!normalizedSessionId) return null;
    const session = state.sessions[normalizedSessionId];
    return toSafeSession(session);
  }

  async function getSessionDetailsById(sessionId) {
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!normalizedSessionId) return null;
    const session = state.sessions[normalizedSessionId];
    if (!session) return null;
    const user = state.users[session.userId] || null;
    const membership = state.memberships[session.membershipId] || null;
    return {
      session: toSafeSession(session),
      user: toSafeUser(user),
      membership: toSafeMembership(membership),
    };
  }

  async function listSessions({
    tenantId = '',
    userId = '',
    includeRevoked = false,
    limit = 100,
  } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const numericLimit = Number.isFinite(Number(limit)) ? Number(limit) : 100;
    const clampedLimit = Math.max(1, Math.min(500, numericLimit));

    const now = Date.now();
    const sessions = Object.values(state.sessions)
      .filter((session) => {
        if (normalizedTenantId && normalizeTenantId(session.tenantId) !== normalizedTenantId) {
          return false;
        }
        if (normalizedUserId && session.userId !== normalizedUserId) {
          return false;
        }
        if (!includeRevoked && session.revokedAt) {
          return false;
        }
        const timing = getSessionTiming(session, now);
        if (timing.expired) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTs = Date.parse(a.lastSeenAt || a.createdAt || 0);
        const bTs = Date.parse(b.lastSeenAt || b.createdAt || 0);
        return bTs - aTs;
      })
      .slice(0, clampedLimit);

    return sessions.map((session) => toSafeSession(session));
  }

  async function listSessionsDetailed({
    tenantId = '',
    userId = '',
    includeRevoked = false,
    limit = 100,
  } = {}) {
    const sessions = await listSessions({
      tenantId,
      userId,
      includeRevoked,
      limit,
    });

    return sessions.map((session) => {
      const user = state.users[session.userId] || null;
      const membership = state.memberships[session.membershipId] || null;
      return {
        session,
        user: toSafeUser(user),
        membership: toSafeMembership(membership),
      };
    });
  }

  async function updateMembership(membershipId, patch = {}) {
    const membership = state.memberships[membershipId];
    if (!membership) return null;

    let changed = false;
    if (typeof patch.status === 'string') {
      const nextStatus = patch.status.trim().toLowerCase();
      if (['active', 'disabled'].includes(nextStatus) && nextStatus !== membership.status) {
        membership.status = nextStatus;
        changed = true;
      }
    }

    if (typeof patch.role === 'string') {
      const nextRole = normalizeRole(patch.role);
      if (isValidRole(nextRole) && membership.role !== nextRole) {
        membership.role = nextRole;
        changed = true;
      }
    }

    if (!changed) return toSafeMembership(membership);

    membership.updatedAt = nowIso();
    await save();
    return toSafeMembership(membership);
  }

  async function upsertStaffMember({
    tenantId,
    email,
    password,
    actorUserId = null,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new Error('tenantId saknas.');
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error('E-postadress saknas.');
    if (typeof password !== 'string' || !password.trim()) {
      throw new Error('Lösenord saknas.');
    }

    let rawUser = findRawUserByEmail(normalizedEmail);
    let createdUser = false;

    if (!rawUser) {
      const created = await createUser({ email: normalizedEmail, password });
      rawUser = state.users[created.id];
      createdUser = true;
    } else if (rawUser.status !== 'active') {
      rawUser.status = 'active';
      rawUser.updatedAt = nowIso();
      await setUserPassword(rawUser.id, password);
    }

    const currentMembership = findRawMembershipForUserAndTenant(rawUser.id, normalizedTenantId);
    if (currentMembership && currentMembership.role === ROLE_OWNER) {
      throw new Error('Kan inte skriva över en OWNER-medlem som STAFF.');
    }

    const membership = await ensureMembership({
      userId: rawUser.id,
      tenantId: normalizedTenantId,
      role: ROLE_STAFF,
      createdBy: actorUserId,
    });

    return {
      user: toSafeUser(rawUser),
      membership,
      createdUser,
    };
  }

  async function upsertOwnerMember({
    tenantId,
    email,
    password,
    actorUserId = null,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new Error('tenantId saknas.');
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error('E-postadress saknas.');
    if (typeof password !== 'string' || !password.trim()) {
      throw new Error('Lösenord saknas.');
    }

    let rawUser = findRawUserByEmail(normalizedEmail);
    let createdUser = false;

    if (!rawUser) {
      const created = await createUser({ email: normalizedEmail, password, mfaRequired: true });
      rawUser = state.users[created.id];
      createdUser = true;
    } else if (rawUser.status !== 'active') {
      rawUser.status = 'active';
      rawUser.updatedAt = nowIso();
      await setUserPassword(rawUser.id, password);
    } else if (password.trim()) {
      await setUserPassword(rawUser.id, password);
    }

    const membership = await ensureMembership({
      userId: rawUser.id,
      tenantId: normalizedTenantId,
      role: ROLE_OWNER,
      createdBy: actorUserId,
    });

    return {
      user: toSafeUser(rawUser),
      membership,
      createdUser,
    };
  }

  async function listTenantMembers(tenantId) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const memberships = Object.values(state.memberships).filter(
      (membership) => normalizeTenantId(membership.tenantId) === normalizedTenantId
    );

    return memberships
      .map((membership) => {
        const user = state.users[membership.userId];
        if (!user) return null;
        return {
          user: toSafeUser(user),
          membership: toSafeMembership(membership),
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.user.email).localeCompare(String(b.user.email)));
  }

  async function listAuditEvents({ tenantId, limit = 100, outcome = '' } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedOutcome = typeof outcome === 'string' ? outcome.trim().toLowerCase() : '';
    const numericLimit = Number.isFinite(Number(limit)) ? Number(limit) : 100;
    const clampedLimit = Math.max(1, Math.min(500, numericLimit));

    const filtered = state.auditEvents.filter((event) => {
      if (normalizedTenantId && normalizeTenantId(event.tenantId) !== normalizedTenantId) {
        return false;
      }
      if (normalizedOutcome && String(event.outcome || '').toLowerCase() !== normalizedOutcome) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return filtered.slice(0, clampedLimit).map(toSafeAuditEvent).filter(Boolean);
  }

  async function getLatestAuditEvent({ tenantId, action = '', outcome = '' } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedAction = typeof action === 'string' ? action.trim() : '';
    const normalizedOutcome = typeof outcome === 'string' ? outcome.trim().toLowerCase() : '';

    for (let index = state.auditEvents.length - 1; index >= 0; index -= 1) {
      const event = state.auditEvents[index];
      if (!event || typeof event !== 'object') continue;
      if (normalizedTenantId && normalizeTenantId(event.tenantId) !== normalizedTenantId) continue;
      if (normalizedAction && String(event.action || '') !== normalizedAction) continue;
      if (normalizedOutcome && String(event.outcome || '').toLowerCase() !== normalizedOutcome) continue;
      return toSafeAuditEvent(event);
    }

    return null;
  }

  async function bootstrapOwner({
    tenantId,
    email,
    password,
    forcePasswordReset = false,
    forceMfaReset = false,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedTenantId || !normalizedEmail || typeof password !== 'string' || !password.trim()) {
      return { bootstrapped: false, reason: 'missing_config' };
    }

    let rawUser = findRawUserByEmail(normalizedEmail);
    let createdUser = false;
    let passwordReset = false;
    let mfaReset = false;
    let revokedSessions = 0;
    if (!rawUser) {
      const created = await createUser({ email: normalizedEmail, password, mfaRequired: true });
      rawUser = state.users[created.id];
      createdUser = true;
      passwordReset = true;
    } else if (forcePasswordReset) {
      await setUserPassword(rawUser.id, password);
      rawUser = state.users[rawUser.id] || rawUser;
      passwordReset = true;
    }

    if (!createdUser && forceMfaReset) {
      const currentSecret = typeof rawUser.mfaSecret === 'string' ? rawUser.mfaSecret.trim() : '';
      const currentRecoveryCodes = Array.isArray(rawUser.mfaRecoveryCodeHashes)
        ? rawUser.mfaRecoveryCodeHashes
        : [];
      const shouldResetMfaState =
        Boolean(currentSecret) || currentRecoveryCodes.length > 0 || rawUser.mfaRequired !== true;

      if (shouldResetMfaState) {
        rawUser.mfaSecret = '';
        rawUser.mfaRecoveryCodeHashes = [];
        rawUser.mfaRequired = true;
        rawUser.updatedAt = nowIso();
      }

      const revokeResult = await revokeSessionsByUser(rawUser.id, {
        reason: 'bootstrap_owner_mfa_reset',
      });
      revokedSessions = Number(revokeResult?.count || 0);
      if (shouldResetMfaState && revokedSessions === 0) {
        await save();
      }
      mfaReset = shouldResetMfaState || revokedSessions > 0;
    }

    const membership = await ensureMembership({
      userId: rawUser.id,
      tenantId: normalizedTenantId,
      role: ROLE_OWNER,
      createdBy: null,
    });

    await addAuditEvent({
      tenantId: normalizedTenantId,
      actorUserId: rawUser.id,
      action: 'auth.bootstrap_owner',
      outcome: 'success',
      targetType: 'membership',
      targetId: membership.id,
      metadata: {
        createdUser,
        passwordReset,
        forcePasswordReset: Boolean(forcePasswordReset),
        mfaReset,
        forceMfaReset: Boolean(forceMfaReset),
        revokedSessions,
      },
    });

    return {
      bootstrapped: true,
      createdUser,
      passwordReset,
      mfaReset,
      revokedSessions,
      user: toSafeUser(rawUser),
      membership,
    };
  }

  const startupPruned = prune();
  if (startupPruned) {
    await save();
  }

  return {
    filePath,
    sessionTtlMs,
    loginTicketTtlMs,
    createUser,
    setUserPassword,
    getUserById,
    authenticateUser,
    listMembershipsForUser,
    ensureMembership,
    getMembershipById,
    createPendingLoginTicket,
    consumePendingLoginTicket,
    createPendingMfaChallenge,
    verifyMfaChallenge,
    createSession,
    getSessionContextByToken,
    getSessionById,
    getSessionDetailsById,
    listSessions,
    listSessionsDetailed,
    touchSession,
    revokeSession,
    revokeSessionsByMembership,
    revokeSessionsByUser,
    updateMembership,
    upsertStaffMember,
    upsertOwnerMember,
    listTenantMembers,
    addAuditEvent,
    listAuditEvents,
    getLatestAuditEvent,
    verifyAuditIntegrity,
    bootstrapOwner,
  };
}

module.exports = {
  createAuthStore,
};
