#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./arcana-sync-common.sh
source "${ROOT_DIR}/scripts/arcana-sync-common.sh"
REMOTE_HOST="${1:-${ARCANA_BOOTSTRAP_REMOTE_HOST:-}}"
REMOTE_USER="${ARCANA_BOOTSTRAP_REMOTE_USER:-}"

if [[ -n "${ARCANA_BOOTSTRAP_REMOTE_REPO_PATH:-}" ]]; then
  REMOTE_REPO_PATH="${ARCANA_BOOTSTRAP_REMOTE_REPO_PATH}"
elif [[ -n "${REMOTE_USER}" ]]; then
  REMOTE_REPO_PATH="/Users/${REMOTE_USER}/Desktop/Arcana"
else
  REMOTE_REPO_PATH="/Users/${USER}/Desktop/Arcana"
fi

copy_file_if_present() {
  local source_path="$1"
  local remote_path="$2"

  if [[ ! -f "${source_path}" ]]; then
    return 0
  fi

  scp "${source_path}" "${REMOTE_HOST}:${remote_path}" >/dev/null
}

detect_local_codex_app() {
  if [[ -d "/Applications/Codex.app" ]]; then
    printf '%s\n' "/Applications/Codex.app"
    return 0
  fi

  if [[ -d "${HOME}/Applications/Codex.app" ]]; then
    printf '%s\n' "${HOME}/Applications/Codex.app"
    return 0
  fi

  return 1
}

sync_codex_app_if_present() {
  local local_codex_app=""
  local remote_codex_target=""
  local remote_codex_setup=""

  local_codex_app="$(detect_local_codex_app || true)"
  if [[ -z "${local_codex_app}" ]]; then
    return 0
  fi

  if ssh -o BatchMode=yes -o ConnectTimeout=5 "${REMOTE_HOST}" "test -w /Applications" >/dev/null 2>&1; then
    remote_codex_target="/Applications/Codex.app/"
    remote_codex_setup='mkdir -p /Applications && rm -rf /Applications/Codex.app'
  else
    remote_codex_target='~/Applications/Codex.app/'
    remote_codex_setup='mkdir -p "$HOME/Applications" && rm -rf "$HOME/Applications/Codex.app"'
  fi

  printf 'Synkar Codex.app...\n'
  ssh "${REMOTE_HOST}" "${remote_codex_setup}"
  rsync -az --delete "${local_codex_app}/" "${REMOTE_HOST}:${remote_codex_target}"
}

if [[ -z "${REMOTE_HOST}" ]]; then
  printf 'Ange remote host, till exempel: bash ./scripts/bootstrap-remote-apple-client.sh imac-ai\n' >&2
  exit 1
fi

if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "${REMOTE_HOST}" "exit 0" >/dev/null 2>&1; then
  printf 'Kan inte ansluta till %s med SSH utan manuell inloggning.\n' "${REMOTE_HOST}" >&2
  printf 'Lagg in SSH-nyckeln eller logga in en gang manuellt och kor sedan scriptet igen.\n' >&2
  exit 1
fi

printf 'Forbereder %s...\n' "${REMOTE_HOST}"
ssh "${REMOTE_HOST}" "mkdir -p \"\$HOME/.codex\" \"\$HOME/.ssh\" \"$(dirname "${REMOTE_REPO_PATH}")\"; \
  if [ -d \"${REMOTE_REPO_PATH}\" ] && [ ! -d \"${REMOTE_REPO_PATH}/.git\" ] && [ -n \"\$(ls -A \"${REMOTE_REPO_PATH}\" 2>/dev/null)\" ]; then \
    mv \"${REMOTE_REPO_PATH}\" \"${REMOTE_REPO_PATH}.prebootstrap-\$(date +%Y%m%d%H%M%S)\"; \
  fi; \
  if [ ! -d \"${REMOTE_REPO_PATH}/.git\" ]; then \
    git clone https://github.com/Fazliilzaf/Arcana.git \"${REMOTE_REPO_PATH}\" >/dev/null 2>&1 || mkdir -p \"${REMOTE_REPO_PATH}\"; \
  fi"

printf 'Synkar Arcana...\n'
build_arcana_sync_args "${ROOT_DIR}"

rsync -az \
  --exclude ".DS_Store" \
  "${ARCANA_SYNC_ARGS[@]}" "${REMOTE_HOST}:${REMOTE_REPO_PATH}/"

sync_codex_app_if_present

printf 'Synkar Codex-state...\n'
bash "${ROOT_DIR}/scripts/sync-codex-state-remote.sh" "${REMOTE_HOST}"

printf 'Synkar SSH-konfig...\n'
copy_file_if_present "${HOME}/.ssh/config" "~/.ssh/config"
copy_file_if_present "${HOME}/.ssh/known_hosts" "~/.ssh/known_hosts"
copy_file_if_present "${HOME}/.ssh/id_arcana_macstudio" "~/.ssh/id_arcana_macstudio"
copy_file_if_present "${HOME}/.ssh/id_arcana_macstudio.pub" "~/.ssh/id_arcana_macstudio.pub"

printf 'Korar bootstrap pa remote Mac...\n'
ssh -t "${REMOTE_HOST}" "chmod 700 \"\$HOME/.ssh\" && chmod 600 \"\$HOME/.ssh/config\" \"\$HOME/.ssh/known_hosts\" \"\$HOME/.ssh/id_arcana_macstudio\" \"\$HOME/.codex/config.toml\" \"\$HOME/.codex/.credentials.json\" \"\$HOME/.codex/auth.json\" 2>/dev/null || true; chmod 644 \"\$HOME/.ssh/id_arcana_macstudio.pub\" 2>/dev/null || true; cd \"${REMOTE_REPO_PATH}\" && bash ./scripts/bootstrap-apple-workstation.sh"
