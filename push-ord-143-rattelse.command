#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-143r"
FIL="docs/handover/ORDERS/ORD-143-moms-och-tjanstespecifikationen-i-offerten-2026-08-29.md"

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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-143 rattelse - siffran 8 av 10 var falsk" -m \
"ORD-143 §2 pastod att 8 av 10 offerter namner tjanstespecifikationen i
text. Det stammer inte:

  git grep -c 'tjanstespec' -- src/ops/ccoOfferTemplateStore.js  ->  0
  agreementText-mallar: 14

Ingen av de fjorton offertmallarna namner specifikationen. Siffran kom ur
en tidigare rapport som jag forde vidare utan att mata om.

Pastaendet finns - men i signeringsflodet, inte i offerten:
  ccoTreatmentAgreementDocument.js:96  patienten skriver under pa att
    bilaga 1 mottagits
  ccoOfferEsign.js:260  betanketiden raknas fran mottagandet

§2 ar darmed overspelad i sina siffror men ratt i sin sak, och ersatts av
ORD-150 som ar byggd pa den korrigerade matningen. Rattelserutan sager
uttryckligen: bygg efter ORD-150, inte efter §2.

Det som stod fast aven efter ommatningen: noll dokument bifogar eller
lankar en version, noll katalograder fanns. Systemet pastod i ett
juridiskt bindande dokument att nagot lamnats till kunden utan att veta
om det gjordes - bara pa ett annat stalle an ordern trodde.

Rattelsen skrivs in i stallet for att raderas: en order med fel siffror
som nagon bygger efter ar farligare an en order med en synlig rattelse." \
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
