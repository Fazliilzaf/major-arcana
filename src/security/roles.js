'use strict';

/**
 * roles.js — KANONISK ROL-/ALIAS-KATALOG (single source of truth)
 * ==============================================================
 *
 * Både auth-lagret (authStore / authMiddleware) och auktoriseringslagret
 * (ccoRbac) anger sin rollbetydelse ur DENNA fil.
 *
 * P0-004 — BESLUT A (fryst av Product Owner):
 *   - KANONISKA ROLLER: owner / konsult / personal / finance (+ revisor som
 *     read-only-ekonomi, + patient som separat trust-modell).
 *   - OPERATOR är en TEKNISK LEGACY-/ÖVERGÅNGSROLL (migreringsbro), inte en
 *     roll personal väljer i UI. Legacy STAFF → OPERATOR tills verklig roll
 *     är känd (ingen privilegieeskalation).
 *
 * REGEL: Normalisering ENDAST casing/form + dokumenterade legacy-alias.
 * Den får INTE kollapsa äkta granulära roller.
 */

// --- Kanoniska roller (STORED form, uppercase) ----------------------------
const ROLE_OWNER = 'OWNER';
const ROLE_KONSULT = 'KONSULT';
const ROLE_PERSONAL = 'PERSONAL';
const ROLE_FINANCE = 'FINANCE';
const ROLE_REVISOR = 'REVISOR'; // read-only-ekonomi
const ROLE_OPERATOR = 'OPERATOR'; // legacy/transitional migreringsbro
const ROLE_PATIENT = 'PATIENT'; // separat trust-modell, aldrig staff-rbac

// --- Legacy-roller / före detta ghosts (fail-closed) -----------------------
const ROLE_STAFF = 'STAFF'; // legacy default → OPERATOR (beslut A)
const ROLE_DOCTOR = 'DOCTOR'; // klinisk → KONSULT
// ADMIN, DPO, STAFF_ASSISTANT → ogiltiga (fail-closed, inga falska permissions)

// Giltiga roller i auktoriseringsrymden. OPERATOR får INTE väljas i UI
// (transitional), men är en giltig lagrings-/auth-roll för gamla STAFF.
const CANONICAL_ROLES = new Set([
  ROLE_OWNER,
  ROLE_KONSULT,
  ROLE_PERSONAL,
  ROLE_FINANCE,
  ROLE_REVISOR,
  ROLE_OPERATOR,
  ROLE_PATIENT,
]);

// --- Legacy → canonical (stored) alias map --------------------------------
const LEGACY_ROLE_ALIASES = {
  [ROLE_STAFF.toLowerCase()]: ROLE_OPERATOR, // legacy staff → operator (beslut A)
  [ROLE_DOCTOR.toLowerCase()]: ROLE_KONSULT, // klinisk → konsult
};

// --- Canonical stored → authorization key (lowercase) ----------------------
const CANONICAL_TO_KEY = {
  [ROLE_OWNER]: 'owner',
  [ROLE_KONSULT]: 'konsult',
  [ROLE_PERSONAL]: 'personal',
  [ROLE_FINANCE]: 'finance',
  [ROLE_REVISOR]: 'revisor',
  [ROLE_OPERATOR]: 'operator',
  [ROLE_PATIENT]: 'patient',
};

/**
 * Normaliserar en godtycklig roll till KANONISK STORED-FORM (uppercase),
 * eller `''` om rollen är ogiltig (fail-closed). Case-insensitive.
 */
function normalizeRole(role) {
  if (typeof role !== 'string') return '';
  const lower = role.trim().toLowerCase();
  if (!lower) return '';
  const found = Object.keys(CANONICAL_TO_KEY).find((key) => key.toLowerCase() === lower);
  if (found) return found;
  if (LEGACY_ROLE_ALIASES[lower]) return LEGACY_ROLE_ALIASES[lower];
  return '';
}

/**
 * Kanoniskt auth-key (lowercase) för en roll — det KEY-SPACE ccoRbac använder.
 * Returnerar 'owner'|'konsult'|'personal'|'finance'|'revisor'|'operator'|
 * 'patient', eller `null` för ogiltig/ghost (fail-closed).
 */
function toAuthorizationKey(role) {
  const canonical = normalizeRole(role);
  return canonical ? CANONICAL_TO_KEY[canonical] : null;
}

/** True om rollen är giltig (kanonisk eller legacy-alias). */
function isValidRole(role) {
  return normalizeRole(role) !== '';
}

// --- Auth-lager-permissions (colon-namespace) ------------------------------
const PERMISSIONS_BY_ROLE = {
  [ROLE_OWNER]: [
    'auth:login',
    'auth:logout',
    'auth:me',
    'auth:switch_tenant',
    'auth:sessions_read',
    'auth:sessions_revoke',
    'tenants:my_read',
    'tenants:onboard',
    'users:invite_staff',
    'users:disable_staff',
    'users:list_staff',
    'tenant_config:read',
    'tenant_config:update',
    'templates:list',
    'templates:create',
    'templates:update_draft',
    'templates:generate_draft',
    'templates:activate_version',
    'risk:read_summary',
    'risk:settings_read',
    'risk:settings_update',
    'risk:preview',
    'risk:owner_action',
    'orchestrator:admin_run',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'ops:state_manifest_read',
    'ops:state_backups_read',
    'ops:state_backup_create',
    'ops:state_restore',
    'ops:state_backups_prune',
    'audit:read',
  ],
  [ROLE_OPERATOR]: [
    'auth:login',
    'auth:logout',
    'auth:me',
    'auth:switch_tenant',
    'auth:sessions_read',
    'auth:sessions_revoke',
    'tenants:my_read',
    'tenant_config:read',
    'templates:list',
    'templates:create',
    'templates:update_draft',
    'templates:generate_draft',
    'risk:read_summary',
    'risk:settings_read',
    'risk:preview',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'audit:read',
  ],
  [ROLE_KONSULT]: [
    'auth:login',
    'auth:logout',
    'auth:me',
    'auth:switch_tenant',
    'tenants:my_read',
    'tenant_config:read',
    'templates:list',
    'risk:read_summary',
    'risk:settings_read',
    'risk:preview',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'audit:read',
  ],
  [ROLE_PERSONAL]: [
    'auth:login',
    'auth:logout',
    'auth:me',
    'auth:switch_tenant',
    'tenants:my_read',
    'tenant_config:read',
    'templates:list',
    'templates:create',
    'templates:update_draft',
    'templates:generate_draft',
    'risk:read_summary',
    'risk:settings_read',
    'risk:preview',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'audit:read',
  ],
  [ROLE_FINANCE]: [
    'auth:login',
    'auth:logout',
    'auth:me',
    'auth:switch_tenant',
    'tenants:my_read',
    'tenant_config:read',
    'templates:list',
    'risk:read_summary',
    'risk:preview',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'audit:read',
  ],
  [ROLE_REVISOR]: [
    'auth:login',
    'auth:logout',
    'auth:me',
    'auth:switch_tenant',
    'tenants:my_read',
    'tenant_config:read',
    'templates:list',
    'risk:read_summary',
    'risk:preview',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'audit:read',
  ],
  [ROLE_PATIENT]: ['auth:login', 'auth:logout', 'auth:me'],
};

function getPermissionsForRole(role) {
  const canonical = normalizeRole(role);
  return canonical ? [...PERMISSIONS_BY_ROLE[canonical]] : [];
}

module.exports = {
  ROLE_OWNER,
  ROLE_KONSULT,
  ROLE_PERSONAL,
  ROLE_FINANCE,
  ROLE_REVISOR,
  ROLE_OPERATOR,
  ROLE_PATIENT,
  ROLE_STAFF,
  ROLE_DOCTOR,
  CANONICAL_ROLES,
  normalizeRole,
  toAuthorizationKey,
  isValidRole,
  getPermissionsForRole,
};
