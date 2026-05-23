#!/usr/bin/env bash
# Symlinkar SharePoint-original till MA-Archive/sharepoint/ (CODE-only).
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
echo "Workspace: $WORKSPACE_ROOT"

# originals/ — förväntas vara riktiga filer i ~/Code/MA-Archive (ej iCloud-symlinks)
for f in \
  "5. Friskförsäkran TP 2025.docx" \
  "Bilaga-1-patientinformation-DHI.docx"; do
  if [[ -f "$ORIG/$f" && ! -L "$ORIG/$f" ]]; then
    echo "✓ $ORIG/$f (lokal kopia)"
  elif [[ -f "$ORIG/$f" ]]; then
    echo "⚠ $ORIG/$f är symlink — ersätt med riktig fil i MA-Archive"
  else
    echo "○ saknas: $ORIG/$f"
  fi
done

HEALTH_MD="$WORKSPACE_ROOT/hairtpclinic-web/docs/sources/halsodeklaration-konsultation.md"
if [[ ! -f "$HEALTH_MD" && -f "$MD/1. Hälsodeklaration TP, PRP, Microneedling PRF.md" ]]; then
  HEALTH_MD="$MD/1. Hälsodeklaration TP, PRP, Microneedling PRF.md"
fi
[[ -f "$HEALTH_MD" ]] && link "$HEALTH_MD" "1. Hälsodeklaration TP, PRP, Microneedling PRF.md" "$MD"

INDEX_MD="$WORKSPACE_ROOT/hairtpclinic-web/docs/sources/INDEX.md"
[[ -f "$INDEX_MD" ]] && link "$INDEX_MD" "SharePoint-INDEX.md" "$MD"

link "$ROOT_DIR/docs/strategy/JOURNAL-DATAMODELL.md" "JOURNAL-DATAMODELL.md" "$MD"

for word in \
  "1. Hälsodeklaration TP, PRP, Microneedling PRF.docx" \
  "6. TP Journal – Behandling FÖRSLAG.docx" \
  "Journalföring och dokumentationrutiner.docx"; do
  [[ -f "$ORIG/$word" ]] || echo "○ saknas Word: $word → lägg i $ORIG"
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
    console.log(`  ✗ ${file.sharepointName} — saknas`);
    missing += 1;
  }
}
console.log(`\nArkiverade: ${ok}/${manifest.files.length}`);
NODE
fi

echo ""
echo "SharePoint-nedladdning → $ORIG:"
echo "  • 1. Hälsodeklaration TP, PRP, Microneedling PRF.docx"
echo "  • 6. TP Journal – Behandling FÖRSLAG.docx"
echo "  • Journalföring och dokumentationrutiner.docx"
