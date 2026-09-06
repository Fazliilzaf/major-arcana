'use strict';

/**
 * roles.js — KANONISK ROL-/ALIAS-KATALOG (single source of truth)
 * ==============================================================
 *
 * Både auth-lagret (authStore / authMiddleware) och auktoriseringslagret
 * (ccoRbac) anger sin rollbetydelse ur DENNA fil, så normalisering aldrig
 * tappar äkta granulära roller.
 *
 * REGEL: Normalisering får ENDAST
 *   - normalisera casing/form, och
 *   - hantera dokumenterade legacy-alias.
 * Den får INTE kollapsa äkta granulära roller till en gemensam topproll.
 *
 * KANONISKA ROLLER (lagrings-/auth-värde, ÅTERSTÅR i UPPERCASE för att
 * inte bryta de hundratals `role === 'OWNER'`-kontroller som redan finns
 * i kodbasen):
 *   OWNER    — ägare / full administration
 *   KONSULT  — läkare / kliniskt behörig konsult (ordination, klinisk journal)
 *   PERSONAL — sjuksköterska / operativ personal
 *   FINANCE  — ekonomi / revisor-funktion (finans)
 *   PATIENT  — separat patient-trust-modell (ALDRI staff-rbac)
 *
 * LEGACY-ALIAS → KANONISK ROLL (dokumenterade):
 *   STAFF    → PERSONAL   (säker default; ingen eskallation — HG-ROLES/Fazli)
 *   OPERATOR → PERSONAL   (transitional legacy operational)
 *   REVISOR  → FINANCE    (revisor = ekonomibehörighet)
 *   DOCTOR   → KONSULT    (klinisk)
 *
 * OGILTIGA / FÖRE DETTA GHOST-ROLLER → fail-closed (''), ger INGA falska
 * permissions:
 *   ADMIN, DPO, STAFF_ASSISTANT
 *
 * PATIENT normaliseras självklart till 'patient' men får INGA ccoRbac-
 * behörigheter (patientportalen är sitt eget trust-lager).
 */

// --- Kanoniska roller (STORED form, uppercase) ----------------------------
const ROLE_OWNER = 'OWNER';
const ROLE_KONSULT = 'KONSULT';
const ROLE_PERSONAL = 'PERSONAL';
const ROLE_FINANCE = 'FINANCE';
const ROLE_PATIENT = 'PATIENT';

// --- Legacy-roller / före detta ghosts ------------------------------------
const ROLE_STAFF = 'STAFF'; // legacy default → PERSONAL
const ROLE_OPERATOR = 'OPERATOR'; // → PERSONAL
const ROLE_REVISOR = 'REVISOR'; // → FINANCE
const ROLE_DOCTOR = 'DOCTOR'; // → KONSULT

// Ogiltiga (aldrig en verklig auth-roll; fail-closed)
// ADMIN, DPO, STAFF_ASSISTANT

const CANONICAL_ROLES = new Set([
  ROLE_OWNER,
  ROLE_KONSULT,
  ROLE_PERSONAL,
  ROLE_FINANCE,
  ROLE_PATIENT,
]);

// --- Legacy → canonical (stored) alias map ---------------------------------
// Nycklar är lägre-caserade. Värden är canonical STORED-form.
const LEGACY_ROLE_ALIASES = {
  [ROLE_STAFF.toLowerCase()]: ROLE_PERSONAL, // staff → personal
  [ROLE_OPERATOR.toLowerCase()]: ROLE_PERSONAL, // operator → personal
  [ROLE_REVISOR.toLowerCase()]: ROLE_FINANCE, // revisor → finance
  [ROLE_DOCTOR.toLowerCase()]: ROLE_KONSULT, // doctor → konsult
};

// --- Canonical stored → authorization key (lowercase) ----------------------
// Detta är det KEY-SPACE som ccoRbac:s PERMISSIONS använder.
const CANONICAL_TO_KEY = {
  [ROLE_OWNER]: 'owner',
  [ROLE_KONSULT]: 'konsult',
  [ROLE_PERSONAL]: 'personal',
  [ROLE_FINANCE]: 'finance',
  [ROLE_PATIENT]: 'patient',
};

/**
 * Normaliserar en godtycklig roll till KANONISK STORED-FORM (uppercase),
 * eller `''` om rollen är ogiltig (fail-closed). Case-insensitive.
 *
 * Exempel:
 *   'OWNER'/'owner'/'Owner'                → 'OWNER'
 *   'KONSULT'/'konsult'/'DOCTOR'/'doctor'  → 'KONSULT'
 *   'PERSONAL'/'personal'/'STAFF'/'staff'/'OPERATOR'/'operator' → 'PERSONAL'
 *   'FINANCE'/'finance'/'REVISOR'/'revisor'→ 'FINANCE'
 *   'PATIENT'/'patient'                    → 'PATIENT'
 *   'ADMIN'/'admin'/'DPO'/'staff_assistant'→ ''           (fail-closed)
 */
function normalizeRole(role) {
  if (typeof role !== 'string') return '';
  const lower = role.trim().toLowerCase();
  if (!lower) return '';
  // canonical passthrough (case-insensitive)
  const found = Object.keys(CANONICAL_TO_KEY).find((key) => key.toLowerCase() === lower);
  if (found) return found;
  // documented legacy alias
  if (LEGACY_ROLE_ALIASES[lower]) return LEGACY_ROLE_ALIASES[lower];
  // unknown / deprecated ghost → fail-closed
  return '';
}

/**
 * Kanoniskt auth-key (lowercase) för en roll — det KEY-SPACE ccoRbac använder.
 * Returnerar 'owner'|'konsult'|'personal'|'finance'|'patient', eller `null`
 * för ogiltiga/ghost-roller (fail-closed).
 */
function toAuthorizationKey(role) {
  const canonical = normalizeRole(role);
  return canonical ? CANONICAL_TO_KEY[canonical] : null;
}

/** True om rollen är en giltig kanonisk (eller legacy-alias) roll. */
function isValidRole(role) {
  return normalizeRole(role) !== '';
}

// --- Auth-lager-permissions (colon-namespace) ------------------------------
// Används av login-svaret / admin-yttor. Nycklas per KANONISK roll.
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
  [ROLE_PATIENT]: ['auth:login', 'auth:logout', 'auth:me'],
};

/** Auth-lager-permissions för en roll. `role` kan vara canonical eller legacy. */
function getPermissionsForRole(role) {
  const canonical = normalizeRole(role);
  return canonical ? [...PERMISSIONS_BY_ROLE[canonical]] : [];
}

module.exports = {
  // Kanoniska roller
  ROLE_OWNER,
  ROLE_KONSULT,
  ROLE_PERSONAL,
  ROLE_FINANCE,
  ROLE_PATIENT,
  // Legacy
  ROLE_STAFF,
  ROLE_OPERATOR,
  ROLE_REVISOR,
  ROLE_DOCTOR,
  // Samlingar
  CANONICAL_ROLES,
  // Funktioner
  normalizeRole,
  toAuthorizationKey,
  isValidRole,
  getPermissionsForRole,
};
