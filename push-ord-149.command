#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-149b"
FIL="docs/handover/ORDERS/ORD-149-momsen-bor-pa-tjansten-2026-08-30.md"

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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-149 uppdaterad - Fazlis tva svar (inkl moms, 25% pa alla)" -m \
"Fazli 2026-08-30: 25 procent moms pa alla tjanster, och bada oppna
fragorna ar nu besvarade.

1. PRISERNA AR INKLUSIVE MOMS. Priset kunden ser ar priset kunden betalar.
   Momsen raknas BAKAT: exkl = pris / 1.25, moms = pris - exkl.
   52 000 -> 41 600 + 10 400. Raknar man framat (pris * 0.25) blir samma
   offert 65 000 - 13 000 kr mer an hemsidan lovar. Godkant-punkt 9 kraver
   ett test pa just 52 000 plus mutationstest av riktningen.

2. INGEN CURATIIO-RAD AR MEDICINSKT MOTIVERAD. Alla 84 tjanster ar
   estetiska och momspliktiga, en enda sats. Faltet ska anda kunna bara
   olika varden per rad - inte for att nagon avviker i dag, utan for att
   den dagen en gor det ska svaret vara att andra ett varde, inte att
   bygga om modellen.

Matt i cco-service-catalog.json: 84 rader, 21 med 0 kr (konsultationer,
far satsen men ingen momsrad), 1 fran-pris (7414 DHI Arr), 0 avvikande
format. Momsvokabular finns i src/cfo men bara for INGAENDE moms pa
utgifter.

Grindar: price-strangen byte-identisk (prisgrinden jamfor strangar mot
hemsidan - nytt numeriskt falt laggs bredvid), noll hardkodad 25:a utanfor
katalogen, alla 84 rader far faltet explicit, avrundningsregeln pa ETT
stalle." \
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
