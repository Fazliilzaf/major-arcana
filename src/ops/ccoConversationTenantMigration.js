'use strict';

/**
 * P1-001/002 — core-logik för migration av legacy 'cco'-nycklade conversation-state
 * poster till deras riktiga canonical tenant.
 *
 * Den här modulen är rent funktionell (inga side effects på disk) så att den kan
 * enhetstestas. Skriptet scripts/migrate-conversation-tenant.js är en tunn CLI runt
 * denna.
 *
 * SÄKERHETSREGLER (frysta i design-gate):
 *   - deterministisk mapping — INGEN gissning om target tenant.
 *   - en rad vars target inte kan BEVISAS migreras INTE (UNRESOLVED).
 *   - kollision → hoppa över, aldrig skriv över canonical state.
 *   - 'cco' är inte en tenant; ingen automatisk cco→hair-tp-clinic utan bevisat target.
 */
const { canonicalTenantId, HAIR_TP_CANONICAL } = require('../tenant/tenantIdCanonical');

const LEGACY_TENANT = 'cco';

// Explicit, dokumenterad domän→canonical-tenant-karta. INGA andra domäner läggs
// till utan att kartan uppdateras medvetet — det här är bevis, inte gissning.
const MAILBOX_DOMAIN_TENANT = Object.freeze({
  'hairtpclinic.com': HAIR_TP_CANONICAL,
  'hairtpclinic.se': HAIR_TP_CANONICAL,
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function splitConversationStateKey(key) {
  const idx = key.indexOf(':');
  if (idx < 0) return null;
  return { tenant: key.slice(0, idx), rest: key.slice(idx + 1) };
}

function splitIdempotencyKey(key) {
  const idx = key.indexOf('::');
  if (idx < 0) return null;
  return { tenant: key.slice(0, idx), rest: key.slice(idx + 2) };
}

/** Target tenant bevisad ur en post. Returnerar null om den inte kan bevisas. */
function resolveTargetFromEvidence(record, explicitTarget) {
  const explicit = canonicalTenantId(normalizeText(explicitTarget));
  if (explicit) return explicit;

  const mailboxes = Array.isArray(record && record.underlyingMailboxIds)
    ? record.underlyingMailboxIds
    : [];
  for (const mailbox of mailboxes) {
    const normalized = normalizeText(mailbox).toLowerCase();
    const at = normalized.lastIndexOf('@');
    if (at < 0) continue;
    const domain = normalized.slice(at + 1);
    if (Object.prototype.hasOwnProperty.call(MAILBOX_DOMAIN_TENANT, domain)) {
      return MAILBOX_DOMAIN_TENANT[domain];
    }
  }
  return null;
}

/**
 * Bygg en migrationsplan (dry-run) utan att mutera state.
 *
 * @param {object} state State-objekt { conversationStates, idempotencyRecords }.
 * @param {object} [opts]
 * @param {string} [opts.targetTenant] Bevisad target tenant (canonicaliseras).
 * @returns {{targetTenant:string|null, migrated:Array, collisions:Array, unresolved:Array, counts:object}}
 */
function planConversationTenantMigration(state = {}, opts = {}) {
  const conversationStates =
    state.conversationStates && typeof state.conversationStates === 'object'
      ? state.conversationStates
      : {};
  const idempotencyRecords =
    state.idempotencyRecords && typeof state.idempotencyRecords === 'object'
      ? state.idempotencyRecords
      : {};

  const rawTarget = opts.targetTenant ? canonicalTenantId(normalizeText(opts.targetTenant)) : null;
  // 'cco' är inte en tenant — ett explicit target som normaliseras till 'cco'
  // är inte ett bevis på rätt klinik och får inte driva en migration.
  const targetTenant = rawTarget && rawTarget !== LEGACY_TENANT ? rawTarget : null;

  const plan = {
    targetTenant,
    migrated: [],
    collisions: [],
    unresolved: [],
    counts: {
      conversationStatesLegacyCco: 0,
      idempotencyRecordsLegacyCco: 0,
    },
  };

  for (const key of Object.keys(conversationStates)) {
    const parts = splitConversationStateKey(key);
    if (!parts || parts.tenant !== LEGACY_TENANT) continue;
    plan.counts.conversationStatesLegacyCco += 1;
    const record = conversationStates[key];
    const target = resolveTargetFromEvidence(record, targetTenant);
    if (!target) {
      plan.unresolved.push({
        kind: 'conversation_state',
        key,
        reason: 'target tenant kan inte bevisas',
      });
      continue;
    }
    const newKey = `${target}:${parts.rest}`;
    if (Object.prototype.hasOwnProperty.call(conversationStates, newKey)) {
      plan.collisions.push({
        kind: 'conversation_state',
        key,
        newKey,
        reason: 'canonical-nyckel finns redan',
      });
      continue;
    }
    plan.migrated.push({ kind: 'conversation_state', key, newKey, target });
  }

  for (const key of Object.keys(idempotencyRecords)) {
    const parts = splitIdempotencyKey(key);
    if (!parts || parts.tenant !== LEGACY_TENANT) continue;
    plan.counts.idempotencyRecordsLegacyCco += 1;
    const record = idempotencyRecords[key];
    const target = resolveTargetFromEvidence(record, targetTenant);
    if (!target) {
      plan.unresolved.push({
        kind: 'idempotency_record',
        key,
        reason: 'target tenant kan inte bevisas',
      });
      continue;
    }
    const newKey = `${target}::${parts.rest}`;
    if (Object.prototype.hasOwnProperty.call(idempotencyRecords, newKey)) {
      plan.collisions.push({
        kind: 'idempotency_record',
        key,
        newKey,
        reason: 'canonical-nyckel finns redan',
      });
      continue;
    }
    plan.migrated.push({ kind: 'idempotency_record', key, newKey, target });
  }

  return plan;
}

/**
 * Applicera en migrationsplan på ett state-objekt (muterar state).
 *
 * @param {object} state State-objekt { conversationStates, idempotencyRecords }.
 * @param {object} plan Resultat från planConversationTenantMigration.
 */
function applyConversationTenantMigration(state, plan) {
  for (const item of plan.migrated) {
    if (item.kind === 'conversation_state') {
      const record = state.conversationStates[item.key];
      delete state.conversationStates[item.key];
      state.conversationStates[item.newKey] = {
        ...record,
        key: item.newKey,
        tenantId: item.target,
      };
    } else {
      const record = state.idempotencyRecords[item.key];
      delete state.idempotencyRecords[item.key];
      state.idempotencyRecords[item.newKey] = {
        ...record,
        key: item.newKey,
        tenantId: item.target,
      };
    }
  }
  state.updatedAt = new Date().toISOString();
  return state;
}

module.exports = {
  LEGACY_TENANT,
  MAILBOX_DOMAIN_TENANT,
  planConversationTenantMigration,
  applyConversationTenantMigration,
};
