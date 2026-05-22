#!/usr/bin/env bash
set -euo pipefail

ARCANA_IMAC_USER="${ARCANA_IMAC_USER:-hairtpclinic}"
ARCANA_IMAC_REPO_PATH="${ARCANA_IMAC_REPO_PATH:-/Users/${ARCANA_IMAC_USER}/Desktop/Arcana}"
ARCANA_IMAC_VNC_PORT="${ARCANA_IMAC_VNC_PORT:-5900}"
ARCANA_IMAC_TAILSCALE_HOST="${ARCANA_IMAC_TAILSCALE_HOST:-}"

if [[ -z "${ARCANA_IMAC_TAILSCALE_HOST}" ]] && command -v tailscale >/dev/null 2>&1; then
  ARCANA_IMAC_TAILSCALE_HOST="$(tailscale status 2>/dev/null | awk '
    $2 ~ /^imac-som-tillhr-hair/ && $0 !~ /offline/ { print $2; found = 1; exit }
    END { if (!found) exit 0 }
  ')"

  if [[ -z "${ARCANA_IMAC_TAILSCALE_HOST}" ]]; then
    ARCANA_IMAC_TAILSCALE_HOST="$(tailscale status 2>/dev/null | awk '
      $2 ~ /^imac-som-tillhr-hair/ { print $2; exit }
    ')"
  fi
fi

export ARCANA_REMOTE_NAME="iMac"
export ARCANA_REMOTE_HOSTS="${ARCANA_REMOTE_HOSTS:-imac-ai ${ARCANA_IMAC_TAILSCALE_HOST} imac-som-tillhr-hair-1 imac-som-tillhr-hair}"
export ARCANA_REMOTE_HOST_LABEL="${ARCANA_REMOTE_HOST_LABEL:-imac-ai eller aktiv imac-som-tillhr-hair-nod}"
export ARCANA_REMOTE_REPO_PATH="${ARCANA_REMOTE_REPO_PATH:-${ARCANA_IMAC_REPO_PATH}}"
export ARCANA_REMOTE_VNC_PORT="${ARCANA_REMOTE_VNC_PORT:-${ARCANA_IMAC_VNC_PORT}}"
export ARCANA_REMOTE_PROMPT="${ARCANA_REMOTE_PROMPT:-imac}"
export ARCANA_LOCAL_COMMANDS="${ARCANA_LOCAL_COMMANDS:-arcana-imac-shell arcana-imac-studio arcana-imac-doctor arcana-imac-share arcana-imac-bootstrap}"
export ARCANA_BOOTSTRAP_REMOTE_USER="${ARCANA_BOOTSTRAP_REMOTE_USER:-${ARCANA_IMAC_USER}}"
export ARCANA_BOOTSTRAP_REMOTE_REPO_PATH="${ARCANA_BOOTSTRAP_REMOTE_REPO_PATH:-${ARCANA_IMAC_REPO_PATH}}"
