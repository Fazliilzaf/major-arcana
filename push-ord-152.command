#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-152"
FIL="docs/handover/ORDERS/ORD-152-oppningen-raknas-bara-med-bankid-2026-08-30.md"

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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-152 oppningen raknas bara med BankID" -m \
"Fazli 2026-08-30, pa fragan om en portaloppning racker som bevis pa
mottagande: 'sa lange den har identifierat sig med BankID'.

Det skarper ORD-151. Dar startade betanketiden vid vilken oppning som
helst. Nu ska den starta vid forsta BANKID-VERIFIERADE oppningen.

Skarpningen behovs for att normalizeQuoteOpen bara bar { ts, source } -
ingen identitet. En vidarebefordrad lank, en delad dator eller en nyfiken
anhorig registreras som en oppning, och sedan borjar en rattslig frist
lopa som avtalet pastar vilar pa att KUNDEN mottagit underlaget. Samma
sorts fiktion som ORD-151 lagade, ett steg in.

BankID finns och ger ratt sak: ccoPortalBankIdSession.js:249 returnerar
patientId, INTE personnumret. ORD-131 galler - inga personnummer i
klartext nagonstans i oppningsvagen.

Oidentifierade oppningar registreras anda (verified:false) men startar
ingen frist. Att kunden tittat ar vart att veta aven nar hon inte
legitimerat sig, men det ar inte ett bevis pa mottagande.

KONSEKVENS som maste sta i rapporten: PORTAL_BANKID_LIVE ar false i
render.yaml:391. Kopplas fristen till en verifierad oppning kan ingen
frist starta - och darmed ingen signering - forran flaggan tands. Bygg
anda; grinden ska halla den dagen den tands, inte upptackas da.

Ordernsfalla ar §4: befintliga quoteOpens saknar verified. Tolkas ett
saknat falt som false nollstalls varje pagaende arendes betanketid.
Guard: lagrad coolingOffEndsAt ror man inte. Det ar ocksa punkten
ORD-151 lamnade otestad." \
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
