#!/usr/bin/env bash
set -euo pipefail

ARCANA_REMOTE_NAME="${ARCANA_REMOTE_NAME:-Remote Mac}"
ARCANA_REMOTE_HOSTS="${ARCANA_REMOTE_HOSTS:-}"
ARCANA_REMOTE_HOST_LABEL="${ARCANA_REMOTE_HOST_LABEL:-${ARCANA_REMOTE_HOSTS}}"
ARCANA_REMOTE_REPO_PATH="${ARCANA_REMOTE_REPO_PATH:-/Users/${USER}/Desktop/Arcana}"
ARCANA_REMOTE_VNC_PORT="${ARCANA_REMOTE_VNC_PORT:-5900}"
ARCANA_REMOTE_PROMPT="${ARCANA_REMOTE_PROMPT:-remote}"

resolve_ssh_hostname() {
  local host_alias="$1"
  ssh -G "${host_alias}" 2>/dev/null | awk '/^hostname /{print $2; exit}'
}

first_remote_host() {
  local candidates=()

  if [[ -n "${ARCANA_REMOTE_HOST:-}" ]]; then
    printf '%s\n' "${ARCANA_REMOTE_HOST}"
    return 0
  fi

  if [[ -n "${ARCANA_REMOTE_HOSTS}" ]]; then
    read -r -a candidates <<< "${ARCANA_REMOTE_HOSTS}"
    if [[ "${#candidates[@]}" -gt 0 ]]; then
      printf '%s\n' "${candidates[0]}"
      return 0
    fi
  fi

  return 1
}

choose_remote_host() {
  local candidates=()
  local host

  if [[ -n "${ARCANA_REMOTE_HOST:-}" ]]; then
    candidates=("${ARCANA_REMOTE_HOST}")
  elif [[ -n "${ARCANA_REMOTE_HOSTS}" ]]; then
    read -r -a candidates <<< "${ARCANA_REMOTE_HOSTS}"
  fi

  for host in "${candidates[@]}"; do
    if ssh -o BatchMode=yes -o ConnectTimeout=3 "${host}" "exit 0" >/dev/null 2>&1; then
      printf '%s\n' "${host}"
      return 0
    fi
  done

  return 1
}

resolve_remote_address() {
  local host_alias

  host_alias="$(choose_remote_host || true)"
  if [[ -z "${host_alias}" ]]; then
    host_alias="$(first_remote_host || true)"
  fi

  if [[ -z "${host_alias}" ]]; then
    return 1
  fi

  resolve_ssh_hostname "${host_alias}"
}

print_remote_unreachable() {
  cat <<EOF
Kunde inte ansluta till ${ARCANA_REMOTE_NAME} via \`${ARCANA_REMOTE_HOST_LABEL}\`.

Kontrollera detta:
1. ${ARCANA_REMOTE_NAME} ar pa och inloggad.
2. Tailscale ar ansluten pa ${ARCANA_REMOTE_NAME} och pa den har datorn.
3. SSH-nyckel eller inloggning ar upplagd for ${ARCANA_REMOTE_NAME}.
EOF
}

print_remote_vnc_unreachable() {
  cat <<EOF
Skarmdelning svarar inte pa ${ARCANA_REMOTE_NAME} just nu.

Kontrollera detta:
1. Skarmdelning ar aktiverad pa ${ARCANA_REMOTE_NAME}.
2. Tailscale ar ansluten pa ${ARCANA_REMOTE_NAME} och pa den har datorn.
3. VNC-port ${ARCANA_REMOTE_VNC_PORT} svarar pa ${ARCANA_REMOTE_NAME}s Tailscale-adress.
EOF
}

print_remote_repo_missing() {
  cat <<EOF
Arcana finns inte pa ${ARCANA_REMOTE_NAME} i ${ARCANA_REMOTE_REPO_PATH}.

Kor detta pa ${ARCANA_REMOTE_NAME} en gang:
  git clone https://github.com/Fazliilzaf/Arcana.git "${ARCANA_REMOTE_REPO_PATH}"
  cd "${ARCANA_REMOTE_REPO_PATH}"
  npm ci
EOF
}
