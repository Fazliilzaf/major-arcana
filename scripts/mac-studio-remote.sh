#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./mac-studio-common.sh
source "${ROOT_DIR}/scripts/mac-studio-common.sh"

MODE="${1:-shell}"
SSH_TERM="${TERM:-}"
if [[ -z "${SSH_TERM}" || "${SSH_TERM}" == "dumb" ]]; then
  SSH_TERM="xterm-256color"
fi
REMOTE_BOOTSTRAP='if [ -f "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile" >/dev/null 2>&1 || true; fi; if [ -f "$HOME/.zprofile" ]; then . "$HOME/.zprofile" >/dev/null 2>&1 || true; fi; if [ -f "$HOME/.zshrc" ]; then . "$HOME/.zshrc" >/dev/null 2>&1 || true; fi'
REMOTE_ENV="${REMOTE_BOOTSTRAP}; export PATH=\"/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/opt/homebrew/sbin:\$HOME/.npm-global/bin:\$PATH\"; export TERM=\"${SSH_TERM}\"; export COLORTERM=\"truecolor\"; export BASH_SILENCE_DEPRECATION_WARNING=1"

if is_running_on_mac_studio; then
  cd "${ARCANA_MAC_STUDIO_REPO_PATH}"

  case "${MODE}" in
    shell-check)
      printf 'hostname=%s\npwd=%s\nterm=%s\n' \
        "$(hostname -s 2>/dev/null || hostname)" \
        "$(pwd)" \
        "${TERM:-${SSH_TERM}}"
      exit 0
      ;;
    shell)
      exec /bin/bash -ic "export PATH=\"/Applications/Codex.app/Contents/Resources:/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/opt/homebrew/sbin:\$HOME/.npm-global/bin:\$PATH\"; export TERM=\"${SSH_TERM}\"; export COLORTERM=\"truecolor\"; export BASH_SILENCE_DEPRECATION_WARNING=1; printf \"\nAnsluten till Mac Studio: %s\nMapp: %s\n\n\" \"\$(hostname -s 2>/dev/null || hostname)\" \"\$(pwd)\"; exec env PS1=\"macstudio:\\w$ \" /bin/bash -i"
      ;;
    codex)
      if command -v codex >/dev/null 2>&1; then
        exec codex
      elif [ -x /Applications/Codex.app/Contents/Resources/codex ]; then
        exec /Applications/Codex.app/Contents/Resources/codex
      elif [ -x "$HOME/Applications/Codex.app/Contents/Resources/codex" ]; then
        exec "$HOME/Applications/Codex.app/Contents/Resources/codex"
      else
        printf 'Codex ar inte installerat pa Mac Studio. Installera Codex-appen dar forst.\n' >&2
        exit 1
      fi
      ;;
    *)
      printf 'Okant lage: %s\n' "${MODE}" >&2
      printf 'Anvand: shell eller codex\n' >&2
      exit 1
      ;;
  esac
fi

HOST="$(choose_mac_studio_host || true)"

if [[ -z "${HOST}" ]]; then
  print_mac_studio_unreachable
  exit 1
fi

REMOTE_CHECK="if [ ! -d \"${ARCANA_MAC_STUDIO_REPO_PATH}/.git\" ]; then exit 10; fi"

if ! ssh -o BatchMode=yes "${HOST}" "${REMOTE_CHECK}" >/dev/null 2>&1; then
  print_mac_studio_repo_missing
  exit 1
fi

case "${MODE}" in
  shell-check)
    exec ssh -o BatchMode=yes "${HOST}" "${REMOTE_ENV}; cd \"${ARCANA_MAC_STUDIO_REPO_PATH}\" && printf 'hostname=%s\npwd=%s\nterm=%s\n' \"\$(hostname -s 2>/dev/null || hostname)\" \"\$(pwd)\" \"\${TERM}\""
    ;;
  shell)
    exec env TERM="${SSH_TERM}" ssh -t "${HOST}" "${REMOTE_ENV}; cd \"${ARCANA_MAC_STUDIO_REPO_PATH}\" && exec /bin/bash -ic 'export PATH=\"/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/opt/homebrew/sbin:\$HOME/.npm-global/bin:\$PATH\"; export TERM=\"${SSH_TERM}\"; export COLORTERM=\"truecolor\"; export BASH_SILENCE_DEPRECATION_WARNING=1; printf \"\\nAnsluten till Mac Studio: %s\\nMapp: %s\\n\\n\" \"\$(hostname -s 2>/dev/null || hostname)\" \"\$(pwd)\"; exec env PS1=\"macstudio:\\w$ \" /bin/bash -i'"
    ;;
  codex)
    exec env TERM="${SSH_TERM}" ssh -t "${HOST}" "${REMOTE_ENV}; cd \"${ARCANA_MAC_STUDIO_REPO_PATH}\" && if command -v codex >/dev/null 2>&1; then exec codex; elif [ -x /Applications/Codex.app/Contents/Resources/codex ]; then exec /Applications/Codex.app/Contents/Resources/codex; elif [ -x \"\$HOME/Applications/Codex.app/Contents/Resources/codex\" ]; then exec \"\$HOME/Applications/Codex.app/Contents/Resources/codex\"; else printf 'Codex ar inte installerat pa Mac Studio. Installera Codex-appen dar forst.\\n' >&2; exit 1; fi"
    ;;
  *)
    printf 'Okant lage: %s\n' "${MODE}" >&2
    printf 'Anvand: shell eller codex\n' >&2
    exit 1
    ;;
esac
