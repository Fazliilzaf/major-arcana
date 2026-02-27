const crypto = require('node:crypto');

const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluatePolicyFloorText } = require('../policy/floor');
const { validateJsonSchema } = require('./schemaValidator');
const {
  getCapabilityByName,
  listCapabilities,
  listAgentBundles,
  getAgentBundleByName,
} = require('./registry');
const {
  COO_AGENT_NAME,
  COO_DAILY_BRIEF_CAPABILITY_REF,
  cooDailyBriefInputSchema,
  cooDailyBriefOutputSchema,
  composeCooDailyBrief,
} = require('../agents/cooDailyBriefAgent');
const {
  CCO_AGENT_NAME,
  CCO_INBOX_ANALYSIS_CAPABILITY_REF,
  ccoInboxAnalysisInputSchema,
  ccoInboxAnalysisOutputSchema,
  composeCcoInboxAnalysis,
} = require('../agents/ccoInboxAgent');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toLowerSet(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean)
  );
}

function stringifyForRisk(input = null) {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  try {
    return JSON.stringify(input, null, 2).slice(0, 12000);
  } catch {
    return String(input);
  }
}

function buildAllowRiskEvaluation({
  scope = 'input',
  buildVersion = 'dev',
} = {}) {
  return {
    scope,
    category: 'INTERNAL',
    tenantRiskModifier: 0,
    riskLevel: 1,
    riskColor: 'green',
    riskScore: 0,
    semanticScore: 0,
    ruleScore: 0,
    decision: 'allow',
    reasonCodes: [],
    ruleHits: [],
    policyHits: [],
    policyAdjustments: [],
    versions: {
      ruleSetVersion: 'rules.v1',
      thresholdVersion: 'threshold.v1',
      semanticModelVersion: 'semantic.heuristic.v1',
      fusionVersion: 'fusion.weighted.v1',
      buildVersion: normalizeText(buildVersion || 'dev'),
    },
    evaluatedAt: new Date().toISOString(),
  };
}

async function getTenantRuntimeConfig(tenantConfigStore, tenantId) {
  const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
  return {
    tenantConfig,
    riskSensitivityModifier: Number(tenantConfig?.riskSensitivityModifier ?? 0) || 0,
    riskThresholdVersion:
      Number.parseInt(String(tenantConfig?.riskThresholdVersion ?? 1), 10) || 1,
  };
}

function makeCapabilityError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function enforceCapabilityAccess({ capability, actorRole, channel }) {
  const roleSet = toLowerSet(capability.allowedRoles);
  const channelSet = toLowerSet(capability.allowedChannels);
  const normalizedRole = normalizeText(actorRole).toLowerCase();
  const normalizedChannel = normalizeText(channel).toLowerCase();

  if (!roleSet.has(normalizedRole)) {
    throw makeCapabilityError(
      'CAPABILITY_ROLE_DENIED',
      `Role saknar access till capability ${capability.name}.`
    );
  }
  if (!channelSet.has(normalizedChannel)) {
    throw makeCapabilityError(
      'CAPABILITY_CHANNEL_DENIED',
      `Channel saknar access till capability ${capability.name}.`
    );
  }
}

function ensureSchemaValidity({ schema, value, rootPath, errorCode, label }) {
  const validation = validateJsonSchema({
    schema,
    value,
    rootPath,
  });
  if (validation.ok) return;
  throw makeCapabilityError(
    errorCode,
    `${label} schema validation failed.`,
    {
      errors: validation.errors,
    }
  );
}

function enforceAgentAccess({ agentBundle, actorRole, channel }) {
  const roleSet = toLowerSet(agentBundle.allowedRoles);
  const channelSet = toLowerSet(agentBundle.allowedChannels);
  const normalizedRole = normalizeText(actorRole).toLowerCase();
  const normalizedChannel = normalizeText(channel).toLowerCase();

  if (!roleSet.has(normalizedRole)) {
    throw makeCapabilityError(
      'CAPABILITY_AGENT_ROLE_DENIED',
      `Role saknar access till agent ${agentBundle.name}.`
    );
  }
  if (!channelSet.has(normalizedChannel)) {
    throw makeCapabilityError(
      'CAPABILITY_AGENT_CHANNEL_DENIED',
      `Channel saknar access till agent ${agentBundle.name}.`
    );
  }
}

function toCapabilityResponseOutput(capabilityRunResult = null) {
  const responsePayload = capabilityRunResult?.gatewayResult?.response_payload;
  if (!responsePayload || typeof responsePayload !== 'object') return null;
  return safeObject(responsePayload.output);
}

function toDependencyRunSummary(capabilityRunResult = null) {
  return {
    capabilityName: normalizeText(capabilityRunResult?.capability?.name) || null,
    capabilityVersion: normalizeText(capabilityRunResult?.capability?.version) || null,
    capabilityRunId: normalizeText(capabilityRunResult?.capabilityRunId) || null,
    gatewayRunId: normalizeText(capabilityRunResult?.gatewayResult?.run_id) || null,
    decision: normalizeText(capabilityRunResult?.gatewayResult?.decision) || null,
  };
}

function bindGatewayRunCapability(executionGateway) {
  if (typeof executionGateway?.runCapability === 'function') {
    return async ({ capabilityName, context, handlers }) =>
      executionGateway.runCapability(capabilityName, { context, handlers });
  }
  if (typeof executionGateway?.run === 'function') {
    executionGateway.runCapability = async (_capabilityName, { context, handlers }) =>
      executionGateway.run({ context, handlers });
    return async ({ capabilityName, context, handlers }) =>
      executionGateway.runCapability(capabilityName, { context, handlers });
  }
  throw new Error('Capability executor kräver executionGateway.runCapability eller executionGateway.run.');
}

function createCapabilityExecutor({
  executionGateway,
  authStore,
  tenantConfigStore,
  capabilityAnalysisStore = null,
  buildVersion = 'dev',
}) {
  const runCapabilityThroughGateway = bindGatewayRunCapability(executionGateway);
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    throw new Error('Capability executor kräver authStore.addAuditEvent.');
  }
  if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
    throw new Error('Capability executor kräver tenantConfigStore.getTenantConfig.');
  }

  async function writeAudit({
    tenantId,
    actorUserId = null,
    action,
    outcome = 'success',
    targetType = '',
    targetId = '',
    metadata = {},
  }) {
    await authStore.addAuditEvent({
      tenantId,
      actorUserId,
      action,
      outcome,
      targetType,
      targetId,
      metadata: metadata || {},
    });
  }

  async function runCapability({
    tenantId,
    actor = {},
    channel = 'admin',
    capabilityName,
    input = {},
    systemStateSnapshot = {},
    correlationId = null,
    idempotencyKey = null,
    requestMetadata = {},
  }) {
    const CapabilityClass = getCapabilityByName(capabilityName);
    if (!CapabilityClass) {
      throw makeCapabilityError(
        'CAPABILITY_NOT_FOUND',
        `Capability saknas: ${normalizeText(capabilityName) || '<empty>'}.`
      );
    }
    const capabilityInstance = new CapabilityClass();

    const normalizedTenantId = normalizeText(tenantId);
    const normalizedActor = {
      id: normalizeText(actor?.id) || null,
      role: normalizeText(actor?.role) || null,
    };
    const normalizedChannel = normalizeText(channel).toLowerCase() || 'admin';
    const normalizedCorrelationId = normalizeText(correlationId) || null;
    const normalizedIdempotencyKey = normalizeText(idempotencyKey) || null;
    const capabilityRunId = crypto.randomUUID();

    if (!normalizedTenantId) {
      throw makeCapabilityError('CAPABILITY_INVALID_TENANT', 'tenantId saknas för capability-run.');
    }

    enforceCapabilityAccess({
      capability: CapabilityClass,
      actorRole: normalizedActor.role,
      channel: normalizedChannel,
    });

    const validatedInput = safeObject(input);
    const validatedSystemStateSnapshot = safeObject(systemStateSnapshot);
    ensureSchemaValidity({
      schema: CapabilityClass.inputSchema,
      value: validatedInput,
      rootPath: 'capability.input',
      errorCode: 'CAPABILITY_INPUT_INVALID',
      label: 'Input',
    });

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.start',
      outcome: 'success',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        capabilityVersion: CapabilityClass.version,
        persistStrategy: CapabilityClass.persistStrategy,
        channel: normalizedChannel,
        correlationId: normalizedCorrelationId,
      },
    });

    const tenantRuntime = await getTenantRuntimeConfig(tenantConfigStore, normalizedTenantId);

    let gatewayResult = null;
    try {
      gatewayResult = await runCapabilityThroughGateway({
        capabilityName: CapabilityClass.name,
        context: {
          tenant_id: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          intent: `capability.${CapabilityClass.name}.run`,
          payload: {
            capabilityRunId,
            capabilityName: CapabilityClass.name,
            capabilityVersion: CapabilityClass.version,
            systemStateSnapshot: validatedSystemStateSnapshot,
          },
          correlation_id: normalizedCorrelationId,
          idempotency_key: normalizedIdempotencyKey,
        },
        handlers: {
          audit: async (event) => {
            await writeAudit({
              tenantId: normalizedTenantId,
              actorUserId: normalizedActor.id,
              action: event.action,
              outcome: event.outcome,
              targetType: 'gateway_run',
              targetId: String(event?.metadata?.runId || ''),
              metadata: {
                ...(event.metadata || {}),
                capabilityRunId,
                capabilityName: CapabilityClass.name,
              },
            });
          },
          inputRisk: async () => {
            if (CapabilityClass.requiresInputRisk !== true) {
              return buildAllowRiskEvaluation({
                scope: 'input',
                buildVersion,
              });
            }
            return evaluateTemplateRisk({
              scope: 'input',
              category: 'INTERNAL',
              content: stringifyForRisk(validatedInput),
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
            });
          },
          agentRun: async ({ runId, context: gatewayContext }) => {
            const injectedSnapshot = safeObject(
              gatewayContext?.payload?.systemStateSnapshot ||
                gatewayContext?.payload?.system_state_snapshot ||
                validatedSystemStateSnapshot
            );
            const output = await capabilityInstance.execute({
              tenantId: normalizedTenantId,
              actor: normalizedActor,
              channel: normalizedChannel,
              correlationId: normalizedCorrelationId,
              requestId: runId,
              input: validatedInput,
              systemStateSnapshot: injectedSnapshot,
            });
            ensureSchemaValidity({
              schema: CapabilityClass.outputSchema,
              value: output,
              rootPath: 'capability.output',
              errorCode: 'CAPABILITY_OUTPUT_INVALID',
              label: 'Output',
            });
            return {
              output: safeObject(output),
            };
          },
          outputRisk: async ({ agentResult }) => {
            if (CapabilityClass.requiresOutputRisk !== true) {
              return buildAllowRiskEvaluation({
                scope: 'output',
                buildVersion,
              });
            }
            return evaluateTemplateRisk({
              scope: 'output',
              category: 'INTERNAL',
              content: stringifyForRisk(agentResult?.output || null),
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
            });
          },
          policyFloor: async ({ agentResult }) => {
            if (CapabilityClass.requiresPolicyFloor !== true) {
              return {
                blocked: false,
                maxFloor: 1,
                hits: [],
              };
            }
            return evaluatePolicyFloorText({
              text: stringifyForRisk(agentResult?.output || null),
              context: 'orchestrator',
            });
          },
          persist: async ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => {
            const strategy = normalizeText(CapabilityClass.persistStrategy).toLowerCase();
            if (strategy === 'none') return null;
            if (strategy !== 'analysis') {
              const error = makeCapabilityError(
                'CAPABILITY_PERSIST_STRATEGY_NOT_IMPLEMENTED',
                `Persist-strategy stöds ej ännu: ${CapabilityClass.persistStrategy}.`
              );
              error.nonRetryable = true;
              throw error;
            }
            if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
              const error = makeCapabilityError(
                'CAPABILITY_ANALYSIS_STORE_MISSING',
                'Analysis store saknas för persistStrategy=analysis.'
              );
              error.nonRetryable = true;
              throw error;
            }

            const entry = await capabilityAnalysisStore.append({
              tenantId: normalizedTenantId,
              capability: {
                name: CapabilityClass.name,
                version: CapabilityClass.version,
                persistStrategy: CapabilityClass.persistStrategy,
              },
              decision,
              runId,
              capabilityRunId,
              correlationId: normalizedCorrelationId,
              actor: normalizedActor,
              input: validatedInput,
              output: agentResult?.output || null,
              riskSummary: {
                input: inputRisk?.evaluation || null,
                output: outputRisk?.evaluation || null,
              },
              policySummary: {
                blocked: policy?.blocked === true,
                reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
              },
              metadata: {
                channel: normalizedChannel,
                requestMetadata: safeObject(requestMetadata),
              },
            });
            return {
              artifact_refs: {
                analysis_id: entry.id,
                capability_name: CapabilityClass.name,
                capability_run_id: capabilityRunId,
              },
            };
          },
          safeResponse: ({ decision }) => ({
            error:
              'Capability-resultatet blockerades av risk/policy. Granska körningen i audit och försök igen.',
            decision,
            capability: {
              name: CapabilityClass.name,
              version: CapabilityClass.version,
              runId: capabilityRunId,
            },
          }),
          response: ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => ({
            capability: {
              name: CapabilityClass.name,
              version: CapabilityClass.version,
              runId: capabilityRunId,
              gatewayRunId: runId,
              persistStrategy: CapabilityClass.persistStrategy,
            },
            decision,
            riskSummary: {
              input: inputRisk?.evaluation || null,
              output: outputRisk?.evaluation || null,
            },
            policySummary: {
              blocked: policy?.blocked === true,
              reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
            },
            output: agentResult?.output || null,
          }),
        },
      });
    } catch (error) {
      await writeAudit({
        tenantId: normalizedTenantId,
        actorUserId: normalizedActor.id,
        action: 'capability.run.complete',
        outcome: 'error',
        targetType: 'capability_run',
        targetId: capabilityRunId,
        metadata: {
          capabilityRunId,
          capabilityName: CapabilityClass.name,
          errorCode: error?.code || null,
          errorMessage: normalizeText(error?.message) || 'capability_run_error',
          correlationId: normalizedCorrelationId,
        },
      });
      throw error;
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.decision',
      outcome:
        gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate'
          ? 'blocked'
          : 'success',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        gatewayRunId: gatewayResult.run_id || null,
        decision: gatewayResult.decision,
        correlationId: normalizedCorrelationId,
      },
    });

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.persist',
      outcome: gatewayResult?.artifact_refs ? 'success' : 'skipped',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        gatewayRunId: gatewayResult.run_id || null,
        persisted: Boolean(gatewayResult?.artifact_refs),
        artifactRefs: gatewayResult?.artifact_refs || null,
        correlationId: normalizedCorrelationId,
      },
    });

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'capability.run.complete',
      outcome:
        gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate'
          ? 'blocked'
          : 'success',
      targetType: 'capability_run',
      targetId: capabilityRunId,
      metadata: {
        capabilityRunId,
        capabilityName: CapabilityClass.name,
        gatewayRunId: gatewayResult.run_id || null,
        decision: gatewayResult.decision,
        correlationId: normalizedCorrelationId,
        completedAt: toIso(new Date()) || new Date().toISOString(),
      },
    });

    return {
      capabilityRunId,
      capability: CapabilityClass,
      gatewayResult,
    };
  }

  async function runAgent({
    tenantId,
    actor = {},
    channel = 'admin',
    agentName,
    input = {},
    systemStateSnapshot = {},
    correlationId = null,
    idempotencyKey = null,
    requestMetadata = {},
  }) {
    const agentBundle = getAgentBundleByName(agentName);
    if (!agentBundle) {
      throw makeCapabilityError(
        'CAPABILITY_AGENT_NOT_FOUND',
        `Agent saknas: ${normalizeText(agentName) || '<empty>'}.`
      );
    }

    const normalizedTenantId = normalizeText(tenantId);
    const normalizedActor = {
      id: normalizeText(actor?.id) || null,
      role: normalizeText(actor?.role) || null,
    };
    const normalizedChannel = normalizeText(channel).toLowerCase() || 'admin';
    const normalizedCorrelationId = normalizeText(correlationId) || null;
    const normalizedIdempotencyKey = normalizeText(idempotencyKey) || null;
    const agentRunId = crypto.randomUUID();

    if (!normalizedTenantId) {
      throw makeCapabilityError('CAPABILITY_INVALID_TENANT', 'tenantId saknas för agent-run.');
    }

    enforceAgentAccess({
      agentBundle,
      actorRole: normalizedActor.role,
      channel: normalizedChannel,
    });

    const validatedInput = safeObject(input);
    const validatedSystemStateSnapshot = safeObject(systemStateSnapshot);

    const normalizedAgentName = normalizeText(agentBundle.name).toUpperCase();

    if (normalizedAgentName === COO_AGENT_NAME) {
      ensureSchemaValidity({
        schema: cooDailyBriefInputSchema,
        value: validatedInput,
        rootPath: 'agent.input',
        errorCode: 'CAPABILITY_AGENT_INPUT_INVALID',
        label: 'Agent input',
      });
    } else if (normalizedAgentName === CCO_AGENT_NAME) {
      ensureSchemaValidity({
        schema: ccoInboxAnalysisInputSchema,
        value: validatedInput,
        rootPath: 'agent.input',
        errorCode: 'CAPABILITY_AGENT_INPUT_INVALID',
        label: 'Agent input',
      });
    } else {
      throw makeCapabilityError(
        'CAPABILITY_AGENT_NOT_IMPLEMENTED',
        `Agent ej implementerad for execution: ${agentBundle.name}.`
      );
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'agent.run.start',
      outcome: 'success',
      targetType: 'agent_run',
      targetId: agentRunId,
      metadata: {
        agentRunId,
        agentName: agentBundle.name,
        agentVersion: agentBundle.version,
        persistStrategy: agentBundle.persistStrategy,
        channel: normalizedChannel,
        correlationId: normalizedCorrelationId,
      },
    });

    let gatewayResult = null;
    let dependencyRuns = [];
    let agentOutput = null;
    let agentOutputSchema = null;
    let agentCapabilityRef = '';
    try {
      if (normalizedAgentName === COO_AGENT_NAME) {
        const summarizeRun = await runCapability({
          tenantId: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          capabilityName: 'SummarizeIncidents',
          input: {
            includeClosed: validatedInput.includeClosed === true,
            timeframeDays: Number(validatedInput.timeframeDays || 14) || 14,
          },
          systemStateSnapshot: validatedSystemStateSnapshot,
          correlationId: normalizedCorrelationId,
          idempotencyKey: normalizedIdempotencyKey
            ? `${normalizedIdempotencyKey}:summarize`
            : null,
          requestMetadata: {
            ...safeObject(requestMetadata),
            parentAgentRunId: agentRunId,
            parentAgentName: agentBundle.name,
          },
        });

        if (
          summarizeRun?.gatewayResult?.decision === 'blocked' ||
          summarizeRun?.gatewayResult?.decision === 'critical_escalate'
        ) {
          throw makeCapabilityError(
            'CAPABILITY_AGENT_DEPENDENCY_BLOCKED',
            'SummarizeIncidents blockerade agent-korning.'
          );
        }

        const taskPlanRun = await runCapability({
          tenantId: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          capabilityName: 'GenerateTaskPlan',
          input: {
            maxTasks: Number(validatedInput.maxTasks || 5) || 5,
            includeEvidence: validatedInput.includeEvidence !== false,
          },
          systemStateSnapshot: validatedSystemStateSnapshot,
          correlationId: normalizedCorrelationId,
          idempotencyKey: normalizedIdempotencyKey ? `${normalizedIdempotencyKey}:taskplan` : null,
          requestMetadata: {
            ...safeObject(requestMetadata),
            parentAgentRunId: agentRunId,
            parentAgentName: agentBundle.name,
          },
        });

        if (
          taskPlanRun?.gatewayResult?.decision === 'blocked' ||
          taskPlanRun?.gatewayResult?.decision === 'critical_escalate'
        ) {
          throw makeCapabilityError(
            'CAPABILITY_AGENT_DEPENDENCY_BLOCKED',
            'GenerateTaskPlan blockerade agent-korning.'
          );
        }

        dependencyRuns = [toDependencyRunSummary(summarizeRun), toDependencyRunSummary(taskPlanRun)];
        agentOutput = composeCooDailyBrief({
          incidentOutput: toCapabilityResponseOutput(summarizeRun),
          taskPlanOutput: toCapabilityResponseOutput(taskPlanRun),
          channel: normalizedChannel,
          tenantId: normalizedTenantId,
          correlationId: normalizedCorrelationId,
        });
        agentOutputSchema = cooDailyBriefOutputSchema;
        agentCapabilityRef = COO_DAILY_BRIEF_CAPABILITY_REF;
      } else if (normalizedAgentName === CCO_AGENT_NAME) {
        const analyzeInboxInput = {
          includeClosed: validatedInput.includeClosed === true,
          maxDrafts: Number(validatedInput.maxDrafts || 5) || 5,
        };
        if (validatedInput.debug === true) {
          analyzeInboxInput.debug = true;
        }
        const analyzeInboxRun = await runCapability({
          tenantId: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          capabilityName: 'AnalyzeInbox',
          input: analyzeInboxInput,
          systemStateSnapshot: validatedSystemStateSnapshot,
          correlationId: normalizedCorrelationId,
          idempotencyKey: normalizedIdempotencyKey
            ? `${normalizedIdempotencyKey}:analyzeinbox`
            : null,
          requestMetadata: {
            ...safeObject(requestMetadata),
            parentAgentRunId: agentRunId,
            parentAgentName: agentBundle.name,
          },
        });

        if (
          analyzeInboxRun?.gatewayResult?.decision === 'blocked' ||
          analyzeInboxRun?.gatewayResult?.decision === 'critical_escalate'
        ) {
          throw makeCapabilityError(
            'CAPABILITY_AGENT_DEPENDENCY_BLOCKED',
            'AnalyzeInbox blockerade agent-korning.'
          );
        }

        dependencyRuns = [toDependencyRunSummary(analyzeInboxRun)];
        agentOutput = composeCcoInboxAnalysis({
          inboxOutput: toCapabilityResponseOutput(analyzeInboxRun),
          channel: normalizedChannel,
          tenantId: normalizedTenantId,
          correlationId: normalizedCorrelationId,
        });
        agentOutputSchema = ccoInboxAnalysisOutputSchema;
        agentCapabilityRef = CCO_INBOX_ANALYSIS_CAPABILITY_REF;
      }

      ensureSchemaValidity({
        schema: agentOutputSchema,
        value: agentOutput,
        rootPath: 'agent.output',
        errorCode: 'CAPABILITY_AGENT_OUTPUT_INVALID',
        label: 'Agent output',
      });

      const tenantRuntime = await getTenantRuntimeConfig(tenantConfigStore, normalizedTenantId);

      gatewayResult = await runCapabilityThroughGateway({
        capabilityName: agentCapabilityRef,
        context: {
          tenant_id: normalizedTenantId,
          actor: normalizedActor,
          channel: normalizedChannel,
          intent: `agent.${agentBundle.name}.run`,
          payload: {
            agentRunId,
            agentName: agentBundle.name,
            agentVersion: agentBundle.version,
            dependencyRuns,
          },
          correlation_id: normalizedCorrelationId,
          idempotency_key: normalizedIdempotencyKey,
        },
        handlers: {
          audit: async (event) => {
            await writeAudit({
              tenantId: normalizedTenantId,
              actorUserId: normalizedActor.id,
              action: event.action,
              outcome: event.outcome,
              targetType: 'gateway_run',
              targetId: String(event?.metadata?.runId || ''),
              metadata: {
                ...(event.metadata || {}),
                agentRunId,
                agentName: agentBundle.name,
              },
            });
          },
          inputRisk: async () =>
            buildAllowRiskEvaluation({
              scope: 'input',
              buildVersion,
            }),
          agentRun: async () => ({
            output: safeObject(agentOutput),
            dependencyRuns,
          }),
          outputRisk: async ({ agentResult }) =>
            evaluateTemplateRisk({
              scope: 'output',
              category: 'INTERNAL',
              content: stringifyForRisk(agentResult?.output || null),
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
            }),
          policyFloor: async ({ agentResult }) =>
            evaluatePolicyFloorText({
              text: stringifyForRisk(agentResult?.output || null),
              context: 'orchestrator',
            }),
          persist: async ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => {
            if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
              const error = makeCapabilityError(
                'CAPABILITY_ANALYSIS_STORE_MISSING',
                'Analysis store saknas for agent persistStrategy=analysis.'
              );
              error.nonRetryable = true;
              throw error;
            }
            const entry = await capabilityAnalysisStore.append({
              tenantId: normalizedTenantId,
              capability: {
                name: agentCapabilityRef,
                version: agentBundle.version,
                persistStrategy: 'analysis',
              },
              decision,
              runId,
              capabilityRunId: agentRunId,
              correlationId: normalizedCorrelationId,
              actor: normalizedActor,
              input: validatedInput,
              output: agentResult?.output || null,
              riskSummary: {
                input: inputRisk?.evaluation || null,
                output: outputRisk?.evaluation || null,
              },
              policySummary: {
                blocked: policy?.blocked === true,
                reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
              },
              metadata: {
                agentName: agentBundle.name,
                channel: normalizedChannel,
                requestMetadata: safeObject(requestMetadata),
                dependencyRuns,
              },
            });
            return {
              artifact_refs: {
                analysis_id: entry.id,
                agent_name: agentBundle.name,
                agent_run_id: agentRunId,
              },
            };
          },
          safeResponse: ({ decision }) => ({
            error:
              'Agent-resultatet blockerades av risk/policy. Granska korningen i audit innan nytt forsok.',
            decision,
            agent: {
              name: agentBundle.name,
              version: agentBundle.version,
              runId: agentRunId,
            },
          }),
          response: ({ runId, decision, inputRisk, outputRisk, policy, agentResult }) => ({
            agent: {
              name: agentBundle.name,
              version: agentBundle.version,
              runId: agentRunId,
              gatewayRunId: runId,
              persistStrategy: agentBundle.persistStrategy,
              capabilities: Array.isArray(agentBundle.capabilities)
                ? [...agentBundle.capabilities]
                : [],
            },
            decision,
            riskSummary: {
              input: inputRisk?.evaluation || null,
              output: outputRisk?.evaluation || null,
            },
            policySummary: {
              blocked: policy?.blocked === true,
              reasonCodes: Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [],
            },
            output: agentResult?.output || null,
            dependencyRuns,
          }),
        },
      });
    } catch (error) {
      await writeAudit({
        tenantId: normalizedTenantId,
        actorUserId: normalizedActor.id,
        action: 'agent.run.complete',
        outcome: 'error',
        targetType: 'agent_run',
        targetId: agentRunId,
        metadata: {
          agentRunId,
          agentName: agentBundle.name,
          errorCode: error?.code || null,
          errorMessage: normalizeText(error?.message) || 'agent_run_error',
          correlationId: normalizedCorrelationId,
        },
      });
      throw error;
    }

    await writeAudit({
      tenantId: normalizedTenantId,
      actorUserId: normalizedActor.id,
      action: 'agent.run.complete',
      outcome:
        gatewayResult?.decision === 'blocked' || gatewayResult?.decision === 'critical_escalate'
          ? 'blocked'
          : 'success',
      targetType: 'agent_run',
      targetId: agentRunId,
      metadata: {
        agentRunId,
        agentName: agentBundle.name,
        gatewayRunId: gatewayResult?.run_id || null,
        decision: gatewayResult?.decision || null,
        correlationId: normalizedCorrelationId,
        completedAt: toIso(new Date()) || new Date().toISOString(),
      },
    });

    return {
      agentRunId,
      agent: agentBundle,
      gatewayResult,
      dependencyRuns,
    };
  }

  return {
    listCapabilities,
    listAgentBundles,
    runCapability,
    runAgent,
  };
}

module.exports = {
  createCapabilityExecutor,
};
