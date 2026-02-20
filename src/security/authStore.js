const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { hashPassword, verifyPassword } = require('./password');
const { ROLE_OWNER, ROLE_STAFF, normalizeRole, isValidRole } = require('./roles');

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

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function emptyState() {
  return {
    users: {},
    memberships: {},
    sessions: {},
    pendingLogins: {},
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
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    mfaRequired: Boolean(user.mfaRequired),
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
  loginTicketTtlMs,
  auditMaxEntries = 5000,
}) {
  const rawState = await readJson(filePath, emptyState());
  const state = {
    users: safeObject(rawState.users),
    memberships: safeObject(rawState.memberships),
    sessions: safeObject(rawState.sessions),
    pendingLogins: safeObject(rawState.pendingLogins),
    auditEvents: Array.isArray(rawState.auditEvents) ? rawState.auditEvents : [],
  };

  function prune() {
    const now = Date.now();

    for (const [id, session] of Object.entries(state.sessions)) {
      const expiresAt = Date.parse(session.expiresAt || '');
      const revokedAt = Date.parse(session.revokedAt || '');
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        delete state.sessions[id];
        continue;
      }
      if (Number.isFinite(revokedAt) && revokedAt + 24 * 60 * 60 * 1000 <= now) {
        delete state.sessions[id];
      }
    }

    for (const [ticket, pending] of Object.entries(state.pendingLogins)) {
      const expiresAt = Date.parse(pending.expiresAt || '');
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        delete state.pendingLogins[ticket];
      }
    }

    if (state.auditEvents.length > auditMaxEntries) {
      state.auditEvents = state.auditEvents.slice(-auditMaxEntries);
    }
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

  async function addAuditEvent({
    tenantId = null,
    actorUserId = null,
    action,
    outcome = 'success',
    targetType = '',
    targetId = '',
    metadata = {},
  }) {
    const event = {
      id: crypto.randomUUID(),
      ts: nowIso(),
      tenantId: tenantId || null,
      actorUserId: actorUserId || null,
      action: String(action || 'unknown'),
      outcome: String(outcome || 'unknown'),
      targetType: String(targetType || ''),
      targetId: String(targetId || ''),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    };
    state.auditEvents.push(event);
    await save();
    return event;
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
    const expiresAt = Date.parse(session.expiresAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

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
    session.lastSeenAt = nowIso();
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
        const expiresAt = Date.parse(session.expiresAt || '');
        if (Number.isFinite(expiresAt) && expiresAt <= now) {
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
      if (isValidRole(nextRole) && membership.role !== ROLE_OWNER && membership.role !== nextRole) {
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
    return filtered.slice(0, clampedLimit);
  }

  async function bootstrapOwner({ tenantId, email, password }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedTenantId || !normalizedEmail || typeof password !== 'string' || !password.trim()) {
      return { bootstrapped: false, reason: 'missing_config' };
    }

    let rawUser = findRawUserByEmail(normalizedEmail);
    let createdUser = false;
    if (!rawUser) {
      const created = await createUser({ email: normalizedEmail, password, mfaRequired: true });
      rawUser = state.users[created.id];
      createdUser = true;
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
      metadata: { createdUser },
    });

    return {
      bootstrapped: true,
      createdUser,
      user: toSafeUser(rawUser),
      membership,
    };
  }

  prune();
  await save();

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
    createSession,
    getSessionContextByToken,
    getSessionById,
    getSessionDetailsById,
    listSessions,
    listSessionsDetailed,
    touchSession,
    revokeSession,
    revokeSessionsByMembership,
    updateMembership,
    upsertStaffMember,
    upsertOwnerMember,
    listTenantMembers,
    addAuditEvent,
    listAuditEvents,
    bootstrapOwner,
  };
}

module.exports = {
  createAuthStore,
};
