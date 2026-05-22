const crypto = require('node:crypto');

const { inputRiskGate } = require('./gates/inputRiskGate');
const { outputRiskGate } = require('./gates/outputRiskGate');
const { policyFloorGate } = require('./gates/policyFloorGate');

const DECISION_ORDER = Object.freeze({
  allow: 0,
  allow_flag: 1,
  review_required: 2,
  blocked: 3,
  critical_escalate: 4,
});

const PERSIST_ALLOWED_DECISIONS = new Set(['allow', 'allow_flag', 'review_required']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  const delayMs = Math.max(0, Number(ms || 0));
  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function maxDecision(...decisions) {
  let current = 'allow';
  for (const decision of decisions) {
    const normalized = String(decision || '').toLowerCase();
    if (!(normalized in DECISION_ORDER)) continue;
    if (DECISION_ORDER[normalized] > DECISION_ORDER[current]) {
      current = normalized;
    }
  }
  return current;
}

function normalizeActor(actor = {}) {
  return {
    id: normalizeText(actor?.id) || null,
    role: normalizeText(actor?.role) || null,
  };
}

function validateIngressContext(context = {}) {
  const tenantId = normalizeText(context?.tenant_id || context?.tenantId);
  const channel = normalizeText(context?.channel);
  const intent = normalizeText(context?.intent || context?.request_type || context?.requestType);
  const correlationId = normalizeText(context?.correlation_id || context?.correlationId);
  const idempotencyKey = normalizeText(context?.idempotency_key || context?.idempotencyKey);
  const actor = normalizeActor(context?.actor);

  if (!tenantId) throw new Error('ExecutionGateway: tenant_id saknas.');
  if (!channel) throw new Error('ExecutionGateway: channel saknas.');
  if (!intent) throw new Error('ExecutionGateway: intent saknas.');

  return {
    tenant_id: tenantId,
    actor,
    channel,
    intent,
    request_type: intent,
    payload: context?.payload ?? {},
    correlation_id: correlationId || null,
    idempotency_key: idempotencyKey || null,
  };
}

function safeFallbackMessage({ channel }) {
  if (channel === 'patient') {
    return (
      'Jag kan inte ge ett säkert svar på detta just nu. ' +
      'Kontakta kliniken direkt och ring 112 vid akuta besvär.'
    );
  }
  return 'Innehållet blockerades av säkerhetsskäl. Justera input och försök igen.';
}

function defaultVersions(buildVersion) {
  return {
    ruleSet: 'rules.v1',
    threshold: 'threshold.v1',
    model: 'semantic.heuristic.v1',
    fusion: 'fusion.weighted.v1',
    build: String(buildVersion || 'dev'),
  };
}

function deriveRiskVersions({ inputEvaluation = null, outputEvaluation = null, buildVersion = 'dev' } = {}) {
  const inputVersions =
    inputEvaluation && typeof inputEvaluation.versions === 'object' ? inputEvaluation.versions : {};
  const outputVersions =
    outputEvaluation && typeof outputEvaluation.versions === 'object' ? outputEvaluation.versions : {};
  const defaults = defaultVersions(buildVersion);
  return {
    ruleSet: outputVersions.ruleSetVersion || inputVersions.ruleSetVersion || defaults.ruleSet,
    threshold: outputVersions.thresholdVersion || inputVersions.thresholdVersion || defaults.threshold,
    model:
      outputVersions.semanticModelVersion || inputVersions.semanticModelVersion || defaults.model,
    fusion: outputVersions.fusionVersion || inputVersions.fusionVersion || defaults.fusion,
    build: outputVersions.buildVersion || inputVersions.buildVersion || defaults.build,
  };
}

function extractContextTenantId(context = {}) {
  return normalizeText(context?.tenant_id || context?.tenantId);
}

function extractContextIdempotencyKey(context = {}) {
  return normalizeText(context?.idempotency_key || context?.idempotencyKey);
}

function cloneResult(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function decorateIdempotency(result, { key = null, replayed = false, sourceRunId = null } = {}) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    idempotency: {
      key: key || null,
      replayed: Boolean(replayed),
      source_run_id: sourceRunId || result.run_id || null,
    },
  };
}

function createExecutionGateway({
  buildVersion = 'dev',
  enableTenantQueue = true,
  idempotencyTtlMs = 10 * 60 * 1000,
  maxIdempotencyEntries = 5000,
  agentRetryMaxAttempts = 2,
  agentRetryBaseDelayMs = 120,
  agentRetryBackoffFactor = 2,
  deadLetterMaxEntries = 1000,
  runtimeBackend = null,
} = {}) {
  const tenantQueueTails = new Map();
  const idempotencyRegistry = new Map();
  const deadLetters = [];
  const backend =
    runtimeBackend && typeof runtimeBackend === 'object' ? runtimeBackend : null;
  const maxRetries = Math.max(1, Number.parseInt(String(agentRetryMaxAttempts), 10) || 1);
  const baseRetryDelayMs = Math.max(0, Number(agentRetryBaseDelayMs || 0));
  const retryFactor = Math.max(1, Number(agentRetryBackoffFactor || 1));

  async function pushDeadLetter({
    stage,
    context,
    runId,
    errorMessage,
    attempts = 1,
    reasonCode = 'GATEWAY_STAGE_FAILURE',
  }) {
    const tenantId = extractContextTenantId(context);
    const correlationId = normalizeText(context?.correlation_id || context?.correlationId) || null;
    const payload = context?.payload ?? null;
    const deadLetter = {
      id: crypto.randomUUID(),
      ts: nowIso(),
      runId: normalizeText(runId) || null,
      tenantId: tenantId || null,
      channel: normalizeText(context?.channel) || null,
      intent: normalizeText(context?.intent || context?.request_type || context?.requestType) || null,
      correlationId,
      idempotencyKey: extractContextIdempotencyKey(context) || null,
      stage: normalizeText(stage) || 'unknown',
      attempts: Math.max(1, Number(attempts || 1)),
      errorMessage: normalizeText(errorMessage) || 'gateway_stage_failed',
      reasonCode: normalizeText(reasonCode) || 'GATEWAY_STAGE_FAILURE',
      payloadPreview:
        payload && typeof payload === 'object'
          ? {
              keys: Object.keys(payload).slice(0, 12),
            }
          : {
              text: normalizeText(payload).slice(0, 140),
            },
    };
    deadLetters.push(deadLetter);
    if (deadLetters.length > deadLetterMaxEntries) {
      deadLetters.splice(0, deadLetters.length - deadLetterMaxEntries);
    }
    if (backend && typeof backend.onDeadLetter === 'function') {
      try {
        await backend.onDeadLetter(deadLetter);
      } catch {
        // Dead-letter replication failures must not break gateway response flow.
      }
    }
  }

  async function runWithRetries(operation, { maxAttempts = 1 } = {}) {
    const attemptsLimit = Math.max(1, Number(maxAttempts || 1));
    let attempts = 0;
    let lastError = null;
    while (attempts < attemptsLimit) {
      attempts += 1;
      try {
        const result = await operation({ attempt: attempts, maxAttempts: attemptsLimit });
        return { ok: true, result, attempts };
      } catch (error) {
        lastError = error;
        if (error?.nonRetryable === true || error?.code === 'VERSION_CONFLICT') {
          break;
        }
        if (attempts >= attemptsLimit) break;
        const delayMs = baseRetryDelayMs * Math.pow(retryFactor, attempts - 1);
        await sleep(delayMs);
      }
    }
    return { ok: false, error: lastError, attempts };
  }

  function cleanupIdempotencyRegistry() {
    const now = Date.now();
    for (const [key, entry] of idempotencyRegistry.entries()) {
      if (!entry || Number(entry.expiresAt || 0) <= now) {
        idempotencyRegistry.delete(key);
      }
    }

    if (idempotencyRegistry.size <= maxIdempotencyEntries) return;
    const sorted = Array.from(idempotencyRegistry.entries()).sort((a, b) => {
      return Number(a[1]?.expiresAt || 0) - Number(b[1]?.expiresAt || 0);
    });
    const removeCount = idempotencyRegistry.size - maxIdempotencyEntries;
    for (let index = 0; index < removeCount; index += 1) {
      idempotencyRegistry.delete(sorted[index][0]);
    }
  }

  async function enqueueTenantRun(tenantId, task) {
    const normalizedTenantId = normalizeText(tenantId);
    if (backend && typeof backend.runSerialized === 'function') {
      return backend.runSerialized({
        tenantId: normalizedTenantId,
        task,
      });
    }
    if (!enableTenantQueue || !normalizedTenantId) {
      return task();
    }

    const previous = tenantQueueTails.get(normalizedTenantId) || Promise.resolve();
    const current = previous
      .catch(() => {
        // Keep queue flowing after failures.
      })
      .then(task);

    tenantQueueTails.set(normalizedTenantId, current);

    return current.finally(() => {
      if (tenantQueueTails.get(normalizedTenantId) === current) {
        tenantQueueTails.delete(normalizedTenantId);
      }
    });
  }

  async function executeRun({ context = {}, handlers = {} } = {}) {
    const runId = crypto.randomUUID();
    const startedAt = nowIso();
    const audit = typeof handlers.audit === 'function' ? handlers.audit : async () => {};
    const safeResponseBuilder =
      typeof handlers.safeResponse === 'function'
        ? handlers.safeResponse
        : ({ context: ingressContext, decision }) => ({
            message: safeFallbackMessage({ channel: ingressContext.channel }),
            decision,
          });

    let ingressContext = null;
    let inputRisk = null;
    let outputRisk = null;
    let policy = null;
    let agentResult = null;
    let persisted = null;
    let decision = 'blocked';
    let errorStage = null;
    let errorMessage = '';
    let errorCode = null;
    let errorStatus = null;
    let retryAfterSeconds = null;
    const stageAttempts = {
      inputRisk: 1,
      agentRun: 1,
      outputRisk: 1,
      policyFloor: 1,
      persist: 1,
    };

    try {
      ingressContext = validateIngressContext(context);
      await audit({
        action: 'gateway.run.start',
        outcome: 'success',
        metadata: {
          runId,
          channel: ingressContext.channel,
          intent: ingressContext.intent,
          correlationId: ingressContext.correlation_id,
          idempotencyKey: ingressContext.idempotency_key,
        },
      });

      try {
        const inputEvaluation = await handlers.inputRisk?.({
          context: ingressContext,
          runId,
        });
        inputRisk = inputRiskGate({ evaluation: inputEvaluation });
      } catch (error) {
        errorStage = 'inputRisk';
        errorMessage = normalizeText(error?.message || 'inputRisk_failed');
        decision = 'blocked';
        await pushDeadLetter({
          stage: 'inputRisk',
          context: ingressContext,
          runId,
          errorMessage,
          attempts: stageAttempts.inputRisk,
          reasonCode: 'INPUT_RISK_GATE_ERROR',
        });
      }

      if (!errorStage) {
        const agentResultWithRetries = await runWithRetries(
          async () =>
            handlers.agentRun?.({
              context: ingressContext,
              runId,
              inputRisk,
            }),
          { maxAttempts: maxRetries }
        );
        stageAttempts.agentRun = agentResultWithRetries.attempts;
        if (agentResultWithRetries.ok) {
          agentResult = agentResultWithRetries.result;
        } else {
          errorStage = 'agentRun';
          errorMessage = normalizeText(agentResultWithRetries.error?.message || 'agentRun_failed');
          decision = 'blocked';
          await pushDeadLetter({
            stage: 'agentRun',
            context: ingressContext,
            runId,
            errorMessage,
            attempts: stageAttempts.agentRun,
            reasonCode: 'AGENT_RUN_FAILED_RETRY_EXHAUSTED',
          });
        }
      }

      if (!errorStage) {
        try {
          const outputEvaluation = await handlers.outputRisk?.({
            context: ingressContext,
            runId,
            inputRisk,
            agentResult,
          });
          outputRisk = outputRiskGate({ evaluation: outputEvaluation });
        } catch (error) {
          errorStage = 'outputRisk';
          errorMessage = normalizeText(error?.message || 'outputRisk_failed');
          decision = 'blocked';
          await pushDeadLetter({
            stage: 'outputRisk',
            context: ingressContext,
            runId,
            errorMessage,
            attempts: stageAttempts.outputRisk,
            reasonCode: 'OUTPUT_RISK_GATE_ERROR',
          });
        }
      }

      if (!errorStage) {
        try {
          const policyEvaluation = await handlers.policyFloor?.({
            context: ingressContext,
            runId,
            inputRisk,
            outputRisk,
            agentResult,
          });
          policy = policyFloorGate({ evaluation: policyEvaluation });
        } catch (error) {
          errorStage = 'policyFloor';
          errorMessage = normalizeText(error?.message || 'policyFloor_failed');
          decision = 'blocked';
          await pushDeadLetter({
            stage: 'policyFloor',
            context: ingressContext,
            runId,
            errorMessage,
            attempts: stageAttempts.policyFloor,
            reasonCode: 'POLICY_FLOOR_GATE_ERROR',
          });
        }
      }

      if (!errorStage) {
        decision = maxDecision(inputRisk?.decision, outputRisk?.decision, policy?.decision);
      }

      const canPersist = PERSIST_ALLOWED_DECISIONS.has(decision);
      if (canPersist && typeof handlers.persist === 'function') {
        const persistWithRetries = await runWithRetries(
          async () =>
            handlers.persist({
              context: ingressContext,
              runId,
              decision,
              inputRisk,
              outputRisk,
              policy,
              agentResult,
            }),
          { maxAttempts: Math.max(1, Math.min(2, maxRetries)) }
        );
        stageAttempts.persist = persistWithRetries.attempts;
        if (persistWithRetries.ok) {
          persisted = persistWithRetries.result;
        } else {
          if (persistWithRetries.error?.code === 'VERSION_CONFLICT') {
            throw persistWithRetries.error;
          }
          errorStage = 'persist';
          errorMessage = normalizeText(persistWithRetries.error?.message || 'persist_failed');
          errorCode = normalizeText(persistWithRetries.error?.code) || null;
          errorStatus = Number.isFinite(Number(persistWithRetries.error?.status))
            ? Number(persistWithRetries.error.status)
            : null;
          retryAfterSeconds =
            Number.isFinite(Number(persistWithRetries.error?.retryAfterSeconds)) &&
            Number(persistWithRetries.error.retryAfterSeconds) >= 0
              ? Number(persistWithRetries.error.retryAfterSeconds)
              : null;
          decision = 'blocked';
          persisted = null;
          await pushDeadLetter({
            stage: 'persist',
            context: ingressContext,
            runId,
            errorMessage,
            attempts: stageAttempts.persist,
            reasonCode: 'PERSIST_FAILED_RETRY_EXHAUSTED',
          });
        }
      }

      await audit({
        action: 'gateway.run.decision',
        outcome: decision === 'blocked' || decision === 'critical_escalate' ? 'blocked' : 'success',
        metadata: {
          runId,
          decision,
          errorStage,
          errorMessage: errorMessage || null,
          errorCode,
          errorStatus,
          retryAfterSeconds,
          inputDecision: inputRisk?.decision || null,
          outputDecision: outputRisk?.decision || null,
          policyDecision: policy?.decision || null,
          correlationId: ingressContext.correlation_id,
          stageAttempts,
        },
      });

      await audit({
        action: 'gateway.run.persist',
        outcome: persisted ? 'success' : 'skipped',
        metadata: {
          runId,
          decision,
          persisted: Boolean(persisted),
          correlationId: ingressContext.correlation_id,
          artifactRefs: persisted?.artifact_refs || null,
        },
      });

      const gatelineTimeline = [
        { gate: 'ingress', status: ingressContext ? 'passed' : 'failed', durationMs: null },
        { gate: 'inputRisk', status: inputRisk?.decision === 'blocked' ? 'blocked' : inputRisk ? 'passed' : 'skipped', score: inputRisk?.evaluation?.riskScore ?? null, decision: inputRisk?.decision || null, policyRefs: [] },
        { gate: 'agentRun', status: agentResult ? 'passed' : errorStage === 'agentRun' ? 'failed' : 'skipped', attempts: stageAttempts.agentRun, fallbackUsed: false },
        { gate: 'outputRisk', status: outputRisk?.decision === 'blocked' ? 'blocked' : outputRisk ? 'passed' : 'skipped', score: outputRisk?.evaluation?.riskScore ?? null, decision: outputRisk?.decision || null, policyRefs: [] },
        { gate: 'policyFloor', status: policy?.blocked ? 'blocked' : policy ? 'passed' : 'skipped', reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [], fallbackUsed: Boolean(policy?.blocked) },
        { gate: 'persist', status: persisted ? 'passed' : stageAttempts.persist > 1 ? 'failed' : 'skipped', attempts: stageAttempts.persist },
        { gate: 'audit', status: 'passed' },
      ];

      const estimateTokens = (obj) => {
        if (!obj) return 0;
        try {
          const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
          return Math.ceil(str.length / 4);
        } catch (_e) { return 0; }
      };
      const tokenUsage = {
        inputTokens: estimateTokens(ingressContext?.payload),
        outputTokens: estimateTokens(agentResult),
        totalTokens: estimateTokens(ingressContext?.payload) + estimateTokens(agentResult),
        estimation: 'chars_div_4',
      };

      const riskSummary = {
        input: inputRisk?.evaluation || null,
        output: outputRisk?.evaluation || null,
        versions: deriveRiskVersions({
          inputEvaluation: inputRisk?.evaluation || null,
          outputEvaluation: outputRisk?.evaluation || null,
          buildVersion,
        }),
      };

      const policySummary = {
        blocked: Boolean(policy?.blocked),
        reason_codes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
      };

      const safeResponse =
        decision === 'blocked' || decision === 'critical_escalate'
          ? safeResponseBuilder({
              context: ingressContext,
              runId,
              decision,
              inputRisk,
              outputRisk,
              policy,
              agentResult,
              errorStage,
              errorMessage,
              errorCode,
              errorStatus,
              retryAfterSeconds,
            })
          : null;

      const result = {
        decision,
        run_id: runId,
        risk_summary: riskSummary,
        policy_summary: policySummary,
        token_usage: tokenUsage,
        gateway_timeline: gatelineTimeline,
        artifact_refs: persisted?.artifact_refs || null,
        audit_refs: {
          correlation_id: ingressContext.correlation_id,
        },
        error_stage: errorStage,
        error_message: errorMessage || null,
        error_code: errorCode,
        error_status: errorStatus,
        retry_after_seconds: retryAfterSeconds,
        safe_response: safeResponse,
        response_payload:
          typeof handlers.response === 'function'
            ? await handlers.response({
                context: ingressContext,
                runId,
                decision,
                inputRisk,
                outputRisk,
                policy,
                agentResult,
                persisted,
                safeResponse,
              })
            : null,
      };

      await audit({
        action: 'gateway.run.response',
        outcome: decision === 'blocked' || decision === 'critical_escalate' ? 'blocked' : 'success',
        metadata: {
          runId,
          decision,
          hasSafeResponse: Boolean(result.safe_response),
          hasPayload: Boolean(result.response_payload),
          correlationId: ingressContext.correlation_id,
        },
      });

      return result;
    } catch (error) {
      if (error?.code === 'VERSION_CONFLICT') {
        throw error;
      }
      const hardFailMessage = normalizeText(error?.message || 'gateway_failed');
      await pushDeadLetter({
        stage: errorStage || 'ingress',
        context,
        runId,
        errorMessage: hardFailMessage,
        attempts: 1,
        reasonCode: 'GATEWAY_EXECUTION_ERROR',
      });
      await audit({
        action: 'gateway.run.decision',
        outcome: 'blocked',
        metadata: {
          runId,
          decision: 'blocked',
          errorStage: errorStage || 'ingress',
          errorMessage: hardFailMessage,
          correlationId: normalizeText(context?.correlation_id || context?.correlationId) || null,
        },
      });
      await audit({
        action: 'gateway.run.response',
        outcome: 'blocked',
        metadata: {
          runId,
          decision: 'blocked',
          errorStage: errorStage || 'ingress',
          correlationId: normalizeText(context?.correlation_id || context?.correlationId) || null,
        },
      });
      return {
        decision: 'blocked',
        run_id: runId,
        risk_summary: {
          input: null,
          output: null,
          versions: defaultVersions(buildVersion),
        },
        policy_summary: {
          blocked: true,
          reason_codes: ['GATEWAY_EXECUTION_ERROR'],
        },
        artifact_refs: null,
        audit_refs: {
          correlation_id: normalizeText(context?.correlation_id || context?.correlationId) || null,
        },
        safe_response: safeResponseBuilder({
          context: {
            channel: normalizeText(context?.channel) || 'ops',
          },
          runId,
          decision: 'blocked',
          errorStage: errorStage || 'ingress',
          errorMessage: hardFailMessage,
        }),
        response_payload: null,
        started_at: startedAt,
        completed_at: nowIso(),
      };
    }
  }

  function listDeadLetters({ tenantId = '', limit = 100 } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedLimit = Math.max(1, Math.min(1000, Number(limit || 100)));
    const filtered = normalizedTenantId
      ? deadLetters.filter((item) => item.tenantId === normalizedTenantId)
      : deadLetters;
    return filtered.slice(Math.max(0, filtered.length - normalizedLimit));
  }

  function getRuntimeStats() {
    const idempotencyEntries = Array.from(idempotencyRegistry.values());
    const pendingIdempotency = idempotencyEntries.filter((entry) => entry?.state === 'pending').length;
    const backendStats =
      backend && typeof backend.getStats === 'function' ? backend.getStats() : { backend: 'memory' };
    const queueBackendMode =
      backend && typeof backend.runSerialized === 'function' ? 'distributed' : 'memory';
    const idempotencyBackendMode =
      backend &&
      (typeof backend.getResolvedIdempotency === 'function' ||
        typeof backend.setResolvedIdempotency === 'function')
        ? 'distributed'
        : 'memory';
    return {
      mode: backendStats?.backend || (queueBackendMode === 'distributed' ? 'distributed' : 'memory'),
      queue: {
        enabled: Boolean(enableTenantQueue),
        activeTenants: tenantQueueTails.size,
        backend: queueBackendMode,
      },
      idempotency: {
        ttlMs: Math.max(1000, Number(idempotencyTtlMs || 0)),
        entries: idempotencyRegistry.size,
        pending: pendingIdempotency,
        backend: idempotencyBackendMode,
      },
      retries: {
        agentMaxAttempts: maxRetries,
        baseDelayMs: baseRetryDelayMs,
        backoffFactor: retryFactor,
      },
      deadLetters: {
        entries: deadLetters.length,
        maxEntries: deadLetterMaxEntries,
        latest: deadLetters.length ? deadLetters[deadLetters.length - 1] : null,
      },
      backend: backendStats,
    };
  }

  async function run({ context = {}, handlers = {} } = {}) {
    const tenantId = extractContextTenantId(context);
    const idempotencyKey = extractContextIdempotencyKey(context);

    const execute = () => enqueueTenantRun(tenantId, () => executeRun({ context, handlers }));

    if (!tenantId || !idempotencyKey) {
      return execute();
    }

    cleanupIdempotencyRegistry();

    const now = Date.now();
    const compositeKey = `${tenantId}:${idempotencyKey}`;
    const existing = idempotencyRegistry.get(compositeKey);
    if (existing && Number(existing.expiresAt || 0) > now) {
      if (existing.state === 'resolved' && existing.result) {
        return decorateIdempotency(cloneResult(existing.result), {
          key: idempotencyKey,
          replayed: true,
          sourceRunId: existing.runId || null,
        });
      }
      if (existing.state === 'pending' && existing.promise) {
        const pendingResult = await existing.promise;
        return decorateIdempotency(cloneResult(pendingResult), {
          key: idempotencyKey,
          replayed: true,
          sourceRunId: pendingResult?.run_id || null,
        });
      }
    }

    if (backend && typeof backend.getResolvedIdempotency === 'function') {
      const resolvedFromBackend = await backend.getResolvedIdempotency({
        tenantId,
        idempotencyKey,
      });
      if (resolvedFromBackend) {
        const snapshot = cloneResult(resolvedFromBackend);
        const expiresAt = now + Math.max(1000, Number(idempotencyTtlMs || 0));
        idempotencyRegistry.set(compositeKey, {
          state: 'resolved',
          result: snapshot,
          runId: snapshot?.run_id || null,
          expiresAt,
        });
        return decorateIdempotency(snapshot, {
          key: idempotencyKey,
          replayed: true,
          sourceRunId: snapshot?.run_id || null,
        });
      }
    }

    const expiresAt = now + Math.max(1000, Number(idempotencyTtlMs || 0));
    const pendingPromise = execute()
      .then(async (result) => {
        const snapshot = cloneResult(result);
        idempotencyRegistry.set(compositeKey, {
          state: 'resolved',
          result: snapshot,
          runId: snapshot?.run_id || null,
          expiresAt,
        });
        if (backend && typeof backend.setResolvedIdempotency === 'function') {
          try {
            await backend.setResolvedIdempotency({
              tenantId,
              idempotencyKey,
              result: snapshot,
              ttlMs: Math.max(1000, Number(idempotencyTtlMs || 0)),
            });
          } catch {
            // Keep request successful even if distributed idempotency replication fails.
          }
        }
        return cloneResult(snapshot);
      })
      .catch((error) => {
        idempotencyRegistry.delete(compositeKey);
        throw error;
      });

    idempotencyRegistry.set(compositeKey, {
      state: 'pending',
      promise: pendingPromise,
      runId: null,
      expiresAt,
    });

    const firstResult = await pendingPromise;
    return decorateIdempotency(firstResult, {
      key: idempotencyKey,
      replayed: false,
      sourceRunId: firstResult?.run_id || null,
    });
  }

  return {
    run,
    listDeadLetters,
    getRuntimeStats,
  };
}

module.exports = {
  createExecutionGateway,
  maxDecision,
  PERSIST_ALLOWED_DECISIONS,
};
