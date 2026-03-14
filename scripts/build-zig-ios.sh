#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIG_CORE_DIR="${ROOT_DIR}/third_party/zig-files-hash"
OUT_DIR="${ROOT_DIR}/third_party/zig-files-hash-prebuilt/ios"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if ! command -v zig >/dev/null 2>&1; then
  echo "zig is not installed or not in PATH"
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is not installed or not in PATH"
  exit 1
fi

if ! command -v lipo >/dev/null 2>&1; then
  echo "lipo is not installed or not in PATH"
  exit 1
fi

if [[ ! -f "${ZIG_CORE_DIR}/build.zig" ]]; then
  echo "zig-files-hash submodule is missing: ${ZIG_CORE_DIR}"
  echo "Run: git submodule update --init --recursive"
  exit 1
fi

build_target() {
  local target="$1"
  local out_lib="$2"
  local prefix_dir
  prefix_dir="$(mktemp -d)"

  (
    cd "${ZIG_CORE_DIR}"
    zig build c-api-static \
      -Dtarget="${target}" \
      -Doptimize=ReleaseFast \
      --prefix "${prefix_dir}"
  )

  cp "${prefix_dir}/lib/libzig_files_hash_c_api_static.a" "${out_lib}"
  rm -rf "${prefix_dir}"
}

mkdir -p "${OUT_DIR}"
rm -rf "${OUT_DIR}/ZigFilesHash.xcframework"

echo "Building zig-files-hash for iOS device (arm64)..."
build_target "aarch64-ios" "${TMP_DIR}/ios-arm64.a"

echo "Building zig-files-hash for iOS simulator (arm64)..."
build_target "aarch64-ios-simulator" "${TMP_DIR}/ios-sim-arm64.a"

echo "Building zig-files-hash for iOS simulator (x86_64)..."
build_target "x86_64-ios-simulator" "${TMP_DIR}/ios-sim-x86_64.a"

echo "Creating universal simulator static library..."
lipo -create \
  "${TMP_DIR}/ios-sim-arm64.a" \
  "${TMP_DIR}/ios-sim-x86_64.a" \
  -output "${TMP_DIR}/ios-sim-universal.a"

mkdir -p "${TMP_DIR}/device" "${TMP_DIR}/sim"
cp "${TMP_DIR}/ios-arm64.a" "${TMP_DIR}/device/libzig_files_hash.a"
cp "${TMP_DIR}/ios-sim-universal.a" "${TMP_DIR}/sim/libzig_files_hash.a"

echo "Creating ZigFilesHash.xcframework..."
xcodebuild -create-xcframework \
  -library "${TMP_DIR}/device/libzig_files_hash.a" \
  -headers "${ZIG_CORE_DIR}/src" \
  -library "${TMP_DIR}/sim/libzig_files_hash.a" \
  -headers "${ZIG_CORE_DIR}/src" \
  -output "${OUT_DIR}/ZigFilesHash.xcframework"

echo "Done. iOS Zig prebuilt framework is in:"
echo "  ${OUT_DIR}/ZigFilesHash.xcframework"
