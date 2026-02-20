const ROLE_OWNER = 'OWNER';
const ROLE_STAFF = 'STAFF';
const ROLE_PATIENT = 'PATIENT';

const ROLE_SET = new Set([ROLE_OWNER, ROLE_STAFF, ROLE_PATIENT]);

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
  [ROLE_STAFF]: [
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
    'orchestrator:admin_run',
    'orchestrator:meta',
    'policy:read',
    'monitor:read_status',
    'reports:pilot_read',
    'audit:read',
  ],
  [ROLE_PATIENT]: ['auth:login', 'auth:logout', 'auth:me'],
};

function normalizeRole(role) {
  if (typeof role !== 'string') return '';
  return role.trim().toUpperCase();
}

function isValidRole(role) {
  return ROLE_SET.has(normalizeRole(role));
}

function getPermissionsForRole(role) {
  const normalized = normalizeRole(role);
  return PERMISSIONS_BY_ROLE[normalized] ? [...PERMISSIONS_BY_ROLE[normalized]] : [];
}

module.exports = {
  ROLE_OWNER,
  ROLE_STAFF,
  ROLE_PATIENT,
  normalizeRole,
  isValidRole,
  getPermissionsForRole,
};
