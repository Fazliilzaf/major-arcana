#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./imac-env.sh
source "${ROOT_DIR}/scripts/imac-env.sh"

exec bash "${ROOT_DIR}/scripts/arcana-remote-doctor.sh"
