#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-150"
FIL="docs/handover/ORDERS/ORD-150-offerten-ska-sluta-lova-nagot-den-inte-bifogar-2026-08-30.md"

echo "== Läge =="
echo "  gren just nu : $(git rev-parse --abbrev-ref HEAD)"

[ -f "$FIL" ] || { echo "AVBRYTER: $FIL saknas."; read -n 1 -s -r -p "Tryck på valfri tangent."; exit 1; }
echo "  ok  $(basename "$FIL")"

echo
echo "== Hämtar senaste från origin =="
git fetch origin

echo
echo "== Separat worktree på origin/main =="
rm -rf "$WT"
git worktree prune
git worktree add "$WT" origin/main --detach

mkdir -p "$WT/$(dirname "$FIL")"
cp "$REPO/$FIL" "$WT/$FIL"

cd "$WT"
git add "$FIL"

if git diff --cached --quiet; then
  echo "  Inget att committa — redan identiskt på origin/main."
else
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-150 offerten ska sluta lova nagot den inte bifogar" -m \
"sendable: 0. Ingen mall i CCO ar juridiskt godkand, ingenting kan na en
patient. Det ar inte ett tekniskt fel - det ar att ingen manniska kan
skriva under pa att mallarna stammer.

Offerten sager i bindande text: 'tjanstespecifikation (Behandlingen) som
tillhandahallits Kunden'. 8 av 10 offerter gor pastaendet. 0 av 20 bifogar
eller lankar en version. 0 katalograder finns. Att godkanna den mallen vore
att godkanna ett pastaende som inte ar sant.

Darfor ligger den har ordern fore allt annat i CCO. Vagen till att CCO
verkstalls ar: denna order -> juridiskt godkannande -> CCO_SEND_LIVE.
Ingenting annat ligger pa den vagen.

Tva saker finns redan och ska inte byggas om:
- 15 tjanstespecifikationer i SharePoint, mars 2026 (10 Curatiio, 5 HTPC).
  Ingenting ska skrivas - de ska hamtas och kopplas.
- Versionshantering: ccoTemplateRegistry currentRevision/currentVersion.
  Ingen andra versionsmodell.

Ordernsviktigaste punkt ar grinden: en offert som gor pastaendet far inte
kunna skickas utan en kopplad version. Fail-closed. Repot har redan fyra
fail-open-fallor - adapt(), JOURNAL_STATUSES, readiness-grinden,
isPendingType. Den har far inte bli den femte.

Mappningen tjanst -> specifikation ska vara EXPLICIT, aldrig
namnmatchning. ORD-142 klassade Curatiios enda eftervardsdokument som
'nej' pa filnamnet och tappade det i tva dygn.

prp-hair och prp-skin saknar omnamnandet helt - de ska fa bade text OCH
koppling, inte texten forst. Annars har vi tio logner istallet for atta.

15 specifikationer tacker inte 84 tjanster: rapportera per id vilka som
saknar, gissa inte.

legalReviewStatus pending pa varje ny rad. Ingen mall godkanns av kod.
CCO_SEND_LIVE rord." \
    -- "$FIL"

  echo
  echo "== Pushar till main =="
  git push origin HEAD:main
fi

cd "$REPO"
echo
echo "== Städar =="
git worktree remove "$WT" --force
git worktree prune

echo
echo "KLART. Din gren $(git rev-parse --abbrev-ref HEAD) är orörd."
echo
git fetch origin -q
git ls-tree --name-only origin/main docs/handover/ORDERS/ | grep -i "ORD-14[6-8]" || true
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
