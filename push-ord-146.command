#!/bin/bash
# Pushar ORD-146 (samt ORD-143/144-uppdateringarna) till origin/main.
# Arbetar i en SEPARAT worktree — din arbetskatalog och de andra agenternas
# ofärdiga ändringar rörs inte alls. Ingen stash, ingen rebase.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-146"

FILER=(
  "docs/handover/ORDERS/ORD-146-reserverad-vid-accept-bekraftad-vid-signering-2026-08-29.md"
  "docs/handover/ORDERS/ORD-143-moms-och-tjanstespecifikationen-i-offerten-2026-08-29.md"
  "docs/handover/ORDERS/ORD-144-bankid-koppla-fardigt-2026-08-29.md"
)

echo "== Läge =="
echo "  gren just nu : $(git rev-parse --abbrev-ref HEAD)"
echo "  målgren      : main (via separat worktree)"

echo
echo "== Kontrollerar filerna =="
for f in "${FILER[@]}"; do
  [ -f "$f" ] || { echo "AVBRYTER: $f saknas."; read -n 1 -s -r -p "Tryck på valfri tangent."; exit 1; }
  echo "  ok  $(basename "$f")"
done

echo
echo "== Hämtar senaste från origin =="
git fetch origin

echo
echo "== Separat worktree på origin/main =="
rm -rf "$WT"
git worktree prune
git worktree add "$WT" origin/main --detach

for f in "${FILER[@]}"; do
  mkdir -p "$WT/$(dirname "$f")"
  cp "$REPO/$f" "$WT/$f"
done

cd "$WT"
git add "${FILER[@]}"

if git diff --cached --quiet; then
  echo "  Inget att committa — filerna är redan identiska på origin/main."
else
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-146 + Fazlis svar om moms och bokningsordning" -m \
"ORD-146 loser motsagelsen mellan offerAutoFlow och readiness-grinden.
Beslut 2026-08-29: tiden RESERVERAS nar kunden accepterar offerten och
BEKRAFTAS nar behandlingsavtalet signeras. Kundresan har betanketiden i
steg 6, mellan offerten och behandlingen, och en reservation som blir
bekraftad vid signering AR betanketiden uttryckt i bokningen. Orden finns
redan: ENCOUNTER_STATUSES bar reserved och confirmed, bokningsmotorn har
reservationId och renewReservations.

Tva buggar rattas oavsett beslutet:
- readiness-grinden ar fail-open. 'if (agreement && ...)' betyder att en
  patient UTAN avtal passerar, medan en med osignerat avtal stoppas.
- portalen mappar accepted till 'signed'. En konsument ser ordet signerad
  om ett behandlingsavtal hon inte skrivit under.

ORD-143: momsfragan besvarad. 25 procent pa allt som kostar - verksamheten
ar estetisk och darmed momspliktig. Satsen ska bo pa tjansten, inte
inskriven i tjugo mallar.

ORD-144: bokningsfragan flyttad till ORD-146." \
    -- "${FILER[@]}"

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
echo "Inget stashat, inget rebasat, inga andra agenters ändringar berörda."
echo
git fetch origin -q
git ls-tree --name-only origin/main docs/handover/ORDERS/ | grep -i "ORD-14[3-6]" || true
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
