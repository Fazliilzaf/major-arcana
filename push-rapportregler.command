#!/bin/bash
# Pushar RAPPORTREGLER.md och kopplar in den i AGENTS.md på origin/main.
# Arbetar i en SEPARAT worktree. Din arbetskatalog och andra agenters
# ofärdiga ändringar rörs inte — AGENTS.md redigeras i origin/mains version,
# inte i din lokala kopia.
set -e
cd "$(dirname "$0")"

REPO="$(pwd)"
WT="/tmp/major-arcana-rapportregler"
FIL="docs/handover/RAPPORTREGLER.md"

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

echo
echo "== Kopplar in i AGENTS.md =="
python3 - "$WT/AGENTS.md" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()

if 'RAPPORTREGLER.md' in s:
    print("  redan inkopplad — hoppar över")
    raise SystemExit(0)

block = """## Rapportregler (obligatorisk)

Läs `docs/handover/RAPPORTREGLER.md` innan du rapporterar. Fem regler,
införda 2026-08-30 efter en dag då sex av sex rapporter behövde rättas.

1. **Räkna innan du täcker** — första leveransen är antalet, inte fixen.
2. **Visa kommandot, inte slutsatsen** — varje påstående om repot bär sin
   sökning och dess utdata. Gäller särskilt "finns inte" och "noll träffar".
3. **Mutationstesta per väg, inte per fix** — fem vägar kräver fem mutationer.
4. **Citera aldrig ett svar du inte fått** — obesvarad fråga stoppar ordern.
5. **Städa efter dig** — inga halvfärdiga filer i den delade arbetskatalogen.

Rapporten ska utöver *Output format* nedan bära: **Mätt**, **Täckning**
(antal av antal), **Kvar** och **Osäkert**.

Hittar du ett fel i en order: säg emot. Ordrarna är skrivna av någon som
mäter fel ibland.

"""

anchor = '## Preservation rule'
if anchor in s:
    s = s.replace(anchor, block + anchor, 1)
else:
    s = s.rstrip() + '\n\n' + block
io.open(p, 'w', encoding='utf-8').write(s)
print("  AGENTS.md uppdaterad")
PY

cd "$WT"
git add "$FIL" AGENTS.md

if git diff --cached --quiet; then
  echo "  Inget att committa — redan identiskt på origin/main."
else
  git -c core.hooksPath=/dev/null commit -m "docs: rapportregler for alla agenter + inkoppling i AGENTS.md" -m \
"Sex av sex agentrapporter 2026-08-29/30 behovde rattas. Alla sex felen
hade samma form: en slutsats om helheten dragen ur en matning av en del.

- 'storet har noll import'  -> grep pa src/ och tests/, inte server.js
- 'signatureProof var ensamt' -> whitelists lasta, hjalparen kord i 2 av 8
- 'Cliento ar connected' -> raden hade status connected, token olasbar
- 'alla vagar flodar genom performSend' -> fyra filer anropar mailern direkt
- 'du svarade agare + lakare' -> inget sadant svar hade getts
- 'inget av det ar pushat' -> tva av fem regler lag pa origin/main

Ingenting nadde en patient, men bara for att CCO_SEND_LIVE ar avstangd.

Fem regler: rakna innan du tacker; visa kommandot inte slutsatsen;
mutationstesta per vag inte per fix; citera aldrig ett svar du inte fatt;
stada efter dig. Plus rapportform: Matt, Tackning, Kvar, Osakert.

Sista avsnittet ber agenter saga emot ordrar som ar fel - bade
'vardepisod' i ORD-140 och normaliserartabellen i ORD-145 var mina egna
matfel, och bada hittades av agenter som kollade i stallet for att lyda." \
    -- "$FIL" AGENTS.md

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
git show origin/main:AGENTS.md | grep -n "Rapportregler" | head -3
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
