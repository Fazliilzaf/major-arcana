#!/bin/bash
# Pushar de två V13-commitsen till origin/main.
# Kör med din Mac:s egna GitHub-inloggning (nyckelringen).
cd "$(dirname "$0")" || exit 1
echo "== Läge före push =="
git status -sb | head -1
git log --oneline -3
echo
echo "== Pushar main -> origin =="
git push origin main
echo
echo "== Läge efter =="
git status -sb | head -1
echo
echo "Klart. Stäng fönstret."
