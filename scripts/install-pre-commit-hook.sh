#!/usr/bin/env bash
# Fas 28-C: installerar pre-commit hook som varnar om bundle är stale.
#
# Användning (engång efter clone):
#   bash scripts/install-pre-commit-hook.sh
#
# Hook varnar (men blockerar INTE) om bundle-source-filer ändrats efter
# senaste npm run build:bundle. Render bygger ändå automatiskt vid deploy
# så detta är bara för lokal dev-confidence.
#
# Avinstallera: rm .git/hooks/pre-commit
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="$REPO_ROOT/.git/hooks"
HOOK_PATH="$HOOK_DIR/pre-commit"

if [ ! -d "$HOOK_DIR" ]; then
  echo "FEL: $HOOK_DIR finns inte. Är detta ett git-repo?"
  exit 1
fi

cat > "$HOOK_PATH" <<'HOOK'
#!/usr/bin/env bash
# Auto-installerat av scripts/install-pre-commit-hook.sh (Fas 28-C)
# Varnar om bundle är stale. Blockerar INTE commit.
REPO_ROOT="$(git rev-parse --show-toplevel)"
if [ -f "$REPO_ROOT/bin/check-bundle-fresh.js" ]; then
  cd "$REPO_ROOT"
  if ! node bin/check-bundle-fresh.js --quiet; then
    echo ""
    echo "(Varning ovan — commit fortsätter ändå. Kör 'npm run build:bundle' om du vill testa lokalt.)"
    echo ""
  fi
fi
exit 0
HOOK

chmod +x "$HOOK_PATH"
echo "✓ Pre-commit hook installerad: $HOOK_PATH"
echo ""
echo "Hook varnar nu om bundle är stale vid commit."
echo "Det blockerar INTE commit — bara informerar."
echo ""
echo "Avinstallera: rm $HOOK_PATH"
