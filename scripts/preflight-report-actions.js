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
  });
}

function buildActions(report) {
  const actions = [];
  const exitCode = Number(report?.exit?.code ?? 0);
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
  const publicUrl = normalizeText(options?.publicUrl) || '<public-url>';

  const failedCheckIds = Array.isArray(guard?.failedCheckIds) ? guard.failedCheckIds : [];
  const failedSet = new Set(failedCheckIds.map((item) => normalizeText(item)).filter(Boolean));

  if (failedSet.has('cors_strict')) {
    const envLine = normalizeText(guard?.corsStrictEnv);
    pushAction(actions, {
      id: 'cors_strict_runtime_env',
      priority: 'P0',
      title: 'Sätt strict CORS i runtime',
      command: envLine || 'CORS_STRICT=true CORS_ALLOW_NO_ORIGIN=false CORS_ALLOWED_ORIGINS=<origin1,origin2>',
      details: 'Deploya om efter env-ändring och kör preflight igen.',
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
    });
    pushAction(actions, {
      id: 'owner_mfa_remediate_fallback',
      priority: 'P1',
      title: 'Fallback: disable non-compliant OWNER memberships',
      command:
        `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:remediate -- --apply`,
      details: 'Använd endast när minst en compliant OWNER finns kvar.',
    });
  }

  const strictFailures = Array.isArray(strict?.failures) ? strict.failures : [];
  if (strictFailures.some((item) => String(item).includes('output_without_risk_policy_gate'))) {
    pushAction(actions, {
      id: 'ops_heal_output_gates',
      priority: 'P1',
      title: 'Kör output-gate remediation',
      command: `BASE_URL=${publicUrl} ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite:strict:heal`,
      details: 'Auto-fixar output/policy metadata på aktiva versioner.',
    });
  }

  const advisories = Array.isArray(strict?.advisories) ? strict.advisories : [];
  for (const advisory of advisories.slice(0, 4)) {
    pushAction(actions, {
      id: `advisory:${Buffer.from(String(advisory)).toString('base64').slice(0, 18)}`,
      priority: 'P2',
      title: 'Ops advisory',
      details: String(advisory),
    });
  }

  if (actions.length > 0 || exitCode !== 0) {
    pushAction(actions, {
      id: 'rerun_preflight_report',
      priority: 'P0',
      title: 'Verifiera igen med preflight-rapport',
      command: `npm run preflight:pilot:report -- --public-url ${publicUrl}`,
      details: 'Bekräfta att blocker checks och strict failures är lösta.',
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
  const sorted = [...actions].sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    return a.title.localeCompare(b.title);
  });
  for (const action of sorted) {
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
  const actions = buildActions(loaded.payload);
  if (args.output === 'json') {
    process.stdout.write(
      `${JSON.stringify(
        {
          reportPath: loaded.path,
          exit: loaded.payload?.exit || null,
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
