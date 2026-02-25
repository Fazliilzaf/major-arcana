#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const args = {
    file:
      normalizeText(process.env.ARCANA_PREFLIGHT_REPORT_FILE) ||
      path.join('data', 'reports', 'preflight-latest.json'),
    output: 'text',
    top: 0,
    minPriority: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--file') {
      args.file = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--json') {
      args.output = 'json';
      continue;
    }
    if (item === '--top') {
      const parsed = Number.parseInt(String(argv[index + 1] || ''), 10);
      args.top = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
      index += 1;
      continue;
    }
    if (item === '--min-priority') {
      args.minPriority = normalizeText(argv[index + 1]).toUpperCase();
      index += 1;
      continue;
    }
  }
  return args;
}

function readReport(filePath) {
  const resolved = path.resolve(String(filePath || '').trim());
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return {
    path: resolved,
    payload,
  };
}

function pushAction(actions, action) {
  const id = normalizeText(action?.id);
  if (!id) return;
  if (actions.some((item) => item.id === id)) return;
  actions.push({
    id,
    priority: normalizeText(action?.priority) || 'P2',
    title: normalizeText(action?.title) || id,
    command: normalizeText(action?.command) || '',
    details: normalizeText(action?.details) || '',
    source: normalizeText(action?.source) || '',
  });
}

function includesText(items, needle) {
  const normalizedNeedle = normalizeText(needle).toLowerCase();
  if (!normalizedNeedle) return false;
  for (const item of Array.isArray(items) ? items : []) {
    if (String(item || '').toLowerCase().includes(normalizedNeedle)) {
      return true;
    }
  }
  return false;
}

function buildActions(report) {
  const actions = [];
  const exitCode = Number(report?.exit?.code ?? 0);
  const exitReason = normalizeText(report?.exit?.reason);
  const options = report?.options && typeof report.options === 'object' ? report.options : {};
  const diagnostics =
    report?.diagnostics && typeof report.diagnostics === 'object' ? report.diagnostics : {};
  const guard =
    diagnostics?.readinessGuard && typeof diagnostics.readinessGuard === 'object'
      ? diagnostics.readinessGuard
      : {};
  const opsSuite =
    diagnostics?.opsSuite && typeof diagnostics.opsSuite === 'object' ? diagnostics.opsSuite : {};
  const strict = opsSuite?.strict && typeof opsSuite.strict === 'object' ? opsSuite.strict : {};
  const opsReadiness =
    opsSuite?.readiness && typeof opsSuite.readiness === 'object' ? opsSuite.readiness : {};
  const publicUrl = normalizeText(options?.publicUrl) || '<public-url>';

  const failedCheckIds = Array.isArray(guard?.failedCheckIds) ? guard.failedCheckIds : [];
  const failedSet = new Set(failedCheckIds.map((item) => normalizeText(item)).filter(Boolean));
  const blockerCheckIds = Array.isArray(opsReadiness?.blockerCheckIds)
    ? opsReadiness.blockerCheckIds
    : [];
  for (const checkId of blockerCheckIds) {
    const normalized = normalizeText(checkId);
    if (normalized) failedSet.add(normalized);
  }

  const strictFailures = Array.isArray(strict?.failures) ? strict.failures : [];
  const advisories = Array.isArray(strict?.advisories) ? strict.advisories : [];
  const hasOutputGateGap =
    includesText(strictFailures, 'output_without_risk_policy_gate') ||
    includesText(advisories, '--remediate-output-gates');
  const hasOwnerMfaGap =
    failedSet.has('owner_mfa_enforced') ||
    includesText(advisories, '--remediate-owner-mfa-memberships');

  if (failedSet.has('cors_strict')) {
    const envLine =
      normalizeText(guard?.corsStrictEnv) || normalizeText(opsReadiness?.corsStrictRecommendation);
    pushAction(actions, {
      id: 'cors_strict_runtime_env',
      priority: 'P0',
      title: 'Sätt strict CORS i runtime',
      command: envLine || 'CORS_STRICT=true CORS_ALLOW_NO_ORIGIN=false CORS_ALLOWED_ORIGINS=<origin1,origin2>',
      details: 'Deploya om efter env-ändring och kör preflight igen.',
      source: 'guard',
    });
  }

  if (failedSet.has('owner_mfa_enforced')) {
    pushAction(actions, {
      id: 'owner_mfa_setup',
      priority: 'P0',
      title: 'Aktivera MFA för OWNER-konton',
      command:
        `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:setup`,
      details: 'Kör per aktiv OWNER tills readiness-checken är grön.',
      source: 'guard',
    });
    pushAction(actions, {
      id: 'owner_mfa_remediate_fallback',
      priority: 'P1',
      title: 'Fallback: disable non-compliant OWNER memberships',
      command:
        `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:remediate -- --apply`,
      details: 'Använd endast när minst en compliant OWNER finns kvar.',
      source: 'guard',
    });
  }

  if (exitReason === 'public_smoke_failed') {
    pushAction(actions, {
      id: 'public_smoke_credentials',
      priority: 'P0',
      title: 'Verifiera OWNER credentials för publik smoke',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run smoke:public`,
      details: 'Om MFA krävs: sätt ARCANA_OWNER_MFA_CODE eller ARCANA_OWNER_MFA_SECRET och kör igen.',
      source: 'preflight',
    });
    pushAction(actions, {
      id: 'public_smoke_mfa_setup',
      priority: 'P1',
      title: 'Kör OWNER MFA setup vid behov',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:setup`,
      details: 'Använd när login fungerar men kontot kräver MFA-setup.',
      source: 'preflight',
    });
  }

  if (hasOutputGateGap && hasOwnerMfaGap) {
    pushAction(actions, {
      id: 'ops_heal_all',
      priority: 'P1',
      title: 'Kör strict heal-all',
      command:
        `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite:strict:heal:all`,
      details: 'Kör output-gate remediation + owner-MFA remediation i samma pass.',
      source: 'strict',
    });
  } else if (hasOutputGateGap) {
    pushAction(actions, {
      id: 'ops_heal_output_gates',
      priority: 'P1',
      title: 'Kör output-gate remediation',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite:strict:heal`,
      details: 'Auto-fixar output/policy metadata på aktiva versioner.',
      source: 'strict',
    });
  }

  if (includesText(strictFailures, 'scheduler suite not fully successful')) {
    pushAction(actions, {
      id: 'ops_required_suite_rerun',
      priority: 'P1',
      title: 'Kör required scheduler suite igen',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite`,
      details: 'Verifiera att required_suite går igenom innan strict-gate.',
      source: 'strict',
    });
  }

  if (
    includesText(strictFailures, 'pilot report gate is no-go') ||
    includesText(strictFailures, 'restore drill gate is no-go')
  ) {
    pushAction(actions, {
      id: 'ops_refresh_pilot_restore',
      priority: 'P1',
      title: 'Uppdatera pilot report + restore drill evidens',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite`,
      details: 'required_suite kör nightly report och restore drill i samma körning.',
      source: 'strict',
    });
  }

  if (includesText(strictFailures, 'tenant access-check refresh failed')) {
    pushAction(actions, {
      id: 'tenant_access_check_investigate',
      priority: 'P1',
      title: 'Felsök tenant access-check refresh',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite -- --refresh-tenant-access-check`,
      details: 'Om endpoint saknas temporärt: kör med `--no-refresh-tenant-access-check` och uppgradera API-routes.',
      source: 'strict',
    });
  }

  if (includesText(strictFailures, 'readiness blocker categories are not all green') && failedSet.size === 0) {
    pushAction(actions, {
      id: 'readiness_guard_required',
      priority: 'P1',
      title: 'Kör readiness guard på required checks',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run preflight:readiness:guard -- --use-required-checks`,
      details: 'Identifiera blocker-checks innan ny strict-körning.',
      source: 'strict',
    });
  }

  if (includesText(strictFailures, 'cors runtime probe failed')) {
    pushAction(actions, {
      id: 'cors_runtime_probe_investigate',
      priority: 'P1',
      title: 'Verifiera CORS runtime-probe',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite:strict`,
      details: 'Kontrollera reverse proxy/host-routing om allowed origin inte får ACAO eller denied origin läcker ACAO.',
      source: 'strict',
    });
  }

  const hasCorsRuntimeAction = actions.some((item) => item.id === 'cors_strict_runtime_env');
  const hasOwnerMfaAction = actions.some((item) => item.id === 'owner_mfa_setup');
  const hasOutputGateAction = actions.some(
    (item) => item.id === 'ops_heal_output_gates' || item.id === 'ops_heal_all'
  );
  for (const advisory of advisories.slice(0, 3)) {
    const advisoryText = String(advisory || '');
    const advisoryLower = advisoryText.toLowerCase();
    if (hasCorsRuntimeAction && advisoryLower.includes('cors_strict')) continue;
    if (hasOwnerMfaAction && advisoryLower.includes('owner-mfa')) continue;
    if (hasOutputGateAction && advisoryLower.includes('output-gates')) continue;
    pushAction(actions, {
      id: `advisory:${Buffer.from(advisoryText).toString('base64').slice(0, 18)}`,
      priority: 'P2',
      title: 'Ops advisory',
      details: advisoryText,
      source: 'advisory',
    });
  }

  if (actions.length > 0 || exitCode !== 0) {
    pushAction(actions, {
      id: 'rerun_preflight_report',
      priority: 'P3',
      title: 'Verifiera igen med preflight-rapport',
      command: `npm run preflight:pilot:report -- --public-url ${publicUrl}`,
      details: 'Bekräfta att blocker checks och strict failures är lösta.',
      source: 'meta',
    });
  }

  return actions;
}

function priorityRank(priority) {
  const normalized = normalizeText(priority).toUpperCase();
  if (normalized === 'P0') return 0;
  if (normalized === 'P1') return 1;
  if (normalized === 'P2') return 2;
  if (normalized === 'P3') return 3;
  return 4;
}

function filterAndSortActions(actions, { minPriority = '', top = 0 } = {}) {
  const minRank = priorityRank(minPriority || '');
  const sortRank = (item) => {
    const id = normalizeText(item?.id);
    const source = normalizeText(item?.source);
    if (id === 'rerun_preflight_report') return 200;
    if (source === 'advisory') return 100;
    return 0;
  };
  const filtered = [...actions]
    .filter((item) => priorityRank(item.priority) <= minRank || minRank === 4)
    .sort((a, b) => {
      const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
      if (byPriority !== 0) return byPriority;
      const bySortRank = sortRank(a) - sortRank(b);
      if (bySortRank !== 0) return bySortRank;
      return a.title.localeCompare(b.title);
    });
  if (top > 0) return filtered.slice(0, top);
  return filtered;
}

function toText(reportPath, report, actions) {
  const exitCode = Number(report?.exit?.code ?? -1);
  const exitReason = normalizeText(report?.exit?.reason) || '-';
  let output = '';
  output += `Preflight actions: ${reportPath}\n`;
  output += `  exit=${exitCode} reason=${exitReason}\n`;
  output += `  actions=${actions.length}\n`;
  if (actions.length === 0) {
    output += '✅ No suggested actions.\n';
    return output;
  }
  for (const action of actions) {
    output += `- [${action.priority}] ${action.title}\n`;
    if (action.command) output += `  cmd: ${action.command}\n`;
    if (action.details) output += `  info: ${action.details}\n`;
  }
  return output;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error('Saknar rapportfil. Sätt --file <path> eller ARCANA_PREFLIGHT_REPORT_FILE.');
  }
  const loaded = readReport(args.file);
  const actions = filterAndSortActions(buildActions(loaded.payload), {
    minPriority: args.minPriority,
    top: args.top,
  });
  if (args.output === 'json') {
    process.stdout.write(
      `${JSON.stringify(
        {
          reportPath: loaded.path,
          exit: loaded.payload?.exit || null,
          filters: {
            minPriority: args.minPriority || null,
            top: args.top > 0 ? args.top : null,
          },
          actions,
        },
        null,
        2
      )}\n`
    );
    return;
  }
  process.stdout.write(toText(loaded.path, loaded.payload, actions));
}

try {
  main();
} catch (error) {
  console.error('❌ Could not build preflight actions');
  console.error(error?.message || error);
  process.exit(1);
}
