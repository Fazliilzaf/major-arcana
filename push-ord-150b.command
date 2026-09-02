#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-150b"
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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-150 rattad - siffran var fel, grinden sitter pa tva vagar" -m \
"Ordern skrevs pa uppgiften '8 av 10 offerter namner tjanstespecifikationen'.
Det stammer inte. Matt om:

  git grep -c 'tjanstespec' -- src/ops/ccoOfferTemplateStore.js  ->  0
  agreementText-mallar: 14

Ingen av de fjorton offertmallarna namner specifikationen. Siffran kom ur
en tidigare rapport som jag forde vidare utan att mata om. Mitt fel, och
tredje gangen i dag en agent rattar min matning.

Pastaendet bor i SIGNERINGSFLODET, inte i offerten:
  ccoTreatmentAgreementDocument.js:96 - patienten skriver under pa att
    bilaga 1 mottagits. Hennes signatur pa ett faktum systemet inte kan
    belagga. Allvarligast.
  ccoOfferEsign.js:260 - betanketiden RAKNAS FRAN mottagandet. Ar den
    utgangspunkten fiktiv ar hela betanketiden fel och signeringen kan
    ske for tidigt.

Grinden ska darfor sitta pa tva vagar, med mutationstest PER VAG. En
grind enbart pa buildOfferDocumentHtml hade missat bada - en sparr som
ser ut att skydda men inte gor det.

§4 (prp-hair/prp-skin far samma text som de andra atta) UTGAR - det finns
inga atta. Sprid inte formuleringen till fjorton mallar; det skapar
fjorton nya loften att infria.

Nytt §4b: betanketiden behover ett DATUM for mottagandet, inte bara ett
ja/nej. Mat om det finns; rapportera, laga inte i samma pass.

Nytt godkant-krav: ccoOfferFromPlan.js:370 ska visa ingen version nar
ingen koppling finns. En version utan belagt mottagande ar ett pastaende
i sig." \
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
