#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-148b"
FIL="docs/handover/ORDERS/ORD-148-fazlis-svar-arbetsbladet-2026-08-30.md"

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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-148 uppdaterad - PRP JA, Curatiios kanonfil, rattelse till ORD-142" -m \
"Arbetsbladet har legat med 537 obesvarade rutor sedan ORD-135 §2. Fazli
besvarade dem 2026-08-30 i sju grupper.

Matt: 72 rader, 537 rutor. Transplantation 26/305, PRP 15/75,
Injektioner 12/62, Ogonlocksplastik 4/20, Ortopediska 7/38,
Konsultationer 5/22, Uppfoljningar 3/15. (Mina tidigare siffror i chatten
raknade ortopedisk PRF tva ganger - tabellen i ordern galler.)

Beslut: transplantation JA pa alla; injektioner JA med omsesidigt
uteslutande journalkolumner; ogonlocksplastik JA pa alla; ortopediska JA
med BADA journalkolumnerna (ortopedi for behandlingen, prp_multi for
serien - enda gruppen dar tva samexisterar med avsikt); konsultationer JA
med journal matchad efter specialitet, alltsa oppnar en konsultation en
journal; uppfoljningar JA. id_verifiering JA overallt utom i PRP.

8954 Uppfoljning Profilho -> journal_estetik_profhilo. Det stanger
ORD-137:s sista oppna fraga, oppen sedan 2026-08-28.

PRP:s tre ovriga kolumner (behandlingsplan_staff, anteckningar_kort,
id_verifiering) bekraftades som JA pa foljdfraga. Alla 537 rutor ar
darmed JA - det svara ar journalmatchningen, inte ja/nej.

Curatiios kanonfil identifierad: 'Information infor ogonlocksplastik
(Dermatochalasis)'. Den lag redan i SP-forteckningen rad 111, felklassad
som 'nej - patientinfo' pa filnamnet. Rattelse till ORD-142. Hair TP:s
filer ligger redan i public/ utan data-registry-id - ingen extraktion
behovs for dem.

Utanfor bladet: kanonfil for for- och eftervard vald ([SE]
Guide-For&Eftervard-TP.pdf for Hair TP, 'Patientinformation' som egen fil
for Curatiio - inte delad). Avbokad tid stanger INTE uppfoljningen -
personalen far en fraga i stallet, vilket andrar forvalet i ORD-140 §3." \
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
