#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./mac-studio-common.sh
source "${ROOT_DIR}/scripts/mac-studio-common.sh"

HOST_ALIAS="$(choose_mac_studio_host || true)"
HOST_ADDRESS="$(resolve_mac_studio_address || true)"

if [[ -z "${HOST_ALIAS}" || -z "${HOST_ADDRESS}" ]]; then
  print_mac_studio_unreachable
  exit 1
fi

printf 'Startar skarmdelning till Mac Studio...\n'
printf 'SSH alias: %s\n' "${HOST_ALIAS}"
printf 'VNC-adress: %s:%s\n' "${HOST_ADDRESS}" "${ARCANA_MAC_STUDIO_VNC_PORT}"

if ! nc -G 3 -z "${HOST_ADDRESS}" "${ARCANA_MAC_STUDIO_VNC_PORT}" >/dev/null 2>&1; then
  print_mac_studio_vnc_unreachable
  exit 1
fi

exec open "vnc://${HOST_ADDRESS}:${ARCANA_MAC_STUDIO_VNC_PORT}"

