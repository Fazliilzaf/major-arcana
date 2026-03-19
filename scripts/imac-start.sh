#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT_DIR}"

printf 'Synkar Arcana till iMac...\n'
bash "${ROOT_DIR}/scripts/imac-sync.sh"

printf 'Startar Codex pa iMac...\n'
exec bash "${ROOT_DIR}/scripts/imac-remote.sh" codex
