#!/usr/bin/env bash
# Symlinkar lokalt hittade SharePoint-original till MA-Archive/sharepoint/
# Workspace: ~/Code (major-arcana + MA-Archive som syskon)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
ARCHIVE="$WORKSPACE_ROOT/MA-Archive/sharepoint"
ORIG="$ARCHIVE/originals"
MD="$ARCHIVE/markdown"
ICLOUD="${ARCANA_ICLOUD_ROOT:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0}"

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

first_existing() {
  for candidate in "$@"; do
    [[ -f "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

echo "=== Sync SharePoint → MA-Archive/sharepoint ==="
echo "Workspace: $WORKSPACE_ROOT"

FRISK="$(first_existing \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Friskförsäkran - TP.docx" \
  "$ICLOUD/Juridik-GDPR/Friskförsäkran - TP.docx" \
  || true)"
[[ -n "$FRISK" ]] && link "$FRISK" "5. Friskförsäkran TP 2025.docx" "$ORIG"

FRISK2="$(first_existing \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Kvalitetsledningssystem/Friskförsäkran TP-2.docx" \
  || true)"
[[ -n "$FRISK2" ]] && link "$FRISK2" "5. Friskförsäkran TP 2025 (kvalitetsledning).docx" "$ORIG"

BILAGA1="$(first_existing \
  "$ROOT_DIR/docs/legal/juridik-gdpr/251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx" \
  "$ICLOUD/Juridik-GDPR/251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx" \
  || true)"
[[ -n "$BILAGA1" ]] && link "$BILAGA1" "Bilaga-1-patientinformation-DHI.docx" "$ORIG"

HEALTH_MD="$(first_existing \
  "$WORKSPACE_ROOT/hairtpclinic-web/docs/sources/halsodeklaration-konsultation.md" \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/docs/sources/halsodeklaration-konsultation.md" \
  "$ARCHIVE/markdown/1. Hälsodeklaration TP, PRP, Microneedling PRF.md" \
  || true)"
[[ -n "$HEALTH_MD" ]] && link "$HEALTH_MD" "1. Hälsodeklaration TP, PRP, Microneedling PRF.md" "$MD"

INDEX_MD="$(first_existing \
  "$WORKSPACE_ROOT/hairtpclinic-web/docs/sources/INDEX.md" \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/docs/sources/INDEX.md" \
  || true)"
[[ -n "$INDEX_MD" ]] && link "$INDEX_MD" "SharePoint-INDEX.md" "$MD"

link "$ROOT_DIR/docs/strategy/JOURNAL-DATAMODELL.md" "JOURNAL-DATAMODELL.md" "$MD"

# Word-original som måste ligga i originals/ (SharePoint-nedladdning)
for pair in \
  "1. Hälsodeklaration TP, PRP, Microneedling PRF.docx" \
  "6. TP Journal – Behandling FÖRSLAG.docx" \
  "Journalföring och dokumentationrutiner.docx"; do
  if [[ ! -f "$ORIG/$pair" ]]; then
    echo "○ saknas Word: $pair → lägg i $ORIG"
  fi
done

echo ""
if [[ -f "$ARCHIVE/manifest.json" ]]; then
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
else
  echo "⚠ Saknar $ARCHIVE/manifest.json"
fi

echo ""
echo "Nästa: ladda ner från SharePoint och lägg i $ORIG:"
echo "  • 1. Hälsodeklaration TP, PRP, Microneedling PRF.docx"
echo "  • 6. TP Journal – Behandling FÖRSLAG.docx"
echo "  • Journalföring och dokumentationrutiner.docx"
