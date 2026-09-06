'use strict';

/**
 * ccoRbac.js — Role-Based Access Control för CCO
 * ===================================================
 *
 * P0-004 — kanonisk rollmodell (fryst av Product Owner).
 *
 * KANONISKA ROLLER (KEY-SPACE i PERMISSIONS, lowercase):
 *   owner    : full access + billing + invites + admin (owner-only)
 *   konsult  : läkare / klinisk — ordination, relevant journal, live reply
 *   personal : sjuksköterska / operativ — kund, bokningar, konversation,
 *              live kundsvar, relevant journal. INTE ordination/finans/admin.
 *   finance  : ekonomi / revisor — CFO read/write. INTE kliniskt.
 *   patient  : separat patient-trust-modell, ALDRIG staff-rbac (→ anonymous).
 *
 * Normalisering och legacy-alias (STAFF/OPERATOR→personal, REVISOR→finance,
 * DOCTOR→konsult) är delegerad till src/security/roles.js — DEN ENDA
 * auktoritativa rollkatalogen. ccoRbac:t importerar `toAuthorizationKey`.
 * Därmed finns ingen parallell roll-sanning och ingen granularitet går förlorad.
 *
 * Användning:
 *   const { requirePermission, requireAnyRole } = require('./src/security/ccoRbac');
 *   app.post('/cco-customers/merge', requirePermission('customers.merge'), handler);
 *   app.get('/billing', requireAnyRole(['owner','finance']), handler);
 */

const { toAuthorizationKey } = require('./roles');

const PERMISSIONS = {
  // Customer
  'customers.read': ['owner', 'konsult', 'personal'],
  'customers.write': ['owner', 'konsult', 'personal'],
  'customers.merge': ['owner', 'personal'],
  'customers.split': ['owner', 'personal'],
  'customers.import': ['owner', 'personal'],
  'customers.delete': ['owner'],
  'customers.gdpr_export': ['owner', 'personal', 'konsult'],
  'customers.photo_upload': ['owner', 'personal', 'konsult'],
  'customers.photo_consent_set': ['owner', 'personal'],

  // Bookings
  'bookings.read': ['owner', 'konsult', 'personal'],
  'bookings.write': ['owner', 'konsult', 'personal'],
  // P0-004: separat conflict-override-behörighet. Får INTE följa bookings.write.
  // Product Owner-intent: OWNER + särskilt behörig operativ PERSONAL. Konsult
  // endast om permission uttryckligen tilldelas; finance/patient nej.
  'bookings.conflict_override': ['owner', 'personal'],
  'bookings.case_decide': ['owner', 'personal'],
  'bookings.handoff': ['owner', 'personal'],
  'bookings.delete': ['owner', 'personal'],

  // Journal (känslig) — owner + konsult + kliniskt relevant personal, INTE finance.
  'journal.read_own': ['owner', 'konsult', 'personal'],
  // read_any = hela klinikens journal, reserverad för owner + konsult.
  'journal.read_any': ['owner', 'konsult'],
  'journal.write': ['owner', 'konsult', 'personal'],
  'journal.lock': ['owner', 'konsult'],
  'journal.unlock': ['owner'],

  // Conversations / mail
  'mail.read': ['owner', 'konsult', 'personal'],
  // Triage-state-mutation (Klar/Senare/Återöppna, intern notis) på delade
  // trådar är OPERATIVT → owner + personal. konsult är read-only för triage
  // (läser och sänder svar men muterar inte delad inkorg-state).
  'mail.write': ['owner', 'personal'],
  'mail.send': ['owner', 'konsult', 'personal'],
  // P0-004: Behörig personal ska kunna svara kunder live → inte längre owner-only.
  // P0-003 safety (deceased, allowlist, recipient/tenant, kundutskick, Graph)
  // ligger KVAR som ett separat lager (se send-adaptern) — detta ändrar endast VEM
  // som får försöka skicka, inte OM meddelandet faktiskt får skickas.
  'mail.live_send': ['owner', 'konsult', 'personal'],
  'mail.delete': ['owner', 'personal'],
  'mail.assign': ['owner', 'personal'],
  'mailbox.admin': ['owner', 'personal'],

  // Kundportalstråd (ORD-198) — alla som möter kunden.
  'portal.thread_read': ['owner', 'konsult', 'personal'],
  'portal.thread_reply': ['owner', 'konsult', 'personal'],

  // Automation
  'automation.read': ['owner', 'personal'],
  'automation.edit': ['owner', 'personal'],
  'automation.deploy': ['owner'],
  'automation.autopilot_toggle': ['owner'],

  // Analytics — team/managerell analys (owner + finance); personal ser egen data
  'analytics.read_personal': ['owner', 'konsult', 'personal', 'finance'],
  'analytics.read_team': ['owner', 'finance'],
  'analytics.export': ['owner', 'finance'],

  // Settings (admin är owner-only; konsult får INTE global settings)
  'settings.read': ['owner', 'personal'],
  'settings.write': ['owner'],
  'settings.brand': ['owner'],

  // Billing / CFO (owner + finance; revisor är finance-alias)
  'billing.read': ['owner', 'finance'],
  'billing.write': ['owner', 'finance'],

  // Users / roles (admin, owner-only)
  'users.invite': ['owner'],
  'users.role_change': ['owner'],

  // Audit log
  'audit.read': ['owner', 'finance'],

  // Showcase (publish externt)
  'showcase.publish': ['owner', 'personal'],

  // Offerter
  'offer.read': ['owner', 'konsult', 'personal', 'finance'],
  'offer.write': ['owner', 'personal'],
  'offer.delete': ['owner'],

  // Workspace
  'workspace.read': ['owner', 'konsult', 'personal'],

  // Patient portal staff API
  'portal.write': ['owner', 'personal'],
  'portal.read': ['owner', 'konsult', 'personal', 'finance'],

  // Template registry
  'templates.read': ['owner', 'konsult', 'personal', 'finance'],
  'templates.write': ['owner'],
  'templates.legal_review': ['owner'],

  // Compliance scan
  'compliance.read': ['owner', 'personal', 'finance'],
  'compliance.scan': ['owner'],

  // ID-verifiering
  'id_verify.read': ['owner', 'konsult', 'personal'],
  'id_verify.write': ['owner', 'personal'],

  // Unified notification-feed
  'notifications.read': ['owner', 'konsult', 'personal', 'finance'],
  'notifications.mark_read': ['owner', 'konsult', 'personal', 'finance'],

  // Aftercare
  'aftercare.read': ['owner', 'konsult', 'personal'],
  'aftercare.write': ['owner', 'personal'],
  'aftercare.cron_trigger': ['owner'],

  // Marketing consent
  'marketing.read': ['owner', 'konsult', 'personal', 'finance'],
  'marketing.write': ['owner', 'personal'],
  'marketing.send': ['owner'],

  // Avtal
  'agreement.read': ['owner', 'konsult', 'personal', 'finance'],
  'agreement.write': ['owner', 'personal'],
  'agreement.staff_sign': ['owner'],
  'agreement.delete': ['owner'],

  // Tenant
  'tenant.switch': ['owner', 'konsult', 'personal', 'finance'],
  'tenant.create': ['owner'],

  // Patient-photo-metadata
  'photo.read': ['owner', 'konsult', 'personal'],
  'photo.write': ['owner', 'personal', 'konsult'],
  'photo.delete': ['owner'],

  // Patient asset-store
  'asset.read': ['owner', 'konsult', 'personal'],
  'asset.write': ['owner', 'personal'],
  'asset.delete': ['owner'],
  'asset.import': ['owner'],
  'asset.review': ['owner', 'personal'],
  'asset.export': ['owner'],

  // Scalp analysis
  'scalp.read': ['owner', 'konsult', 'personal'],
  'scalp.write': ['owner', 'personal', 'konsult'],
  'scalp.verify': ['owner', 'konsult', 'personal'],

  // Staff Portal — ordination, delegering, QMS
  // ordination.view : se ordinationsunderlag — även operativ personal som
  // matar kön. Godkännandet (ordination.approve) är däremot owner + konsult.
  'ordination.view': ['owner', 'konsult', 'personal'],
  // P0-004: ordination approve/reject = OWNER + KONSULT. Aldrig generell
  // STAFF/personal. finance/patient nej.
  'ordination.approve': ['owner', 'konsult'],
  'delegation.read': ['owner', 'konsult', 'personal'],
  'qms.read': ['owner', 'konsult', 'personal'],
  'qms.write': ['owner', 'personal'],
  'staff.manage': ['owner'],
  'staff.colleagues': ['owner', 'konsult', 'personal'],
  'delegation.issue': ['owner', 'konsult'],
  // Klinikens hela delegeringsöversikt: owner + läkare. Personal/sköterska ser
  // bara sina egna (delegation.read) — ALDRIG hela klinikens.
  'delegation.overview': ['owner', 'konsult'],
};

/** Roller som är giltiga i auktoriseringsnyckel-rymden (lowercase). */
const ALL_ROLES = ['owner', 'konsult', 'personal', 'finance'];

/**
 * Normaliserar en roll till ccoRbac:ts auktoriseringsnyckel, eller 'anonymous'
 * (fail-closed). Delegerar till roles.js så granularitet aldrig tappas och så
 * att legacy-alias (STAFF/OPERATOR→personal, REVISOR→finance, DOCTOR→konsult)
 * hanteras på ETT ställe.
 */
function normalizeRole(role) {
  const key = toAuthorizationKey(role);
  // patient är en separat trust-modell; den får INGA ccoRbac-behörigheter.
  if (!key || key === 'patient') return 'anonymous';
  return key;
}

function roleHasPermission(role, permission) {
  const r = normalizeRole(role);
  if (!r || r === 'anonymous') return false;
  const allowed = PERMISSIONS[permission];
  if (!Array.isArray(allowed)) {
    // Okänt permission → fail-closed
    return false;
  }
  return allowed.includes(r);
}

function listPermissionsForRole(role) {
  const r = normalizeRole(role);
  if (!r || r === 'anonymous') return [];
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(r))
    .map(([perm]) => perm);
}

/**
 * Extraherar aktuell roll från request. SÄKERHET: rollen får ENDAST komma från
 * verifierad auth (authStore/session/token via req.cco/req.auth/req.user). En
 * oautentiserad request får 'anonymous' (inga permissions).
 *
 * Den klient-satta headern X-CCO-Role får ALDRIG ge behörighet i produktion
 * (kan spoofas). Den honoreras bara utanför prod (lokala tester/dev).
 */
function getRoleFromRequest(req) {
  const fromAuth = req.cco?.role || req.auth?.role || req.user?.role || null;
  if (fromAuth) {
    const n = normalizeRole(fromAuth);
    if (n && n !== 'anonymous') return n;
  }
  if (process.env.NODE_ENV !== 'production') {
    const n = normalizeRole(req.headers?.['x-cco-role']);
    if (n && n !== 'anonymous') return n;
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
 *   app.get('/billing', requireAnyRole(['owner','finance']), handler)
 */
function requireAnyRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles)
    ? allowedRoles.map((r) => normalizeRole(r)).filter((r) => r && r !== 'anonymous')
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

/** Bygg actor ur verifierad auth (req.auth/req.user, satt av auth-middleware). */
function getActor(req) {
  const src = req.auth || req.user || req.cco || {};
  return {
    userId: src.userId || src.id || src.email || 'unknown',
    email: src.email || null,
    role: getRoleFromRequest(req),
  };
}

module.exports = {
  PERMISSIONS,
  ALL_ROLES,
  normalizeRole,
  roleHasPermission,
  listPermissionsForRole,
  getRoleFromRequest,
  getActor,
  requirePermission,
  requireAnyRole,
  attachRole,
};
