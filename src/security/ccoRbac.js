'use strict';

/**
 * ccoRbac.js — Role-Based Access Control för CCO
 * ===================================================
 * Implementerar 5 roller med explicit permissions enligt audit-matris:
 *   - owner    : full access + billing + invites
 *   - operator : kunder/bokningar/journal/konversationer (default)
 *   - konsult  : egna bokningar, egen kalender, egen journal
 *   - personal : kalender (read), egen journal
 *   - revisor  : billing + analytics (read-only)
 *
 * Användning:
 *   const { requirePermission, requireAnyRole } = require('./src/security/ccoRbac');
 *   app.post('/cco-customers/merge', requirePermission('customers.merge'), handler);
 *   app.get('/billing', requireAnyRole(['owner','revisor']), handler);
 */

const PERMISSIONS = {
  // Customer
  'customers.read': ['owner', 'operator', 'konsult', 'personal'],
  'customers.write': ['owner', 'operator'],
  'customers.merge': ['owner', 'operator'],
  'customers.split': ['owner', 'operator'],
  'customers.import': ['owner', 'operator'],
  'customers.delete': ['owner'],
  'customers.gdpr_export': ['owner', 'operator'],
  'customers.photo_upload': ['owner', 'operator', 'konsult'],
  'customers.photo_consent_set': ['owner', 'operator'],

  // Bookings
  'bookings.read': ['owner', 'operator', 'konsult', 'personal'],
  'bookings.write': ['owner', 'operator', 'konsult'],
  'bookings.case_decide': ['owner', 'operator'],
  'bookings.handoff': ['owner', 'operator'],
  'bookings.delete': ['owner', 'operator'],

  // Journal (känslig)
  'journal.read_own': ['owner', 'operator', 'konsult'],
  'journal.read_any': ['owner', 'operator'],
  'journal.write': ['owner', 'operator', 'konsult'],
  'journal.lock': ['owner', 'operator'],
  'journal.unlock': ['owner'],

  // Conversations / mail
  'mail.read': ['owner', 'operator', 'konsult'],
  // mail.write: mutera delad inkorg-triage-state på en tråd (Klar/Senare/
  // Återöppna) samt interna trådnotiser. Medvetet konservativt satt till
  // owner+operator — samma nivå som de andra state-muterande mail-ops
  // (mail.delete, mail.assign). konsult behåller läsning (mail.read) och
  // kan utkasta/skicka svar (mail.send), men triage-state på delade trådar
  // är owner+operator tills owner beslutar annat (se readiness-checklistan).
  'mail.write': ['owner', 'operator'],
  'mail.send': ['owner', 'operator', 'konsult'],
  // mail.live_send: owner-only grind för faktiskt utskick (queued → sent).
  // Skrivs aldrig live i denna build — rutten är ändå hårt blockerad.
  'mail.live_send': ['owner'],
  'mail.delete': ['owner', 'operator'],
  'mail.assign': ['owner', 'operator'],
  'mailbox.admin': ['owner', 'operator'],

  // Automation
  'automation.read': ['owner', 'operator'],
  'automation.edit': ['owner', 'operator'],
  'automation.deploy': ['owner'],
  'automation.autopilot_toggle': ['owner'],

  // Analytics
  'analytics.read_personal': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'analytics.read_team': ['owner', 'operator', 'revisor'],
  'analytics.export': ['owner', 'revisor'],

  // Settings
  'settings.read': ['owner', 'operator'],
  'settings.write': ['owner'],
  'settings.brand': ['owner'],

  // Billing (revisor + owner only)
  'billing.read': ['owner', 'revisor'],
  'billing.write': ['owner'],

  // Users / roles
  'users.invite': ['owner'],
  'users.role_change': ['owner'],

  // Audit log
  'audit.read': ['owner', 'revisor'],

  // Showcase (publish externt)
  'showcase.publish': ['owner', 'operator'],

  // Sprint B — Offerter (offerts till patient)
  'offer.read': ['owner', 'operator', 'konsult', 'revisor'],
  'offer.write': ['owner', 'operator'], // skapa/redigera draft + send + accept/reject
  'offer.delete': ['owner'], // bara owner kan permanenta-radera

  // Sprint D — Workspace blocking-status (read-only)
  'workspace.read': ['owner', 'operator', 'konsult', 'personal'],

  // Beslut #2 — Patient portal staff API (skapa invites)
  'portal.write': ['owner', 'operator'],
  'portal.read': ['owner', 'operator', 'konsult', 'revisor'],

  // Steg 1 — Template registry (Communication & Compliance audit)
  'templates.read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'templates.write': ['owner'],
  'templates.legal_review': ['owner'],

  // Steg 2 — Compliance scan (version-conflict + missing-audit detector)
  'compliance.read': ['owner', 'operator', 'revisor'],
  'compliance.scan': ['owner'],

  // Steg 3 — ID-verifiering
  'id_verify.read': ['owner', 'operator', 'konsult', 'personal'],
  'id_verify.write': ['owner', 'operator'],

  // Steg 4 — Unified notification-feed
  'notifications.read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'notifications.mark_read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],

  // Steg 5 — Aftercare/followup scheduler
  'aftercare.read': ['owner', 'operator', 'konsult', 'personal'],
  'aftercare.write': ['owner', 'operator'],
  'aftercare.cron_trigger': ['owner'],

  // Steg 8 — Marketing consent (GDPR opt-in/opt-out)
  'marketing.read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'marketing.write': ['owner', 'operator'],
  'marketing.send': ['owner'],

  // Sprint B — Avtal (signerade avtal med patient)
  'agreement.read': ['owner', 'operator', 'konsult', 'revisor'],
  'agreement.write': ['owner', 'operator'], // skapa/redigera draft + send
  'agreement.staff_sign': ['owner'], // staff-sign override (owner only — Beslut #1)
  'agreement.delete': ['owner'],

  // Tenant (multi-tenant switching)
  'tenant.switch': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'tenant.create': ['owner'],

  // P0.6 — Patient-photo metadata-store (ccoPhotoStore).
  // Filtrerar vem som kan se foton, ladda upp nya och radera.
  // Owner+operator+konsult kan write/read; personal kan read only.
  // Endast owner får radera (data-retention är 10-årig PDL även för bilder).
  'photo.read': ['owner', 'operator', 'konsult', 'personal'],
  'photo.write': ['owner', 'operator', 'konsult'],
  'photo.delete': ['owner'],

  // P0.B — Patient asset-store (ccoPatientAssetStore).
  // Enligt `.cursor/rules/cco-no-drive-links-import-only.mdc`. Drive +
  // Meridiq är källor, INTE destinationer. Assets måste ligga IN i CCO.
  //   asset.read     → alla utom revisor (revisor jobbar inte med rådata)
  //   asset.write    → owner + operator (staff som taggar/ändrar status)
  //   asset.delete   → owner (data-retention 10-årig PDL även för assets)
  //   asset.import   → owner (kör import-batch)
  //   asset.review   → owner + operator (lösa review-queue-items)
  //   asset.export   → owner (export av asset-metadata)
  'asset.read': ['owner', 'operator', 'konsult', 'personal'],
  'asset.write': ['owner', 'operator'],
  'asset.delete': ['owner'],
  'asset.import': ['owner'],
  'asset.review': ['owner', 'operator'],
  'asset.export': ['owner'],

  // Hair TP Imaging & Scalp Analysis (Aisia DS-3 MVP)
  'scalp.read': ['owner', 'operator', 'konsult', 'personal'],
  'scalp.write': ['owner', 'operator', 'konsult'],
  'scalp.verify': ['owner', 'operator', 'konsult'],

  // ── Personalportal — Staff Portal ─────────────────────────────
  //
  // ordination.view    : se ordinationsunderlag (läkare + ägare)
  // ordination.approve : godkänna/avvisa ordination (legitimerad läkare + ägare)
  //                      ALDRIG automation, ALDRIG AI — alltid human-in-the-loop
  // delegation.read    : se egna delegeringsdokument (all personal)
  // qms.read           : läsa QMS-checklistor, handbok, avvikelser (all personal)
  // qms.write          : hantera avvikelser, stänga ärenden (owner + operator)
  // staff.manage       : tilldela personal till ärenden, se personalöversikt (owner)
  'ordination.view': ['owner', 'operator', 'konsult'],
  'ordination.approve': ['owner', 'konsult'],
  'delegation.read': ['owner', 'operator', 'konsult', 'personal'],
  'qms.read': ['owner', 'operator', 'konsult', 'personal'],
  'qms.write': ['owner', 'operator'],
  'staff.manage': ['owner'],
};

const ALL_ROLES = ['owner', 'operator', 'konsult', 'personal', 'revisor'];

/** Map auth/session roles (OWNER/STAFF) → ccoRbac permission roles. */
// SÄKERHET: aliaset `admin: 'owner'` borttaget — det utfärdas aldrig av auth
// (roles.js ger OWNER/STAFF/PATIENT) och var en onödig eskalation TILL TOPP-
// rollen owner om role någonsin sätts från mindre betrodd källa (t.ex.
// x-cco-role i non-prod). Övriga alias motsvarar roller som faktiskt används.
const AUTH_ROLE_ALIASES = {
  owner: 'owner',
  staff: 'operator',
  operator: 'operator',
  konsult: 'konsult',
  personal: 'personal',
  revisor: 'revisor',
  doctor: 'operator',
};

function normalizeRole(role) {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  if (ALL_ROLES.includes(r)) return r;
  const aliased = AUTH_ROLE_ALIASES[r];
  return ALL_ROLES.includes(aliased) ? aliased : null;
}

function roleHasPermission(role, permission) {
  const r = normalizeRole(role);
  if (!r) return false;
  const allowed = PERMISSIONS[permission];
  if (!Array.isArray(allowed)) {
    // Okänt permission → fail-closed
    return false;
  }
  return allowed.includes(r);
}

function listPermissionsForRole(role) {
  const r = normalizeRole(role);
  if (!r) return [];
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(r))
    .map(([perm]) => perm);
}

/**
 * Extraherar aktuell roll från request. SÄKERHET: rollen får ENDAST komma från
 * verifierad auth (authStore/session/token via req.cco/req.auth/req.user). En
 * oautentiserad request får den maktlösa rollen 'anonymous' (inga permissions) —
 * INTE 'operator' (som tidigare gjorde att anonyma ärvde full operator-behörighet).
 *
 * Den klient-satta headern X-CCO-Role får ALDRIG ge behörighet i produktion (kan
 * spoofas). Den honoreras bara utanför prod (lokala tester/dev), så testsviten och
 * lokala API-klienter fungerar oförändrat.
 */
function getRoleFromRequest(req) {
  const fromAuth = req.cco?.role || req.auth?.role || req.user?.role || null;
  if (fromAuth) {
    const n = normalizeRole(fromAuth);
    if (n) return n;
  }
  if (process.env.NODE_ENV !== 'production') {
    const n = normalizeRole(req.headers?.['x-cco-role']);
    if (n) return n;
  }
  return 'anonymous';
}

/**
 * Express-middleware: kräv en specifik permission.
 *   app.post('/cco-customers/merge', requirePermission('customers.merge'), handler)
 */
function requirePermission(permission) {
  return function rbacRequirePermission(req, res, next) {
    const role = getRoleFromRequest(req);
    if (roleHasPermission(role, permission)) {
      req.cco = req.cco || {};
      req.cco.role = role;
      req.cco.permission = permission;
      return next();
    }
    return res.status(403).json({
      error: 'forbidden',
      detail: `Role "${role}" saknar permission "${permission}".`,
      requiredPermission: permission,
      actualRole: role,
    });
  };
}

/**
 * Express-middleware: kräv att rollen är en av en lista.
 *   app.get('/billing', requireAnyRole(['owner','revisor']), handler)
 */
function requireAnyRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles)
    ? allowedRoles.map((r) => normalizeRole(r)).filter(Boolean)
    : [];
  return function rbacRequireRole(req, res, next) {
    const role = getRoleFromRequest(req);
    if (allowed.includes(role)) {
      req.cco = req.cco || {};
      req.cco.role = role;
      return next();
    }
    return res.status(403).json({
      error: 'forbidden',
      detail: `Role "${role}" är inte tillåten. Krävs en av: ${allowed.join(', ')}.`,
      requiredRoles: allowed,
      actualRole: role,
    });
  };
}

/**
 * Express-middleware: lägg på alla requests för att alltid sätta req.cco.role.
 * Används som första middleware i CCO-routes så role är tillgängligt nedströms
 * utan att kräva permissions explicit.
 */
function attachRole(req, res, next) {
  req.cco = req.cco || {};
  req.cco.role = getRoleFromRequest(req);
  next();
}

module.exports = {
  PERMISSIONS,
  ALL_ROLES,
  normalizeRole,
  roleHasPermission,
  listPermissionsForRole,
  getRoleFromRequest,
  requirePermission,
  requireAnyRole,
  attachRole,
};
