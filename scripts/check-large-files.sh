#!/usr/bin/env bash
set -euo pipefail

MAX_MB="${MAX_MB:-95}"
MAX_BYTES="$((MAX_MB * 1024 * 1024))"

size_of_file() {
  local file="$1"
  if stat -f%z "$file" >/dev/null 2>&1; then
    stat -f%z "$file"
  else
    stat -c%s "$file"
  fi
}

echo "== Git Large File Check =="
echo "Threshold: ${MAX_MB} MB"
echo

FAILED=0

echo "1) Working tree tracked files"
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  bytes="$(size_of_file "$file")"
  if [[ "$bytes" -ge "$MAX_BYTES" ]]; then
    mb="$(node -e "process.stdout.write((Number(process.argv[1])/1024/1024).toFixed(2))" "$bytes")"
    echo "❌ För stor fil i working tree: ${file} (${mb} MB)"
    FAILED=1
  fi
done < <(git ls-files)

echo
echo "2) Git history blobs"
HISTORY_HITS="$(
  git rev-list --objects --all \
    | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
    | awk -v max="$MAX_BYTES" '$1=="blob" && $3>=max {print $0}'
)"

if [[ -n "$HISTORY_HITS" ]]; then
  echo "❌ För stora blob-objekt hittades i Git-historik:"
  printf '%s\n' "$HISTORY_HITS" | while IFS= read -r line; do
    obj="$(printf '%s' "$line" | awk '{print $2}')"
    bytes="$(printf '%s' "$line" | awk '{print $3}')"
    path="$(printf '%s' "$line" | cut -d' ' -f4-)"
    mb="$(node -e "process.stdout.write((Number(process.argv[1])/1024/1024).toFixed(2))" "$bytes")"
    echo "   - ${path:-<okänd-path>} (${mb} MB) [${obj}]"
  done
  FAILED=1
fi

if [[ "$FAILED" -eq 1 ]]; then
  echo
  echo "Åtgärd:"
  echo "- Flytta stora råfiler utanför repo (t.ex. mail-exports/)."
  echo "- Om blob redan finns i historik: rensa historiken innan push."
  exit 1
fi

echo "✅ Inga stora filer hittades över ${MAX_MB} MB."
