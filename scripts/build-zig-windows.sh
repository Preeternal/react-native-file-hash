#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIG_CORE_DIR="${ROOT_DIR}/third_party/zig-files-hash"
OUT_DIR="${ROOT_DIR}/third_party/zig-files-hash-prebuilt/windows"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if ! command -v zig >/dev/null 2>&1; then
  echo "zig is not installed or not in PATH"
  exit 1
fi

if [[ ! -f "${ZIG_CORE_DIR}/build.zig" ]]; then
  echo "zig-files-hash submodule is missing: ${ZIG_CORE_DIR}"
  echo "Run: git submodule update --init --recursive"
  exit 1
fi

build_target() {
  local platform="$1"
  local target="$2"
  local prefix_dir
  prefix_dir="$(mktemp -d)"

  echo "Building zig-files-hash for Windows ${platform}..."
  (
    cd "${ZIG_CORE_DIR}"
    zig build c-api-static \
      -Dtarget="${target}" \
      -Doptimize=ReleaseFast \
      --prefix "${prefix_dir}"
  )

  mkdir -p "${OUT_DIR}/${platform}"
  cp "${prefix_dir}/lib/zig_files_hash_c_api_static.lib" "${OUT_DIR}/${platform}/zig_files_hash.lib"
  rm -rf "${prefix_dir}"
}

build_target "Win32" "x86-windows-msvc"
build_target "x64" "x86_64-windows-msvc"
build_target "ARM64" "aarch64-windows-msvc"

echo "Done. Windows Zig prebuilt libraries are in:"
echo "  ${OUT_DIR}"
