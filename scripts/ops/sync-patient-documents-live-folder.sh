#!/usr/bin/env bash
# Skapar/uppdaterar iCloud-arbetsmappen CCO-patientdokument-live med designreferenser,
# lokala Word-symlinks och pekare till Meridiq/CCO-kod i repot.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ICLOUD_BASE="${ICLOUD_BASE:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0}"
WORK="$ICLOUD_BASE/CCO-patientdokument-live"
ARCHIVE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0"
CLAUDE_OUT="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/d8fb4109-ef76-4481-9798-c9f5753785a5/1a14e03f-cdbe-43f3-b9ab-af4282328778/local_73a6ea16-2a13-4d21-9ccf-2fd165c81dfa/outputs"

mkdir -p "$WORK"/{00-design-referens,01-word-original-lokalt,02-sharepoint-index,03-meridiq-facit,04-cco-live}

link() {
  local src="$1" dest="$2"
  if [[ -e "$src" ]]; then
    ln -sf "$src" "$dest"
    echo "✓ $dest"
  else
    echo "⚠ saknas: $src"
  fi
}

copy_if_newer() {
  local src="$1" dest="$2"
  if [[ -f "$src" ]]; then
    cp -f "$src" "$dest"
    echo "✓ kopierad $dest"
  else
    echo "⚠ saknas: $src"
  fi
}

echo "=== CCO patientdokument live folder ==="
echo "Mapp: $WORK"

# Designreferenser
copy_if_newer "$ROOT_DIR/public/major-arcana-preview/steg3-halsodeklaration-final-demo.html" \
  "$WORK/00-design-referens/steg3-halsodeklaration-final-demo.html"
copy_if_newer "$ROOT_DIR/public/major-arcana-preview/steg3-health-questionnaire-eng-final-demo.html" \
  "$WORK/00-design-referens/steg3-health-questionnaire-eng-final-demo.html"
copy_if_newer "$ROOT_DIR/public/major-arcana-preview/steg6-betanketid-samtycke-final-demo.html" \
  "$WORK/00-design-referens/steg6-betanketid-samtycke-final-demo.html"
copy_if_newer "$ROOT_DIR/public/major-arcana-preview/steg7-v6-kundkort-final-demo.html" \
  "$WORK/00-design-referens/steg7-v6-kundkort-final-demo.html"
copy_if_newer "$ROOT_DIR/public/major-arcana-preview/steg8-friskforsakran-final.html" \
  "$WORK/00-design-referens/steg8-friskforsakran-final.html"
copy_if_newer "$ROOT_DIR/public/major-arcana-preview/steg8-journal-tp-final-demo.html" \
  "$WORK/00-design-referens/steg8-journal-tp-final-demo.html"
for f in "$ROOT_DIR/public/major-arcana-preview"/steg8-journal-*-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg4-konsultationsmall-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg5-behandlingsplan-staff-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg8-ordination-tp-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/staff-anteckningar-kort-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg4-id-verifiering-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg5-info-offert-tp-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg2-auto-bokningsbekraftelse-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/auto-bokningspaminnelse-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/auto-avbokningsbekraftelse-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg3-auto-instruktion-formular-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg6-auto-betanketid-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/auto-medical-finance-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/auto-integritet-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg8-fore-efter-bildmall-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/staff-auto-internt-sms-final-demo.html; do
  [[ -f "$f" ]] || continue
  copy_if_newer "$f" "$WORK/00-design-referens/$(basename "$f")"
done
for f in "$ROOT_DIR/public/major-arcana-preview"/steg4-*-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg5-offert-*-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg7-offert-*-final-demo.html \
         "$ROOT_DIR/public/major-arcana-preview"/steg9-foto-samtycke-final-demo.html; do
  [[ -f "$f" ]] || continue
  copy_if_newer "$f" "$WORK/00-design-referens/$(basename "$f")"
done

# Word lokalt (jurist / kvalitetsledning)
link "$ARCHIVE/MA-Archive/sharepoint/originals/5. Friskförsäkran TP 2025.docx" \
  "$WORK/01-word-original-lokalt/5-friskforsakran-tp-2025.docx"
link "$ARCHIVE/Juridik-GDPR/251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar.docx" \
  "$WORK/01-word-original-lokalt/251203-behandlingsavtal-dhi-2dagar.docx"
link "$ARCHIVE/Juridik-GDPR/251203_Behandlingsavtal Hair TP Clinic gbg AB (PRP-behandling).docx" \
  "$WORK/01-word-original-lokalt/251203-behandlingsavtal-prp.docx"
link "$ARCHIVE/Juridik-GDPR/251010_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden).docx" \
  "$WORK/01-word-original-lokalt/251010-behandlingsavtal-dhi.docx"
link "$ARCHIVE/Juridik-GDPR/Underbilaga 1 - Instruktion.docx" \
  "$WORK/01-word-original-lokalt/underbilaga-1-instruktion.docx"
link "$ARCHIVE/MA-Archive/sharepoint/originals/Bilaga-1-patientinformation-DHI.docx" \
  "$WORK/01-word-original-lokalt/bilaga-1-patientinformation-dhi.docx"
link "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Kvalitetsledningssystem/Ordination för lokalbedövning vid hårtransplantation.docx" \
  "$WORK/01-word-original-lokalt/ordination-lokalbedovning-tp.docx"
link "$HOME/Code/MA-Archive/offert-word/Offertmallar" \
  "$WORK/01-word-original-lokalt/offertmallar-14docx"
link "$ROOT_DIR/docs/implementation/patient-documents-live/patient-document-word-registry.json" \
  "$WORK/02-sharepoint-index/patient-document-word-registry.json"
link "$ROOT_DIR/docs/strategy/SHAREPOINT-TEMPLATE-INVENTORY.md" \
  "$WORK/02-sharepoint-index/SHAREPOINT-TEMPLATE-INVENTORY.md"
link "$ROOT_DIR/docs/migration/sharepoint-manifest.json" \
  "$WORK/02-sharepoint-index/sharepoint-manifest.json"
link "$ROOT_DIR/docs/strategy/SHAREPOINT-IMPORT-REPORT-2026-05-30.md" \
  "$WORK/02-sharepoint-index/SHAREPOINT-IMPORT-REPORT-2026-05-30.md"

cat > "$WORK/02-sharepoint-index/SHAREPOINT-ROOT.txt" <<'EOF'
hairtpclinic1.sharepoint.com/sites/Ledning
Shared Documents/General/1. Kunddokument - KVALITETSSÄKRA/

Viktiga undermappar:
  2. Hair TP Clinic 2026/          — HD, FC, TP journal, avtal
  97. Versioner fran advokat/       — Nordbro 251203 (CANONICAL avtal)
  98. Mailmallar/                   — bokning, offert
  0. NY Tjanstespecifikationer PDF/ — PRP, MN, Profhilo, m.fl.
  GDPR/                             — integritetspolicy

Word-original committas ALDRIG till GitHub.
Ladda ner saknade .docx hit: 01-word-original-lokalt/
EOF

# Meridiq facit
link "$ROOT_DIR/migration/meridiq/questionary-catalog.json" "$WORK/03-meridiq-facit/questionary-catalog.json"
link "$ROOT_DIR/migration/meridiq/consent-catalog.json" "$WORK/03-meridiq-facit/consent-catalog.json"
link "$ROOT_DIR/migration/meridiq/steg7-tp-dhi-agreement-facit.json" "$WORK/03-meridiq-facit/steg7-tp-dhi-agreement-facit.json"
link "$ROOT_DIR/migration/meridiq/prp-behandling-agreement-facit.json" "$WORK/03-meridiq-facit/prp-behandling-agreement-facit.json"

# CCO live kod/data
link "$ROOT_DIR/public/major-arcana-preview/data/hairtp-document-content-bundle.json" \
  "$WORK/04-cco-live/hairtp-document-content-bundle.json"
link "$ROOT_DIR/public/major-arcana-preview/app/journal-pre-treatment-forms.js" \
  "$WORK/04-cco-live/journal-pre-treatment-forms.js"
link "$ROOT_DIR/public/major-arcana-preview/app/journal-tp-form.js" \
  "$WORK/04-cco-live/journal-tp-form.js"
link "$ROOT_DIR/public/major-arcana-preview/app/journal-prp-form.js" \
  "$WORK/04-cco-live/journal-prp-form.js"
link "$ROOT_DIR/public/major-arcana-preview/app/journal-follow-up-form.js" \
  "$WORK/04-cco-live/journal-follow-up-form.js"
link "$ROOT_DIR/public/major-arcana-preview/cco-avtal-samtycke-bundle.html" \
  "$WORK/04-cco-live/cco-avtal-samtycke-bundle.html"
link "$ROOT_DIR/docs/implementation/patient-documents-live/BOOKOFF-CHECKLIST.md" \
  "$WORK/BOOKOFF-CHECKLIST.md"
link "$ROOT_DIR/docs/implementation/patient-documents-live/IMPLEMENTATION-CHECKLIST.md" \
  "$WORK/IMPLEMENTATION-CHECKLIST.md"
link "$ROOT_DIR/docs/implementation/patient-documents-live/README.md" \
  "$WORK/README.md"

echo ""
echo "Klart. Öppna: $WORK"
echo "Checklista: $WORK/IMPLEMENTATION-CHECKLIST.md"
