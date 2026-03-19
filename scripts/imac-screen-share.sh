#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./imac-env.sh
source "${ROOT_DIR}/scripts/imac-env.sh"
# shellcheck source=./arcana-remote-common.sh
source "${ROOT_DIR}/scripts/arcana-remote-common.sh"

HOST_ADDRESS="$(resolve_remote_address || true)"

if [[ -z "${HOST_ADDRESS}" ]]; then
  print_remote_unreachable
  exit 1
fi

if ! nc -G 3 -z "${HOST_ADDRESS}" "${ARCANA_REMOTE_VNC_PORT}" >/dev/null 2>&1; then
  print_remote_vnc_unreachable
  exit 1
fi

open "vnc://${HOST_ADDRESS}:${ARCANA_REMOTE_VNC_PORT}"
