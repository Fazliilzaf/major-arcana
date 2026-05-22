#!/usr/bin/env bash
# Symlinkar lokalt hittade SharePoint-original till MA-Archive/sharepoint/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
ARCHIVE="$WORKSPACE_ROOT/MA-Archive/sharepoint"
ORIG="$ARCHIVE/originals"
MD="$ARCHIVE/markdown"

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

echo "=== Sync SharePoint → MA-Archive/sharepoint ==="

link "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Friskförsäkran - TP.docx" \
  "5. Friskförsäkran TP 2025.docx" "$ORIG"

link "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Kvalitetsledningssystem/Friskförsäkran TP-2.docx" \
  "5. Friskförsäkran TP 2025 (kvalitetsledning).docx" "$ORIG"

link "$WORKSPACE_ROOT/Juridik-GDPR/251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx" \
  "Bilaga-1-patientinformation-DHI.docx" "$ORIG"

link "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/docs/sources/halsodeklaration-konsultation.md" \
  "1. Hälsodeklaration TP, PRP, Microneedling PRF.md" "$MD"

link "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/docs/sources/INDEX.md" \
  "SharePoint-INDEX.md" "$MD"

link "$WORKSPACE_ROOT/JOURNAL-DATAMODELL.md" \
  "JOURNAL-DATAMODELL.md" "$MD"

echo ""
echo "Manifest: $ARCHIVE/manifest.json"
node - "$ARCHIVE/manifest.json" <<'NODE'
const fs = require('fs');
const path = require('path');
const manifestPath = process.argv[2];
const base = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let ok = 0;
let missing = 0;
for (const file of manifest.files) {
  if (!file.archivePath) {
    console.log(`  ○ ${file.sharepointName} — ej arkiverad (${file.status})`);
    missing += 1;
    continue;
  }
  const full = path.join(base, file.archivePath);
  if (fs.existsSync(full)) {
    console.log(`  ✓ ${file.sharepointName}`);
    ok += 1;
  } else {
    console.log(`  ✗ ${file.sharepointName} — symlink trasig`);
    missing += 1;
  }
}
console.log(`\nArkiverade: ${ok}/${manifest.files.length}`);
NODE

echo ""
echo "Nästa: ladda ner från SharePoint och lägg i $ORIG:"
echo "  • 1. Hälsodeklaration TP, PRP, Microneedling PRF.docx"
echo "  • 6. TP Journal – Behandling FÖRSLAG.docx"
echo "  • Journalföring och dokumentationrutiner.docx"
