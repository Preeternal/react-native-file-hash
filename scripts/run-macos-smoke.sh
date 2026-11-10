#!/usr/bin/env bash
set -euo pipefail

app_binary="${1:?Usage: run-macos-smoke.sh APP_BINARY LOG_FILE [TIMEOUT_SECONDS]}"
smoke_log="${2:?Missing log file}"
timeout_seconds="${3:-180}"

if [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]]; then
  echo "Timeout must be a positive integer" >&2
  exit 2
fi
test -x "$app_binary"

app_pid=""
cleanup() {
  if [[ -n "$app_pid" ]]; then
    kill -KILL "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$app_binary" --file-hash-smoke > "$smoke_log" 2>&1 &
app_pid=$!
deadline=$((SECONDS + timeout_seconds))

# Wait for termination before checking the final log. A PASS marker alone must
# neither hide a subsequent crash nor disable the timeout.
while kill -0 "$app_pid" 2>/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "macOS smoke timed out after ${timeout_seconds}s" >&2
    cat "$smoke_log"
    exit 124
  fi
  sleep 1
done

app_exit=0
wait "$app_pid" || app_exit=$?
app_pid=""
cat "$smoke_log"

if (( app_exit != 0 )); then
  echo "macOS smoke exited with code $app_exit" >&2
  exit "$app_exit"
fi

if ! grep -q 'FILE_HASH_MACOS_SMOKE_PASS' "$smoke_log"; then
  echo "macOS smoke exited without PASS" >&2
  exit 1
fi
