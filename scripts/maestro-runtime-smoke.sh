#!/usr/bin/env bash
set -euo pipefail

ENGINE="${1:-native}"

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

echo "Running Maestro runtime smoke (${ENGINE})..."
maestro test "$FLOW_FILE"
