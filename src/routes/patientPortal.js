'use strict';

/**
 * Patient Portal routes.
 *
 * Token-based pre-visit form intake: patient receives a link, fills in
 * hälsodeklaration/friskförsäkran, data syncs into journal.
 *
 * Replaces Meridiq registration portal functionality.
 */

const express = require('express');
const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

function createPatientPortalRouter({ patientPortalStore, journalStore, auditLog = null }) {
  const router = express.Router();

  function logPortalAudit(kind, detail = {}) {
    try {
      if (auditLog?.logEvent) {
        auditLog.logEvent({
          kind,
          tenantId: detail.tenantId || 'hair_tp',
          actor: 'patient:portal',
          entityKind: 'patient_portal_invite',
          entityId: detail.token ? detail.token.slice(0, 8) + '…' : null,
          detail: {
            patientId: detail.patientId || null,
            outcome: detail.outcome || null,
            ip: detail.ip || null,
            userAgent: detail.userAgent ? detail.userAgent.slice(0, 80) : null,
            formCount: detail.formCount || null,
          },
        });
      }
    } catch {
      /* audit-bind fail ignored */
    }
  }

  function getClientIp(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  router.get('/patient-portal/:token', async (req, res) => {
    const token = normalizeText(req.params?.token);
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    if (!token) {
      logPortalAudit('portal.invite.view_failed', { ip, userAgent: ua, outcome: 'missing_token' });
      return res.status(400).json({ ok: false, error: 'missing_token' });
    }

    const invite = await patientPortalStore.findInvite(token);
    if (!invite) {
      logPortalAudit('portal.invite.view_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'invite_not_found',
      });
      return res.status(404).json({
        ok: false,
        error: 'invite_not_found',
        message: 'Länken är ogiltig eller har utgått.',
      });
    }
    if (invite.completedAt) {
      logPortalAudit('portal.invite.viewed', {
        token,
        ip,
        userAgent: ua,
        tenantId: invite.tenantId,
        patientId: invite.patientId,
        outcome: 'already_completed',
      });
      return res.json({
        ok: true,
        status: 'completed',
        message: 'Formuläret är redan inskickat.',
        invite: {
          patientName: invite.patientName,
          serviceLabel: invite.serviceLabel,
        },
      });
    }
    logPortalAudit('portal.invite.viewed', {
      token,
      ip,
      userAgent: ua,
      tenantId: invite.tenantId,
      patientId: invite.patientId,
      outcome: 'opened',
      formCount: (invite.forms || []).length,
    });
    return res.json({
      ok: true,
      status: 'pending',
      invite: {
        patientName: invite.patientName,
        serviceLabel: invite.serviceLabel,
        appointmentDate: invite.appointmentDate,
        forms: invite.forms,
        expiresAt: invite.expiresAt,
      },
    });
  });

  router.post('/patient-portal/:token/submit', async (req, res) => {
    const token = normalizeText(req.params?.token);
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    if (!token) {
      logPortalAudit('portal.submit_failed', { ip, userAgent: ua, outcome: 'missing_token' });
      return res.status(400).json({ ok: false, error: 'missing_token' });
    }

    const invite = await patientPortalStore.findInvite(token);
    if (!invite) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        outcome: 'invite_expired',
      });
      return res.status(404).json({ ok: false, error: 'invite_expired' });
    }
    if (invite.completedAt) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        tenantId: invite.tenantId,
        patientId: invite.patientId,
        outcome: 'already_submitted',
      });
      return res.status(409).json({ ok: false, error: 'already_submitted' });
    }

    const formData = req.body?.formData || {};
    const signature = normalizeText(req.body?.signature);

    // Server-side validation: minimum krav signatur
    if (!signature || signature.length < 2) {
      logPortalAudit('portal.submit_failed', {
        token,
        ip,
        userAgent: ua,
        tenantId: invite.tenantId,
        patientId: invite.patientId,
        outcome: 'missing_signature',
      });
      return res
        .status(400)
        .json({ ok: false, error: 'missing_signature', message: 'Signatur krävs (namnteckning).' });
    }

    await patientPortalStore.completeInvite(token, {
      formData,
      signature,
      submitIp: ip,
      submitUserAgent: ua,
    });

    let journalEntriesCreated = 0;
    if (journalStore && invite.patientId && invite.forms?.length > 0) {
      for (const form of invite.forms) {
        try {
          await journalStore.createEntry({
            tenantId: invite.tenantId,
            patientId: invite.patientId,
            journalType: form.journalType || 'health_declaration',
            formVariant: form.formVariant || 'hair_tp',
            fields: formData[form.formId] || formData,
            encounterId: invite.encounterId || '',
            source: 'patient_portal',
            metadata: { portalToken: token, submittedAt: nowIso(), submitIp: ip },
          });
          journalEntriesCreated += 1;
        } catch (_err) {
          /* journal sync failure non-blocking */
        }
      }
    }

    logPortalAudit('portal.submitted', {
      token,
      ip,
      userAgent: ua,
      tenantId: invite.tenantId,
      patientId: invite.patientId,
      outcome: 'completed',
      formCount: (invite.forms || []).length,
    });

    return res.json({
      ok: true,
      status: 'completed',
      message: 'Tack! Formuläret är inskickat.',
      journalEntriesCreated,
    });
  });

  return router;
}

function createPatientPortalStore({ filePath }) {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  let state = { invites: [] };

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  async function createInvite({
    tenantId,
    patientId,
    patientName,
    serviceLabel,
    appointmentDate,
    forms = [],
    encounterId,
    expiresInDays = 7,
  }) {
    const token = crypto.randomBytes(24).toString('base64url');
    const invite = {
      token,
      tenantId: normalizeText(tenantId),
      patientId: normalizeText(patientId),
      patientName: normalizeText(patientName),
      serviceLabel: normalizeText(serviceLabel),
      appointmentDate: normalizeText(appointmentDate),
      encounterId: normalizeText(encounterId),
      forms: forms.map((f) => ({
        formId: normalizeText(f.formId) || crypto.randomUUID(),
        journalType: normalizeText(f.journalType) || 'health_declaration',
        formVariant: normalizeText(f.formVariant) || 'hair_tp',
        label: normalizeText(f.label) || 'Hälsodeklaration',
      })),
      expiresAt: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
      createdAt: nowIso(),
      completedAt: null,
      formData: null,
      signature: null,
    };
    state.invites.push(invite);
    await persist();
    return invite;
  }

  async function findInvite(token) {
    const invite = state.invites.find((i) => i.token === token);
    if (!invite) return null;
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date() && !invite.completedAt)
      return null;
    return invite;
  }

  async function completeInvite(token, { formData, signature }) {
    const invite = state.invites.find((i) => i.token === token);
    if (!invite) return null;
    invite.completedAt = nowIso();
    invite.formData = formData;
    invite.signature = normalizeText(signature);
    await persist();
    return invite;
  }

  function listPending(tenantId) {
    const tid = normalizeText(tenantId);
    return state.invites.filter((i) => (!tid || i.tenantId === tid) && !i.completedAt);
  }

  return { load, persist, createInvite, findInvite, completeInvite, listPending };
}

module.exports = { createPatientPortalRouter, createPatientPortalStore };
