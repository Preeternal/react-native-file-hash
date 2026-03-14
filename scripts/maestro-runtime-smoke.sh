#!/usr/bin/env bash
set -euo pipefail

ENGINE="${1:-native}"
MAX_MAESTRO_ATTEMPTS="${MAX_MAESTRO_ATTEMPTS:-3}"
ANDROID_BOOT_RETRIES="${ANDROID_BOOT_RETRIES:-60}"
ANDROID_BOOT_DELAY_SEC="${ANDROID_BOOT_DELAY_SEC:-2}"
MAESTRO_RETRY_SLEEP_SEC="${MAESTRO_RETRY_SLEEP_SEC:-3}"

case "$ENGINE" in
  native|zig) ;;
  *)
    echo "Usage: $0 [native|zig]" >&2
    exit 1
    ;;
esac

if ! command -v maestro >/dev/null 2>&1; then
  echo "ERROR: maestro CLI not found in PATH" >&2
  echo "Install: curl -Ls \"https://get.maestro.mobile.dev\" | bash" >&2
  exit 1
fi

FLOW_FILE=".maestro/runtime-${ENGINE}-smoke.yaml"
if [ ! -f "$FLOW_FILE" ]; then
  echo "ERROR: flow file not found: $FLOW_FILE" >&2
  exit 1
fi

pick_android_serial() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    echo "$ANDROID_SERIAL"
    return 0
  fi

  local discovered
  discovered="$(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1; exit}')"
  if [[ -n "$discovered" ]]; then
    echo "$discovered"
    return 0
  fi

  discovered="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
  if [[ -n "$discovered" ]]; then
    echo "$discovered"
    return 0
  fi

  # Keep CI default as fallback.
  echo "emulator-5554"
}

wait_for_android_ready() {
  local serial="$1"
  local retries="$2"
  local delay_sec="$3"

  local state boot pm_path
  for ((i=1; i<=retries; i++)); do
    state="$(adb -s "$serial" get-state 2>/dev/null || true)"
    boot="$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    pm_path="$(adb -s "$serial" shell pm path android 2>/dev/null | tr -d '\r' || true)"
    if [[ "$state" == "device" && "$boot" == "1" && "$pm_path" == package:* ]]; then
      return 0
    fi
    sleep "$delay_sec"
  done

  echo "ERROR: Android device '${serial}' did not become ready in time." >&2
  adb devices || true
  return 1
}

cleanup_adb_tunnels() {
  local serial="$1"
  adb -s "$serial" forward --remove-all || true
  adb -s "$serial" reverse --remove-all || true
}

recover_android_adb() {
  local serial="$1"
  echo "Recovering adb connection for '${serial}'..."

  # Soft reconnect first.
  adb -s "$serial" reconnect offline || true
  adb reconnect offline || true
  adb start-server || true
  cleanup_adb_tunnels "$serial"
  if wait_for_android_ready "$serial" "$ANDROID_BOOT_RETRIES" "$ANDROID_BOOT_DELAY_SEC"; then
    return 0
  fi

  # Hard reset as fallback.
  echo "Soft reconnect failed, restarting adb server..."
  adb kill-server || true
  adb start-server || true
  adb -s "$serial" wait-for-device
  cleanup_adb_tunnels "$serial"
  wait_for_android_ready "$serial" "$ANDROID_BOOT_RETRIES" "$ANDROID_BOOT_DELAY_SEC"
}

ensure_java_ipv4_stack() {
  if [[ "${JAVA_TOOL_OPTIONS:-}" == *"preferIPv4Stack"* ]]; then
    return 0
  fi

  if [[ -n "${JAVA_TOOL_OPTIONS:-}" ]]; then
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS} -Djava.net.preferIPv4Stack=true"
  else
    export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"
  fi
}

run_maestro_with_retry() {
  local serial="$1"
  local attempt=1
  local log_file status

  ensure_java_ipv4_stack

  while (( attempt <= MAX_MAESTRO_ATTEMPTS )); do
    echo "Running Maestro runtime smoke (${ENGINE}) [attempt ${attempt}/${MAX_MAESTRO_ATTEMPTS}]..."
    wait_for_android_ready "$serial" "$ANDROID_BOOT_RETRIES" "$ANDROID_BOOT_DELAY_SEC"
    cleanup_adb_tunnels "$serial"

    log_file="$(mktemp)"
    set +e
    maestro --device "$serial" test "$FLOW_FILE" 2>&1 | tee "$log_file"
    status="${PIPESTATUS[0]}"
    set -e

    if [[ "$status" -eq 0 ]]; then
      rm -f "$log_file"
      return 0
    fi

    if (( attempt < MAX_MAESTRO_ATTEMPTS )) && grep -Eiq "Android driver did not start up in time|adb: device offline|UNAVAILABLE: io exception|Connection refused: .*7001" "$log_file"; then
      echo "Detected transient Maestro/adb startup failure, retrying..."
      if ! recover_android_adb "$serial"; then
        echo "ERROR: adb recovery failed; aborting retries." >&2
        rm -f "$log_file"
        return "$status"
      fi
      rm -f "$log_file"
      sleep "$MAESTRO_RETRY_SLEEP_SEC"
      attempt=$((attempt + 1))
      continue
    fi

    rm -f "$log_file"
    return "$status"
  done
}

if command -v adb >/dev/null 2>&1; then
  SERIAL="$(pick_android_serial)"
  echo "Using Android device: ${SERIAL}"
  export ANDROID_SERIAL="$SERIAL"
  export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
  adb start-server >/dev/null 2>&1 || true
  wait_for_android_ready "$SERIAL" "$ANDROID_BOOT_RETRIES" "$ANDROID_BOOT_DELAY_SEC"
  cleanup_adb_tunnels "$SERIAL"
  run_maestro_with_retry "$SERIAL"
else
  # Fallback for environments without adb in PATH.
  echo "Running Maestro runtime smoke (${ENGINE})..."
  maestro test "$FLOW_FILE"
fi
