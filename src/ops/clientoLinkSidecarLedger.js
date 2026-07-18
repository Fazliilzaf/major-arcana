'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATES = Object.freeze(['proposed', 'approved', 'active', 'revoked', 'superseded']);
const TRANSITIONS = Object.freeze({
  proposed: Object.freeze(['approved']),
  approved: Object.freeze(['active']),
  active: Object.freeze(['revoked', 'superseded']),
  revoked: Object.freeze([]),
  superseded: Object.freeze([]),
});
const AUDIT_ACTIONS = Object.freeze({
  proposed: 'link_proposed',
  approved: 'link_approved',
  active: 'link_activated',
  revoked: 'link_revoked',
  superseded: 'link_superseded',
});
const CHECKSUM_RE = /^[a-f0-9]{64}$/;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ledgerError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeActor(actor = {}) {
  const staffId = normalizeText(actor.staffId || actor.userId);
  const role = normalizeText(actor.role).toUpperCase();
  const tenantId = normalizeText(actor.tenantId);
  const permissions = Array.isArray(actor.permissions)
    ? [...new Set(actor.permissions.map(normalizeText).filter(Boolean))].sort()
    : [];
  if (!staffId || !role || !tenantId) {
    throw ledgerError('actor_required', 'actor.staffId, actor.role och actor.tenantId krävs.', 400);
  }
  return { staffId, role, tenantId, permissions };
}

function normalizeSourceRefs(sourceRefs) {
  if (!Array.isArray(sourceRefs) || sourceRefs.length !== 2) {
    throw ledgerError('source_refs_required', 'Exakt två sourceRefs krävs.', 400);
  }
  const normalized = sourceRefs
    .map((sourceRef) => ({
      tenantId: normalizeText(sourceRef?.tenantId),
      bookingId: normalizeText(sourceRef?.bookingId),
      sourceSnapshotChecksum: normalizeText(sourceRef?.sourceSnapshotChecksum),
      coreChecksum: normalizeText(sourceRef?.coreChecksum),
      notesChecksum: normalizeText(sourceRef?.notesChecksum),
    }))
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  for (const sourceRef of normalized) {
    if (!sourceRef.tenantId || !sourceRef.bookingId) {
      throw ledgerError('source_ref_identity_required', 'tenantId och bookingId krävs.', 400);
    }
    for (const key of ['sourceSnapshotChecksum', 'coreChecksum', 'notesChecksum']) {
      if (!CHECKSUM_RE.test(sourceRef[key])) {
        throw ledgerError('source_ref_checksum_invalid', `${key} måste vara SHA-256.`, 400);
      }
    }
  }
  if (normalized[0].tenantId === normalized[1].tenantId) {
    throw ledgerError('source_ref_tenants_not_distinct', 'SourceRefs måste ha olika tenants.', 400);
  }
  if (normalized[0].bookingId !== normalized[1].bookingId) {
    throw ledgerError('source_ref_booking_mismatch', 'SourceRefs måste avse samma bookingId.', 400);
  }
  return normalized;
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw ledgerError('evidence_required', 'Minst ett evidensobjekt krävs.', 400);
  }
  return evidence.map((item) => {
    const normalized = {
      type: normalizeText(item?.type),
      ref: normalizeText(item?.ref),
      checksum: normalizeText(item?.checksum),
    };
    if (!normalized.type || !normalized.ref || !CHECKSUM_RE.test(normalized.checksum)) {
      throw ledgerError(
        'evidence_invalid',
        'Evidens kräver type, ref och SHA-256-checksumma.',
        400
      );
    }
    return normalized;
  });
}

function assertAuthorization(state, actor, gates) {
  if (state === 'proposed' && !['SYSTEM', 'OWNER'].includes(actor.role)) {
    throw ledgerError('authorization_denied', 'Proposed kräver SYSTEM eller OWNER.', 403);
  }
  if (
    ['approved', 'revoked', 'superseded'].includes(state) &&
    !['OWNER', 'STAFF'].includes(actor.role)
  ) {
    throw ledgerError('authorization_denied', `${state} kräver OWNER eller STAFF.`, 403);
  }
  if (state === 'active') {
    if (actor.role !== 'OWNER' || !actor.permissions.includes('cliento.links.write')) {
      throw ledgerError(
        'activation_authorization_denied',
        'Active kräver OWNER och cliento.links.write.',
        403
      );
    }
    if (gates.activationAllowed !== true) {
      throw ledgerError('activation_gate_closed', 'Aktiveringsgrinden är stängd.', 403);
    }
  }
}

function eventHashPayload(event) {
  const { eventHash: _eventHash, ...payload } = event;
  return payload;
}

function calculateEventHash(event) {
  return sha256(stableStringify(eventHashPayload(event)));
}

function requestChecksum(descriptor) {
  return sha256(stableStringify(descriptor));
}

function currentByLink(events) {
  const current = new Map();
  for (const event of events) current.set(event.linkId, event);
  return current;
}

function activeProjectionsFrom(events) {
  return [...currentByLink(events).values()]
    .filter((event) => event.state === 'active')
    .map((event) => ({
      linkId: event.linkId,
      ledgerEventId: event.ledgerEventId,
      canonicalPatientId: event.canonicalPatientId,
      canonicalEncounterId: event.canonicalEncounterId,
      sourceRefs: clone(event.sourceRefs),
      activatedAt: event.occurredAt,
    }));
}

function verifyEventSequence(events) {
  const issues = [];
  const eventIds = new Set();
  const idempotencyKeys = new Map();
  const latest = new Map();
  let previousEventHash = null;

  events.forEach((event, index) => {
    if (!event || typeof event !== 'object') {
      issues.push({ index, code: 'event_not_object' });
      return;
    }
    if (event.previousLedgerHash !== previousEventHash) {
      issues.push({ index, code: 'ledger_hash_chain_mismatch' });
    }
    if (calculateEventHash(event) !== event.eventHash) {
      issues.push({ index, code: 'event_hash_mismatch' });
    }
    if (!event.ledgerEventId || eventIds.has(event.ledgerEventId)) {
      issues.push({ index, code: 'ledger_event_id_duplicate_or_missing' });
    }
    eventIds.add(event.ledgerEventId);
    if (!STATES.includes(event.state)) issues.push({ index, code: 'state_invalid' });

    const priorForKey = idempotencyKeys.get(event.idempotencyKey);
    if (!event.idempotencyKey || priorForKey) {
      issues.push({ index, code: 'idempotency_key_invalid_or_conflicting' });
    }
    idempotencyKeys.set(event.idempotencyKey, event.requestChecksum);

    for (const requiredField of [
      'ledgerEventId',
      'linkId',
      'state',
      'idempotencyKey',
      'reasonCode',
      'occurredAt',
      'requestChecksum',
      'auditAction',
      'eventHash',
    ]) {
      if (!normalizeText(event[requiredField])) {
        issues.push({ index, code: `required_field_missing:${requiredField}` });
      }
    }
    try {
      if (
        stableStringify(normalizeSourceRefs(event.sourceRefs)) !== stableStringify(event.sourceRefs)
      ) {
        issues.push({ index, code: 'source_refs_not_normalized' });
      }
      normalizeEvidence(event.evidence);
      normalizeActor(event.actor);
    } catch (error) {
      issues.push({ index, code: error?.code || 'event_shape_invalid' });
    }

    const previous = latest.get(event.linkId) || null;
    if (event.state === 'proposed') {
      if (previous || event.previousEventId !== null) {
        issues.push({ index, code: 'proposed_previous_event_invalid' });
      }
      if (event.canonicalPatientId !== null || event.canonicalEncounterId !== null) {
        issues.push({ index, code: 'proposed_contains_canonical_link' });
      }
    } else if (
      !previous ||
      event.previousEventId !== previous.ledgerEventId ||
      !TRANSITIONS[previous.state]?.includes(event.state)
    ) {
      issues.push({ index, code: 'state_transition_invalid' });
    } else {
      if (stableStringify(event.sourceRefs) !== stableStringify(previous.sourceRefs)) {
        issues.push({ index, code: 'source_refs_changed_across_transition' });
      }
      if (previous.canonicalPatientId && event.canonicalPatientId !== previous.canonicalPatientId) {
        issues.push({ index, code: 'canonical_patient_changed_across_transition' });
      }
      if (
        previous.canonicalEncounterId &&
        event.canonicalEncounterId !== previous.canonicalEncounterId
      ) {
        issues.push({ index, code: 'canonical_encounter_changed_across_transition' });
      }
      if (
        !event.compareAndSwap?.verified ||
        event.compareAndSwap?.sourceRefsChecksum !== sha256(stableStringify(event.sourceRefs))
      ) {
        issues.push({ index, code: 'transition_cas_proof_invalid' });
      }
      if (
        ['approved', 'active'].includes(event.state) &&
        (!normalizeText(event.canonicalPatientId) || !normalizeText(event.canonicalEncounterId))
      ) {
        issues.push({ index, code: 'canonical_link_missing' });
      }
    }
    latest.set(event.linkId, event);
    previousEventHash = event.eventHash || null;
  });
  return { ok: issues.length === 0, issues, eventCount: events.length };
}

async function readLedger(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const events = [];
    for (const [index, line] of raw.split('\n').entries()) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        throw ledgerError('ledger_jsonl_corrupt', `Ogiltig JSONL på rad ${index + 1}.`, 500);
      }
    }
    return events;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function createClientoLinkSidecarLedger({
  filePath,
  gates = {},
  clock = () => new Date().toISOString(),
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  const resolvedPath = normalizeText(filePath);
  if (!resolvedPath) throw new Error('filePath krävs för Cliento sidecar-ledger.');
  const effectiveGates = Object.freeze({
    ledgerWriteAllowed: gates.ledgerWriteAllowed === true,
    activationAllowed: gates.activationAllowed === true,
  });
  const events = await readLedger(resolvedPath);
  const initialIntegrity = verifyEventSequence(events);
  if (!initialIntegrity.ok) {
    throw ledgerError('ledger_integrity_failed', 'Ledgerns hash-/tillståndskedja är ogiltig.', 500);
  }
  let appendQueue = Promise.resolve();
  let mutationQueue = Promise.resolve();

  async function withMutationLock(fn) {
    const run = mutationQueue.then(fn);
    mutationQueue = run.catch(() => {});
    return run;
  }

  function findIdempotent(idempotencyKey, checksum) {
    const existing = events.find((event) => event.idempotencyKey === idempotencyKey);
    if (!existing) return null;
    if (existing.requestChecksum !== checksum) {
      throw ledgerError('idempotency_conflict', 'Idempotency-key har redan annan payload.');
    }
    return clone(existing);
  }

  async function appendEvent(event) {
    const run = appendQueue.then(async () => {
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.appendFile(resolvedPath, `${JSON.stringify(event)}\n`, 'utf8');
      events.push(event);
      return clone(event);
    });
    appendQueue = run.catch(() => {});
    return run;
  }

  function assertWriteGate() {
    if (!effectiveGates.ledgerWriteAllowed) {
      throw ledgerError('ledger_write_gate_closed', 'Ledgerns skrivgrind är stängd.', 403);
    }
  }

  async function proposeUnlocked(input = {}) {
    assertWriteGate();
    const sourceRefs = normalizeSourceRefs(input.sourceRefs);
    const evidence = normalizeEvidence(input.evidence);
    const actor = normalizeActor(input.actor);
    const idempotencyKey = normalizeText(input.idempotencyKey);
    const reasonCode = normalizeText(input.reasonCode);
    if (!idempotencyKey || !reasonCode) {
      throw ledgerError('proposal_fields_required', 'idempotencyKey och reasonCode krävs.', 400);
    }
    assertAuthorization('proposed', actor, effectiveGates);
    const descriptor = {
      operation: 'propose',
      requestedLinkId: normalizeText(input.linkId) || null,
      sourceRefs,
      evidence,
      idempotencyKey,
      reasonCode,
      actor,
    };
    const checksum = requestChecksum(descriptor);
    const replay = findIdempotent(idempotencyKey, checksum);
    if (replay) return replay;

    const linkId = descriptor.requestedLinkId || randomUUID();
    if (events.some((event) => event.linkId === linkId)) {
      throw ledgerError('link_id_conflict', 'linkId finns redan.');
    }
    const occurredAt = normalizeText(clock());
    const event = {
      ledgerEventId: randomUUID(),
      linkId,
      state: 'proposed',
      sourceRefs,
      canonicalPatientId: null,
      canonicalEncounterId: null,
      evidence,
      idempotencyKey,
      reasonCode,
      actor,
      occurredAt,
      previousEventId: null,
      previousLedgerHash: events.at(-1)?.eventHash || null,
      requestChecksum: checksum,
      auditAction: AUDIT_ACTIONS.proposed,
    };
    event.eventHash = calculateEventHash(event);
    return appendEvent(event);
  }

  async function transitionUnlocked(linkIdInput, nextStateInput, input = {}) {
    assertWriteGate();
    const linkId = normalizeText(linkIdInput);
    const nextState = normalizeText(nextStateInput).toLowerCase();
    const idempotencyKey = normalizeText(input.idempotencyKey);
    const reasonCode = normalizeText(input.reasonCode);
    const expectedPreviousEventId = normalizeText(input.expectedPreviousEventId);
    const canonicalPatientId = normalizeText(input.canonicalPatientId);
    const canonicalEncounterId = normalizeText(input.canonicalEncounterId);
    const currentSourceRefs = normalizeSourceRefs(input.currentSourceRefs);
    const evidence = normalizeEvidence(input.evidence);
    const actor = normalizeActor(input.actor);
    if (!linkId || !STATES.includes(nextState) || nextState === 'proposed') {
      throw ledgerError('transition_invalid', 'Giltigt linkId och nästa tillstånd krävs.', 400);
    }
    if (!idempotencyKey || !reasonCode || !expectedPreviousEventId) {
      throw ledgerError(
        'transition_fields_required',
        'idempotencyKey, reasonCode och expectedPreviousEventId krävs.',
        400
      );
    }
    assertAuthorization(nextState, actor, effectiveGates);
    const descriptor = {
      operation: 'transition',
      linkId,
      nextState,
      expectedPreviousEventId,
      currentSourceRefs,
      canonicalPatientId: canonicalPatientId || null,
      canonicalEncounterId: canonicalEncounterId || null,
      evidence,
      idempotencyKey,
      reasonCode,
      actor,
    };
    const checksum = requestChecksum(descriptor);
    const replay = findIdempotent(idempotencyKey, checksum);
    if (replay) return replay;

    const current = [...events].reverse().find((event) => event.linkId === linkId);
    if (!current) throw ledgerError('link_not_found', 'Länken finns inte.', 404);
    if (!TRANSITIONS[current.state]?.includes(nextState)) {
      throw ledgerError(
        'transition_not_allowed',
        `${current.state} → ${nextState} är inte tillåten.`
      );
    }
    if (current.ledgerEventId !== expectedPreviousEventId) {
      throw ledgerError('previous_event_cas_mismatch', 'Ledgerns previousEventId har ändrats.');
    }
    if (stableStringify(current.sourceRefs) !== stableStringify(currentSourceRefs)) {
      throw ledgerError('source_snapshot_cas_mismatch', 'Källsnapshotens checksumma har ändrats.');
    }

    const resolvedPatientId = canonicalPatientId || current.canonicalPatientId;
    const resolvedEncounterId = canonicalEncounterId || current.canonicalEncounterId;
    if (
      ['approved', 'active'].includes(nextState) &&
      (!resolvedPatientId || !resolvedEncounterId)
    ) {
      throw ledgerError(
        'canonical_link_required',
        'Entydigt canonicalPatientId och canonicalEncounterId krävs.',
        400
      );
    }
    if (current.canonicalPatientId && canonicalPatientId !== current.canonicalPatientId) {
      throw ledgerError('canonical_patient_immutable', 'canonicalPatientId får inte ändras.');
    }
    if (current.canonicalEncounterId && canonicalEncounterId !== current.canonicalEncounterId) {
      throw ledgerError('canonical_encounter_immutable', 'canonicalEncounterId får inte ändras.');
    }

    if (nextState === 'active') {
      const sourceKeys = new Set(
        currentSourceRefs.map((ref) => `${ref.tenantId}::${ref.bookingId}`)
      );
      const conflict = activeProjectionsFrom(events).find((projection) => {
        if (projection.linkId === linkId) return false;
        return (
          projection.canonicalEncounterId === resolvedEncounterId ||
          projection.sourceRefs.some((ref) => sourceKeys.has(`${ref.tenantId}::${ref.bookingId}`))
        );
      });
      if (conflict)
        throw ledgerError('conflicting_active_link', 'En sourceRef har redan aktiv länk.');
    }

    const event = {
      ledgerEventId: randomUUID(),
      linkId,
      state: nextState,
      sourceRefs: clone(current.sourceRefs),
      canonicalPatientId: resolvedPatientId || null,
      canonicalEncounterId: resolvedEncounterId || null,
      evidence,
      idempotencyKey,
      reasonCode,
      actor,
      occurredAt: normalizeText(clock()),
      previousEventId: current.ledgerEventId,
      previousLedgerHash: events.at(-1)?.eventHash || null,
      requestChecksum: checksum,
      auditAction: AUDIT_ACTIONS[nextState],
      compareAndSwap: {
        algorithm: 'sha256(normalized-source-snapshot-v1)',
        verified: true,
        sourceRefsChecksum: sha256(stableStringify(currentSourceRefs)),
      },
    };
    event.eventHash = calculateEventHash(event);
    return appendEvent(event);
  }

  function getLinkHistory(linkId) {
    const normalized = normalizeText(linkId);
    return events.filter((event) => event.linkId === normalized).map(clone);
  }

  function listActiveProjections() {
    return clone(activeProjectionsFrom(events));
  }

  function verifyIntegrity() {
    return clone(verifyEventSequence(events));
  }

  function stats() {
    const byState = Object.fromEntries(STATES.map((state) => [state, 0]));
    for (const event of events) byState[event.state] = (byState[event.state] || 0) + 1;
    return {
      eventCount: events.length,
      linkCount: currentByLink(events).size,
      activeProjectionCount: activeProjectionsFrom(events).length,
      byState,
      gates: { ...effectiveGates },
    };
  }

  return {
    propose: (input) => withMutationLock(() => proposeUnlocked(input)),
    transition: (linkId, nextState, input) =>
      withMutationLock(() => transitionUnlocked(linkId, nextState, input)),
    getLinkHistory,
    listActiveProjections,
    verifyIntegrity,
    stats,
  };
}

module.exports = {
  AUDIT_ACTIONS,
  STATES,
  TRANSITIONS,
  calculateEventHash,
  createClientoLinkSidecarLedger,
  normalizeSourceRefs,
  verifyEventSequence,
};
