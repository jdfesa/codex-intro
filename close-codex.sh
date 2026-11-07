#!/usr/bin/env bash
#
# close-codex.sh - Close the Codex/ChatGPT desktop app if it is running.
#
# Usage:
#   ./close-codex.sh                 # send SIGTERM; force after 10 seconds
#   ./close-codex.sh --force         # send SIGKILL immediately
#   ./close-codex.sh --timeout 5     # wait 5 seconds before forcing shutdown
#   ./close-codex.sh --quiet         # suppress messages (errors only)
#   ./close-codex.sh --help          # show this help
#
# Optional environment variables:
#   CODEX_BIN=/path/to/binary        # main desktop executable to close
#
# Exit codes:
#   0 = closed successfully or was not running
#   1 = could not close the app
#   2 = invalid usage

set -u

TIMEOUT=10
FORCE=0
QUIET=0

usage() {
  cat <<'EOF'
close-codex.sh - Close the Codex/ChatGPT desktop app if it is running.

Usage:
  ./close-codex.sh                 # send SIGTERM; force after 10 seconds
  ./close-codex.sh --force         # send SIGKILL immediately
  ./close-codex.sh --timeout 5     # wait 5 seconds before forcing shutdown
  ./close-codex.sh --quiet         # suppress messages (errors only)
  ./close-codex.sh --help          # show this help

Optional environment variables:
  CODEX_BIN=/path/to/binary        # main desktop executable to close

Exit codes:
  0 = closed successfully or was not running
  1 = could not close the app
  2 = invalid usage
EOF
}

while (($#)); do
  case "$1" in
    -f|--force)
      FORCE=1
      shift
      ;;
    -t|--timeout)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --timeout." >&2
        exit 2
      fi
      TIMEOUT="$2"
      shift 2
      ;;
    -q|--quiet)
      QUIET=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
  echo "Error: --timeout must be a non-negative whole number of seconds." >&2
  exit 2
fi

log() {
  (( QUIET )) || echo "$@"
}

# kill -0 also succeeds for zombies that have already exited.
is_running() {
  kill -0 "$1" 2>/dev/null && readlink "/proc/$1/exe" >/dev/null 2>&1
}

# --- Locate the main desktop executable -------------------------------------
if [[ -z "${CODEX_BIN:-}" ]]; then
  if command -v chatgpt >/dev/null 2>&1; then
    launcher="$(readlink -f "$(command -v chatgpt)")"
    CODEX_BIN="$(dirname "$launcher")/ChatGPT"
  else
    CODEX_BIN="/usr/lib/chatgpt/ChatGPT"
  fi
fi

if [[ ! -x "$CODEX_BIN" ]]; then
  log "Codex app not found (executable: $CODEX_BIN). Nothing to close."
  exit 0
fi

# --- Find main processes ----------------------------------------------------
# The app may rewrite argv[0] with its full process title and arguments.
# /proc/PID/exe still identifies the actual executable in that case.
# Only close this user's processes and exclude Chromium subprocesses.
CODEX_BIN="$(readlink -f -- "$CODEX_BIN")"
current_uid="$(id -u)"
main_pids=()
self_pid=$$
for proc in /proc/[0-9]*; do
  pid="${proc##*/}"
  [[ "$pid" == "$self_pid" ]] && continue

  executable="$(readlink -- "$proc/exe" 2>/dev/null)" || continue
  [[ "${executable% (deleted)}" == "$CODEX_BIN" ]] || continue
  owner="$(stat -c '%u' -- "$proc" 2>/dev/null)" || continue
  [[ "$owner" == "$current_uid" ]] || continue

  # Also recognize --type when the process merged its cmdline into argv[0].
  cmdline="$(tr '\0' ' ' 2>/dev/null < "$proc/cmdline")" || continue
  if [[ " $cmdline" == *" --type="* ]]; then
    continue
  fi

  main_pids+=("$pid")
done

if ((${#main_pids[@]} == 0)); then
  log "Codex is not running."
  exit 0
fi

log "Codex is running (PID: ${main_pids[*]})."
(( QUIET )) || log "Executable: $CODEX_BIN"

# --- Close the app ----------------------------------------------------------
if (( FORCE )); then
  log "Sending SIGKILL (forced shutdown)..."
  kill -KILL "${main_pids[@]}" 2>/dev/null
else
  log "Sending SIGTERM (graceful shutdown)..."
  kill -TERM "${main_pids[@]}" 2>/dev/null

  # Wait up to TIMEOUT seconds for the app to exit.
  for ((i = 0; i < TIMEOUT; i++)); do
    alive=0
    for pid in "${main_pids[@]}"; do
      if is_running "$pid"; then
        alive=1
        break
      fi
    done
    (( alive == 0 )) && break
    sleep 1
  done

  # Force shutdown if the app is still running.
  remaining=()
  for pid in "${main_pids[@]}"; do
    is_running "$pid" && remaining+=("$pid")
  done

  if ((${#remaining[@]})); then
    log "Still running after ${TIMEOUT}s; sending SIGKILL to: ${remaining[*]}"
    kill -KILL "${remaining[@]}" 2>/dev/null
    sleep 1
  fi
fi

# --- Verify shutdown --------------------------------------------------------
# SIGKILL is asynchronous: allow the kernel time to terminate the process.
for ((i = 0; i < 20; i++)); do
  alive=0
  for pid in "${main_pids[@]}"; do
    is_running "$pid" && alive=1
  done
  (( alive == 0 )) && break
  sleep 0.1
done

still=()
for pid in "${main_pids[@]}"; do
  is_running "$pid" && still+=("$pid")
done

if ((${#still[@]})); then
  echo "Error: Codex is still running (PID: ${still[*]})." >&2
  exit 1
fi

log "Codex closed successfully."
exit 0
