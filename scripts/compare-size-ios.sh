#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_DIR="${ROOT_DIR}/example"
IOS_WORKSPACE="${EXAMPLE_DIR}/ios/FileHashExample.xcworkspace"
SCHEME="FileHashExample"
TMP_DIR="$(mktemp -d)"
NATIVE_DERIVED="${TMP_DIR}/native"
ZIG_DERIVED="${TMP_DIR}/zig"
KEEP_SIZE_ARTIFACTS="${KEEP_SIZE_ARTIFACTS:-0}"

cleanup() {
  if [[ "${KEEP_SIZE_ARTIFACTS}" != "1" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

stat_bytes() {
  local file="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f "%z" "${file}"
  else
    stat -c "%s" "${file}"
  fi
}

du_kb() {
  local path="$1"
  du -sk "${path}" | awk '{print $1}'
}

print_comparison() {
  local label="$1"
  local native_value="$2"
  local zig_value="$3"
  local delta_value=$((zig_value - native_value))
  local delta_percent

  delta_percent="$(awk -v n="${native_value}" -v z="${zig_value}" 'BEGIN {
    if (n == 0) {
      printf "n/a"
    } else {
      printf "%+.2f%%", ((z - n) / n) * 100
    }
  }')"

  printf '%-18s native=%12s  zig=%12s  delta=%+12s  (%s)\n' \
    "${label}" "${native_value}" "${zig_value}" "${delta_value}" "${delta_percent}"
}

bundle_ready() {
  (
    cd "${EXAMPLE_DIR}"
    bundle check >/dev/null 2>&1 || bundle install
  )
}

build_variant() {
  local engine="$1"
  local derived_dir="$2"

  if [[ "${engine}" == "zig" ]]; then
    echo "Building Zig prebuilts for iOS..."
    "${ROOT_DIR}/scripts/build-zig-ios.sh"
  fi

  echo "Installing CocoaPods (${engine})..."
  (
    cd "${EXAMPLE_DIR}"
    if [[ "${engine}" == "zig" ]]; then
      ZFH_ENGINE=zig bundle exec pod install --project-directory=ios
    else
      env -u ZFH_ENGINE bundle exec pod install --project-directory=ios
    fi
  )

  echo "Building iOS release app (${engine})..."
  xcodebuild \
    -workspace "${IOS_WORKSPACE}" \
    -scheme "${SCHEME}" \
    -configuration Release \
    -sdk iphonesimulator \
    -derivedDataPath "${derived_dir}" \
    CODE_SIGNING_ALLOWED=NO \
    build
}

echo "Comparing iOS release app sizes: native vs zig"
echo

bundle_ready
build_variant "native" "${NATIVE_DERIVED}"
build_variant "zig" "${ZIG_DERIVED}"

NATIVE_APP="${NATIVE_DERIVED}/Build/Products/Release-iphonesimulator/${SCHEME}.app"
ZIG_APP="${ZIG_DERIVED}/Build/Products/Release-iphonesimulator/${SCHEME}.app"
NATIVE_BIN="${NATIVE_APP}/${SCHEME}"
ZIG_BIN="${ZIG_APP}/${SCHEME}"

if [[ ! -d "${NATIVE_APP}" || ! -d "${ZIG_APP}" ]]; then
  echo "Expected .app outputs not found." >&2
  exit 1
fi

if [[ ! -f "${NATIVE_BIN}" || ! -f "${ZIG_BIN}" ]]; then
  echo "Expected app binaries not found." >&2
  exit 1
fi

echo
print_comparison "App dir (KiB)" "$(du_kb "${NATIVE_APP}")" "$(du_kb "${ZIG_APP}")"
print_comparison "Main binary" "$(stat_bytes "${NATIVE_BIN}")" "$(stat_bytes "${ZIG_BIN}")"

echo
echo "Zig static libs currently used for iOS:"
ls -lh \
  "${ROOT_DIR}/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64/libzig_files_hash.a" \
  "${ROOT_DIR}/third_party/zig-files-hash-prebuilt/ios/ZigFilesHash.xcframework/ios-arm64_x86_64-simulator/libzig_files_hash.a"

echo
if [[ "${KEEP_SIZE_ARTIFACTS}" == "1" ]]; then
  echo "Saved build outputs in:"
  echo "  ${NATIVE_DERIVED}"
  echo "  ${ZIG_DERIVED}"
  echo
fi

echo
echo "Restoring default CocoaPods state (native default)..."
(
  cd "${EXAMPLE_DIR}"
  env -u ZFH_ENGINE bundle exec pod install --project-directory=ios >/dev/null
)
