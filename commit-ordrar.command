#!/bin/bash
# Committar ORD-146 samt Fazlis svar infogade i ORD-143 och ORD-144.
# Endast filer Claude skrivit tas med — andra agenters arbete rörs inte.
# Dubbelklicka i Finder.
set -e
cd "$(dirname "$0")"

echo "== Städar övergivna lås =="
rm -f .git/index.lock .git/next-index-*.lock .git/next-index-*.lock.lock

FILER=(
  "docs/handover/ORDERS/ORD-146-reserverad-vid-accept-bekraftad-vid-signering-2026-08-29.md"
  "docs/handover/ORDERS/ORD-143-moms-och-tjanstespecifikationen-i-offerten-2026-08-29.md"
  "docs/handover/ORDERS/ORD-144-bankid-koppla-fardigt-2026-08-29.md"
)

echo
echo "== Kontrollerar att filerna finns =="
SAKNAS=0
for f in "${FILER[@]}"; do
  if [ -f "$f" ]; then
    echo "  ok    $(basename "$f")"
  else
    echo "  SAKNAS $f"
    SAKNAS=1
  fi
done
if [ "$SAKNAS" = "1" ]; then
  echo
  echo "AVBRYTER: en eller flera filer saknas."
  read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
  exit 1
fi

echo
echo "== Hämtar senaste från origin =="
git fetch origin

echo
echo "== Committar =="
git add "${FILER[@]}"
git commit -m "docs(handover): ORD-146 + Fazlis svar om moms och bokningsordning" -m \
"ORD-146 loser motsagelsen mellan offerAutoFlow och readiness-grinden.
Beslut 2026-08-29: tiden RESERVERAS nar kunden accepterar offerten och
BEKRAFTAS nar behandlingsavtalet signeras. Det ar inte en kompromiss -
kundresan har betanketiden i steg 6, mellan offerten och behandlingen, och
en reservation som blir bekraftad vid signering AR betanketiden uttryckt i
bokningen. Orden finns redan: ENCOUNTER_STATUSES bar reserved och
confirmed, bokningsmotorn har reservationId och renewReservations.

Tva buggar rattas oavsett beslutet:
- readiness-grinden ar fail-open. 'if (agreement && ...)' betyder att en
  patient UTAN avtal passerar, medan en med osignerat avtal stoppas.
- portalen mappar accepted till 'signed'. En konsument ser ordet signerad
  om ett behandlingsavtal hon inte skrivit under.

ORD-143: momsfragan besvarad. 25 procent pa allt som kostar - verksamheten
ar estetisk och darmed momspliktig. Satsen ska bo pa tjansten, inte
inskriven i tjugo mallar.

ORD-144: bokningsfragan flyttad till ORD-146. Den ordern ager identitet,
inte ordningsfoljd." \
  -- "${FILER[@]}"

echo
echo "== Rebasar mot origin/main =="
git pull --rebase origin main

echo
echo "== Pushar =="
git push origin main

echo
echo "KLART."
git log --oneline -3
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
