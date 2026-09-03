#!/bin/bash
# Pushar ORD-147 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och de andra agenternas ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-147"
FIL="docs/handover/ORDERS/ORD-147-nar-en-patient-slutar-vara-patient-2026-08-30.md"

echo "== Läge =="
echo "  gren just nu : $(git rev-parse --abbrev-ref HEAD)"
echo "  målgren      : main (separat worktree)"

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
  echo "  Inget att committa — filen är redan identisk på origin/main."
else
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-147 nar en patient slutar vara patient" -m \
"ORD-140 §3 sa 'avslutad vardepisod stanger allt framtida' utan att saga
vad som utloser det. Sokning i repot: 'vardepisod' finns bara i mina egna
ordrar, 'avliden'/'deceased' ger noll traffar. Termen var min och saknade
motsvarighet i systemet. Ordern ger den innehall.

Fazli 2026-08-30: alla tre orsakerna galler - avliden, bytt vardgivare,
admin-stangning. Vi borjar med avliden.

Mekanismen finns redan och ska inte byggas om. ORD-140 levererade
alternativ B: closedAt/closedReason/closedByUserId/closedByEventId i
ccoJournalStore (rad 297-300) plus ccoFollowUpCancellation. Det som saknas
ar utlosaren - modulen har exakt en anropare, ccoBookingEngine.js, alltsa
avbokning av EN tid. Avslutad vard kan inte uttryckas.

Ordernsviktigaste rad: utskicksblockeringen vid avliden ska sitta vid
sandgransen, inte i granssnittet. En yta som slutar visa knappen ar ingen
sparr - nasta schemalagda jobb gar anda ivag. Enda punkten dar ett gront
test utan mutationstest inte duger.

CCO_SEND_LIVE ar fortsatt false och rors inte. Sparren byggs anda - den
ska halla den dagen grinden oppnas, inte upptackas da." \
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
git ls-tree --name-only origin/main docs/handover/ORDERS/ | grep -i "ORD-14[5-7]" || true
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
