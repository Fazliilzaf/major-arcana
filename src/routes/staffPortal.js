'use strict';

/**
 * staffPortal.js — Personalportal för Hair TP Clinic
 *
 * Serverar prototypvyn och definerar API-stubs för:
 *   - Rollbaserade dashboards (sjuksköterska, läkare, admin/owner)
 *   - Ordinationsgranskning (human-in-the-loop, aldrig AI-beslut)
 *   - QMS-checklistor och avvikelserapporter
 *   - Audit-trail per händelse
 *
 * Säkerhetsregler (inbyggda):
 *   - Systemet skapar ALDRIG ordination.approved automatiskt
 *   - All klinisk granskning kräver explicit POST + RBAC-permission
 *   - Varje statusändring → audit-logg med actor + signatur + tidsstämpel
 *   - Bilder/konversationer visas bara för tilldelad personal
 */

const express = require('express');
const path    = require('path');
const { requirePermission, requireAnyRole } = require('../security/ccoRbac');

const router = express.Router();

/* ── Prototype view (read-only HTML) ─────────────────────────── */
router.get('/staff-portal', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/staff-portal.html'));
});

/* ── API: Stubs (ej aktiva i prototypfas) ────────────────────── */

/**
 * GET /api/v1/staff/me
 * Returnerar inloggad personals roll och profil.
 * Används av frontend för att ladda rätt dashboard-vy.
 */
router.get('/api/v1/staff/me',
  requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
  (req, res) => {
    res.json({
      ok: true,
      staffId: req.session?.userId ?? null,
      role:    req.session?.role   ?? null,
      name:    req.session?.name   ?? null,
    });
  }
);

/**
 * GET /api/v1/staff/tasks
 * Hämtar uppgifter tilldelade inloggad personal.
 * Filtreras per roll — sjuksköterska ser bara sina egna ärenden.
 */
router.get('/api/v1/staff/tasks',
  requirePermission('customers.read'),
  (_req, res) => {
    // TODO: hämta från staff_tasks-tabell via sqliteStore
    res.json({ ok: true, tasks: [], _note: 'Stub — implementeras i fas 2' });
  }
);

/**
 * GET /api/v1/staff/ordination-reviews
 * Hämtar väntande ordinationsunderlag för legitimerad läkare.
 * Kräver 'ordination.view'-permission (konsult/owner).
 *
 * Säkerhet: status sätts ALDRIG till 'approved' automatiskt.
 * Läkaren måste explicit POST:a ett godkännande (se nedan).
 */
router.get('/api/v1/staff/ordination-reviews',
  requirePermission('ordination.view'),
  (_req, res) => {
    // TODO: hämta från ordination_reviews-tabell
    res.json({ ok: true, reviews: [], _note: 'Stub — implementeras i fas 2' });
  }
);

/**
 * POST /api/v1/staff/ordination-reviews/:id/approve
 * Legitimerad läkare godkänner ordinationsunderlag manuellt.
 *
 * Body: { comment: string, signature: string }
 *
 * Säkerhetsregler:
 *   - Kräver 'ordination.approve'-permission (ej personal/sjuksköterska)
 *   - Sparar actor, tidsstämpel, signatur och IP i audit-loggen
 *   - Systemet ändrar ALDRIG status utan explicit läkarhandling
 *   - Ingen AI är involverad i detta flöde
 */
router.post('/api/v1/staff/ordination-reviews/:id/approve',
  requirePermission('ordination.approve'),
  async (req, res) => {
    const { id } = req.params;
    const { comment = '', signature = '' } = req.body ?? {};

    if (!signature || signature.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Signatur krävs för godkännande.' });
    }

    // TODO: uppdatera ordination_reviews-rad
    // TODO: skriv audit-logg: { kind: 'ordination.approved', actor, entityId: id, detail: { signature, comment } }

    res.json({
      ok: true,
      reviewId: id,
      status: 'approved',
      approvedBy: req.session?.userId ?? 'unknown',
      approvedAt: new Date().toISOString(),
      signature,
      _note: 'Stub — implementeras i fas 2',
    });
  }
);

/**
 * POST /api/v1/staff/ordination-reviews/:id/reject
 * Legitimerad läkare avvisar ordinationsunderlag.
 * Kräver alltid en motivering (comment).
 */
router.post('/api/v1/staff/ordination-reviews/:id/reject',
  requirePermission('ordination.approve'),
  async (req, res) => {
    const { id } = req.params;
    const { comment = '' } = req.body ?? {};

    if (!comment || comment.trim().length < 5) {
      return res.status(400).json({ ok: false, error: 'Motivering krävs vid avvisning.' });
    }

    // TODO: uppdatera ordination_reviews-rad
    // TODO: skriv audit-logg: { kind: 'ordination.rejected', actor, entityId: id, detail: { comment } }

    res.json({
      ok: true,
      reviewId: id,
      status: 'rejected',
      rejectedBy: req.session?.userId ?? 'unknown',
      rejectedAt: new Date().toISOString(),
      _note: 'Stub — implementeras i fas 2',
    });
  }
);

/**
 * GET /api/v1/staff/delegations
 * Hämtar delegeringsdokument för inloggad personal.
 * Sjuksköterskor ser bara sina egna.
 */
router.get('/api/v1/staff/delegations',
  requirePermission('delegation.read'),
  (_req, res) => {
    res.json({ ok: true, delegations: [], _note: 'Stub — implementeras i fas 2' });
  }
);

/**
 * GET /api/v1/staff/qms/checklists
 * Hämtar aktiva checklistor för inloggad personal.
 */
router.get('/api/v1/staff/qms/checklists',
  requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
  (_req, res) => {
    res.json({ ok: true, checklists: [], _note: 'Stub — implementeras i fas 2' });
  }
);

/**
 * POST /api/v1/staff/qms/checklists/:id/complete-item
 * Markerar ett checklisteobjekt som klart.
 * Sparas med tidsstämpel + actor — kan ej raderas (immutable audit).
 */
router.post('/api/v1/staff/qms/checklists/:id/complete-item',
  requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
  (req, res) => {
    const { id } = req.params;
    const { itemKey } = req.body ?? {};

    if (!itemKey) {
      return res.status(400).json({ ok: false, error: 'itemKey krävs.' });
    }

    // TODO: spara i qms_checklists-tabell + audit-logg
    res.json({
      ok: true,
      checklistId: id,
      itemKey,
      completedBy: req.session?.userId ?? 'unknown',
      completedAt: new Date().toISOString(),
      _note: 'Stub — implementeras i fas 2',
    });
  }
);

/**
 * POST /api/v1/staff/qms/deviations
 * Rapporterar en ny avvikelse (OLS-3).
 * Tillgänglig för all personal.
 */
router.post('/api/v1/staff/qms/deviations',
  requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
  (req, res) => {
    const { kind, description } = req.body ?? {};

    if (!kind || !description || description.trim().length < 10) {
      return res.status(400).json({ ok: false, error: 'kind och description (min 10 tecken) krävs.' });
    }

    // TODO: spara i qms_deviations-tabell + audit-logg
    res.json({
      ok: true,
      deviationId: `AVV-${Date.now()}`,
      kind,
      status: 'open',
      reportedBy: req.session?.userId ?? 'unknown',
      reportedAt: new Date().toISOString(),
      _note: 'Stub — implementeras i fas 2',
    });
  }
);

/**
 * GET /api/v1/staff/customer-threads/:customerId
 * Hämtar konversationer för en specifik kund — filtrerat till tilldelad personal.
 * Kunden ser aldrig vem som hanterar ärendet (returneras ej till patient-API).
 */
router.get('/api/v1/staff/customer-threads/:customerId',
  requirePermission('mail.read'),
  (req, res) => {
    const { customerId } = req.params;
    // TODO: hämta från ccoConversationThreadStore, filtrera på assignedTo
    res.json({ ok: true, customerId, threads: [], _note: 'Stub — implementeras i fas 2' });
  }
);

module.exports = router;
