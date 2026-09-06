'use strict';

/**
 * ccoRbac.js — Role-Based Access Control för CCO
 * ===================================================
 *
 * P0-004 (BESLUT A): EN rollbetydelse från src/security/roles.js.
 *
 *   - Normalisering delegeras till roles.js (toAuthorizationKey) — INGEN
 *     parallell roll-sanning, ingen förlorad granularitet.
 *   - OPERATOR är en teknisk legacy-/övergångsroll (migreringsbro för gamla
 *     STAFF — beslut A). Den är inte en roll personal väljer i UI.
 *   - Följande frysta behörighetsändringar (Product Owner):
 *       ordination.approve        = owner + konsult
 *       bookings.conflict_override= SEPARAT permission (owner + personal)
 *       mail.live_send            = owner + konsult + personal (ej owner-only)
 *       journal                   = owner + konsult + relevant personal, finance NO
 *       billing                   = owner + finance/revisor
 *       admin                     = owner-only
 *   - ORD-198 bevarad: mail.send = owner/operator/konsult (INTE personal);
 *     den smala kundkanalen portal.thread_* gäller INKLUSIVE personal.
 */

const { toAuthorizationKey } = require('./roles');

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
  // B-1: personal är operativ personal/sjuksköterska och ska kunna arbeta med
  // bokningar — därav bookings.write. conflict_override är en egen behörighet.
  'bookings.write': ['owner', 'operator', 'konsult', 'personal'],
  // Schemat/öppettider (availability-rules + service-duration) är ett
  // DRIFTBESLUT — operativ personal får SE (bookings.read) men inte ändra.
  // Därför en egen behörighet, INTE bookings.write (som personal nu har).
  'bookings.schedule_write': ['owner', 'operator', 'konsult'],
  // P0-004: conflict-override är en SEPARAT behörighet (owner + särskilt
  // behörig personal). Att ha bookings.write räcker INTE för att överrida en
  // resurs-/tidskonflikt — se requireConflictOverride i bokningsrutterna.
  'bookings.conflict_override': ['owner', 'personal'],
  'bookings.case_decide': ['owner', 'operator'],
  'bookings.handoff': ['owner', 'operator'],
  'bookings.delete': ['owner', 'operator'],

  // Journal (känslig) — owner + operator/konsult + relevant personal. finance NO.
  'journal.read_own': ['owner', 'operator', 'konsult', 'personal'],
  'journal.read_any': ['owner', 'operator', 'konsult'],
  'journal.write': ['owner', 'operator', 'konsult', 'personal'],
  'journal.lock': ['owner', 'operator'],
  'journal.unlock': ['owner'],

  // Conversations / mail
  'mail.read': ['owner', 'operator', 'konsult'],
  // mail.write: mutera delad inkorg-triage-state (Klar/Senare/Återöppna) samt
  // interna trådnotiser. Medvetet konservativt owner+operator (ORD-198).
  'mail.write': ['owner', 'operator'],
  // ORD-198: mail.send äger hela mejlsystemet (delad inkorg, utkast, sändning
  // till valfri adress). PERSONAL får det INTE — personal använder den smala
  // kanalen portal.thread_reply. Beslut A bevarar denna gräns.
  'mail.send': ['owner', 'operator', 'konsult'],
  // P0-004: behörig personal ska kunna svara kunder live → inte längre helt
  // owner-only (owner + konsult + personal). P0-003-säkerhet (deceased,
  // allowlist, mottagare/tenant, kundutskick, Graph) ligger KVAR som separat
  // lager — detta ändrar endast VEM som får försöka skicka.
  'mail.live_send': ['owner', 'konsult', 'personal'],
  'mail.delete': ['owner', 'operator'],
  'mail.assign': ['owner', 'operator'],
  'mailbox.admin': ['owner', 'operator'],

  // ORD-198 — kundportalens tråd. Egen behörighet, INTE mail.* — en smal
  // chatt mellan kliniken och EN kund. ALLA fyra rollerna inklusive personal
  // (ägarens instruktion). revisor/finance står utanför.
  'portal.thread_read': ['owner', 'operator', 'konsult', 'personal'],
  'portal.thread_reply': ['owner', 'operator', 'konsult', 'personal'],

  // Automation
  'automation.read': ['owner', 'operator'],
  'automation.edit': ['owner', 'operator'],
  'automation.deploy': ['owner'],
  'automation.autopilot_toggle': ['owner'],

  // Analytics
  'analytics.read_personal': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'analytics.read_team': ['owner', 'operator', 'revisor'],
  'analytics.export': ['owner', 'revisor'],

  // Settings (admin owner-only)
  'settings.read': ['owner', 'operator'],
  'settings.write': ['owner'],
  'settings.brand': ['owner'],

  // Billing (revisor + owner + finance — CF.2 RBAC cfRBAC/cfMutateRBAC)
  'billing.read': ['owner', 'revisor', 'finance'],
  // B-3: revisor har FULLA ekonomirättigheter — inklusive write (approve/close/
  // korrigering). Non-clinical/non-admin gräns bevaras i övriga permissions.
  'billing.write': ['owner', 'finance', 'revisor'],

  // Users / roles (admin, owner-only)
  'users.invite': ['owner'],
  'users.role_change': ['owner'],

  // Audit log
  'audit.read': ['owner', 'revisor'],

  // Showcase (publish externt)
  'showcase.publish': ['owner', 'operator'],

  // Offerter
  'offer.read': ['owner', 'operator', 'konsult', 'revisor'],
  'offer.write': ['owner', 'operator'],
  'offer.delete': ['owner'],

  // Workspace
  'workspace.read': ['owner', 'operator', 'konsult', 'personal'],

  // Patient portal staff API
  'portal.write': ['owner', 'operator'],
  'portal.read': ['owner', 'operator', 'konsult', 'revisor'],

  // Template registry
  'templates.read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'templates.write': ['owner'],
  'templates.legal_review': ['owner'],

  // Compliance scan
  'compliance.read': ['owner', 'operator', 'revisor'],
  'compliance.scan': ['owner'],

  // ID-verifiering
  'id_verify.read': ['owner', 'operator', 'konsult', 'personal'],
  'id_verify.write': ['owner', 'operator'],

  // Notification-feed
  'notifications.read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'notifications.mark_read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],

  // Aftercare
  'aftercare.read': ['owner', 'operator', 'konsult', 'personal'],
  'aftercare.write': ['owner', 'operator'],
  'aftercare.cron_trigger': ['owner'],

  // Marketing consent
  'marketing.read': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'marketing.write': ['owner', 'operator'],
  'marketing.send': ['owner'],

  // Avtal
  'agreement.read': ['owner', 'operator', 'konsult', 'revisor'],
  'agreement.write': ['owner', 'operator'],
  'agreement.staff_sign': ['owner'],
  'agreement.delete': ['owner'],

  // Tenant
  'tenant.switch': ['owner', 'operator', 'konsult', 'personal', 'revisor'],
  'tenant.create': ['owner'],

  // Patient-photo-metadata
  'photo.read': ['owner', 'operator', 'konsult', 'personal'],
  'photo.write': ['owner', 'operator', 'konsult'],
  'photo.delete': ['owner'],

  // Patient asset-store
  'asset.read': ['owner', 'operator', 'konsult', 'personal'],
  'asset.write': ['owner', 'operator'],
  'asset.delete': ['owner'],
  'asset.import': ['owner'],
  'asset.review': ['owner', 'operator'],
  'asset.export': ['owner'],

  // Scalp analysis
  'scalp.read': ['owner', 'operator', 'konsult', 'personal'],
  'scalp.write': ['owner', 'operator', 'konsult'],
  'scalp.verify': ['owner', 'operator', 'konsult'],

  // Staff Portal — ordination, delegering, QMS
  'ordination.view': ['owner', 'operator', 'konsult'],
  // P0-004: ordination approve/reject = OWNER + KONSULT. Aldrig generell
  // STAFF/personal/operator. finance/patient nej.
  'ordination.approve': ['owner', 'konsult'],
  'delegation.read': ['owner', 'operator', 'konsult', 'personal'],
  'qms.read': ['owner', 'operator', 'konsult', 'personal'],
  'qms.write': ['owner', 'operator'],
  'staff.manage': ['owner'],
  'staff.colleagues': ['owner', 'operator', 'konsult', 'personal'],
  'delegation.issue': ['owner', 'konsult'],
  'delegation.overview': ['owner', 'operator'],
};

/** Giltiga roller i auktoriseringsnyckel-rymden (lowercase). */
const ALL_ROLES = ['owner', 'operator', 'konsult', 'personal', 'revisor', 'finance'];

/**
 * Normaliserar en roll till ccoRbac:ts auktoriseringsnyckel, eller null
 * (fail-closed). Delegerar till roles.js så granularitet aldrig tappas och så
 * att legacy-alias (STAFF→operator, DOCTOR→konsult — beslut A) hanteras på
 * ETT ställe. patient är separat trust-modell → ingen cco-behörighet.
 */
function normalizeRole(role) {
  const key = toAuthorizationKey(role);
  if (!key || key === 'patient') return null;
  return key;
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
 * oautentiserad request får 'anonymous' (inga permissions).
 * X-CCO-Role får ALDRIG ge behörighet i produktion (kan spoofas); honoreras
 * bara utanför prod (lokala tester/dev).
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

function attachRole(req, res, next) {
  req.cco = req.cco || {};
  req.cco.role = getRoleFromRequest(req);
  next();
}

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
