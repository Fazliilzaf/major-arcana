#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./imac-env.sh
source "${ROOT_DIR}/scripts/imac-env.sh"
# shellcheck source=./arcana-remote-common.sh
source "${ROOT_DIR}/scripts/arcana-remote-common.sh"

HOST="$(choose_remote_host || true)"

if [[ -z "${HOST}" ]]; then
  print_remote_unreachable
  exit 1
fi

exec bash "${ROOT_DIR}/scripts/sync-codex-state-remote.sh" "${HOST}"
