#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./mac-studio-common.sh
source "${ROOT_DIR}/scripts/mac-studio-common.sh"
# shellcheck source=./arcana-sync-common.sh
source "${ROOT_DIR}/scripts/arcana-sync-common.sh"

if is_running_on_mac_studio; then
  printf 'Redan pa Mac Studio i %s\n' "${ARCANA_MAC_STUDIO_REPO_PATH}"
  exit 0
fi

HOST="$(choose_mac_studio_host || true)"

if [[ -z "${HOST}" ]]; then
  print_mac_studio_unreachable
  exit 1
fi

ssh "${HOST}" "mkdir -p \"${ARCANA_MAC_STUDIO_REPO_PATH}\""

build_arcana_sync_args "${ROOT_DIR}"

rsync -az \
  --exclude ".DS_Store" \
  "${ARCANA_SYNC_ARGS[@]}" "${HOST}:${ARCANA_MAC_STUDIO_REPO_PATH}/"

printf 'Synkat till %s:%s\n' "${HOST}" "${ARCANA_MAC_STUDIO_REPO_PATH}"
