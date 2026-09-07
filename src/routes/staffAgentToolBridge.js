'use strict';

/**
 * staffAgentToolBridge.js — Master Agent ↔ Major Arcana tool-bridge (WP-008b/009).
 *
 * Enda vägen för Master Agent att utföra ett CMO-tool. Master Agent skickar
 * endast ett FÖRSLAG (canonical tool + args) + det serververifierade context-
 * tokenet. Här körs toolExecutor → actionGate → path guard → execution → receipt.
 *
 * Master Agent kan ALDRIG hoppa över toolExecutor eller själv skapa ett ALLOW.
 * WP-009 (DEL A): utöver token-verifiering re-checkas LIVE vid VARJE execution:
 *   - authenticated/verifierad identity (HMAC + TTL)
 *   - tenant (ur token)
 *   - membership status (aktiv; disabled/revoked/inactive/suspended → DENY)
 *   - aktiv CMO-entitlement (ur store)
 * En tidigare utfärdad 15-min-token håller INTE en disabled användare aktiv.
 */

const express = require('express');
const { verifyContextToken } = require('../security/staffAgentContext');
const { executeCmoTool } = require('../security/toolExecutor');

const INACTIVE_STATUSES = new Set(['disabled', 'revoked', 'inactive', 'suspended']);

async function membershipIsActive(authStore, userId, tenantId) {
  if (!authStore || typeof authStore.getUserById !== 'function') {
    return { ok: false, reason: 'auth_store_unavailable' };
  }
  const user = await authStore.getUserById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };
  if (INACTIVE_STATUSES.has(String(user.status || '').toLowerCase()) || user.status !== 'active') {
    return { ok: false, reason: 'user_inactive' };
  }
  const memberships = await authStore.listMembershipsForUser(userId, { includeDisabled: true });
  const membership = (Array.isArray(memberships) ? memberships : []).find(
    (m) => String(m.tenantId || '').trim() === String(tenantId || '').trim()
  );
  if (!membership) return { ok: false, reason: 'membership_not_found' };
  if (String(membership.status || '').toLowerCase() !== 'active') {
    return { ok: false, reason: 'membership_inactive' };
  }
  return { ok: true };
}

function createStaffAgentToolBridgeRouter({ store, authStore, roots = {}, repoAdapter = null, approvalStore = null } = {}) {
  const router = express.Router();

  router.post('/staff/agent-tools/execute', async (req, res) => {
    try {
      const token =
        (req.body && (req.body.context_token || req.body.context)) ||
        req.headers['x-staff-agent-context'] ||
        '';
      const payload = verifyContextToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'invalid_context', detail: 'Ogiltigt/utgånget context.' });
      }

      const agentId = String(payload.agent_id || '').trim().toUpperCase();
      if (agentId !== 'CMO') {
        return res.status(403).json({ error: 'not_cmo', detail: 'Endast CMO har tool-mode.' });
      }

      if (!store || typeof store.hasActive !== 'function') {
        return res.status(503).json({ error: 'entitlement_store_unavailable' });
      }

      // DEL A — live membership re-check (token räcker inte).
      const membership = await membershipIsActive(authStore, payload.user_id, payload.tenant_id);
      if (!membership.ok) {
        return res.status(403).json({ error: membership.reason, detail: 'Medlemskap inaktivt/återkallat.' });
      }

      // Defense-in-depth: entitlement kan ha återkallats efter token-utfärdande.
      if (!store.hasActive(payload.user_id, payload.tenant_id, 'CMO')) {
        return res.status(403).json({ error: 'no_entitlement', detail: 'CMO-entitlement saknas/återkallad.' });
      }

      const tool = req.body?.tool;
      const args = req.body?.args || {};

      // WP-009/010: om ett repo_id anges, kör repo-adaptern (isolerad worktree).
      // WP-010: write_candidate → föreslå approval (REQUIRE_APPROVAL), ingen execution.
      if (args.repo_id) {
        if (!repoAdapter || typeof repoAdapter.executeRepoTask !== 'function') {
          return res.status(503).json({ error: 'repo_adapter_unavailable' });
        }
        const actor = { userId: payload.user_id, role: payload.staff_role };
        if (tool === 'cmo.content.write_candidate') {
          const receipt = await repoAdapter.proposeWriteCandidate({
            repoId: args.repo_id,
            taskId: args.task_id || null,
            args,
            actor,
            tenantId: payload.tenant_id,
            approvalStore,
          });
          return res.json({ receipt });
        }
        const receipt = repoAdapter.executeRepoTask({
          repoId: args.repo_id,
          tool,
          args,
          actor,
          tenantId: payload.tenant_id,
          taskId: args.task_id || null,
        });
        return res.json({ receipt });
      }

      const receipt = executeCmoTool({
        context: {
          userId: payload.user_id,
          tenantId: payload.tenant_id,
          role: payload.staff_role,
          agent: 'CMO',
          hasEntitlement: true,
          isDisabled: false,
        },
        tool,
        args,
        roots,
      });

      res.json({ receipt });
    } catch (error) {
      res.status(500).json({ error: 'internal_error', detail: error?.message || 'internt fel' });
    }
  });

  return router;
}

module.exports = { createStaffAgentToolBridgeRouter, membershipIsActive, INACTIVE_STATUSES };
