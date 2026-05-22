#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./imac-env.sh
source "${ROOT_DIR}/scripts/imac-env.sh"

PRIMARY_HOST="${ARCANA_BOOTSTRAP_REMOTE_HOST:-imac-ai}"

exec bash "${ROOT_DIR}/scripts/bootstrap-remote-apple-client.sh" "${PRIMARY_HOST}"
