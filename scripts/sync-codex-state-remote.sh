#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${1:-}"
REMOTE_CODEX_HOME="${2:-~/.codex}"
LOCAL_CODEX_HOME="${HOME}/.codex"
ARCHIVED_SESSION_LIMIT="${ARCANA_CODEX_ARCHIVED_SESSION_LIMIT:-20}"
ARCHIVED_SESSION_MAX_BYTES="${ARCANA_CODEX_ARCHIVED_SESSION_MAX_BYTES:-262144000}"
SYNC_SESSION_DIR="${ARCANA_CODEX_SYNC_SESSION_DIR:-false}"

if [[ -z "${REMOTE_HOST}" ]]; then
  printf 'Ange remote host, till exempel: bash ./scripts/sync-codex-state-remote.sh imac-ai\n' >&2
  exit 1
fi

if [[ ! -d "${LOCAL_CODEX_HOME}" ]]; then
  printf 'Lokal Codex-state saknas i %s\n' "${LOCAL_CODEX_HOME}" >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

copy_file_if_present() {
  local source_path="$1"
  local remote_path="$2"

  if [[ -f "${source_path}" ]]; then
    rsync -az "${source_path}" "${REMOTE_HOST}:${remote_path}"
  fi
}

sync_dir_if_present() {
  local source_path="$1"
  local remote_path="$2"

  if [[ -d "${source_path}" ]]; then
    rsync -az --delete "${source_path}/" "${REMOTE_HOST}:${remote_path}/"
  fi
}

stage_recent_archived_sessions() {
  local source_dir="$1"
  local staged_dir="$2"
  local session_file

  mkdir -p "${staged_dir}"

  if [[ ! -d "${source_dir}" ]]; then
    return 0
  fi

  while IFS= read -r session_file; do
    cp "${session_file}" "${staged_dir}/$(basename "${session_file}")"
  done < <(
    find "${source_dir}" -maxdepth 1 -type f -exec stat -f '%m %z %N' {} + \
      | sort -rn \
      | awk -v max_bytes="${ARCHIVED_SESSION_MAX_BYTES}" '
          max_bytes <= 0 || $2 <= max_bytes {
            $1 = ""
            $2 = ""
            sub(/^  */, "")
            print
          }
        ' \
      | head -n "${ARCHIVED_SESSION_LIMIT}" \
  )
}

printf 'Skapar konsekvent backup av Codex-state...\n'
if [[ -f "${LOCAL_CODEX_HOME}/state_5.sqlite" ]]; then
  sqlite3 "${LOCAL_CODEX_HOME}/state_5.sqlite" ".backup '${TEMP_DIR}/state_5.sqlite'"
fi

printf 'Forbereder remote Codex-katalog...\n'
ssh "${REMOTE_HOST}" "mkdir -p \"${REMOTE_CODEX_HOME}\" \"${REMOTE_CODEX_HOME}/archived_sessions\" \"${REMOTE_CODEX_HOME}/sessions\" \"${REMOTE_CODEX_HOME}/shell_snapshots\" \"${REMOTE_CODEX_HOME}/memories\" \"${REMOTE_CODEX_HOME}/sqlite\""

printf 'Synkar Codex metadata...\n'
copy_file_if_present "${LOCAL_CODEX_HOME}/config.toml" "${REMOTE_CODEX_HOME}/config.toml"
copy_file_if_present "${LOCAL_CODEX_HOME}/.credentials.json" "${REMOTE_CODEX_HOME}/.credentials.json"
copy_file_if_present "${LOCAL_CODEX_HOME}/auth.json" "${REMOTE_CODEX_HOME}/auth.json"
copy_file_if_present "${LOCAL_CODEX_HOME}/.codex-global-state.json" "${REMOTE_CODEX_HOME}/.codex-global-state.json"
copy_file_if_present "${LOCAL_CODEX_HOME}/models_cache.json" "${REMOTE_CODEX_HOME}/models_cache.json"
copy_file_if_present "${LOCAL_CODEX_HOME}/session_index.jsonl" "${REMOTE_CODEX_HOME}/session_index.jsonl"
copy_file_if_present "${LOCAL_CODEX_HOME}/version.json" "${REMOTE_CODEX_HOME}/version.json"
copy_file_if_present "${LOCAL_CODEX_HOME}/.personality_migration" "${REMOTE_CODEX_HOME}/.personality_migration"

printf 'Synkar Codex-historik...\n'
sync_dir_if_present "${LOCAL_CODEX_HOME}/shell_snapshots" "${REMOTE_CODEX_HOME}/shell_snapshots"
sync_dir_if_present "${LOCAL_CODEX_HOME}/memories" "${REMOTE_CODEX_HOME}/memories"
sync_dir_if_present "${LOCAL_CODEX_HOME}/sqlite" "${REMOTE_CODEX_HOME}/sqlite"
if [[ "${SYNC_SESSION_DIR}" == "true" ]]; then
  sync_dir_if_present "${LOCAL_CODEX_HOME}/sessions" "${REMOTE_CODEX_HOME}/sessions"
fi
stage_recent_archived_sessions "${LOCAL_CODEX_HOME}/archived_sessions" "${TEMP_DIR}/archived_sessions"
sync_dir_if_present "${TEMP_DIR}/archived_sessions" "${REMOTE_CODEX_HOME}/archived_sessions"

if [[ -f "${TEMP_DIR}/state_5.sqlite" ]]; then
  printf 'Synkar Codex-databas...\n'
  rsync -az "${TEMP_DIR}/state_5.sqlite" "${REMOTE_HOST}:${REMOTE_CODEX_HOME}/state_5.sqlite"
  ssh "${REMOTE_HOST}" "rm -f \"${REMOTE_CODEX_HOME}/state_5.sqlite-wal\" \"${REMOTE_CODEX_HOME}/state_5.sqlite-shm\""
fi

printf 'Laser Codex-filer pa remote...\n'
ssh "${REMOTE_HOST}" "chmod 600 \"${REMOTE_CODEX_HOME}/config.toml\" \"${REMOTE_CODEX_HOME}/.credentials.json\" \"${REMOTE_CODEX_HOME}/auth.json\" 2>/dev/null || true"

printf 'Codex-state synkad till %s:%s\n' "${REMOTE_HOST}" "${REMOTE_CODEX_HOME}"
