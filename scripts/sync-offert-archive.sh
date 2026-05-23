#!/usr/bin/env bash
# Kopiera + extrahera Offertmallar.zip till ~/Code/MA-Archive/offert-word/
# Källa: iCloud Journal-mapp (Drive-export) eller explicit OFFERT_ZIP_SRC.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
ARCHIVE="$WORKSPACE_ROOT/MA-Archive"
ZIP_DIR="$ARCHIVE/journal-zips"
OUT_DIR="$ARCHIVE/offert-word"
DEFAULT_SRC="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Journal system CCO- Booking Hair TP Clinic/Offertmallar-20260521T215140Z-3-001.zip"
ZIP_SRC="${OFFERT_ZIP_SRC:-$DEFAULT_SRC}"
ZIP_NAME="$(basename "$ZIP_SRC")"
ZIP_DEST="$ZIP_DIR/$ZIP_NAME"

fail() { echo "❌ $1" >&2; exit 1; }

[[ -f "$ZIP_SRC" ]] || fail "Saknar zip: $ZIP_SRC (sätt OFFERT_ZIP_SRC eller ladda om från Drive)"

mkdir -p "$ZIP_DIR" "$OUT_DIR"
cp -c "$ZIP_SRC" "$ZIP_DEST"
unzip -t "$ZIP_DEST" >/dev/null || fail "Zip ogiltig: $ZIP_DEST"

count="$(python3 - "$ZIP_DEST" "$OUT_DIR" <<'PY'
import shutil, sys, zipfile
from pathlib import Path

zip_path = Path(sys.argv[1])
dest = Path(sys.argv[2])
extract_root = dest / "Offertmallar"
if extract_root.exists():
    shutil.rmtree(extract_root)

def decode_name(raw: str) -> str:
    try:
        return raw.encode("cp437").decode("utf-8")
    except Exception:
        return raw.replace("+?", "ä")

with zipfile.ZipFile(zip_path) as zf:
    for info in zf.infolist():
        name = decode_name(info.filename)
        if name.endswith("/"):
            continue
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, open(target, "wb") as out:
            shutil.copyfileobj(src, out)

count = len(list(extract_root.rglob("*.docx")))
print(count)
if count != 14:
    raise SystemExit(f"expected 14 docx, got {count}")
PY
)"

ln -sf "../journal-zips/$ZIP_NAME" "$OUT_DIR/Offertmallar.zip"
echo "✅ Offertmallar: $ZIP_DEST → $OUT_DIR/Offertmallar/ ($count docx)"
