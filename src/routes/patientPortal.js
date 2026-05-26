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

function createPatientPortalRouter({ patientPortalStore, journalStore }) {
  const router = express.Router();

  router.get('/patient-portal/:token', async (req, res) => {
    const token = normalizeText(req.params?.token);
    if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });

    const invite = await patientPortalStore.findInvite(token);
    if (!invite) {
      return res
        .status(404)
        .json({
          ok: false,
          error: 'invite_not_found',
          message: 'Länken är ogiltig eller har utgått.',
        });
    }
    if (invite.completedAt) {
      return res.json({
        ok: true,
        status: 'completed',
        message: 'Formuläret är redan inskickat.',
        invite,
      });
    }
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
    if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });

    const invite = await patientPortalStore.findInvite(token);
    if (!invite) {
      return res.status(404).json({ ok: false, error: 'invite_expired' });
    }
    if (invite.completedAt) {
      return res.status(409).json({ ok: false, error: 'already_submitted' });
    }

    const formData = req.body?.formData || {};
    const signature = normalizeText(req.body?.signature);

    await patientPortalStore.completeInvite(token, { formData, signature });

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
            metadata: { portalToken: token, submittedAt: nowIso() },
          });
        } catch (_err) {
          /* journal sync failure non-blocking */
        }
      }
    }

    return res.json({ ok: true, status: 'completed', message: 'Tack! Formuläret är inskickat.' });
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
