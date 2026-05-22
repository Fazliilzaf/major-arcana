const fs = require('node:fs/promises');
const path = require('node:path');

async function listJsFiles(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.js')) {
        out.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return out;
}

function toPosix(value) {
  return String(value || '').split(path.sep).join('/');
}

function findViolations(content, rules = []) {
  const activeRules = Array.isArray(rules) ? rules : [];

  const violations = [];
  for (const rule of activeRules) {
    const matches = content.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    violations.push({
      rule: rule.id,
      message: rule.message,
      count: matches.length,
    });
  }
  return violations;
}

function isCapabilityImplementationFile(content = '') {
  return /extends\s+BaseCapability/.test(content);
}

async function main() {
  const checks = [
    {
      label: 'routes',
      dir: path.join(process.cwd(), 'src', 'routes'),
      rules: [
        {
          id: 'forbidden_store_import',
          message: 'Routes får inte importera store-moduler direkt.',
          pattern: /require\(\s*['"]\.\.\/[^'"]*\/store['"]\s*\)/g,
        },
        {
          id: 'forbidden_template_store_import',
          message: 'Forbidden import: ../templates/store i routes.',
          pattern: /require\(\s*['"]\.\.\/templates\/store['"]\s*\)/g,
        },
        {
          id: 'forbidden_capability_execute_direct',
          message: 'Routes får inte anropa capability.execute() direkt.',
          pattern: /\.execute\(\s*/g,
        },
      ],
    },
    {
      label: 'capabilities',
      dir: path.join(process.cwd(), 'src', 'capabilities'),
      rules: [
        {
          id: 'forbidden_store_import_in_capability',
          message: 'Capabilities får inte importera store-moduler direkt.',
          pattern: /require\(\s*['"]\.\.\/[^'"]*\/store['"]\s*\)/g,
        },
      ],
    },
  ];
  const problems = [];

  for (const check of checks) {
    const files = await listJsFiles(check.dir);
    for (const filePath of files) {
      const raw = await fs.readFile(filePath, 'utf8');
      const violations = findViolations(raw, check.rules);
      const conditionalViolations = [];

      if (check.label === 'capabilities' && isCapabilityImplementationFile(raw)) {
        const capabilityImplementationRules = [
          {
            id: 'forbidden_configstore_import_in_capability',
            message: 'Capability-implementation får inte importera configStore.',
            pattern: /require\(\s*['"]\.\.\/[^'"]*configStore['"]\s*\)/g,
          },
          {
            id: 'forbidden_templatestore_import_in_capability',
            message: 'Capability-implementation får inte importera templateStore.',
            pattern: /require\(\s*['"]\.\.\/templates\/store['"]\s*\)/g,
          },
          {
            id: 'forbidden_riskstore_import_in_capability',
            message: 'Capability-implementation får inte importera riskStore.',
            pattern: /require\(\s*['"]\.\.\/risk\/[^'"]*store[^'"]*['"]\s*\)/g,
          },
          {
            id: 'forbidden_policystore_import_in_capability',
            message: 'Capability-implementation får inte importera policyStore.',
            pattern: /require\(\s*['"]\.\.\/policy\/[^'"]*store[^'"]*['"]\s*\)/g,
          },
          {
            id: 'forbidden_infra_import_in_capability',
            message: 'Capability-implementation får inte importera infra-moduler direkt.',
            pattern: /require\(\s*['"]\.\.\/infra\/[^'"]+['"]\s*\)/g,
          },
        ];
        conditionalViolations.push(...findViolations(raw, capabilityImplementationRules));
      }

      const merged = [...violations, ...conditionalViolations];
      if (merged.length === 0) continue;
      problems.push({
        scope: check.label,
        file: toPosix(path.relative(process.cwd(), filePath)),
        violations: merged,
      });
    }
  }

  if (problems.length > 0) {
    console.error('[no-bypass] route import violations detected:');
    for (const problem of problems) {
      for (const violation of problem.violations) {
        console.error(
          `- [${problem.scope}] ${problem.file}: ${violation.message} (rule=${violation.rule}, count=${violation.count})`
        );
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log('[no-bypass] ok: inga förbjudna store-importer i src/routes eller src/capabilities');
}

main().catch((error) => {
  console.error('[no-bypass] failed:', error?.message || error);
  process.exitCode = 1;
});
