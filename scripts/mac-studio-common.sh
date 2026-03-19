#!/usr/bin/env bash
set -euo pipefail

ARCANA_MAC_STUDIO_USER="${ARCANA_MAC_STUDIO_USER:-fazlikrasniqi}"
ARCANA_MAC_STUDIO_REPO_PATH="${ARCANA_MAC_STUDIO_REPO_PATH:-/Users/${ARCANA_MAC_STUDIO_USER}/Desktop/Arcana}"
ARCANA_MAC_STUDIO_VNC_PORT="${ARCANA_MAC_STUDIO_VNC_PORT:-5900}"

is_running_on_mac_studio() {
  local hostname_short=""
  local computer_name=""

  hostname_short="$(hostname -s 2>/dev/null || hostname 2>/dev/null || true)"
  computer_name="$(scutil --get ComputerName 2>/dev/null || true)"

  case "${hostname_short}" in
    Mac-Studio-AI|macstudio-ai|macstudio)
      return 0
      ;;
  esac

  case "${computer_name}" in
    Mac-Studio-AI|Mac\ Studio*)
      return 0
      ;;
  esac

  return 1
}

resolve_ssh_hostname() {
  local host_alias="$1"
  ssh -G "${host_alias}" 2>/dev/null | awk '/^hostname /{print $2; exit}'
}

choose_mac_studio_host() {
  local candidates=()
  local host

  if [[ -n "${ARCANA_MAC_STUDIO_HOST:-}" ]]; then
    candidates=("${ARCANA_MAC_STUDIO_HOST}")
  else
    candidates=(macstudio-ai macstudio-tail)
  fi

  for host in "${candidates[@]}"; do
    if ssh -o BatchMode=yes -o ConnectTimeout=3 "${host}" "exit 0" >/dev/null 2>&1; then
      printf '%s\n' "${host}"
      return 0
    fi
  done

  return 1
}

resolve_mac_studio_address() {
  local host_alias

  host_alias="$(choose_mac_studio_host || true)"
  if [[ -z "${host_alias}" ]]; then
    return 1
  fi

  resolve_ssh_hostname "${host_alias}"
}

print_mac_studio_unreachable() {
  cat <<'EOF'
Kunde inte ansluta till Mac Studio via `macstudio-ai` eller `macstudio-tail`.

Kontrollera detta:
1. Mac Studio ar pa och inloggad.
2. Tailscale ar ansluten pa Mac Studio och pa den har datorn.
3. Om du ar hemma pa samma nat, prova lokaladressen `macstudio-ai`.
EOF
}

print_mac_studio_vnc_unreachable() {
  cat <<EOF
Skarmdelning svarar inte pa Mac Studio just nu.

Kontrollera detta:
1. Skarmdelning ar aktiverad pa Mac Studio.
2. Tailscale ar ansluten pa Mac Studio och pa den har datorn.
3. VNC-port ${ARCANA_MAC_STUDIO_VNC_PORT} svarar pa Mac Studios Tailscale-adress.
EOF
}

print_mac_studio_repo_missing() {
  cat <<EOF
Arcana finns inte pa Mac Studio i ${ARCANA_MAC_STUDIO_REPO_PATH}.

Kor detta pa Mac Studio en gang:
  git clone https://github.com/Fazliilzaf/Arcana.git "${ARCANA_MAC_STUDIO_REPO_PATH}"
  cd "${ARCANA_MAC_STUDIO_REPO_PATH}"
  npm ci
EOF
}
