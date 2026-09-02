#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-151"
FIL="docs/handover/ORDERS/ORD-151-betanketiden-raknas-fran-fel-dag-2026-08-30.md"

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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-151 betanketiden raknas fran fel dag" -m \
"Signeringssidan sager till kunden: 'betanketid ar X kalenderdagar fran
att du mottagit tjanstespecifikation, patientinformation och
offertunderlag' (ccoOfferEsign.js:260).

Koden raknar fran nagot annat:
  ccoCommercial.js:1159  coolingOffEndsAt = addDaysIso(sentAt, dagar)

Texten lovar mottagande, koden raknar utskick. Skillnaden gar alltid at
fel hall - betanketiden startar innan kunden sett nagot. Skickas offerten
fredag kvall och oppnas mandag ar tva av tva dagar redan forbrukade.
Kunden kan signera samma stund hon forst laser underlaget, medan avtalet
pastar att hon haft betanketid.

Mekanismen finns redan och ska INTE byggas om. ORD-42 byggde
oppningssparning i juni 2026:
  ccoCommercialStore.js:622   quoteOpenedAt
              :1035           quoteOpenCount
              :1101           offer_opened (tidslinjehandelse med kalla)

Falten finns, fylls och visas i kundkortets historik. Det som saknas ar
kopplingen till betanketiden - samma monster som cancelJob i ORD-140:
mekanismen byggd, utlosaren aldrig kopplad.

Ordernsvara punkt ar fallet 'aldrig oppnad'. Tre hallningar ar mojliga
(blockera signering / falla tillbaka pa utskick / eget lage 'ej
paborjad'). Jag lutar at att blockera, men agenten ska valja och
motivera. Inget tyst fallback - ett datum som ser ut att vara
mottagandet men ar utskicket ar precis buggen vi lagar.

Legacy: signerade och arkiverade arenden behaller sin lagrade
coolingOffEndsAt (ccoHairTpCoolingOffPolicy.js:7). Andra bara framat.

Oppet for Nordbro: racker en oppning i portalen juridiskt som bevis pa
'tillhandahallits Kunden'? Starkare an utskick, svagare an signatur.
Fragan ar stalld och obesvarad - bygg pa quoteOpenedAt anda, det ar
obestridligt battre an quoteSentAt." \
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
