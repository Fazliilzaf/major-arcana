#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/vendor/cconext-upstream/dist"
TARGET_DIR="$ROOT_DIR/public/cco-next-release"

if [[ ! -f "$SOURCE_DIR/index.html" ]]; then
  echo "CCO-next build saknas i $SOURCE_DIR" >&2
  exit 1
fi

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -R "$SOURCE_DIR"/. "$TARGET_DIR"/
find "$TARGET_DIR" -type f -name '*.map' -delete

echo "Synkade CCO-next release snapshot till $TARGET_DIR"
