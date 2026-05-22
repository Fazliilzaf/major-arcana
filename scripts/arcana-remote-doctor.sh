#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./arcana-remote-common.sh
source "${ROOT_DIR}/scripts/arcana-remote-common.sh"

status=0

ok() {
  printf 'OK   %s\n' "$1"
}

warn() {
  printf 'WARN %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1"
  status=1
}

require_local_command() {
  local name="$1"
  local path_value
  path_value="$(command -v "${name}" 2>/dev/null || true)"
  if [[ -n "${path_value}" ]]; then
    ok "lokalt kommando finns: ${name} -> ${path_value}"
  else
    fail "lokalt kommando saknas: ${name}"
  fi
}

printf 'Arcana Doctor: %s\n' "${ARCANA_REMOTE_NAME}"
printf 'Repo: %s\n\n' "${ROOT_DIR}"

if [[ -n "${ARCANA_LOCAL_COMMANDS:-}" ]]; then
  for name in ${ARCANA_LOCAL_COMMANDS}; do
    require_local_command "${name}"
  done
fi

HOST_ALIAS="$(choose_remote_host || true)"
HOST_ADDRESS="$(resolve_remote_address || true)"

if [[ -z "${HOST_ALIAS}" ]]; then
  fail "${ARCANA_REMOTE_NAME} SSH alias svarar inte"
  print_remote_unreachable
  exit "${status}"
fi

ok "${ARCANA_REMOTE_NAME} SSH alias svarar: ${HOST_ALIAS}"

if [[ -n "${HOST_ADDRESS}" ]]; then
  ok "${ARCANA_REMOTE_NAME} host address: ${HOST_ADDRESS}"
else
  fail "kunde inte losa host address via ssh -G"
fi

if [[ -n "${HOST_ADDRESS}" ]] && nc -G 3 -z "${HOST_ADDRESS}" "${ARCANA_REMOTE_VNC_PORT}" >/dev/null 2>&1; then
  ok "VNC-port svarar pa ${HOST_ADDRESS}:${ARCANA_REMOTE_VNC_PORT}"
else
  fail "VNC-port svarar inte pa ${HOST_ADDRESS}:${ARCANA_REMOTE_VNC_PORT}"
fi

REMOTE_BOOTSTRAP='if [ -f "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile" >/dev/null 2>&1 || true; fi; if [ -f "$HOME/.zprofile" ]; then . "$HOME/.zprofile" >/dev/null 2>&1 || true; fi; if [ -f "$HOME/.zshrc" ]; then . "$HOME/.zshrc" >/dev/null 2>&1 || true; fi'
REMOTE_REPORT="$(${ROOT_DIR}/scripts/arcana-remote.sh shell-check 2>/dev/null || true)"

if [[ -n "${REMOTE_REPORT}" ]]; then
  ok "remote shell-check svarade"
  printf '%s\n' "${REMOTE_REPORT}"
else
  warn "remote shell-check gav ingen rapport"
fi

REMOTE_STATUS="$(ssh -o BatchMode=yes -o ConnectTimeout=5 "${HOST_ALIAS}" "${REMOTE_BOOTSTRAP}; \
  repo_ok=no; [ -f \"${ARCANA_REMOTE_REPO_PATH}/package.json\" ] && repo_ok=yes; \
  node_path=\$(command -v node 2>/dev/null || true); \
  codex_path=\$(command -v codex 2>/dev/null || true); \
  if [ -z \"\${codex_path}\" ] && [ -x /Applications/Codex.app/Contents/Resources/codex ]; then codex_path=/Applications/Codex.app/Contents/Resources/codex; fi; \
  if [ -z \"\${codex_path}\" ] && [ -x \"\$HOME/Applications/Codex.app/Contents/Resources/codex\" ]; then codex_path=\"\$HOME/Applications/Codex.app/Contents/Resources/codex\"; fi; \
  printf 'repo_ok=%s\nnode_path=%s\ncodex_path=%s\n' \"\${repo_ok}\" \"\${node_path}\" \"\${codex_path}\"" 2>/dev/null || true)"

if printf '%s\n' "${REMOTE_STATUS}" | grep -q '^repo_ok=yes$'; then
  ok "Arcana-repot finns pa ${ARCANA_REMOTE_NAME}"
else
  fail "Arcana-repot saknas pa ${ARCANA_REMOTE_NAME}"
fi

REMOTE_NODE_PATH="$(printf '%s\n' "${REMOTE_STATUS}" | awk -F= '/^node_path=/{print $2; exit}')"
if [[ -n "${REMOTE_NODE_PATH}" ]]; then
  ok "remote node finns: ${REMOTE_NODE_PATH}"
else
  fail "remote node saknas i PATH"
fi

REMOTE_CODEX_PATH="$(printf '%s\n' "${REMOTE_STATUS}" | awk -F= '/^codex_path=/{print $2; exit}')"
if [[ -n "${REMOTE_CODEX_PATH}" ]]; then
  ok "remote codex finns: ${REMOTE_CODEX_PATH}"
else
  fail "remote codex saknas"
fi

exit "${status}"
