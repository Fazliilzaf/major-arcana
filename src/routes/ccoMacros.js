const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoMacrosRouter({
  macroStore,
  authStore,
  requireAuth,
  requireRole,
  // ORD-219: konversationsstoren injiceras så att makron kan UTFÖRA sina
  // åtgärder. Saknas den kan makron fortfarande listas och sparas — bara inte
  // köras, och då säger svaret det i stället för att låtsas.
  conversationStateStore = null,
  defaultTenantId = 'hair-tp-clinic',
}) {
  const router = express.Router();

  /**
   * ORD-219 — översättningen från makroåtgärd till riktig CCO-operation.
   *
   * Ligger i routen, inte i storen: storen ska kunna testas utan
   * konversationslagret, och den ska inte veta hur en tråd åtgärdas.
   */
  const macroExecutor = conversationStateStore
    ? {
        async assign({ tenantId, target, assignedToEmail }) {
          if (typeof conversationStateStore.assignConversation !== 'function') {
            throw new Error('Tilldelning saknas i konversationsstoren.');
          }
          return conversationStateStore.assignConversation({
            tenantId: tenantId || defaultTenantId,
            canonicalConversationKey: target.conversationKey,
            assignedToEmail,
            assignedByEmail: target.actorEmail || null,
            assignedByUserId: target.actorUserId || null,
            note: 'Tilldelad av makro',
          });
        },
        async setActionState({ tenantId, target, action, followUpDueAt = null }) {
          if (typeof conversationStateStore.writeConversationState !== 'function') {
            throw new Error('Statusskrivning saknas i konversationsstoren.');
          }
          const arkiv = action === 'archive';
          return conversationStateStore.writeConversationState({
            tenantId: tenantId || defaultTenantId,
            canonicalConversationKey: target.conversationKey,
            actionState: arkiv ? 'archived' : 'reply_later',
            needsReplyStatusOverride: arkiv ? 'handled' : 'needs_reply',
            followUpDueAt,
            waitingOn: arkiv ? null : 'customer',
            nextActionLabel: arkiv ? 'Arkiverad (makro)' : 'Påminnelse senare (makro)',
            actionAt: new Date().toISOString(),
            actionByUserId: target.actorUserId || null,
            actionByEmail: target.actorEmail || null,
          });
        },
      }
    : null;

  router.get('/cco/macros', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const macros = await macroStore.listTenantMacros({ tenantId: req.auth.tenantId });
      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'cco.macros.read',
        outcome: 'success',
        targetType: 'cco_macros',
        targetId: req.auth.tenantId,
        metadata: {
          count: macros.length,
        },
      });
      return res.json({ macros });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa makron.' });
    }
  });

  router.post('/cco/macros', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const macro = await macroStore.saveMacro({
        tenantId: req.auth.tenantId,
        macro: req.body || {},
      });
      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'cco.macros.create',
        outcome: 'success',
        targetType: 'cco_macro',
        targetId: macro.id,
        metadata: {
          trigger: macro.trigger,
        },
      });
      return res.status(201).json({ ok: true, macro });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte skapa makrot.' });
    }
  });

  router.put(
    '/cco/macros/:macroId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macro = await macroStore.saveMacro({
          tenantId: req.auth.tenantId,
          macro: {
            ...(req.body || {}),
            id: normalizeText(req.params.macroId),
          },
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.update',
          outcome: 'success',
          targetType: 'cco_macro',
          targetId: macro.id,
        });
        return res.json({ ok: true, macro });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte uppdatera makrot.' });
      }
    }
  );

  router.delete(
    '/cco/macros/:macroId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macroId = normalizeText(req.params.macroId);
        const deleted = await macroStore.deleteMacro({
          tenantId: req.auth.tenantId,
          macroId,
        });
        if (!deleted) {
          return res.status(404).json({ error: 'Makrot hittades inte.' });
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.delete',
          outcome: 'success',
          targetType: 'cco_macro',
          targetId: macroId,
        });
        return res.json({
          ok: true,
          deleted: true,
          macroId,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte radera makrot.' });
      }
    }
  );

  router.post(
    '/cco/macros/:macroId/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    // ORD-219: routen tar nu emot en kropp (conversationKey). Utan parser är
    // req.body undefined och måltråden hade alltid saknats — makrot hade
    // avvisats med 400 varje gång, vilket ser ut som en klientbugg.
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        const macroId = normalizeText(req.params.macroId);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const conversationKey = normalizeText(body.conversationKey);

        /**
         * ORD-219: en makrokörning UTAN måltråd gör ingenting meningsfullt.
         * Förut räknade den ändå upp runCount, vilket gav ett kvitto på arbete
         * som aldrig utfördes. Nu avvisas den.
         */
        if (!conversationKey) {
          return res.status(400).json({
            error: 'conversationKey krävs — ett makro körs alltid på en tråd.',
          });
        }
        if (!macroExecutor) {
          return res.status(503).json({
            error: 'Makroexekvering är inte tillgänglig (konversationsstoren saknas).',
          });
        }

        const macro = await macroStore.runMacro({
          tenantId: req.auth.tenantId,
          macroId,
          target: {
            conversationKey,
            actorEmail: normalizeText(req.auth.email) || null,
            actorUserId: normalizeText(req.auth.userId) || null,
          },
          executor: macroExecutor,
        });
        if (!macro) {
          return res.status(404).json({ error: 'Makrot hittades inte.' });
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.run',
          targetType: 'cco_macro',
          targetId: macroId,
          // ORD-219: ett delvis utfört makro får inte loggas som en lyckad
          // körning. Utfallet per åtgärd sparas så att det går att svara på
          // vad som faktiskt hände, inte bara att någon tryckte på knappen.
          outcome: macro.komplett ? 'success' : 'partial',
          metadata: {
            runCount: macro.runCount,
            conversationKey,
            komplett: macro.komplett,
            resultat: macro.resultat,
          },
        });
        return res.json({ ok: true, macro, komplett: macro.komplett, resultat: macro.resultat });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte köra makrot.' });
      }
    }
  );

  return router;
}

module.exports = {
  createCcoMacrosRouter,
};
