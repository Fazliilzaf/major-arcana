#!/bin/bash
# Pushar ORD-148 till origin/main via en SEPARAT worktree.
# Din arbetskatalog och andra agenters ändringar rörs inte.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-ord-153"
FIL="docs/handover/ORDERS/ORD-153-portalen-ar-leveransplatsen-2026-08-30.md"

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
  git -c core.hooksPath=/dev/null commit -m "docs(handover): ORD-153 portalen ar leveransplatsen - BankID vid ingangen" -m \
"Fazli 2026-08-30: 'Da kommer vi ocksa folja alla patientlagar. Inget
skickas online, och vi kan ge kunden all info utan att vara radda att
patientdata skickas hej vilt. Kunden ser var han befinner sig i sin resa
- all information ar samlad pa ett stalle for oss bada.'

BankID sitter vid INGANGEN till portalen, inte vid signeringsknappen.
Arkitekturbeslut, inte en detalj i betanketiden.

Cirkeln som tvingade fram det: portalen har i dag BankID pa signeringen
(cco-patient-offer-portal-v3.html:3615/3622), atkomsten ar bara
token-skyddad. Kombinerat med ORD-151 och ORD-152 gav det en omojlighet:
betanketiden startar vid BankID-verifierad oppning, BankID sker bara vid
signering, signering kraver att fristen lopt ut. Kunden kan inte
legitimera sig utan att signera.

Beslutet andrar vad 'skicka' betyder i hela CCO. De sexton patientvanda
sandvagarna (ORD-147) skickar i dag INNEHALL. Med portalen som
leveransplats skickar de en AVISERING - en lank, ingen patientdata.
Ordern ror dem inte, men kraver att de RAKNAS: vilka bar patientdata i
sjalva meddelandet?

Viktigaste godkant-punkt: portalens innehall otillgangligt utan
verifierad session, mutationstestat. En giltig token utan BankID ger
INGEN atkomst - lanken leder till legitimeringen, inte till innehallet.

Falla (fran ORD-152 §4): befintliga quoteOpens saknar verified. Tolkas
det som false nollstalls varje pagaende arendes betanketid.

KONSEKVENS: PORTAL_BANKID_LIVE ar false. Med ordern byggd ar portalen
stangd tills Fazli tander den. Bygg anda.

ORD-152 ersatts av den har - den beskrev ratt princip pa fel plats i
flodet. Lamnas kvar med hanvisning, raderas inte." \
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
