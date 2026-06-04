#!/usr/bin/env bash
# Remove iCloud conflict copies: "file 2.ext", "file 3.ext", …
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd)"
DRY="${DRY_RUN:-0}"
removed=0

while IFS= read -r -d '' dup; do
  [[ "$dup" == *"/.git/"* ]] && continue
  [[ "$dup" == *"/.git.icloud-corrupt.bak/"* ]] && continue
  base="$(basename "$dup")"
  [[ "$base" =~ ^(.+)\ [0-9]+\.([^.]+)$ ]] || continue
  if [[ "$DRY" == "1" ]]; then
    echo "would remove: $dup"
  else
    rm -f "$dup"
  fi
  removed=$((removed + 1))
done < <(find "$ROOT" -type f \( -name '* [0-9].*' -o -name '* [0-9][0-9].*' \) -print0 2>/dev/null)

echo "clean-icloud-duplicates: removed=$removed root=$ROOT dry=$DRY"
