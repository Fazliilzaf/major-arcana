#!/bin/bash
# ORD-132 · Pusha kortbredden 340 -> 460 px.
# Committen 7e992f09 är redan tagen. Det enda som återstår är push —
# sandlådan har inga GitHub-uppgifter, därför denna fil.
# Dubbelklicka i Finder.
cd "$(dirname "$0")" || exit 1

echo "== Städar övergivna lås (sandlådan får inte ta bort dem) =="
rm -f .git/*.lock .git/next-index-*.lock.lock .git/_probe_* .git/objects/_probe_*

echo
echo "== Läge före push =="
git status -sb | head -1
git log --oneline -1

echo
echo "== Pushar =="
git push origin main || exit 1

echo
echo "KLART."
git log --oneline -1
echo
read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
