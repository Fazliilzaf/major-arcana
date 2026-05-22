const { execSync } = require('node:child_process');
const path = require('node:path');

const PROTECTED_PREFIXES = [
  'vendor/cconext-upstream/',
  'public/cco-next-release/',
];

function toPosix(value) {
  return String(value || '').split(path.sep).join('/');
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --relative', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim();
    if (!output) return [];
    return output
      .split(/\r?\n/g)
      .map((item) => toPosix(item.trim()))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function main() {
  const stagedFiles = getStagedFiles();
  const blockedFiles = stagedFiles.filter((filePath) =>
    PROTECTED_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );

  if (!blockedFiles.length) {
    console.log('[cco-next-read-only] ok: inga staged ändringar i gamla /cco-next-basen');
    return;
  }

  console.error('[cco-next-read-only] blockerat: staged ändringar upptäcktes i read-only-basen:');
  blockedFiles.forEach((filePath) => {
    console.error(`- ${filePath}`);
  });
  console.error(
    '[cco-next-read-only] Bygg vidare i public/major-arcana-preview i stället för vendor/cconext-upstream eller public/cco-next-release.'
  );
  process.exitCode = 1;
}

main();
