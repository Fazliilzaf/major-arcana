#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./mac-studio-common.sh
source "${ROOT_DIR}/scripts/mac-studio-common.sh"

cd "${ROOT_DIR}"

if is_running_on_mac_studio; then
  printf 'Redan pa Mac Studio. Hoppar over sync.\n'
  exec bash "${ROOT_DIR}/scripts/mac-studio-remote.sh" codex
fi

printf 'Synkar Arcana till Mac Studio...\n'
bash "${ROOT_DIR}/scripts/mac-studio-sync.sh"

printf 'Startar Codex pa Mac Studio...\n'
exec bash "${ROOT_DIR}/scripts/mac-studio-remote.sh" codex
