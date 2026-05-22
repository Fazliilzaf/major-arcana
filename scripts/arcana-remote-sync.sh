#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./arcana-remote-common.sh
source "${ROOT_DIR}/scripts/arcana-remote-common.sh"
# shellcheck source=./arcana-sync-common.sh
source "${ROOT_DIR}/scripts/arcana-sync-common.sh"

HOST="$(choose_remote_host || true)"

if [[ -z "${HOST}" ]]; then
  print_remote_unreachable
  exit 1
fi

ssh "${HOST}" "mkdir -p \"${ARCANA_REMOTE_REPO_PATH}\""

build_arcana_sync_args "${ROOT_DIR}"

rsync -az \
  --exclude ".DS_Store" \
  "${ARCANA_SYNC_ARGS[@]}" "${HOST}:${ARCANA_REMOTE_REPO_PATH}/"

printf 'Synkat till %s:%s\n' "${HOST}" "${ARCANA_REMOTE_REPO_PATH}"
