#!/usr/bin/env bash
# Synka MA-Archive från GitHub-repot (~/Code/major-arcana) — inga SharePoint/iCloud-nedladdningar.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
ARCHIVE="$WORKSPACE_ROOT/MA-Archive/sharepoint"
ORIG="$ARCHIVE/originals"
MD="$ARCHIVE/markdown"
REPO="$ROOT_DIR"

mkdir -p "$ORIG" "$MD"

link() {
  local target="$1"
  local name="$2"
  local dir="$3"
  if [[ -f "$target" ]]; then
    ln -sf "$target" "$dir/$name"
    echo "✓ $dir/$name"
  else
    echo "⚠ saknas: $target"
  fi
}

copy() {
  local src="$1"
  local dest="$2"
  if [[ -f "$src" ]]; then
    cp "$src" "$dest"
    echo "✓ kopierad $dest"
  else
    echo "⚠ saknas: $src"
  fi
}

echo "=== Sync MA-Archive ← GitHub (major-arcana) ==="
echo "Repo: $REPO"

# Spec + juridik (markdown i repo)
link "$REPO/docs/strategy/JOURNAL-DATAMODELL.md" "JOURNAL-DATAMODELL.md" "$MD"
link "$REPO/docs/legal/juridik-gdpr/INNEHALL-OCH-NYCKELPUNKTER.md" "Juridik-INNEHALL-OCH-NYCKELPUNKTER.md" "$MD"
link "$REPO/docs/legal/juridik-gdpr/JURIST-FLODE-GABRIELLE-HANDLER.md" "JURIST-FLODE-GABRIELLE-HANDLER.md" "$MD"

# Hälsodekl + friskförsäkran — implementation i kod (ersätter Word på GitHub)
link "$REPO/public/major-arcana-preview/app/journal-pre-treatment-forms.js" "journal-pre-treatment-forms.js" "$MD"

# Bilaga 1 patientinformation — HTML i repo (PDF genereras i prod)
copy "$REPO/public/patientinformation-hartransplantation-dhi-prp-minimal.html" \
  "$ORIG/Bilaga-1-patientinformation-DHI.html"

# TP-journal — implementation
link "$REPO/public/major-arcana-preview/app/journal-tp-form.js" "journal-tp-form.js" "$MD"

# Journalföring/compliance — datamodell avsnitt 3 + legal
link "$REPO/docs/legal/pdl-mdr-assessment.md" "Journalföring-compliance-PDL-bedömning.md" "$MD"

echo ""
if [[ -f "$ARCHIVE/manifest.json" ]]; then
  MANIFEST="$ARCHIVE/manifest.json"
elif [[ -f "$REPO/docs/migration/sharepoint-manifest.json" ]]; then
  MANIFEST="$REPO/docs/migration/sharepoint-manifest.json"
  echo "Använder repo-manifest: $MANIFEST"
fi

if [[ -n "${MANIFEST:-}" && -f "$MANIFEST" ]]; then
  node - "$MANIFEST" "$REPO" <<'NODE'
const fs = require('fs');
const path = require('path');
const manifestPath = process.argv[2];
const repo = process.argv[3];
const base = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const githubSources = {
  health_declaration: 'public/major-arcana-preview/app/journal-pre-treatment-forms.js',
  fitness_certificate: 'public/major-arcana-preview/app/journal-pre-treatment-forms.js',
  tp_treatment_reference: 'public/major-arcana-preview/app/journal-tp-form.js',
  journal_compliance: 'docs/strategy/JOURNAL-DATAMODELL.md',
  patient_info_bilaga1: 'public/patientinformation-hartransplantation-dhi-prp-minimal.html',
};

let ok = 0;
for (const file of manifest.files) {
  const gh = githubSources[file.id];
  const ghPath = gh ? path.join(repo, gh) : null;
  const archiveFull = file.archivePath ? path.join(base, file.archivePath) : null;
  const archiveOk = archiveFull && fs.existsSync(archiveFull);
  const ghOk = ghPath && fs.existsSync(ghPath);

  if (archiveOk || ghOk) {
    console.log(`  ✓ ${file.sharepointName}${gh ? ` ← ${gh}` : ''}`);
    ok += 1;
  } else {
    console.log(`  ○ ${file.sharepointName} — saknas`);
  }
}
console.log(`\nArkiverade via GitHub: ${ok}/${manifest.files.length}`);
NODE
fi

echo ""
echo "Källa: https://github.com/Fazliilzaf/major-arcana (Word-original finns inte i repo — spec + kod är source of truth)"
