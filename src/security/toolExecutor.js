'use strict';

/**
 * toolExecutor.js — CMO tool-execution bakom Action Gate (WP-008).
 *
 * Enda väg från modell-förslag till utförande. Verifierar kontext + entitlement,
 * kör actionGate, och utför READ/DRAFT/PREVIEW via path-guard. Producerar kvitto.
 *
 * Ingen shell, inget git push, ingen deploy, inga secrets, ingen patientdata.
 */

const { evaluateAction } = require('./actionGate');
const { resolveTool } = require('./cmoToolRegistry');
const { safeRead, safeDraftWrite } = require('./toolPathGuard');

function executeCmoTool({ context, tool, args = {}, roots = {} }) {
  const receipt = {
    requested_by: context?.userId || null,
    agent: context?.agent || null,
    task: args.task || null,
    tools_requested: [tool],
    gate_decisions: [],
    resources_read: [],
    files_drafted: [],
    preview: null,
    approvals_requested: [],
    result: null,
  };

  if (String(context?.agent || '').trim().toUpperCase() !== 'CMO') {
    receipt.result = { ok: false, reason: 'not_cmo' };
    return receipt;
  }

  const toolDef = resolveTool(tool);
  if (!toolDef) {
    receipt.result = { ok: false, reason: 'unknown_tool' };
    return receipt;
  }

  const gate = evaluateAction({
    userId: context.userId,
    tenantId: context.tenantId,
    role: context.role,
    agent: context.agent,
    action: toolDef.action,
    resource: args.resource,
    hasEntitlement: context.hasEntitlement === true,
    isDisabled: context.isDisabled === true,
    expectedTenant: context.expectedTenant,
  });
  receipt.gate_decisions.push({ tool, decision: gate.decision, reason: gate.reason, level: gate.level, approval: gate.approval });

  if (gate.decision === 'DENY') {
    receipt.result = { ok: false, reason: gate.reason };
    return receipt;
  }

  if (gate.decision === 'REQUIRE_APPROVAL') {
    receipt.approvals_requested.push({ approvalClass: gate.approval, reason: gate.reason, action: toolDef.action });
    receipt.result = { ok: false, decision: 'REQUIRE_APPROVAL', approvalClass: gate.approval };
    return receipt; // ingen execution
  }

  // ALLOW
  if (toolDef.level === 'READ') {
    const r = safeRead({ root: roots.readRoot, target: args.path });
    if (!r.ok) { receipt.result = { ok: false, reason: r.reason }; return receipt; }
    receipt.resources_read.push(r.resolved);
    receipt.result = { ok: true, content: r.content };
    return receipt;
  }

  if (toolDef.level === 'DRAFT') {
    const r = safeDraftWrite({ root: roots.scratchRoot, target: args.path, content: args.content });
    if (!r.ok) { receipt.result = { ok: false, reason: r.reason }; return receipt; }
    receipt.files_drafted.push(r.resolved);
    receipt.result = { ok: true, draftPath: r.resolved, summary: 'Isolerad draft skapad; original orört.' };
    return receipt;
  }

  if (toolDef.level === 'PREVIEW') {
    receipt.preview = { ok: true, draftPath: args.path || null, note: 'Lokal preview (mock) — ingen deploy/push.' };
    receipt.result = { ok: true, preview: receipt.preview };
    return receipt;
  }

  receipt.result = { ok: false, reason: 'unhandled_level' };
  return receipt;
}

module.exports = { executeCmoTool };
