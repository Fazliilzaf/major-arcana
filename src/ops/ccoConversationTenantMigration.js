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

/**
 * B-MIG-1 — 'cco' är INTE en tenant i någon stavning. Jämför case- och
 * whitespace-okänsligt så att 'CCO', 'Cco', ' cco ', 'c c o' osv. alla
 * avfärdas som migrations-target.
 */
function isLegacyTenantValue(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '') === LEGACY_TENANT;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * B-MIG-2 — en legacy-rad får bara migreras om strukturen räcker för att bevara
 * det ursprungliga faktat. En rad som är null/string/number/array/tomt objekt
 * eller saknar konversationsidentitet är MALFORMED och får varken migreras eller
 * raderas — då skulle vi fabricera ett ofullständigt record som storen sedan
 * tappar vid reload.
 */
function isValidConversationStateRecord(record) {
  if (!isPlainObject(record)) return false;
  if (Object.keys(record).length === 0) return false;
  return (
    typeof record.canonicalConversationKey === 'string' &&
    normalizeText(record.canonicalConversationKey) !== ''
  );
}

function isValidIdempotencyRecord(record) {
  if (!isPlainObject(record)) return false;
  if (Object.keys(record).length === 0) return false;
  return (
    typeof record.idempotencyKey === 'string' &&
    normalizeText(record.idempotencyKey) !== '' &&
    typeof record.routeKey === 'string' &&
    normalizeText(record.routeKey) !== ''
  );
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

  // B-MIG-1 — ett explicit target som är en 'cco'-variant (case/whitespace-okänsligt)
  // är INVALID och fail-closed: ingen rad migreras, ingen mutation.
  const invalidTarget = isLegacyTenantValue(opts.targetTenant);
  const rawTarget = opts.targetTenant ? canonicalTenantId(normalizeText(opts.targetTenant)) : null;
  const targetTenant = invalidTarget || !rawTarget ? null : rawTarget;

  const plan = {
    targetTenant,
    invalidTarget,
    migrated: [],
    collisions: [],
    unresolved: [],
    invalid: [],
    counts: {
      conversationStatesLegacyCco: 0,
      idempotencyRecordsLegacyCco: 0,
    },
  };

  // B-MIG-1 — INVALID_TARGET_TENANT: analysera inte ens, fail-closed direkt.
  if (invalidTarget) return plan;

  for (const key of Object.keys(conversationStates)) {
    const parts = splitConversationStateKey(key);
    if (!parts || parts.tenant !== LEGACY_TENANT) continue;
    plan.counts.conversationStatesLegacyCco += 1;
    const record = conversationStates[key];
    // B-MIG-2 — malformed rad får aldrig migreras/fabriceras.
    if (!isValidConversationStateRecord(record)) {
      plan.invalid.push({
        kind: 'conversation_state',
        key,
        reason: 'malformed record (saknar konversationsidentitet)',
      });
      continue;
    }
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
    // B-MIG-2 — malformed idempotency-rad får aldrig migreras/fabriceras.
    if (!isValidIdempotencyRecord(record)) {
      plan.invalid.push({
        kind: 'idempotency_record',
        key,
        reason: 'malformed idempotency record',
      });
      continue;
    }
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
      // B-MIG-2 — defensiv grind: aldrig fabricera ett record från malformed input.
      if (!isValidConversationStateRecord(record)) continue;
      delete state.conversationStates[item.key];
      state.conversationStates[item.newKey] = {
        ...record,
        key: item.newKey,
        tenantId: item.target,
      };
    } else {
      const record = state.idempotencyRecords[item.key];
      if (!isValidIdempotencyRecord(record)) continue;
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
