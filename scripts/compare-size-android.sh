#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/example/android"
TMP_DIR="$(mktemp -d)"
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

print_comparison() {
  local label="$1"
  local native_file="$2"
  local zig_file="$3"
  local native_bytes
  local zig_bytes
  local delta_bytes
  local delta_percent

  native_bytes="$(stat_bytes "${native_file}")"
  zig_bytes="$(stat_bytes "${zig_file}")"
  delta_bytes=$((zig_bytes - native_bytes))
  delta_percent="$(awk -v n="${native_bytes}" -v z="${zig_bytes}" 'BEGIN {
    if (n == 0) {
      printf "n/a"
    } else {
      printf "%+.2f%%", ((z - n) / n) * 100
    }
  }')"

  printf '%-18s native=%12s bytes  zig=%12s bytes  delta=%+12s bytes  (%s)\n' \
    "${label}" "${native_bytes}" "${zig_bytes}" "${delta_bytes}" "${delta_percent}"
}

build_variant() {
  local engine="$1"
  local apk_out="${TMP_DIR}/app-${engine}-release.apk"
  local aab_out="${TMP_DIR}/app-${engine}-release.aab"

  if [[ "${engine}" == "zig" ]]; then
    echo "Building Zig prebuilts for Android..."
    "${ROOT_DIR}/scripts/build-zig-android.sh"
  fi

  echo "Building Android release app (${engine})..."
  (
    cd "${ANDROID_DIR}"
    ./gradlew \
      clean \
      :app:assembleRelease \
      :app:bundleRelease \
      --no-daemon \
      --console=plain \
      -PreactNativeArchitectures=arm64-v8a \
      -Preact_native_file_hash_engine="${engine}"
  )

  cp "${ANDROID_DIR}/app/build/outputs/apk/release/app-release.apk" "${apk_out}"
  cp "${ANDROID_DIR}/app/build/outputs/bundle/release/app-release.aab" "${aab_out}"
}

echo "Comparing Android release package sizes: native vs zig"
echo

build_variant "native"
build_variant "zig"

echo
print_comparison "APK" "${TMP_DIR}/app-native-release.apk" "${TMP_DIR}/app-zig-release.apk"
print_comparison "AAB" "${TMP_DIR}/app-native-release.aab" "${TMP_DIR}/app-zig-release.aab"

echo
if [[ "${KEEP_SIZE_ARTIFACTS}" == "1" ]]; then
  echo "Saved comparison inputs in:"
  echo "  ${TMP_DIR}/app-native-release.apk"
  echo "  ${TMP_DIR}/app-zig-release.apk"
  echo "  ${TMP_DIR}/app-native-release.aab"
  echo "  ${TMP_DIR}/app-zig-release.aab"
  echo
fi

echo
echo "Zig static libs currently used for Android:"
ls -lh "${ROOT_DIR}/third_party/zig-files-hash-prebuilt/android"/*/libzig_files_hash.a
